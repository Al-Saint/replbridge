# Changelog

All notable changes to ReplBridge are documented here. This project follows [Semantic Versioning](https://semver.org).

## [Unreleased]

### Fixed
- **`write_file` was broken.** The MCP server sent `contents` but the agent expects `content`, so every write failed with `INVALID_INPUT`.
- **Symlink escape.** A symlink inside the workspace (e.g. `link → /etc`) let `read_file`, `write_file`, `list_files` and `soft_delete_file` reach files outside the workspace. All file routes now resolve real paths before the jail check, and dangling symlinks are refused.
- Tool failures are now returned with `isError: true` so Claude knows a call failed. `run_command` with a non-zero exit code also counts as an error.
- `packages/mcp-server/.env` is now found even when the MCP client launches the server from another working directory (Claude Desktop does).
- Non-JSON responses (Replit's HTML "waking up" page, wrong port) are reported as `AGENT_BAD_RESPONSE` with a hint, instead of a confusing JSON parse error.
- Long-running commands (e.g. `npm run dev`) no longer hang forever. They're killed at `REPLBRIDGE_COMMAND_TIMEOUT_MS`, along with their child processes, and the output so far is returned.
- `run_command` uses a longer client-side timeout, so `npm install` no longer hits the 30 s request timeout.
- Async errors in agent routes are now handled. Express 5 forwards them to the error handler, and malformed JSON returns `INVALID_JSON`.
- The agent binds to `0.0.0.0` explicitly and prints a clear message on `EADDRINUSE`.

### Security
- `REPLBRIDGE_PROJECT_TOKEN` is removed from the environment of every command Claude runs.
- The agent's own install folder is blocked when it's inside the workspace, so Claude can't rewrite the allowlist.
- Token comparison no longer leaks token length. Tokens must be ≥16 characters.
- Also blocked: `replit.nix`, `.ssh`, `.npmrc`. Binary files are rejected by `read_file`. Command output is capped at 200 KB per stream, and listings at 2,000 entries.

### Changed
- Upgraded to `@modelcontextprotocol/sdk` 1.32 (`McpServer` + `registerTool`, tool titles and annotations, server instructions), Zod 4, Express 5, and TypeScript 5.9.
- Node.js ≥ 20.12 is now required (Node 18 is end-of-life). `dotenv` was replaced with Node's built-in `process.loadEnvFile`. Recent dotenv versions print to stdout, which corrupts the MCP stdio stream.
- `git_diff` accepts `staged: true`. `npm ci`, `npm test`, `npm run typecheck`, `git diff --staged` and `git log --oneline -20` were added to the allowlist.
- `REPLBRIDGE_EXTRA_COMMANDS` adds project-specific commands to the allowlist without editing code.
- `replbridge doctor` now checks the live agent connection and the token, and finds the MCP build relative to the CLI.
- Removed the localhost self-ping keepalive. Requests to `localhost` don't count as Repl activity, so it never kept the Repl awake.
- Removed `push-to-github.sh`. The repository is already published.

### Added
- End-to-end test suite (`npm test`). It runs the real agent and the real MCP server through the official MCP client, covering every tool and the security boundaries.
- CI workflow running build, typecheck and tests on Node 20 and 22.
- Claude Code setup instructions (`claude mcp add …`). The docs were rewritten, including the note that the agent must run in the Replit workspace, not as a Deployment.

## [0.1.0]

- Initial MVP: MCP server, Workspace Agent, and CLI.
