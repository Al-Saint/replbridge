import fs from "fs";
import path from "path";

export type ProjectStack =
  | "node"
  | "python"
  | "static-html"
  | "unknown";

export interface StackInfo {
  stack: ProjectStack;
  details: string;
}

/**
 * Detect the project stack by checking for well-known indicator files.
 * Checks in priority order: Node → Python → Static HTML → Unknown.
 */
export function detectStack(workspaceRoot: string): StackInfo {
  const has = (file: string) =>
    fs.existsSync(path.join(workspaceRoot, file));

  if (has("package.json")) {
    return { stack: "node", details: "Found package.json" };
  }

  if (has("requirements.txt")) {
    return { stack: "python", details: "Found requirements.txt" };
  }

  if (has("pyproject.toml")) {
    return { stack: "python", details: "Found pyproject.toml" };
  }

  if (has("index.html")) {
    return { stack: "static-html", details: "Found index.html" };
  }

  return { stack: "unknown", details: "No known stack indicator found" };
}
