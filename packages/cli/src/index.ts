#!/usr/bin/env node
/**
 * ReplBridge CLI
 *
 * Usage:
 *   npx @replbridge/init           — initialize ReplBridge in this project
 *   npx @replbridge/init doctor    — check your setup
 *   npx @replbridge/init uninstall — remove ReplBridge from this project
 */

import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runUninstall } from "./commands/uninstall.js";

const command = process.argv[2] ?? "init";

const commands: Record<string, () => Promise<void>> = {
  init: runInit,
  doctor: runDoctor,
  uninstall: runUninstall,
};

const handler = commands[command];

if (!handler) {
  console.error(`\nUnknown command: ${command}`);
  console.error(`Available commands: ${Object.keys(commands).join(", ")}\n`);
  process.exit(1);
}

handler().catch((err) => {
  console.error("\n[ReplBridge] Fatal error:", err.message);
  process.exit(1);
});
