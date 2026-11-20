// The pre-merge gate's change selection: one headless Claude call per gate run picks the tests the opted-in
// validations run and the surfaces the surface-bound validations exercise. A stored selection is reused while its
// binding (head, change, steering, prompt and guidance) is unchanged, so `--mode select` and the gate share one call.
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
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
/** The most UTF-8 bytes all selected tests hold together, so the gate artifact recording them stays bounded. */
export const MAX_SELECTED_TEST_BYTES = 1024 * 1024;
/** The most claude stdout bytes read; a larger answer fails the call. */
export const MAX_SELECTION_OUTPUT = 64 * 1024 * 1024;
/** The most test files the prompt lists. */
export const MAX_TEST_INVENTORY = 3000;
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

/** The most entries each rejection list keeps; the rest are counted in `truncated`, so a handoff stays bounded. */
export const MAX_REJECTION_ENTRIES = 200;
/** A selection check's rejection: `{ reasonCode, uncovered, missingSurfaces, unaccounted, truncated }`, each list capped. */
export function rejectionOf(reasonCode, { uncovered = [], missingSurfaces = [], unaccounted = [], truncated = 0 } = {}) {
  const cap = (list) => (Array.isArray(list) ? list.map(String) : []);
  const lists = { uncovered: cap(uncovered), missingSurfaces: cap(missingSurfaces), unaccounted: cap(unaccounted) };
  let omitted = Number.isSafeInteger(truncated) && truncated > 0 ? truncated : 0;
  for (const key of Object.keys(lists)) {
    omitted += Math.max(0, lists[key].length - MAX_REJECTION_ENTRIES);
    lists[key] = lists[key].slice(0, MAX_REJECTION_ENTRIES);
  }
  return { reasonCode: String(reasonCode), ...lists, truncated: omitted };
}
/** `<reasonCode>: <named entries>`, naming at most 50 and counting the rest. */
export function rejectionSummary(rejection) {
  const named = [...(rejection.missingSurfaces ?? []), ...(rejection.uncovered ?? []), ...(rejection.unaccounted ?? [])];
  const more = Math.max(0, named.length - 50) + (rejection.truncated > 0 ? rejection.truncated : 0);
  return named.length ? `${rejection.reasonCode}: ${named.slice(0, 50).join(", ")}${more ? `, and ${more} more` : ""}` : rejection.reasonCode;
}

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

/** Untracked, non-ignored files rendered as new-file diffs, so their content reaches the prompt and the binding. */
function untrackedDiff(projectRoot) {
  const paths = git(projectRoot, ["ls-files", "-z", "--others", "--exclude-standard"]).split("\0").filter(Boolean).sort();
  return paths.map((path) => {
    let text;
    try {
      if (!lstatSync(join(projectRoot, path)).isFile()) return "";
      text = readFileSync(join(projectRoot, path), "utf8");
    } catch { return ""; }
    const body = text.split("\n").map((line) => `+${line}`).join("\n");
    return `diff --git a/${path} b/${path}\nnew file (untracked)\n--- /dev/null\n+++ b/${path}\n${body}\n`;
  }).join("");
}
/** The committed, working-tree and untracked change: `{ text, digest }`, the text capped with a truncation marker and the digest over all of it. */
export function changeDiffWithDigest(projectRoot, baseRef) {
  const plain = ["-c", "core.quotepath=off", "diff", "--no-color", "--no-ext-diff"];
  const full = `${git(projectRoot, [...plain, `${baseRef}...HEAD`])}${git(projectRoot, [...plain, "HEAD"])}${untrackedDiff(projectRoot)}`;
  const bytes = Buffer.from(full, "utf8");
  const text = bytes.length <= MAX_DIFF_BYTES ? full
    : `${bytes.subarray(0, MAX_DIFF_BYTES).toString("utf8")}\n[diff truncated: ${bytes.length - MAX_DIFF_BYTES} more bytes]\n`;
  return { text, digest: hash(full) };
}
/** The change's diff as the prompt receives it, capped with a truncation marker. */
export function changeDiff(projectRoot, baseRef) { return changeDiffWithDigest(projectRoot, baseRef).text; }

