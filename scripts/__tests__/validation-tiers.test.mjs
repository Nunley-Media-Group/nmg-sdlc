import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { loadSteeringRuntime, readManifestOptions, validationTier } from '../../src/sdlc-steering-runtime.mjs';
import { runSteeringValidations } from '../../src/sdlc-verification-runtime.mjs';
import { matchesRegisteredResults } from '../sdlc-finalize-verification.mjs';
import { fileURLToPath } from 'node:url';
import { acquireHeavySlot, heavyPoolHolders, heavyPoolSize, HOST_STATE_ENV } from '../../src/heavy-pool.mjs';
import { heavyPoolList, parseHeavyPoolCli, runHeavy } from '../sdlc-heavy-pool.mjs';

const VERIFY_STEERING = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-verify-steering.mjs');
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
const node = (id, code, extra = {}) => ({ id, provider: 'builtin.command', required: true, when: { kind: 'always' },
  config: { program: process.execPath, args: ['-e', code], cwd: '.', env: [] }, ...extra });
// The top-level selection that enables the prompt-driven selection, and the validation-level fallback paths.
const SELECTION = { docPaths: ['docs/**'], fallbackPaths: ['package.json'] };
const FALLBACK_PATHS = ['config/**'];
const SURFACES = [{ id: 'app', sources: ['src/**'] }, { id: 'steering-files', sources: ['steering/**'] }];
// The validation command records the arguments it ran with: none for the full command, the tests for a selection.
const RECORD_ARGS = "require('node:fs').writeFileSync('ran.json', JSON.stringify(process.argv.slice(1)))";
const selecting = (extra = {}) => node('unit.tests', RECORD_ARGS, { tier: 'change', selection: true, fallbackPaths: FALLBACK_PATHS, ...extra });
// The headless Claude call, injected: it keeps each call and answers with the prepared structured output.
const claudeCalls = [];
let claudeAnswer = null;
const runSelection = (call) => {
  claudeCalls.push(call);
  if (claudeAnswer === null) return { status: 1, stdout: '', stderr: 'crashed' };
  return { status: 0, stdout: typeof claudeAnswer === 'string' ? claudeAnswer : JSON.stringify({ type: 'result', structured_output: claudeAnswer }) };
};
afterEach(() => { claudeCalls.length = 0; claudeAnswer = null; });

// The test files the selection answers name: a selected test must be a file in the project.
const TEST_FILES = ['tests/app.test.js', 'tests/util.test.js', 'a.test.js', 'b.test.js', 'one.test.js'];

