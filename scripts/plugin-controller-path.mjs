import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9._-]+\.mjs$/;

const defaultFs = { existsSync, readFileSync, realpathSync, statSync };

function validPluginRoot(root, fsImpl = defaultFs) {
  if (typeof root !== "string" || !isAbsolute(root)) return false;
  try {
    const manifest = JSON.parse(fsImpl.readFileSync(join(root, "package.json"), "utf8"));
    return manifest?.name === "nmg-sdlc" && fsImpl.statSync(join(root, "scripts")).isDirectory();
  } catch {
    return false;
  }
}

function unresolved(scriptName = "plugin controller") {
  const error = new Error(`controller unresolved: ${scriptName}`);
  error.reasonCode = "controller_unresolved";
  error.exitCode = 2;
  return error;
}

export function isCliEntry(importMetaUrl, argv1 = process.argv[1], fsImpl = defaultFs) {
  if (!argv1 || !importMetaUrl) return false;
  let modulePath;
  try {
    modulePath = fileURLToPath(importMetaUrl);
  } catch {
    return false;
  }
  try {
    return resolve(fsImpl.realpathSync(argv1)) === resolve(fsImpl.realpathSync(modulePath));
  } catch {
    return resolve(argv1) === resolve(modulePath);
  }
}

export function resolvePluginRoot({ env = process.env, importMetaUrl, fsImpl = defaultFs } = {}) {
  const envRoot = env?.NMG_SDLC_PLUGIN_ROOT;
  if (validPluginRoot(envRoot, fsImpl)) return envRoot;

  if (importMetaUrl) {
    try {
      const moduleDir = dirname(fileURLToPath(importMetaUrl));
      const leaf = moduleDir.split(/[\\/]/).at(-1);
      const candidate = leaf === "scripts" || leaf === "src" ? dirname(moduleDir) : null;
      if (validPluginRoot(candidate, fsImpl)) return candidate;
    } catch {
      // Fall through to the explicit resolver failure.
    }
  }

  throw unresolved();
}

export function resolvePluginController(scriptName, options = {}) {
  if (typeof scriptName !== "string" || !SCRIPT_NAME_PATTERN.test(scriptName)) {
    throw unresolved(String(scriptName || "plugin controller"));
  }
  const fsImpl = options.fsImpl ?? defaultFs;
  const root = resolvePluginRoot({ ...options, fsImpl });
  const controller = join(root, "scripts", scriptName);
  try {
    if (!fsImpl.existsSync(controller) || !fsImpl.statSync(controller).isFile()) {
      throw unresolved(scriptName);
    }
  } catch (error) {
    if (error?.reasonCode === "controller_unresolved") throw error;
    throw unresolved(scriptName);
  }
  return controller;
}

export function materializeControllerPaths(text, pluginRoot) {
  const source = String(text).replace(
    /(["'])<plugin-root>\/scripts\/([A-Za-z0-9._-]+\.mjs)\1/g,
    (_, _quote, scriptName) => JSON.stringify(join(pluginRoot, "scripts", scriptName)),
  );
  return source.replace(
    /node (?:<plugin-root>\/)?scripts\/([A-Za-z0-9._-]+\.mjs)/g,
    (_, scriptName) => `node ${JSON.stringify(join(pluginRoot, "scripts", scriptName))}`,
  );
}
