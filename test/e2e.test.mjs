/**
 * End-to-end tests for ReplBridge.
 *
 * Starts the real (built) Workspace Agent against a temporary workspace, then
 * connects the real (built) MCP server over stdio using the official MCP
 * client — exactly the path Claude Desktop / Claude Code take.
 *
 * Run with: npm test   (builds first)
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_JS = path.join(ROOT, "packages/workspace-agent/dist/index.js");
const MCP_JS = path.join(ROOT, "packages/mcp-server/dist/index.js");
const TOKEN = "test-token-0123456789abcdef";

let workspace;
let outside;
let agentProc;
let agentUrl;
let client;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitForHealth(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`agent did not become healthy at ${url}`);
}

async function connectMcp(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_JS],
    env: { PATH: process.env.PATH, ...env },
    stderr: "pipe",
  });
  const c = new Client({ name: "replbridge-e2e", version: "0.0.0" });
  await c.connect(transport);
  return c;
}

async function call(name, args = {}, c = client) {
  const res = await c.callTool({ name, arguments: args });
  return {
    isError: res.isError === true,
    text: res.content.map((p) => p.text).join("\n"),
  };
}

const json = (r) => JSON.parse(r.text);

before(async () => {
  workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "replbridge-ws-")));
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "replbridge-outside-")));
  fs.writeFileSync(path.join(outside, "secret.txt"), "top secret\n");

  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify(
      {
        name: "demo",
        private: true,
        scripts: {
          test: "node -e \"console.log('tests-ok')\"",
          lint: "node -e \"console.log('TOKEN=' + process.env.REPLBRIDGE_PROJECT_TOKEN)\"",
          build: 'node -e "process.exit(3)"',
          dev: 'node -e "setInterval(() => {}, 1000)"',
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(workspace, "hello.txt"), "hello\n");
  fs.writeFileSync(path.join(workspace, ".env"), "SECRET=1\n");
  fs.mkdirSync(path.join(workspace, "src"));
  fs.writeFileSync(path.join(workspace, "src", "app.js"), "console.log('app');\n");
  fs.mkdirSync(path.join(workspace, "node_modules"));
  fs.symlinkSync(outside, path.join(workspace, "escape"));

  const git = (...args) => execFileSync("git", args, { cwd: workspace, stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");

  const port = await freePort();
  agentUrl = `http://127.0.0.1:${port}`;
  agentProc = spawn(process.execPath, [AGENT_JS], {
    cwd: workspace,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PORT: String(port),
      HOST: "127.0.0.1",
      REPLBRIDGE_PROJECT_TOKEN: TOKEN,
      REPLBRIDGE_WORKSPACE_ROOT: workspace,
      REPLBRIDGE_COMMAND_TIMEOUT_MS: "3000",
      REPLBRIDGE_EXTRA_COMMANDS: "node --version",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForHealth(agentUrl);

  client = await connectMcp({
    REPLBRIDGE_AGENT_URL: agentUrl,
    REPLBRIDGE_PROJECT_TOKEN: TOKEN,
  });
});

after(async () => {
  await client?.close();
  agentProc?.kill();
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

// ─── Discovery ────────────────────────────────────────────────────────────────

test("exposes all tools with input schemas", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "edit_file",
    "git_diff",
    "git_status",
    "list_allowed_commands",
    "list_files",
    "list_snapshots",
    "read_file",
    "restore_snapshot",
    "run_command",
    "search_files",
    "soft_delete_file",
    "workspace_status",
    "write_file",
  ]);
  const write = tools.find((t) => t.name === "write_file");
  assert.deepEqual(write.inputSchema.required.sort(), ["content", "path"]);
  assert.equal(tools.find((t) => t.name === "read_file").annotations.readOnlyHint, true);
});

// ─── Status & listing ─────────────────────────────────────────────────────────

test("workspace_status reports stack and git", async () => {
  const r = await call("workspace_status");
  assert.equal(r.isError, false, r.text);
  const data = json(r);
  assert.equal(data.stack, "node");
  assert.equal(data.gitInitialized, true);
  assert.equal(data.workspaceRoot, workspace);
});

test("list_files hides sensitive paths", async () => {
  const r = await call("list_files", { depth: 3 });
  assert.equal(r.isError, false, r.text);
  const { entries } = json(r);
  assert.ok(entries.includes("hello.txt"));
  assert.ok(entries.includes("src/"));
  assert.ok(entries.includes(path.join("src", "app.js")));
  for (const hidden of [".env", ".git/", "node_modules/"]) {
    assert.ok(!entries.includes(hidden), `${hidden} should be hidden`);
  }
});

// ─── Read / write / delete ────────────────────────────────────────────────────

test("read_file returns raw contents", async () => {
  const r = await call("read_file", { path: "hello.txt" });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.text, "hello\n");
});

test("write_file creates new files (and parent dirs)", async () => {
  const r = await call("write_file", {
    path: "new/dir/file.txt",
    content: "fresh",
  });
  assert.equal(r.isError, false, r.text);
  assert.equal(json(r).created, true);
  assert.equal(fs.readFileSync(path.join(workspace, "new/dir/file.txt"), "utf8"), "fresh");
});

test("write_file snapshots the previous version before overwriting", async () => {
  const r = await call("write_file", {
    path: "hello.txt",
    content: "updated\n",
  });
  assert.equal(r.isError, false, r.text);
  const data = json(r);
  assert.equal(data.created, false);
  assert.match(data.snapshot, /^\.replbridge\/snapshots\/hello\.txt__/);
  assert.equal(fs.readFileSync(path.join(workspace, data.snapshot), "utf8"), "hello\n");
  assert.equal(fs.readFileSync(path.join(workspace, "hello.txt"), "utf8"), "updated\n");
});

test("soft_delete_file moves the file to trash", async () => {
  fs.writeFileSync(path.join(workspace, "doomed.txt"), "bye");
  const r = await call("soft_delete_file", { path: "doomed.txt" });
  assert.equal(r.isError, false, r.text);
  const { trashPath } = json(r);
  assert.ok(!fs.existsSync(path.join(workspace, "doomed.txt")));
  assert.equal(fs.readFileSync(path.join(workspace, trashPath), "utf8"), "bye");
});

test("missing files return FILE_NOT_FOUND as an error", async () => {
  const r = await call("read_file", { path: "nope.txt" });
  assert.equal(r.isError, true);
  assert.match(r.text, /FILE_NOT_FOUND/);
});

// ─── Edit / search / snapshots ────────────────────────────────────────────────

test("edit_file replaces a unique match and snapshots first", async () => {
  fs.writeFileSync(path.join(workspace, "edit.js"), "const a = 1;\nconst b = 2;\n");
  const r = await call("edit_file", {
    path: "edit.js",
    old_text: "const b = 2;",
    new_text: "const b = 3;",
  });
  assert.equal(r.isError, false, r.text);
  assert.equal(json(r).replacements, 1);
  assert.equal(fs.readFileSync(path.join(workspace, "edit.js"), "utf8"), "const a = 1;\nconst b = 3;\n");
  assert.equal(
    fs.readFileSync(path.join(workspace, json(r).snapshot), "utf8"),
    "const a = 1;\nconst b = 2;\n"
  );
});

test("edit_file refuses missing or ambiguous matches", async () => {
  fs.writeFileSync(path.join(workspace, "dup.txt"), "x\nx\n");
  const missing = await call("edit_file", {
    path: "dup.txt",
    old_text: "nope",
    new_text: "y",
  });
  assert.equal(missing.isError, true);
  assert.match(missing.text, /TEXT_NOT_FOUND/);

  const ambiguous = await call("edit_file", {
    path: "dup.txt",
    old_text: "x",
    new_text: "y",
  });
  assert.equal(ambiguous.isError, true);
  assert.match(ambiguous.text, /AMBIGUOUS_MATCH/);
  assert.equal(fs.readFileSync(path.join(workspace, "dup.txt"), "utf8"), "x\nx\n");

  const all = await call("edit_file", {
    path: "dup.txt",
    old_text: "x",
    new_text: "$&y",
    replace_all: true,
  });
  assert.equal(all.isError, false, all.text);
  assert.equal(json(all).replacements, 2);
  assert.equal(fs.readFileSync(path.join(workspace, "dup.txt"), "utf8"), "$&y\n$&y\n");
});

test("edit_file respects the blocklist", async () => {
  const r = await call("edit_file", {
    path: ".env",
    old_text: "SECRET",
    new_text: "X",
  });
  assert.equal(r.isError, true);
  assert.match(r.text, /BLOCKED_PATH/);
});

test("search_files finds matches and skips hidden paths", async () => {
  fs.writeFileSync(path.join(workspace, "node_modules", "lib.js"), "needle\n");
  fs.writeFileSync(path.join(workspace, "src", "find.js"), "// a Needle here\n");
  const r = await call("search_files", { query: "needle" });
  assert.equal(r.isError, false, r.text);
  assert.match(r.text, /src\/find\.js:1: \/\/ a Needle here/);
  assert.ok(!r.text.includes("node_modules"), "node_modules must be skipped");
  assert.ok(!r.text.includes("SECRET"), ".env must be skipped");

  const cs = await call("search_files", {
    query: "needle",
    case_sensitive: true,
    path: "src",
  });
  assert.match(cs.text, /^0 matches/);

  const re = await call("search_files", { query: "N[e]+dle", regex: true });
  assert.match(re.text, /find\.js/);

  const bad = await call("search_files", { query: "(", regex: true });
  assert.equal(bad.isError, true);
});

test("list_snapshots and restore_snapshot undo a change", async () => {
  fs.writeFileSync(path.join(workspace, "undo.txt"), "v1\n");
  await call("write_file", { path: "undo.txt", content: "v2\n" });
  await call("write_file", { path: "undo.txt", content: "v3\n" });

  const list = await call("list_snapshots", { path: "undo.txt" });
  assert.equal(list.isError, false, list.text);
  const { snapshots } = json(list);
  assert.equal(snapshots.length, 2);
  const oldest = snapshots[snapshots.length - 1].snapshot;
  assert.equal(fs.readFileSync(path.join(workspace, ".replbridge/snapshots", oldest), "utf8"), "v1\n");

  const restore = await call("restore_snapshot", {
    path: "undo.txt",
    snapshot: oldest,
  });
  assert.equal(restore.isError, false, restore.text);
  assert.equal(fs.readFileSync(path.join(workspace, "undo.txt"), "utf8"), "v1\n");
  // The version we replaced (v3) was itself snapshotted.
  const backup = json(restore).previousVersionSnapshot;
  assert.equal(fs.readFileSync(path.join(workspace, backup), "utf8"), "v3\n");

  const all = json(await call("list_snapshots"));
  assert.ok(all.snapshots.length >= 3);
});

test("restore_snapshot rejects bad ids and mismatched files", async () => {
  const traversal = await call("restore_snapshot", {
    path: "undo.txt",
    snapshot: "../../.env",
  });
  assert.equal(traversal.isError, true);
  assert.match(traversal.text, /SNAPSHOT_NOT_FOUND/);

  const snap = json(await call("list_snapshots", { path: "undo.txt" })).snapshots[0].snapshot;
  const mismatch = await call("restore_snapshot", {
    path: "hello.txt",
    snapshot: snap,
  });
  assert.equal(mismatch.isError, true);
  assert.match(mismatch.text, /SNAPSHOT_MISMATCH/);
});

// ─── Security boundaries ──────────────────────────────────────────────────────

test("blocks .env and other sensitive files", async () => {
  for (const p of [".env", ".env.local", ".git/config", "node_modules/x", ".replbridge/snapshots"]) {
    const r = await call("read_file", { path: p });
    assert.equal(r.isError, true, `${p} should be blocked`);
    assert.match(r.text, /BLOCKED_PATH/, p);
  }
  const w = await call("write_file", { path: ".env", content: "PWNED=1" });
  assert.equal(w.isError, true);
  assert.equal(fs.readFileSync(path.join(workspace, ".env"), "utf8"), "SECRET=1\n");
});

test("blocks path traversal", async () => {
  for (const p of ["../outside.txt", "/etc/passwd", "src/../../x"]) {
    const r = await call("read_file", { path: p });
    assert.equal(r.isError, true, p);
    assert.match(r.text, /PATH_TRAVERSAL/, p);
  }
});

test("blocks symlink escapes on read, write, list and delete", async () => {
  const read = await call("read_file", { path: "escape/secret.txt" });
  assert.equal(read.isError, true);
  assert.match(read.text, /PATH_TRAVERSAL/);

  const write = await call("write_file", {
    path: "escape/planted.txt",
    content: "x",
  });
  assert.equal(write.isError, true);
  assert.ok(!fs.existsSync(path.join(outside, "planted.txt")));

  const list = await call("list_files", { path: "escape" });
  assert.equal(list.isError, true);

  const del = await call("soft_delete_file", { path: "escape/secret.txt" });
  assert.equal(del.isError, true);
  assert.ok(fs.existsSync(path.join(outside, "secret.txt")));
});

// ─── Commands ─────────────────────────────────────────────────────────────────

test("list_allowed_commands includes builtins and REPLBRIDGE_EXTRA_COMMANDS", async () => {
  const { commands } = json(await call("list_allowed_commands"));
  assert.ok(commands.includes("npm test"));
  assert.ok(commands.includes("node --version"));
});

test("run_command runs allowlisted commands", async () => {
  const r = await call("run_command", { command: "npm test" });
  assert.equal(r.isError, false, r.text);
  const data = json(r);
  assert.equal(data.exitCode, 0);
  assert.match(data.stdout, /tests-ok/);
});

test("run_command rejects commands not on the allowlist", async () => {
  for (const command of ["rm -rf /", "npm test; rm -rf /", "git push", "bash -c ls"]) {
    const r = await call("run_command", { command });
    assert.equal(r.isError, true, command);
    assert.match(r.text, /COMMAND_NOT_ALLOWED/, command);
  }
});

test("run_command flags non-zero exit codes as errors", async () => {
  const r = await call("run_command", { command: "npm run build" });
  assert.equal(r.isError, true);
  assert.notEqual(json(r).exitCode, 0);
});

test("run_command never exposes the project token to commands", async () => {
  const r = await call("run_command", { command: "npm run lint" });
  assert.match(json(r).stdout, /TOKEN=undefined/);
  assert.ok(!r.text.includes(TOKEN));
});

test("run_command kills long-running commands at the timeout", async () => {
  const started = Date.now();
  const r = await call("run_command", { command: "npm run dev" });
  const data = json(r);
  assert.equal(data.timedOut, true);
  assert.ok(Date.now() - started < 10_000, "should return shortly after the 3s timeout");
});

// ─── Git ──────────────────────────────────────────────────────────────────────

test("git_status and git_diff reflect edits", async () => {
  const status = await call("git_status");
  assert.equal(status.isError, false, status.text);
  assert.match(json(status).stdout, /hello\.txt/);

  const diff = await call("git_diff");
  assert.equal(diff.isError, false, diff.text);
  assert.match(json(diff).stdout, /\+updated/);

  const staged = await call("git_diff", { staged: true });
  assert.equal(json(staged).stdout, "");
});

// ─── Error handling ───────────────────────────────────────────────────────────

test("wrong token yields UNAUTHORIZED", async () => {
  const bad = await connectMcp({
    REPLBRIDGE_AGENT_URL: agentUrl,
    REPLBRIDGE_PROJECT_TOKEN: "wrong-token-0123456789",
  });
  try {
    const r = await call("workspace_status", {}, bad);
    assert.equal(r.isError, true);
    assert.match(r.text, /UNAUTHORIZED/);
  } finally {
    await bad.close();
  }
});

test("unreachable agent yields AGENT_UNREACHABLE", async () => {
  const port = await freePort(); // nothing listening here
  const c = await connectMcp({
    REPLBRIDGE_AGENT_URL: `http://127.0.0.1:${port}`,
    REPLBRIDGE_PROJECT_TOKEN: TOKEN,
  });
  try {
    const r = await call("workspace_status", {}, c);
    assert.equal(r.isError, true);
    assert.match(r.text, /AGENT_UNREACHABLE/);
  } finally {
    await c.close();
  }
});

test("HTML responses (e.g. a sleeping Repl) yield AGENT_BAD_RESPONSE", async () => {
  const html = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<!DOCTYPE html><html><body>Waking up your Repl...</body></html>");
  });
  await new Promise((r) => html.listen(0, "127.0.0.1", r));
  const c = await connectMcp({
    REPLBRIDGE_AGENT_URL: `http://127.0.0.1:${html.address().port}`,
    REPLBRIDGE_PROJECT_TOKEN: TOKEN,
  });
  try {
    const r = await call("workspace_status", {}, c);
    assert.equal(r.isError, true);
    assert.match(r.text, /AGENT_BAD_RESPONSE/);
    assert.match(r.text, /HTML page/);
  } finally {
    await c.close();
    html.close();
  }
});

test("MCP server exits with a clear message when misconfigured", () => {
  const result = (() => {
    try {
      execFileSync(process.execPath, [MCP_JS], {
        env: { PATH: process.env.PATH },
        cwd: os.tmpdir(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      return null;
    } catch (err) {
      return err;
    }
  })();
  assert.ok(result, "should exit non-zero");
  assert.match(result.stderr.toString(), /REPLBRIDGE_AGENT_URL is required/);
  assert.match(result.stderr.toString(), /REPLBRIDGE_PROJECT_TOKEN is required/);
});
