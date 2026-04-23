import dotenv from "dotenv";
dotenv.config();
import express, { Request, Response, NextFunction } from "express";
import { requireAuth } from "./middleware/auth.js";
import { statusRouter } from "./routes/status.js";
import { filesRouter } from "./routes/files.js";
import { commandsRouter } from "./routes/commands.js";
import { gitRouter } from "./routes/git.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// ─── Hardening ────────────────────────────────────────────────────────────────
// Don't advertise Express in responses (minor information-disclosure hardening).
app.disable("x-powered-by");

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json({ limit: "2mb" }));

// Request logging (dev-friendly, no secrets logged)
app.use((req, _res, next) => {
    const safe = req.path !== "/health";
    if (safe) {
          process.stdout.write(`[${new Date().toISOString()}] ${req.method} ${req.path}\n`);
    }
    next();
});

// ─── Public routes ────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
    res.json({
          ok: true,
          data: {
                  service: "replbridge-workspace-agent",
                  status: "healthy",
          },
    });
});

// ─── Protected routes ─────────────────────────────────────────────────────────
// Teaching note: requireAuth runs BEFORE the route handler on every request
// below this line. It checks the Bearer token and calls next() only if valid.

app.use(requireAuth);
app.use(statusRouter);
app.use(filesRouter);
app.use(commandsRouter);
app.use(gitRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
    res.status(404).json({
          ok: false,
          error: { code: "NOT_FOUND", message: "Route not found." },
    });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// Catches any thrown/next(err) from route handlers so the process never crashes
// and clients always get the standard { ok:false, error:{ code, message } } shape.

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    process.stderr.write(
          `[ReplBridge] Unhandled error: ${err?.message ?? err}\n`
        );
    res.status(500).json({
          ok: false,
          error: {
                  code: "INTERNAL_ERROR",
                  message: err?.message || "Internal server error",
          },
    });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    const root = process.env.REPLBRIDGE_WORKSPACE_ROOT ?? process.cwd();
    process.stdout.write(
          `\n[ReplBridge Workspace Agent] Running on port ${PORT}\n` +
          `  Workspace root: ${root}\n` +
          `  Token auth: enabled\n\n`
        );
});
