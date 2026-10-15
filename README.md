# ReplBridge

**Claude for Replit, with seatbelts.**

[![CI](https://github.com/al-saint/replbridge/actions/workflows/ci.yml/badge.svg)](https://github.com/al-saint/replbridge/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A520.12-339933)
![MCP](https://img.shields.io/badge/MCP-stdio-6E56CF)
![License](https://img.shields.io/badge/license-MIT-blue)

ReplBridge is a [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude safely inspect, edit, test, and improve a Replit project — with a path jail, a command allowlist, automatic snapshots, and soft-delete.

```
Claude Desktop / Claude Code / any MCP client
        │  stdio (MCP)
        ▼
ReplBridge MCP Server        ← runs on your machine
        │  HTTPS + Bearer token
        ▼
ReplBridge Workspace Agent   ← runs inside your Replit workspace
        │
        ▼
Your code
```

## Why ReplBridge?

Claude is powerful, but handing it unrestricted shell access to a codebase is risky. ReplBridge puts a small, auditable layer in between:

| Without ReplBridge | With ReplBridge |
|---|---|
| Claude has full shell access | Claude can only run an explicit allowlist of commands |
| Any file is fair game, including `.env` | Secrets, `.git`, `node_modules` and Replit config are blocked |
| `../../` or a symlink can reach outside the project | Every path is resolved (symlinks included) and jailed to the workspace |
| An overwrite loses the old version | Every overwrite is snapshotted first |
| Deletes are permanent | Deletes move files to a trash folder |

## Tools

| Tool | What it does |
|---|---|
| `workspace_status` | Workspace root, Node version, detected stack, git branch |
| `list_files` | Recursive listing; sensitive paths and build output hidden |
| `read_file` | Read a text file (≤500 KB, secrets and binaries rejected) |
| `write_file` | Create/overwrite a file — previous version snapshotted first |
| `soft_delete_file` | Move a file to `.replbridge/trash` |
| `list_allowed_commands` | Show the exact commands Claude may run |
| `run_command` | Run an allowlisted command (no shell, with a timeout) |
| `git_status` | `git status` |
| `git_diff` | `git diff` (or `--staged`) |

## Quick start

You need Node.js ≥ 20.12 locally and a Replit project you want Claude to work on.

**1. Build ReplBridge locally**

```bash
git clone https://github.com/al-saint/replbridge.git
cd replbridge
./setup-local.sh          # or: npm install && npm run build
```

**2. Run the Workspace Agent inside your Repl** — copy `packages/workspace-agent/` into a `replbridge-agent/` folder in the Repl, add `REPLBRIDGE_PROJECT_TOKEN` and `REPLBRIDGE_WORKSPACE_ROOT=/home/runner/workspace` to Replit Secrets, then in the Replit Shell:

```bash
cd replbridge-agent && npm install && npm run build && npm start
```

**3. Connect Claude**

Claude Code:

```bash
claude mcp add replbridge \
  -e REPLBRIDGE_AGENT_URL=https://<your-repl-dev-url> \
  -e REPLBRIDGE_PROJECT_TOKEN=<your-token> \
  -- node /absolute/path/to/replbridge/packages/mcp-server/dist/index.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "replbridge": {
      "command": "node",
      "args": ["/absolute/path/to/replbridge/packages/mcp-server/dist/index.js"],
      "env": {
        "REPLBRIDGE_AGENT_URL": "https://<your-repl-dev-url>",
        "REPLBRIDGE_PROJECT_TOKEN": "<your-token>"
      }
    }
  }
}
```

**4. Verify** — `npm run doctor` checks your build, reaches the agent, and confirms the token. Then ask Claude: *"Use ReplBridge to check the workspace status."*

The full walkthrough, including where to find your Repl's URL, is in **[docs/getting-started.md](docs/getting-started.md)**.

> **Important:** run the agent in the Replit *workspace*, not as a Replit Deployment. A published app runs from a snapshot with its own filesystem, so Claude's edits would land in a throwaway copy instead of your code. See [troubleshooting](docs/troubleshooting.md#use-the-workspace-not-a-deployment).

## Repository layout

| Path | What it is |
|---|---|
| `packages/mcp-server` | The MCP server (stdio) that Claude talks to |
| `packages/workspace-agent` | The Express agent that runs inside Replit and enforces all safety rules |
| `packages/cli` | `replbridge init / doctor / uninstall` helper |
| `packages/shared` | Placeholder for types shared between packages |
| `test/` | End-to-end tests: real agent + real MCP server + official MCP client |
| `docs/` | Getting started, security model, troubleshooting |

## Development

```bash
npm install
npm run build      # compile all packages
npm run typecheck
npm test           # builds, then runs the end-to-end suite
npm run dev:agent  # agent with tsx (needs packages/workspace-agent/.env)
npm run dev:mcp    # MCP server with tsx
```

You can also poke at the server interactively with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js
```

## Documentation

- [Getting started](docs/getting-started.md)
- [Security model](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Changelog](CHANGELOG.md)
- [Contributing](.github/CONTRIBUTING.md)

## Licensing

Versions v0.1.x are released under the MIT License and will remain MIT permanently. Future versions may adopt a source-available license (FSL or similar) to protect against competing SaaS offerings while keeping the core free for individual and commercial use. See the [CHANGELOG](CHANGELOG.md) for version history.
