// The pre-merge gate's selection checks and surface binding (#584 AC4, AC5, AC5a, AC6, AC8), plus `--mode select`.
import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { runSteeringValidations } from '../../src/sdlc-verification-runtime.mjs';
import { main as verifySteering } from '../sdlc-verify-steering.mjs';

const roots = [];
const calls = [];
let answer = null;
const providerRequests = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  calls.length = 0;
  providerRequests.length = 0;
  answer = null;
  delete globalThis.__nmg584Provider;
});
const runSelection = (call) => {
  calls.push(call);
  return { status: 0, stdout: JSON.stringify({ type: 'result', structured_output: answer }) };
};
const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
const RECORD_ARGS = "require('node:fs').writeFileSync('ran.json', JSON.stringify(process.argv.slice(1)))";
const tests = { id: 'unit.tests', provider: 'builtin.command', required: true, when: { kind: 'always' }, tier: 'change',
  config: { program: process.execPath, args: ['-e', RECORD_ARGS], cwd: '.', env: [] } };
const site = { id: 'site.smoke', provider: 'project.site', required: true, when: { kind: 'always' }, config: {} };
const plain = { id: 'lint', provider: 'project.site', required: true, when: { kind: 'always' }, config: {} };
// Prints the prepared coverage report and records the tests it was given.
const COVERAGE = "const fs=require('node:fs');fs.writeFileSync('coverage-args.json',JSON.stringify(process.argv.slice(1)));process.stdout.write(fs.readFileSync('coverage-report.json','utf8'))";
const EXTENSION = `export const extension = Object.freeze({ schemaVersion: 1, id: 'test.site',
  providers: Object.freeze({ 'project.site': (request) => globalThis.__nmg584Provider(request) }) });\n`;

/** A committed project on branch `work`: unit.tests opts into the selection, site.smoke is bound to the `site` surface. */
async function project({ selection = { docPaths: ['docs/**'], fallbackPaths: ['package.json'] }, coverage = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-584-gate-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'specs', '42-test'), { recursive: true });
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) fs.writeFileSync(path.join(root, 'specs', '42-test', name), `${name}\n`);
  fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\nran.json\ncoverage-args.json\ncoverage-report.json\n');
  await applySteeringPlan(root, createInitializePlan(root, { validations: [] }));
  fs.mkdirSync(path.join(root, 'steering/extensions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steering/extensions/site.mjs'), EXTENSION);
  if (coverage) {
    fs.writeFileSync(path.join(root, 'steering/test-coverage.json'), `${JSON.stringify({ version: 1,
      suite: { program: process.execPath, args: ['-e', '0'] }, coverage: { program: process.execPath, args: ['-e', COVERAGE] } }, null, 2)}\n`);
  }
  const file = path.join(root, 'steering/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.extensions = [{ id: 'test.site', path: 'steering/extensions/site.mjs', providers: ['project.site'] }];
  manifest.validations = [{ ...tests, selection: true }, site, plain];
  manifest.selection = selection;
  manifest.surfaces = [{ id: 'app', sources: ['src/**'] }, { id: 'site', sources: ['site/**'], validations: ['site.smoke'] }, { id: 'other', sources: ['other/**'] }];
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'baseline');
  git(root, 'checkout', '-b', 'work');
  globalThis.__nmg584Provider = (request) => {
    providerRequests.push(JSON.parse(JSON.stringify(request)));
    return { schemaVersion: 1, status: 'passed', summary: 'ok', identity: request.identity, evidence: [{ kind: 'test', summary: 'ok' }] };
  };
  return root;
}
const change = (root, file, content = 'one\ntwo\n') => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
  git(root, 'add', '.');
  git(root, 'commit', '-m', `change ${file}`);
};
const report = (root, value) => fs.writeFileSync(path.join(root, 'coverage-report.json'), JSON.stringify(value));
const ranWith = (root) => (fs.existsSync(path.join(root, 'ran.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'ran.json'), 'utf8')) : null);
const verify = (root) => runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs/42-test'), baseRef: 'main',
  verificationRunId: 'run-1', runSelection, models: {} });
const byId = (artifact) => Object.fromEntries(artifact.results.map((result) => [result.id, result]));
const TIMEOUT = 30_000;

describe('changed lines must be covered by the selected tests (#584 AC4)', () => {
  it('rejects an uncovered changed executable line as selection_uncovered and records coverage', async () => {
    const root = await project();
    change(root, 'src/app.js', 'const a = 1;\nconst b = 2;\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, { version: 1, executableLines: ['src/app.js:1', 'src/app.js:2'],
      tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js', lines: ['src/app.js:1'], branches: [], outcomes: [] }] });
    const artifact = await verify(root);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'coverage-args.json'), 'utf8'))).toEqual(['tests/app.test.js']);
    const unit = byId(artifact)['unit.tests'];
    expect(unit.coverage).toEqual({ changedLines: ['src/app.js:1', 'src/app.js:2'], hitLines: ['src/app.js:1'], uncovered: ['src/app.js:2'] });
    expect(unit.effectiveStatus).toBe('failed');
    expect(unit.result.summary).toBe('selection_uncovered: src/app.js:2');
    expect(artifact.selection.rejection).toEqual({ reasonCode: 'selection_uncovered', uncovered: ['src/app.js:2'], missingSurfaces: [], unaccounted: [] });
    expect(artifact.ceiling).toBe('Fail');
  }, TIMEOUT);

  it('ignores a changed blank line without executableLines, and passes a fully covered change', async () => {
    const root = await project();
    change(root, 'src/app.js', 'a();\n\nb();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, { version: 1, tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js', lines: ['src/app.js:1', 'src/app.js:3'], branches: [], outcomes: [] }] });
    const artifact = await verify(root);
    const unit = byId(artifact)['unit.tests'];
    expect(unit.coverage).toEqual({ changedLines: ['src/app.js:1', 'src/app.js:3'], hitLines: ['src/app.js:1', 'src/app.js:3'], uncovered: [] });
    expect(unit.effectiveStatus).toBe('passed');
    expect(artifact.selection.rejection).toBeNull();
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('fails the opted-in result as coverage_failed when the coverage report is invalid, without escalating', async () => {
    const root = await project();
    change(root, 'src/app.js');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, { version: 2 });
    const artifact = await verify(root);
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'failed', selection: { reason: 'coverage_failed' } });
    expect(artifact.selection.rejection).toBeNull();
  }, TIMEOUT);
});

