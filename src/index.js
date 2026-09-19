import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// http port avoids the plugin's self-signed cert; use 27124 (https) only if you disable http.
const BASE = process.env.OBSIDIAN_API_URL ?? "http://127.0.0.1:27123";
const KEY = process.env.OBSIDIAN_API_KEY;

// the wrapper every tool reuses
async function api(path, { method = "GET", body, contentType = "text/markdown" } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": contentType },
    body,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.headers.get("content-type")?.includes("json") ? res.json() : res.text();
}

// encode each segment so folder slashes survive
const vaultPath = (p) => "/vault/" + p.split("/").map(encodeURIComponent).join("/");

const server = new McpServer({ name: "duckuments-mcp", version: "1.0.0" });

server.registerTool(
  "get_note",
  {
    title: "Get note",
    description: "Read a note from the Obsidian vault by its vault-relative path (e.g. 'Dev days/foo.md').",
    inputSchema: { path: z.string().describe("vault-relative path to the note") },
  },
  async ({ path }) => {
    const md = await api(vaultPath(path));
    return { content: [{ type: "text", text: typeof md === "string" ? md : JSON.stringify(md) }] };
  },
);

await server.connect(new StdioServerTransport());