/** The manifest-level and validation-level fallback globs. */
export function fallbackPathsOf(runtime) {
  return [...(runtime.selection?.fallbackPaths ?? []), ...runtime.validations.flatMap((validation) => validation.fallbackPaths ?? [])];
}

/** A test id split at its first `::` node suffix: `[target, suffix]`. */
function splitTestId(test) {
  const at = test.indexOf("::");
  return at < 0 ? [test, ""] : [test.slice(0, at), test.slice(at)];
}
/**
 * The project path a path-shaped test id names (one whose target, before any `::` node suffix, holds a `/`),
 * normalized: POSIX-normalized, without a leading `./`, a trailing `/` or a trailing `/...` package wildcard. Null for
 * any other id, such as a test or package name, which the gate passes through without interpreting.
 */
export function testIdPath(test) {
  const [target] = splitTestId(String(test));
  if (!target.includes("/")) return null;
  return posix.normalize(target).replace(/^\.\//, "").replace(/(^|\/)\.\.\.$/, "").replace(/\/+$/, "") || ".";
}
/** Whether a test id names a file: path-shaped, with a file extension on its last segment. */
function fileShaped(test) {
  const target = testIdPath(test);
  return target !== null && /\.[A-Za-z0-9]+$/.test(target.split("/").at(-1));
}
/** A file-shaped id with its path normalized, keeping any `::` suffix; any other id unchanged, as its runner reads it. */
export function normalizeTestId(test) {
  return fileShaped(test) ? `${testIdPath(test)}${splitTestId(test)[1]}` : test;
}
/**
 * A test id as a command running from `cwd` (project-relative) reads it: a path-shaped id, which names a path from
 * the project root, is rebased onto `cwd`, keeping a leading `./` and any `::` suffix; any other id is unchanged.
 */
export function rebaseTestId(test, cwd = ".") {
  const base = posix.normalize(String(cwd || ".").split("\\").join("/")).replace(/\/+$/, "") || ".";
  if (base === "." || testIdPath(test) === null) return test;
  const [target, suffix] = splitTestId(test);
  const trailing = /(^|\/)\.\.\.$/.test(target) ? "/..." : target.endsWith("/") ? "/" : "";
  const relative = posix.relative(base, testIdPath(test)) || ".";
  const lead = target.startsWith("./") && !relative.startsWith("..") ? "./" : "";
  return `${lead}${relative}${trailing}${suffix}`;
}
/** The project-relative paths the selected path-shaped ids name. */
export function selectedTestPaths(tests) {
  return [...new Set(tests.map(testIdPath).filter((target) => target !== null))];
}
/** Whether `relative` names an entry under `base` spelled exactly as each directory lists it, and of the wanted kind. */
function entryExactly(base, relative, listings, wanted) {
  let directory = base;
  if (relative !== ".") for (const segment of relative.split("/")) {
    if (!listings.has(directory)) {
      try { listings.set(directory, new Set(readdirSync(directory))); } catch { listings.set(directory, new Set()); }
    }
    if (!listings.get(directory).has(segment)) return false;
    directory = join(directory, segment);
  }
  try {
    const stat = lstatSync(directory);
    return wanted === "file" ? stat.isFile() : stat.isFile() || stat.isDirectory();
  } catch { return false; }
}
/**
 * Throws naming the first path-shaped test id that names nothing in the project, spelled exactly from the project
 * root, the directory the coverage command runs from: a file-shaped id must be a regular file, any other path-shaped
 * id (a directory or a package path) a file or a directory. Ids without a `/` (test or package names) pass through.
 */
function requireTestFiles(root, tests) {
  const listings = new Map();
  const missing = tests.find((test) => testIdPath(test) !== null && !entryExactly(root, testIdPath(test), listings, fileShaped(test) ? "file" : "entry"));
  if (missing !== undefined) throw new Error(`selected test is no ${fileShaped(missing) ? "file" : "file or directory"} in the project: ${missing}`);
}

const TEST_DIRECTORY = /(^|\/)__tests__\//;
/** Base names, without their extension, of test files in common stacks: `a.test`, `a_test`, `a.spec`, `test_a`, `ATest`. */
const TEST_NAME = /^test_|[._](test|tests|spec|specs)$|[a-z0-9](Test|Tests|Spec)$/;
const DATA_FILE = /\.(md|markdown|txt|json|ya?ml|snap|lock|toml|csv|html?|css|svg|png|jpe?g|gif)$/i;
/** Whether a path is named like a test file: a code file under `__tests__/`, or one named like `a.test.js`, `a_test.go`, `test_a.py` or `ATest.java`. */
function testLike(path) {
  if (DATA_FILE.test(path)) return false;
  const name = path.split("/").at(-1).replace(/\.[^.]*$/, "");
  return TEST_DIRECTORY.test(path) || TEST_NAME.test(name);
}
/** The project's files named like tests, tracked or untracked, outside `docPaths`; capped, counting the rest. */
export function testInventory(projectRoot, runtime) {
  let listed;
  try { listed = git(projectRoot, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean); } catch { return { files: [], omitted: 0 }; }
  const docPaths = runtime.selection?.docPaths ?? [];
  const files = [...new Set(listed)].filter((path) => testLike(path) && !matches(path, docPaths) && existsSync(join(projectRoot, path))).sort();
  return { files: files.slice(0, MAX_TEST_INVENTORY), omitted: Math.max(0, files.length - MAX_TEST_INVENTORY) };
}

/**
 * The changed paths no check accounts for. A path is accounted for when the change deletes it (nothing of it is
 * left to cover), when it has a line record in the coverage report, when it is a selected test's path or the `file`
 * of a test in the coverage report, when it matches `docPaths`, or when it matches the sources of a selected surface.
 */
export function unaccountedPaths({ paths, reportPaths = new Set(), testPaths = [], surfaceSources = [], docPaths = [], exists }) {
  return paths.filter((path) => exists(path) && !reportPaths.has(path) && !testPaths.includes(path) && !matches(path, docPaths)
    && !matches(path, surfaceSources));
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

/**
 * Every surface whose sources match a changed path outside `docPaths`. A doc path is documentation by declaration
 * (delivery's version commit changes only doc paths), so it requires no surface even when a surface's sources match it.
 */
export function requiredSurfaces(surfaces, paths, docPaths = []) {
  const code = paths.filter((path) => !matches(path, docPaths));
  return surfaces.filter((surface) => code.some((path) => matches(path, surface.sources))).map((surface) => surface.id);
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

function selectionInput({ text, baseRef, paths, diff, surfaces, inventory, guidance }) {
  const sections = [
    text.trimEnd(),
    "## Input",
    `Base ref: ${baseRef}`,
    `Changed paths:\n${paths.map((path) => `- ${path}`).join("\n") || "(none)"}`,
    `Declared surfaces:\n${surfaces.map((surface) => `- ${surface.id}: ${surface.sources.join(", ")}`).join("\n") || "(none)"}`,
    `Test files (project-relative files named like tests):\n${inventory.files.map((path) => `- ${path}`).join("\n") || "(none found)"}${inventory.omitted ? `\n(and ${inventory.omitted} more)` : ""}`,
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

/** Runs the Claude call without blocking the event loop; resolves `{ status, signal, stdout, stderr, error }`. */
function defaultRunSelection({ program, args, input, cwd, timeout, maxOutput = MAX_SELECTION_OUTPUT, signal }) {
  return new Promise((resolvePromise) => {
    let child;
    try { child = spawn(program, args, { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"], timeout, killSignal: "SIGKILL", signal }); }
    catch (error) { resolvePromise({ status: null, signal: null, stdout: "", stderr: "", error }); return; }
    const out = [];
    const err = [];
    let size = 0;
    let settled = false;
    let overflow = false;
    const finish = (value) => { if (!settled) { settled = true; resolvePromise(overflow ? { ...value, error: new Error(`claude output exceeded ${maxOutput} bytes`) } : value); } };
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size <= maxOutput) out.push(chunk);
      else if (!overflow) { overflow = true; child.kill("SIGKILL"); }
    });
    child.stderr.on("data", (chunk) => { if (err.reduce((total, part) => total + part.length, 0) < 65536) err.push(chunk); });
    child.on("error", (error) => finish({ status: null, signal: null, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), error }));
    child.on("close", (status, closeSignal) => finish({ status, signal: closeSignal, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
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
  const extra = Object.keys(answer).filter((key) => !Object.hasOwn(ANSWER_SCHEMA.properties, key));
  if (extra.length) throw new Error(`unexpected answer keys: ${extra.join(", ")}`);
  const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "");
  if (!strings(answer.tests) || !strings(answer.surfaces)) throw new Error("tests or surfaces");
  const tests = [...new Set(answer.tests)];
  if (tests.length > MAX_SELECTED_TESTS || tests.some((test) => test.length > MAX_TEST_LENGTH)
    || tests.reduce((total, test) => total + Buffer.byteLength(test, "utf8"), 0) > MAX_SELECTED_TEST_BYTES) throw new Error("tests bound");
  // A test is appended to a command's arguments: never an option, an absolute path or a path leaving the project.
  if (tests.some((test) => test.startsWith("-") || test.startsWith("/") || test.startsWith("\\") || /^[A-Za-z]:/.test(test)
    || test.split(/[\\/]/).includes("..") || /[\0\r\n]/.test(test))) throw new Error("unsafe test entry");
  // A path-shaped id naming the project root selects everything: that is an `all` answer, not a selection.
  if (tests.some((test) => testIdPath(test) === ".")) throw new Error("a test id names the project root");
  const surfaces = [...new Set(answer.surfaces)];
  if (surfaces.some((id) => !declaredIds.includes(id))) throw new Error("undeclared surface");
  // One spelling per test file, so a selected test compares with report ids and changed paths.
  return { mode: answer.mode, tests: [...new Set(tests.map(normalizeTestId))], surfaces };
}
/** The reason a selected answer records. */
function selectedReason(tests, surfaces) { return tests.length || surfaces.length ? "selected" : "selection_empty"; }
/** Whether a stored selection still satisfies the answer contract and names existing tests, so it can be reused. */
function reusable(selection, root, declaredIds) {
  try {
    if (selection.mode !== "selected") return selection.mode === "all" && selection.reason === "selection_all";
    const answer = validateAnswer({ mode: selection.mode, tests: selection.tests, surfaces: selection.surfaces }, declaredIds);
    requireTestFiles(root, answer.tests);
    return canonicalJson(answer.tests) === canonicalJson(selection.tests) && selection.reason === selectedReason(answer.tests, answer.surfaces);
  } catch { return false; }
}

/**
 * Resolves the selection for one change-tier gate run of a manifest that declares `selection`. Returns
 * `{ mode, reason, fallbackPath, tests, surfaces, requiredSurfaces, model, effort, prompt, guidanceSupplied, reused, detail }`:
 * `mode` is `selected` or `all`; `reason` is `selected`, `selection_empty`, `fallback_path`, `selection_failed` or
 * `selection_all`. In `all` mode `surfaces` is every declared surface id.
 */
export async function resolveChangeSelection({ projectRoot, issue, baseRef, paths, runtime, models, runSelection = defaultRunSelection,
  packageRoot = defaultPackageRoot, headSha, signal, limits = {} } = {}) {
  const { timeoutMs = SELECTION_TIMEOUT_MS, maxOutputBytes = MAX_SELECTION_OUTPUT } = limits;
  const root = resolve(projectRoot);
  const surfaces = runtime.surfaces ?? [];
  const declaredIds = surfaces.map((surface) => surface.id);
  const { model, effort } = selectionModel(models);
  // A doc path requires no surface, so delivery's version commit (doc paths only) adds no required surface.
  const required = requiredSurfaces(surfaces, paths, runtime.selection?.docPaths ?? []);
  const head = headSha ?? git(root, ["rev-parse", "HEAD"]).trim();
  const all = (reason, extra = {}) => ({ mode: "all", reason, fallbackPath: null, tests: [], surfaces: [...declaredIds], requiredSurfaces: required,
    model, effort, prompt: null, guidanceSupplied: false, reused: false, detail: null, ...extra });
  const fallbackPath = paths.find((path) => matches(path, fallbackPathsOf(runtime)));
  if (fallbackPath !== undefined) return all("fallback_path", { fallbackPath });

  const guidance = readGuidance(root, issue, head);
  const rendered = renderSelectionPrompt(runtime, packageRoot);
  const prompt = { consumer: SELECTION_CONSUMER, fragments: rendered.provenance.fragments.map(({ id, hash: fragmentHash }) => ({ id, hash: fragmentHash })) };
  const { text: diff, digest: diffDigest } = changeDiffWithDigest(root, baseRef);
  const binding = {
    headSha: head,
    pathsDigest: hash(canonicalJson(paths)),
    diffDigest,
    steeringHash: runtime.steeringHash,
    promptHash: hash(rendered.text),
    guidanceHash: guidance ? hash(guidance) : null,
    model,
    effort,
  };
  const stored = readJson(selectionPath(root, issue));
  if (stored?.schemaVersion === 1 && canonicalJson(stored.binding) === canonicalJson(binding) && stored.selection && reusable(stored.selection, root, declaredIds)) {
    return { ...stored.selection, requiredSurfaces: required, reused: true };
  }

  const shared = { requiredSurfaces: required, model, effort, prompt, guidanceSupplied: Boolean(guidance), reused: false };
  const input = selectionInput({ text: rendered.text, baseRef, paths, diff, surfaces, inventory: testInventory(root, runtime), guidance });
  const command = claudeSelectionCommand({ model, effort });
  let selection;
  try {
    const response = await runSelection({ ...command, input, cwd: root, timeout: timeoutMs, maxOutput: maxOutputBytes, ...(signal ? { signal } : {}) });
    if (!response || response.error || response.status !== 0) {
      const stderr = String(response?.stderr ?? "").trim();
      throw new Error(`${response?.error?.message ?? `claude exited ${response?.status ?? "without a status"}${response?.signal ? ` (${response.signal})` : ""}`}${stderr ? `: ${stderr.slice(-300)}` : ""}`);
    }
    const answer = validateAnswer(answerFrom(response.stdout), declaredIds);
    // A test file the change deletes cannot run: it is dropped, and its path is accounted for like any changed path.
    const deleted = new Set(paths.filter((path) => !existsSync(join(root, path))));
    const tests = answer.tests.filter((test) => !deleted.has(testIdPath(test)));
    if (answer.mode === "selected") requireTestFiles(root, tests);
    selection = answer.mode === "all"
      ? all("selection_all", shared)
      : { mode: "selected", reason: selectedReason(tests, answer.surfaces), fallbackPath: null, tests, surfaces: answer.surfaces, ...shared, detail: null };
  } catch (error) {
    selection = all("selection_failed", { ...shared, detail: String(error.message).slice(0, 500) });
  }
  // A failed call is not stored, so the next run asks again.
  if (selection.reason !== "selection_failed") try {
    writeJson(selectionPath(root, issue), { schemaVersion: 1, issue: Number(issue), binding, selection, storedAt: new Date().toISOString() });
  } catch {}
  return selection;
}
