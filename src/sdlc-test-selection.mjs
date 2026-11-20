// The pre-merge gate's change selection: one headless Claude call per gate run picks the tests the opted-in
// validations run and the surfaces the surface-bound validations exercise. A stored selection is reused while its
// binding (head, change, steering, prompt and guidance) is unchanged, so `--mode select` and the gate share one call.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJson, projectPromptFragments } from "./sdlc-steering-runtime.mjs";
import {
  createPromptSnippetRegistry,
  pluginPromptFragments,
  registerPromptSnippet,
  registerValidatedProjectSnippets,
  renderPrompt,
} from "./sdlc-prompt-snippets.mjs";
import { packageRoot as defaultPackageRoot } from "./sdlc-workflows.mjs";
import { matches } from "./sdlc-glob.mjs";
import { selectionModel } from "./stage-models.mjs";

export const SELECTION_CONSUMER = "gate:selection";
export const SELECTION_TIMEOUT_MS = 300_000;
export const MAX_DIFF_BYTES = 200_000;
export const MAX_SELECTED_TESTS = 5000;
const MAX_TEST_LENGTH = 1024;
export const ANSWER_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    mode: { type: "string", enum: ["selected", "all"] },
    tests: { type: "array", items: { type: "string" } },
    surfaces: { type: "array", items: { type: "string" } },
  },
  required: ["mode", "tests", "surfaces"],
  additionalProperties: false,
});

function hash(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function git(projectRoot, args) {
  const result = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
export function selectionPath(projectRoot, issue) { return join(projectRoot, ".nmg-sdlc", "verification", `selection-${issue}.json`); }
export function guidancePath(projectRoot, issue) { return join(projectRoot, ".nmg-sdlc", "verification", `selection-guidance-${issue}.json`); }
function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

/** The committed and working-tree diff of the change, capped with a truncation marker. */
export function changeDiff(projectRoot, baseRef) {
  const text = `${git(projectRoot, ["diff", `${baseRef}...HEAD`])}${git(projectRoot, ["diff", "HEAD"])}`;
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= MAX_DIFF_BYTES) return text;
  return `${bytes.subarray(0, MAX_DIFF_BYTES).toString("utf8")}\n[diff truncated: ${bytes.length - MAX_DIFF_BYTES} more bytes]\n`;
}

/** The redispatch guidance stored for this head, or null. */
export function readGuidance(projectRoot, issue, headSha) {
  const value = readJson(guidancePath(projectRoot, issue));
  if (!value || value.schemaVersion !== 1 || Number(value.issue) !== Number(issue) || value.headSha !== headSha
    || typeof value.text !== "string" || !value.text.trim()) return null;
  return value.text;
}

/** Stores head-bound guidance for the next selection of `issue`. */
export function writeGuidance(projectRoot, issue, headSha, text) {
  writeJson(guidancePath(projectRoot, issue), { schemaVersion: 1, issue: Number(issue), headSha, text: String(text) });
}

/** Every surface whose sources match a changed path. */
export function requiredSurfaces(surfaces, paths) {
  return surfaces.filter((surface) => paths.some((path) => matches(path, surface.sources))).map((surface) => surface.id);
}

/** The bundled `gate:selection` prompt plus the project snippets routed to it. */
export function renderSelectionPrompt(runtime, packageRoot = defaultPackageRoot) {
  const registry = createPromptSnippetRegistry();
  for (const fragment of pluginPromptFragments()) {
    if (fragment.consumers.includes(SELECTION_CONSUMER)) registerPromptSnippet(registry, fragment, packageRoot);
  }
  registerValidatedProjectSnippets(registry, projectPromptFragments(runtime).filter((fragment) => fragment.consumers.includes(SELECTION_CONSUMER)));
  return renderPrompt(registry, { consumer: SELECTION_CONSUMER });
}

function selectionInput({ text, baseRef, paths, diff, surfaces, guidance }) {
  const sections = [
    text.trimEnd(),
    "## Input",
    `Base ref: ${baseRef}`,
    `Changed paths:\n${paths.map((path) => `- ${path}`).join("\n") || "(none)"}`,
    `Declared surfaces:\n${surfaces.map((surface) => `- ${surface.id}: ${surface.sources.join(", ")}`).join("\n") || "(none)"}`,
    `Diff:\n\`\`\`diff\n${diff}\n\`\`\``,
  ];
  if (guidance) sections.push(`Supervisor guidance:\n${guidance}`);
  return `${sections.join("\n\n")}\n`;
}

/** The headless Claude call: the prompt on stdin, no tools, structured JSON output. */
export function claudeSelectionCommand({ model, effort }) {
  return {
    program: "claude",
    args: ["-p", "--model", model, ...(effort === "default" ? [] : ["--effort", effort]), "--output-format", "json",
      "--json-schema", JSON.stringify(ANSWER_SCHEMA), "--tools", "", "--no-session-persistence"],
  };
}

function defaultRunSelection({ program, args, input, cwd, timeout }) {
  return spawnSync(program, args, { cwd, input, encoding: "utf8", shell: false, timeout, maxBuffer: 64 * 1024 * 1024 });
}

/** The answer object from the CLI's JSON result: its structured output, or a JSON `result` text. */
function answerFrom(stdout) {
  const parsed = JSON.parse(String(stdout ?? ""));
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (parsed.is_error === true) throw new Error("claude reported an error");
    if (parsed.structured_output && typeof parsed.structured_output === "object") return parsed.structured_output;
    if (typeof parsed.result === "string") return JSON.parse(parsed.result.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
    if (Object.hasOwn(parsed, "mode")) return parsed;
  }
  throw new Error("no structured selection in the claude output");
}

/** Validates the bounded answer; returns `{ mode, tests, surfaces }` or throws. */
export function validateAnswer(answer, declaredIds) {
  if (!answer || typeof answer !== "object" || Array.isArray(answer) || !["selected", "all"].includes(answer.mode)) throw new Error("mode");
  const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "");
  if (!strings(answer.tests) || !strings(answer.surfaces)) throw new Error("tests or surfaces");
  const tests = [...new Set(answer.tests)];
  if (tests.length > MAX_SELECTED_TESTS || tests.some((test) => test.length > MAX_TEST_LENGTH)) throw new Error("tests bound");
  const surfaces = [...new Set(answer.surfaces)];
  if (surfaces.some((id) => !declaredIds.includes(id))) throw new Error("undeclared surface");
  return { mode: answer.mode, tests, surfaces };
}

