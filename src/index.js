import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const run = promisify(execFile);
const git = async (cwd, args) => (await run("git", args, { cwd })).stdout.trim();

// http port avoids the plugin's self-signed cert; use 27124 (https) only if you disable http.
const BASE = process.env.OBSIDIAN_API_URL ?? "http://127.0.0.1:27123";
const KEY = process.env.OBSIDIAN_API_KEY;

// the wrapper every tool reuses
async function api(path, { method = "GET", body, contentType = "text/markdown", headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": contentType, ...headers },
    body,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.headers.get("content-type")?.includes("json") ? res.json() : res.text();
}

// encode each segment so folder slashes survive
const vaultPath = (p) => "/vault/" + p.split("/").map(encodeURIComponent).join("/");
// MCP tool result from any value
const out = (v) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });

const server = new McpServer({ name: "duckuments-mcp", version: "1.0.0" });

server.registerTool(
  "get_note",
  {
    title: "Get note",
    description: "Read a note from the vault by its vault-relative path (e.g. 'Dev days/foo.md').",
    inputSchema: { path: z.string().describe("vault-relative path to the note") },
  },
  async ({ path }) => out(await api(vaultPath(path))),
);

server.registerTool(
  "get_active",
  {
    title: "Get active note",
    description: "Read the note currently open in Obsidian.",
    inputSchema: {},
  },
  async () => out(await api("/active/")),
);

server.registerTool(
  "list_notes",
  {
    title: "List notes",
    description: "List files/folders in the vault, or inside a given folder (e.g. 'Dev days/').",
    inputSchema: { folder: z.string().optional().describe("vault-relative folder path, empty for root") },
  },
  async ({ folder }) => out(await api(folder ? vaultPath(folder.replace(/\/?$/, "/")) : "/vault/")),
);

server.registerTool(
  "update_note",
  {
    title: "Update note",
    description: "Create or overwrite a note at the given path with the given markdown (PUT).",
    inputSchema: {
      path: z.string().describe("vault-relative path to the note"),
      content: z.string().describe("full markdown content to write"),
    },
  },
  async ({ path, content }) => {
    await api(vaultPath(path), { method: "PUT", body: content });
    return out(`wrote ${path}`);
  },
);

server.registerTool(
  "patch_note",
  {
    title: "Patch note under heading",
    description: "Insert content relative to an existing heading in a note (PATCH).",
    inputSchema: {
      path: z.string().describe("vault-relative path to the note"),
      heading: z.string().describe("target heading; nest with '::', e.g. 'Milestones' or 'Design::Flow'"),
      content: z.string().describe("markdown to insert"),
      operation: z.enum(["append", "prepend", "replace"]).default("append"),
    },
  },
  async ({ path, heading, content, operation }) => {
    const trail = heading.split("::").map((h) => h.trim()); // v2 wants the full heading trail from root
    await api(vaultPath(path), {
      method: "PATCH",
      body: content,
      headers: {
        "Markdown-Patch-Version": "2",
        Operation: operation,
        "Target-Type": "heading",
        Target: encodeURIComponent(JSON.stringify(trail)),
      },
    });
    return out(`patched ${path} under "${heading}" (${operation})`);
  },
);

server.registerTool(
  "search",
  {
    title: "Search vault",
    description: "Plain-text search across the vault.",
    inputSchema: { query: z.string().describe("text to search for") },
  },
  async ({ query }) => out(await api(`/search/simple/?query=${encodeURIComponent(query)}`, { method: "POST" })),
);

// personal layer: reusable prompts, each takes a note path (from the note's Phase 2)
const PROMPTS = {
  fill_out: {
    title: "Fill out a note",
    what: "Read the note and fill it out: answer its questions, write the text/suggestions it asks for, and find and fix any conflicts inside it. Only read and edit the note — do NOT change any project code. Typically used to explore a project's source or answer questions about it.",
  },
  work_on: {
    title: "Work on a note",
    what: "Read the note and implement the points it describes into the project code. Typically used for plans that are ready to be built.",
  },
  plan_for: {
    title: "Plan for a note",
    what: "Review the note and the project, then plan how to implement the note's tasks within the project. Only plan and edit the note's content — do NOT change any project code. Typically used for planning notes.",
  },
  debug: {
    title: "Debug from a note",
    what: "Read the note, identify and fix the issue based on the problem and information described in it, then state what the problem was and how you resolved it. Typically used for debugging.",
  },
};

