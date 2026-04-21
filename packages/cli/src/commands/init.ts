/**
 * ReplBridge init command
 *
 * What this does, step by step:
 * 1. Confirms we're in a project folder
 * 2. Detects the project stack
 * 3. Generates a secure random token
 * 4. Creates .replbridge/config.json
 * 5. Writes/updates .env.example
 * 6. Prints setup instructions for Replit + Claude Desktop
 *
 * Teaching note: We generate the token here (not in Replit) because the
 * developer needs to know it before they paste it into both places. We print
 * it ONCE clearly and then never again.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import prompts from "prompts";

const CWD = process.cwd();
const REPLBRIDGE_DIR = path.join(CWD, ".replbridge");
const CONFIG_PATH = path.join(REPLBRIDGE_DIR, "config.json");

type Stack = "node" | "python" | "static-html" | "unknown";

function detectStack(): Stack {
  if (fs.existsSync(path.join(CWD, "package.json"))) return "node";
  if (
    fs.existsSync(path.join(CWD, "requirements.txt")) ||
    fs.existsSync(path.join(CWD, "pyproject.toml"))
  )
    return "python";
  if (fs.existsSync(path.join(CWD, "index.html"))) return "static-html";
  return "unknown";
}

function generateToken(): string {
  return "rb_" + crypto.randomBytes(24).toString("hex");
}

function line(char = "─", len = 60): string {
  return char.repeat(len);
}

export async function runInit(): Promise<void> {
  console.log("\n" + line("═"));
  console.log("  ReplBridge — init");
  console.log(line("═") + "\n");

  // ── Already initialized? ──────────────────────────────────────────────────
  if (fs.existsSync(CONFIG_PATH)) {
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: "ReplBridge is already initialized here. Re-initialize?",
      initial: false,
    });
    if (!overwrite) {
      console.log("\nAborted. Your existing config is unchanged.\n");
      return;
    }
  }

  // ── Detect stack ──────────────────────────────────────────────────────────
  const stack = detectStack();
  const stackLabel: Record<Stack, string> = {
    node: "Node.js",
    python: "Python",
    "static-html": "Static HTML",
    unknown: "Unknown",
  };

  console.log(`  Detected stack: ${stackLabel[stack]}`);
  console.log(`  Working directory: ${CWD}\n`);

  const { confirmed } = await prompts({
    type: "confirm",
    name: "confirmed",
    message: "Initialize ReplBridge here?",
    initial: true,
  });

  if (!confirmed) {
    console.log("\nAborted.\n");
    return;
  }

  // ── Generate token ────────────────────────────────────────────────────────
  const token = generateToken();

  // ── Write .replbridge/config.json ─────────────────────────────────────────
  fs.mkdirSync(REPLBRIDGE_DIR, { recursive: true });

  const config = {
    version: "0.1.0",
    stack,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");

  // ── Write .env.example ────────────────────────────────────────────────────
  const envExamplePath = path.join(CWD, ".env.example");
  const envContent =
    `# ReplBridge — added by npx @replbridge/init\n` +
    `REPLBRIDGE_PROJECT_TOKEN=\${REPLBRIDGE_PROJECT_TOKEN}\n` +
    `REPLBRIDGE_WORKSPACE_ROOT=/home/runner/workspace\n`;

  const existingEnvExample = fs.existsSync(envExamplePath)
    ? fs.readFileSync(envExamplePath, "utf8")
    : "";

  if (!existingEnvExample.includes("REPLBRIDGE_PROJECT_TOKEN")) {
    fs.writeFileSync(
      envExamplePath,
      existingEnvExample ? existingEnvExample + "\n" + envContent : envContent,
      "utf8"
    );
  }

  // ── Update .gitignore ─────────────────────────────────────────────────────
  const gitignorePath = path.join(CWD, ".gitignore");
  const gitignoreAdditions =
    "\n# ReplBridge\n.replbridge/snapshots/\n.replbridge/trash/\n.replbridge/*.local.json\n.env\n";

  const existingGitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";

  if (!existingGitignore.includes(".replbridge/snapshots/")) {
    fs.appendFileSync(gitignorePath, gitignoreAdditions, "utf8");
  }

  // ── Print results ─────────────────────────────────────────────────────────
  console.log("\n" + line("─"));
  console.log("  ✓ Created  .replbridge/config.json");
  console.log("  ✓ Updated  .env.example");
  console.log("  ✓ Updated  .gitignore");
  console.log(line("─") + "\n");

  console.log("  Your project token (copy this — you will need it in two places):\n");
  console.log(`  ${token}\n`);
  console.log("  " + line("─", 58) + "\n");

  console.log("  STEP 1 — Add this to Replit Secrets\n");
  console.log(`  Key:    REPLBRIDGE_PROJECT_TOKEN`);
  console.log(`  Value:  ${token}`);
  console.log(`\n  Also add:`);
  console.log(`  Key:    REPLBRIDGE_WORKSPACE_ROOT`);
  console.log(`  Value:  /home/runner/workspace\n`);

  console.log("  " + line("─", 58) + "\n");
  console.log("  STEP 2 — Deploy the Workspace Agent to that Replit project\n");
  console.log("  Copy packages/workspace-agent/ into your Replit project.");
  console.log("  Run:  npm install && npm run dev\n");
  console.log("  Your agent URL will be:");
  console.log("  https://<project-name>.<username>.replit.app\n");

  console.log("  " + line("─", 58) + "\n");
  console.log("  STEP 3 — Connect Claude Desktop\n");
  console.log("  Edit ~/Library/Application Support/Claude/claude_desktop_config.json");
  console.log("  (Windows: %APPDATA%\\Claude\\claude_desktop_config.json)\n");
  console.log("  Add this block inside \"mcpServers\":\n");

  const desktopConfig = {
    replbridge: {
      command: "node",
      args: [path.join(CWD, "packages/mcp-server/dist/index.js")],
      env: {
        REPLBRIDGE_AGENT_URL: "https://YOUR-AGENT-URL.replit.app",
        REPLBRIDGE_PROJECT_TOKEN: token,
      },
    },
  };

  console.log(JSON.stringify(desktopConfig, null, 2)
    .split("\n")
    .map((l) => "  " + l)
    .join("\n"));

  console.log("\n  Then: build the MCP server with:");
  console.log("  cd packages/mcp-server && npm install && npm run build\n");
  console.log("  And restart Claude Desktop.\n");

  console.log(line("═") + "\n");
}
