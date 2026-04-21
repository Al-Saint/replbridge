import { Router, Request, Response } from "express";
import { ok, fail } from "../utils/respond.js";
import { runCommand } from "../utils/shell.js";

export const gitRouter = Router();

const WORKSPACE_ROOT = process.env.REPLBRIDGE_WORKSPACE_ROOT || process.cwd();

// ─── GET /git/status ──────────────────────────────────────────────────────────

gitRouter.get("/git/status", async (_req: Request, res: Response) => {
  const result = await runCommand("git status", WORKSPACE_ROOT);

  if (result.exitCode !== 0 && result.stderr.includes("not a git repository")) {
    fail(res, "NOT_A_GIT_REPO", "This workspace is not a git repository.", 400);
    return;
  }

  ok(res, {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  });
});

// ─── GET /git/diff ────────────────────────────────────────────────────────────

gitRouter.get("/git/diff", async (_req: Request, res: Response) => {
  const result = await runCommand("git diff", WORKSPACE_ROOT);

  if (result.exitCode !== 0 && result.stderr.includes("not a git repository")) {
    fail(res, "NOT_A_GIT_REPO", "This workspace is not a git repository.", 400);
    return;
  }

  ok(res, {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  });
});
