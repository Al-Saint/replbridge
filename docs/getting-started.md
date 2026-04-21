# Getting started with ReplBridge

ReplBridge connects Claude to any Replit project through a secure workspace agent. Claude can read files, edit code, run tests, and inspect git state — all with safety rails.

## What you need

- A Replit account with a project you want to connect
- Claude Desktop (or another MCP client)
- Node.js ≥18 on your local machine

## How it works

```
Claude Desktop
    ↓ (stdio MCP)
MCP Server          — runs locally on your machine
    ↓ (HTTPS)
Workspace Agent     — runs inside your Replit project
    ↓
Your project files
```

The Workspace Agent is a small Express server that lives inside your Replit project. It's the only thing that can touch your files. The MCP Server is what Claude actually talks to — it translates Claude's tool calls into HTTP requests to the agent.

## Step 1 — Deploy the Workspace Agent to Replit

1. Create a new Replit project (Node.js template, named `replbridge-workspace-agent`)
2. Copy the contents of `packages/workspace-agent/` into the project
3. In Replit → Secrets, add:
   - `REPLBRIDGE_PROJECT_TOKEN` — generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `REPLBRIDGE_WORKSPACE_ROOT` — set to `/home/runner/workspace`
4. Run `npm install && npm run dev`
5. Note your agent URL: `https://<project>.<username>.replit.app`

Test it:
```bash
curl https://your-agent.replit.app/health
# → { "ok": true, "data": { "service": "replbridge-workspace-agent", "status": "healthy" } }
```

## Step 2 — Build the MCP Server locally

```bash
cd packages/mcp-server
npm install
npm run build
```

Create `packages/mcp-server/.env`:
```env
REPLBRIDGE_AGENT_URL=https://your-agent.replit.app
REPLBRIDGE_PROJECT_TOKEN=your-token-here
```

## Step 3 — Connect Claude Desktop

Edit your Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add this inside `"mcpServers"`:

```json
{
  "mcpServers": {
    "replbridge": {
      "command": "node",
      "args": ["/absolute/path/to/replbridge/packages/mcp-server/dist/index.js"],
      "env": {
        "REPLBRIDGE_AGENT_URL": "https://your-agent.replit.app",
        "REPLBRIDGE_PROJECT_TOKEN": "your-token-here"
      }
    }
  }
}
```

Restart Claude Desktop.

## Step 4 — Test the connection

In Claude Desktop, type:

```
Use ReplBridge to check the workspace status.
```

If you see a JSON response with your stack and Node version, **it works**. You now have a live connection from Claude to your Replit project.

Then try:
```
Use ReplBridge to list the files in my workspace.
Use ReplBridge to read package.json.
```

## Next steps

- [Security model](./security.md) — understand what Claude can and can't do
- [Troubleshooting](./troubleshooting.md) — if something isn't working
- [Connect a different project](./install-in-replit.md) — for a second Replit workspace
