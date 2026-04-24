# @replbridge/shared

**Status: scaffolded, not yet consumed.**

This package is reserved for types and helpers that will eventually be shared
between `@replbridge/workspace-agent`, `@replbridge/mcp-server`, and
`@replbridge/cli`. As of the MVP it exports nothing that the other packages
depend on — each package currently carries its own local copies of the small
shared shapes (e.g. `AgentResponse`, error codes).

## Why it exists

Keeping the workspace slot in place now means we can later extract the
duplicated types without having to reshuffle the monorepo. Concretely, the
plan is to move the following into `src/` here and import them from the
other packages:

- `AgentResponse<T>` and the shared error-code enum (`AGENT_TIMEOUT`,
  `AGENT_UNREACHABLE`, `UNAUTHORIZED`, `BLOCKED_PATH`, `BLOCKED_COMMAND`, ...).
  - Request/response schemas for each Workspace Agent route.
  - The path/command blocklist constants used by `security/safePaths.ts` and
    `security/safeCommands.ts`.

    ## Do not import from this package yet

    Until the extraction lands, importing from `@replbridge/shared` in
    `workspace-agent`, `mcp-server`, or `cli` will either fail at build time or
    drift from the canonical copy inside that package. If you need one of the
    shapes above today, copy it locally and add a TODO referencing this README.

    ## When it becomes active

    Tracking issue: see the MVP milestone in the repository issues. Once the
    shared types land here, each consumer package will:

    1. Add `"@replbridge/shared": "workspace:*"` to its `dependencies`.
    2. Replace its local copy of the type with an import from `@replbridge/shared`.
    3. Drop the duplicated definition.

    Until then, treat this package as a placeholder.
    
