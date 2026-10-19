# @replbridge/mcp-server

The ReplBridge MCP server. It connects Claude Code, Claude Desktop, or any MCP client to a Replit workspace through the [ReplBridge Workspace Agent](../workspace-agent/README.md).

```
Claude Code / Claude Desktop
        ↓  stdio (MCP)
@replbridge/mcp-server      ← this package
        ↓  HTTPS + Bearer token
ReplBridge Workspace Agent  (running inside your Replit workspace)
        ↓
Your Replit project
```

Built on the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) (`McpServer` + Zod schemas). Every tool carries MCP annotations (`readOnlyHint`, etc.), and failures are returned with `isError: true` so the model knows a call didn't work.

## Prerequisites

- Node.js ≥ 20.12
- The Workspace Agent running in a Replit workspace, plus its URL and project token

## Build

From the repo root:

```bash
npm install
npm run build
```

## Configure

| Variable                        | Required | Default  | Description                              |
| ------------------------------- | -------- | -------- | ---------------------------------------- |
| `REPLBRIDGE_AGENT_URL`          | ✓        | —        | Public URL of the Workspace Agent        |
| `REPLBRIDGE_PROJECT_TOKEN`      | ✓        | —        | Must match the agent's token (≥16 chars) |
| `REPLBRIDGE_TIMEOUT_MS`         |          | `30000`  | Per-request timeout                      |
| `REPLBRIDGE_COMMAND_TIMEOUT_MS` |          | `150000` | Timeout for `run_command`                |

Set them in your MCP client's `env` block (recommended), or in `packages/mcp-server/.env` (see `.env.example`). The `.env` next to the package is found no matter what working directory the client uses.

## Connect

**Claude Code**

```bash
claude mcp add replbridge \
  -e REPLBRIDGE_AGENT_URL=https://<your-dev-url> \
  -e REPLBRIDGE_PROJECT_TOKEN=<your-token> \
  -- node /absolute/path/to/replbridge/packages/mcp-server/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "replbridge": {
      "command": "node",
      "args": ["/absolute/path/to/replbridge/packages/mcp-server/dist/index.js"],
      "env": {
        "REPLBRIDGE_AGENT_URL": "https://<your-dev-url>",
        "REPLBRIDGE_PROJECT_TOKEN": "<your-token>"
      }
    }
  }
}
```

## Available tools

| Tool                    | Read-only | What it does                                                                                   |
| ----------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `workspace_status`      | ✓         | Workspace root, Node version, detected stack, git branch                                       |
| `list_files`            | ✓         | Lists files (sensitive paths hidden); `path`, `depth` 1–5                                      |
| `search_files`          | ✓         | grep-style search; `query`, `path`, `regex`, `case_sensitive`, `max_results`                   |
| `read_file`             | ✓         | Returns the raw file contents                                                                  |
| `edit_file`             |           | Exact `old_text` → `new_text` replacement (unique match unless `replace_all`); snapshots first |
| `write_file`            |           | Writes the full file; snapshots the previous version                                           |
| `soft_delete_file`      |           | Moves a file to `.replbridge/trash`                                                            |
| `list_snapshots`        | ✓         | Previous versions, newest first; optional `path` filter                                        |
| `restore_snapshot`      |           | Restores `path` from a `snapshot` id (current version saved first)                             |
| `list_allowed_commands` | ✓         | The exact permitted commands and the timeout                                                   |
| `run_command`           |           | Runs an allowlisted command; non-zero exit → `isError`                                         |
| `git_status`            | ✓         | `git status`                                                                                   |
| `git_diff`              | ✓         | `git diff`, or `staged: true` for `--staged`                                                   |

## Error codes

Besides the agent's own codes (`BLOCKED_PATH`, `PATH_TRAVERSAL`, `COMMAND_NOT_ALLOWED`, `TEXT_NOT_FOUND`, `AMBIGUOUS_MATCH`, `SNAPSHOT_NOT_FOUND`, `UNAUTHORIZED`, …), the server reports connection problems as:

| Code                 | Meaning                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `AGENT_UNREACHABLE`  | Couldn't connect (wrong URL, agent not running)                                                   |
| `AGENT_TIMEOUT`      | Connected but no response in time                                                                 |
| `AGENT_BAD_RESPONSE` | Got a non-ReplBridge response, typically Replit's HTML page for a sleeping Repl or the wrong port |

## Development

```bash
npm run dev        # run with tsx (no build step)
npm run typecheck
npm run build
npx @modelcontextprotocol/inspector node dist/index.js   # interactive testing
```

End-to-end tests live in the repo-level `test/` folder (`npm test` from the root).

## Security

- The project token is never logged or returned in responses.
- All inputs are validated with Zod before being sent to the agent.
- The agent enforces its own path jail and command allowlist. This server is a trusted translator, not a gatekeeper.
- Nothing except MCP protocol messages is written to stdout.
- See the [security docs](../../docs/security.md) for the full model.
