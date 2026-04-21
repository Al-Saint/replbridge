# ReplBridge

**Claude for Replit, with seatbelts.**

ReplBridge is an installable MCP bridge that lets Claude safely inspect, edit, test, and improve any Replit project — with path jails, command allowlists, automatic snapshots, and soft-delete.

```
Claude Desktop / Claude Code
        ↓  (stdio MCP)
ReplBridge MCP Server
        ↓  (HTTPS + token auth)
ReplBridge Workspace Agent   ← runs inside your Replit project
        ↓
Your code
```

## Why ReplBridge?

Claude is powerful. But giving Claude unrestricted shell access to a codebase is risky. ReplBridge adds a controlled layer:

| Without ReplBridge | With ReplBridge |
|---|---|
| Claude has full shell access | Claude uses an explicit allowlist of actions |
| No protection against path traversal | All file ops are jailed to workspace root |
| `.env` and secrets are readable | Secrets are blocked by name pattern |
| Files can be permanently deleted | Soft-delete only — files go to trash |
| No rollback if Claude breaks something | Every file write creates a snapshot first |

## Quick start

### 1. Deploy the Workspace Agent to Replit

Create a Replit project, copy `packages/workspace-agent/` into it, set two secrets, and run `npm install && npm run dev`.

Full instructions: [docs/getting-started.md](./docs/getting-started.md)

### 2. Build the MCP Server locally

```bash
cd packages/mcp-server
npm install && npm run build
```

### 3. Connect Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "replbridge": {
      "command": "node",
      "args": ["/path/to/replbridge/packages/mcp-server/dist/index.js"],
      "env": {
        "REPLBRIDGE_AGENT_URL": "https://your-agent.replit.app",
        "REPLBRIDGE_PROJECT_TOKEN": "your-token-here"
      }
    }
  }
}
```

Restart Claude Desktop, then ask:

```
Use ReplBridge to check the workspace status.
```

## What Claude can do

| Tool | Description |
|---|---|
| `workspace_status` | Stack, Node version, git branch |
| `list_files` | Recursive file listing (secrets hidden) |
| `read_file` | Read any non-secret file ≤500KB |
| `write_file` | Write a file (previous version snapshotted automatically) |
| `soft_delete_file` | Move file to trash (recoverable) |
| `list_allowed_commands` | Show what commands are permitted |
| `run_command` | Run an allowlisted command (npm, pytest, git status…) |
| `git_status` | git status output |
| `git_diff` | Unstaged changes |

## Packages

| Package | Description |
|---|---|
| `packages/workspace-agent` | Express API that runs inside Replit |
| `packages/mcp-server` | MCP server that translates Claude tool calls to HTTP |
| `packages/cli` | `npx @replbridge/init` installer |
| `packages/shared` | Shared TypeScript types |

## Security

See [docs/security.md](./docs/security.md) for the full security model.

Short version: blocked paths, command allowlist, path jail, token auth with constant-time comparison, no permanent delete, automatic snapshots before every write.

## Project status

- [x] Workspace Agent — built and tested
- [x] MCP Server — built
- [x] CLI Installer — built
- [ ] Published to npm
- [ ] Hosted cloud platform
- [ ] Token rotation
- [ ] Audit logs

## Contributing

This is MIT licensed. PRs welcome — especially for new stack support, additional safe commands, and testing across different Replit project types.

## License

MIT — see [LICENSE](./LICENSE)

---

Built by Alex Santos
