// Host-neutral command and tool-event classification shared by the Claude Code
// hooks module (hooks/register.ts) and the Node runtime. No Node imports: the
// hooks module runs in Claude Code's plugin environment, which has no Node.

export const INTERACTIVE_COMMANDS = [
  ["sdlc-draft-issue", "draft-issue", "Draft a groomed GitHub issue"],
  ["sdlc-write-spec", "write-spec", "Write an approved spec for an issue"],
  ["sdlc-onboard-project", "onboard-project", "Initialize or reconcile a project"],
  ["sdlc-upgrade-project", "upgrade-project", "Propose contract and layout upgrades"],
  ["sdlc-steering", "steering", "Manage steering runtime and deterministic validations"],
  ["sdlc-run-retro", "run-retro", "Update steering retrospective from defect specs"],
  ["sdlc-execute", "execute", "Run automated SDLC delivery"],
];

// Interactive commands whose workflow runs outside plan mode: execute mutates
// through its controller, which plan mode would block.
export const DIRECT_COMMANDS = Object.freeze(["sdlc-execute"]);

export const AUTOMATED_COMMANDS = [
  ["sdlc-status", "status", "Report read-only SDLC status"],
  ["sdlc-verify-code", "verify-code", "Verify implementation against the approved spec"],
  ["sdlc-open-pr", "open-pr", "Deliver verified work through exact-head PR merge"],
  ["sdlc-verify-full", "verify-full", "Run full-tier validations against a named ref"],
];

// The Claude Code model alias each nmg-sdlc command runs on, except `/sdlc-execute`,
// which supervises on the session's own Opus or Fable model. Execute stage and
// repair workers take their models from the project's stage configuration.
// The aliases always resolve to the current model of their tier.
export const SDLC_MODELS = Object.freeze({
  commands: Object.freeze({
    "sdlc-status": "haiku",
    "sdlc-open-pr": "haiku",
    "sdlc-verify-full": "haiku",
    "sdlc-verify-code": "opus",
    "sdlc-draft-issue": "opus",
    "sdlc-write-spec": "opus",
    "sdlc-onboard-project": "opus",
    "sdlc-upgrade-project": "opus",
    "sdlc-steering": "opus",
    "sdlc-run-retro": "opus",
  }),
});

// The Claude Code effort level for the command files that set one (command-file
// frontmatter). A command absent here keeps Claude Code's default effort. Execute
// stage and repair efforts come from the project's stage configuration.
export const SDLC_EFFORTS = Object.freeze({
  commands: Object.freeze({ "sdlc-open-pr": "xhigh" }),
});

export const WRITE_SPEC_FINISHED_LABELS = Object.freeze([
  "Finished — stop writing specs",
  "Finished — stop without writing a spec",
]);

export const PLAN_ENABLED_TEXT = "Enabled plan mode";

const INTERACTIVE_BY_COMMAND = new Map(INTERACTIVE_COMMANDS.map(([name, skill]) => [name, skill]));

const INTERACTIVE_SLASH_RE = new RegExp(
  `^/(${INTERACTIVE_COMMANDS.map(([name]) => name).join("|")})(?:\\s+([\\s\\S]*))?$`,
);

const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9._-]+\.mjs$/;

function joinRoot(root, ...parts) {
  return [String(root).replace(/[\\/]+$/, ""), ...parts].join("/");
}

export function isInteractiveCommand(name) {
  return INTERACTIVE_BY_COMMAND.has(name);
}

export function parseInteractiveSlash(text) {
  const source = typeof text === "string" ? text.trim() : "";
  const match = INTERACTIVE_SLASH_RE.exec(source);
  if (!match) return null;
  return { command: match[1], skill: INTERACTIVE_BY_COMMAND.get(match[1]), args: match[2] ?? "" };
}

export function withArguments(body, args) {
  const trimmed = typeof args === "string" ? args.trim() : "";
  return trimmed ? `${body}\n\n$ARGUMENTS: ${trimmed}` : body;
}

export function interactiveHeadlessMessage(commandName) {
  return `Run /${commandName} in the TUI.\n`;
}

/**
 * Null when `model` (the session model id, as `/model` shows it) can supervise
 * `/sdlc-execute`: an Opus or Fable model. Otherwise the refusal to print; an
 * unreadable model is `unknown` and refused.
 */
export function executeModelRefusal(model) {
  const current = typeof model === "string" && model.trim() ? model.trim() : "unknown";
  if (/opus|fable/i.test(current)) return null;
  return `/sdlc-execute requires an Opus session (current: ${current}). Switch with /model opus and run /sdlc-execute again.`;
}

