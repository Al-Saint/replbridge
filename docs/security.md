# ReplBridge security model

ReplBridge gives Claude **controlled developer powers**, not unrestricted system access. This document explains exactly what Claude can and can't do.

## The principle

> Claude should be able to do what a junior developer can do — read code, edit files, run tests — but not what would require a security review.

## What Claude CAN do

| Action | Details |
|---|---|
| Read files | Any file not on the blocked list, max 500KB |
| List files | Recursive listing, sensitive paths hidden |
| Write files | Any non-blocked path — previous version is snapshotted first |
| Soft-delete files | Files go to `.replbridge/trash`, never permanently gone |
| Run allowed commands | `npm install`, `npm test`, `git status`, `python -m pytest`, and a few others |
| Check git status/diff | Read-only git operations |

## What Claude CANNOT do

| Action | Why |
|---|---|
| Read `.env` or secrets | Explicitly blocked by name pattern |
| Read files > 500KB | Size limit prevents accidentally reading huge blobs |
| Run arbitrary shell commands | Strict allowlist — only pre-approved commands work |
| Delete files permanently | Soft-delete only — files go to trash |
| Access paths outside workspace root | Path jail — `../../etc/passwd` is blocked |
| See `node_modules`, `.git`, `.config` | Excluded from listings and blocked on read/write |
| Commit or push to git | git write operations are not on the allowlist |
| Make network requests | The agent has no outbound network tools |

## Token security

- Each Replit project gets its own token
- The token is compared using a constant-time comparison (prevents timing attacks)
- The MCP server never logs the token
- Tokens should be treated like passwords — never committed to git, never shared

## Snapshots

Every time Claude writes a file, a copy of the **previous version** is saved to `.replbridge/snapshots/` first. The snapshot filename includes a timestamp so you can identify and restore any version.

This means: **Claude can never silently destroy your work.**

## Blocklist

These names are blocked from all file operations and hidden from listings:

```
.env  .env.local  .env.production  .env.development
node_modules  .git  .config  .replit  repl.nix
.cache  secrets
```

Any filename starting with `.env` is also blocked.

## Command allowlist

Only these exact command strings are permitted:

```
npm install          npm run build       npm run test
npm run lint         npm run dev         npm run start
python -m pytest     python main.py      python app.py
pip install -r requirements.txt
git status           git diff            git log --oneline -5
git log --oneline -10                   git branch
```

A command that isn't on this list returns a `COMMAND_NOT_ALLOWED` error immediately — no shell is invoked.

## Future security improvements

These are planned but not yet built:

- Rate limiting per token
- Signed agent handshake (prevents token replay)
- Project-level permission scopes (read-only mode)
- Audit log of every action Claude took
- Explicit approval flow for destructive actions
- Token rotation on a schedule
