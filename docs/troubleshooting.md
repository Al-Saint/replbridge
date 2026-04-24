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


## Replit port mapping / public URL unreachable

If `curl https://<your-agent>.replit.app/health` times out or returns a Replit landing page instead of `{ "ok": true }`, the Workspace Agent is running but Replit isn't routing traffic to it. Check:

1. **Bind to `0.0.0.0`, not `127.0.0.1`.** The agent must listen on `0.0.0.0` so Replit's edge can reach it. Verify `packages/workspace-agent/src/index.ts` passes `0.0.0.0` as the host.
2. 2. **Match the Replit `[[ports]]` mapping.** In `.replit`, the `localPort` must equal the port the agent listens on (default `3001`). The `externalPort` should be `80` (or `443`) so the public URL resolves without a custom port.
   3. 3. **Use the stable `.replit.app` domain.** The `.replit.dev` preview URL only works while the editor tab is open. For Claude Desktop, always use the deployed `.replit.app` URL.
      4. 4. **Don't run two servers on the same port.** If you see `EADDRINUSE`, another Repl process (or a leftover dev server) is holding the port. Stop it or change `REPLBRIDGE_AGENT_PORT`.
         5. 5. **Keep the Repl awake.** Free Repls sleep after inactivity; the first request after a sleep may time out. Upgrade to Always-On or keep the tab open while testing.
           
            6. Quick diagnosis:
           
            7. ```bash
               # From the Replit shell — should print "ok"
               curl -s http://localhost:3001/health | jq -r .ok

               # From your laptop — should also print "ok"
               curl -s https://<your-agent>.replit.app/health | jq -r .ok
               ```

               If the first works but the second doesn't, the problem is port mapping, not the agent.
               
