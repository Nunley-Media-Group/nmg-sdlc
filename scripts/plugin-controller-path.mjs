import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, posix, resolve, win32 } from "node:path";
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

function controllerNameFromOperand(operand) {
  const canonical = /^<plugin-root>\/scripts\/([A-Za-z0-9._-]+\.mjs)$/.exec(operand);
  if (canonical) return canonical[1];
  if (!posix.isAbsolute(operand) && !win32.isAbsolute(operand)) return null;

  const segments = operand.split(/[\\/]+/).filter(Boolean);
  const scriptName = segments.at(-1);
  return segments.at(-3) === "nmg-sdlc"
    && segments.at(-2) === "scripts"
    && SCRIPT_NAME_PATTERN.test(scriptName)
    ? scriptName
    : null;
}

function materializeControllerPathsWithPolicy(text, pluginRoot, preserveUnresolved) {
  const controllerPath = (scriptName) => {
    try {
      return resolvePluginController(scriptName, {
        env: { NMG_SDLC_PLUGIN_ROOT: pluginRoot },
      });
    } catch (error) {
      if (preserveUnresolved && error?.reasonCode === "controller_unresolved") return null;
      throw error;
    }
  };
  const replaceOperand = (match, prefix, operand, suffix = "") => {
    const scriptName = controllerNameFromOperand(operand);
    if (scriptName === null) return match;
    const controller = controllerPath(scriptName);
    return controller === null ? match : `${prefix}${JSON.stringify(controller)}${suffix}`;
  };
  const quoted = String(text).replace(
    /(["'])([^"'\r\n]+)\1/g,
    (match, quote, operand) => replaceOperand(match, "", operand),
  );
  return quoted.replace(
    /(\bnode\s+)((?:<plugin-root>\/scripts\/|[^\s"'`]*[\\/])[A-Za-z0-9._-]+\.mjs)(?=\s|$|[),.;:\]])/g,
    (match, prefix, operand) => replaceOperand(match, prefix, operand),
  );
}

export function materializeControllerPaths(text, pluginRoot) {
  return materializeControllerPathsWithPolicy(text, pluginRoot, false);
}

export function materializeAvailableControllerPaths(text, pluginRoot) {
  return materializeControllerPathsWithPolicy(text, pluginRoot, true);
}