describe('changed surfaces must be selected (#584 AC5)', () => {
  it('rejects an answer that omits a matched surface before anything runs, naming it', async () => {
    const root = await project();
    change(root, 'site/index.html');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: [] };
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toEqual({ reasonCode: 'selection_surface_missing', uncovered: [], missingSurfaces: ['site'], unaccounted: [] });
    expect(ranWith(root)).toBeNull();
    const results = byId(artifact);
    expect(results['unit.tests']).toMatchObject({ effectiveStatus: 'failed', result: { summary: 'selection_surface_missing: site' } });
    expect(results['site.smoke']).toMatchObject({ effectiveStatus: 'failed' });
    // The failed required test validation defers the project providers, as any failed local command does.
    expect(providerRequests).toEqual([]);
    expect(results.lint.effectiveStatus).toBe('incomplete');
  }, TIMEOUT);

  it('accepts the matched surface plus an extra one', async () => {
    const root = await project();
    change(root, 'site/index.html');
    answer = { mode: 'selected', tests: [], surfaces: ['site', 'other'] };
    const artifact = await verify(root);
    expect(artifact.selection).toMatchObject({ rejection: null, requiredSurfaces: ['site'], surfaces: ['site', 'other'] });
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);
});

describe('surface-bound validations run only for selected surfaces (#584 AC5a, AC1)', () => {
  it('passes a bound validation as surface_not_selected without running it, and runs unbound ones with the scoped request', async () => {
    const root = await project();
    change(root, 'src/app.js');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, { version: 1, tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js', lines: ['src/app.js:1', 'src/app.js:2'], branches: [], outcomes: [] }] });
    const artifact = await verify(root);
    const results = byId(artifact);
    expect(results['site.smoke']).toMatchObject({ effectiveStatus: 'passed', selection: { reason: 'surface_not_selected' } });
    expect(results['site.smoke'].result.evidence[0].summary).toBe('surface_not_selected: no bound surface selected');
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]).toMatchObject({ validationId: 'lint', changedPaths: ['src/app.js'],
      selection: { mode: 'selected', reason: 'selected', surfaces: ['app'] } });
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('runs a bound validation with the selected surfaces in its request when one of them is selected', async () => {
    const root = await project();
    change(root, 'site/index.html');
    answer = { mode: 'selected', tests: [], surfaces: ['site'] };
    await verify(root);
    const request = providerRequests.find((item) => item.validationId === 'site.smoke');
    expect(request.selection).toEqual({ mode: 'selected', reason: 'selected', surfaces: ['site'] });
    expect(request.changedPaths).toEqual(['site/index.html']);
  }, TIMEOUT);
});

describe('every changed path must be accounted for (#584 AC6)', () => {
  it('rejects a path outside coverage, the selected surfaces, docPaths and fallbackPaths, naming it', async () => {
    const root = await project();
    change(root, 'src/app.js');
    change(root, 'tools/build.sh');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, { version: 1, tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js', lines: ['src/app.js:1', 'src/app.js:2'], branches: [], outcomes: [] }] });
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toEqual({ reasonCode: 'selection_unaccounted', uncovered: [], missingSurfaces: [], unaccounted: ['tools/build.sh'] });
    const results = byId(artifact);
    expect(results['unit.tests']).toMatchObject({ effectiveStatus: 'failed', result: { summary: 'selection_unaccounted: tools/build.sh' } });
    expect(results['site.smoke']).toMatchObject({ effectiveStatus: 'failed' });
    expect(results.lint.effectiveStatus).toBe('passed');
  }, TIMEOUT);
});

describe('only a docs-only change may select nothing (#584 AC8)', () => {
  it('passes the opted-in validation as selection_empty and gives providers no surfaces', async () => {
    const root = await project();
    change(root, 'docs/guide.md');
    answer = { mode: 'selected', tests: [], surfaces: [] };
    const artifact = await verify(root);
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'passed', selection: { reason: 'selection_empty' } });
    expect(ranWith(root)).toBeNull();
    expect(providerRequests.find((item) => item.validationId === 'lint').selection).toEqual({ mode: 'selected', reason: 'selection_empty', surfaces: [] });
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('rejects an empty selection for a change with a code path as selection_empty_code_change', async () => {
    const root = await project();
    change(root, 'docs/guide.md');
    change(root, 'lib/x.js');
    answer = { mode: 'selected', tests: [], surfaces: [] };
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toMatchObject({ reasonCode: 'selection_empty_code_change', unaccounted: ['lib/x.js'] });
    expect(byId(artifact)['unit.tests'].effectiveStatus).toBe('failed');
  }, TIMEOUT);

  it('treats no change as docs-only without docPaths', async () => {
    const root = await project({ selection: { fallbackPaths: ['package.json'] } });
    change(root, 'docs/guide.md');
    answer = { mode: 'selected', tests: [], surfaces: [] };
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toMatchObject({ reasonCode: 'selection_empty_code_change', unaccounted: ['docs/guide.md'] });
  }, TIMEOUT);
});

describe('full-run fallbacks give providers every surface (#584 AC9)', () => {
  it('passes every declared surface on a fallback path and runs bound validations', async () => {
    const root = await project();
    change(root, 'package.json', '{}\n');
    const artifact = await verify(root);
    expect(calls).toHaveLength(0);
    expect(artifact.selection).toMatchObject({ mode: 'all', reason: 'fallback_path', fallbackPath: 'package.json', surfaces: ['app', 'site', 'other'] });
    expect(providerRequests.map((request) => request.selection.surfaces)).toEqual([['app', 'site', 'other'], ['app', 'site', 'other']]);
    expect(ranWith(root)).toEqual([]);
  }, TIMEOUT);
});

describe('--mode select stores the selection the gate reuses (#584 AC1, FR2)', () => {
  it('asks Claude once for a select run followed by a gate run with the same binding', async () => {
    const root = await project();
    change(root, 'src/app.js');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, { version: 1, tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js', lines: ['src/app.js:1', 'src/app.js:2'], branches: [], outcomes: [] }] });
    const writes = [];
    const write = process.stdout.write;
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    try {
      await verifySteering(['--project', root, '--issue', '42', '--spec', 'specs/42-test', '--base', 'main', '--mode', 'select'], { runSelection, models: {} });
    } finally { process.stdout.write = write; }
    const printed = JSON.parse(writes.join(''));
    expect(printed).toMatchObject({ ok: true, selection: { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] } });
    expect(fs.existsSync(path.join(root, '.nmg-sdlc/verification/42.json'))).toBe(false);
    expect(ranWith(root)).toBeNull();
    const artifact = await verify(root);
    expect(calls).toHaveLength(1);
    expect(artifact.selection).toMatchObject({ reused: true, tests: ['tests/app.test.js'] });
  }, TIMEOUT);
});

describe('an invalid selection model (#584 AC2)', () => {
  it('fails the gate as stage_models_invalid with the steering/sdlc-models.json diagnostic', async () => {
    const root = await project();
    change(root, 'src/app.js');
    fs.writeFileSync(path.join(root, 'steering/sdlc-models.json'), JSON.stringify({ version: 1, selection: { model: 'haiku', effort: 'huge' } }));
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs/42-test'), baseRef: 'main', runSelection });
    expect(artifact.ceiling).toBe('Incomplete');
    expect(artifact.runtimeError.reasonCode).toBe('stage_models_invalid');
    expect(artifact.runtimeError.summary).toContain('steering/sdlc-models.json: selection.effort = "huge"');
    expect(calls).toHaveLength(0);
  }, TIMEOUT);
});
