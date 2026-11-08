#!/usr/bin/env node

/** Per-project execute stage models and efforts from steering/sdlc-models.json. Zero-dependency:
 * reads and writes only that file, never follows a symlinked target, and never consults a provider list.
 * The pure validation lives in src/stage-models.mjs, shared with the hooks module. */
import fs from 'node:fs';
import path from 'node:path';
import { isCliEntry } from './plugin-controller-path.mjs';
import {
  STAGE_MODEL_DEFAULTS,
  STAGE_MODELS_PATH,
  STAGE_NAMES,
  StageModelsError,
  TOP_LEVEL_KEYS,
  stageModelsWarning,
  validateStageModels,
} from '../src/stage-models.mjs';

export {
  STAGE_MODEL_DEFAULTS,
  STAGE_MODELS_PATH,
  STAGE_NAMES,
  StageModelsError,
  isValidStageModel,
  stageModelsWarning,
  validateStageModels,
} from '../src/stage-models.mjs';

function defaultsCopy() {
  return Object.fromEntries([['version', 1], ...STAGE_NAMES.map((name) => [name, { ...STAGE_MODEL_DEFAULTS[name] }])]);
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
