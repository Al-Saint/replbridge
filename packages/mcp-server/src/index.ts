#!/usr/bin/env node
/**
 * ReplBridge MCP Server
 *
 * Exposes tools that let Claude safely inspect, edit, and run commands
 * inside a Replit project via the ReplBridge Workspace Agent.
 *
 * Transport: stdio (compatible with Claude Desktop, Claude Code, and any
 * other MCP client)
 *
 * Required env vars:
 *   REPLBRIDGE_AGENT_URL     — the public URL of the Workspace Agent
 *   REPLBRIDGE_PROJECT_TOKEN — the Bearer token for the Workspace Agent
 *
 * Optional:
 *   REPLBRIDGE_TIMEOUT_MS         — per-request timeout (default 30000)
 *   REPLBRIDGE_COMMAND_TIMEOUT_MS — run_command timeout (default 150000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AgentClient, formatAgentResponse, type AgentResponse } from "./agent.js";
import { loadConfig, PACKAGE_VERSION } from "./config.js";

const config = loadConfig();
const agent = new AgentClient({
  agentUrl: config.REPLBRIDGE_AGENT_URL,
  projectToken: config.REPLBRIDGE_PROJECT_TOKEN,
  timeoutMs: config.REPLBRIDGE_TIMEOUT_MS,
  commandTimeoutMs: config.REPLBRIDGE_COMMAND_TIMEOUT_MS,
});

// ─── Server setup ──────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: "replbridge", title: "ReplBridge", version: PACKAGE_VERSION },
  {
    instructions:
      "ReplBridge gives you safe access to a Replit project through a Workspace Agent. " +
      "Start with workspace_status and list_files to orient yourself. Always read_file before " +
      "write_file so you don't clobber content, and write the COMPLETE file contents. " +
      "Every overwrite is snapshotted and deletes go to a trash folder, so edits are recoverable. " +
      "Only allowlisted commands can run: call list_allowed_commands before run_command. " +
      "Use git_diff to review your changes when you're done.",
  }
);

/** Convert an agent response to an MCP tool result, flagging failures. */
function toResult(response: AgentResponse): CallToolResult {
  return {
    content: [{ type: "text", text: formatAgentResponse(response) }],
    ...(response.ok ? {} : { isError: true }),
  };
}

// ─── Tools ─────────────────────────────────────────────────────────────────────

server.registerTool(
  "workspace_status",
  {
    title: "Workspace status",
    description:
      "Get the current status of the Replit workspace: workspace root, Node version, " +
      "detected project stack (Node/Python/Static HTML), whether git is initialized, and the current branch. " +
      "Use this first when connecting to a new workspace or when you need to understand the project type.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => toResult(await agent.status())
);

server.registerTool(
  "list_files",
  {
    title: "List files",
    description:
      "List files and folders in the Replit workspace. Directories end with '/'. Sensitive paths " +
      "(like .env, node_modules, .git) and build output are hidden. Use this to understand the " +
      "project structure before reading or editing files.",
    inputSchema: {
      path: z
        .string()
        .default(".")
        .describe("Directory path relative to the workspace root. Defaults to the workspace root."),
      depth: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(2)
        .describe("How many directory levels deep to recurse (1-5). Defaults to 2."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ path, depth }) => toResult(await agent.listFiles(path, depth))
);

server.registerTool(
  "read_file",
  {
    title: "Read file",
    description:
      "Read the contents of a text file in the Replit workspace. " +
      "Sensitive files (.env, secrets, etc.) are blocked. Files larger than 500KB and binary files are rejected.",
    inputSchema: {
      path: z.string().min(1).describe("File path relative to the workspace root."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ path }) => {
    const response = await agent.readFile(path);
    // Return raw file contents rather than JSON-escaped text: easier for the
    // model to read and edit accurately.
    if (response.ok && response.data) {
      return { content: [{ type: "text", text: response.data.content }] };
    }
    return toResult(response);
  }
);

server.registerTool(
  "write_file",
  {
    title: "Write file",
    description:
      "Create or overwrite a file in the Replit workspace with the COMPLETE new contents " +
      "(this is not a patch — include the whole file). Parent directories are created as needed. " +
      "If the file already exists, a timestamped snapshot is saved to .replbridge/snapshots/ first, " +
      "so the previous version can always be recovered.",
    inputSchema: {
      path: z.string().min(1).describe("File path relative to the workspace root."),
      content: z.string().describe("Complete new content to write to the file."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ path, content }) => toResult(await agent.writeFile(path, content))
);

server.registerTool(
  "soft_delete_file",
  {
    title: "Soft-delete file",
    description:
      "Safely remove a file or folder from the Replit workspace by moving it to .replbridge/trash. " +
      "It is NOT permanently deleted and can be recovered. Permanent deletion is not available.",
    inputSchema: {
      path: z.string().min(1).describe("File path relative to the workspace root."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ path }) => toResult(await agent.softDeleteFile(path))
);

server.registerTool(
  "list_allowed_commands",
  {
    title: "List allowed commands",
    description:
      "Get the exact command strings that are permitted to run in the workspace, plus the per-command timeout. " +
      "Always check this before calling run_command.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => toResult(await agent.listAllowedCommands())
);

server.registerTool(
  "run_command",
  {
    title: "Run command",
    description:
      "Run an allowlisted command in the workspace root (e.g. 'npm install', 'npm test', 'python -m pytest'). " +
      "The command must match an allowlist entry exactly — call list_allowed_commands first. " +
      "There is no shell: pipes, redirects, '&&' and env vars are not supported. " +
      "Returns stdout, stderr, exit code, and duration. Long-running commands (like dev servers) are " +
      "killed at the timeout and their output so far is returned.",
    inputSchema: {
      command: z.string().min(1).describe("The exact command to run (must be on the allowlist)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ command }) => {
    const response = await agent.runCommand(command);
    const result = toResult(response);
    // A command that ran but exited non-zero is still a failure from Claude's POV.
    const data = response.data as { exitCode?: number } | undefined;
    if (response.ok && data?.exitCode !== 0) result.isError = true;
    return result;
  }
);

server.registerTool(
  "git_status",
  {
    title: "Git status",
    description:
      "Get the git status of the Replit workspace — which files are modified, staged, or untracked. " +
      "Use this to see what has changed or to verify your edits landed.",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => toResult(await agent.gitStatus())
);

server.registerTool(
  "git_diff",
  {
    title: "Git diff",
    description:
      "Get the line-by-line git diff of the Replit workspace. By default shows unstaged changes; " +
      "set staged=true to see staged changes. Use this to review your edits.",
    inputSchema: {
      staged: z.boolean().default(false).describe("Show staged changes instead of unstaged ones."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ staged }) => toResult(await agent.gitDiff(staged))
);

// ─── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[ReplBridge] MCP server v${PACKAGE_VERSION} running on stdio → ${config.REPLBRIDGE_AGENT_URL}\n`
  );

  // Non-blocking connectivity check so problems show up in the MCP client's
  // logs immediately instead of on the first tool call.
  agent.status().then((res) => {
    if (res.ok) {
      process.stderr.write("[ReplBridge] Connected to Workspace Agent ✓\n");
    } else {
      process.stderr.write(`[ReplBridge] Warning: ${formatAgentResponse(res)}\n`);
    }
  });
}

main().catch((err) => {
  process.stderr.write(`[ReplBridge] Fatal error: ${err}\n`);
  process.exit(1);
});
