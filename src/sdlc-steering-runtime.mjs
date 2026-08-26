import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { ALLOWED_CONSUMERS, ALLOWED_SLOTS } from "./sdlc-prompt-snippets.mjs";

const TOP_KEYS = ["schemaVersion", "runtimeVersion", "managedFiles", "modules", "snippets", "extensions", "validations"];
const ROLES = ["product", "tech", "structure", "verification"];
const WHEN_KINDS = new Set(["always", "changed_paths", "path_exists", "glob_exists"]);
const BUILTIN_PROVIDERS = new Set(["builtin.command", "builtin.artifact", "builtin.external-evidence"]);
const ID_RE = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export class SteeringError extends Error {
  constructor(reasonCode, detail = "") {
    super(detail ? `${reasonCode}: ${detail}` : reasonCode);
    this.name = "SteeringError";
    this.reasonCode = reasonCode;
  }
}

function fail(code, detail) { throw new SteeringError(code, detail); }
function exactKeys(value, keys, code = "steering_manifest_unknown_key") {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("steering_manifest_invalid");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}
function hash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function within(root, candidate) { return candidate === root || candidate.startsWith(`${root}${sep}`); }
function validateId(id) { if (typeof id !== "string" || !ID_RE.test(id)) fail("steering_manifest_invalid"); }

export function resolveSteeringPath(projectRoot, path, subtree = null, { mustExist = true } = {}) {
  if (typeof path !== "string" || path === "" || isAbsolute(path) || path.includes("\\") || path.split("/").includes("..")) fail("steering_path_outside_root");
  const root = resolve(projectRoot, subtree ? `steering/${subtree}` : "steering");
  const candidate = resolve(projectRoot, path);
  if (!within(root, candidate)) fail("steering_path_outside_root");
  if (!mustExist) return candidate;
  if (!existsSync(candidate)) fail("steering_manifest_invalid", `${path} missing`);
  let cursor = candidate;
  while (within(resolve(projectRoot, "steering"), cursor)) {
    if (lstatSync(cursor).isSymbolicLink()) {
      const target = realpathSync(cursor);
      if (!within(realpathSync(resolve(projectRoot, "steering")), target)) fail("steering_path_outside_root");
    }
    if (cursor === resolve(projectRoot, "steering")) break;
    cursor = dirname(cursor);
  }
  if (!statSync(candidate).isFile()) fail("steering_manifest_invalid", `${path} is not a regular file`);
  return candidate;
}
function safeRelativePath(value) {
  return typeof value === "string"
    && value !== ""
    && !isAbsolute(value)
    && !value.includes("\\")
    && !value.split("/").includes("..");
}

function validateWhen(when) {
  if (!when || typeof when !== "object" || Array.isArray(when) || !WHEN_KINDS.has(when.kind)) fail("steering_condition_invalid");
  const keys = when.kind === "always" ? ["kind"] : when.kind === "changed_paths" ? (Object.hasOwn(when, "exclude") ? ["kind", "include", "exclude"] : ["kind", "include"]) : when.kind === "path_exists" ? ["kind", "path"] : ["kind", "root", "pattern"];
  exactKeys(when, keys, "steering_condition_invalid");
  if (when.kind === "changed_paths" && (!Array.isArray(when.include) || when.include.length === 0 || !when.include.every((x) => typeof x === "string" && x))) fail("steering_condition_invalid");
  if (when.exclude && (!Array.isArray(when.exclude) || !when.exclude.every((x) => typeof x === "string" && x))) fail("steering_condition_invalid");
  if (when.kind === "path_exists" && (typeof when.path !== "string" || !when.path)) fail("steering_condition_invalid");
  if (when.kind === "glob_exists" && (![when.root, when.pattern].every((x) => typeof x === "string" && x))) fail("steering_condition_invalid");
  if (when.kind === "path_exists" && !safeRelativePath(when.path)) fail("steering_condition_invalid");
  if (when.kind === "glob_exists" && (!safeRelativePath(when.root) || when.pattern.startsWith("/") || when.pattern.includes("..") || when.pattern.startsWith("!"))) fail("steering_condition_invalid");
  if (when.kind === "changed_paths" && [...when.include, ...(when.exclude ?? [])].some((pattern) => !safeRelativePath(pattern) || pattern.startsWith("!"))) fail("steering_condition_invalid");
}

