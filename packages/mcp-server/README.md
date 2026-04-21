# @replbridge/mcp-server

The ReplBridge MCP server. Connects Claude Desktop (or any MCP client) to a Replit workspace through the [ReplBridge Workspace Agent](../workspace-agent/README.md).

```
Claude Desktop / Claude Code
        ↓  (stdio MCP)
@replbridge/mcp-server      ← this package
        ↓  (HTTPS)
ReplBridge Workspace Agent  (running inside Replit)
        ↓
Your Replit project
```

## Prerequisites

- Node.js 18+
- The Workspace Agent deployed and running inside a Replit project
- The agent's public URL and project token

## Setup

### 1. Install dependencies

```bash
cd packages/mcp-server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
REPLBRIDGE_AGENT_URL=https://your-agent-url.replit.app
REPLBRIDGE_PROJECT_TOKEN=your-token-here
```

### 3. Build

```bash
npm run build
```

### 4. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your OS:

```json
{
  "mcpServers": {
    "replbridge": {
      "command": "node",
      "args": ["/absolute/path/to/replbridge/packages/mcp-server/dist/index.js"],
      "env": {
        "REPLBRIDGE_AGENT_URL": "https://your-agent-url.replit.app",
        "REPLBRIDGE_PROJECT_TOKEN": "your-token-here"
      }
    }
  }
}
```

Restart Claude Desktop.

### 5. Test it

In Claude Desktop, try:

```
Use ReplBridge to check the workspace status.
Use ReplBridge to list the files in the workspace.
Use ReplBridge to read package.json.
```

## Available tools

| Tool | What it does |
|---|---|
| `workspace_status` | Reports cwd, Node version, detected stack, git branch |
| `list_files` | Lists files (sensitive paths hidden) |
| `read_file` | Reads a file safely |
| `write_file` | Writes a file, creates a snapshot of the previous version |
| `soft_delete_file` | Moves a file to .replbridge/trash (not permanently deleted) |
| `list_allowed_commands` | Shows which commands are permitted |
| `run_command` | Runs an allowlisted command |
| `git_status` | Shows git status |
| `git_diff` | Shows unstaged changes |

## Development

```bash
npm run dev       # run with tsx (no build step)
npm run typecheck # check types
npm run build     # compile to dist/
```

## Security

- The project token is never logged or returned in responses
- All inputs are validated with Zod before being sent to the agent
- The agent enforces its own path jail and command allowlist — this server is a trusted translator, not a gatekeeper
- See [security docs](../../docs/security.md) for the full security model