/**
 * Resolves the selection for one change-tier gate run of a manifest that declares `selection`. Returns
 * `{ mode, reason, fallbackPath, tests, surfaces, requiredSurfaces, model, effort, prompt, guidanceSupplied, reused, detail }`:
 * `mode` is `selected` or `all`; `reason` is `selected`, `selection_empty`, `fallback_path`, `selection_failed` or
 * `selection_all`. In `all` mode `surfaces` is every declared surface id.
 */
export function resolveChangeSelection({ projectRoot, issue, baseRef, paths, runtime, models, runSelection = defaultRunSelection,
  packageRoot = defaultPackageRoot, headSha } = {}) {
  const root = resolve(projectRoot);
  const surfaces = runtime.surfaces ?? [];
  const declaredIds = surfaces.map((surface) => surface.id);
  const { model, effort } = selectionModel(models);
  const required = requiredSurfaces(surfaces, paths);
  const head = headSha ?? git(root, ["rev-parse", "HEAD"]).trim();
  const fallbackPaths = [...(runtime.selection?.fallbackPaths ?? []), ...runtime.validations.flatMap((validation) => validation.fallbackPaths ?? [])];
  const all = (reason, extra = {}) => ({ mode: "all", reason, fallbackPath: null, tests: [], surfaces: [...declaredIds], requiredSurfaces: required,
    model, effort, prompt: null, guidanceSupplied: false, reused: false, detail: null, ...extra });
  const fallbackPath = paths.find((path) => matches(path, fallbackPaths));
  if (fallbackPath !== undefined) return all("fallback_path", { fallbackPath });

  const guidance = readGuidance(root, issue, head);
  const rendered = renderSelectionPrompt(runtime, packageRoot);
  const prompt = { consumer: SELECTION_CONSUMER, fragments: rendered.provenance.fragments.map(({ id, hash: fragmentHash }) => ({ id, hash: fragmentHash })) };
  const diff = changeDiff(root, baseRef);
  const binding = {
    headSha: head,
    pathsDigest: hash(canonicalJson(paths)),
    diffDigest: hash(diff),
    steeringHash: runtime.steeringHash,
    promptHash: hash(rendered.text),
    guidanceHash: guidance ? hash(guidance) : null,
    model,
    effort,
  };
  const stored = readJson(selectionPath(root, issue));
  if (stored?.schemaVersion === 1 && canonicalJson(stored.binding) === canonicalJson(binding) && stored.selection) {
    return { ...stored.selection, requiredSurfaces: required, reused: true };
  }

  const shared = { requiredSurfaces: required, model, effort, prompt, guidanceSupplied: Boolean(guidance), reused: false };
  const input = selectionInput({ text: rendered.text, baseRef, paths, diff, surfaces, guidance });
  const command = claudeSelectionCommand({ model, effort });
  let selection;
  try {
    const response = runSelection({ ...command, input, cwd: root, timeout: SELECTION_TIMEOUT_MS });
    if (!response || response.error || response.status !== 0) {
      throw new Error(response?.error?.message ?? `claude exited ${response?.status ?? "without a status"}${response?.signal ? ` (${response.signal})` : ""}`);
    }
    const answer = validateAnswer(answerFrom(response.stdout), declaredIds);
    selection = answer.mode === "all"
      ? all("selection_all", shared)
      : { mode: "selected", reason: answer.tests.length || answer.surfaces.length ? "selected" : "selection_empty", fallbackPath: null,
        tests: answer.tests, surfaces: answer.surfaces, ...shared, detail: null };
  } catch (error) {
    selection = all("selection_failed", { ...shared, detail: String(error.message).slice(0, 500) });
  }
  // A failed call is not stored, so the next run asks again.
  if (selection.reason !== "selection_failed") try {
    writeJson(selectionPath(root, issue), { schemaVersion: 1, issue: Number(issue), binding, selection, storedAt: new Date().toISOString() });
  } catch {}
  return selection;
}
