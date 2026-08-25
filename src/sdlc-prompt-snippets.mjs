import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
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
  "sdlc-run-retro",
  "sdlc-execute",
  "sdlc-status",
  "sdlc-verify-code",
  "sdlc-open-pr",
]);

export const WORKER_CONSUMERS = Object.freeze([
  "worker:start",
  "worker:implement",
  "worker:review1",
  "worker:fix1",
  "worker:review2",
  "worker:fix2",
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
  "byteBound",
  "body",
]);
const REQUIRED_FRAGMENT_KEYS = [
  "id",
  "provider",
  "source",
  "consumers",
  "slot",
  "order",
  "byteBound",
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
  if (!Number.isInteger(fragment.byteBound) || fragment.byteBound <= 0) fail("unknown_key");
}

function loadFileBody(source, packageRoot) {
  const workflowsRoot = resolve(packageRoot, "workflows");
  const sourcePath = resolve(packageRoot, source);
  if (isAbsolute(source) || !isWithin(workflowsRoot, sourcePath)) fail("path_outside_root");
  if (!existsSync(sourcePath)) fail("missing_source");

  const realWorkflowsRoot = realpathSync(workflowsRoot);
  const realSourcePath = realpathSync(sourcePath);
  if (!isWithin(realWorkflowsRoot, realSourcePath)) fail("path_outside_root");

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
) {
  validateFragmentShape(fragment);
  if (registry?.byId?.has(fragment.id)) fail("duplicate_fragment_id");
  if (fragment.provider !== "plugin") fail("disallowed_provider");
  if (fragment.consumers.some((consumer) => !ALLOWED_CONSUMERS.includes(consumer))) {
    fail("disallowed_consumer");
  }
  if (!ALLOWED_SLOTS.includes(fragment.slot)) fail("disallowed_slot");

  const body = fragment.source.startsWith("builtin:")
    ? String(fragment.body ?? "")
    : loadFileBody(fragment.source, packageRoot);
  if (body.length === 0) fail("empty_body");
  if (renderedPromptBytes(body) > fragment.byteBound) fail("byte_bound_exceeded");

  registry.byId.set(fragment.id, Object.freeze({ ...fragment, body }));
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
    if (byteCount > fragment.byteBound) fail("byte_bound_exceeded");
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
    const directory = join(projectRoot, ".omp", "sdlc", "prompt-provenance");
    mkdirSync(directory, { recursive: true });
    const filename = `${provenance.consumer.replaceAll(":", "-")}.json`;
    writeFileSync(join(directory, filename), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  } catch {
    fail("provenance_write_failed");
  }
}

const WORKER_HEADER = [
  "nmg-sdlc {{step}} worker for #{{issue}}.",
  "Execute this inlined workflow for #{{issue}} without questions.",
  "Write and validate the handoff, then stop.",
  "",
  "$ARGUMENTS: #{{issue}}",
  "Handoff path: {{handoffPath}}",
  "Before printing the marker, run: node " + "<plugin-root>" + "/scripts/sdlc-execute.mjs validate-handoff --file {{handoffPath}}",
  "Only after validation succeeds print exactly: NMG_SDLC_HANDOFF: {{handoffPath}}",
  "",
].join("\n");

const CATALOG = [
  ["plugin.workflow.draft-issue", "workflows/draft-issue/WORKFLOW.md", ["sdlc-draft-issue"], "body", 100, 5257],
  ["plugin.workflow.write-spec", "workflows/write-spec/WORKFLOW.md", ["sdlc-write-spec"], "body", 100, 9190],
  ["plugin.workflow.onboard-project", "workflows/onboard-project/WORKFLOW.md", ["sdlc-onboard-project"], "body", 100, 3041],
  ["plugin.workflow.upgrade-project", "workflows/upgrade-project/WORKFLOW.md", ["sdlc-upgrade-project"], "body", 100, 3908],
  ["plugin.workflow.run-retro", "workflows/run-retro/WORKFLOW.md", ["sdlc-run-retro"], "body", 100, 1192],
  ["plugin.workflow.execute", "workflows/execute/WORKFLOW.md", ["sdlc-execute"], "body", 100, 1091],
  ["plugin.workflow.status", "workflows/status/WORKFLOW.md", ["sdlc-status"], "body", 100, 713],
  ["plugin.workflow.verify-code", "workflows/verify-code/WORKFLOW.md", ["sdlc-verify-code", "worker:verify"], "body", 100, 3449],
  ["plugin.workflow.open-pr", "workflows/open-pr/WORKFLOW.md", ["sdlc-open-pr", "worker:deliver"], "body", 100, 2116],
  ["plugin.workflow.start-issue", "workflows/start-issue/WORKFLOW.md", ["worker:start"], "body", 100, 1163],
  ["plugin.workflow.write-code", "workflows/write-code/WORKFLOW.md", ["worker:implement"], "body", 100, 4949],
  ["plugin.workflow.review-main", "workflows/review-main/WORKFLOW.md", ["worker:review1", "worker:review2"], "body", 100, 1114],
  ["plugin.workflow.apply-review", "workflows/apply-review/WORKFLOW.md", ["worker:fix1", "worker:fix2"], "body", 100, 693],
  ["plugin.workflow.simplify", "workflows/simplify/WORKFLOW.md", ["worker:implement"], "extra", 200, 888],
  ["plugin.execute.selection", "workflows/execute/references/selection.md", ["sdlc-execute"], "extra", 200, 1706],
].map(([id, source, consumers, slot, order, byteBound]) => Object.freeze({
  id,
  provider: "plugin",
  source,
  consumers: Object.freeze(consumers),
  slot,
  order,
  byteBound,
}));

CATALOG.push(Object.freeze({
  id: "plugin.worker.header",
  provider: "plugin",
  source: "builtin:plugin.worker.header",
  consumers: WORKER_CONSUMERS,
  slot: "header",
  order: 0,
  byteBound: 512,
  body: WORKER_HEADER,
}));
Object.freeze(CATALOG);

export function pluginPromptFragments() {
  return CATALOG;
}

export function defaultPromptRegistry(packageRoot = defaultPackageRoot) {
  const registry = createPromptSnippetRegistry();
  for (const fragment of pluginPromptFragments()) {
    registerPromptSnippet(registry, fragment, packageRoot);
  }
  return registry;
}
