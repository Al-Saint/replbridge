# Troubleshooting

Start with the doctor. It checks the build, reaches the agent, and validates the token:

```bash
REPLBRIDGE_AGENT_URL=https://<your-dev-url> REPLBRIDGE_PROJECT_TOKEN=<your-token> npm run doctor
```

## Claude says it doesn't have a ReplBridge tool

The MCP client isn't loading the server. Check that:

1. The path to `packages/mcp-server/dist/index.js` is **absolute**.
2. That file exists. If not, run `npm run build` from the repo root.
3. You fully restarted Claude Desktop after editing the config (quit it from the tray/menu bar, not just the window).
4. The config is valid JSON.
5. For Claude Code, `claude mcp list` shows `replbridge` as connected.

Claude Desktop writes MCP server logs to `~/Library/Logs/Claude/mcp-server-replbridge.log` (macOS) or `%APPDATA%\Claude\logs\` (Windows). On startup, ReplBridge logs either `Connected to Workspace Agent ✓` or the exact problem.

## `Configuration error` on startup

`REPLBRIDGE_AGENT_URL` or `REPLBRIDGE_PROJECT_TOKEN` is missing or invalid. Set both in your MCP client's `env` block, or in `packages/mcp-server/.env`. The token must be at least 16 characters.

## `AGENT_UNREACHABLE`

The MCP server can't open a connection to the agent. Check that:

1. The agent is running in the Replit Shell (`npm start` inside `replbridge-agent/`).
2. `REPLBRIDGE_AGENT_URL` matches the Repl's current dev URL exactly.
3. `curl https://<your-dev-url>/health` works from your machine.

## `AGENT_BAD_RESPONSE` (got an HTML page)

Something answered at that URL, but it wasn't the agent. Usually it's one of these:

- **The Repl is asleep or still starting.** Replit is serving its own page. Open the Repl and make sure the agent is running.
- **The URL points at the wrong port or app.** The dev URL may be routing to your project's own web server rather than the agent. Check the Networking pane and make sure the agent's port has an external mapping.

## `AGENT_TIMEOUT`

The agent accepted the connection but didn't answer within `REPLBRIDGE_TIMEOUT_MS` (default 30 s). If it happens on `run_command`, raise `REPLBRIDGE_COMMAND_TIMEOUT_MS` in the MCP client env. Keep it above the agent's own command timeout.

## `UNAUTHORIZED`

The token doesn't match. Check that:

1. `REPLBRIDGE_PROJECT_TOKEN` is identical in Replit Secrets and in your MCP client config.
2. You restarted the agent after changing the Secret. Secrets are read at startup.

## The agent won't start

The agent prints a `FATAL:` line explaining why:

- `REPLBRIDGE_PROJECT_TOKEN is not set` / `must be at least 16 characters`: fix the Secret.
- `REPLBRIDGE_WORKSPACE_ROOT does not exist`: on Replit it's normally `/home/runner/workspace`.
- `port 3000 is already in use`: another process (often your own app) is using the port. Set `PORT` to something else, e.g. `3001`, and map that port in Networking.

## Use the workspace, not a Deployment

If edits "succeed" but never show up in your editor, the agent is probably running as a **published app (Deployment)**. Published apps run from a snapshot with a separate filesystem that resets on every publish, so changes there never reach your code. Run the agent from the Replit Shell in the workspace and use the workspace's dev URL.

## The Repl stops when I close the tab

Replit workspaces can stop after inactivity. The agent can't prevent this from inside the Repl (pinging itself on `localhost` doesn't count as activity). Keep the Repl open while you work with Claude, and re-run `npm start` in `replbridge-agent/` if it stopped.

## `BLOCKED_PATH` when reading a file

The file is on the security blocklist. This is intentional for `.env*`, `node_modules`, `.git`, `.replit`, `.replbridge`, the agent's own folder, and similar. The full list is in `packages/workspace-agent/src/security/safePaths.ts`.

## `PATH_TRAVERSAL`

The path resolves outside the workspace, either through `..` or through a symlink that points outside. This is intentional.

## `COMMAND_NOT_ALLOWED`

Only exact allowlisted commands run, and there's no shell, so `&&`, pipes and redirects don't work. Ask Claude to call `list_allowed_commands`, or add project-specific commands with the `REPLBRIDGE_EXTRA_COMMANDS` Secret (comma-separated), then restart the agent.

## `TEXT_NOT_FOUND` or `AMBIGUOUS_MATCH` from `edit_file`

`edit_file` only replaces text that matches **exactly**, including spaces and indentation, and only if it matches in exactly one place.

- `TEXT_NOT_FOUND`: the file changed, or the text was copied inexactly. Have Claude re-read the file first.
- `AMBIGUOUS_MATCH`: the text appears more than once. Include a few surrounding lines, or pass `replace_all: true` if every occurrence should change.

## Undoing a change Claude made

Ask Claude to "list the snapshots for `<file>` and restore the one from before your change". It uses `list_snapshots` and `restore_snapshot`. The version being replaced is saved first, so a restore can itself be undone. Files moved with `soft_delete_file` are in `.replbridge/trash/`. Restore those from the Replit file tree.

## A command "hangs" and then returns `timedOut: true`

Long-running commands such as `npm run dev` are killed after `REPLBRIDGE_COMMAND_TIMEOUT_MS` (default 2 minutes), and the output so far is returned. This is expected for dev servers.

## Snapshots filling up disk

Snapshots accumulate in `.replbridge/snapshots/` and trash in `.replbridge/trash/`. Delete old ones from the Replit file tree or Shell whenever you like. They're only backups.
