/**
 * @replbridge/shared
 *
 * Canonical types shared across the ReplBridge monorepo.
 * Teaching note: defining the response shape here means both the agent
 * (which produces it) and the MCP server (which consumes it) can't drift
 * out of sync — they both import from the same source of truth.
 */

export interface ReplBridgeSuccess<T> {
  ok: true;
  data: T;
}

export interface ReplBridgeError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ReplBridgeResponse<T> = ReplBridgeSuccess<T> | ReplBridgeError;

// ─── Agent response shapes ────────────────────────────────────────────────────

export interface WorkspaceStatus {
  workspaceRoot: string;
  nodeVersion: string;
  stack: "node" | "python" | "static-html" | "unknown";
  stackDetails: string;
  hasPackageJson: boolean;
  gitInitialized: boolean;
  gitBranch: string | null;
}

export interface FileList {
  path: string;
  entries: string[];
}

export interface FileContent {
  path: string;
  content: string;
}

export interface FileWrite {
  path: string;
  created: boolean;
  snapshot: string | null;
}

export interface FileSoftDelete {
  originalPath: string;
  trashPath: string;
}

export interface AllowedCommands {
  commands: string[];
}

export interface CommandResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}
