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
}

export interface AgentResponse<T = unknown> {
    ok: boolean;
    data?: T;
    error?: {
      code: string;
      message: string;
    };
}

/** Default request timeout in milliseconds (overridable via REPLBRIDGE_TIMEOUT_MS). */
const DEFAULT_TIMEOUT_MS = 30_000;
const TIMEOUT_MS = (() => {
    const raw = process.env.REPLBRIDGE_TIMEOUT_MS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
})();

export class AgentClient {
    private baseUrl: string;
    private headers: Record<string, string>;

  constructor(config: AgentConfig) {
        this.baseUrl = config.agentUrl.replace(/\/$/, "");
        this.headers = {
                Authorization: `Bearer ${config.projectToken}`,
                "Content-Type": "application/json",
        };
  }

  private async request<T>(
        method: "GET" | "POST",
        path: string,
        body?: unknown
      ): Promise<AgentResponse<T>> {
        const url = `${this.baseUrl}${path}`;

      // Abort the request if the agent doesn't respond within TIMEOUT_MS.
      // Without this, Claude Desktop hangs indefinitely when the agent is unreachable.
      const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
              const res = await fetch(url, {
                        method,
                        headers: this.headers,
                        signal: controller.signal,
                        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
              });

          const json = (await res.json()) as AgentResponse<T>;
              return json;
      } catch (err) {
              const isAbort =
                        (err instanceof Error && err.name === "AbortError") ||
                        (err as { code?: string })?.code === "ABORT_ERR";
              const message =
                        err instanceof Error ? err.message : String(err);
              return {
                        ok: false,
                        error: {
                                    code: isAbort ? "AGENT_TIMEOUT" : "AGENT_UNREACHABLE",
                                    message: isAbort
                                      ? `Workspace Agent at ${this.baseUrl} did not respond within ${TIMEOUT_MS}ms.`
                                                  : `Could not reach the Workspace Agent at ${this.baseUrl}: ${message}`,
                        },
              };
      } finally {
              clearTimeout(timer);
      }
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
        return this.request("POST", "/files/read", { path });
  }

  async writeFile(path: string, contents: string) {
        return this.request("POST", "/files/write", { path, contents });
  }

  async softDeleteFile(path: string) {
        return this.request("POST", "/files/delete-soft", { path });
  }

  // ─── Commands ───────────────────────────────────────────────────────────────

  async listAllowedCommands() {
        return this.request("GET", "/commands/allowed");
  }

  async runCommand(command: string) {
        return this.request("POST", "/commands/run", { command });
  }

  // ─── Git ────────────────────────────────────────────────────────────────────

  async gitStatus() {
        return this.request("GET", "/git/status");
  }

  async gitDiff() {
        return this.request("GET", "/git/diff");
  }
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
