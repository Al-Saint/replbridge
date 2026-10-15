import { Router, Request, Response } from "express";
import { WORKSPACE_ROOT } from "../config.js";
import { ok, fail } from "../utils/respond.js";
import { runCommand } from "../utils/shell.js";

export const gitRouter = Router();

async function gitRoute(res: Response, command: string): Promise<void> {
  const result = await runCommand(command, WORKSPACE_ROOT, 30_000);

  if (result.exitCode !== 0 && result.stderr.includes("not a git repository")) {
    fail(res, "NOT_A_GIT_REPO", "This workspace is not a git repository.", 400);
    return;
  }

  ok(res, {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    truncated: result.truncated,
  });
}

// ─── GET /git/status ──────────────────────────────────────────────────────────

gitRouter.get("/git/status", (_req: Request, res: Response) => gitRoute(res, "git status"));

// ─── GET /git/diff ────────────────────────────────────────────────────────────
// ?staged=true shows staged changes instead of unstaged ones.

gitRouter.get("/git/diff", (req: Request, res: Response) =>
  gitRoute(res, req.query.staged === "true" ? "git diff --staged" : "git diff")
);
