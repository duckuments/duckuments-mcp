import { inspect } from "node:util";

// Stdio MCP: stdout IS the JSON-RPC transport, so every log line must go to stderr, never stdout.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.DUCKUMENTS_LOG ?? "info"] ?? LEVELS.info;

const fmt = (a) => (typeof a === "string" ? a : inspect(a, { depth: 4, colors: false }));

const at = (level) => (...args) => {
  if (LEVELS[level] > threshold) return;
  process.stderr.write(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [duckuments] ${args.map(fmt).join(" ")}\n`);
};

// levels: error < warn < info < debug. Set DUCKUMENTS_LOG=debug for verbose output.
export const log = { error: at("error"), warn: at("warn"), info: at("info"), debug: at("debug") };
