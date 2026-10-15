#!/usr/bin/env node
/**
 * ReplBridge CLI
 *
 * Usage (from a clone of this repo: `node packages/cli/dist/index.js <command>`):
 *   replbridge init       — initialize ReplBridge in this project
 *   replbridge doctor     — check your setup, including a live agent connection
 *   replbridge uninstall  — remove ReplBridge from this project
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
