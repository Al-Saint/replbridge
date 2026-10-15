# Getting started with ReplBridge

ReplBridge connects Claude to a Replit project through a secure Workspace Agent. Claude can read files, edit code, run tests, and inspect git state — all with safety rails.

## What you need

- A Replit account and a project you want to connect
- An MCP client: Claude Code, Claude Desktop, or any other
- Node.js ≥ 20.12 on your local machine

## How it works

```
Claude (Code / Desktop)
    ↓ stdio (MCP)
MCP Server          — runs locally on your machine
    ↓ HTTPS + Bearer token
Workspace Agent     — runs inside your Replit workspace
    ↓
Your project files
```

The **Workspace Agent** is a small Express server that runs inside your Replit workspace. It's the only component that touches your files, and it enforces every safety rule. The **MCP Server** is what Claude talks to; it translates tool calls into HTTP requests to the agent.

## Step 1 — Build ReplBridge locally

```bash
git clone https://github.com/al-saint/replbridge.git
cd replbridge
./setup-local.sh
```

That installs dependencies, builds every package, and prints the exact config snippet for your machine.

## Step 2 — Generate a token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

You'll paste this token in two places: Replit Secrets (step 3) and your MCP client config (step 4). It must be at least 16 characters.

## Step 3 — Run the Workspace Agent in your Repl

1. Open the Replit project you want Claude to work on.
2. Copy the contents of `packages/workspace-agent/` (everything except `node_modules/` and `dist/`) into a new folder named **`replbridge-agent/`** at the root of the project.
   - The agent blocks its own folder, so Claude can't edit the agent's allowlist.
   - Don't copy it to the project root: its `package.json` would clash with yours.
3. In **Replit → Secrets**, add:

   | Key | Value |
   |---|---|
   | `REPLBRIDGE_PROJECT_TOKEN` | the token from step 2 |
   | `REPLBRIDGE_WORKSPACE_ROOT` | `/home/runner/workspace` |
   | `PORT` *(optional)* | defaults to `3000` |

4. In the **Replit Shell**, run:

   ```bash
   cd replbridge-agent && npm install && npm run build && npm start
   ```

   You should see `[ReplBridge Workspace Agent] Listening on http://0.0.0.0:3000`.

5. Find the agent's public URL. Replit maps the port to a **dev URL** (`https://….replit.dev`). You'll find it in the Webview's address bar or in the **Networking** pane. If the port isn't exposed, add it in Networking (internal port `3000` → external port `80`).

Test it from your machine:

```bash
curl https://<your-dev-url>/health
# → {"ok":true,"data":{"service":"replbridge-workspace-agent","status":"healthy"}}
```

> **Run the agent in the workspace, not as a Deployment.** A published Replit app runs from a snapshot with its own filesystem that resets on every publish, so edits there never reach your real code. The agent has to run in the workspace itself.

## Step 4 — Connect Claude

### Claude Code

```bash
claude mcp add replbridge \
  -e REPLBRIDGE_AGENT_URL=https://<your-dev-url> \
  -e REPLBRIDGE_PROJECT_TOKEN=<your-token> \
  -- node /absolute/path/to/replbridge/packages/mcp-server/dist/index.js
```

Check it with `claude mcp list`.

### Claude Desktop

Edit your Claude Desktop config:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

Fully quit and restart Claude Desktop.

*Alternative:* instead of the `env` block, you can put the two variables in `packages/mcp-server/.env`. The server finds it no matter which directory the client launches it from.

## Step 5 — Verify

From the repo root:

```bash
REPLBRIDGE_AGENT_URL=https://<your-dev-url> REPLBRIDGE_PROJECT_TOKEN=<your-token> npm run doctor
```

`doctor` confirms the MCP server is built, the agent is reachable, and the token is accepted. Then, in Claude:

```
Use ReplBridge to check the workspace status.
Use ReplBridge to list the files in my workspace.
Use ReplBridge to run the tests.
```

## Optional settings

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `REPLBRIDGE_EXTRA_COMMANDS` | Replit Secrets | — | Comma-separated extra exact commands to allow, e.g. `npx tsc --noEmit,npm run e2e` |
| `REPLBRIDGE_COMMAND_TIMEOUT_MS` | Replit Secrets | `120000` | Kill commands after this long |
| `REPLBRIDGE_TIMEOUT_MS` | MCP client env | `30000` | Timeout for normal requests to the agent |
| `REPLBRIDGE_COMMAND_TIMEOUT_MS` | MCP client env | `150000` | How long the MCP server waits for `run_command` (keep it above the agent's) |

## Next steps

- [Security model](./security.md) — what Claude can and can't do
- [Troubleshooting](./troubleshooting.md) — if something isn't working
