import {
  defaultPromptRegistry,
  renderPrompt,
  writePromptProvenance,
} from "./sdlc-prompt-snippets.mjs";
import { packageRoot } from "./sdlc-workflows.mjs";
import { materializeControllerPaths } from "../scripts/plugin-controller-path.mjs";

export { packageRoot, workflowBody } from "./sdlc-workflows.mjs";
export { materializeControllerPaths } from "../scripts/plugin-controller-path.mjs";

export const INTERACTIVE_COMMANDS = [
  ["sdlc-draft-issue", "draft-issue", "Draft a groomed GitHub issue"],
  ["sdlc-write-spec", "write-spec", "Write an approved spec for an issue"],
  ["sdlc-onboard-project", "onboard-project", "Initialize or reconcile a project"],
  ["sdlc-upgrade-project", "upgrade-project", "Propose contract and layout upgrades"],
  ["sdlc-steering", "steering", "Manage steering runtime and deterministic validations"],
  ["sdlc-run-retro", "run-retro", "Update steering retrospective from defect specs"],
];

export const AUTOMATED_COMMANDS = [
  ["sdlc-execute", "execute", "Run automated SDLC delivery"],
  ["sdlc-status", "status", "Report read-only SDLC status"],
  ["sdlc-verify-code", "verify-code", "Verify implementation against the approved spec"],
  ["sdlc-open-pr", "open-pr", "Deliver verified work through exact-head PR merge"],
];

const INTERACTIVE_BY_COMMAND = new Map(INTERACTIVE_COMMANDS.map(([name, skill]) => [name, skill]));
const REPAIR_COMMANDS = new Set(["sdlc-onboard-project", "sdlc-upgrade-project", "sdlc-steering"]);

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
export function rewriteInteractiveInput(text, {
  source,
  sessionMode,
  headless,
  root,
  provenanceRoot,
} = {}) {
  if (source !== "interactive" || headless === true) return undefined;
  const parsed = parseInteractiveSlash(text);
  if (!parsed) return undefined;
  const projectRoot = provenanceRoot === undefined ? process.cwd() : provenanceRoot;
  const { text: prompt, provenance } = renderPrompt(
    defaultPromptRegistry(root ?? packageRoot, {
      projectRoot,
      pluginOnly: REPAIR_COMMANDS.has(parsed.command),
    }),
    { consumer: parsed.command, vars: {} },
  );
  const body = withArguments(
    materializeControllerPaths(prompt, root ?? packageRoot),
    parsed.args,
  );
  const destination = provenanceRoot === undefined ? process.cwd() : provenanceRoot;
  if (typeof destination === "string" && destination.length > 0) {
    writePromptProvenance(destination, provenance);
  }
  if (sessionMode === "plan") return { text: body };
  return { text: `/plan\n\n${body}` };
}

export function materializeRuntimeMessages(messages, root = packageRoot) {
  if (!Array.isArray(messages)) return messages;
  let changed = false;
  const materialized = messages.map((message) => {
    if (!message || typeof message !== "object") return message;
    if (typeof message.content === "string") {
      const content = materializeControllerPaths(message.content, root);
      if (content === message.content) return message;
      changed = true;
      return { ...message, content };
    }
    if (!Array.isArray(message.content)) return message;
    let contentChanged = false;
    const content = message.content.map((part) => {
      if (!part || typeof part !== "object" || part.type !== "text" || typeof part.text !== "string") {
        return part;
      }
      const text = materializeControllerPaths(part.text, root);
      if (text === part.text) return part;
      contentChanged = true;
      return { ...part, text };
    });
    if (!contentChanged) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? materialized : messages;
}

export function isInteractiveHeadless(ctx, argv = process.argv) {
  const modeIndex = argv.indexOf("--mode");
  return ctx?.hasUI !== true
    || argv.includes("--print")
    || (modeIndex >= 0 && argv[modeIndex + 1] === "rpc");
}

export function interactiveHeadlessMessage(commandName) {
  return `Run /${commandName} in the TUI.\n`;
}

export function renderAutomatedCommandMarkdown(name, skill, description, root = packageRoot) {
  const { text } = renderPrompt(defaultPromptRegistry(root), { consumer: name, vars: {} });
  const body = text.replace(/\s*$/, "\n");
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`;
}
