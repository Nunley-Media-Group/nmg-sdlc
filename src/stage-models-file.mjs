/** Reads steering/sdlc-models.json from disk: never follows a symlinked target, and fails with StageModelsError.
 * It lives in src/ beside the verification runtime that reads the selection model; src/stage-models.mjs stays
 * Node-free for the hooks module, and scripts/sdlc-models.mjs re-exports `loadStageModels`. */
import fs from 'node:fs';
import path from 'node:path';
import {
  STAGE_MODEL_DEFAULTS,
  STAGE_MODELS_PATH,
  STAGE_NAMES,
  StageModelsError,
  TOP_LEVEL_KEYS,
  stageModelsWarning,
  validateStageModels,
} from './stage-models.mjs';

/** A fresh `{ version: 1, <stage>: { model, effort } }` holding every plugin default. */
export function defaultsCopy() {
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
  if (Object.hasOwn(parsed, 'selection')) config.selection = { ...parsed.selection };
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
  const parsed = parseStageModelsFile(target);
  const { missing } = validateStageModels(parsed);
  return withWarning({ config: configFromValid(parsed), missing: false, missingKeys: missing });
}

/** The parsed JSON of the file at `target`; an unreadable or unparseable file throws StageModelsError. */
export function parseStageModelsFile(target) {
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
