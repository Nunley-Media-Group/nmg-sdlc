import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  completeStageModels,
  isValidStageModel,
  loadStageModels,
  StageModelsError,
  STAGE_MODEL_DEFAULTS,
  STAGE_MODELS_PATH,
  stageModelsWarning,
  validateStageModels,
} from '../sdlc-models.mjs';
import { applyUpgrade, detectUpgrade } from '../sdlc-upgrade.mjs';

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(scriptsDir, '..');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function project(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-models-'));
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const DEFAULTS_TEXT = json(STAGE_MODEL_DEFAULTS);
const modelsFile = (root) => path.join(root, STAGE_MODELS_PATH);
const noNetworkRun = () => ({ status: 1, stdout: '', stderr: 'network disabled for this test' });
const ABSENT_WARNING = 'Warning: steering/sdlc-models.json is missing; using plugin default stage models and efforts. Run /sdlc-upgrade-project to create it.';

describe('plugin defaults', () => {
  it('match the AC2 table, with verify effort high and default meaning no --effort flag', () => {
    expect(STAGE_MODEL_DEFAULTS).toEqual({
      version: 1,
      start: { model: 'haiku', effort: 'default' },
      implement: { model: 'haiku', effort: 'xhigh' },
      verify: { model: 'opus', effort: 'high' },
      deliver: { model: 'haiku', effort: 'xhigh' },
      repair: { model: 'opus', effort: 'default' },
    });
    expect(Object.isFrozen(STAGE_MODEL_DEFAULTS)).toBe(true);
  });
});

describe('model validation (FR5, AC7)', () => {
  it('accepts Claude aliases, claude-* ids, and well-formed provider/model ids without a provider list', () => {
    for (const model of ['haiku', 'sonnet', 'opus', 'fable', 'opusplan', 'best', 'sonnet[1m]', 'opus[1m]', 'fable[1m]',
      'claude-opus-4-7', 'claude-sonnet-5-5[1m]', 'opencode-go/kimi-k3.1-pro', 'openrouter/anthropic/claude-x']) {
      expect(isValidStageModel(model)).toBe(true);
    }
  });

  it('rejects names that are neither an alias, a claude-* id, nor a well-formed provider/model id', () => {
    for (const model of ['gpt 5', '/x', 'x/', '-p/m', 'Haiku', '', 'opus ', 'x/y z', 42, null]) {
      expect(isValidStageModel(model)).toBe(false);
    }
  });
});

describe('validateStageModels (AC8)', () => {
  it('returns the dotted keys a valid partial file is missing', () => {
    expect(validateStageModels({ version: 1, verify: { model: 'sonnet', effort: 'max' } }).missing)
      .toEqual(['start', 'implement', 'deliver', 'repair']);
    expect(validateStageModels({ version: 1, deliver: { model: 'haiku' } }).missing)
      .toEqual(['start', 'implement', 'verify', 'deliver.effort', 'repair']);
    expect(validateStageModels({ ...STAGE_MODEL_DEFAULTS }).missing).toEqual([]);
  });

  it('names the key and value for every fail-closed violation', () => {
    const cases = [
      [{ version: 1, extra: true }, 'extra', true],
      [{ version: 2 }, 'version', 2],
      [[], '(root)', []],
      [{ verify: { model: 'opus', effort: 'high', extra: 1 } }, 'verify.extra', 1],
      [{ verify: { model: 'gpt 5', effort: 'high' } }, 'verify.model', 'gpt 5'],
      [{ verify: { model: 'opus', effort: 'extreme' } }, 'verify.effort', 'extreme'],
      [{ verify: 'opus' }, 'verify', 'opus'],
    ];
    for (const [value, key, badValue] of cases) {
      let caught = null;
      try { validateStageModels(value); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(StageModelsError);
      expect(caught.key).toBe(key);
      expect(caught.value).toEqual(badValue);
      expect(caught.message.startsWith(`${STAGE_MODELS_PATH}: ${key}`)).toBe(true);
    }
    expect(() => validateStageModels({ verify: { model: 'opus', effort: 'extreme' } }))
      .toThrow('steering/sdlc-models.json: verify.effort = "extreme": must be one of low, medium, high, xhigh, max, default');
  });
});

describe('loadStageModels (FR4, AC6, AC8)', () => {
  it('uses plugin defaults and flags an absent file', () => {
    const result = loadStageModels(project({}));
    expect(result).toMatchObject({ missing: true, warning: ABSENT_WARNING });
    expect(result.config).toEqual(STAGE_MODEL_DEFAULTS);
  });

  it('merges plugin defaults per missing key and keeps the project values', () => {
    const root = project({ [STAGE_MODELS_PATH]: json({ version: 1, verify: { model: 'sonnet', effort: 'max' } }) });
    const result = loadStageModels(root);
    expect(result.missing).toBe(false);
    expect(result.missingKeys).toEqual(['start', 'implement', 'deliver', 'repair']);
    expect(result.config.verify).toEqual({ model: 'sonnet', effort: 'max' });
    expect(result.config.implement).toEqual(STAGE_MODEL_DEFAULTS.implement);
    expect(result.warning).toBe('Warning: steering/sdlc-models.json is missing start, implement, deliver, repair; using plugin defaults for them. Run /sdlc-upgrade-project to complete it.');
  });

  it('fails closed on invalid JSON and on a symlinked file', () => {
    expect(() => loadStageModels(project({ [STAGE_MODELS_PATH]: '{ not json' })))
      .toThrow(/^steering\/sdlc-models\.json: invalid JSON: /);
    const root = project({ 'real.json': DEFAULTS_TEXT });
    fs.mkdirSync(path.join(root, 'steering'), { recursive: true });
    fs.symlinkSync(path.join(root, 'real.json'), modelsFile(root));
    expect(() => loadStageModels(root)).toThrow('steering/sdlc-models.json: must be a regular file, not a symlink or directory');
  });

  it('returns no warning when the file is complete', () => {
    expect(stageModelsWarning(loadStageModels(project({ [STAGE_MODELS_PATH]: DEFAULTS_TEXT })))).toBeNull();
  });
});

describe('completeStageModels (AC1, AC3, FR3)', () => {
  it('creates the file with plugin defaults when absent', () => {
    const root = project({});
    expect(completeStageModels(root)).toEqual({ ok: true, changed: true, status: 'created',
      added: ['version', 'start', 'implement', 'verify', 'deliver', 'repair'] });
    expect(fs.readFileSync(modelsFile(root), 'utf8')).toBe(DEFAULTS_TEXT);
  });

  it('adds only missing keys to a partial file and keeps every project value and key order', () => {
    const partial = { version: 1, start: { model: 'haiku', effort: 'default' }, implement: { model: 'haiku', effort: 'xhigh' },
      verify: { model: 'sonnet', effort: 'max' }, deliver: { model: 'haiku' } };
    const root = project({ [STAGE_MODELS_PATH]: json(partial) });
    expect(completeStageModels(root)).toEqual({ ok: true, changed: true, status: 'completed', added: ['deliver.effort', 'repair'] });
    const after = JSON.parse(fs.readFileSync(modelsFile(root), 'utf8'));
    expect(Object.keys(after)).toEqual(['version', 'start', 'implement', 'verify', 'deliver', 'repair']);
    expect(after.verify).toEqual({ model: 'sonnet', effort: 'max' });
    expect(after.deliver).toEqual({ model: 'haiku', effort: 'xhigh' });
    expect(after.repair).toEqual(STAGE_MODEL_DEFAULTS.repair);
  });

  it('reports a complete file as already-current and leaves its bytes unchanged', () => {
    const root = project({ [STAGE_MODELS_PATH]: DEFAULTS_TEXT });
    expect(completeStageModels(root)).toEqual({ ok: true, changed: false, status: 'already-current', added: [] });
    expect(fs.readFileSync(modelsFile(root), 'utf8')).toBe(DEFAULTS_TEXT);
  });

  it('never rewrites an invalid file', () => {
    const invalid = json({ version: 1, verify: { model: 'opus', effort: 'extreme' } });
    const root = project({ [STAGE_MODELS_PATH]: invalid });
    const result = completeStageModels(root);
    expect(result).toMatchObject({ ok: false, changed: false, status: 'invalid' });
    expect(result.message).toBe('steering/sdlc-models.json: verify.effort = "extreme": must be one of low, medium, high, xhigh, max, default');
    expect(fs.readFileSync(modelsFile(root), 'utf8')).toBe(invalid);
  });

  it('exposes ensure through the CLI with exit 0 for success and 1 for an invalid file', () => {
    const script = path.join(scriptsDir, 'sdlc-models.mjs');
    const created = project({});
    const ok = spawnSync(process.execPath, [script, 'ensure', '--root', created], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ ok: true, status: 'created' });
    const bad = project({ [STAGE_MODELS_PATH]: json({ version: 1, start: { model: 'gpt 5', effort: 'default' } }) });
    const invalid = spawnSync(process.execPath, [script, 'ensure', '--root', bad], { encoding: 'utf8' });
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout)).toMatchObject({ ok: false, status: 'invalid' });
    expect(spawnSync(process.execPath, [script, 'ensure'], { encoding: 'utf8' }).status).toBe(2);
  });
});

