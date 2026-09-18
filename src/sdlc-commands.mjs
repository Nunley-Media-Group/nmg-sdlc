import { join } from "node:path";
import {
  defaultPromptRegistry,
  renderPrompt,
  writePromptProvenance,
} from "./sdlc-prompt-snippets.mjs";
import { packageRoot } from "./sdlc-workflows.mjs";
import {
  materializeAvailableControllerPaths,
  materializeControllerPaths,
} from "../scripts/plugin-controller-path.mjs";

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

function writeSpecMergeCommand(command, root) {
  const helper = JSON.stringify(join(root, "scripts", "publish-approved-spec.mjs"));
  const prefix = `node ${helper} merge --issue `;
  if (typeof command !== "string" || !command.startsWith(prefix)) return null;
  const match = /^([1-9]\d*) --dir specs\/([1-9]\d*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(
    command.slice(prefix.length),
  );
  if (!match) return null;
  const issue = Number(match[1]);
  if (!Number.isSafeInteger(issue) || issue !== Number(match[2])) return null;
  return { issue };
}

function soleJsonObject(content) {
  if (!Array.isArray(content)) return null;
  const objects = [];
  for (const part of content) {
    if (!part || part.type !== "text" || typeof part.text !== "string") continue;
    for (const line of part.text.split(/\r?\n/)) {
      const candidate = line.trim();
      if (!candidate.startsWith("{")) continue;
      let value;
      try {
        value = JSON.parse(candidate);
      } catch {
        return null;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      objects.push(value);
    }
  }
  return objects.length === 1 ? objects[0] : null;
}

export function writeSpecPlanReentry(event, root = packageRoot) {
  if (
    !event
    || event.type !== "tool_result"
    || event.toolName !== "bash"
    || typeof event.toolCallId !== "string"
    || event.toolCallId.length === 0
  ) {
    return null;
  }
  const command = writeSpecMergeCommand(event.input?.command, root);
  if (!command) return null;
  const result = soleJsonObject(event.content);
  if (
    result?.merged !== true
    || !Number.isSafeInteger(result.pr)
    || result.pr <= 0
  ) {
    return null;
  }
  const { issue } = command;
  const prompt = [
    "/plan",
    "",
    `Continue the active /sdlc-write-spec session after publication of issue #${issue} in PR #${result.pr}.`,
    `Append ${issue} to published[] exactly once, then run the documented Continue loop.`,
    "If another issue is selected, perform only read-only discovery and preference interview before writing its distinct complete four-file local://spec-{N}-plan.md with the current published[] and publication rules, then call xd://propose.",
    "Do not run default-branch or perform branch, file, commit, push, pull-request, label, or merge mutation for that issue before its distinct proposal is approved.",
  ].join("\n");
  return { issue, pr: result.pr, prompt };
}


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
      const content = materializeAvailableControllerPaths(message.content, root);
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
      const text = materializeAvailableControllerPaths(part.text, root);
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
