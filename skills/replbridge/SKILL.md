---
name: replbridge
description: Safely inspect, edit, test and debug a Replit project through the ReplBridge MCP server. Use when the user wants to work on code in their Replit workspace, mentions Replit or ReplBridge, or when tools named workspace_status, list_files, read_file, edit_file, search_files, run_command or restore_snapshot are available. Also covers setting up and troubleshooting a ReplBridge connection.
---

# ReplBridge — working on a Replit project safely

ReplBridge connects you to a Replit workspace through a Workspace Agent that enforces safety rails: a path jail, a blocklist for secrets, an exact command allowlist, automatic snapshots before every change, and soft-delete. You work through MCP tools; you never get a shell.

## Tools at a glance

| Goal                           | Tool                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| Orient yourself                | `workspace_status`, then `list_files` (depth 1–5)            |
| Find code                      | `search_files` (plain text or `regex: true`)                 |
| Read a file                    | `read_file` (text files ≤ 500 KB)                            |
| Change part of a file          | `edit_file` (exact `old_text` → `new_text`)                  |
| Create or fully rewrite a file | `write_file` (complete contents)                             |
| Remove a file                  | `soft_delete_file` (moves it to the trash)                   |
| Run tests/builds               | `list_allowed_commands`, then `run_command`                  |
| Review your work               | `git_status`, `git_diff` (`staged: true` for staged changes) |
| Undo                           | `list_snapshots`, then `restore_snapshot`                    |

## Standard workflow

1. **Orient.** Call `workspace_status` to learn the stack (node / python / static-html) and git branch. Then `list_files` with depth 2. Go deeper only where needed.
2. **Locate before reading.** Use `search_files` to find definitions and usages instead of reading many files.
3. **Read before you change.** Always `read_file` a file before editing it, so your `old_text` matches exactly.
4. **Prefer `edit_file`.** For changes to existing files, use `edit_file` with an `old_text` that is unique. Include 2–3 surrounding lines if the snippet could appear more than once. Use `write_file` only for new files or deliberate full rewrites, and always send the complete file.
5. **Verify.** Call `list_allowed_commands` once, then run the project's tests or build with `run_command` (e.g. `npm test`, `npm run build`, `python -m pytest`). A non-zero exit code comes back as an error. Read stderr, fix, and re-run.
6. **Review.** Finish with `git_diff` and summarize what changed and why.

## Rules that the agent enforces (don't fight them)

- **No shell.** `run_command` takes one exact allowlisted string. `&&`, pipes, redirects, `cd` and env vars don't work. If you need a command that isn't allowed, tell the user they can add it via the `REPLBRIDGE_EXTRA_COMMANDS` Replit Secret (comma-separated exact commands) and restart the agent.
- **Blocked paths.** `.env*`, `.git`, `node_modules`, `.replit`, `replit.nix`, `secrets`, `.ssh`, `.npmrc`, `.replbridge` and the agent's own folder can't be read or written. Don't try to work around this. If the user needs a secret changed, ask them to do it in Replit Secrets.
- **Workspace jail.** Paths are relative to the workspace root. `..`, absolute paths and symlinks pointing outside are rejected.
- **Timeouts.** Commands are killed after about 2 minutes. Dev servers (`npm run dev`, `npm run start`) never exit on their own, so expect `timedOut: true` and use their output to confirm they started.

## Recovering from errors

| Error                                      | What to do                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `TEXT_NOT_FOUND`                           | Re-read the file; copy `old_text` exactly, including indentation                                                           |
| `AMBIGUOUS_MATCH`                          | Add surrounding lines to `old_text`, or set `replace_all: true` if every occurrence should change                          |
| `BLOCKED_PATH`                             | The path is protected by design; explain this to the user                                                                  |
| `PATH_TRAVERSAL`                           | Use a path inside the workspace                                                                                            |
| `COMMAND_NOT_ALLOWED`                      | Pick an exact entry from `list_allowed_commands`                                                                           |
| `FILE_TOO_LARGE` / `BINARY_FILE`           | Don't read it; use `search_files` on a narrower path                                                                       |
| `AGENT_UNREACHABLE` / `AGENT_BAD_RESPONSE` | The Repl is probably asleep or the agent stopped. Ask the user to open the Repl and run `npm start` in `replbridge-agent/` |
| `AGENT_TIMEOUT`                            | Retry once; if it persists, the Repl may be overloaded                                                                     |
| `UNAUTHORIZED`                             | The token in the MCP config doesn't match Replit Secrets. Ask the user to check both                                       |

## Undoing a mistake

Every `write_file`, `edit_file` and `restore_snapshot` saves the previous version first.

1. `list_snapshots` with `path` set to the file, to get its history (newest first).
2. `restore_snapshot` with that `path` and the chosen `snapshot` id.

A restore also snapshots the current version, so it can be undone too. Soft-deleted files are in `.replbridge/trash/`. You can't read that folder, but the user can restore files from it in the Replit file tree.

## If ReplBridge isn't connected yet

If the tools aren't available, walk the user through setup:

1. Clone and build locally: `git clone https://github.com/al-saint/replbridge.git && cd replbridge && ./setup-local.sh`
2. Generate a token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. In the Repl, copy `packages/workspace-agent/` to `replbridge-agent/` and set the `REPLBRIDGE_PROJECT_TOKEN` and `REPLBRIDGE_WORKSPACE_ROOT=/home/runner/workspace` Secrets. Then, in the Shell: `cd replbridge-agent && npm install && npm run build && npm start`.
4. Connect Claude Code:
   `claude mcp add replbridge -e REPLBRIDGE_AGENT_URL=<dev URL> -e REPLBRIDGE_PROJECT_TOKEN=<token> -- node <path>/packages/mcp-server/dist/index.js`
5. Verify with `npm run doctor` in the repo.

The agent must run in the Replit **workspace** using its `.replit.dev` dev URL, not as a published Deployment. Published apps have a separate filesystem, so edits there never reach the user's code.

## Good habits

- Make small, focused edits and run the tests after each meaningful change.
- Never ask the user to paste secrets into the chat; secrets belong in Replit Secrets.
- When you finish, summarize the files you changed and mention that snapshots exist if they want to undo anything.
