# duckuments-mcp

A personal [Model Context Protocol](https://modelcontextprotocol.io) server that lets code agents (Claude Code, etc.) read and write your [Obsidian](https://obsidian.md) vault, plus a few personal workflow tools.

It talks to the [Local REST API with MCP](https://github.com/coddingtonbear/obsidian-local-rest-api) Obsidian plugin over HTTP, and speaks MCP to the agent over stdio.

```
Claude Code ──stdio──> duckuments-mcp ──HTTP+Bearer──> Obsidian Local REST API ──> vault files
```

## Tools

| tool | what it does |
|------|--------------|
| `get_note(path)` | read a note by vault-relative path |
| `get_active()` | read the note currently open in Obsidian |
| `list_notes(folder?)` | list vault files, or a folder's contents |
| `update_note(path, content)` | create/overwrite a note (PUT) |
| `patch_note(path, heading, content, operation?)` | insert under a heading; nest with `::` (e.g. `Design::Flow`) |
| `search(query)` | plain-text vault search |
| `commit(message, cwd?)` | commit already-staged files with your git identity (no push, no co-author) |
| `init(cwd?)` | write your Obsidian roles note into the project's `CLAUDE.md` |

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
2. Configure env:
   ```bash
   cp .env.example .env
   # paste your key into OBSIDIAN_API_KEY (leave values unquoted)
   ```
3. Install deps: `pnpm install`

## Run

**Node (recommended for local/global use):**
```bash
claude mcp add duckuments -e OBSIDIAN_API_KEY=<key> -- \
  node /absolute/path/to/duckuments-mcp/src/index.js
```

**Docker:**
```bash
pnpm docker:build
claude mcp add --scope user duckuments -- \
  docker run -i --rm \
  --add-host host.docker.internal:host-gateway \
  --env-file /absolute/path/to/.env \
  -e OBSIDIAN_API_URL=http://host.docker.internal:27123 \
  -v $HOME/projects:$HOME/projects \
  -v $HOME/.gitconfig:/root/.gitconfig:ro \
  duckuments-mcp
```

Notes:
- Obsidian must be open with the plugin running.
- In Docker, override `OBSIDIAN_API_URL` to `host.docker.internal` (the container can't reach the host's `127.0.0.1`), and keep `.env` **unquoted** (Docker's `--env-file` doesn't strip quotes).
- `commit`/`init` touch the local filesystem, so in Docker the project must be bind-mounted at its real absolute path.

## Config

| env | default | purpose |
|-----|---------|---------|
| `OBSIDIAN_API_URL` | `http://127.0.0.1:27123` | plugin base URL |
| `OBSIDIAN_API_KEY` | — | plugin Bearer key (required) |
| `DUCKUMENTS_LOG` | `info` | log level: `error`/`warn`/`info`/`debug` (stderr only) |

## License

MIT
