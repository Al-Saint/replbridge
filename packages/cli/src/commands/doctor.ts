/**
 * ReplBridge doctor command
 *
 * Checks every piece of the setup and reports what's working and what isn't.
 * Teaching note: a "doctor" command is standard in developer tools (Homebrew,
 * Flutter, etc.) because setup problems are the #1 support issue. Automate
 * the diagnosis so users can fix themselves without filing issues.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const CWD = process.cwd();
// packages/cli/dist/commands → packages/
const PACKAGES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MCP_DIR = path.join(PACKAGES_DIR, "mcp-server");

/** Parse KEY=value lines from a .env file (no dependency needed). */
function readEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

async function getJson(url: string, token?: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: null };
  }
}

type CheckStatus = "ok" | "warn" | "fail";

interface Check {
  label: string;
  status: CheckStatus;
  detail?: string;
}

function check(label: string, status: CheckStatus, detail?: string): Check {
  return { label, status, detail };
}

function icon(status: CheckStatus): string {
  return status === "ok" ? "✓" : status === "warn" ? "⚠" : "✗";
}

export async function runDoctor(): Promise<void> {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  ReplBridge — doctor");
  console.log("════════════════════════════════════════════════════════════\n");

  const checks: Check[] = [];

  // ── .replbridge/config.json ───────────────────────────────────────────────
  const configPath = path.join(CWD, ".replbridge", "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      checks.push(
        check("ReplBridge initialized", "ok", `Stack: ${config.stack ?? "unknown"}`)
      );
    } catch {
      checks.push(check("ReplBridge initialized", "fail", ".replbridge/config.json is malformed"));
    }
  } else {
    checks.push(
      check("ReplBridge initialized", "warn", "No .replbridge/config.json here (optional — run `replbridge init` to create one)")
    );
  }

  // ── .env / token ──────────────────────────────────────────────────────────
  const envPath = path.join(CWD, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    if (envContent.includes("REPLBRIDGE_PROJECT_TOKEN=")) {
      const match = envContent.match(/REPLBRIDGE_PROJECT_TOKEN=(.+)/);
      const val = match?.[1]?.trim() ?? "";
      if (val && val !== "replace-with-a-secure-random-token") {
        checks.push(check("Project token set", "ok", "Found in .env"));
      } else {
        checks.push(
          check("Project token set", "fail", "REPLBRIDGE_PROJECT_TOKEN is not set in .env")
        );
      }
    } else {
      checks.push(
        check("Project token set", "warn", "REPLBRIDGE_PROJECT_TOKEN not found in .env")
      );
    }
  } else {
    checks.push(
      check("Project token set", "warn", "No .env file found — token must be set in environment")
    );
  }

  // ── MCP server build ──────────────────────────────────────────────────────
  const mcpDist = path.join(MCP_DIR, "dist", "index.js");
  if (fs.existsSync(mcpDist)) {
    checks.push(check("MCP server built", "ok", mcpDist));
  } else if (fs.existsSync(MCP_DIR)) {
    checks.push(check("MCP server built", "fail", "Run: npm run build (from the repo root)"));
  }

  // ── Live connection to the Workspace Agent ────────────────────────────────
  // Uses the same config the MCP server would: process env first, then
  // packages/mcp-server/.env.
  const mcpEnv = { ...readEnvFile(path.join(MCP_DIR, ".env")), ...process.env };
  const agentUrl = mcpEnv.REPLBRIDGE_AGENT_URL?.replace(/\/+$/, "");
  const token = mcpEnv.REPLBRIDGE_PROJECT_TOKEN;
  if (!agentUrl || agentUrl.includes("your-replit-project-url")) {
    checks.push(
      check("Workspace Agent reachable", "warn", "REPLBRIDGE_AGENT_URL not set — skipping live check")
    );
  } else {
    try {
      const health = await getJson(`${agentUrl}/health`);
      if (health.body?.ok !== true) {
        checks.push(
          check(
            "Workspace Agent reachable",
            "fail",
            `${agentUrl}/health returned HTTP ${health.status} but not a ReplBridge response — is the Repl running and the URL right?`
          )
        );
      } else {
        checks.push(check("Workspace Agent reachable", "ok", agentUrl));
        if (!token) {
          checks.push(check("Token accepted", "warn", "REPLBRIDGE_PROJECT_TOKEN not set — skipping auth check"));
        } else {
          const status = await getJson(`${agentUrl}/status`, token);
          if (status.body?.ok === true) {
            checks.push(
              check("Token accepted", "ok", `workspace ${status.body.data.workspaceRoot} (${status.body.data.stack})`)
            );
          } else {
            checks.push(
              check("Token accepted", "fail", status.body?.error?.message ?? `HTTP ${status.status}`)
            );
          }
        }
      }
    } catch (err) {
      checks.push(
        check("Workspace Agent reachable", "fail", `${agentUrl}: ${(err as Error).message}`)
      );
    }
  }

  // ── .gitignore ────────────────────────────────────────────────────────────
  const gitignorePath = path.join(CWD, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    if (content.includes(".env") && content.includes(".replbridge/snapshots")) {
      checks.push(check(".gitignore configured", "ok"));
    } else {
      checks.push(
        check(".gitignore configured", "warn", ".env or .replbridge/snapshots not excluded")
      );
    }
  } else {
    checks.push(check(".gitignore configured", "warn", "No .gitignore found"));
  }

  // ── Node version ──────────────────────────────────────────────────────────
  const [major, minor] = process.version.slice(1).split(".").map(Number);
  if (major > 20 || (major === 20 && minor >= 12)) {
    checks.push(check(`Node.js ${process.version}`, "ok", "≥20.12 required"));
  } else {
    checks.push(
      check(`Node.js ${process.version}`, "fail", "ReplBridge requires Node.js ≥20.12")
    );
  }

  // ── Print results ─────────────────────────────────────────────────────────
  for (const c of checks) {
    const prefix = `  ${icon(c.status)}  ${c.label}`;
    const detail = c.detail ? `  — ${c.detail}` : "";
    console.log(prefix + detail);
  }

  const failures = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;

  console.log(
    `\n  ${checks.length - failures - warnings} passed · ${warnings} warnings · ${failures} failures\n`
  );

  if (failures === 0 && warnings === 0) {
    console.log("  Everything looks good. Claude is ready to use ReplBridge.\n");
  } else if (failures === 0) {
    console.log("  No failures. Review the warnings above if something isn't working.\n");
  } else if (failures > 0) {
    console.log("  Fix the failures above before connecting Claude Desktop.\n");
    process.exit(1);
  }
}
