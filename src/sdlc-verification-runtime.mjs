import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { canonicalJson, loadSteeringRuntime, SteeringError, validationTier } from "./sdlc-steering-runtime.mjs";
import { acquireHeavySlot } from "./heavy-pool.mjs";
import { globRegex, matches } from "./sdlc-glob.mjs";
import { resolveChangeSelection } from "./sdlc-test-selection.mjs";
import { loadStageModels, StageModelsError } from "../scripts/sdlc-models.mjs";
import { loadTestCoverageConfig, validateCoverageReport } from "../scripts/test-coverage.mjs";
import { terminateOwnedProcessGroup, terminateOwnedProcessGroupAfterLeaderLoss } from "./process-supervision.mjs";

const SAFE_ENV = ["HOME", "PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "CI"];
const RESULT_STATUSES = new Set(["passed", "failed", "incomplete", "skipped", "not_applicable"]);
function hash(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
// The last `size` characters of a stream, behind a marker that counts what was cut.
function tailBounded(value, size = 65536) {
  const text = String(value ?? "");
  return text.length <= size ? text : `[truncated ${text.length - size} characters]\n${text.slice(-size)}`;
}
// Test-runner failure lines: pytest FAILED/ERROR summaries, Jest ● titles and TAP `not ok` lines.
const FAILURE_LINE = /^(?:FAILED |ERROR |not ok(?:\s|$)|●)/;
function extractFailures(text) {
  const failures = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!FAILURE_LINE.test(trimmed)) continue;
    failures.push(trimmed.slice(0, 500));
    if (failures.length === 100) break;
  }
  return failures;
}
// The full stdout and stderr of one command, written under the verification log directory; null when unwritable.
function writeCommandLog(request, stdout, stderr) {
  if (!request.logDir) return null;
  const artifact = `${request.logDir}/${request.validationId}.log`;
  try {
    const path = resolve(request.projectRoot, artifact);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `== stdout ==\n${stdout}\n== stderr ==\n${stderr}`, "utf8");
    return artifact;
  } catch { return null; }
}
function fail(reasonCode, detail = "") { throw new SteeringError(reasonCode, detail); }
function git(projectRoot, args, allowFailure = false) {
  // Dirty identity hashes full binary diffs; the default 1 MiB buffer rejects ordinary large changes.
  const result = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 * 1024 });
  if (result.error || (!allowFailure && result.status !== 0)) fail("steering_result_invalid", result.error?.message ?? result.stderr);
  return result;
}
function porcelainPaths(output) {
  const entries = output.split("\0");
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2)) && entries[index + 1]) paths.push(entries[index += 1]);
  }
  return paths;
}
export function changedPaths(projectRoot, baseRef) {
  const committed = git(projectRoot, ["diff", "--name-only", `${baseRef}...HEAD`]).stdout.split(/\r?\n/);
  const dirty = porcelainPaths(git(projectRoot, ["status", "--porcelain=v1", "-z"]).stdout);
  return [...new Set([...committed, ...dirty].filter(Boolean).map((path) => path.split("\\").join("/")))].sort();
}
function walk(root, prefix = "") {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(join(root, entry.name), relativePath) : [relativePath];
  });
}
export function evaluateCondition(when, { projectRoot, paths }) {
  if (when.kind === "always") return true;
  if (when.kind === "changed_paths") return paths.some((path) => matches(path, when.include) && !(when.exclude && matches(path, when.exclude)));
  if (when.kind === "path_exists") return existsSync(resolve(projectRoot, when.path));
  if (when.kind === "glob_exists") return walk(resolve(projectRoot, when.root)).some((path) => globRegex(when.pattern).test(path));
  fail("steering_condition_invalid");
}
function specHash(specDir) {
  const files = ["design.md", "feature.gherkin", "requirements.md", "tasks.md"];
  return hash(files.map((name) => `${name}\0${readFileSync(join(specDir, name))}`).join("\0"));
}
function hashUntrackedPath(projectRoot, relativePath) {
  const absolute = resolve(projectRoot, relativePath);
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) return `${relativePath}\0symlink\0${readlinkSync(absolute)}`;
  if (stat.isDirectory()) {
    return readdirSync(absolute, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))
      .map((entry) => hashUntrackedPath(projectRoot, `${relativePath.replace(/\/$/, "")}/${entry.name}`))
      .join("\0");
  }
  if (stat.isFile()) return `${relativePath}\0${hash(readFileSync(absolute))}`;
  return `${relativePath}\0other`;
}
function dirtyIdentity(projectRoot) {
  const status = git(projectRoot, ["status", "--porcelain=v1", "-z"]).stdout;
  if (!status) return { treeState: "clean", dirtyDiffHash: null };
  const staged = git(projectRoot, ["diff", "--cached", "--binary"]).stdout;
  const unstaged = git(projectRoot, ["diff", "--binary"]).stdout;
  const untracked = porcelainPaths(status).filter((path) => status.includes(`?? ${path}\0`)).sort()
    .map((path) => hashUntrackedPath(projectRoot, path)).join("\0");
  return { treeState: "dirty", dirtyDiffHash: hash(`${staged}\0${unstaged}\0${untracked}`) };
}
function identity(projectRoot, specDir, runtime, validation) {
  const headSha = git(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
  return Object.freeze({ headSha, ...dirtyIdentity(projectRoot), specHash: specDir ? specHash(specDir) : null, steeringHash: runtime.steeringHash, validationConfigHash: hash(canonicalJson(validation)) });
}
function resultEnvelope(status, summary, requestIdentity, evidence = []) { return { schemaVersion: 1, status, summary, identity: requestIdentity, evidence }; }
function validateProviderResult(result, requestIdentity) {
  if (!result || typeof result !== "object" || Array.isArray(result) || Object.keys(result).sort().join("\0") !== ["evidence", "identity", "schemaVersion", "status", "summary"].sort().join("\0") || result.schemaVersion !== 1 || !RESULT_STATUSES.has(result.status) || typeof result.summary !== "string" || !result.summary || !Array.isArray(result.evidence)) fail("steering_result_invalid");
  if (canonicalJson(result.identity) !== canonicalJson(requestIdentity)) fail("steering_evidence_stale");
  if (result.status === "passed" && result.evidence.length === 0) fail("steering_result_invalid");
  return result;
}
function commandProvider(request) {
  return new Promise((resolveResult) => {
    const { program, cwd, env } = request.config;
    // A change-tier selection replaces the arguments with the ones that run only the selected tests.
    const args = request.command?.args ?? request.config.args;
    const absoluteCwd = resolve(request.projectRoot, cwd || ".");
    if (!(absoluteCwd === request.projectRoot || absoluteCwd.startsWith(`${request.projectRoot}/`))) return resolveResult(resultEnvelope("incomplete", "command cwd escapes project", request.identity));
    if (request.signal?.aborted) return resolveResult(resultEnvelope("incomplete", "command cancelled", request.identity));
    const childEnv = Object.fromEntries(SAFE_ENV.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
    for (const key of env) if (process.env[key] !== undefined) childEnv[key] = process.env[key];
    let stdout = ""; let stderr = ""; let settled = false; let terminalOverride = null;
    let child;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (request.signal) request.signal.removeEventListener("abort", cancel);
      resolveResult(result);
    };
    const failureLines = () => extractFailures(`${stdout}\n${stderr}`);
    const evidence = (summary) => [{
      kind: "command",
      summary,
      artifact: writeCommandLog(request, stdout, stderr),
      headSha: request.identity.headSha,
      stdout: tailBounded(stdout),
      stderr: tailBounded(stderr),
      failures: failureLines(),
    }];
    // The envelope names the first failure lines, so the gate summary shows them without opening the log.
    const named = (summary) => {
      const failures = failureLines();
      return failures.length ? `${summary}; failures: ${failures.slice(0, 10).join(" | ")}` : summary;
    };
    const stop = async (leaderLost = false) => {
      const cleanup = await (leaderLost ? terminateOwnedProcessGroupAfterLeaderLoss : terminateOwnedProcessGroup)(child);
      if (!cleanup.ok) {
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref?.();
      }
      return cleanup;
    };
    const cancel = async () => {
      if (settled || terminalOverride) return;
      terminalOverride = "cancelled";
      const cleanup = await stop();
      settle(resultEnvelope("incomplete", cleanup.ok ? "command cancelled" : `command cancellation cleanup failed: ${cleanup.error.message}`, request.identity, evidence(`${program} ${args.join(" ")} cancelled`)));
    };
    try {
      child = (request.spawnCommand ?? spawn)(program, args, { cwd: absoluteCwd, env: childEnv, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      return settle(resultEnvelope("incomplete", `command launch failed: ${error.message}`, request.identity));
    }
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (!terminalOverride) settle(resultEnvelope("incomplete", `command launch failed: ${error.message}`, request.identity));
    });
    const completed = (code, signal) => {
      if (typeof code === "number") {
        return resultEnvelope(code === 0 ? "passed" : "failed", named(`command exited ${code}`), request.identity, evidence(`${program} ${args.join(" ")} exited ${code}${signal ? ` (${signal})` : ""}`));
      }
      if (signal) {
        return resultEnvelope("failed", named(`command exited by signal ${signal}`), request.identity, evidence(`${program} ${args.join(" ")} exited by signal ${signal}`));
      }
      return resultEnvelope("incomplete", "command process lost", request.identity, evidence(`${program} ${args.join(" ")} process lost`));
    };
    const lost = async (code, signal) => {
      if (terminalOverride || settled) return;
      terminalOverride = "process_lost";
      const cleanup = await stop(true);
      settle(cleanup.ok ? completed(code, signal) : resultEnvelope("incomplete", `command process-loss cleanup failed: ${cleanup.error.message}`, request.identity, evidence(`${program} ${args.join(" ")} process lost`)));
    };
    // close can be held open indefinitely by a descendant after leader loss.
    child.once("exit", (code, signal) => {
      if (typeof code !== "number") void lost(code, signal);
    });
    child.once("close", (code, signal) => {
      if (terminalOverride || settled) return;
      if (typeof code === "number") settle(completed(code, signal));
      else void lost(code, signal);
    });
    if (request.signal) request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal?.aborted) void cancel();
  });
}
function artifactProvider(request) {
  const path = resolve(request.projectRoot, request.config.path);
  if (!(path === request.projectRoot || path.startsWith(`${request.projectRoot}/`))) return resultEnvelope("incomplete", "artifact path escapes project", request.identity);
  if (!existsSync(path) || !statSync(path).isFile()) return resultEnvelope("failed", "artifact missing", request.identity);
  const content = readFileSync(path);
  for (const check of request.config.checks) {
    if (check === "nonempty" && content.length === 0) return resultEnvelope("failed", "artifact empty", request.identity);
    if (check === "json") { try { JSON.parse(content); } catch { return resultEnvelope("failed", "artifact is not JSON", request.identity); } }
    if (typeof check === "object" && check?.kind === "sha256" && hash(content) !== check.value) return resultEnvelope("failed", "artifact hash mismatch", request.identity);
    if (typeof check === "object" && check?.kind === "contains" && !content.toString("utf8").includes(check.value)) return resultEnvelope("failed", "artifact content mismatch", request.identity);
  }
  return resultEnvelope("passed", "artifact checks passed", request.identity, [{ kind: "artifact", summary: request.config.path, artifact: request.config.path }]);
}
function externalProvider(request) {
  const path = resolve(request.projectRoot, request.config.path);
  if (!(path === request.projectRoot || path.startsWith(`${request.projectRoot}/`)) || !existsSync(path)) return resultEnvelope("incomplete", "external evidence missing", request.identity);
  try { return validateProviderResult(JSON.parse(readFileSync(path, "utf8")), request.identity); } catch (error) { return resultEnvelope("incomplete", error.reasonCode ?? "external evidence malformed", request.identity); }
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value) || value instanceof AbortSignal) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function providerRequest(value, signal, spawnCommand) {
  Object.defineProperties(value, {
    signal: { value: signal, enumerable: false },
    spawnCommand: { value: spawnCommand, enumerable: false },
  });
  return deepFreeze(value);
}