/** A committed project on branch `work` with `validations` and the test files, whose base branch is `main`. */
async function fixture(validations, { manifest = {} } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-tiers-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'specs', '42-test'), { recursive: true });
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    fs.writeFileSync(path.join(root, 'specs', '42-test', name), `${name}\n`);
  }
  fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\nprovider-request.json\nprovider-answer.json\nran.json\n');
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  for (const file of TEST_FILES) fs.writeFileSync(path.join(root, file), `// ${file}\n`);
  // `selection: true` needs the top-level selection, which the initialize plan does not write.
  const optedIn = validations.some((validation) => validation.selection === true);
  await applySteeringPlan(root, createInitializePlan(root, { validations: validations.map(({ selection: _selection, ...validation }) => validation) }));
  const extra = optedIn ? { selection: SELECTION, surfaces: SURFACES, ...manifest } : manifest;
  if (Object.keys(extra).length || optedIn) {
    const file = path.join(root, 'steering/manifest.json');
    fs.writeFileSync(file, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...extra, validations }, null, 2)}\n`);
  }
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'baseline');
  git(root, 'checkout', '-b', 'work');
  return root;
}
const change = (root, file, content = 'changed\n') => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
  git(root, 'add', '.');
  git(root, 'commit', '-m', `change ${file}`);
};
const answer = (root, value) => fs.writeFileSync(path.join(root, 'provider-answer.json'), typeof value === 'string' ? value : JSON.stringify(value));
const ranWith = (root) => (fs.existsSync(path.join(root, 'ran.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'ran.json'), 'utf8')) : null);
const providerRequest = (root) => (fs.existsSync(path.join(root, 'provider-request.json'))
  ? JSON.parse(fs.readFileSync(path.join(root, 'provider-request.json'), 'utf8')) : null);
const verify = (root, options = {}) => runSteeringValidations({ projectRoot: root, issue: 42,
  specDir: path.join(root, 'specs/42-test'), baseRef: 'main', verificationRunId: 'run-1', runSelection, models: {}, ...options });
const editManifest = (root, edit) => {
  const file = path.join(root, 'steering/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(manifest);
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
};

describe('steering manifest tiers, heavy marker and optional settings (#551 FR15-FR17)', () => {
  it('accepts tier, heavy, selection and fallbackPaths on a validation and exposes them on the runtime', async () => {
    const root = await fixture([
      selecting({ heavy: true }),
      node('lint', 'process.exit(0)', { tier: 'change', fallbackPaths: ['src/**'] }),
      node('full.suite', 'process.exit(0)', { tier: 'full', heavy: false }),
      node('untiered', 'process.exit(0)'),
    ]);
    const runtime = await loadSteeringRuntime(root);
    expect(runtime.tiered).toBe(true);
    expect(runtime.validations.map(validationTier)).toEqual(['change', 'change', 'full', 'change']);
    expect(runtime.validations[0]).toMatchObject({ tier: 'change', heavy: true, fallbackPaths: FALLBACK_PATHS, selection: true });
    expect(runtime.validations[2]).toMatchObject({ tier: 'full', heavy: false });
    expect(Object.hasOwn(runtime.validations[3], 'tier')).toBe(false);
    expect(runtime).toMatchObject({ worktree: null, changelogFragments: null, fullGreenActions: [] });
  });

  it('keeps a manifest without tiers untiered, with every validation in the change tier', async () => {
    const root = await fixture([node('unit.tests', 'process.exit(0)')]);
    const runtime = await loadSteeringRuntime(root);
    expect(runtime.tiered).toBe(false);
    expect(validationTier(runtime.validations[0])).toBe('change');
  });

  it.each([
    ['an unknown tier', (v) => { v.tier = 'nightly'; }],
    ['a non-boolean heavy marker', (v) => { v.heavy = 'yes'; }],
    ['a selection on a full-tier validation', (v) => { v.tier = 'full'; v.selection = true; }],
    ['a selection without a tier', (v) => { v.selection = true; }],
    ['a selection that is neither true nor a command', (v) => { v.tier = 'change'; v.selection = 'yes'; }],
    ['a selection on a validation that is not builtin.command', (v) => {
      Object.assign(v, { tier: 'change', provider: 'builtin.artifact', config: { path: 'out.json', checks: ['json'] }, selection: true }); }],
    ['a fallback path that escapes the project', (v) => { v.tier = 'change'; v.fallbackPaths = ['../x']; }],
    ['an absolute fallback path', (v) => { v.tier = 'change'; v.fallbackPaths = ['/etc/**']; }],
    ['a negated fallback path', (v) => { v.tier = 'change'; v.fallbackPaths = ['!src/**']; }],
    ['fallbackPaths that are not an array', (v) => { v.tier = 'change'; v.fallbackPaths = 'package.json'; }],
    ['fallbackPaths on a full-tier validation', (v) => { v.tier = 'full'; v.fallbackPaths = ['package.json']; }],
    ['fallbackPaths without a tier', (v) => { v.fallbackPaths = ['package.json']; }],
  ])('rejects %s with steering_validation_invalid', async (_name, edit) => {
    const root = await fixture([node('unit.tests', 'process.exit(0)')], { manifest: { selection: SELECTION } });
    editManifest(root, (manifest) => edit(manifest.validations[0]));
    await expect(loadSteeringRuntime(root)).rejects.toMatchObject({ reasonCode: 'steering_validation_invalid' });
  });

  it('@SCN003 rejects selection: true in a manifest without the top-level selection (#584 FR1)', async () => {
    const root = await fixture([node('unit.tests', 'process.exit(0)', { tier: 'change', selection: true })]);
    await expect(loadSteeringRuntime(root)).resolves.toMatchObject({ selection: SELECTION });
    editManifest(root, (manifest) => { delete manifest.selection; });
    await expect(loadSteeringRuntime(root)).rejects.toMatchObject({ reasonCode: 'steering_validation_invalid' });
  });

  it.each([
    ['a selection glob that escapes the project', { selection: { docPaths: ['../x'] } }],
    ['a negated selection glob', { selection: { fallbackPaths: ['!src/**'] } }],
    ['an unknown selection key', { selection: { docs: ['docs/**'] } }],
    ['an empty surfaces map', { surfaces: [] }],
    ['a surface with an invalid id', { surfaces: [{ id: 'App', sources: ['src/**'] }] }],
    ['duplicate surface ids', { surfaces: [{ id: 'app', sources: ['src/**'] }, { id: 'app', sources: ['lib/**'] }] }],
    ['a surface naming an unknown validation', { surfaces: [{ id: 'app', sources: ['src/**'], validations: ['nope'] }] }],
  ])('@SCN003 rejects %s with steering_manifest_invalid (#584 FR1)', async (_name, manifest) => {
    const root = await fixture([node('unit.tests', 'process.exit(0)')], { manifest });
    await expect(loadSteeringRuntime(root)).rejects.toMatchObject({ reasonCode: 'steering_manifest_invalid' });
  });

  it('rejects a validation key it does not know', async () => {
    const root = await fixture([node('unit.tests', 'process.exit(0)', { tier: 'change' })]);
    editManifest(root, (manifest) => { manifest.validations[0].pool = true; });
    await expect(loadSteeringRuntime(root)).rejects.toMatchObject({ reasonCode: 'steering_manifest_unknown_key' });
  });

  it.each([
    ['on a validation', (manifest) => { manifest.selection = SELECTION; Object.assign(manifest.validations[0], { tier: 'change', selection: { program: 'node', args: ['select.js'] } }); }],
    ['at the top level', (manifest) => { manifest.selection = { program: 'node', args: ['select.js'] }; }],
    ['at the top level without args', (manifest) => { manifest.selection = { program: 'node' }; }],
  ])('@SCN003 rejects the command form of selection %s, saying selection takes a prompt (#584 AC3)', async (_name, edit) => {
    const root = await fixture([node('unit.tests', 'process.exit(0)')]);
    editManifest(root, edit);
    const error = await loadSteeringRuntime(root).catch((caught) => caught);
    expect(error.reasonCode).toBe('steering_validation_invalid');
    expect(error.message).toContain('selection takes a prompt');
  });

  it('accepts worktree commands and full-green actions, and rejects malformed ones', async () => {
    const options = {
      worktree: { setup: { program: 'npm', args: ['ci'], cwd: 'scripts' }, teardown: { program: 'node', args: ['-e', '0'] } },
      fullGreen: { actions: ['deploy', 'release.publish'] },
    };
    const root = await fixture([], { manifest: options });
    const runtime = await loadSteeringRuntime(root);
    expect(runtime.worktree).toEqual({ setup: options.worktree.setup, teardown: options.worktree.teardown });
    expect(runtime.fullGreenActions).toEqual(['deploy', 'release.publish']);
    expect(readManifestOptions(root)).toMatchObject({ worktree: { setup: options.worktree.setup }, changelogFragments: null,
      fullGreenActions: ['deploy', 'release.publish'] });
    editManifest(root, (manifest) => { manifest.worktree = { setup: options.worktree.setup }; });
    expect((await loadSteeringRuntime(root)).worktree).toEqual({ setup: options.worktree.setup, teardown: null });
    for (const edit of [
      (m) => { m.worktree = { setup: { program: 'sh', args: ['-c', 'x'] } }; },
      (m) => { m.worktree = { install: { program: 'npm', args: [] } }; },
      (m) => { m.worktree = []; },
      (m) => { m.fullGreen = { actions: ['Deploy Now'] }; },
      (m) => { m.fullGreen = { actions: ['deploy', 'deploy'] }; },
      (m) => { m.fullGreen = { actions: 'deploy' }; },
      (m) => { m.fullGreen = { actions: ['deploy'], extra: 1 }; },
      (m) => { m.fullGreen = ['deploy']; },
    ]) {
      editManifest(root, (manifest) => { Object.assign(manifest, options); edit(manifest); });
      await expect(loadSteeringRuntime(root)).rejects.toMatchObject({ reasonCode: 'steering_manifest_invalid' });
      expect(() => readManifestOptions(root)).toThrow('steering_manifest_invalid');
    }
    // The earlier top-level spelling is not a manifest key.
    for (const key of ['fullGreenActions', 'unknown']) {
      editManifest(root, (manifest) => { Object.assign(manifest, options); manifest[key] = ['deploy']; });
      await expect(loadSteeringRuntime(root)).rejects.toMatchObject({ reasonCode: 'steering_manifest_unknown_key' });
      editManifest(root, (manifest) => { delete manifest[key]; });
    }
  });

  it('accepts a changelog fragments dir and rejects malformed ones', async () => {
    const root = await fixture([], { manifest: { changelog: { fragments: { dir: 'changelog.d' } } } });
    // The manifest key is `dir`; the normalized setting holds that one directory.
    expect(Object.values((await loadSteeringRuntime(root)).changelogFragments)).toEqual(['changelog.d']);
    expect(Object.values(readManifestOptions(root).changelogFragments)).toEqual(['changelog.d']);
    for (const fragments of [{ dir: '../outside' }, { dir: 'changelog.d', extra: 1 }, { directory: 'changelog.d' }, {}]) {
      editManifest(root, (manifest) => { manifest.changelog = { fragments }; });
      await expect(loadSteeringRuntime(root)).rejects.toMatchObject({ reasonCode: 'steering_manifest_invalid' });
    }
  });
});

describe('change-tier selection (#551 AC9, AC10, FR16-FR18)', () => {
  const tiered = () => [selecting(), node('full.suite', 'process.exit(1)', { tier: 'full' })];
  const selected = (extra = {}) => ({ mode: 'selected', tests: ['tests/app.test.js', 'tests/util.test.js'], surfaces: ['app'], ...extra });

  it('@SCN001 runs the command with the selected tests appended and records the selection (#584 AC1)', async () => {
    const root = await fixture(tiered());
    change(root, 'src/app.js');
    claudeAnswer = selected();
    const artifact = await verify(root);
    expect(artifact.tier).toBe('pre-merge');
    // `node -e <code> <tests...>`: the declared args stay, the tests follow them.
    expect(ranWith(root)).toEqual(['tests/app.test.js', 'tests/util.test.js']);
    expect(claudeCalls).toHaveLength(1);
    expect(claudeCalls[0].input).toContain('Base ref: main');
    expect(claudeCalls[0].input).toContain('- src/app.js');
    expect(artifact.ceiling).toBeNull();
    const [unit, full] = artifact.results;
    expect(unit).toMatchObject({ id: 'unit.tests', tier: 'change', applicable: true, effectiveStatus: 'passed' });
    expect(unit.selection).toEqual({ provider: 'claude:haiku', reason: 'selected', fallbackPath: null, selectedCount: 2 });
    expect(unit.request.config.args).toEqual(['-e', RECORD_ARGS]);
    expect(unit.request.command).toEqual({ args: ['-e', RECORD_ARGS, 'tests/app.test.js', 'tests/util.test.js'] });
    expect(unit.result.evidence[0].summary).toContain('tests/app.test.js tests/util.test.js exited 0');
    expect(artifact.selection).toMatchObject({ model: 'haiku', effort: 'xhigh', mode: 'selected', reason: 'selected',
      tests: ['tests/app.test.js', 'tests/util.test.js'], surfaces: ['app'], requiredSurfaces: ['app'], guidanceSupplied: false, rejection: null });
    expect(artifact.selection.prompt.consumer).toBe('gate:selection');
    expect(artifact.selection.prompt.fragments.map(({ id }) => id)).toEqual(['plugin.gate.selection']);
    // The full tier is recorded but never runs before merge.
    expect(full).toMatchObject({ id: 'full.suite', tier: 'full', selection: null, applicable: false, effectiveStatus: 'skipped', result: null });
    const written = JSON.parse(fs.readFileSync(path.join(root, '.nmg-sdlc/verification/42.json'), 'utf8'));
    expect(written.results[0]).toMatchObject({ tier: 'change', selection: unit.selection });
  });

  it('@SCN001 runs each selected test once (#584 AC1)', async () => {
    const root = await fixture(tiered());
    change(root, 'src/app.js');
    claudeAnswer = selected({ tests: ['a.test.js', 'a.test.js', 'b.test.js'] });
    const artifact = await verify(root);
    expect(ranWith(root)).toEqual(['a.test.js', 'b.test.js']);
    expect(artifact.results[0].selection).toMatchObject({ reason: 'selected', selectedCount: 2 });
  });

  it('@SCN010 runs the full command for a change that touches a fallback path, naming the first one, without asking Claude (#584 AC9)', async () => {
    const root = await fixture(tiered());
    change(root, 'src/app.js');
    change(root, 'package.json');
    change(root, 'config/app.json');
    claudeAnswer = selected();
    const artifact = await verify(root);
    expect(artifact.ceiling).toBeNull();
    expect(ranWith(root)).toEqual([]);
    expect(claudeCalls).toHaveLength(0);
    expect(artifact.results[0]).toMatchObject({ effectiveStatus: 'passed', tier: 'change' });
    expect(artifact.results[0].selection).toEqual({ provider: 'claude:haiku', reason: 'fallback_path', fallbackPath: 'config/app.json', selectedCount: null });
    expect(Object.hasOwn(artifact.results[0].request, 'command')).toBe(false);
  });

  it.each([
    ['Claude asking for everything', { mode: 'all', tests: [], surfaces: [] }, 'selection_all'],
    ['Claude exiting non-zero', null, 'selection_failed'],
  ])('@SCN010 runs the full command and records why for %s (#584 AC9)', async (_name, output, reason) => {
    const root = await fixture(tiered());
    change(root, 'src/app.js');
    claudeAnswer = output;
    const artifact = await verify(root);
    expect(artifact.ceiling).toBeNull();
    expect(ranWith(root)).toEqual([]);
    expect(artifact.results[0]).toMatchObject({ effectiveStatus: 'passed', tier: 'change' });
    expect(artifact.results[0].selection).toEqual({ provider: 'claude:haiku', reason, fallbackPath: null, selectedCount: null });
  });

  it('runs a change-tier validation that does not opt in with its full command', async () => {
    const root = await fixture([node('unit.tests', RECORD_ARGS, { tier: 'change', fallbackPaths: FALLBACK_PATHS }), node('untiered', 'process.exit(0)')]);
    change(root, 'src/app.js');
    const artifact = await verify(root);
    expect(ranWith(root)).toEqual([]);
    expect(artifact.results.map(({ id, tier, selection, effectiveStatus }) => ({ id, tier, selection, effectiveStatus }))).toEqual([
      { id: 'unit.tests', tier: 'change', selection: null, effectiveStatus: 'passed' },
      { id: 'untiered', tier: null, selection: null, effectiveStatus: 'passed' },
    ]);
  });

  it('runs the full tier, and only it, in a full run', async () => {
    const root = await fixture([node('unit.tests', 'process.exit(1)', { tier: 'change' }), node('untiered', 'process.exit(1)'),
      node('full.suite', 'process.exit(0)', { tier: 'full' })]);
    const artifact = await verify(root, { tier: 'full' });
    expect(artifact).toMatchObject({ tier: 'full', ceiling: null });
    expect(artifact.results.map(({ id, tier, applicable, effectiveStatus }) => ({ id, tier, applicable, effectiveStatus }))).toEqual([
      { id: 'unit.tests', tier: 'change', applicable: false, effectiveStatus: 'skipped' },
      { id: 'untiered', tier: null, applicable: false, effectiveStatus: 'skipped' },
      { id: 'full.suite', tier: 'full', applicable: true, effectiveStatus: 'passed' },
    ]);
    expect(await verify(root)).toMatchObject({ tier: 'pre-merge', ceiling: 'Fail' });
  });

  it('takes the tier from the verify-steering command line', async () => {
    const root = await fixture([node('unit.tests', 'process.exit(1)', { tier: 'change' }), node('full.suite', 'process.exit(0)', { tier: 'full' })]);
    const cli = (...extra) => spawnSync(process.execPath, [VERIFY_STEERING, '--project', root, '--issue', '42', '--spec', 'specs/42-test', ...extra], { encoding: 'utf8' });
    const record = () => JSON.parse(fs.readFileSync(path.join(root, '.nmg-sdlc/verification/42.json'), 'utf8'));
    const full = cli('--tier', 'full');
    expect(full.status).toBe(0);
    expect(JSON.parse(full.stdout)).toMatchObject({ ok: true, ceiling: null });
    expect(record().tier).toBe('full');
    for (const extra of [[], ['--tier', 'pre-merge']]) {
      const gate = cli(...extra);
      expect(gate.status).toBe(1);
      expect(JSON.parse(gate.stdout)).toMatchObject({ ok: false, ceiling: 'Fail' });
      expect(record().tier).toBe('pre-merge');
    }
    const invalid = cli('--tier', 'change');
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout)).toMatchObject({ ok: false, reasonCode: 'invalid_arguments' });
  });
});

describe('projects without tiers (#551 AC13, FR21)', () => {
  it('runs every required validation with its full command and records tier and selection as null', async () => {
    const root = await fixture([node('unit.tests', RECORD_ARGS), node('lint', 'process.exit(0)'),
      node('docs', 'process.exit(1)', { when: { kind: 'changed_paths', include: ['docs/**'] } })]);
    change(root, 'package.json');
    const artifact = await verify(root);
    expect(artifact.ceiling).toBeNull();
    expect(Object.hasOwn(artifact, 'tier')).toBe(false);
    expect(ranWith(root)).toEqual([]);
    expect(providerRequest(root)).toBeNull();
    for (const result of artifact.results.slice(0, 2)) {
      expect(result).toMatchObject({ applicable: true, effectiveStatus: 'passed', tier: null, selection: null });
      expect(Object.keys(result).sort()).toEqual(['applicable', 'effectiveStatus', 'id', 'provider', 'request', 'required', 'result', 'selection', 'tier']);
      expect(Object.hasOwn(result.request, 'command')).toBe(false);
    }
    expect(artifact.results[2]).toEqual({ id: 'docs', provider: 'builtin.command', required: true, tier: null, selection: null,
      applicable: false, effectiveStatus: 'skipped', result: null });
  });
});

describe('registered gate with tiers (#551)', () => {
  const gate = (root, artifact) => matchesRegisteredResults(root, artifact, { issue: 42, specPath: 'specs/42-test',
    gateHead: git(root, 'rev-parse', 'HEAD'), reportPath: 'specs/42-test/verification-report.md',
    run: () => ({ status: 0, stdout: 'main\n' }) });

  it('accepts a pre-merge gate whose full-tier validation is a skip, and rejects a full-tier artifact as the gate', async () => {
    const root = await fixture([selecting(), node('full.suite', 'process.exit(1)', { tier: 'full' })]);
    change(root, 'src/app.js');
    claudeAnswer = { mode: 'selected', tests: ['a.test.js'], surfaces: ['app'] };
    const artifact = await verify(root);
    expect(artifact).toMatchObject({ ceiling: null, tier: 'pre-merge', results: [{ selection: { reason: 'selected' } }, { applicable: false }] });
    expect(gate(root, artifact)).toBe(true);
    expect(gate(root, { ...artifact, results: artifact.results.map((result) => (result.id === 'full.suite'
      ? { ...result, applicable: true } : result)) })).toBe(false);
    const { tier: _tier, ...untiered } = artifact;
    expect(gate(root, untiered)).toBe(false);
    expect(gate(root, { ...artifact, tier: 'change' })).toBe(false);
    const full = await verify(root, { tier: 'full' });
    expect(full.tier).toBe('full');
    expect(gate(root, full)).toBe(false);
  });

  it('accepts an untiered project\'s gate artifact, which names no tier', async () => {
    const root = await fixture([node('unit.tests', 'process.exit(0)')]);
    const artifact = await verify(root);
    expect(Object.hasOwn(artifact, 'tier')).toBe(false);
    expect(gate(root, artifact)).toBe(true);
  });
});

describe('concurrent Phase 2 validations (#580)', () => {
  // A project provider that hands each request to the test's recorder, so a test controls its timing and outcome.
  const EXTENSION = `export const extension = Object.freeze({ schemaVersion: 1, id: 'test.concurrent',
  providers: Object.freeze({ 'project.timed': (request) => globalThis.__nmg580Provider(request) }) });\n`;
  const timed = (id, config = {}, extra = {}) => ({ id, provider: 'project.timed', required: true, when: { kind: 'always' }, config, ...extra });
  afterEach(() => { delete globalThis.__nmg580Provider; });
  // Each test builds git fixtures and runs the gate; under a loaded full-suite run that exceeds Jest's 5s default.
  const FIXTURE_TIMEOUT = 30_000;

  async function project(validations) {
    const root = await fixture([]);
    fs.mkdirSync(path.join(root, 'steering/extensions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'steering/extensions/timed.mjs'), EXTENSION);
    editManifest(root, (manifest) => {
      manifest.extensions.push({ id: 'test.concurrent', path: 'steering/extensions/timed.mjs', providers: ['project.timed'] });
      manifest.validations = validations;
      if (validations.some((validation) => validation.selection === true)) Object.assign(manifest, { selection: SELECTION, surfaces: SURFACES });
    });
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'concurrent validations');
    return root;
  }
  /** Installs the provider; returns each validation's `{ start, end, cancelled }` span. */
  function recorder({ onStart = () => {} } = {}) {
    const spans = {};
    globalThis.__nmg580Provider = async (request) => {
      const { delay = 0, status = 'passed' } = request.config;
      const span = { start: performance.now(), end: null, cancelled: false };
      spans[request.validationId] = span;
      onStart(request.validationId, spans);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, delay);
        request.signal?.addEventListener('abort', () => { span.cancelled = true; clearTimeout(timer); resolve(); }, { once: true });
      });
      span.end = performance.now();
      return { schemaVersion: 1, status, summary: `${request.validationId} ${status}`, identity: request.identity,
        evidence: [{ kind: 'extension', summary: request.validationId, artifact: null }] };
    };
    return spans;
  }
  const overlaps = (x, y) => x.start < y.end && y.start < x.end;
  const startOrder = (spans) => Object.entries(spans).sort(([, x], [, y]) => x.start - y.start).map(([id]) => id);

  it('starts every flagged validation together, so the batch takes about as long as its slowest member (AC1)', async () => {
    const root = await project([timed('a', { delay: 400 }, { concurrent: true }), timed('b', { delay: 500 }, { concurrent: true })]);
    const spans = recorder();
    const artifact = await verify(root);
    expect(artifact.ceiling).toBeNull();
    const { a, b } = spans;
    expect(Math.max(a.start, b.start)).toBeLessThan(Math.min(a.end, b.end));
    expect(Math.max(a.end, b.end) - Math.min(a.start, b.start)).toBeLessThan(800);
  }, FIXTURE_TIMEOUT);

  it('never overlaps an unflagged validation with another (AC2)', async () => {
    const root = await project([timed('a', { delay: 150 }, { concurrent: true }), timed('b', { delay: 100 }),
      timed('c', { delay: 150 }, { concurrent: true }), timed('d', { delay: 100 }, { concurrent: false })]);
    const spans = recorder();
    expect((await verify(root)).ceiling).toBeNull();
    expect(overlaps(spans.a, spans.c)).toBe(true);
    for (const unflagged of ['b', 'd']) {
      for (const other of Object.keys(spans).filter((id) => id !== unflagged)) expect(overlaps(spans[unflagged], spans[other])).toBe(false);
    }
    expect(startOrder(spans).slice(2)).toEqual(['b', 'd']);
  }, FIXTURE_TIMEOUT);

  it('keeps the serial run in manifest order without the key and with every validation `concurrent: false` (AC2)', async () => {
    const normalize = (artifact) => artifact.results.map((result) => ({ keys: Object.keys(result).sort(), id: result.id,
      effectiveStatus: result.effectiveStatus, selection: result.selection, status: result.result.status, summary: result.result.summary }));
    const serial = [];
    for (const flag of [undefined, false]) {
      const extra = flag === undefined ? {} : { concurrent: flag };
      const plain = await project(['a', 'b', 'c', 'd'].map((id) => timed(id, { delay: 50 }, extra)));
      const plainSpans = recorder();
      const artifact = await verify(plain);
      expect(startOrder(plainSpans)).toEqual(['a', 'b', 'c', 'd']);
      for (const [id, span] of Object.entries(plainSpans)) {
        for (const [other, next] of Object.entries(plainSpans)) if (other !== id) expect(overlaps(span, next)).toBe(false);
      }
      serial.push(normalize(artifact));
    }
    expect(serial[0]).toEqual(serial[1]);
    expect(serial[0].map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd']);
  }, FIXTURE_TIMEOUT);

  it('lets every member finish and record its result when another fails fast (AC3)', async () => {
    const root = await project([timed('fast', { delay: 20, status: 'failed' }, { concurrent: true }),
      timed('slow', { delay: 300 }, { concurrent: true }), timed('after')]);
    const spans = recorder();
    const artifact = await verify(root);
    expect(spans.slow.end).toBeGreaterThan(spans.fast.end);
    expect(artifact.results.map(({ id, effectiveStatus }) => ({ id, effectiveStatus }))).toEqual([
      { id: 'fast', effectiveStatus: 'failed' }, { id: 'slow', effectiveStatus: 'passed' }, { id: 'after', effectiveStatus: 'passed' }]);
    expect(artifact.coverage.complete).toBe(true);
    expect(artifact.ceiling).toBe('Fail');
  }, FIXTURE_TIMEOUT);

  it('records results in manifest order with the fields of a serial run, whatever order they finish in (AC4)', async () => {
    const root = await project([timed('slow', { delay: 400 }, { concurrent: true, heavy: true }), timed('fast', { delay: 20 }, { concurrent: true }),
      selecting({ required: false, concurrent: true })]);
    claudeAnswer = { mode: 'selected', tests: ['one.test.js'], surfaces: ['steering-files'] };
    const acquireSlot = async () => ({ slot: 1, waitedMs: 0, release() {} });
    const spans = recorder();
    const concurrent = await verify(root, { acquireSlot });
    expect(spans.fast.end).toBeLessThan(spans.slow.end);
    expect(concurrent.results.map(({ id }) => id)).toEqual(['slow', 'fast', 'unit.tests']);
    expect(concurrent.results[0].heavy).toEqual({ slot: 1, waitedMs: 0 });
    expect(concurrent.results[2].selection).toMatchObject({ reason: 'selected', selectedCount: 1 });

    editManifest(root, (manifest) => { for (const validation of manifest.validations) delete validation.concurrent; });
    recorder();
    const serial = await verify(root, { acquireSlot });
    expect(concurrent.results.map((result) => Object.keys(result).sort())).toEqual(serial.results.map((result) => Object.keys(result).sort()));
    expect(concurrent.results.map(({ heavy, selection, effectiveStatus }) => ({ heavy, selection, effectiveStatus })))
      .toEqual(serial.results.map(({ heavy, selection, effectiveStatus }) => ({ heavy, selection, effectiveStatus })));
  }, FIXTURE_TIMEOUT);

  it('makes a heavy member wait for a pool slot while the members that are not heavy start at once (AC5)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-host-'));
    roots.push(dir);
    const env = { [HOST_STATE_ENV]: dir };
    const root = await project([timed('heavy', { delay: 50 }, { concurrent: true, heavy: true }), timed('light', { delay: 50 }, { concurrent: true })]);
    const held = await acquireHeavySlot({ label: 'held', env });
    // The held slot frees 300ms after the member that is not heavy starts.
    let grantedAt = Infinity;
    const spans = recorder({ onStart: (id) => { if (id === 'light') setTimeout(() => { grantedAt = performance.now(); held.release(); }, 300); } });
    const artifact = await verify(root, { acquireSlot: (options) => acquireHeavySlot({ ...options, env, pollMs: 20 }) });
    expect(spans.light.start).toBeLessThan(grantedAt);
    expect(spans.heavy.start).toBeGreaterThanOrEqual(grantedAt);
    expect(artifact.results[0].heavy.slot).toBe(1);
    expect(artifact.results[0].heavy.waitedMs).toBeGreaterThanOrEqual(250);
    expect(Object.hasOwn(artifact.results[1], 'heavy')).toBe(false);
    expect(heavyPoolHolders({ env })).toEqual([]);
  }, FIXTURE_TIMEOUT);

  it('defers flagged project providers after a required local command fails (AC6)', async () => {
    const root = await project([node('local', 'process.exit(1)'), timed('p1', {}, { concurrent: true }), timed('p2', {}, { concurrent: true }), timed('p3')]);
    const spans = recorder();
    const artifact = await verify(root);
    expect(spans).toEqual({});
    for (const result of artifact.results.slice(1)) {
      expect(result).toMatchObject({ effectiveStatus: 'incomplete', result: { summary: 'deferred until required local validations pass' } });
    }
  }, FIXTURE_TIMEOUT);

  it('cancels every running member, releases each held slot and records each as non-passing on abort (AC7)', async () => {
    const root = await project([timed('h', { delay: 60_000 }, { concurrent: true, heavy: true }), timed('l', { delay: 60_000 }, { concurrent: true }), timed('later')]);
    const controller = new AbortController();
    let released = 0;
    const acquireSlot = async () => ({ slot: 1, waitedMs: 0, release() { released += 1; } });
    const spans = recorder({ onStart: (_id, all) => { if (all.h && all.l) setTimeout(() => controller.abort(), 20); } });
    const artifact = await verify(root, { acquireSlot, signal: controller.signal });
    expect(spans.h.cancelled && spans.l.cancelled).toBe(true);
    expect(released).toBe(1);
    expect(artifact.results.map(({ id, effectiveStatus }) => ({ id, effectiveStatus }))).toEqual([
      { id: 'h', effectiveStatus: 'incomplete' }, { id: 'l', effectiveStatus: 'incomplete' }, { id: 'later', effectiveStatus: 'incomplete' }]);
    expect(artifact.ceiling).toBe('Incomplete');
  }, FIXTURE_TIMEOUT);
});

describe('host-wide heavy-job pool (#551 AC7)', () => {
  const host = (slots = 1) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-host-'));
    roots.push(dir);
    if (slots !== null) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ heavyJobSlots: slots }));
    return { [HOST_STATE_ENV]: dir };
  };

  it('reads its size from the host config file and defaults to one', () => {
    const env = host(null);
    expect(heavyPoolSize(env)).toBe(1);
    const config = path.join(env[HOST_STATE_ENV], 'config.json');
    fs.writeFileSync(config, JSON.stringify({ heavyJobSlots: 3 }));
    expect(heavyPoolSize(env)).toBe(3);
    for (const invalid of [0, -1, 1.5, '2', null]) {
      fs.writeFileSync(config, JSON.stringify({ heavyJobSlots: invalid }));
      expect(heavyPoolSize(env)).toBe(1);
    }
    fs.writeFileSync(config, 'not json');
    expect(heavyPoolSize(env)).toBe(1);
  });

  it('makes a second job wait for the slot and reports how long it waited', async () => {
    const env = host();
    const clock = { now: 1_000_000 };
    const first = await acquireHeavySlot({ label: 'suite A', projectRoot: '/a', issue: 7, env, now: () => clock.now });
    expect(first).toMatchObject({ slot: 1, slots: 1, waitedMs: 0 });
    expect(heavyPoolHolders({ env })).toEqual([{ slot: 1, pid: process.pid, label: 'suite A', projectRoot: '/a', startedAt: 1_000_000, alive: true, issue: 7 }]);
    let polls = 0;
    const second = await acquireHeavySlot({ label: 'suite B', projectRoot: '/b', env, now: () => clock.now, pollMs: 1000,
      sleep: async (ms) => { polls += 1; clock.now += ms; if (polls === 3) expect(first.release()).toBe(true); } });
    expect(second).toMatchObject({ slot: 1, waitedMs: 3000 });
    expect(first.release()).toBe(false);
    expect(second.release()).toBe(true);
    expect(heavyPoolHolders({ env })).toEqual([]);
  });

  it('reclaims a slot whose holder process is dead', async () => {
    const env = host();
    const dead = 2 ** 22 + 12345;
    await acquireHeavySlot({ label: 'crashed', env, pid: dead, alive: () => true });
    const alive = (pid) => pid !== dead;
    expect(heavyPoolHolders({ env, alive })).toMatchObject([{ slot: 1, pid: dead, label: 'crashed', alive: false }]);
    const next = await acquireHeavySlot({ label: 'next', env, alive, sleep: async () => { throw new Error('should not wait'); } });
    expect(next).toMatchObject({ slot: 1, waitedMs: 0 });
    expect(heavyPoolHolders({ env, alive })).toMatchObject([{ slot: 1, pid: process.pid, label: 'next', alive: true }]);
    next.release();
  });

  it('uses every slot of a larger pool before making a job wait', async () => {
    const env = host(2);
    const one = await acquireHeavySlot({ label: 'one', env });
    const two = await acquireHeavySlot({ label: 'two', env });
    expect([one.slot, two.slot]).toEqual([1, 2]);
    expect(heavyPoolList({ env })).toMatchObject({ slots: 2, holders: [{ slot: 1, label: 'one' }, { slot: 2, label: 'two' }] });
    one.release();
    two.release();
  });

  it('rejects a wait that is cancelled', async () => {
    const env = host();
    const held = await acquireHeavySlot({ label: 'held', env });
    const controller = new AbortController();
    await expect(acquireHeavySlot({ label: 'waiting', env, signal: controller.signal,
      sleep: async () => controller.abort() })).rejects.toMatchObject({ reasonCode: 'cancelled' });
    held.release();
  });

  it('runs two heavy validations from different projects one after the other and records the wait', async () => {
    const env = host();
    const log = path.join(env[HOST_STATE_ENV], 'order.log');
    const heavy = (name) => node('heavy.suite', `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(log)},'start ${name}\\n');
      const until=Date.now()+400;while(Date.now()<until){}fs.appendFileSync(${JSON.stringify(log)},'end ${name}\\n');`, { tier: 'change', heavy: true });
    const [a, b] = await Promise.all([fixture([heavy('a'), node('light', 'process.exit(0)', { heavy: false })]), fixture([heavy('b')])]);
    const requests = [];
    const acquireSlot = (options) => { requests.push(options); return acquireHeavySlot({ ...options, env, pollMs: 20 }); };
    const [first, second] = await Promise.all([verify(a, { acquireSlot }), verify(b, { acquireSlot })]);
    expect(first.ceiling).toBeNull();
    expect(second.ceiling).toBeNull();
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(4);
    // Never interleaved: each job ends before the other starts.
    expect(lines[1]).toBe(lines[0].replace('start', 'end'));
    expect(lines[3]).toBe(lines[2].replace('start', 'end'));
    const waits = [first, second].map((artifact) => artifact.results[0].heavy);
    for (const wait of waits) {
      expect(Object.keys(wait).sort()).toEqual(['slot', 'waitedMs']);
      expect(wait.slot).toBe(1);
      expect(Number.isInteger(wait.waitedMs)).toBe(true);
    }
    // One of the two held the slot first; the other records that it waited.
    const [held, waited] = waits.map((wait) => wait.waitedMs).sort((x, y) => x - y);
    expect(waited).toBeGreaterThanOrEqual(300);
    expect(held).toBeLessThan(waited);
    // Only a validation marked heavy takes a slot, and the holder names its project and issue.
    expect(Object.hasOwn(first.results[1], 'heavy')).toBe(false);
    expect(requests.map(({ label, projectRoot, issue }) => ({ label, projectRoot, issue })).sort((x, y) => (x.projectRoot < y.projectRoot ? -1 : x.projectRoot > y.projectRoot ? 1 : 0)))
      .toEqual([a, b].sort().map((projectRoot) => ({ label: 'heavy.suite (#42)', projectRoot, issue: 42 })));
    expect(heavyPoolHolders({ env })).toEqual([]);
  });

  it('runs a worker command inside a slot and reports the wait on stderr', async () => {
    const env = host();
    expect(parseHeavyPoolCli(['run', '--label', 'suite', '--', 'npm', 'test'])).toEqual({ action: 'run', label: 'suite', program: 'npm', args: ['test'] });
    expect(parseHeavyPoolCli(['run', '--', 'npm', 'test'])).toEqual({ action: 'run', label: 'npm test', program: 'npm', args: ['test'] });
    expect(parseHeavyPoolCli(['list'])).toEqual({ action: 'list' });
    for (const argv of [['run', 'npm', 'test'], ['run', '--'], ['status'], []]) expect(() => parseHeavyPoolCli(argv)).toThrow('Usage');
    const written = [];
    let during = null;
    const status = await runHeavy({ label: 'suite', program: process.execPath, args: ['-e', 'process.exit(3)'], env: { ...process.env, ...env },
      stderr: { write: (text) => { written.push(text); during = heavyPoolHolders({ env }); } } });
    expect(status).toBe(3);
    expect(written.join('')).toBe('NMG_SDLC_HEAVY_SLOT: {"slot":1,"slots":1,"waitedMs":0,"label":"suite"}\n');
    expect(during).toMatchObject([{ slot: 1, label: 'suite', projectRoot: process.cwd(), alive: true }]);
    expect(heavyPoolHolders({ env })).toEqual([]);
  });
});
