#!/usr/bin/env node
/**
 * ReplBridge MCP Server
 *
 * Exposes 9 tools that let Claude safely inspect, edit, and run commands
 * inside a Replit project via the ReplBridge Workspace Agent.
 *
 * Transport: stdio (compatible with Claude Desktop and Claude Code)
 *
 * Required env vars:
 *   REPLBRIDGE_AGENT_URL     — the public URL of the Workspace Agent
 *   REPLBRIDGE_PROJECT_TOKEN — the Bearer token for the Workspace Agent
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { z } from "zod";
import { AgentClient, formatAgentResponse } from "./agent.js";

dotenv.config();

// ─── Config validation ────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  REPLBRIDGE_AGENT_URL: z
    .string({ required_error: "REPLBRIDGE_AGENT_URL is required" })
    .url("REPLBRIDGE_AGENT_URL must be a valid URL"),
  REPLBRIDGE_PROJECT_TOKEN: z
    .string({ required_error: "REPLBRIDGE_PROJECT_TOKEN is required" })
    .min(8, "REPLBRIDGE_PROJECT_TOKEN must be at least 8 characters"),
});

const configResult = ConfigSchema.safeParse(process.env);
if (!configResult.success) {
  const issues = configResult.error.issues.map((i) => `  • ${i.message}`).join("\n");
  process.stderr.write(`\n[ReplBridge] Configuration error:\n${issues}\n\n`);
  process.exit(1);
}

const config = configResult.data;
const agent = new AgentClient({
  agentUrl: config.REPLBRIDGE_AGENT_URL,
  projectToken: config.REPLBRIDGE_PROJECT_TOKEN,
});

// ─── Tool input schemas ────────────────────────────────────────────────────────

const ListFilesInput = z.object({
  path: z
    .string()
    .default(".")
    .describe("Directory path relative to the workspace root. Defaults to workspace root."),
  depth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(2)
    .describe("How many directory levels deep to recurse. Max 5."),
});

const ReadFileInput = z.object({
  path: z.string().describe("File path relative to the workspace root."),
});

const WriteFileInput = z.object({
  path: z.string().describe("File path relative to the workspace root."),
  content: z.string().describe("Complete new content to write to the file."),
});

const SoftDeleteFileInput = z.object({
  path: z
    .string()
    .describe(
      "File path relative to the workspace root. The file is moved to .replbridge/trash — NOT permanently deleted."
    ),
});

const RunCommandInput = z.object({
  command: z
    .string()
    .describe(
      "The exact command to run. Must be on the Workspace Agent's allowlist. " +
        "Use list_allowed_commands first to see what is permitted."
    ),
});

// ─── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "workspace_status",
    description:
      "Get the current status of the Replit workspace: working directory, Node version, " +
      "detected project stack (Node/Python/Static HTML), whether git is initialized, and the current branch. " +
      "Use this first when connecting to a new workspace or when you need to understand the project type.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_files",
    description:
      "List files and folders in the Replit workspace. Sensitive paths (like .env, node_modules, .git) " +
      "are automatically hidden. Use this to understand the project structure before reading or editing files.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Directory path to list. Defaults to workspace root.",
          default: ".",
        },
        depth: {
          type: "number",
          description: "Recursion depth (1-5). Defaults to 2.",
          default: 2,
        },
      },
      required: [],
    },
  },
  {
    name: "read_file",
    description:
      "Read the contents of a file in the Replit workspace. " +
      "Sensitive files (.env, secrets, etc.) are blocked. Files larger than 500KB are rejected.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path relative to workspace root." },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file in the Replit workspace. " +
      "If the file already exists, a timestamped snapshot is automatically saved to .replbridge/snapshots/ before overwriting. " +
      "This is the safe way to edit code — you can always recover the previous version from snapshots.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path relative to workspace root." },
        content: { type: "string", description: "Complete new file content." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "soft_delete_file",
    description:
      "Safely remove a file from the Replit workspace by moving it to .replbridge/trash. " +
      "The file is NOT permanently deleted and can be recovered. " +
      "Use this instead of asking to 'delete' a file — permanent deletion is not allowed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path relative to workspace root." },
      },
      required: ["path"],
    },
  },
  {
    name: "list_allowed_commands",
    description:
      "Get the list of commands that are permitted to run in the workspace. " +
      "Always check this before calling run_command to avoid errors.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "run_command",
    description:
      "Run a command in the Replit workspace. Only allowlisted commands are permitted — " +
      "use list_allowed_commands first to see what is allowed. " +
      "Returns stdout, stderr, exit code, and duration. " +
      "Good for: npm install, npm run build, npm run test, git status, python -m pytest.",
    inputSchema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The exact command to run (must be on the allowlist).",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "git_status",
    description:
      "Get the git status of the Replit workspace — which files have been modified, staged, or are untracked. " +
      "Use this to understand what has changed before committing or to verify your edits landed.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "git_diff",
    description:
      "Get the git diff of the Replit workspace — shows the actual line-by-line changes not yet staged. " +
      "Use this to review what you have changed before deciding to commit or revert.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
] as const;

// ─── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "replbridge",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── List tools handler ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// ─── Call tool handler ─────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── workspace_status ─────────────────────────────────────────────────
      case "workspace_status": {
        const response = await agent.status();
        return { content: [{ type: "text", text: formatAgentResponse(response) }] };
      }

      // ── list_files ───────────────────────────────────────────────────────
      case "list_files": {
        const input = ListFilesInput.parse(args ?? {});
        const response = await agent.listFiles(input.path, input.depth);
        return { content: [{ type: "text", text: formatAgentResponse(response) }] };
      }

      // ── read_file ────────────────────────────────────────────────────────
      case "read_file": {
        const input = ReadFileInput.parse(args);
        const response = await agent.readFile(input.path);
        return { content: [{ type: "text", text: formatAgentResponse(response) }] };
      }

      // ── write_file ───────────────────────────────────────────────────────
      case "write_file": {
        const input = WriteFileInput.parse(args);
        const response = await agent.writeFile(input.path, input.content);
        return { content: [{ type: "text", text: formatAgentResponse(response) }] };
      }

      // ── soft_delete_file ─────────────────────────────────────────────────
      case "soft_delete_file": {
        const input = SoftDeleteFileInput.parse(args);
        const response = await agent.softDeleteFile(input.path);
        return { content: [{ type: "text", text: formatAgentResponse(response) }] };
      }

      // ── list_allowed_commands ─────────────────────────────────────────────
      case "list_allowed_commands": {
        const response = await agent.listAllowedCommands();
        return { content: [{ type: "text", text: formatAgentResponse(response) }] };
      }

      // ── run_command ───────────────────────────────────────────────────────
      case "run_command": {
        const input = RunCommandInput.parse(args);
        const response = await agent.runCommand(input.command);
        return { content: [{ type: "text", text: formatAgentResponse(response) }] };
      }

      // ── git_status ────────────────────────────────────────────────────────
      case "git_status": {
        const response = await agent.gitStatus();
        return { content: [{ type: "text", text: formatAgentResponse(response) }] };
      }

      // ── git_diff ──────────────────────────────────────────────────────────
      case "git_diff": {
        const response = await agent.gitDiff();
        return { content: [{ type: "text", text: formatAgentResponse(response) }] };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}. Available tools: ${TOOLS.map((t) => t.name).join(", ")}`,
            },
          ],
          isError: true,
        };
    }
  } catch (err) {
    // Handle Zod validation errors cleanly
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return {
        content: [{ type: "text", text: `Invalid input for tool "${name}": ${issues}` }],
        isError: true,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Unexpected error in tool "${name}": ${message}` }],
      isError: true,
    };
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[ReplBridge] MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[ReplBridge] Fatal error: ${err}\n`);
  process.exit(1);
});
