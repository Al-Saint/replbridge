/**
 * ReplBridge Agent Client
 *
 * Thin HTTP wrapper around the Workspace Agent REST API.
 * All requests are authenticated with the project token.
 * The token is never logged or returned to callers.
 */

export interface AgentConfig {
  agentUrl: string;
  projectToken: string;
  /** Timeout for normal requests (ms). */
  timeoutMs: number;
  /** Timeout for run_command, which can legitimately take minutes (ms). */
  commandTimeoutMs: number;
}

export interface AgentResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export class AgentClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeoutMs: number;
  private commandTimeoutMs: number;

  constructor(config: AgentConfig) {
    this.baseUrl = config.agentUrl.replace(/\/+$/, "");
    this.headers = {
      Authorization: `Bearer ${config.projectToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    this.timeoutMs = config.timeoutMs;
    this.commandTimeoutMs = config.commandTimeoutMs;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    timeoutMs = this.timeoutMs
  ): Promise<AgentResponse<T>> {
    const url = `${this.baseUrl}${path}`;

    let res: Response;
    try {
      // Abort if the agent doesn't respond in time. Without this, Claude
      // hangs indefinitely when the agent is unreachable.
      res = await fetch(url, {
        method,
        headers: this.headers,
        signal: AbortSignal.timeout(timeoutMs),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        return failure(
          "AGENT_TIMEOUT",
          `Workspace Agent at ${this.baseUrl} did not respond within ${timeoutMs}ms.`
        );
      }
      const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
      const detail = cause?.code ?? cause?.message ?? (err as Error)?.message ?? String(err);
      return failure(
        "AGENT_UNREACHABLE",
        `Could not reach the Workspace Agent at ${this.baseUrl} (${detail}). ` +
          `Is the agent running, and is REPLBRIDGE_AGENT_URL correct?`
      );
    }

    const text = await res.text();
    try {
      const json = JSON.parse(text) as AgentResponse<T>;
      if (typeof json === "object" && json !== null && typeof json.ok === "boolean") {
        return json;
      }
    } catch {
      /* fall through */
    }

    // Not a ReplBridge response — usually Replit's "waking up" / 404 HTML page,
    // or REPLBRIDGE_AGENT_URL pointing at the wrong server.
    const looksLikeHtml = /^\s*</.test(text);
    return failure(
      "AGENT_BAD_RESPONSE",
      `Got HTTP ${res.status} from ${url} but it was not a ReplBridge JSON response` +
        (looksLikeHtml
          ? " (received an HTML page — the Repl may be asleep/starting, or the URL points at the wrong app)."
          : ".") +
        ` First bytes: ${JSON.stringify(text.slice(0, 120))}`
    );
  }

  // ─── Health ─────────────────────────────────────────────────────────────────

  async health() {
    return this.request("GET", "/health");
  }

  // ─── Workspace status ───────────────────────────────────────────────────────

  async status() {
    return this.request("GET", "/status");
  }

  // ─── Files ──────────────────────────────────────────────────────────────────

  async listFiles(path: string, depth?: number) {
    return this.request("POST", "/files/list", { path, depth });
  }

  async readFile(path: string) {
    return this.request<{ path: string; content: string }>("POST", "/files/read", { path });
  }

  async writeFile(path: string, content: string) {
    return this.request("POST", "/files/write", { path, content });
  }

  async editFile(path: string, oldText: string, newText: string, replaceAll: boolean) {
    return this.request("POST", "/files/edit", {
      path,
      oldText,
      newText,
      replaceAll,
    });
  }

  async searchFiles(opts: {
    query: string;
    path: string;
    regex: boolean;
    caseSensitive: boolean;
    maxResults: number;
  }) {
    return this.request<{
      matches: { file: string; line: number; text: string }[];
      filesSearched: number;
      truncated: boolean;
    }>("POST", "/files/search", opts);
  }

  async softDeleteFile(path: string) {
    return this.request("POST", "/files/delete-soft", { path });
  }

  // ─── Snapshots ──────────────────────────────────────────────────────────────

  async listSnapshots(path?: string, limit?: number) {
    return this.request("POST", "/snapshots/list", { path, limit });
  }

  async restoreSnapshot(path: string, snapshot: string) {
    return this.request("POST", "/snapshots/restore", { path, snapshot });
  }

  // ─── Commands ───────────────────────────────────────────────────────────────

  async listAllowedCommands() {
    return this.request("GET", "/commands/allowed");
  }

  async runCommand(command: string) {
    return this.request("POST", "/commands/run", { command }, this.commandTimeoutMs);
  }

  // ─── Git ────────────────────────────────────────────────────────────────────

  async gitStatus() {
    return this.request("GET", "/git/status");
  }

  async gitDiff(staged = false) {
    return this.request("GET", staged ? "/git/diff?staged=true" : "/git/diff");
  }
}

function failure(code: string, message: string): AgentResponse<never> {
  return { ok: false, error: { code, message } };
}

/**
 * Format an agent response as a human-readable string for Claude.
 * On success, pretty-prints the data.
 * On failure, returns a clear error message.
 */
export function formatAgentResponse(response: AgentResponse): string {
  if (response.ok) {
    return JSON.stringify(response.data, null, 2);
  }
  return `Error [${response.error?.code ?? "UNKNOWN"}]: ${response.error?.message ?? "Unknown error"}`;
}
