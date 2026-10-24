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
];

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
 * The `{ issue, slug }` a write-spec merge command publishes, or null. The
 * command must be the helper invocation verbatim: no prefix, suffix, chaining,
 * pipe, or redirection.
 */
export function writeSpecMergeCommand(command, root) {
  const helper = JSON.stringify(joinRoot(root, "scripts", "publish-approved-spec.mjs"));
  const prefix = `node ${helper} merge --issue `;
  if (typeof command !== "string" || !command.startsWith(prefix)) return null;
  const match = /^([1-9]\d*) --dir specs\/([1-9]\d*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(
    command.slice(prefix.length),
  );
  if (!match) return null;
  const issue = Number(match[1]);
  if (!Number.isSafeInteger(issue) || issue !== Number(match[2])) return null;
  return { issue, slug: match[3] };
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
 * Classifies a finished Bash call: `{ issue, slug, pr }` when it is the
 * authoritative write-spec merge and its sole JSON result reports
 * `merged: true` with a positive PR number; otherwise null.
 */
export function writeSpecPublication({ toolUseId, command, stdout }, root) {
  if (typeof toolUseId !== "string" || toolUseId.length === 0) return null;
  const parsed = writeSpecMergeCommand(command, root);
  if (!parsed) return null;
  const result = soleJsonObject(stdout);
  if (result?.merged !== true || !Number.isSafeInteger(result.pr) || result.pr <= 0) return null;
  return { issue: parsed.issue, slug: parsed.slug, pr: result.pr };
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

const RECOMMENDED_SUFFIX = /\s*\(Recommended\)\s*$/;

/**
 * Autopilot answer for an AskUserQuestion input: each question answered with
 * an option whose label (less any ` (Recommended)`) is in `prefer`, else its
 * option labelled `(Recommended)`, else its first option.
 */
export function recommendedAnswers(questions, { prefer = [] } = {}) {
  const answers = {};
  for (const question of Array.isArray(questions) ? questions : []) {
    if (typeof question?.question !== "string") continue;
    const options = Array.isArray(question.options) ? question.options : [];
    const pick = options.find((option) => prefer.includes(String(option?.label ?? "").replace(RECOMMENDED_SUFFIX, "")))
      ?? options.find((option) => RECOMMENDED_SUFFIX.test(option?.label ?? ""))
      ?? options[0];
    if (typeof pick?.label === "string") answers[question.question] = pick.label;
  }
  return answers;
}

function controllerPath(root, scriptName) {
  return SCRIPT_NAME_PATTERN.test(scriptName) ? joinRoot(root, "scripts", scriptName) : null;
}

/**
 * Rewrites plugin-root placeholders in a shell command to the installed
 * plugin's absolute path: `<plugin-root>`, `${NMG_SDLC_PLUGIN_ROOT}`, and
 * `$NMG_SDLC_PLUGIN_ROOT`. Inside double quotes the path is spliced raw; a bare
 * `<plugin-root>/scripts/<name>.mjs` operand becomes a JSON-quoted path.
 */
export function materializePluginRootCommand(command, root) {
  if (typeof command !== "string" || typeof root !== "string" || root.length === 0) return command;
  const token = /<plugin-root>|\$\{NMG_SDLC_PLUGIN_ROOT\}|\$NMG_SDLC_PLUGIN_ROOT\b/;
  if (!token.test(command)) return command;
  const bareRoot = String(root).replace(/[\\/]+$/, "");
  const quoted = command.replace(/"([^"\r\n]*)"/g, (match, inner) => (
    token.test(inner)
      ? `"${inner.replace(new RegExp(token.source, "g"), bareRoot)}"`
      : match
  ));
  return quoted.replace(
    /(<plugin-root>|\$\{NMG_SDLC_PLUGIN_ROOT\}|\$NMG_SDLC_PLUGIN_ROOT\b)(\/[^\s"'`;|&)<>]*)?/g,
    (match, _token, rest = "") => {
      const script = /^\/scripts\/([A-Za-z0-9._-]+\.mjs)$/.exec(rest)?.[1];
      const path = script ? controllerPath(bareRoot, script) : `${bareRoot}${rest}`;
      return JSON.stringify(path);
    },
  );
}

/** Rewrites a leading `<plugin-root>` in a file path to the plugin's absolute path. */
export function materializePluginRootPath(path, root) {
  if (typeof path !== "string" || typeof root !== "string" || root.length === 0) return path;
  const bareRoot = root.replace(/[\\/]+$/, "");
  return path.replace(/^(?:<plugin-root>|\$\{NMG_SDLC_PLUGIN_ROOT\}|\$NMG_SDLC_PLUGIN_ROOT\b)(?=\/|$)/, bareRoot);
}
