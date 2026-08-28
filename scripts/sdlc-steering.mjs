#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSteeringRuntime, projectPromptFragments, SteeringError } from "../src/sdlc-steering-runtime.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROLES = ["product", "tech", "structure", "verification"];
const PLAN_KEYS = new Set(["schemaVersion", "mode", "sourceDigest", "actions"]);
const ACTION_KEYS = new Set(["op", "path", "content", "template"]);

function sha(value) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function json(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function fail(reasonCode, detail = "") { throw new SteeringError(reasonCode, detail); }
function projectPath(projectRoot, path) {
  if (typeof path !== "string" || !path.startsWith("steering/") || path.split("/").includes("..")) fail("steering_path_outside_root");
  const absolute = resolve(projectRoot, path);
  if (!(absolute === resolve(projectRoot, "steering") || absolute.startsWith(`${resolve(projectRoot, "steering")}/`))) fail("steering_path_outside_root");
  return absolute;
}
function rejectSymlinkPath(projectRoot, target) {
  const root = resolve(projectRoot);
  const parts = relative(root, target).split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) fail("steering_apply_failed", `${relative(root, current)} is a symbolic link`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return;
    }
  }
}


export function steeringSourceDigest(projectRoot) {
  const root = resolve(projectRoot, "steering");
  if (!existsSync(root)) return sha("missing");
  const visit = (directory) => {
    return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
      const absolute = join(directory, entry.name);
      const path = relative(projectRoot, absolute).split("\\").join("/");
      if (entry.isSymbolicLink()) return [`${path}\0symlink\0${readlinkSync(absolute)}`];
      if (entry.isDirectory()) return visit(absolute);
      if (entry.isFile()) return [`${path}\0${sha(readFileSync(absolute))}`];
      return [`${path}\0other`];
    });
  };
  return sha(visit(root).join("\0"));
}


export function createInitializePlan(projectRoot, { snippets = [], validations = [] } = {}) {
  const actions = [];
  const managedFiles = [];
  const modules = [];
  for (const role of ROLES) {
    const template = `workflows/steering/templates/modules/${role}.mjs`;
    const content = readFileSync(join(packageRoot, template), "utf8");
    const path = `steering/modules/${role}.mjs`;
    actions.push({ op: "write", path, template });
    managedFiles.push({ path, template, sha256: sha(content) });
    modules.push({ id: role, role, path });
  }
  for (const snippet of snippets) actions.push({ op: "write", path: snippet.path, content: snippet.content });
  const canonicalValidations = validations.map(({ timeoutMs: _legacyTimeoutMs, ...validation }) => validation);
  const manifest = { schemaVersion: 1, runtimeVersion: "1", managedFiles, modules, snippets: snippets.map(({ content: _content, ...record }) => record), extensions: [], validations: canonicalValidations };
  actions.push({ op: "write", path: "steering/manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` });
  return { schemaVersion: 1, mode: "initialize", sourceDigest: steeringSourceDigest(projectRoot), actions };
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan) || Object.keys(plan).some((key) => !PLAN_KEYS.has(key)) || Object.keys(plan).length !== PLAN_KEYS.size) fail("steering_apply_failed", "invalid plan");
  if (plan.schemaVersion !== 1 || !["initialize", "update", "migrate"].includes(plan.mode) || !/^sha256:[0-9a-f]{64}$/.test(plan.sourceDigest) || !Array.isArray(plan.actions) || !plan.actions.length) fail("steering_apply_failed", "invalid plan");
  const modulePaths = new Set(ROLES.map((role) => `steering/modules/${role}.mjs`));
  const allowedWrite = (target) => target === "steering/manifest.json"
    || modulePaths.has(target)
    || target.startsWith("steering/snippets/")
    || target.startsWith("steering/extensions/");
  const allowedDelete = (target) => ["migrate", "update"].includes(plan.mode)
    && ROLES.slice(0, 3).some((role) => target === `steering/${role}.md`);
  const seen = new Set();
  for (const action of plan.actions) {
    if (!action || typeof action !== "object" || Array.isArray(action) || Object.keys(action).some((key) => !ACTION_KEYS.has(key)) || !["write", "delete"].includes(action.op) || typeof action.path !== "string") fail("steering_apply_failed", "invalid action");
    if (action.op === "write" ? !allowedWrite(action.path) : !allowedDelete(action.path)) fail("steering_apply_failed", "action outside managed scope");
    if (seen.has(action.path)) fail("steering_apply_failed", "duplicate action");
    seen.add(action.path);
    if (action.op === "write" && (typeof action.content === "string") === (typeof action.template === "string")) fail("steering_apply_failed", "write needs content xor template");
    if (modulePaths.has(action.path) && action.template !== `workflows/steering/templates/modules/${action.path.split("/").at(-1)}`) fail("steering_apply_failed", "managed module must use its template");
    if (action.template && !modulePaths.has(action.path)) fail("steering_apply_failed", "template outside managed module");
    if (action.op === "delete" && (Object.hasOwn(action, "content") || Object.hasOwn(action, "template"))) fail("steering_apply_failed", "delete payload");
  }
}

