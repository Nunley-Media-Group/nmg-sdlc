import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  packageRoot as defaultPackageRoot,
  renderedPromptBytes,
  workflowBody,
} from "./sdlc-workflows.mjs";

export const ALLOWED_SLOTS = Object.freeze(["header", "body", "extra"]);

export const COMMAND_CONSUMERS = Object.freeze([
  "sdlc-draft-issue",
  "sdlc-write-spec",
  "sdlc-onboard-project",
  "sdlc-upgrade-project",
  "sdlc-steering",
  "sdlc-run-retro",
  "sdlc-execute",
  "sdlc-status",
  "sdlc-verify-code",
  "sdlc-open-pr",
]);

export const WORKER_CONSUMERS = Object.freeze([
  "worker:start",
  "worker:implement",
  "worker:verify",
  "worker:deliver",
]);

export const ALLOWED_CONSUMERS = Object.freeze([
  ...COMMAND_CONSUMERS,
  ...WORKER_CONSUMERS,
]);

const FRAGMENT_KEYS = new Set([
  "id",
  "provider",
  "source",
  "consumers",
  "slot",
  "order",
  "body",
]);
const REQUIRED_FRAGMENT_KEYS = [
  "id",
  "provider",
  "source",
  "consumers",
  "slot",
  "order",
];
const PLACEHOLDER_RE = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

function fail(reasonCode) {
  throw new Error(reasonCode);
}

function isWithin(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function validateFragmentShape(fragment) {
  if (!fragment || typeof fragment !== "object" || Array.isArray(fragment)) fail("unknown_key");
  if (Object.keys(fragment).some((key) => !FRAGMENT_KEYS.has(key))) fail("unknown_key");
  if (REQUIRED_FRAGMENT_KEYS.some((key) => !Object.hasOwn(fragment, key))) fail("unknown_key");
  if (typeof fragment.id !== "string" || fragment.id.trim() === "") fail("unknown_key");
  if (typeof fragment.source !== "string" || fragment.source.trim() === "") fail("unknown_key");
  if (!Array.isArray(fragment.consumers) || fragment.consumers.length === 0) fail("unknown_key");
  if (Object.hasOwn(fragment, "body") && typeof fragment.body !== "string") fail("unknown_key");
  if (!Number.isFinite(fragment.order)) fail("unknown_key");
}

function loadFileBody(source, packageRoot) {
  const workflowsRoot = resolve(packageRoot, "workflows");
  const referencesRoot = resolve(packageRoot, "references");
  const sourcePath = resolve(packageRoot, source);
  const sourceRoot = isWithin(workflowsRoot, sourcePath)
    ? workflowsRoot
    : isWithin(referencesRoot, sourcePath)
      ? referencesRoot
      : null;
  if (isAbsolute(source) || sourceRoot === null) fail("path_outside_root");
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) fail("missing_source");

  const realSourceRoot = realpathSync(sourceRoot);
  const realSourcePath = realpathSync(sourcePath);
  if (!isWithin(realSourceRoot, realSourcePath)) fail("path_outside_root");

  if (basename(sourcePath) === "WORKFLOW.md") {
    const workflowName = relative(workflowsRoot, dirname(sourcePath));
    return workflowBody(workflowName, packageRoot);
  }
  return readFileSync(sourcePath, "utf8");
}

export function createPromptSnippetRegistry() {
  return { byId: new Map() };
}

export function registerPromptSnippet(
  registry,
  fragment,
  packageRoot = defaultPackageRoot,
  trustedProject = false,
) {
  validateFragmentShape(fragment);
  if (registry?.byId?.has(fragment.id)) fail("duplicate_fragment_id");
  const projectProvider = typeof fragment.provider === "string"
    && fragment.provider === `project:${fragment.id}`;
  if (fragment.provider !== "plugin" && !(trustedProject && projectProvider)) {
    fail("disallowed_provider");
  }
  if (fragment.consumers.some((consumer) => !ALLOWED_CONSUMERS.includes(consumer))) {
    fail("disallowed_consumer");
  }
  if (!ALLOWED_SLOTS.includes(fragment.slot)) fail("disallowed_slot");

  const body = projectProvider || fragment.source.startsWith("builtin:")
    ? String(fragment.body ?? "")
    : loadFileBody(fragment.source, packageRoot);
  if (body.length === 0) fail("empty_body");

  registry.byId.set(fragment.id, Object.freeze({ ...fragment, body }));
  return registry;
}

