import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Loads and validates MCP server configuration.
 *
 * Claude Desktop launches MCP servers with an unpredictable working directory,
 * so besides ./.env we also look for a .env next to this package
 * (packages/mcp-server/.env). Values already in the environment — e.g. the
 * "env" block in claude_desktop_config.json — always win.
 *
 * Teaching note: we use Node's built-in process.loadEnvFile rather than
 * dotenv. Recent dotenv versions print a banner to stdout, and on a stdio MCP
 * server stdout is the protocol channel — any stray output corrupts it.
 */

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const candidate of [path.resolve(process.cwd(), ".env"), path.join(PACKAGE_DIR, ".env")]) {
  if (fs.existsSync(candidate)) {
    try {
      process.loadEnvFile(candidate);
    } catch (err) {
      process.stderr.write(`[ReplBridge] Warning: could not load ${candidate}: ${err}\n`);
    }
  }
}

const positiveInt = (fallback: number) => z.coerce.number().int().positive().optional().default(fallback);

const ConfigSchema = z.object({
  REPLBRIDGE_AGENT_URL: z.url({
    protocol: /^https?$/,
    error: (issue) =>
      issue.input === undefined
        ? "REPLBRIDGE_AGENT_URL is required"
        : "REPLBRIDGE_AGENT_URL must be a valid http(s) URL",
  }),
  REPLBRIDGE_PROJECT_TOKEN: z
    .string({ error: "REPLBRIDGE_PROJECT_TOKEN is required" })
    .trim()
    .min(16, "REPLBRIDGE_PROJECT_TOKEN must be at least 16 characters"),
  REPLBRIDGE_TIMEOUT_MS: positiveInt(30_000),
  REPLBRIDGE_COMMAND_TIMEOUT_MS: positiveInt(150_000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  • ${i.message}`).join("\n");
    process.stderr.write(
      `\n[ReplBridge] Configuration error:\n${issues}\n\n` +
        `Set these in the "env" block of your MCP client config, or in ${path.join(PACKAGE_DIR, ".env")}.\n\n`
    );
    process.exit(1);
  }
  return result.data;
}

export const PACKAGE_VERSION: string = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_DIR, "package.json"), "utf8")
).version;
