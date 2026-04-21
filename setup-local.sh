#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ReplBridge — local setup
#
# Run this once after cloning or unzipping the repo.
# Installs all dependencies and builds the MCP server.
#
# Teaching note: We build the MCP server here because Claude Desktop needs
# the compiled JS (dist/index.js). The workspace agent runs via tsx in Replit
# so it doesn't need a build step locally.
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ReplBridge — local setup"
echo "════════════════════════════════════════════════════════════"
echo ""

# ── Check Node version ────────────────────────────────────────────────────────
NODE_MAJOR=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "  ERROR: Node.js ≥18 required. You have $(node --version)."
  echo "  Install from https://nodejs.org"
  exit 1
fi
echo "  ✓ Node.js $(node --version)"

# ── Install all workspace dependencies ───────────────────────────────────────
echo "  Installing dependencies (this takes ~30s)..."
npm install
echo "  ✓ Dependencies installed"

# ── Build MCP server ──────────────────────────────────────────────────────────
echo "  Building MCP server..."
cd packages/mcp-server
npm run build
cd ../..
echo "  ✓ MCP server built → packages/mcp-server/dist/index.js"

# ── Build CLI ─────────────────────────────────────────────────────────────────
echo "  Building CLI..."
cd packages/cli
npm run build
cd ../..
echo "  ✓ CLI built → packages/cli/dist/index.js"

# ── Configure MCP server .env ─────────────────────────────────────────────────
MCP_ENV="packages/mcp-server/.env"
if [ ! -f "$MCP_ENV" ]; then
  cp packages/mcp-server/.env.example "$MCP_ENV"
  echo ""
  echo "  ⚠  Created packages/mcp-server/.env from .env.example"
  echo "  Edit it with your Replit agent URL and project token before connecting Claude Desktop."
fi

# ── Print next steps ──────────────────────────────────────────────────────────
MCP_PATH="$(pwd)/packages/mcp-server/dist/index.js"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Setup complete. Next steps:"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  1. Deploy packages/workspace-agent/ to a Replit project"
echo "     and set REPLBRIDGE_PROJECT_TOKEN + REPLBRIDGE_WORKSPACE_ROOT"
echo "     in Replit Secrets."
echo ""
echo "  2. Edit packages/mcp-server/.env with your agent URL + token."
echo ""
echo "  3. Add this to your Claude Desktop config"
echo "     (~/Library/Application Support/Claude/claude_desktop_config.json):"
echo ""
echo '     {'
echo '       "mcpServers": {'
echo '         "replbridge": {'
echo '           "command": "node",'
echo "           \"args\": [\"${MCP_PATH}\"],"
echo '           "env": {'
echo '             "REPLBRIDGE_AGENT_URL": "https://your-agent.replit.app",'
echo '             "REPLBRIDGE_PROJECT_TOKEN": "your-token-here"'
echo '           }'
echo '         }'
echo '       }'
echo '     }'
echo ""
echo "  4. Restart Claude Desktop."
echo ""
echo "  5. Test: 'Use ReplBridge to check the workspace status.'"
echo ""
echo "  Full guide: docs/getting-started.md"
echo ""
