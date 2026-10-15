#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ReplBridge — local setup
#
# Run this once after cloning or unzipping the repo.
# Installs all dependencies and builds the MCP server.
#
# Teaching note: We build here because MCP clients run the compiled JS
# (packages/mcp-server/dist/index.js), not the TypeScript sources.
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ReplBridge — local setup"
echo "════════════════════════════════════════════════════════════"
echo ""

# ── Check Node version ────────────────────────────────────────────────────────
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>20||(a===20&&b>=12)?0:1)"; then
  echo "  ERROR: Node.js ≥20.12 required. You have $(node --version)."
  echo "  Install from https://nodejs.org"
  exit 1
fi
echo "  ✓ Node.js $(node --version)"

# ── Install all workspace dependencies ───────────────────────────────────────
echo "  Installing dependencies (this takes ~30s)..."
npm install
echo "  ✓ Dependencies installed"

# ── Build all packages ────────────────────────────────────────────────────────
echo "  Building packages..."
npm run build --silent
echo "  ✓ MCP server built → packages/mcp-server/dist/index.js"
echo "  ✓ CLI built        → packages/cli/dist/index.js"

# ── Configure MCP server .env ─────────────────────────────────────────────────
MCP_ENV="packages/mcp-server/.env"
if [ ! -f "$MCP_ENV" ]; then
  cp packages/mcp-server/.env.example "$MCP_ENV"
  echo ""
  echo "  ⚠  Created packages/mcp-server/.env from .env.example"
  echo "  Edit it with your agent URL and project token (or use the env block below)."
fi

# ── Print next steps ──────────────────────────────────────────────────────────
MCP_PATH="$(pwd)/packages/mcp-server/dist/index.js"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Setup complete. Next steps:"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  1. Copy packages/workspace-agent/ into a replbridge-agent/ folder in your"
echo "     Repl, set REPLBRIDGE_PROJECT_TOKEN + REPLBRIDGE_WORKSPACE_ROOT in Replit"
echo "     Secrets, then in the Replit Shell:"
echo "       cd replbridge-agent && npm install && npm run build && npm start"
echo ""
echo "  2a. Claude Code:"
echo ""
echo "     claude mcp add replbridge \\"
echo "       -e REPLBRIDGE_AGENT_URL=https://<your-repl-dev-url> \\"
echo "       -e REPLBRIDGE_PROJECT_TOKEN=<your-token> \\"
echo "       -- node ${MCP_PATH}"
echo ""
echo "  2b. Claude Desktop — add to claude_desktop_config.json:"
echo ""
echo '     {'
echo '       "mcpServers": {'
echo '         "replbridge": {'
echo '           "command": "node",'
echo "           \"args\": [\"${MCP_PATH}\"],"
echo '           "env": {'
echo '             "REPLBRIDGE_AGENT_URL": "https://<your-repl-dev-url>",'
echo '             "REPLBRIDGE_PROJECT_TOKEN": "<your-token>"'
echo '           }'
echo '         }'
echo '       }'
echo '     }'
echo ""
echo "  3. Verify:  REPLBRIDGE_AGENT_URL=... REPLBRIDGE_PROJECT_TOKEN=... npm run doctor"
echo ""
echo "  4. Ask Claude: 'Use ReplBridge to check the workspace status.'"
echo ""
echo "  Full guide: docs/getting-started.md"
echo ""
