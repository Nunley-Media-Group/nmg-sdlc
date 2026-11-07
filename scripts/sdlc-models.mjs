#!/usr/bin/env node

/** Per-project execute stage models and efforts from steering/sdlc-models.json. Zero-dependency:
 * reads and writes only that file, never follows a symlinked target, and never consults a provider list. */
import fs from 'node:fs';
import path from 'node:path';
import { isCliEntry } from './plugin-controller-path.mjs';

export const STAGE_MODELS_PATH = 'steering/sdlc-models.json';
export const STAGE_NAMES = Object.freeze(['start', 'implement', 'verify', 'deliver', 'repair']);
const TOP_LEVEL_KEYS = Object.freeze(['version', ...STAGE_NAMES]);
const ENTRY_KEYS = Object.freeze(['model', 'effort']);
const EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max', 'default']);
const MODEL_ALIASES = Object.freeze(['haiku', 'sonnet', 'opus', 'fable', 'opusplan', 'best',
  'sonnet[1m]', 'opus[1m]', 'fable[1m]']);
const CLAUDE_MODEL_ID = /^claude-[a-z0-9][a-z0-9.-]*(\[1m\])?$/;
const PROVIDER_MODEL_ID = /^[^/\s-][^/\s]*\/\S+$/;

/** Plugin defaults. `default` effort means no `--effort` flag, so the worker keeps the user's Claude Code effort. */
export const STAGE_MODEL_DEFAULTS = Object.freeze({
  version: 1,
  start: Object.freeze({ model: 'haiku', effort: 'default' }),
  implement: Object.freeze({ model: 'haiku', effort: 'xhigh' }),
  verify: Object.freeze({ model: 'opus', effort: 'high' }),
  deliver: Object.freeze({ model: 'haiku', effort: 'xhigh' }),
  repair: Object.freeze({ model: 'opus', effort: 'default' }),
});

/** Fail-closed diagnostic naming the file, the offending key, and the value. */
export class StageModelsError extends Error {
  constructor(key, value, reason) {
    super(key === '(file)'
      ? `${STAGE_MODELS_PATH}: ${reason}`
      : `${STAGE_MODELS_PATH}: ${key} = ${JSON.stringify(value)}: ${reason}`);
    this.name = 'StageModelsError';
    this.key = key;
    this.value = value;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function defaultsCopy() {
  return Object.fromEntries([['version', 1], ...STAGE_NAMES.map((name) => [name, { ...STAGE_MODEL_DEFAULTS[name] }])]);
}

export function isValidStageModel(model) {
  if (typeof model !== 'string') return false;
  return MODEL_ALIASES.includes(model) || CLAUDE_MODEL_ID.test(model) || PROVIDER_MODEL_ID.test(model);
}

/** Returns `{ missing }` with dotted keys absent from a valid file, or throws StageModelsError. */
export function validateStageModels(value) {
  if (!isPlainObject(value)) throw new StageModelsError('(root)', value, 'must be a JSON object');
  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.includes(key)) throw new StageModelsError(key, value[key], 'unknown top-level key');
  }
  const missing = [];
  if (!Object.hasOwn(value, 'version')) missing.push('version');
  else if (value.version !== 1) throw new StageModelsError('version', value.version, 'must be 1');
  for (const name of STAGE_NAMES) {
    if (!Object.hasOwn(value, name)) {
      missing.push(name);
      continue;
    }
    const entry = value[name];
    if (!isPlainObject(entry)) throw new StageModelsError(name, entry, 'must be an object with model and effort');
    for (const key of Object.keys(entry)) {
      if (!ENTRY_KEYS.includes(key)) throw new StageModelsError(`${name}.${key}`, entry[key], 'unknown key');
    }
    if (!Object.hasOwn(entry, 'model')) missing.push(`${name}.model`);
    else if (!isValidStageModel(entry.model)) {
      throw new StageModelsError(`${name}.model`, entry.model,
        'must be a Claude alias, a claude-* id, or a provider/model id');
    }
    if (!Object.hasOwn(entry, 'effort')) missing.push(`${name}.effort`);
    else if (!EFFORTS.includes(entry.effort)) {
      throw new StageModelsError(`${name}.effort`, entry.effort, `must be one of ${EFFORTS.join(', ')}`);
    }
  }
  return { missing };
}

