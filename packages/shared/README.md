# @replbridge/shared

**Status: scaffolded, not yet consumed.**

This package is reserved for types and helpers that will eventually be shared between `@replbridge/workspace-agent`, `@replbridge/mcp-server`, and `@replbridge/cli`. Right now nothing depends on it. Each package carries its own copy of the small shared shapes (e.g. `AgentResponse`, error codes).

## Why it exists

Keeping the workspace slot means the duplicated types can be extracted later without reshuffling the monorepo. The plan is to move these here:

- `AgentResponse<T>` and the shared error codes (`AGENT_TIMEOUT`, `AGENT_UNREACHABLE`, `AGENT_BAD_RESPONSE`, `UNAUTHORIZED`, `BLOCKED_PATH`, `PATH_TRAVERSAL`, `COMMAND_NOT_ALLOWED`, …).
- Request/response schemas for each Workspace Agent route.
- The path/command blocklist constants from `security/safePaths.ts` and `security/safeCommands.ts`.

## Do not import from this package yet

Until the extraction lands, importing `@replbridge/shared` from another package will either fail at build time or drift from the canonical copy. If you need one of these shapes today, copy it locally and add a TODO referencing this README.

## When it becomes active

Each consumer package will:

1. Add `"@replbridge/shared": "*"` to its `dependencies` (npm workspaces link it locally).
2. Replace its local copy of the type with an import from `@replbridge/shared`.
3. Drop the duplicated definition.
