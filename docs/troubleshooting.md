# Troubleshooting

## Claude says "I don't have a ReplBridge tool"

Claude Desktop isn't loading the MCP server. Check:

1. The path in `claude_desktop_config.json` is **absolute**, not relative
2. `packages/mcp-server/dist/index.js` exists — run `npm run build` inside `packages/mcp-server/`
3. You restarted Claude Desktop after editing the config
4. The config JSON is valid — paste it into [jsonlint.com](https://jsonlint.com) to check

## "AGENT_UNREACHABLE" error

The MCP server can't reach the Workspace Agent. Check:

1. Your Replit project is running (not sleeping)
2. `REPLBRIDGE_AGENT_URL` in your Claude Desktop config matches the live Replit URL exactly
3. The URL ends without a trailing slash
4. Test with: `curl https://your-agent.replit.app/health`

## "UNAUTHORIZED" error

The token doesn't match. Check:

1. `REPLBRIDGE_PROJECT_TOKEN` in Claude Desktop config matches what's in Replit Secrets exactly
2. There are no leading/trailing spaces in either value
3. You're using the same token in both places

## The Workspace Agent won't start

1. Check Replit Secrets — `REPLBRIDGE_PROJECT_TOKEN` must be set
2. Run `npm install` inside the project
3. Check the Replit console for the error message

## "BLOCKED_PATH" when reading a file

The file is on the security blocklist. This is intentional for `.env`, `node_modules`, `.git`, etc. If you think a file is being incorrectly blocked, check `packages/workspace-agent/src/security/safePaths.ts`.

## Snapshots filling up disk

Snapshots accumulate in `.replbridge/snapshots/`. You can safely delete old ones — they're just backups. The trash is in `.replbridge/trash/`.

## Run the doctor

```bash
npx @replbridge/init doctor
```

This checks your entire setup and tells you exactly what's wrong.
