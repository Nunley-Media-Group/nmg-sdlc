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
  refreshStageModelDefaults,
  staleStageDefaults,
  StageModelsError,
  SUPERSEDED_STAGE_MODEL_DEFAULTS,
  STAGE_MODEL_DEFAULTS,
  STAGE_MODELS_PATH,
  stageModelsWarning,
  validateStageModels,
} from '../sdlc-models.mjs';
import { applyUpgrade, detectUpgrade } from '../sdlc-upgrade.mjs';
import * as stageModelsModule from '../../src/stage-models.mjs';
import * as sdlcModelsModule from '../sdlc-models.mjs';

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

describe('@SCN001 New defaults apply when the file is absent: plugin defaults (#568 AC1, FR1)', () => {
  it('@SCN001 implement runs on haiku at xhigh and verify on opus at medium, with default meaning no --effort flag', () => {
    expect(STAGE_MODEL_DEFAULTS).toEqual({
      version: 1,
      start: { model: 'haiku', effort: 'default' },
      implement: { model: 'haiku', effort: 'xhigh' },
      verify: { model: 'opus', effort: 'medium' },
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

describe('superseded defaults refresh (#568 AC1-AC4, FR2, FR3)', () => {
  const OLD_IMPLEMENT = { model: 'opus', effort: 'medium' };
  const OLD_VERIFY = { model: 'opus', effort: 'high' };
  const OLD = { ...STAGE_MODEL_DEFAULTS, implement: OLD_IMPLEMENT, verify: OLD_VERIFY };
  const items = (root) => detectUpgrade(root, { run: noNetworkRun }).items;

  it('@SCN003 records the earlier implement and verify defaults as superseded, and never a current default', () => {
    expect(SUPERSEDED_STAGE_MODEL_DEFAULTS).toEqual({ implement: [OLD_IMPLEMENT], verify: [OLD_VERIFY] });
    for (const [name, olds] of Object.entries(SUPERSEDED_STAGE_MODEL_DEFAULTS)) {
      expect(olds).not.toContainEqual(STAGE_MODEL_DEFAULTS[name]);
    }
    expect(staleStageDefaults(OLD)).toEqual(['implement', 'verify']);
    expect(staleStageDefaults({ ...STAGE_MODEL_DEFAULTS, verify: OLD_VERIFY })).toEqual(['verify']);
    expect(staleStageDefaults(STAGE_MODEL_DEFAULTS)).toEqual([]);
  });

  it('@SCN001 creates the file with the new defaults and every other stage unchanged', () => {
    const root = project({ 'VERSION': '0.1.0\n' });
    applyUpgrade(root, ['sdlc-models'], noNetworkRun);
    expect(JSON.parse(fs.readFileSync(modelsFile(root), 'utf8'))).toEqual({
      version: 1,
      start: { model: 'haiku', effort: 'default' },
      implement: { model: 'haiku', effort: 'xhigh' },
      verify: { model: 'opus', effort: 'medium' },
      deliver: { model: 'haiku', effort: 'xhigh' },
      repair: { model: 'opus', effort: 'default' },
    });
  });

  it('@SCN002 completes a file missing implement or verify with the new defaults and keeps existing values', () => {
    const start = { model: 'sonnet', effort: 'low' };
    const partial = project({ [STAGE_MODELS_PATH]: json({ version: 1, start, verify: OLD_VERIFY }) });
    completeStageModels(partial);
    const completed = JSON.parse(fs.readFileSync(modelsFile(partial), 'utf8'));
    expect(completed.implement).toEqual({ model: 'haiku', effort: 'xhigh' });
    expect(completed.start).toEqual(start);
    expect(completed.verify).toEqual(OLD_VERIFY);
    const noVerify = project({ [STAGE_MODELS_PATH]: json({ version: 1, start, implement: OLD_IMPLEMENT }) });
    completeStageModels(noVerify);
    const completedVerify = JSON.parse(fs.readFileSync(modelsFile(noVerify), 'utf8'));
    expect(completedVerify.verify).toEqual({ model: 'opus', effort: 'medium' });
    expect(completedVerify.implement).toEqual(OLD_IMPLEMENT);
    expect(completedVerify.start).toEqual(start);
  });

  it('@SCN003 offers and refreshes both stages on earlier defaults, keeping other values and key order', () => {
    const custom = { ...OLD, deliver: { model: 'sonnet', effort: 'low' } };
    const root = project({ 'VERSION': '0.1.0\n', [STAGE_MODELS_PATH]: json(custom) });
    const item = items(root).find((candidate) => candidate.id === 'sdlc-models-defaults');
    expect(item).toMatchObject({ kind: 'sdlc-models-defaults', action: 'refresh', entries: ['implement', 'verify'], actionable: true });
    const applied = applyUpgrade(root, [item.id], noNetworkRun).results.find((result) => result.id === item.id);
    expect(applied).toEqual({ id: item.id, status: 'applied', updated: [STAGE_MODELS_PATH], refreshed: ['implement', 'verify'] });
    const after = JSON.parse(fs.readFileSync(modelsFile(root), 'utf8'));
    expect(after).toEqual({ ...custom, implement: { model: 'haiku', effort: 'xhigh' }, verify: { model: 'opus', effort: 'medium' } });
    expect(Object.keys(after)).toEqual(Object.keys(custom));
  });

  it('@SCN003 offers an approvable item for an entry on the old default and refreshes only that entry', () => {
    const custom = { ...OLD, verify: { model: 'sonnet', effort: 'max' } };
    const root = project({ 'VERSION': '0.1.0\n', [STAGE_MODELS_PATH]: json(custom) });
    const item = items(root).find((candidate) => candidate.id === 'sdlc-models-defaults');
    expect(item).toMatchObject({ kind: 'sdlc-models-defaults', action: 'refresh', entries: ['implement'], actionable: true, rel: STAGE_MODELS_PATH });
    expect(items(root).some((candidate) => candidate.id === 'sdlc-models')).toBe(false);
    const applied = applyUpgrade(root, [item.id], noNetworkRun).results.find((result) => result.id === item.id);
    expect(applied).toEqual({ id: item.id, status: 'applied', updated: [STAGE_MODELS_PATH], refreshed: ['implement'] });
    const after = JSON.parse(fs.readFileSync(modelsFile(root), 'utf8'));
    expect(after).toEqual({ ...custom, implement: { model: 'haiku', effort: 'xhigh' } });
    expect(Object.keys(after)).toEqual(Object.keys(custom));
    expect(items(root).some((candidate) => candidate.id === 'sdlc-models-defaults')).toBe(false);
  });

  it('names each offered entry\'s current value and the new default in the item description', () => {
    const root = project({ 'VERSION': '0.1.0\n', [STAGE_MODELS_PATH]: json(OLD) });
    const item = items(root).find((candidate) => candidate.id === 'sdlc-models-defaults');
    expect(item.description).toContain('implement from opus/medium to haiku/xhigh');
    expect(item.description).toContain('verify from opus/high to opus/medium');
  });

  it('reports failed with a diagnostic when an approved refresh meets a file made invalid after detection', () => {
    const root = project({ 'VERSION': '0.1.0\n', [STAGE_MODELS_PATH]: json(OLD) });
    expect(items(root).some((candidate) => candidate.id === 'sdlc-models-defaults')).toBe(true);
    const badText = json({ ...OLD, verify: { model: 'opus', effort: 'extreme' } });
    fs.writeFileSync(modelsFile(root), badText);
    const result = applyUpgrade(root, ['sdlc-models-defaults'], noNetworkRun).results.find((candidate) => candidate.id === 'sdlc-models-defaults');
    expect(result.status).toMatch(/^failed:.+/);
    expect(fs.readFileSync(modelsFile(root), 'utf8')).toBe(badText);
  });

  it('reports already-current when an approved refresh meets an entry edited to a custom value after detection', () => {
    const root = project({ 'VERSION': '0.1.0\n', [STAGE_MODELS_PATH]: json(OLD) });
    expect(items(root).some((candidate) => candidate.id === 'sdlc-models-defaults')).toBe(true);
    const customText = json({ ...OLD, implement: { model: 'sonnet', effort: 'low' }, verify: { model: 'opus', effort: 'low' } });
    fs.writeFileSync(modelsFile(root), customText);
    const result = applyUpgrade(root, ['sdlc-models-defaults'], noNetworkRun).results.find((candidate) => candidate.id === 'sdlc-models-defaults');
    expect(result).toEqual({ id: 'sdlc-models-defaults', status: 'already-current' });
    expect(fs.readFileSync(modelsFile(root), 'utf8')).toBe(customText);
  });

  it('leaves the file unchanged when the offer is declined', () => {
    const text = json(OLD);
    const root = project({ 'VERSION': '0.1.0\n', [STAGE_MODELS_PATH]: text });
    applyUpgrade(root, [], noNetworkRun);
    expect(fs.readFileSync(modelsFile(root), 'utf8')).toBe(text);
  });

  it('@SCN004 never offers the current defaults or a project-chosen value, and never rewrites an invalid file', () => {
    for (const config of [STAGE_MODEL_DEFAULTS,
      { ...STAGE_MODEL_DEFAULTS, implement: { model: 'haiku', effort: 'high' }, verify: { model: 'opus', effort: 'low' } }]) {
      const text = json(config);
      const chosen = project({ [STAGE_MODELS_PATH]: text });
      expect(items(chosen).some((candidate) => candidate.id === 'sdlc-models-defaults')).toBe(false);
      expect(refreshStageModelDefaults(chosen)).toMatchObject({ ok: true, changed: false, status: 'already-current' });
      expect(fs.readFileSync(modelsFile(chosen), 'utf8')).toBe(text);
    }
    const badText = json({ ...OLD, verify: { model: 'opus', effort: 'extreme' } });
    const bad = project({ [STAGE_MODELS_PATH]: badText });
    expect(items(bad).some((candidate) => candidate.id === 'sdlc-models-defaults')).toBe(false);
    expect(refreshStageModelDefaults(bad)).toMatchObject({ ok: false, status: 'invalid' });
    expect(fs.readFileSync(modelsFile(bad), 'utf8')).toBe(badText);
    expect(refreshStageModelDefaults(project())).toMatchObject({ ok: false, status: 'invalid' });
  });
});

describe('@SCN005 Repository configuration and documentation state the new defaults (#568 AC5, FR4, FR5)', () => {
  const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

  it('@SCN005 the checked-in file holds implement haiku/xhigh and verify opus/medium', () => {
    const checkedIn = JSON.parse(read(STAGE_MODELS_PATH));
    expect(checkedIn.implement).toEqual({ model: 'haiku', effort: 'xhigh' });
    expect(checkedIn.verify).toEqual({ model: 'opus', effort: 'medium' });
    expect(validateStageModels(checkedIn).missing).toEqual([]);
  });

  it('@SCN005 README, onboarding, and upgrade detection state the new defaults and the earlier-default examples', () => {
    const readme = read('README.md');
    expect(readme).toContain('`implement.model` in `steering/sdlc-models.json` (default `haiku`) | `implement.effort` (default `xhigh`)');
    expect(readme).toContain('`verify.model` in `steering/sdlc-models.json` (default `opus`) | `verify.effort` (default `medium`)');
    expect(readme).toContain('"implement": { "model": "haiku", "effort": "xhigh" }');
    expect(readme).toContain('"verify": { "model": "opus", "effort": "medium" }');
    expect(readme).toContain('earlier plugin default (such as `implement` `opus`/`medium` or `verify` `opus`/`high`)');
    expect(read('workflows/onboard-project/WORKFLOW.md')).toContain('(`implement` `haiku`/`xhigh`, `verify` `opus`/`medium`)');
    expect(read('workflows/upgrade-project/references/detection.md'))
      .toContain('earlier plugin default (`implement` `opus`/`medium`, `verify` `opus`/`high`)');
  });
});

describe('checked-in repository stage models file (AC1, AC2)', () => {
  it('deep-equals the plugin defaults', () => {
    const checkedIn = JSON.parse(fs.readFileSync(path.join(repoRoot, STAGE_MODELS_PATH), 'utf8'));
    expect(checkedIn).toEqual(STAGE_MODEL_DEFAULTS);
  });

  it('emits no sdlc-models or sdlc-models-defaults upgrade item for the repository root', () => {
    const items = detectUpgrade(repoRoot, { run: noNetworkRun }).items;
    expect(items.some((candidate) => candidate.id === 'sdlc-models')).toBe(false);
    expect(items.some((candidate) => candidate.id === 'sdlc-models-defaults')).toBe(false);
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

describe('shared validation module (src/stage-models.mjs)', () => {
  const sharedPath = path.join(repoRoot, 'src/stage-models.mjs');

  it('has no import statements, so the hooks module can load it in the plugin environment', () => {
    const source = fs.readFileSync(sharedPath, 'utf8');
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\bfrom\s+['"]/);
    expect(source).not.toMatch(/\brequire\(/);
  });

  it('is the same validation sdlc-models.mjs re-exports, not a copy', () => {
    expect(sdlcModelsModule.validateStageModels).toBe(stageModelsModule.validateStageModels);
    expect(sdlcModelsModule.StageModelsError).toBe(stageModelsModule.StageModelsError);
    expect(sdlcModelsModule.isValidStageModel).toBe(stageModelsModule.isValidStageModel);
    expect(sdlcModelsModule.stageModelsWarning).toBe(stageModelsModule.stageModelsWarning);
    expect(sdlcModelsModule.STAGE_MODEL_DEFAULTS).toBe(stageModelsModule.STAGE_MODEL_DEFAULTS);
    expect(sdlcModelsModule.STAGE_MODELS_PATH).toBe(stageModelsModule.STAGE_MODELS_PATH);
    expect(sdlcModelsModule.STAGE_NAMES).toBe(stageModelsModule.STAGE_NAMES);
  });

  it('keeps the moved validation reachable through the re-export with the same diagnostic', () => {
    expect(() => validateStageModels({ version: 1, verify: { model: 'opus', effort: 'extreme' } }))
      .toThrow(stageModelsModule.StageModelsError);
    expect(() => stageModelsModule.validateStageModels({ version: 1, verify: { model: 'opus', effort: 'extreme' } }))
      .toThrow('steering/sdlc-models.json: verify.effort = "extreme": must be one of low, medium, high, xhigh, max, default');
    expect(isValidStageModel('opencode-go/kimi-k3.1-pro')).toBe(true);
    expect(isValidStageModel('not a model!')).toBe(false);
  });
});

describe('stageModelsWarning', () => {
  it('is null for a complete file and names the missing keys for a partial one', () => {
    expect(stageModelsWarning({ missing: false, missingKeys: [], warning: null })).toBeNull();
    expect(stageModelsWarning({ missing: false, missingKeys: ['repair'] })).toContain('missing repair; using plugin defaults for them');
    expect(stageModelsWarning({ missing: true, missingKeys: [] })).toBe(ABSENT_WARNING);
  });
});

describe('@SCN002 Selection model and effort are configurable: the selection model entry', () => {
  it('fails selection effort "huge" with the steering/sdlc-models.json diagnostic naming selection.effort', () => {
    const selection = { model: 'sonnet', effort: 'huge' };
    const config = { ...JSON.parse(JSON.stringify(STAGE_MODEL_DEFAULTS)), selection };
    expect(() => validateStageModels(config)).toThrow(StageModelsError);
    expect(() => validateStageModels(config)).toThrow('steering/sdlc-models.json: selection.effort = "huge": must be one of');
  });
});
