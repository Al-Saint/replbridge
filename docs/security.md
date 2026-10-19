# ReplBridge security model

ReplBridge gives Claude **controlled developer powers**, not unrestricted system access. This document explains exactly what Claude can and can't do — and where the limits of those guarantees are.

## The principle

> Claude should be able to do what a junior developer can do — read code, edit files, run tests — but not what would require a security review.

## What Claude CAN do

| Action                | Details                                                              |
| --------------------- | -------------------------------------------------------------------- |
| Read files            | Any non-blocked text file, max 500 KB                                |
| List files            | Recursive listing, sensitive paths hidden, max 2,000 entries         |
| Write and edit files  | Any non-blocked path; the previous version is snapshotted first      |
| Search files          | Text search across non-blocked, non-binary files ≤500 KB             |
| Restore snapshots     | Roll a file back to a saved version (the current one is saved first) |
| Soft-delete files     | Files go to `.replbridge/trash`, never permanently deleted           |
| Run allowed commands  | Exact allowlist only, no shell, killed at a timeout                  |
| Check git status/diff | Read-only git operations                                             |

## What Claude CANNOT do

| Action                               | Why                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Read or write `.env*` or secrets     | Blocked by name and pattern                                                                                            |
| Escape the workspace                 | `..` and absolute paths are rejected, and **symlinks are resolved** before the check, so a link to `/etc` doesn't work |
| Edit the agent itself                | The agent's install folder is blocked when it's inside the workspace                                                   |
| Run arbitrary shell commands         | Strict allowlist, executed with `spawn` (no shell, so `;`, `&&` and pipes have no effect)                              |
| See the project token from a command | `REPLBRIDGE_PROJECT_TOKEN` is removed from every command's environment                                                 |
| Delete files permanently             | Soft-delete only                                                                                                       |
| Commit or push                       | git write operations aren't on the allowlist                                                                           |
| Hang the agent                       | Commands are killed after `REPLBRIDGE_COMMAND_TIMEOUT_MS`, output is capped at 200 KB per stream                       |

## Know the limits: allowlisted commands run project code

The allowlist controls _which_ commands run, not _what they do_. `npm test`, `npm run build`, `python main.py` and the other entries execute **your project's own scripts**, and Claude can edit those files with `write_file`. A determined (or confused) model could therefore write a script and then run it via an allowlisted command.

In practice this means:

- Treat ReplBridge as protection against **accidents and casual misuse** (wrong paths, leaked secrets, destructive deletes, runaway processes), not as a sandbox against a hostile operator.
- Replit's own container is the real isolation boundary. Don't run the agent in a Repl that holds credentials you can't afford to expose.
- Trim the allowlist in `packages/workspace-agent/src/security/safeCommands.ts` if you want a read-only setup (for example, remove the `npm`/`python` entries).

## Token security

- Each Replit project should get its own token (≥16 characters; 32 random bytes recommended).
- Tokens are compared in constant time (SHA-256 digests + `timingSafeEqual`), so neither the content nor the length leaks through timing.
- The MCP server and agent never log the token.
- Treat tokens like passwords: never commit them, and rotate one by changing the Secret and your MCP config, then restarting the agent.
- `/health` is the only unauthenticated route.

## Snapshots

Every time Claude writes, edits or restores a file, a copy of the **previous version** is saved to `.replbridge/snapshots/<path>__<timestamp>` first. Claude can list snapshots and restore one onto the file it came from (`list_snapshots` / `restore_snapshot`), but it can't read, modify or delete `.replbridge/` directly, so snapshots can't be tampered with through ReplBridge.

## Blocklist

These names are blocked anywhere in a path, for all file operations, and hidden from listings:

```
.env  .env.*  node_modules  .git  .config  .replit  replit.nix  repl.nix
.cache  secrets  .replbridge  .ssh  .npmrc
```

The agent's own install folder (e.g. `replbridge-agent/`) is also blocked. Build output (`dist`, `build`, `coverage`, `.next`, `__pycache__`, `venv`, …) is hidden from listings but can still be read directly.

## Command allowlist

Only these exact strings (after whitespace normalization) are permitted:

```
npm install          npm ci              npm test
npm run build        npm run test        npm run lint
npm run typecheck    npm run dev         npm run start
python -m pytest     python main.py      python app.py
pip install -r requirements.txt
git status           git diff            git diff --staged
git log --oneline -5 git log --oneline -10  git log --oneline -20
git branch
```

You can add project-specific entries with the `REPLBRIDGE_EXTRA_COMMANDS` Secret (comma-separated, exact strings). Anything else returns `COMMAND_NOT_ALLOWED` immediately, without starting a process.

## Future security improvements

These are planned but not yet built:

- Rate limiting per token
- Project-level permission scopes (read-only mode)
- Audit log of every action Claude took
- Explicit approval flow for destructive actions
- Token rotation on a schedule
