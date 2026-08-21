import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOW_DIR = "workflows";
export const WORKFLOW_ENTRY = "WORKFLOW.md";
export const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function workflowPath(name, root = packageRoot) {
  return join(root, WORKFLOW_DIR, name, WORKFLOW_ENTRY);
}

export function stripWorkflowFrontmatter(source) {
  return String(source).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

export function workflowBody(name, root = packageRoot) {
  const file = workflowPath(name, root);
  if (!existsSync(file)) throw new Error(`missing workflow: ${name}`);
  return stripWorkflowFrontmatter(readFileSync(file, "utf8"));
}
