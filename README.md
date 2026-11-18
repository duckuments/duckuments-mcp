# duckuments-mcp

A personal [Model Context Protocol](https://modelcontextprotocol.io) server that lets code agents (Claude Code, etc.) read and write your [Obsidian](https://obsidian.md) vault, plus a few personal workflow tools.

It talks to the [Local REST API with MCP](https://github.com/coddingtonbear/obsidian-local-rest-api) Obsidian plugin over HTTP, and speaks MCP to the agent over stdio.

```
Claude Code ──stdio──> duckuments-mcp ──HTTP+Bearer──> Obsidian Local REST API ──> vault files
```

## Tools

| tool                                             | what it does                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `get_note(path)`                                 | read a note by vault-relative path                                         |
| `get_active()`                                   | read the note currently open in Obsidian                                   |
| `list_notes(folder?)`                            | list vault files, or a folder's contents                                   |
| `update_note(path, content)`                     | create/overwrite a note (PUT)                                              |
| `patch_note(path, heading, content, operation?)` | insert under a heading; nest with `::` (e.g. `Design::Flow`)               |
| `search(query)`                                  | plain-text vault search                                                    |
| `commit(message, cwd?)`                          | commit already-staged files with your git identity (no push, no co-author) |
| `init(cwd?)`                                     | write your Obsidian roles note into the project's `CLAUDE.md`              |

## Prompts (slash commands)

Prompts act on the **active note** in Obsidian (open the note, then run the command):

- `/duckuments:fill_out` — read the note and fill it out (note only, no code)
- `/duckuments:work_on` — implement the note's points into the project
- `/duckuments:plan_for` — plan into the note (note only, no code)
- `/duckuments:debug` — find and fix the described issue, then report
- `/duckuments:summarize` — write a client-ready summary into the note's `## Summerize section`
- `/duckuments:commit` — write a conventional message and call the `commit` tool
- `/duckuments:init` — call the `init` tool

## Setup

1. Install the **Local REST API** plugin in Obsidian, enable it, and copy its API key.
2. Install: `npm install -g duckuments-mcp`

## Run

```bash
claude mcp add duckuments -e OBSIDIAN_API_KEY=<key> -- duckuments-mcp
```

Note: Obsidian must be open with the plugin running.

## Config

| env                | default                  | purpose                                                |
| ------------------ | ------------------------ | ------------------------------------------------------ |
| `OBSIDIAN_API_URL` | `http://127.0.0.1:27123` | plugin base URL                                        |
| `OBSIDIAN_API_KEY` | —                        | plugin Bearer key (required)                           |
| `DUCKUMENTS_LOG`   | `info`                   | log level: `error`/`warn`/`info`/`debug` (stderr only) |

## License

MIT
