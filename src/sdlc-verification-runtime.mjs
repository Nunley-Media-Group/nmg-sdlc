import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { canonicalJson, loadSteeringRuntime, SteeringError } from "./sdlc-steering-runtime.mjs";

const SAFE_ENV = ["HOME", "PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "CI"];
const RESULT_STATUSES = new Set(["passed", "failed", "incomplete", "skipped", "not_applicable"]);
function hash(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function bounded(value, size = 65536) { const text = String(value ?? ""); return text.length <= size ? text : `${text.slice(0, size)}\n[truncated]`; }
function fail(reasonCode, detail = "") { throw new SteeringError(reasonCode, detail); }
function globRegex(glob) {
  let source = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") { source += ".*"; i += 1; }
    else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}
function matches(path, patterns) { return patterns.some((pattern) => globRegex(pattern).test(path)); }
function git(projectRoot, args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8", shell: false, timeout: 30000 });
  if (result.error || (!allowFailure && result.status !== 0)) fail("steering_result_invalid", result.error?.message ?? result.stderr);
  return result;
}
function changedPaths(projectRoot, baseRef) {
  const committed = git(projectRoot, ["diff", "--name-only", `${baseRef}...HEAD`], true).stdout.split(/\r?\n/);
  const dirty = git(projectRoot, ["status", "--porcelain=v1", "-z"], true).stdout.split("\0").map((entry) => entry.slice(3));
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
function dirtyIdentity(projectRoot) {
  const status = git(projectRoot, ["status", "--porcelain=v1", "-z"]).stdout;
  if (!status) return { treeState: "clean", dirtyDiffHash: null };
  const staged = git(projectRoot, ["diff", "--cached", "--binary"]).stdout;
  const unstaged = git(projectRoot, ["diff", "--binary"]).stdout;
  const untracked = status.split("\0").filter((x) => x.startsWith("?? ")).map((entry) => entry.slice(3)).sort().map((path) => `${path}\0${hash(readFileSync(resolve(projectRoot, path)))}`).join("\0");
  return { treeState: "dirty", dirtyDiffHash: hash(`${staged}\0${unstaged}\0${untracked}`) };
}
function identity(projectRoot, specDir, runtime, validation) {
  const headSha = git(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
  return Object.freeze({ headSha, ...dirtyIdentity(projectRoot), specHash: specHash(specDir), steeringHash: runtime.steeringHash, validationConfigHash: hash(canonicalJson(validation)) });
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
    const { program, args, cwd, env } = request.config;
    const absoluteCwd = resolve(request.projectRoot, cwd || ".");
    if (!(absoluteCwd === request.projectRoot || absoluteCwd.startsWith(`${request.projectRoot}/`))) return resolveResult(resultEnvelope("incomplete", "command cwd escapes project", request.identity));
    const childEnv = Object.fromEntries(SAFE_ENV.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
    for (const key of env) if (process.env[key] !== undefined) childEnv[key] = process.env[key];
    let stdout = ""; let stderr = ""; let settled = false;
    const child = spawn(program, args, { cwd: absoluteCwd, env: childEnv, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, request.timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); resolveResult(resultEnvelope("incomplete", `command launch failed: ${error.message}`, request.identity)); } });
    child.on("close", (code, signal) => { if (settled) return; settled = true; clearTimeout(timer); const timedOut = signal === "SIGKILL"; const status = timedOut ? "incomplete" : code === 0 ? "passed" : "failed"; resolveResult(resultEnvelope(status, timedOut ? "command timed out" : `command exited ${code}`, request.identity, [{ kind: "command", summary: `${program} ${args.join(" ")} exited ${code}`, artifact: null, stdout: bounded(stdout), stderr: bounded(stderr) }])); });
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
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

async function invokeProvider(runtime, validation, request) {
  if (validation.provider === "builtin.command") return commandProvider(request);
  if (validation.provider === "builtin.artifact") return artifactProvider(request);
  if (validation.provider === "builtin.external-evidence") return externalProvider(request);
  const extensionRequest = deepFreeze(structuredClone(request));
  let timer;
  try {
    return await Promise.race([
      runtime.providers.get(validation.provider).handler(extensionRequest),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("provider timed out")), request.timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function verificationCeiling(results) {
  const required = results.filter((result) => result.required && result.applicable);
  if (required.some((result) => result.effectiveStatus === "incomplete")) return "Incomplete";
  if (required.some((result) => result.effectiveStatus !== "passed")) return "Fail";
  return null;
}
export async function runSteeringValidations({ projectRoot, issue, specDir, baseRef = "main" }) {
  const root = resolve(projectRoot);
  let runtime;
  try {
    runtime = await loadSteeringRuntime(root);
  } catch (error) {
    const artifact = {
      schemaVersion: 1,
      issue: Number(issue),
      generatedAt: new Date().toISOString(),
      identity: {
        headSha: git(root, ["rev-parse", "HEAD"]).stdout.trim(),
        steeringHash: null,
        specHash: specHash(specDir),
      },
      ceiling: "Incomplete",
      changedPaths: [],
      runtimeError: {
        reasonCode: error.reasonCode ?? "steering_manifest_invalid",
        summary: error.message,
      },
      results: [],
    };
    const artifactPath = join(root, ".omp", "sdlc", "verification", `${issue}.json`);
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return artifact;
  }
  const paths = changedPaths(root, baseRef);
  const results = [];
  for (const validation of runtime.validations) {
    const applicable = evaluateCondition(validation.when, { projectRoot: root, paths });
    if (!applicable) { results.push({ id: validation.id, provider: validation.provider, required: validation.required, applicable: false, effectiveStatus: "skipped", result: null }); continue; }
    const request = deepFreeze({ schemaVersion: 1, validationId: validation.id, projectRoot: root, timeoutMs: validation.timeoutMs, config: structuredClone(validation.config), identity: identity(root, specDir, runtime, validation) });
    let result;
    try {
      result = validateProviderResult(await invokeProvider(runtime, validation, request), request.identity);
      if (result.status === "skipped" || result.status === "not_applicable") result = resultEnvelope("incomplete", "applicable provider attempted to skip", request.identity);
    } catch (error) {
      result = resultEnvelope("incomplete", error.reasonCode ?? `provider crashed: ${error.message}`, request.identity);
    }
    results.push({ id: validation.id, provider: validation.provider, required: validation.required, applicable: true, effectiveStatus: result.status, request, result });
  }
  const artifact = { schemaVersion: 1, issue: Number(issue), generatedAt: new Date().toISOString(), identity: { headSha: git(root, ["rev-parse", "HEAD"]).stdout.trim(), steeringHash: runtime.steeringHash, specHash: specHash(specDir) }, ceiling: verificationCeiling(results), changedPaths: paths, results };
  const path = join(root, ".omp", "sdlc", "verification", `${issue}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifact;
}
