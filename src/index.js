import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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

await server.connect(new StdioServerTransport());