export function registerValidatedProjectSnippets(registry, fragments) {
  if (!Array.isArray(fragments)) fail("unknown_key");
  for (const fragment of fragments) registerPromptSnippet(registry, fragment, defaultPackageRoot, true);
  return registry;
}

export function renderPrompt(registry, { consumer, vars = {} } = {}) {
  if (!ALLOWED_CONSUMERS.includes(consumer)) fail("disallowed_consumer");
  const fragments = [...registry.byId.values()]
    .filter((fragment) => fragment.consumers.includes(consumer))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id, "en"));
  if (fragments.length === 0) fail("empty_body");

  const provenanceFragments = [];
  const texts = fragments.map((fragment) => {
    const text = fragment.body.replace(PLACEHOLDER_RE, (placeholder, name) => (
      Object.hasOwn(vars, name) ? String(vars[name]) : placeholder
    ));
    PLACEHOLDER_RE.lastIndex = 0;
    if (PLACEHOLDER_RE.test(text)) fail("unknown_placeholder");
    PLACEHOLDER_RE.lastIndex = 0;
    const byteCount = renderedPromptBytes(text);
    provenanceFragments.push({
      id: fragment.id,
      provider: fragment.provider,
      source: fragment.source,
      hash: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`,
      byteCount,
      slot: fragment.slot,
      order: fragment.order,
    });
    return text;
  });
  const text = texts.join("\n");
  return {
    text,
    provenance: {
      consumer,
      renderedAt: new Date().toISOString(),
      byteCount: renderedPromptBytes(text),
      fragments: provenanceFragments,
    },
  };
}

export function writePromptProvenance(projectRoot, provenance) {
  try {
    const directory = join(projectRoot, ".nmg-sdlc", "prompt-provenance");
    mkdirSync(directory, { recursive: true });
    const filename = `${provenance.consumer.replaceAll(":", "-")}.json`;
    writeFileSync(join(directory, filename), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  } catch {
    fail("provenance_write_failed");
  }
}

const WORKER_HEADER = [
  "nmg-sdlc {{step}} worker for #{{issue}}: a Herdr Claude worker started by /sdlc-execute.",
  "Execute this inlined workflow for #{{issue}} without questions: never call AskUserQuestion, EnterPlanMode, or ExitPlanMode.",
  "Write and validate the handoff, then stop.",
  "",
  "$ARGUMENTS: #{{issue}}",
  "Controller run id: {{controllerRunId}}",
  "Handoff path: {{handoffPath}}",
  "Before printing the marker, run: node " + "<plugin-root>" + "/scripts/sdlc-execute.mjs validate-handoff --file {{handoffPath}}",
  "Only after validation succeeds print exactly: NMG_SDLC_HANDOFF: {{handoffPath}}",
  "Before ending any turn while a background command for this step is still running, write {{handoffPath}}.waiting naming that command; the controller keeps this session open and you are resumed when it finishes. Ending a turn with neither the handoff nor that file means the step stopped.",
  "This checkout is shared with the controller, which depends on its current branch and HEAD. Never switch its branch or move HEAD to read another ref, such as the default branch: read other refs with `git show <ref>:<path>`, `git diff <ref>...HEAD`, or a separate `git worktree`. Only the start stage checks out the issue branch it creates.",
  "",
].join("\n");

const CATALOG = [
  ["plugin.workflow.draft-issue", "workflows/draft-issue/WORKFLOW.md", ["sdlc-draft-issue"], "body", 100],
  ["plugin.workflow.write-spec", "workflows/write-spec/WORKFLOW.md", ["sdlc-write-spec"], "body", 100],
  ["plugin.reference.execute-implementable-requirements", "references/execute-implementable-requirements.md", ["sdlc-draft-issue", "sdlc-write-spec"], "extra", 150],
  ["plugin.workflow.onboard-project", "workflows/onboard-project/WORKFLOW.md", ["sdlc-onboard-project"], "body", 100],
  ["plugin.workflow.upgrade-project", "workflows/upgrade-project/WORKFLOW.md", ["sdlc-upgrade-project"], "body", 100],
  ["plugin.workflow.steering", "workflows/steering/WORKFLOW.md", ["sdlc-steering"], "body", 100],
  ["plugin.workflow.run-retro", "workflows/run-retro/WORKFLOW.md", ["sdlc-run-retro"], "body", 100],
  ["plugin.workflow.execute", "workflows/execute/WORKFLOW.md", ["sdlc-execute"], "body", 100],
  ["plugin.workflow.status", "workflows/status/WORKFLOW.md", ["sdlc-status"], "body", 100],
  ["plugin.workflow.verify-code", "workflows/verify-code/WORKFLOW.md", ["sdlc-verify-code", "worker:verify"], "body", 100],
  ["plugin.workflow.open-pr", "workflows/open-pr/WORKFLOW.md", ["sdlc-open-pr", "worker:deliver"], "body", 100],
  ["plugin.workflow.start-issue", "workflows/start-issue/WORKFLOW.md", ["worker:start"], "body", 100],
  ["plugin.workflow.write-code", "workflows/write-code/WORKFLOW.md", ["worker:implement"], "body", 100],
  ["plugin.workflow.simplify", "workflows/simplify/WORKFLOW.md", ["worker:implement"], "extra", 200],
  ["plugin.execute.selection", "workflows/execute/references/selection.md", ["sdlc-execute"], "extra", 200],
].map(([id, source, consumers, slot, order]) => Object.freeze({
  id,
  provider: "plugin",
  source,
  consumers: Object.freeze(consumers),
  slot,
  order,
}));

CATALOG.push(Object.freeze({
  id: "plugin.worker.header",
  provider: "plugin",
  source: "builtin:plugin.worker.header",
  consumers: WORKER_CONSUMERS,
  slot: "header",
  order: 0,
  body: WORKER_HEADER,
}));
const WORKFLOW_SOURCE_RE = /^workflows\/([a-z0-9-]+)\/(?:WORKFLOW\.md$|references\/)/;

/**
 * Plugin path note for one consumer: inlined workflow text names packaged files
 * relative to its own workflow directory, so the rendered prompt states where
 * those paths resolve. `<plugin-root>` is materialized by the hooks module
 * (Bash commands and Read paths) and by `${CLAUDE_PLUGIN_ROOT}` in command files.
 */
export function pluginPathsNote(workflows) {
  const lines = [
    "Plugin paths: `<plugin-root>` is the installed nmg-sdlc plugin root. Read packaged files by their `<plugin-root>/...` path.",
  ];
  for (const name of workflows) {
    lines.push(`- In the inlined \`${name}\` workflow, relative paths such as \`references/...\`, \`templates/...\`, \`checklists/...\`, and \`agents/...\` resolve under \`<plugin-root>/workflows/${name}/\`.`);
  }
  lines.push("- `../../references/...` resolves under `<plugin-root>/references/`, and a path beginning `workflows/` resolves under `<plugin-root>/`.");
  lines.push("- Paths such as `specs/`, `steering/`, and `.nmg-sdlc/` name files in the current project, not in the plugin.");
  lines.push("");
  return lines.join("\n");
}

for (const consumer of ALLOWED_CONSUMERS) {
  const workflows = [...new Set(CATALOG
    .filter((fragment) => fragment.consumers.includes(consumer))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id, "en"))
    .map((fragment) => WORKFLOW_SOURCE_RE.exec(fragment.source)?.[1])
    .filter(Boolean))];
  if (workflows.length === 0) continue;
  const id = `plugin.paths.${consumer.replace(":", "-")}`;
  CATALOG.push(Object.freeze({
    id,
    provider: "plugin",
    source: `builtin:${id}`,
    consumers: Object.freeze([consumer]),
    slot: "header",
    order: 50,
    body: pluginPathsNote(workflows),
  }));
}
Object.freeze(CATALOG);

export function pluginPromptFragments() {
  return CATALOG;
}

export function defaultPromptRegistry(packageRoot = defaultPackageRoot, { projectRoot, pluginOnly = false } = {}) {
  const registry = createPromptSnippetRegistry();
  for (const fragment of pluginPromptFragments()) {
    registerPromptSnippet(registry, fragment, packageRoot);
  }
  if (projectRoot && !pluginOnly && existsSync(join(projectRoot, "steering", "manifest.json"))) {
    const command = join(packageRoot, "scripts", "sdlc-steering.mjs");
    const result = spawnSync("node", [command, "prompt-fragments", "--project", projectRoot], {
      encoding: "utf8",
      shell: false,
    });
    if (result.error || result.status !== 0) fail("project_runtime_invalid");
    let payload;
    try { payload = JSON.parse(result.stdout); } catch { fail("project_runtime_invalid"); }
    if (payload?.ok !== true || !Array.isArray(payload.fragments)) fail("project_runtime_invalid");
    registerValidatedProjectSnippets(registry, payload.fragments);
  }
  return registry;
}
