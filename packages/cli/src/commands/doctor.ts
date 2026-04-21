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

const CWD = process.cwd();

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
      check("ReplBridge initialized", "fail", "Run: npx @replbridge/init")
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
  const mcpDist = path.join(CWD, "packages", "mcp-server", "dist", "index.js");
  if (fs.existsSync(mcpDist)) {
    checks.push(check("MCP server built", "ok", `dist/index.js exists`));
  } else {
    checks.push(
      check("MCP server built", "fail", "Run: cd packages/mcp-server && npm run build")
    );
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
  const nodeVersion = parseInt(process.version.slice(1).split(".")[0], 10);
  if (nodeVersion >= 18) {
    checks.push(check(`Node.js ${process.version}`, "ok", "≥18 required"));
  } else {
    checks.push(
      check(`Node.js ${process.version}`, "fail", "ReplBridge requires Node.js ≥18")
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
  } else if (failures > 0) {
    console.log("  Fix the failures above before connecting Claude Desktop.\n");
    process.exit(1);
  }
}
