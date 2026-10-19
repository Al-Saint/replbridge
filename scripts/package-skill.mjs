#!/usr/bin/env node
/**
 * Packages skills/replbridge into a zip ready to upload to a SKILL.md
 * marketplace (e.g. Agensi) or to copy into ~/.claude/skills/.
 *
 * Usage: npm run package:skill   → dist/replbridge-skill.zip
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(root, "skills");
const skillFile = path.join(skillDir, "replbridge", "SKILL.md");
const outDir = path.join(root, "dist");
const outFile = path.join(outDir, "replbridge-skill.zip");

// Validate the frontmatter marketplaces require.
const text = fs.readFileSync(skillFile, "utf8");
const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
if (!fm || !/^name:\s*\S+/m.test(fm[1]) || !/^description:\s*\S+/m.test(fm[1])) {
  console.error("SKILL.md is missing frontmatter with `name` and `description`.");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(outFile, { force: true });
execFileSync("zip", ["-r", "-X", outFile, "replbridge"], { cwd: skillDir, stdio: "inherit" });
console.log(`\nCreated ${path.relative(root, outFile)}`);
