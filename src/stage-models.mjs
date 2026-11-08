// Stage model and effort validation shared by the Node controller and the hooks module.
// Node-free: no imports, so the hooks module can load it inside Claude Code's plugin environment.

export const STAGE_MODELS_PATH = 'steering/sdlc-models.json';
export const STAGE_NAMES = Object.freeze(['start', 'implement', 'verify', 'deliver', 'repair']);
export const TOP_LEVEL_KEYS = Object.freeze(['version', ...STAGE_NAMES]);
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
