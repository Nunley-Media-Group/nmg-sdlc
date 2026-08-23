import { readFileSync } from "node:fs";
import { join } from "node:path";

import { packageRoot, workflowBody } from "./sdlc-workflows.mjs";

export { packageRoot, workflowBody } from "./sdlc-workflows.mjs";

export const INTERACTIVE_COMMANDS = [
  ["sdlc-draft-issue", "draft-issue", "Draft a groomed GitHub issue"],
  ["sdlc-write-spec", "write-spec", "Write an approved spec for an issue"],
  ["sdlc-onboard-project", "onboard-project", "Initialize or reconcile a project"],
  ["sdlc-upgrade-project", "upgrade-project", "Propose contract and layout upgrades"],
  ["sdlc-run-retro", "run-retro", "Update steering retrospective from defect specs"],
];

export const AUTOMATED_COMMANDS = [
  ["sdlc-execute", "execute", "Run automated SDLC delivery"],
  ["sdlc-status", "status", "Report read-only SDLC status"],
  ["sdlc-verify-code", "verify-code", "Verify implementation against the approved spec"],
  ["sdlc-open-pr", "open-pr", "Deliver verified work through exact-head PR merge"],
];

const INTERACTIVE_BY_COMMAND = new Map(INTERACTIVE_COMMANDS.map(([name, skill]) => [name, skill]));

const INTERACTIVE_SLASH_RE = new RegExp(
  `^/(${INTERACTIVE_COMMANDS.map(([name]) => name).join("|")})(?:\\s+([\\s\\S]*))?$`,
);


export function withArguments(body, args) {
  const trimmed = typeof args === "string" ? args.trim() : "";
  return trimmed ? `${body}\n\n$ARGUMENTS: ${trimmed}` : body;
}

export function sessionModeFromEntries(entries) {
  let mode = "none";
  for (const entry of entries ?? []) {
    if (entry && entry.type === "mode_change" && typeof entry.mode === "string") {
      mode = entry.mode;
    }
  }
  return mode;
}

export function parseInteractiveSlash(text) {
  const source = typeof text === "string" ? text.trim() : "";
  const match = INTERACTIVE_SLASH_RE.exec(source);
  if (!match) return null;
  return { command: match[1], skill: INTERACTIVE_BY_COMMAND.get(match[1]), args: match[2] ?? "" };
}

/**
 * TUI `input` rewrite: turn `/sdlc-write-spec #N` into builtin `/plan` plus
 * the workflow body so InteractiveMode.handlePlanModeCommand runs.
 * When the session is already in plan mode, emit only the workflow so `/plan`
 * does not toggle off.
 */
export function rewriteInteractiveInput(text, { source, sessionMode, root } = {}) {
  if (source !== "interactive") return undefined;
  const parsed = parseInteractiveSlash(text);
  if (!parsed) return undefined;
  const body = withArguments(workflowBody(parsed.skill, root), parsed.args);
  if (sessionMode === "plan") return { text: body };
  return { text: `/plan\n\n${body}` };
}

export function isInteractiveHeadless(ctx) {
  return ctx?.hasUI !== true;
}

export function interactiveHeadlessMessage(commandName) {
  return `Run /${commandName} in the TUI.\n`;
}

export function renderAutomatedCommandMarkdown(name, skill, description, root = packageRoot) {
  let body = workflowBody(skill, root).replace(/\s*$/, "\n");
  if (skill === "execute") {
    const selection = readFileSync(
      join(root, "workflows", "execute", "references", "selection.md"),
      "utf8",
    ).replace(/\s*$/, "\n");
    body = `${body}\n${selection}`;
  }
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`;
}
