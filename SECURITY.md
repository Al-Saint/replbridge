# Security policy

ReplBridge's whole purpose is to put safety rails between an AI model and your code, so security reports are taken seriously.

## Supported versions

Security fixes go to the latest release on `main`.

## Reporting a vulnerability

**Please don't open a public issue for security problems.** Instead, use GitHub's private reporting: go to the repository's **Security** tab and choose **Report a vulnerability**.

Useful things to include:

- What an attacker (or a misbehaving model) can do, e.g. read a blocked file, escape the workspace, run a command that isn't allowlisted, or obtain the token
- The exact tool call or HTTP request that triggers it
- The ReplBridge version or commit, your OS, and your Node.js version

You'll get an acknowledgement within a few days. Fixes are released as soon as they're ready, and reporters are credited unless they prefer otherwise.

## Scope

In scope: the Workspace Agent's path jail, blocklist, command allowlist, token authentication, and the MCP server's handling of credentials.

Known limitation, not a vulnerability: allowlisted commands such as `npm test` run your project's own scripts, which the model can edit. See [docs/security.md](docs/security.md#know-the-limits-allowlisted-commands-run-project-code).
