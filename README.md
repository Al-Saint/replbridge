# ReplBridge

## Licensing

Versions v0.1.x are released under the MIT License and will remain MIT permanently. Future versions may adopt a source-available license (FSL or similar) to protect against competing SaaS offerings while keeping the core free for individual and commercial use. See CHANGELOG for version history.



**Claude for Replit, with seatbelts.**


ReplBridge is an installable MCP bridge that lets Claude safely inspect, edit, test, and improve any Replit project — with path jails, command allowlists, automatic snapshots, and soft-delete.


```
Claude Desktop / Claude Code
        ↓  (stdio MCP)
ReplBridge MCP Server
        ↓  (HTTPS + token auth)
ReplBridge Workspace Agent   ← runs inside your Replit project
        ↓
Your code
```


## Why ReplBridge?


Claude is powerful. But giving Claude unrestricted shell access to a codebase is risky. ReplBridge adds a controlled layer:


| Without ReplBridge | With ReplBridge |
|---|---|
| Claude has full shell access | Claude uses an explicit allowlist of actions |
