/**
 * ReplBridge uninstall command
 *
 * Removes the .replbridge/ directory and cleans up .gitignore.
 * Does NOT delete snapshots or trash — those belong to the user.
 */

import fs from "fs";
import path from "path";
import prompts from "prompts";

const CWD = process.cwd();

export async function runUninstall(): Promise<void> {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  ReplBridge — uninstall");
  console.log("════════════════════════════════════════════════════════════\n");

  const configPath = path.join(CWD, ".replbridge", "config.json");

  if (!fs.existsSync(configPath)) {
    console.log("  ReplBridge is not initialized in this directory.\n");
    return;
  }

  console.log("  This will remove:\n");
  console.log("  • .replbridge/config.json");
  console.log("  • ReplBridge entries from .gitignore\n");
  console.log("  This will NOT remove:\n");
  console.log("  • .replbridge/snapshots/  (your file backups)");
  console.log("  • .replbridge/trash/      (your soft-deleted files)\n");

  const { confirmed } = await prompts({
    type: "confirm",
    name: "confirmed",
    message: "Uninstall ReplBridge?",
    initial: false,
  });

  if (!confirmed) {
    console.log("\n  Aborted.\n");
    return;
  }

  // Remove config
  fs.rmSync(configPath);
  console.log("\n  ✓ Removed .replbridge/config.json");

  // Clean .gitignore
  const gitignorePath = path.join(CWD, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    const cleaned = content
      .split("\n")
      .filter(
        (line) =>
          !line.includes(".replbridge/snapshots") &&
          !line.includes(".replbridge/trash") &&
          !line.includes(".replbridge/*.local.json") &&
          line !== "# ReplBridge"
      )
      .join("\n");
    fs.writeFileSync(gitignorePath, cleaned, "utf8");
    console.log("  ✓ Cleaned .gitignore");
  }

  console.log("\n  Done. Snapshots and trash are preserved in .replbridge/\n");
}