// no args: Claude Code splits slash-command args on whitespace, so a path with spaces breaks.
// Use the note currently open in Obsidian instead (GET /active/) — the plan's chosen default.
for (const [name, { title, what }] of Object.entries(PROMPTS)) {
  server.registerPrompt(name, { title, description: what }, async () => {
    const note = await api("/active/"); // bind the open note in at resolve time
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${what}\n\nThe note currently open in Obsidian:\n\n---\n${note}\n---\n\nAlso follow any extra instructions the user gives next. Write changes back with the update_note / patch_note tools.`,
          },
        },
      ],
    };
  });
}

// --- Phase 3: personal tools ---

// commit tool: commit ONLY already-staged files with your own git identity (no co-author), never pushes.
server.registerTool(
  "commit",
  {
    title: "Commit staged changes",
    description: "Commit the already-staged files in the project repo with your own git identity. Does NOT stage and does NOT push.",
    inputSchema: {
      message: z.string().describe("commit message; conventional format `type(scope): <emoji> message`, kept short"),
      cwd: z.string().optional().describe("repo path; defaults to the server's working directory"),
    },
  },
  async ({ message, cwd = process.cwd() }) => {
    if (!(await git(cwd, ["diff", "--cached", "--name-only"]))) return out("nothing staged to commit"); // only staged files
    await git(cwd, ["commit", "-m", message]); // uses the repo's own user.name/email; no trailer
    return out(await git(cwd, ["log", "-1", "--oneline"]));
  },
);

// init tool: pull your roles note into a managed block in the project's CLAUDE.md.
const ROLES_NOTE = "Templates/Claude/Implementing Role.md";
const ROLES_START = "<!-- duckuments:roles start -->";
const ROLES_END = "<!-- duckuments:roles end -->";
server.registerTool(
  "init",
  {
    title: "Init CLAUDE.md roles",
    description: `Read your roles note (${ROLES_NOTE}) and write it into the project's CLAUDE.md, inside a managed block.`,
    inputSchema: { cwd: z.string().optional().describe("project path; defaults to the server's working directory") },
  },
  async ({ cwd = process.cwd() }) => {
    const roles = await api(vaultPath(ROLES_NOTE));
    const block = `${ROLES_START}\n${String(roles).trim()}\n${ROLES_END}`;
    const file = path.join(cwd, "CLAUDE.md");
    let current = "";
    try {
      current = await readFile(file, "utf8");
    } catch { } // no CLAUDE.md yet -> create it
    const re = new RegExp(`${ROLES_START}[\\s\\S]*?${ROLES_END}`);
    const next = re.test(current)
      ? current.replace(re, block) // refresh only the managed block
      : current
        ? `${current.trimEnd()}\n\n${block}\n`
        : `${block}\n`;
    await writeFile(file, next);
    return out(`wrote roles into ${file}`);
  },
);

// summarize prompt: client-ready summary of changes into the active note's Summerize section.
// A prompt (not a tool) because composing the summary needs the model; targets the active note.
const SUMMARY_TEMPLATE = "Templates/Claude/ClientSummerized.md";
server.registerPrompt(
  "summarize",
  {
    title: "Summarize changes for client",
    description: "Write a non-technical, client-ready summary of the changes into the active note's Summerize section.",
  },
  async () => {
    const [tpl, note] = await Promise.all([api(vaultPath(SUMMARY_TEMPLATE)), api("/active/")]);
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Write a NON-technical, client-ready summary of the changes you made this session (use your session context and \`git diff\`/\`git log\` for what changed). Follow the structure of this template:\n\n--- TEMPLATE ---\n${tpl}\n--- END TEMPLATE ---\n\nThen append the summary to the note below under a "## Summerize section" heading (create the heading if it's missing) using the patch_note tool.\n\n--- ACTIVE NOTE ---\n${note}\n--- END ACTIVE NOTE ---`,
          },
        },
      ],
    };
  },
);

// commit prompt: gives the `/duckuments:commit` trigger; tells the model to write the message + call the commit tool.
server.registerPrompt(
  "commit",
  { title: "Commit changes", description: "Commit your current changes with your own git identity, without pushing." },
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            "Write a commit message from the currently STAGED changes (`git diff --cached`), then call the commit tool. " +
            "Do not stage anything and do not push. " +
            "Message format (conventional, short — no long body):\n" +
            "`type(scope): <emoji> message`\n" +
            "where type is one of feat | fix | test | chore | docs | refactor | style.",
        },
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