const WRITE_SPEC_MERGE_RE = /publish-approved-spec\.mjs["']?\s+merge\s[^\n]*?--issue\s+["']?([1-9]\d*)/;
const WRITE_SPEC_DIR_RE = /^specs\/([1-9]\d*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

const isPositiveSafeInteger = (value) => Number.isSafeInteger(value) && value > 0;

/**
 * The `--issue` number of a write-spec merge command, or null. Root spelling,
 * quoting, chaining, and surrounding text do not matter: the helper's result
 * decides whether the publication happened.
 */
export function writeSpecMergeIssue(command) {
  const match = typeof command === "string" ? WRITE_SPEC_MERGE_RE.exec(command) : null;
  if (!match) return null;
  const issue = Number(match[1]);
  return isPositiveSafeInteger(issue) ? issue : null;
}

/** The single JSON object line in `text`, or null when there is none or several. */
export function soleJsonObject(text) {
  if (typeof text !== "string") return null;
  const objects = [];
  for (const line of text.split(/\r?\n/)) {
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
  return objects.length === 1 ? objects[0] : null;
}

/**
 * `{ issue, slug, pr }` when `text` holds a sole JSON object reporting
 * `merged: true` with a positive `pr` and `issue`, and a `dir` whose leading
 * number is that issue; otherwise null.
 */
export function writeSpecMergeResult(text) {
  const result = soleJsonObject(text);
  if (result?.merged !== true || !isPositiveSafeInteger(result.pr) || !isPositiveSafeInteger(result.issue)) return null;
  const match = typeof result.dir === "string" ? WRITE_SPEC_DIR_RE.exec(result.dir) : null;
  if (!match || Number(match[1]) !== result.issue) return null;
  return { issue: result.issue, slug: match[2], pr: result.pr };
}

/**
 * Classifies a finished Bash call: `{ issue, slug, pr }` when its command
 * invokes the write-spec merge and its sole JSON result reports the same
 * issue merged; otherwise null.
 */
export function writeSpecPublication({ toolUseId, command, stdout }) {
  if (typeof toolUseId !== "string" || toolUseId.length === 0) return null;
  const issue = writeSpecMergeIssue(command);
  const result = writeSpecMergeResult(stdout);
  if (issue === null || result === null || result.issue !== issue) return null;
  return { issue, slug: result.slug, pr: result.pr };
}

/**
 * Classifies an AskUserQuestion result's `answers` (question text → answer;
 * multi-select answers are comma-separated): true when any answer selected a
 * write-spec Finished label. A typed Other answer is never Finished.
 */
export function writeSpecFinishedSelection(answers) {
  if (!answers || typeof answers !== "object") return false;
  return Object.values(answers).some((answer) => typeof answer === "string"
    && WRITE_SPEC_FINISHED_LABELS.some((label) => answer === label
      || answer.split(/,\s*/).includes(label)));
}

export const EXECUTE_GOAL_MAX_ISSUES = 20;
const EXECUTE_GOAL_RE = /sdlc-execute\.mjs["']?\s+goal\b/;
const EXECUTE_SUPERVISE_RE = /sdlc-execute\.mjs["']?\s+supervise\b/;

/**
 * The `/goal` condition for `/sdlc-execute` delivering `issues` in order, or
 * null for an empty, duplicate, non-integer, or over-long list. Completion is
 * judged from conversation text alone: each issue's `MERGED and CLOSED` line, or
 * a `/sdlc-execute stopped:` line.
 */
export function executeGoalCondition(issues) {
  if (!Array.isArray(issues) || issues.length === 0 || issues.length > EXECUTE_GOAL_MAX_ISSUES) return null;
  if (!issues.every(isPositiveSafeInteger) || new Set(issues).size !== issues.length) return null;
  const refs = issues.map((issue) => `#${issue}`).join(", ");
  const lines = issues.map((issue) => `the line "#${issue}: MERGED and CLOSED"`).join(" and ");
  return `/sdlc-execute is delivering ${refs} in this order. Keep supervising its controller with supervise, decide and wait as the execute workflow directs, starting with the supervise command for these issues. This goal is met only when your replies in this conversation contain ${lines}, or contain a line beginning "/sdlc-execute stopped:" followed by the halt or controller-exit diagnosis.`;
}

/**
 * The issues a finished `sdlc-execute.mjs goal` Bash call names, in order, or
 * null: the command must invoke `goal` and its sole JSON result must be
 * `{ ok: true, issues }` with issues `executeGoalCondition` accepts.
 */
export function executeGoalRequest({ command, stdout } = {}) {
  if (typeof command !== "string" || !EXECUTE_GOAL_RE.test(command)) return null;
  const result = soleJsonObject(stdout);
  if (result?.ok !== true || executeGoalCondition(result.issues) === null) return null;
  return [...result.issues];
}

/** True when a Bash command invokes the execute controller's `supervise`, whatever its quoting or root spelling. */
export function isExecuteSuperviseCommand(command) {
  return typeof command === "string" && EXECUTE_SUPERVISE_RE.test(command);
}

/** The one-line failure for a run whose `/goal` could not be set. */
export function executeGoalStoppedLine(reason) {
  const detail = String(reason ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
  return `/sdlc-execute stopped: goal_unavailable: ${detail}`;
}

function controllerPath(root, scriptName) {
  return SCRIPT_NAME_PATTERN.test(scriptName) ? joinRoot(root, "scripts", scriptName) : null;
}

/**
 * Rewrites plugin-root placeholders in a shell command to the installed
 * plugin's absolute path: `<plugin-root>`, `${NMG_SDLC_PLUGIN_ROOT}`, and
 * `$NMG_SDLC_PLUGIN_ROOT`. One left-to-right scan follows the quoting context.
 * Inside single quotes the bare path is spliced raw (a `'` in it becomes
 * `'\''`). Inside double quotes it is spliced raw too, but a backslash before
 * `$`, `"` or another backslash escapes the next character, so an escaped
 * placeholder is left unchanged, and any other backslash is ordinary text. A
 * `$(` inside double quotes starts a nested command context, scanned with these
 * same rules up to its matching unquoted `)`, after which the double-quoted
 * segment continues; a `$(` with no matching `)` before the end of the line is
 * ordinary double-quoted text. In unquoted text a
 * `<plugin-root>/scripts/<name>.mjs` operand becomes a JSON-quoted path, and an
 * operand whose tail has glob characters keeps that tail unquoted so the shell
 * still expands it. An unquoted backslash escapes the next character, so a
 * `\"` opens no quoted segment. A quoted segment must close on the same line;
 * one that does not is copied as ordinary text, its opening quote included.
 */
export function materializePluginRootCommand(command, root) {
  if (typeof command !== "string" || typeof root !== "string" || root.length === 0) return command;
  const token = /<plugin-root>|\$\{NMG_SDLC_PLUGIN_ROOT\}|\$NMG_SDLC_PLUGIN_ROOT\b/;
  if (!token.test(command)) return command;
  const bareRoot = String(root).replace(/[\\/]+$/, "");
  // A segment's or substitution's result depends only on where it starts, so the maps scan each start once.
  const scan = {
    command,
    bareRoot,
    singleQuotedRoot: bareRoot.replace(/'/g, "'\\''"),
    everyToken: new RegExp(token.source, "g"),
    tokenAt: new RegExp(token.source, "y"),
    operand: /(<plugin-root>|\$\{NMG_SDLC_PLUGIN_ROOT\}|\$NMG_SDLC_PLUGIN_ROOT\b)(\/[^\s"'`;|&)<>\\]*)?/y,
    singleQuote: /'([^'\r\n]*)'/y,
    doubleQuoted: new Map(),
    substitutions: new Map(),
  };
  return scanCommand(scan, 0, command.length, false).text;
}

/** The index of the first line break at or after `from`, or the command length when none follows. */
function lineEndAt(command, from) {
  const lineBreak = /[\r\n]/g;
  lineBreak.lastIndex = from;
  const found = lineBreak.exec(command);
  return found === null ? command.length : found.index;
}

/**
 * Scans command text from `from` to `end` in unquoted context. A top-level scan
 * (`nested` false) returns `{ text }` for the range. A nested scan is the body of
 * a substitution: it returns `{ text, close }`, where `close` is the index after
 * the unquoted `)` at depth zero that ends it, or null when `end` comes first.
 */
function scanCommand(scan, from, end, nested) {
  const { command } = scan;
  let text = "";
  let depth = 0;
  let at = from;
  while (at < end) {
    const char = command[at];
    // An unquoted backslash escapes the next character, so an escaped quote opens no quoted segment.
    if (char === "\\" && at + 1 < end) {
      text += command.slice(at, at + 2);
      at += 2;
      continue;
    }
    if (nested && char === "(") depth += 1;
    if (nested && char === ")") {
      if (depth === 0) return { text, close: at + 1 };
      depth -= 1;
    }
    const quoted = char === '"' ? scanDoubleQuoted(scan, at) : char === "'" ? scanSingleQuoted(scan, at) : null;
    if (quoted !== null) {
      text += quoted.text;
      at = quoted.end;
      continue;
    }
    scan.operand.lastIndex = at;
    const placeholder = scan.operand.exec(command);
    if (placeholder !== null) {
      text += materializedOperand(placeholder[2] ?? "", scan.bareRoot);
      at += placeholder[0].length;
      continue;
    }
    text += char;
    at += 1;
  }
  return nested ? null : { text };
}

/** The single-quoted segment opening at `start`, or null when it does not close on the same line. */
function scanSingleQuoted(scan, start) {
  scan.singleQuote.lastIndex = start;
  const quoted = scan.singleQuote.exec(scan.command);
  if (quoted === null) return null;
  const body = quoted[1].replace(scan.everyToken, () => scan.singleQuotedRoot);
  return { text: `'${body}'`, end: start + quoted[0].length };
}

/**
 * The double-quoted segment opening at `start`, or null when it does not close on
 * the same line. Placeholders are spliced raw; a `$(` starts a nested command context.
 */
function scanDoubleQuoted(scan, start) {
  if (scan.doubleQuoted.has(start)) return scan.doubleQuoted.get(start);
  const { command } = scan;
  const lineEnd = lineEndAt(command, start);
  let text = '"';
  let at = start + 1;
  let segment = null;
  while (at < lineEnd) {
    const char = command[at];
    if (char === "\\" && at + 1 < lineEnd && /[$"\\]/.test(command[at + 1])) {
      text += command.slice(at, at + 2);
      at += 2;
      continue;
    }
    if (char === '"') {
      segment = { text: `${text}"`, end: at + 1 };
      break;
    }
    if (char === "$" && command[at + 1] === "(") {
      const substitution = scanSubstitution(scan, at + 2);
      if (substitution !== null) {
        text += `$(${substitution.text})`;
        at = substitution.close;
        continue;
      }
    }
    scan.tokenAt.lastIndex = at;
    const placeholder = scan.tokenAt.exec(command);
    if (placeholder !== null) {
      text += scan.bareRoot;
      at += placeholder[0].length;
      continue;
    }
    text += char;
    at += 1;
  }
  scan.doubleQuoted.set(start, segment);
  return segment;
}

/** The nested command context whose body starts at `from`, scanned to its matching `)` on the same line. */
function scanSubstitution(scan, from) {
  if (!scan.substitutions.has(from)) {
    scan.substitutions.set(from, scanCommand(scan, from, lineEndAt(scan.command, from), true));
  }
  return scan.substitutions.get(from);
}

/** The replacement for an unquoted placeholder operand whose `/...` tail is `tail`. */
function materializedOperand(tail, bareRoot) {
  const script = /^\/scripts\/([A-Za-z0-9._-]+\.mjs)$/.exec(tail)?.[1];
  if (script) return JSON.stringify(controllerPath(bareRoot, script));
  // The root alone is quoted, so a root with spaces stays one word; a glob tail stays unquoted for the shell to expand.
  if (/[*?[]/.test(tail)) return `${JSON.stringify(bareRoot)}${tail}`;
  return JSON.stringify(`${bareRoot}${tail}`);
}

/** Rewrites a leading `<plugin-root>` in a file path to the plugin's absolute path. */
export function materializePluginRootPath(path, root) {
  if (typeof path !== "string" || typeof root !== "string" || root.length === 0) return path;
  const bareRoot = root.replace(/[\\/]+$/, "");
  return path.replace(/^(?:<plugin-root>|\$\{NMG_SDLC_PLUGIN_ROOT\}|\$NMG_SDLC_PLUGIN_ROOT\b)(?=\/|$)/, bareRoot);
}

/**
 * Rewrites a leading plugin-root placeholder in the `path` of a Glob or Grep
 * call. Any other tool input, or a path without the placeholder, is returned as is.
 */
export function materializePluginRootToolInput(input, root) {
  if ((input?.tool !== "Glob" && input?.tool !== "Grep") || typeof input.path !== "string") return input;
  const path = materializePluginRootPath(input.path, root);
  return path === input.path ? input : { ...input, path };
}