function validateConfig(validation) {
  const config = validation.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) fail("steering_validation_config_invalid");
  if (validation.provider === "builtin.command") {
    exactKeys(config, ["program", "args", "cwd", "env"], "steering_validation_config_invalid");
    if (typeof config.program !== "string" || !config.program || ["sh", "bash", "zsh", "cmd", "powershell"].includes(config.program.split(/[\\/]/).at(-1).toLowerCase()) || !Array.isArray(config.args) || !config.args.every((x) => typeof x === "string") || !safeRelativePath(config.cwd || ".") || !Array.isArray(config.env) || !config.env.every((x) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(x)) || new Set(config.env).size !== config.env.length) fail("steering_validation_config_invalid");
  } else if (validation.provider === "builtin.artifact") {
    exactKeys(config, ["path", "checks"], "steering_validation_config_invalid");
    const validCheck = (check) => ["nonempty", "json"].includes(check)
      || (check && typeof check === "object" && !Array.isArray(check)
        && Object.keys(check).sort().join("\0") === ["kind", "value"].sort().join("\0")
        && ((check.kind === "sha256" && /^sha256:[0-9a-f]{64}$/.test(check.value))
          || (check.kind === "contains" && typeof check.value === "string" && check.value !== "")));
    if (!safeRelativePath(config.path) || !Array.isArray(config.checks) || !config.checks.length || !config.checks.every(validCheck)) fail("steering_validation_config_invalid");
  } else if (validation.provider === "builtin.external-evidence") {
    exactKeys(config, ["path"], "steering_validation_config_invalid");
    if (!safeRelativePath(config.path)) fail("steering_validation_config_invalid");
  }
}