describe('sdlc-models upgrade item (AC3)', () => {
  it('creates the file with defaults when absent and emits nothing once it is complete', () => {
    const root = project({ 'VERSION': '0.1.0\n' });
    const item = detectUpgrade(root, { run: noNetworkRun }).items.find((candidate) => candidate.id === 'sdlc-models');
    expect(item).toMatchObject({ kind: 'sdlc-models', action: 'create', rel: STAGE_MODELS_PATH, actionable: true });
    const applied = applyUpgrade(root, [item.id], noNetworkRun).results.find((result) => result.id === 'sdlc-models');
    expect(applied).toEqual({ id: 'sdlc-models', status: 'applied', created: [STAGE_MODELS_PATH] });
    expect(fs.readFileSync(modelsFile(root), 'utf8')).toBe(DEFAULTS_TEXT);
    expect(detectUpgrade(root, { run: noNetworkRun }).items.some((candidate) => candidate.id === 'sdlc-models')).toBe(false);
  });

  it('completes a valid partial file without changing project values and reports no item afterwards', () => {
    const partial = json({ version: 1, verify: { model: 'sonnet', effort: 'max' } });
    const root = project({ 'VERSION': '0.1.0\n', [STAGE_MODELS_PATH]: partial });
    const item = detectUpgrade(root, { run: noNetworkRun }).items.find((candidate) => candidate.id === 'sdlc-models');
    expect(item).toMatchObject({ action: 'complete', missingKeys: ['start', 'implement', 'deliver', 'repair'] });
    const applied = applyUpgrade(root, [item.id], noNetworkRun).results.find((result) => result.id === 'sdlc-models');
    expect(applied).toEqual({ id: 'sdlc-models', status: 'applied', updated: [STAGE_MODELS_PATH] });
    expect(JSON.parse(fs.readFileSync(modelsFile(root), 'utf8')).verify).toEqual({ model: 'sonnet', effort: 'max' });
    const second = detectUpgrade(root, { run: noNetworkRun }).items.some((candidate) => candidate.id === 'sdlc-models');
    expect(second).toBe(false);
  });

  it('emits nothing for an invalid file and never rewrites it', () => {
    const invalid = json({ version: 1, verify: { model: 'opus', effort: 'extreme' } });
    const root = project({ 'VERSION': '0.1.0\n', [STAGE_MODELS_PATH]: invalid });
    expect(detectUpgrade(root, { run: noNetworkRun }).items.some((candidate) => candidate.id === 'sdlc-models')).toBe(false);
    expect(fs.readFileSync(modelsFile(root), 'utf8')).toBe(invalid);
  });
});

describe('supervisor boundary (AC9)', () => {
  it('keeps the supervisor model check and hooks module independent of the project stage file', () => {
    const hostEvents = fs.readFileSync(path.join(repoRoot, 'src/host-events.mjs'), 'utf8');
    const hooks = fs.readFileSync(path.join(repoRoot, 'hooks/register.ts'), 'utf8');
    expect(hostEvents).not.toContain('sdlc-models');
    expect(hooks).not.toContain('sdlc-models');
  });
});

describe('stageModelsWarning', () => {
  it('is null for a complete file and names the missing keys for a partial one', () => {
    expect(stageModelsWarning({ missing: false, missingKeys: [], warning: null })).toBeNull();
    expect(stageModelsWarning({ missing: false, missingKeys: ['repair'] })).toContain('missing repair; using plugin defaults for them');
    expect(stageModelsWarning({ missing: true, missingKeys: [] })).toBe(ABSENT_WARNING);
  });
});