function copyProjectSteering(projectRoot, candidateRoot) {
  const source = resolve(projectRoot, "steering");
  if (existsSync(source)) cpSync(source, resolve(candidateRoot, "steering"), { recursive: true, dereference: false, errorOnExist: false });
}

export async function applySteeringPlan(projectRoot, plan) {
  const root = resolve(projectRoot);
  validatePlan(plan);
  if (steeringSourceDigest(root) !== plan.sourceDigest) fail("steering_plan_stale");
  const parent = dirname(root);
  const candidateRoot = mkdtempSync(join(parent, ".nmg-sdlc-steering-"));
  const staged = [];
  try {
    copyProjectSteering(root, candidateRoot);
    for (const action of plan.actions) {
      const candidate = projectPath(candidateRoot, action.path);
      rejectSymlinkPath(candidateRoot, candidate);
      if (action.op === "delete") {
        rmSync(candidate, { force: true });
        continue;
      }
      mkdirSync(dirname(candidate), { recursive: true });
      const content = action.template ? readFileSync(resolve(packageRoot, action.template)) : Buffer.from(action.content, "utf8");
      writeFileSync(candidate, content);
    }
    await loadSteeringRuntime(candidateRoot);
    if (steeringSourceDigest(root) !== plan.sourceDigest) fail("steering_plan_stale");
    for (const action of plan.actions) {
      const live = projectPath(root, action.path);
      rejectSymlinkPath(root, live);
      if (action.op === "delete") {
        if (existsSync(live) && !lstatSync(live).isFile()) fail("steering_apply_failed", `${action.path} is not a regular file`);
        rmSync(live, { force: true });
      } else {
        mkdirSync(dirname(live), { recursive: true });
        const temporary = `${live}.nmg-sdlc-${process.pid}`;
        writeFileSync(temporary, readFileSync(projectPath(candidateRoot, action.path)));
        renameSync(temporary, live);
      }
      staged.push(action.path);
    }
    const runtime = await loadSteeringRuntime(root);
    return { ok: true, mode: plan.mode, paths: staged, steeringHash: runtime.steeringHash, registrationHash: runtime.registrationHash };
  } catch (error) {
    const applied = staged.length ? `; applied: ${staged.join(", ")}` : "";
    if (error instanceof SteeringError) {
      if (!applied) throw error;
      fail(error.reasonCode, `${error.message}${applied}`);
    }
    fail("steering_apply_failed", `${error.message}${applied}`);
  } finally {
    rmSync(candidateRoot, { recursive: true, force: true });
  }
}

export async function inspectSteering(projectRoot) {
  const root = resolve(projectRoot);
  if (!existsSync(join(root, "steering", "manifest.json"))) return { ok: true, state: "uninitialized", sourceDigest: steeringSourceDigest(root) };
  try {
    const runtime = await loadSteeringRuntime(root);
    return { ok: true, state: "valid", sourceDigest: steeringSourceDigest(root), steeringHash: runtime.steeringHash, registrationHash: runtime.registrationHash, manifest: runtime.manifest };
  } catch (error) {
    return { ok: false, state: "invalid", sourceDigest: steeringSourceDigest(root), reasonCode: error.reasonCode ?? "steering_manifest_invalid", message: error.message };
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith("--") || rest[index + 1] === undefined) fail("steering_apply_failed", "invalid arguments");
    values[rest[index].slice(2)] = rest[index + 1];
  }
  if (!values.project) fail("steering_apply_failed", "--project required");
  return { command, values };
}

export async function main(argv = process.argv.slice(2)) {
  const { command, values } = parseArgs(argv);
  if (command === "inspect") return json(await inspectSteering(values.project));
  if (command === "validate") {
    const runtime = await loadSteeringRuntime(values.project);
    return json({ ok: true, steeringHash: runtime.steeringHash, registrationHash: runtime.registrationHash });
  }
  if (command === "apply") {
    if (!values.plan) fail("steering_apply_failed", "--plan required");
    return json(await applySteeringPlan(values.project, JSON.parse(readFileSync(values.plan, "utf8"))));
  }
  if (command === "prompt-fragments") {
    const runtime = await loadSteeringRuntime(values.project);
    return json({ ok: true, fragments: projectPromptFragments(runtime) });
  }
  fail("steering_apply_failed", "unknown command");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    json({ ok: false, reasonCode: error.reasonCode ?? "steering_apply_failed", message: error.message });
    process.exitCode = 1;
  });
}
