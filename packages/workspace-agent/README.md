# @replbridge/workspace-agent

The ReplBridge Workspace Agent runs **inside** a Replit workspace. It is the only component that touches your files, and it enforces every safety rule: token auth, path jail, blocklist, command allowlist, snapshots, and soft-delete.

## Routes

| Route                     | Auth   | Description                                                  |
| ------------------------- | ------ | ------------------------------------------------------------ |
| `GET /health`             | Public | Liveness check                                               |
| `GET /status`             | Token  | Stack, Node version, git branch                              |
| `POST /files/list`        | Token  | Recursive file listing (sensitive paths hidden)              |
| `POST /files/read`        | Token  | Read a text file (max 500 KB, secrets/binaries rejected)     |
| `POST /files/write`       | Token  | Write a file (snapshots the previous version first)          |
| `POST /files/edit`        | Token  | Exact find-and-replace in a file (snapshots first)           |
| `POST /files/search`      | Token  | Search text files (string or regex)                          |
| `POST /files/delete-soft` | Token  | Move a file to trash (never permanently deleted)             |
| `POST /snapshots/list`    | Token  | List snapshots, optionally for one file                      |
| `POST /snapshots/restore` | Token  | Restore a file from a snapshot (current version saved first) |
| `GET /commands/allowed`   | Token  | Permitted commands and timeout                               |
| `POST /commands/run`      | Token  | Run an allowlisted command                                   |
| `GET /git/status`         | Token  | `git status` output                                          |
| `GET /git/diff`           | Token  | `git diff` output (`?staged=true` for `--staged`)            |

Every response has the shape `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

## Security model

- **Token auth**: every route except `/health` requires `Authorization: Bearer <REPLBRIDGE_PROJECT_TOKEN>`, compared in constant time.
- **Path jail**: all file operations are confined to `REPLBRIDGE_WORKSPACE_ROOT`. Both `..` traversal and symlinks pointing outside are rejected.
- **Blocked paths**: `.env*`, `.git`, `node_modules`, `.replit`, `secrets`, `.replbridge`, and the agent's own folder are hidden and denied.
- **Command allowlist**: only exact allowlisted strings run, via `spawn` with no shell, a timeout, capped output, and the token removed from the environment.
- **No permanent delete**: files go to `.replbridge/trash`.
- **Snapshots**: every write, edit and restore backs up the previous version to `.replbridge/snapshots`, and `/snapshots/restore` rolls a file back.

See [docs/security.md](../../docs/security.md) for details and limits.

## Configuration

| Variable                        | Required | Default     | Description                                                 |
| ------------------------------- | -------- | ----------- | ----------------------------------------------------------- |
| `REPLBRIDGE_PROJECT_TOKEN`      | ✓        | —           | Shared secret (≥16 chars)                                   |
| `REPLBRIDGE_WORKSPACE_ROOT`     |          | current dir | Root Claude may access. On Replit: `/home/runner/workspace` |
| `PORT`                          |          | `3000`      | Port to listen on                                           |
| `HOST`                          |          | `0.0.0.0`   | Interface to bind                                           |
| `REPLBRIDGE_COMMAND_TIMEOUT_MS` |          | `120000`    | Kill commands after this long                               |
| `REPLBRIDGE_EXTRA_COMMANDS`     |          | —           | Comma-separated extra exact commands to allow               |

On Replit, set these in **Secrets**. Locally, a `.env` in the directory you start from is loaded automatically (real environment variables win).

## Run it in a Repl

1. Copy this package (minus `node_modules/` and `dist/`) into a **`replbridge-agent/`** folder in your Repl. Keeping it in a subfolder avoids clashing with your project's `package.json` and lets the agent block its own code.
2. Add `REPLBRIDGE_PROJECT_TOKEN` and `REPLBRIDGE_WORKSPACE_ROOT=/home/runner/workspace` to Secrets.
3. In the Replit Shell:

   ```bash
   cd replbridge-agent
   npm install
   npm run build
   npm start
   ```

4. Use the Repl's **dev URL** (Webview / Networking pane) as `REPLBRIDGE_AGENT_URL`.

> Run the agent in the workspace, **not** as a Replit Deployment. Published apps use a separate, snapshot filesystem, so edits would never reach your code.

## Test it

```bash
curl https://<your-dev-url>/health

curl https://<your-dev-url>/status \
  -H "Authorization: Bearer <your-token>"
```

## Local development

```bash
cp .env.example .env   # set a test token and a workspace root
npm install
npm run dev
```
