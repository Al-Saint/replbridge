// Must be first: loads .env and validates configuration before anything else.
import { HOST, PORT, WORKSPACE_ROOT, AGENT_DIR } from "./config.js";

import express, { Request, Response, NextFunction } from "express";
import { requireAuth } from "./middleware/auth.js";
import { statusRouter } from "./routes/status.js";
import { filesRouter } from "./routes/files.js";
import { commandsRouter } from "./routes/commands.js";
import { gitRouter } from "./routes/git.js";

const app = express();

// ─── Hardening ──────────────────────────────────────────────────────────────
// Don't advertise Express in responses (minor information-disclosure hardening).
app.disable("x-powered-by");

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));

// Request logging (dev-friendly, no secrets logged)
app.use((req, _res, next) => {
  if (req.path !== "/health") {
    process.stdout.write(`[${new Date().toISOString()}] ${req.method} ${req.path}\n`);
  }
  next();
});

// ─── Public routes ──────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    data: {
      service: "replbridge-workspace-agent",
      status: "healthy",
    },
  });
});

// ─── Protected routes ───────────────────────────────────────────────────────
// Teaching note: requireAuth runs BEFORE the route handler on every request
// below this line. It checks the Bearer token and calls next() only if valid.
app.use(requireAuth);
app.use(statusRouter);
app.use(filesRouter);
app.use(commandsRouter);
app.use(gitRouter);

// ─── 404 handler ────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: { code: "NOT_FOUND", message: "Route not found." },
  });
});

// ─── Global error handler ───────────────────────────────────────────────────
// Catches any thrown/rejected error from route handlers (Express 5 forwards
// async rejections here too) so the process never crashes and clients always
// get the standard { ok:false, error:{ code, message } } shape.
app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  // Malformed JSON / oversized bodies from express.json()
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ ok: false, error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ ok: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds 2MB." } });
    return;
  }

  process.stderr.write(`[ReplBridge] Unhandled error: ${err?.stack ?? err}\n`);
  res.status(500).json({
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: err?.message || "Internal server error",
    },
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
  const agentInsideRoot = AGENT_DIR.startsWith(WORKSPACE_ROOT + "/");
  process.stdout.write(
    `\n[ReplBridge Workspace Agent] Listening on http://${HOST}:${PORT}\n` +
      `  Workspace root: ${WORKSPACE_ROOT}\n` +
      `  Token auth:     enabled\n` +
      (agentInsideRoot
        ? `  Agent folder:   ${AGENT_DIR} (blocked from Claude)\n`
        : AGENT_DIR === WORKSPACE_ROOT
          ? `  WARNING: the agent is installed AT the workspace root, so Claude can edit\n` +
            `           the agent's own code. Install it in a subfolder instead (see README).\n`
          : "") +
      "\n"
  );
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    process.stderr.write(`[ReplBridge] FATAL: port ${PORT} is already in use. Set PORT to a free port.\n`);
  } else {
    process.stderr.write(`[ReplBridge] FATAL: ${err.message}\n`);
  }
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