async function invokeProvider(runtime, validation, request) {
  if (validation.provider === "builtin.command") return commandProvider(request);
  if (validation.provider === "builtin.artifact") return artifactProvider(request);
  if (validation.provider === "builtin.external-evidence") return externalProvider(request);
  if (request.signal?.aborted) {
    const error = new Error("provider cancelled");
    error.reasonCode = "cancelled";
    throw error;
  }
  const providerPromise = Promise.resolve().then(
    () => runtime.providers.get(validation.provider).handler(request),
  );
  providerPromise.catch(() => {});
  if (!request.signal) return providerPromise;
  let cancel;
  try {
    return await Promise.race([
      providerPromise,
      new Promise((_, reject) => {
        cancel = () => {
          const error = new Error("provider cancelled");
          error.reasonCode = "cancelled";
          reject(error);
        };
        request.signal.addEventListener("abort", cancel, { once: true });
        if (request.signal.aborted) cancel();
      }),
    ]);
  } finally {
    request.signal.removeEventListener("abort", cancel);
  }
}
export function validationResultCoverage(validations, results) {
  const declaredIds = validations.map(({ id }) => id);
  const declared = new Set(declaredIds);
  const counts = new Map();
  const unknown = [];
  for (const { id } of results) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!declared.has(id) && !unknown.includes(id)) unknown.push(id);
  }
  const missing = declaredIds.filter((id) => !counts.has(id));
  const duplicate = [...counts]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  return {
    declared: declaredIds.length,
    recorded: results.length,
    complete: missing.length === 0 && duplicate.length === 0 && unknown.length === 0,
    missing,
    duplicate,
    unknown,
  };
}