/** Config from a validated file: each missing key takes its plugin default. */
function configFromValid(parsed) {
  const config = { version: Object.hasOwn(parsed, 'version') ? parsed.version : 1 };
  for (const name of STAGE_NAMES) {
    const entry = Object.hasOwn(parsed, name) ? parsed[name] : {};
    config[name] = {
      model: Object.hasOwn(entry, 'model') ? entry.model : STAGE_MODEL_DEFAULTS[name].model,
      effort: Object.hasOwn(entry, 'effort') ? entry.effort : STAGE_MODEL_DEFAULTS[name].effort,
    };
  }
  return config;
}

export function stageModelsWarning(result) {
  if (!result) return null;
  if (result.missing) {
    return `Warning: ${STAGE_MODELS_PATH} is missing; using plugin default stage models and efforts. `
      + 'Run /sdlc-upgrade-project to create it.';
  }
  if (result.missingKeys?.length) {
    return `Warning: ${STAGE_MODELS_PATH} is missing ${result.missingKeys.join(', ')}; using plugin defaults for them. `
      + 'Run /sdlc-upgrade-project to complete it.';
  }
  return null;
}

function withWarning(result) {
  return { ...result, warning: stageModelsWarning(result) };
}

/** `{ config, missing, missingKeys, warning }`: `missing` marks an absent file; invalid files throw. */
export function loadStageModels(root) {
  const target = path.join(path.resolve(root), STAGE_MODELS_PATH);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new StageModelsError('(file)', undefined, `unreadable: ${error.code ?? error.message}`);
    return withWarning({ config: defaultsCopy(), missing: true, missingKeys: [...TOP_LEVEL_KEYS] });
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new StageModelsError('(file)', undefined, 'must be a regular file, not a symlink or directory');
  }
  const parsed = parseFile(target);
  const { missing } = validateStageModels(parsed);
  return withWarning({ config: configFromValid(parsed), missing: false, missingKeys: missing });
}

function parseFile(target) {
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch (error) {
    throw new StageModelsError('(file)', undefined, `unreadable: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new StageModelsError('(file)', undefined, `invalid JSON: ${error.message}`);
  }
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Keeps every project value and key order, then appends only the missing top-level keys and entry fields. */
function mergeMissing(parsed) {
  const merged = { ...parsed };
  if (!Object.hasOwn(parsed, 'version')) merged.version = 1;
  for (const name of STAGE_NAMES) {
    if (!Object.hasOwn(parsed, name)) {
      merged[name] = { ...STAGE_MODEL_DEFAULTS[name] };
      continue;
    }
    const entry = { ...parsed[name] };
    if (!Object.hasOwn(entry, 'model')) entry.model = STAGE_MODEL_DEFAULTS[name].model;
    if (!Object.hasOwn(entry, 'effort')) entry.effort = STAGE_MODEL_DEFAULTS[name].effort;
    merged[name] = entry;
  }
  return merged;
}

function invalid(message) {
  return { ok: false, changed: false, status: 'invalid', added: [], message };
}

/** Creates the file with defaults when absent, or adds only missing keys when present and valid.
 * Statuses: created, completed, already-current (no write), invalid (no write). */
export function completeStageModels(root) {
  const target = path.join(path.resolve(root), STAGE_MODELS_PATH);
  let stat = null;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error.code !== 'ENOENT') return invalid(`${STAGE_MODELS_PATH}: unreadable: ${error.code ?? error.message}`);
  }
  if (!stat) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      fs.writeFileSync(target, serialize(defaultsCopy()), { flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') return completeStageModels(root);
      return invalid(`${STAGE_MODELS_PATH}: write failed: ${error.code ?? error.message}`);
    }
    return { ok: true, changed: true, status: 'created', added: [...TOP_LEVEL_KEYS] };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return invalid(`${STAGE_MODELS_PATH}: must be a regular file, not a symlink or directory`);
  }
  let parsed;
  let missing;
  try {
    parsed = parseFile(target);
    ({ missing } = validateStageModels(parsed));
  } catch (error) {
    if (error instanceof StageModelsError) return invalid(error.message);
    throw error;
  }
  if (!missing.length) return { ok: true, changed: false, status: 'already-current', added: [] };
  const text = serialize(mergeMissing(parsed));
  fs.writeFileSync(target, text);
  validateStageModels(JSON.parse(text));
  return { ok: true, changed: true, status: 'completed', added: missing };
}

function runCli(argv) {
  const [sub, flag, root, ...extra] = argv;
  if (sub !== 'ensure' || flag !== '--root' || !root || extra.length) {
    process.stderr.write('Usage: node scripts/sdlc-models.mjs ensure --root <dir>\n');
    process.exitCode = 2;
    return;
  }
  const result = completeStageModels(root);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (isCliEntry(import.meta.url)) runCli(process.argv.slice(2));
