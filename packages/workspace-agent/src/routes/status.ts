import { Router } from "express";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { ok } from "../utils/respond.js";
import { detectStack } from "../utils/stackDetect.js";

export const statusRouter = Router();

const WORKSPACE_ROOT = process.env.REPLBRIDGE_WORKSPACE_ROOT || process.cwd();

statusRouter.get("/status", (req, res) => {
  const stackInfo = detectStack(WORKSPACE_ROOT);

  // Check git initialization
  let gitInitialized = false;
  let gitBranch: string | null = null;

  try {
    execSync("git rev-parse --git-dir", {
      cwd: WORKSPACE_ROOT,
      stdio: "ignore",
    });
    gitInitialized = true;

    try {
      gitBranch = execSync("git branch --show-current", {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      }).trim();
    } catch {
      gitBranch = null;
    }
  } catch {
    gitInitialized = false;
  }

  // Check package.json
  const packageJsonPath = path.join(WORKSPACE_ROOT, "package.json");
  const hasPackageJson = fs.existsSync(packageJsonPath);

  ok(res, {
    workspaceRoot: WORKSPACE_ROOT,
    nodeVersion: process.version,
    stack: stackInfo.stack,
    stackDetails: stackInfo.details,
    hasPackageJson,
    gitInitialized,
    gitBranch,
  });
});