export function verificationCeiling(results, coverage = { complete: true }) {
  if (!coverage.complete) return "Incomplete";
  const required = results.filter((result) => result.required && result.applicable);
  if (required.some((result) => result.effectiveStatus === "incomplete")) return "Incomplete";
  if (required.some((result) => result.effectiveStatus !== "passed")) return "Fail";
  return null;
}
function writeVerificationArtifact(root, issue, artifact) {
  const path = join(root, ".nmg-sdlc", "verification", `${issue}.json`);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}
function setupIdentity(root, specDir, runtime) {
  let headSha = null;
  let currentSpecHash = null;
  try { headSha = git(root, ["rev-parse", "HEAD"]).stdout.trim(); } catch {}
  try { currentSpecHash = specDir ? specHash(specDir) : null; } catch {}
  return { headSha, steeringHash: runtime?.steeringHash ?? null, specHash: currentSpecHash };
}
/** Whether a validation runs in a `tier` run. A project that declares no tier runs everything in either. */
export function runsInTier(tiered, validation, tier) {
  return !tiered || validationTier(validation) === tier;
}
/** The selection checks' rejection: `{ reasonCode, uncovered, missingSurfaces, unaccounted }`. */
function rejectionOf(reasonCode, { uncovered = [], missingSurfaces = [], unaccounted = [] } = {}) {
  return { reasonCode, uncovered, missingSurfaces, unaccounted };
}
function rejectionSummary(rejection) {
  const named = [...rejection.missingSurfaces, ...rejection.uncovered, ...rejection.unaccounted];
  return named.length ? `${rejection.reasonCode}: ${named.slice(0, 50).join(", ")}${named.length > 50 ? `, and ${named.length - 50} more` : ""}` : rejection.reasonCode;
}
/** New-side line numbers per path of `git diff -U0` output. */
export function parseChangedLines(diff) {
  const lines = new Map();
  let current = null;
  for (const line of String(diff).split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4);
      current = target === "/dev/null" ? null : target.replace(/^b\//, "");
      if (current && !lines.has(current)) lines.set(current, new Set());
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const startLine = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let n = startLine; n < startLine + count; n += 1) lines.get(current).add(n);
    }
  }
  return lines;
}
/** Changed working-tree lines per path since the merge base with `baseRef`; an untracked file changes every line. */
function changedLines(projectRoot, baseRef) {
  const mergeBase = git(projectRoot, ["merge-base", baseRef, "HEAD"]).stdout.trim();
  const lines = parseChangedLines(git(projectRoot, ["-c", "core.quotepath=off", "diff", "-U0", "--no-color", "--no-ext-diff", mergeBase]).stdout);
  const status = git(projectRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout;
  for (const entry of status.split("\0")) {
    if (!entry.startsWith("?? ")) continue;
    const path = entry.slice(3);
    try {
      const count = readFileSync(resolve(projectRoot, path), "utf8").split("\n").length;
      lines.set(path, new Set(Array.from({ length: count }, (_, index) => index + 1)));
    } catch {}
  }
  return lines;
}
/**
 * The coverage check: runs the project's per-test coverage command for the selected tests and returns
 * `{ status: "skipped" | "failed" | "checked", summary?, report?, coverage? }`. Without a valid
 * steering/test-coverage.json nothing is coverage-accounted and nothing fails.
 */
function coverageCheck({ projectRoot, baseRef, paths, tests, runSync }) {
  let config;
  try { config = loadTestCoverageConfig(projectRoot).config; } catch { config = null; }
  if (!config || !tests.length) return { status: "skipped" };
  let report;
  try {
    const response = runSync(config.coverage.program, config.coverage.args.concat(tests), { cwd: projectRoot, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 * 1024 });
    if (!response || response.error || response.status !== 0) return { status: "failed", summary: `coverage command failed: ${response?.error?.message ?? `exited ${response?.status}`}` };
    report = validateCoverageReport(JSON.parse(String(response.stdout ?? "")));
  } catch (error) {
    return { status: "failed", summary: `coverage report invalid: ${String(error.message).slice(0, 300)}` };
  }
  const lineOf = (entry) => { const at = entry.lastIndexOf(":"); return [entry.slice(0, at), Number(entry.slice(at + 1))]; };
  const reported = new Set([...report.tests.flatMap((test) => test.lines), ...(report.executableLines ?? [])].map((entry) => lineOf(entry)[0]));
  const executable = report.executableLines ? new Set(report.executableLines) : null;
  const hit = new Set(report.tests.flatMap((test) => test.lines));
  const changed = changedLines(projectRoot, baseRef);
  const changedList = [];
  for (const path of paths.filter((candidate) => reported.has(candidate))) {
    let text = null;
    try { text = readFileSync(resolve(projectRoot, path), "utf8").split("\n"); } catch {}
    for (const line of [...(changed.get(path) ?? [])].sort((a, b) => a - b)) {
      const entry = `${path}:${line}`;
      if (executable ? executable.has(entry) : (text && text[line - 1] !== undefined && text[line - 1].trim() !== "")) changedList.push(entry);
    }
  }
  const hitLines = changedList.filter((entry) => hit.has(entry));
  const uncovered = changedList.filter((entry) => !hit.has(entry));
  return { status: "checked", report, reported, coverage: { changedLines: changedList, hitLines, uncovered } };
}
/** Loads the selection model configuration, failing as `stage_models_invalid`. */
function selectionModels(projectRoot) {
  try { return loadStageModels(projectRoot).config; } catch (error) {
    if (error instanceof StageModelsError) fail("stage_models_invalid", error.message);
    throw error;
  }
}
export async function runSteeringValidations({ projectRoot, issue, specDir, baseRef = "main", verificationRunId = null, signal, spawnCommand,
  tier: requestedTier = "pre-merge", acquireSlot = acquireHeavySlot, runSync = spawnSync, runSelection, models, selectOnly = false } = {}) {
  const root = resolve(projectRoot);
  // `pre-merge` runs the untiered and `change` validations; `full` runs only the `full` ones.
  const tier = requestedTier === "full" ? "full" : "change";
  const recordedTier = tier === "full" ? "full" : "pre-merge";
  // A full run belongs to a commit, not an issue: it has no spec, no base to diff against, and ignores changed-path conditions.
  const whole = tier === "full" && (issue === undefined || issue === null);
  const key = whole ? "full" : issue;
  let runtime;
  try {
    runtime = await loadSteeringRuntime(root);
    const paths = whole ? [] : changedPaths(root, baseRef);
    const applies = (validation) => runsInTier(runtime.tiered, validation, tier)
      && ((whole && validation.when.kind === "changed_paths") || evaluateCondition(validation.when, { projectRoot: root, paths }));
    const resultById = new Map();
    const base = (validation) => ({ id: validation.id, provider: validation.provider, required: validation.required,
      tier: validation.tier ?? null, selection: null });
    // Change selection: one Claude call before any validation runs, so a concurrent batch never waits on it.
    let selection = null;
    let rejection = null;
    let docsOnly = false;
    if (tier === "change" && !whole && runtime.selection) {
      selection = resolveChangeSelection({ projectRoot: root, issue, baseRef, paths, runtime,
        models: models ?? selectionModels(root), ...(runSelection ? { runSelection } : {}) });
      if (selection.mode === "selected") {
        const missingSurfaces = selection.requiredSurfaces.filter((id) => !selection.surfaces.includes(id));
        if (missingSurfaces.length) rejection = rejectionOf("selection_surface_missing", { missingSurfaces });
        else if (!selection.tests.length && !selection.surfaces.length) {
          docsOnly = Boolean(runtime.selection.docPaths) && paths.every((path) => matches(path, runtime.selection.docPaths));
          if (!docsOnly) rejection = rejectionOf("selection_empty_code_change", { unaccounted: paths.filter((path) => !matches(path, runtime.selection.docPaths ?? [])) });
        }
      }
    }
    if (selectOnly) return { selection };
    const selectedSurfaces = !selection ? null : selection.mode === "all" ? runtime.surfaces.map((surface) => surface.id) : docsOnly ? [] : selection.surfaces;
    const boundSurfaces = (validation) => runtime.surfaces.filter((surface) => surface.validations.includes(validation.id)).map((surface) => surface.id);
    const optedIn = (validation) => Boolean(selection) && validation.selection === true;
    const surfaceBound = (validation) => Boolean(selection) && boundSurfaces(validation).length > 0;
    const affected = (validation) => optedIn(validation) || (surfaceBound(validation) && rejection?.reasonCode !== "selection_uncovered");
    const resultSelection = (reason) => ({ provider: `claude:${selection.model}`, reason, fallbackPath: selection.fallbackPath, selectedCount: selection.mode === "selected" ? selection.tests.length : null });
    const requestFor = (validation) => providerRequest({
      schemaVersion: 1,
      validationId: validation.id,
      projectRoot: root,
      logDir: `.nmg-sdlc/verification/${key}`,
      config: structuredClone(validation.config),
      ...(optedIn(validation) && selection.mode === "selected" && selection.tests.length ? { command: { args: validation.config.args.concat(selection.tests) } } : {}),
      ...(selection ? { changedPaths: [...paths], selection: { mode: selection.mode, reason: docsOnly ? "selection_empty" : selection.reason, surfaces: [...selectedSurfaces] } } : {}),
      identity: identity(root, specDir, runtime, validation),
      verification: verificationRunId && !whole ? {
        runId: verificationRunId,
        issue: Number(issue),
        specPath: relative(root, resolve(specDir)).split("\\").join("/"),
      } : null,
    }, signal, spawnCommand);
    // Runs one applicable validation: its selection, its heavy-job slot, then the provider.
    const execute = async (validation, deferred = false) => {
      const request = requestFor(validation);
      const reason = !optedIn(validation) ? null : selection.mode === "all" ? selection.reason
        : docsOnly || !selection.tests.length ? "selection_empty" : selection.reason;
      const recorded = optedIn(validation) ? { selection: resultSelection(reason) } : {};
      const unselected = surfaceBound(validation) && !boundSurfaces(validation).some((id) => selectedSurfaces.includes(id));
      if (rejection && affected(validation)) {
        const summary = rejectionSummary(rejection);
        return { ...base(validation), applicable: true, effectiveStatus: "failed", ...(optedIn(validation) ? recorded : { selection: resultSelection(rejection.reasonCode) }), request,
          result: resultEnvelope("failed", summary, request.identity, [{ kind: "selection", summary, headSha: request.identity.headSha }]) };
      }
      if (unselected) {
        return { ...base(validation), applicable: true, effectiveStatus: "passed", selection: resultSelection("surface_not_selected"), request,
          result: resultEnvelope("passed", "no bound surface is selected for this change", request.identity,
            [{ kind: "selection", summary: "surface_not_selected: no bound surface selected", headSha: request.identity.headSha }]) };
      }
      if (deferred) {
        const defer = resultEnvelope("incomplete", "deferred until required local validations pass", request.identity);
        return { ...base(validation), applicable: true, effectiveStatus: "incomplete", request, result: defer };
      }
      let result;
      let pool = null;
      let held = null;
      try {
        if (reason === "selection_empty") {
          result = resultEnvelope("passed", "the selection selected no tests for this change", request.identity,
            [{ kind: "selection", summary: "selection_empty: 0 tests selected", headSha: request.identity.headSha }]);
        } else {
          if (validation.heavy === true) {
            held = await acquireSlot({ label: whole ? `${validation.id} (full)` : `${validation.id} (#${issue})`, projectRoot: root, issue: whole ? null : Number(issue), signal });
            pool = { slot: held.slot, waitedMs: held.waitedMs };
          }
          result = validateProviderResult(await invokeProvider(runtime, validation, request), request.identity);
          if (result.status === "skipped" || result.status === "not_applicable") result = resultEnvelope("incomplete", "applicable provider attempted to skip", request.identity);
        }
      } catch (error) {
        result = resultEnvelope("incomplete", error.reasonCode ?? `provider crashed: ${error.message}`, request.identity);
      } finally {
        held?.release();
      }
      return { ...base(validation), applicable: true, effectiveStatus: result.status, ...recorded, ...(pool ? { heavy: pool } : {}), request, result };
    };
    // Phase 1: run required local builtin.command validations, and those opted into the selection, first.
    let localRequiredCommandsPassed = true;
    for (const validation of runtime.validations) {
      if (!applies(validation)) {
        resultById.set(validation.id, { ...base(validation), applicable: false, effectiveStatus: "skipped", result: null });
        continue;
      }
      if (validation.provider === "builtin.command" && (validation.required || optedIn(validation))) {
        const entry = await execute(validation);
        resultById.set(validation.id, entry);
        if (validation.required && entry.effectiveStatus !== "passed") localRequiredCommandsPassed = false;
      }
    }
    // The selection checks: changed lines covered by the selected tests, then every changed path accounted for.
    if (selection?.mode === "selected" && !rejection && !docsOnly) {
      const optedResults = runtime.validations.filter((validation) => optedIn(validation) && resultById.get(validation.id)?.applicable).map((validation) => resultById.get(validation.id));
      const ran = optedResults.filter((entry) => entry.selection?.reason === "selected");
      let reportPaths = new Set();
      let testFiles = new Set();
      if (ran.length && ran.every((entry) => entry.effectiveStatus === "passed")) {
        const checked = coverageCheck({ projectRoot: root, baseRef, paths, tests: selection.tests, runSync });
        if (checked.status === "failed") {
          for (const entry of ran) {
            entry.effectiveStatus = "failed";
            entry.selection = { ...entry.selection, reason: "coverage_failed" };
            entry.result = resultEnvelope("failed", checked.summary, entry.request.identity, [{ kind: "selection", summary: checked.summary, headSha: entry.request.identity.headSha }]);
          }
        } else if (checked.status === "checked") {
          reportPaths = checked.reported;
          testFiles = new Set(checked.report.tests.map((test) => test.file));
          for (const entry of ran) entry.coverage = checked.coverage;
          if (checked.coverage.uncovered.length) rejection = rejectionOf("selection_uncovered", { uncovered: checked.coverage.uncovered });
        }
      }
      if (!rejection) {
        const surfaceSources = runtime.surfaces.filter((surface) => selection.surfaces.includes(surface.id)).flatMap((surface) => surface.sources);
        const fallbackPaths = [...(runtime.selection.fallbackPaths ?? []), ...runtime.validations.flatMap((validation) => validation.fallbackPaths ?? [])];
        const unaccounted = paths.filter((path) => !reportPaths.has(path) && !testFiles.has(path) && !matches(path, surfaceSources)
          && !matches(path, runtime.selection.docPaths ?? []) && !matches(path, fallbackPaths));
        if (unaccounted.length) rejection = rejectionOf("selection_unaccounted", { unaccounted });
      }
      if (rejection) {
        const summary = rejectionSummary(rejection);
        for (const entry of optedResults) {
          entry.effectiveStatus = "failed";
          entry.result = resultEnvelope("failed", summary, entry.request.identity, [...(entry.result?.evidence ?? []), { kind: "selection", summary, headSha: entry.request.identity.headSha }]);
        }
      }
    }
    // Phase 2: non-local-required applicable validations. Unflagged ones run one at a time in manifest order;
    // the `concurrent: true` ones all start together at the first one's position. `execute` never rejects,
    // so every batch member settles and records its own result.
    const deferred = (validation) => !String(validation.provider).startsWith("builtin.") && !localRequiredCommandsPassed;
    const pending = runtime.validations.filter((validation) => !resultById.has(validation.id));
    const batch = pending.filter((validation) => validation.concurrent === true);
    let batchRun = false;
    for (const validation of pending) {
      if (validation.concurrent !== true) {
        resultById.set(validation.id, await execute(validation, deferred(validation)));
      } else if (!batchRun) {
        batchRun = true;
        await Promise.all(batch.map((member) => execute(member, deferred(member)).then((entry) => resultById.set(member.id, entry))));
      }
    }
    const results = runtime.validations.map((v) => resultById.get(v.id)).filter(Boolean);
    const coverage = validationResultCoverage(runtime.validations, results);
    const artifact = { schemaVersion: 1, issue: whole ? null : Number(issue), generatedAt: new Date().toISOString(), identity: setupIdentity(root, specDir, runtime), baseRef: whole ? null : baseRef, ...(runtime.tiered || whole ? { tier: recordedTier } : {}), ceiling: verificationCeiling(results, coverage), changedPaths: paths, coverage,
      ...(selection ? { selection: { prompt: selection.prompt, model: selection.model, effort: selection.effort, mode: selection.mode,
        reason: docsOnly ? "selection_empty" : selection.reason, fallbackPath: selection.fallbackPath, tests: selection.tests, surfaces: selectedSurfaces,
        requiredSurfaces: selection.requiredSurfaces, guidanceSupplied: selection.guidanceSupplied, reused: selection.reused, detail: selection.detail, rejection } } : {}),
      results };
    writeVerificationArtifact(root, key, artifact);
    return artifact;
  } catch (error) {
    if (selectOnly) throw error;
    const artifact = {
      schemaVersion: 1,
      issue: whole ? null : Number(issue),
      generatedAt: new Date().toISOString(),
      identity: setupIdentity(root, specDir, runtime),
      ceiling: "Incomplete",
      changedPaths: [],
      runtimeError: {
        reasonCode: error.reasonCode ?? "steering_result_invalid",
        summary: error.message,
      },
      results: [],
    };
    writeVerificationArtifact(root, key, artifact);
    return artifact;
  }
}