export async function loadSteeringRuntime(projectRoot, { manifestPath = "steering/manifest.json" } = {}) {
  const root = resolve(projectRoot);
  const absoluteManifest = resolve(root, manifestPath);
  if (!existsSync(absoluteManifest)) fail("steering_manifest_missing");
  let manifest;
  try { manifest = JSON.parse(readFileSync(absoluteManifest, "utf8")); } catch { fail("steering_manifest_invalid"); }
  exactKeys(manifest, TOP_KEYS);
  if (manifest.schemaVersion !== 1 || manifest.runtimeVersion !== "1" || !["managedFiles", "modules", "snippets", "extensions", "validations"].every((key) => Array.isArray(manifest[key]))) fail("steering_manifest_invalid");

  const ids = new Set();
  const addId = (kind, id) => { validateId(id); const key = `${kind}:${id}`; if (ids.has(key)) fail("steering_duplicate_id"); ids.add(key); };
  if (manifest.managedFiles.length !== 4 || manifest.modules.length !== 4) fail("steering_module_invalid");
  const managed = new Map();
  for (const record of manifest.managedFiles) {
    exactKeys(record, ["path", "template", "sha256"]);
    const role = ROLES.find((candidate) => record.path === `steering/modules/${candidate}.mjs`);
    if (!role || record.template !== `workflows/steering/templates/modules/${role}.mjs` || !/^sha256:[0-9a-f]{64}$/.test(record.sha256)) fail("steering_module_invalid");
    const managedPath = resolveSteeringPath(root, record.path, "modules");
    if (hash(readFileSync(managedPath)) !== record.sha256) fail("steering_module_invalid");
    if (managed.has(record.path)) fail("steering_duplicate_id");
    managed.set(record.path, record);
  }

  const modules = new Map();
  for (const record of manifest.modules) {
    exactKeys(record, ["id", "role", "path"]);
    if (!ROLES.includes(record.id) || record.id !== record.role || record.path !== `steering/modules/${record.role}.mjs`) fail("steering_module_invalid");
    addId("module", record.id);
    const modulePath = resolveSteeringPath(root, record.path, "modules");
    let descriptor;
    try { descriptor = (await import(`${pathToFileURL(modulePath).href}?sha=${hash(readFileSync(modulePath)).slice(7)}`)).default; } catch { fail("steering_module_invalid"); }
    if (!Object.isFrozen(descriptor) || canonicalJson(descriptor) !== canonicalJson({ schemaVersion: 1, id: record.id, role: record.role })) fail("steering_module_invalid");
    modules.set(record.id, descriptor);
  }
  if (ROLES.some((role) => !modules.has(role))) fail("steering_module_invalid");

  const snippets = [];
  for (const record of manifest.snippets) {
    const { byteBound: _byteBound, ...snippet } = record ?? {};
    exactKeys(snippet, ["id", "path", "consumers", "slot", "order"]);
    addId("snippet", snippet.id);
    const snippetPath = resolveSteeringPath(root, snippet.path, "snippets");
    if (!Array.isArray(snippet.consumers) || !snippet.consumers.length || snippet.consumers.some((value) => !ALLOWED_CONSUMERS.includes(value)) || !ALLOWED_SLOTS.includes(snippet.slot) || !Number.isFinite(snippet.order)) fail("steering_manifest_invalid");
    snippets.push(Object.freeze({ ...snippet, absolutePath: snippetPath }));
  }

  const extensions = [];
  const providers = new Map([...BUILTIN_PROVIDERS].map((id) => [id, { kind: "builtin", handler: null }]));
  for (const record of manifest.extensions) {
    exactKeys(record, ["id", "path", "providers"]);
    addId("extension", record.id);
    if (!Array.isArray(record.providers) || !record.providers.length) fail("steering_extension_invalid");
    const extensionPath = resolveSteeringPath(root, record.path, "extensions");
    let extension;
    try { extension = (await import(`${pathToFileURL(extensionPath).href}?sha=${hash(readFileSync(extensionPath)).slice(7)}`)).extension; } catch { fail("steering_extension_invalid"); }
    if (!extension || !Object.isFrozen(extension) || extension.schemaVersion !== 1 || extension.id !== record.id || !extension.providers || Object.keys(extension.providers).sort().join("\0") !== [...record.providers].sort().join("\0")) fail("steering_extension_invalid");
    for (const providerId of record.providers) {
      validateId(providerId);
      if (providers.has(providerId)) fail("steering_duplicate_id");
      if (typeof extension.providers[providerId] !== "function") fail("steering_extension_invalid");
      providers.set(providerId, { kind: "extension", handler: extension.providers[providerId] });
    }
    extensions.push(extension);
  }

  const validations = [];
  for (const record of manifest.validations) {
    exactKeys(record, ["id", "provider", "required", "when", "timeoutMs", "config"]);
    addId("validation", record.id);
    validateId(record.provider);
    if (!providers.has(record.provider)) fail("steering_provider_unresolved");
    if (typeof record.required !== "boolean" || !Number.isInteger(record.timeoutMs) || record.timeoutMs < 1 || record.timeoutMs > 900000) fail("steering_manifest_invalid");
    validateWhen(record.when);
    validateConfig(record);
    validations.push(Object.freeze(record));
  }

  const steeringFiles = [absoluteManifest, ...manifest.modules.map((x) => resolve(root, x.path)), ...manifest.snippets.map((x) => resolve(root, x.path)), ...manifest.extensions.map((x) => resolve(root, x.path))];
  const steeringHash = hash(steeringFiles.map((file) => `${relative(root, file)}\0${readFileSync(file)}`).join("\0"));
  const registrationHash = hash(canonicalJson({ snippets: manifest.snippets, extensions: manifest.extensions, validations: manifest.validations }));
  return Object.freeze({ projectRoot: root, manifest, modules, snippets, extensions, providers, validations, steeringHash, registrationHash });
}

export function projectPromptFragments(runtime) {
  return runtime.snippets.map((record) => Object.freeze({
    id: record.id,
    provider: `project:${record.id}`,
    source: record.path,
    consumers: record.consumers,
    slot: record.slot,
    order: record.order,
    body: readFileSync(record.absolutePath, "utf8"),
  }));
}
