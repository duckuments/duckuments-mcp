FROM node:24-alpine

# git: needed by the commit/init tools when the host repo is mounted in.
# (dubious-ownership is handled per-call in code via `-c safe.directory=*`, immune to the mounted ~/.gitconfig)
RUN apk add --no-cache git

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@11.27.0 --activate && pnpm install --prod --frozen-lockfile

COPY src ./src

# reach Obsidian's REST API running on the host (WSL/macOS/Windows). Override with -e if needed.
ENV OBSIDIAN_API_URL=http://host.docker.internal:27123

# stdio transport: Claude Code runs this container with `docker run -i` as the MCP subprocess
CMD ["node", "src/index.js"]
