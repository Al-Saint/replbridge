# @replbridge/workspace-agent

The ReplBridge Workspace Agent runs **inside** a Replit project. It is the only component that touches your files. Everything it exposes to Claude is explicitly controlled — no shell, no secrets, no path traversal.

## What it does

| Route | Auth | Description |
|---|---|---|
| `GET /health` | Public | Liveness check |
| `GET /status` | Token | Stack, Node version, git branch |
| `POST /files/list` | Token | Recursive file listing (sensitive paths hidden) |
| `POST /files/read` | Token | Read a file (max 500KB, secrets blocked) |
| `POST /files/write` | Token | Write a file (snapshots the previous version first) |
| `POST /files/delete-soft` | Token | Move file to trash (never permanently deleted) |
| `GET /commands/allowed` | Token | List of permitted commands |
| `POST /commands/run` | Token | Run an allowlisted command |
| `GET /git/status` | Token | git status output |
| `GET /git/diff` | Token | git diff output |

## Security model

- **Token auth** — every protected route requires `Authorization: Bearer <REPLBRIDGE_PROJECT_TOKEN>`
- **Path jail** — all file operations are confined to `REPLBRIDGE_WORKSPACE_ROOT`; path traversal (`../../etc/passwd`) is blocked
- **Blocked paths** — `.env`, `.git`, `node_modules`, `secrets`, and other sensitive names are hidden from listings and denied on read/write
- **Command allowlist** — only explicitly listed commands can run; arbitrary shell is impossible
- **No permanent delete** — files go to `.replbridge/trash`, never gone forever
- **Snapshots** — every file write creates a backup in `.replbridge/snapshots` first

## Deploy to Replit

### 1. Create a new Replit project

Use the Node.js template. Name it `replbridge-workspace-agent`.

### 2. Copy these files into the project

Copy the contents of this package into your Replit project root.

### 3. Set Secrets

In Replit → Secrets, add:

```
REPLBRIDGE_PROJECT_TOKEN  =  <generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
REPLBRIDGE_WORKSPACE_ROOT =  /home/runner/workspace
```

### 4. Start the agent

```bash
npm install
npm run dev
```

The agent starts on port 3000. Replit will expose it publicly.

### 5. Test it

```bash
# Health (no auth needed)
curl https://your-agent.replit.app/health

# Status (with token)
curl https://your-agent.replit.app/status \
  -H "Authorization: Bearer your-token-here"
```

## Local development

```bash
cp .env.example .env
# edit .env with a test token and your local workspace root
npm install
npm run dev
```
