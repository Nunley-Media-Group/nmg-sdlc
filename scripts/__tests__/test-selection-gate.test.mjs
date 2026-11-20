// The pre-merge gate's selection checks and surface binding: @SCN001, @SCN002, @SCN004-@SCN010
// (#584 AC1, AC2, AC4, AC5, AC5a, AC6, AC7, AC8, AC9), plus `--mode select`.
import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { runSteeringValidations } from '../../src/sdlc-verification-runtime.mjs';
import { MAX_UNTRACKED_FILE_BYTES, writeGuidance } from '../../src/sdlc-test-selection.mjs';
import { main as verifySteering } from '../sdlc-verify-steering.mjs';
import { inspectVerificationArtifactRepair } from '../verification-readiness.mjs';

// The readiness check the controller and recovery read the artifact with.
const readiness = (artifact) => inspectVerificationArtifactRepair(artifact, {
  expectedIssueNumber: artifact.issue, expectedHeadSha: artifact.identity.headSha });

const roots = [];
const calls = [];
let answer = null;
const providerRequests = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  calls.length = 0;
  slots.length = 0;
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
// Records its arguments; exits 1 while a `fail-tests` marker exists, as failing selected tests do.
const RECORD_ARGS = "const fs=require('node:fs');fs.writeFileSync('ran.json', JSON.stringify(process.argv.slice(1)));process.exitCode=fs.existsSync('fail-tests')?1:0";
const tests = { id: 'unit.tests', provider: 'builtin.command', required: true, when: { kind: 'always' }, tier: 'change',
  config: { program: process.execPath, args: ['-e', RECORD_ARGS], cwd: '.', env: [] } };
const site = { id: 'site.smoke', provider: 'project.site', required: true, when: { kind: 'always' }, config: {} };
const plain = { id: 'lint', provider: 'project.site', required: true, when: { kind: 'always' }, config: {} };
// Prints the prepared coverage report and records the tests it was given.
const COVERAGE = "const fs=require('node:fs');fs.writeFileSync('coverage-args.json',JSON.stringify(process.argv.slice(1)));process.stdout.write(fs.readFileSync('coverage-report.json','utf8'))";
const EXTENSION = `export const extension = Object.freeze({ schemaVersion: 1, id: 'test.site',
  providers: Object.freeze({ 'project.site': (request) => globalThis.__nmg584Provider(request) }) });\n`;

/**
 * A committed project on branch `work` with the test file tests/app.test.js: unit.tests opts into the selection,
 * site.smoke is bound to the `site` surface.
 */
async function project({ selection = { docPaths: ['docs/**'], fallbackPaths: ['package.json'] }, coverage = true, baseline = {}, validations = [],
  surfaces = null } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-584-gate-')));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'specs', '42-test'), { recursive: true });
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) fs.writeFileSync(path.join(root, 'specs', '42-test', name), `${name}\n`);
  fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\nran.json\ncoverage-args.json\ncoverage-report.json\nfail-tests\n');
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
  manifest.validations = [{ ...tests, selection: true }, ...validations, site, plain];
  manifest.selection = selection;
  manifest.surfaces = surfaces ?? [{ id: 'app', sources: ['src/**'] }, { id: 'site', sources: ['site/**'], validations: ['site.smoke'] }, { id: 'other', sources: ['other/**'] }];
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, text] of Object.entries({ 'tests/app.test.js': '// app test\n', ...baseline })) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
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
const slots = [];
const acquireSlot = async ({ label }) => { slots.push(label); return { slot: 1, waitedMs: 0, release: () => {} }; };
const verify = (root, extra = {}) => runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs/42-test'), baseRef: 'main',
  verificationRunId: 'run-1', runSelection, models: {}, acquireSlot, ...extra });
const testReport = (lines, extra = {}) => ({ version: 1, ...extra, tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js', lines, branches: [], outcomes: [] }] });
const NONE = { uncovered: [], missingSurfaces: [], unaccounted: [], truncated: 0 };
const byId = (artifact) => Object.fromEntries(artifact.results.map((result) => [result.id, result]));
const TIMEOUT = 30_000;

describe('@SCN004 changed lines must be covered by the selected tests (#584 AC4)', () => {
  it('rejects an uncovered changed executable line as selection_uncovered and records coverage', async () => {
    const root = await project();
    change(root, 'src/app.js', 'const a = 1;\nconst b = 2;\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, { version: 1, executableLines: ['src/app.js:1', 'src/app.js:2'],
      tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js', lines: ['src/app.js:1'], branches: [], outcomes: [] }] });
    const artifact = await verify(root);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'coverage-args.json'), 'utf8'))).toEqual(['tests/app.test.js']);
    expect(slots).toEqual(['coverage (#42)']);
    const unit = byId(artifact)['unit.tests'];
    expect(unit.coverage).toEqual({ changedLines: ['src/app.js:1', 'src/app.js:2'], hitLines: ['src/app.js:1'], uncovered: ['src/app.js:2'],
      counts: { changedLines: 2, hitLines: 1, uncovered: 1 } });
    expect(unit.effectiveStatus).toBe('failed');
    expect(unit.result.summary).toBe('selection_uncovered: src/app.js:2');
    expect(artifact.selection.rejection).toEqual({ ...NONE, reasonCode: 'selection_uncovered', uncovered: ['src/app.js:2'] });
    // The failed required tests defer the project providers, so the gate is incomplete as well as failing.
    expect(artifact.ceiling).toBe('Incomplete');
    expect(byId(artifact).lint.effectiveStatus).toBe('incomplete');
    expect(providerRequests).toEqual([]);
  }, TIMEOUT);

  it('ignores a changed blank line without executableLines, and passes a fully covered change', async () => {
    const root = await project();
    change(root, 'src/app.js', 'a();\n\nb();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, { version: 1, tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js', lines: ['src/app.js:1', 'src/app.js:3'], branches: [], outcomes: [] }] });
    const artifact = await verify(root);
    const unit = byId(artifact)['unit.tests'];
    expect(unit.coverage).toEqual({ changedLines: ['src/app.js:1', 'src/app.js:3'], hitLines: ['src/app.js:1', 'src/app.js:3'], uncovered: [],
      counts: { changedLines: 2, hitLines: 2, uncovered: 0 } });
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

  it('counts only a modified file\'s changed lines since the merge base, across several commits, plus untracked files', async () => {
    const root = await project({ baseline: { 'src/lib.js': 'l1();\nl2();\nl3();\nl4();\nl5();\n' } });
    change(root, 'src/lib.js', 'l1();\nl2();\nL3();\nl4();\nl5();\n');
    change(root, 'src/lib.js', 'l1();\nl2();\nL3();\nl4();\nL5();\n');
    fs.writeFileSync(path.join(root, 'src/new.js'), 'n1();\nn2();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/lib.js:3', 'src/lib.js:5', 'src/new.js:1', 'src/new.js:2']));
    const artifact = await verify(root);
    expect(byId(artifact)['unit.tests'].coverage).toMatchObject({ changedLines: ['src/lib.js:3', 'src/lib.js:5', 'src/new.js:1', 'src/new.js:2'], uncovered: [] });
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('checks only the changed lines executableLines lists', async () => {
    const root = await project();
    change(root, 'src/app.js', '// a comment\nrun();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:2'], { executableLines: ['src/app.js:2'] }));
    const artifact = await verify(root);
    expect(byId(artifact)['unit.tests'].coverage).toMatchObject({ changedLines: ['src/app.js:2'], hitLines: ['src/app.js:2'], uncovered: [] });
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('finds the changed lines of a path holding a space whatever the diff prefix configuration', async () => {
    const root = await project();
    git(root, 'config', 'diff.mnemonicPrefix', 'true');
    git(root, 'config', 'diff.noprefix', 'true');
    change(root, 'src/my app.js', 'one();\n++ two;\n');
    change(root, 'src/q"t.js', 'q();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/my app.js:1', 'src/q"t.js:1']));
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toEqual({ ...NONE, reasonCode: 'selection_uncovered', uncovered: ['src/my app.js:2'] });
    expect(byId(artifact)['unit.tests'].coverage.changedLines).toEqual(['src/my app.js:1', 'src/my app.js:2', 'src/q"t.js:1']);
  }, TIMEOUT);

  it.each([
    ['a directory', 'tests/'],
    ['a package name', 'com.example.AppTest'],
  ])('counts the lines every test of the coverage run hits as covered when the selected test is %s', async (_name, id) => {
    const root = await project();
    change(root, 'src/app.js', 'a();\nb();\n');
    answer = { mode: 'selected', tests: [id], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1', 'src/app.js:2']));
    const artifact = await verify(root);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'coverage-args.json'), 'utf8'))).toEqual([id]);
    expect(byId(artifact)['unit.tests'].coverage.uncovered).toEqual([]);
    expect(artifact.selection.rejection).toBeNull();
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('runs no coverage and records an ordinary failure when the selected tests fail', async () => {
    const root = await project();
    change(root, 'lib/util.js');
    fs.writeFileSync(path.join(root, 'fail-tests'), '');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: [] };
    report(root, testReport(['lib/util.js:1', 'lib/util.js:2']));
    const artifact = await verify(root);
    expect(fs.existsSync(path.join(root, 'coverage-args.json'))).toBe(false);
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'failed', selection: { reason: 'selected' } });
    expect(artifact.selection.rejection).toBeNull();
    expect(byId(artifact).lint.effectiveStatus).toBe('incomplete');
  }, TIMEOUT);

  it('fails the gate when a selected test of an opted-in validation that is not required fails, as the selection went unchecked', async () => {
    const root = await project();
    const file = path.join(root, 'steering/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.validations[0].required = false;
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    change(root, 'lib/util.js');
    fs.writeFileSync(path.join(root, 'fail-tests'), '');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: [] };
    const artifact = await verify(root);
    expect(fs.existsSync(path.join(root, 'coverage-args.json'))).toBe(false);
    expect(byId(artifact)['unit.tests']).toMatchObject({ required: false, effectiveStatus: 'failed' });
    expect(artifact.selection.rejection).toBeNull();
    expect(artifact.ceiling).toBe('Fail');
    expect(readiness(artifact)).toMatchObject({ status: 'repairable', gaps: [], failedLocal: ['unit.tests'] });
  }, TIMEOUT);

  it('fails a coverage command that exits non-zero as coverage_failed, never as an unaccounted path', async () => {
    const root = await project();
    change(root, 'lib/util.js');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: [] };
    const artifact = await verify(root);
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'failed', selection: { reason: 'coverage_failed' } });
    expect(byId(artifact)['unit.tests'].result.summary).toMatch(/^coverage_failed: coverage command failed: exited 1$/);
    expect(artifact.selection.rejection).toBeNull();
  }, TIMEOUT);

  it('runs the coverage command with a timeout and the gate\'s abort signal', async () => {
    const root = await project();
    change(root, 'src/app.js', 'a();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    const runs = [];
    const controller = new AbortController();
    const runCoverage = async (program, args, options) => {
      runs.push({ args, timeout: options.timeout, signal: options.signal, env: Object.keys(options.env).sort() });
      return { status: 0, stdout: JSON.stringify(testReport(['src/app.js:1'])) };
    };
    const artifact = await verify(root, { runCoverage, signal: controller.signal });
    expect(runs).toEqual([{ args: ['-e', expect.any(String), 'tests/app.test.js'], timeout: 3_600_000, signal: controller.signal,
      env: ['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR', 'CI', 'TEMP', 'TMP'].filter((key) => process.env[key] !== undefined).sort() }]);
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('bounds the recorded coverage and rejection lists, counting what it leaves out', async () => {
    const root = await project();
    change(root, 'src/app.js', Array.from({ length: 300 }, (_, i) => `f${i}();`).join('\n') + '\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport([], { executableLines: Array.from({ length: 300 }, (_, i) => `src/app.js:${i + 1}`) }));
    const artifact = await verify(root);
    const unit = byId(artifact)['unit.tests'];
    expect(unit.coverage.uncovered).toHaveLength(200);
    expect(unit.coverage.counts).toEqual({ changedLines: 300, hitLines: 0, uncovered: 300 });
    expect(artifact.selection.rejection.uncovered).toHaveLength(200);
    expect(artifact.selection.rejection.truncated).toBe(100);
    expect(unit.result.summary).toMatch(/, and 250 more$/);
  }, TIMEOUT);

  it('counts only added lines when diff.interHunkContext would merge two hunks', async () => {
    const root = await project({ baseline: { 'src/app.js': 'l1();\nl2();\nl3();\nl4();\nl5();\nl6();\nl7();\n' } });
    git(root, 'config', 'diff.interHunkContext', '5');
    change(root, 'src/app.js', 'l1();\nL2();\nl3();\nl4();\nl5();\nL6();\nl7();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:2', 'src/app.js:6']));
    const artifact = await verify(root);
    expect(byId(artifact)['unit.tests'].coverage).toMatchObject({ changedLines: ['src/app.js:2', 'src/app.js:6'], uncovered: [] });
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('counts only the lines a commit edits in a file it renames as changed', async () => {
    const body = (first) => `${first}\n${Array.from({ length: 9 }, (_, index) => `line${index + 2}();`).join('\n')}\n`;
    const root = await project({ baseline: { 'src/old.js': body('line1();') } });
    git(root, 'mv', 'src/old.js', 'src/new.js');
    change(root, 'src/new.js', body('LINE1();'));
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/new.js:1'], { executableLines: ['src/new.js:1', 'src/new.js:2'] }));
    const artifact = await verify(root);
    expect(artifact.changedPaths).toEqual(['src/new.js', 'src/old.js']);
    // The move keeps line 2, which no selected test hits: it is not a change the selection must cover.
    expect(byId(artifact)['unit.tests'].coverage).toMatchObject({ changedLines: ['src/new.js:1'], uncovered: [] });
    expect(artifact.selection.rejection).toBeNull();
  }, TIMEOUT);

  (process.platform === 'win32' ? it.skip : it)('never reads an untracked symlink into its target\'s lines', async () => {
    const root = await project({ baseline: { 'src/target.js': 't1();\nt2();\n' } });
    change(root, 'src/app.js', 'a();\n');
    fs.symlinkSync('target.js', path.join(root, 'src/link.js'));
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1', 'src/link.js:1'], { executableLines: ['src/app.js:1', 'src/link.js:1', 'src/link.js:2'] }));
    const artifact = await verify(root);
    expect(artifact.changedPaths).toEqual(['src/app.js', 'src/link.js']);
    expect(byId(artifact)['unit.tests'].coverage).toMatchObject({ changedLines: ['src/app.js:1'], uncovered: [] });
    expect(artifact.selection.rejection).toBeNull();
  }, TIMEOUT);

  it('takes no changed lines from an untracked file over the size cap', async () => {
    const root = await project();
    change(root, 'src/app.js', 'a();\n');
    fs.writeFileSync(path.join(root, 'src/big.js'), 'b();\n'.repeat(Math.ceil((MAX_UNTRACKED_FILE_BYTES + 1) / 5)));
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1', 'src/big.js:1'], { executableLines: ['src/app.js:1', 'src/big.js:1', 'src/big.js:2'] }));
    const artifact = await verify(root);
    expect(artifact.changedPaths).toEqual(['src/app.js', 'src/big.js']);
    expect(byId(artifact)['unit.tests'].coverage).toMatchObject({ changedLines: ['src/app.js:1'], uncovered: [] });
    expect(artifact.selection.rejection).toBeNull();
  }, TIMEOUT);

  it('checks each file of a new untracked directory', async () => {
    const root = await project();
    fs.mkdirSync(path.join(root, 'src/newdir'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/newdir/a.js'), 'a();\nb();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/newdir/a.js:1'], { executableLines: ['src/newdir/a.js:1', 'src/newdir/a.js:2'] }));
    const artifact = await verify(root);
    expect(artifact.changedPaths).toEqual(['src/newdir/a.js']);
    expect(artifact.selection.rejection).toEqual({ ...NONE, reasonCode: 'selection_uncovered', uncovered: ['src/newdir/a.js:2'] });
  }, TIMEOUT);

  it('runs the real coverage command with only the safe environment', async () => {
    const root = await project({ selection: { docPaths: ['docs/**', 'steering/**'], fallbackPaths: ['package.json'] } });
    const ENV_COVERAGE = "const fs=require('node:fs');fs.writeFileSync('coverage-args.json',JSON.stringify(Object.keys(process.env).filter((key)=>key.startsWith('NMG_584'))));process.stdout.write(fs.readFileSync('coverage-report.json','utf8'))";
    fs.writeFileSync(path.join(root, 'steering/test-coverage.json'), `${JSON.stringify({ version: 1, suite: { program: process.execPath, args: ['-e', '0'] },
      coverage: { program: process.execPath, args: ['-e', ENV_COVERAGE] } }, null, 2)}\n`);
    change(root, 'src/app.js', 'a();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1']));
    process.env.NMG_584_SECRET = 'secret';
    let artifact;
    try { artifact = await verify(root); } finally { delete process.env.NMG_584_SECRET; }
    expect(JSON.parse(fs.readFileSync(path.join(root, 'coverage-args.json'), 'utf8'))).toEqual([]);
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  (process.platform === 'win32' ? it.skip : it)('records an aborted coverage run as incomplete, even when not required, and stops its whole process group', async () => {
    const root = await project();
    const manifestFile = path.join(root, 'steering/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.validations[0].required = false;
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    const HANG = "const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' }); require('node:fs').writeFileSync('grandchild.pid', String(child.pid)); setTimeout(() => {}, 60000);";
    fs.writeFileSync(path.join(root, 'steering/test-coverage.json'), `${JSON.stringify({ version: 1, suite: { program: process.execPath, args: ['-e', '0'] },
      coverage: { program: process.execPath, args: ['-e', HANG] } }, null, 2)}\n`);
    fs.appendFileSync(path.join(root, '.gitignore'), 'grandchild.pid\n');
    change(root, 'src/app.js', 'a();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    const controller = new AbortController();
    const running = verify(root, { signal: controller.signal });
    const pidFile = path.join(root, 'grandchild.pid');
    for (let tries = 0; !fs.existsSync(pidFile) && tries < 200; tries += 1) await new Promise((done) => setTimeout(done, 50));
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    controller.abort();
    const artifact = await running;
    expect(byId(artifact)['unit.tests']).toMatchObject({ required: false, effectiveStatus: 'incomplete', result: { summary: 'coverage cancelled' } });
    expect(artifact.selection.rejection).toBeNull();
    expect(artifact.ceiling).toBe('Incomplete');
    expect(readiness(artifact)).toMatchObject({ gaps: [], incomplete: ['lint', 'unit.tests'] });
    let alive = true;
    for (let tries = 0; alive && tries < 100; tries += 1) {
      try { process.kill(pid, 0); await new Promise((done) => setTimeout(done, 50)); } catch { alive = false; }
    }
    expect(alive).toBe(false);
  }, TIMEOUT);
  it('compares a selected test in normalized form with the report and passes it normalized to the coverage command', async () => {
    const root = await project();
    change(root, 'src/app.js', 'a();\n');
    answer = { mode: 'selected', tests: ['./tests//app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1']));
    const artifact = await verify(root);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'coverage-args.json'), 'utf8'))).toEqual(['tests/app.test.js']);
    expect(ranWith(root)).toEqual(['tests/app.test.js']);
    expect(artifact.selection.rejection).toBeNull();
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('rebases the selected tests onto the opted-in command\'s cwd while the coverage command reads them from the root', async () => {
    const root = await project({ selection: { docPaths: ['docs/**', 'steering/**'] } });
    const file = path.join(root, 'steering/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.validations[0].config.cwd = 'tests';
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    change(root, 'src/app.js', 'a();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1']));
    const artifact = await verify(root);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'tests/ran.json'), 'utf8'))).toEqual(['app.test.js']);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'coverage-args.json'), 'utf8'))).toEqual(['tests/app.test.js']);
    expect(artifact.selection.tests).toEqual(['tests/app.test.js']);
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('never rebases a selected test into an option-shaped argument', async () => {
    const root = await project({ selection: { docPaths: ['docs/**', 'steering/**'] }, baseline: { 'tests/-x.test.js': '// x\n' } });
    const file = path.join(root, 'steering/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.validations[0].config.cwd = 'tests';
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    change(root, 'src/app.js', 'a();\n');
    answer = { mode: 'selected', tests: ['tests/-x.test.js'], surfaces: ['app'] };
    report(root, { version: 1, tests: [{ id: 'tests/-x.test.js', file: 'tests/-x.test.js', lines: ['src/app.js:1'], branches: [], outcomes: [] }] });
    const artifact = await verify(root);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'tests/ran.json'), 'utf8'))).toEqual(['./-x.test.js']);
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  /** A coverage command whose leader starts a descendant that holds its stdout, records the pid and exits at once. */
  const LEADER_EXITS = "const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: ['ignore', 'inherit', 'ignore'] }); require('node:fs').writeFileSync('grandchild.pid', String(child.pid)); process.exit(0);";
  const coverageCommand = (root, code) => {
    fs.writeFileSync(path.join(root, 'steering/test-coverage.json'), `${JSON.stringify({ version: 1, suite: { program: process.execPath, args: ['-e', '0'] },
      coverage: { program: process.execPath, args: ['-e', code] } }, null, 2)}\n`);
    fs.appendFileSync(path.join(root, '.gitignore'), 'grandchild.pid\n');
    change(root, 'src/app.js', 'a();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
  };
  const dead = async (root) => {
    const pid = Number(fs.readFileSync(path.join(root, 'grandchild.pid'), 'utf8'));
    for (let tries = 0; tries < 100; tries += 1) {
      try { process.kill(pid, 0); } catch { return true; }
      await new Promise((done) => setTimeout(done, 50));
    }
    return false;
  };

  (process.platform === 'win32' ? it.skip : it)('settles an abort at once when the leader exited and a descendant holds its output, and stops the descendant', async () => {
    const root = await project();
    coverageCommand(root, LEADER_EXITS);
    const controller = new AbortController();
    const running = verify(root, { signal: controller.signal });
    const pidFile = path.join(root, 'grandchild.pid');
    for (let tries = 0; !fs.existsSync(pidFile) && tries < 200; tries += 1) await new Promise((done) => setTimeout(done, 50));
    await new Promise((done) => setTimeout(done, 300));
    const aborted = Date.now();
    controller.abort();
    const artifact = await running;
    expect(Date.now() - aborted).toBeLessThan(5000);
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'incomplete', selection: { reason: 'coverage_cancelled' }, result: { summary: 'coverage cancelled' } });
    expect(await dead(root)).toBe(true);
  }, TIMEOUT);

  (process.platform === 'win32' ? it.skip : it)('fails a coverage run that outlives its timeout as coverage_failed, stopping a descendant that holds its output', async () => {
    const root = await project();
    coverageCommand(root, LEADER_EXITS);
    const started = Date.now();
    const artifact = await verify(root, { limits: { coverage: { timeoutMs: 1500 } } });
    expect(Date.now() - started).toBeLessThan(15000);
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'failed', selection: { reason: 'coverage_failed' },
      result: { summary: 'coverage_failed: coverage command timed out after 1.5 s' } });
    expect(artifact.selection.rejection).toBeNull();
    expect(await dead(root)).toBe(true);
  }, TIMEOUT);

  it('fails a coverage report larger than its cap as coverage_failed', async () => {
    const root = await project();
    coverageCommand(root, "process.stdout.write('x'.repeat(8192)); setTimeout(() => {}, 60000);");
    const artifact = await verify(root, { limits: { coverage: { maxOutputBytes: 1024 } } });
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'failed', selection: { reason: 'coverage_failed' },
      result: { summary: 'coverage_failed: coverage report exceeded 1024 bytes' } });
  }, TIMEOUT);
});

describe('@SCN005 changed surfaces must be selected (#584 AC5)', () => {
  it('rejects an answer that omits a matched surface before anything runs, naming it', async () => {
    const root = await project();
    change(root, 'site/index.html');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: [] };
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toEqual({ ...NONE, reasonCode: 'selection_surface_missing', missingSurfaces: ['site'] });
    expect(ranWith(root)).toBeNull();
    const results = byId(artifact);
    expect(results['unit.tests']).toMatchObject({ effectiveStatus: 'failed', result: { summary: 'selection_surface_missing: site' } });
    expect(results['site.smoke']).toMatchObject({ effectiveStatus: 'failed' });
    // The failed required test validation defers the project providers, as any failed local command does.
    expect(providerRequests).toEqual([]);
    expect(results.lint.effectiveStatus).toBe('incomplete');
  }, TIMEOUT);

  it('requires the surface a committed rename moves a file out of', async () => {
    const root = await project({ baseline: { 'site/a.js': 'a();\n' } });
    fs.mkdirSync(path.join(root, 'lib'));
    git(root, 'mv', 'site/a.js', 'lib/a.js');
    git(root, 'commit', '-m', 'move');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: [] };
    report(root, testReport(['lib/a.js:1']));
    const artifact = await verify(root);
    expect(artifact.changedPaths).toEqual(['lib/a.js', 'site/a.js']);
    expect(artifact.selection.rejection).toEqual({ ...NONE, reasonCode: 'selection_surface_missing', missingSurfaces: ['site'] });
  }, TIMEOUT);

  it('fails the gate on a missing surface even when the rejection fails no applicable validation', async () => {
    const root = await project({ surfaces: [{ id: 'app', sources: ['src/**'] }, { id: 'other', sources: ['other/**'] }] });
    const file = path.join(root, 'steering/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.validations[0].when = { kind: 'path_exists', path: 'nothing-here' };
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    change(root, 'other/a.js');
    answer = { mode: 'selected', tests: [], surfaces: ['app'] };
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toMatchObject({ reasonCode: 'selection_surface_missing', missingSurfaces: ['other'] });
    expect(artifact.results.filter((result) => result.effectiveStatus === 'failed')).toEqual([]);
    expect(artifact.ceiling).toBe('Fail');
    expect(readiness(artifact)).toMatchObject({ status: 'intervention', gaps: [] });
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

describe('@SCN006 @SCN001 surface-bound validations run only for selected surfaces (#584 AC5a, AC1)', () => {
  it('rejects a manifest that binds an opted-in validation to a surface, so an unselected surface never skips the selected tests', async () => {
    const root = await project({ surfaces: [{ id: 'app', sources: ['src/**'], validations: ['unit.tests'] }] });
    change(root, 'src/app.js');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: [] };
    const artifact = await verify(root);
    expect(artifact.ceiling).toBe('Incomplete');
    expect(artifact.runtimeError).toMatchObject({ reasonCode: 'steering_manifest_invalid' });
    expect(ranWith(root)).toBeNull();
  }, TIMEOUT);

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
    // The artifact records the changed paths once, at its top level, not in every stored request.
    expect(artifact.changedPaths).toEqual(['src/app.js']);
    expect(results.lint.request).toMatchObject({ validationId: 'lint', selection: { surfaces: ['app'] } });
    expect(Object.hasOwn(results.lint.request, 'changedPaths')).toBe(false);
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('passes bound builtin.command and builtin.artifact validations as surface_not_selected without running them', async () => {
    const command = { id: 'cmd.smoke', provider: 'builtin.command', required: true, when: { kind: 'always' },
      config: { program: process.execPath, args: ['-e', "require('node:fs').writeFileSync('cmd-ran', '');process.exit(1)"], cwd: '.', env: [] } };
    const artifactCheck = { id: 'artifact.check', provider: 'builtin.artifact', required: true, when: { kind: 'always' }, config: { path: 'missing.json', checks: ['json'] } };
    const root = await project({ validations: [command, artifactCheck], surfaces: [{ id: 'app', sources: ['src/**'] },
      { id: 'site', sources: ['site/**'], validations: ['site.smoke', 'cmd.smoke', 'artifact.check'] }] });
    change(root, 'src/app.js');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1', 'src/app.js:2']));
    const artifact = await verify(root);
    const results = byId(artifact);
    for (const id of ['cmd.smoke', 'artifact.check', 'site.smoke']) {
      expect(results[id]).toMatchObject({ effectiveStatus: 'passed', selection: { reason: 'surface_not_selected' } });
    }
    expect(fs.existsSync(path.join(root, 'cmd-ran'))).toBe(false);
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

describe('@SCN007 every changed path must be accounted for (#584 AC6)', () => {
  it('rejects a path outside coverage, the selected surfaces, docPaths and fallbackPaths, naming it', async () => {
    const root = await project();
    change(root, 'src/app.js');
    change(root, 'tools/build.sh');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, { version: 1, tests: [{ id: 'tests/app.test.js', file: 'tests/app.test.js', lines: ['src/app.js:1', 'src/app.js:2'], branches: [], outcomes: [] }] });
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toEqual({ ...NONE, reasonCode: 'selection_unaccounted', unaccounted: ['tools/build.sh'] });
    const results = byId(artifact);
    expect(results['unit.tests']).toMatchObject({ effectiveStatus: 'failed', result: { summary: 'selection_unaccounted: tools/build.sh' } });
    expect(results['site.smoke']).toMatchObject({ effectiveStatus: 'failed' });
    expect(results.lint.effectiveStatus).toBe('incomplete');
  }, TIMEOUT);

  it('accounts for a changed selected test file and a docs path in a non-empty selection, but not an unselected test file', async () => {
    const root = await project();
    change(root, 'src/app.js', 'a();\n');
    change(root, 'tests/app.test.js', 'test();\n');
    change(root, 'docs/guide.md');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1']));
    expect((await verify(root)).ceiling).toBeNull();
    change(root, 'tests/other.test.js', 'test();\n');
    expect((await verify(root)).selection.rejection).toEqual({ ...NONE, reasonCode: 'selection_unaccounted', unaccounted: ['tests/other.test.js'] });
  }, TIMEOUT);

  it('accounts for a deleted file, whether code, a test or a script, since nothing of it is left to cover', async () => {
    const root = await project({ selection: { docPaths: ['docs/**'], coveragePaths: ['lib/**'] },
      baseline: { 'lib/old.js': 'gone();\n', 'tools/old.sh': 'x\n', 'tests/old.test.js': '// old\n' } });
    change(root, 'src/app.js', 'a();\n');
    for (const file of ['lib/old.js', 'tools/old.sh', 'tests/old.test.js']) fs.rmSync(path.join(root, file));
    answer = { mode: 'selected', tests: ['tests/app.test.js', 'tests/old.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1']));
    const artifact = await verify(root);
    expect(artifact.selection.tests).toEqual(['tests/app.test.js']);
    expect(artifact.selection.rejection).toBeNull();
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('accounts for the file of a report test that a runner names without a path', async () => {
    const root = await project({ baseline: { 'pkg/app_test.go': 'package app\n' } });
    change(root, 'pkg/app.go', 'package app\nfunc A() {}\n');
    change(root, 'pkg/app_test.go', 'package app\nfunc TestA() {}\n');
    answer = { mode: 'selected', tests: ['TestA'], surfaces: [] };
    report(root, { version: 1, tests: [{ id: 'TestA', file: 'pkg/app_test.go', lines: ['pkg/app.go:1', 'pkg/app.go:2'], branches: [], outcomes: [] }] });
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toBeNull();
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('accounts for a changed path through any selected surface, including one that binds no validation', async () => {
    const root = await project({ selection: { docPaths: ['docs/**'], coveragePaths: ['src/**'] } });
    change(root, 'src/app.js', 'a();\n');
    change(root, 'src/b.js', 'b();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1']));
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toBeNull();
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('fails a surface-bound local command that already ran when a path is unaccounted', async () => {
    const build = { id: 'build', provider: 'builtin.command', required: true, when: { kind: 'always' }, tier: 'change',
      config: { program: process.execPath, args: ['-e', '0'], cwd: '.', env: [] } };
    const root = await project({ validations: [build], surfaces: [{ id: 'app', sources: ['src/**'], validations: ['build'] },
      { id: 'site', sources: ['site/**'], validations: ['site.smoke'] }] });
    change(root, 'src/app.js', 'a();\n');
    change(root, 'tools/build.sh');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1']));
    const artifact = await verify(root);
    expect(byId(artifact).build).toMatchObject({ effectiveStatus: 'failed', result: { summary: 'selection_unaccounted: tools/build.sh' } });
  }, TIMEOUT);

  it('accounts for a covered path outside every selected surface and docPaths', async () => {
    const root = await project();
    change(root, 'lib/util.js', 'u();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: [] };
    report(root, testReport(['lib/util.js:1']));
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toBeNull();
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('accounts for a changed selected test without a coverage config, naming the config state in the evidence', async () => {
    // The config file itself is documentation here, so writing an invalid one leaves every changed path accounted for.
    const root = await project({ coverage: false, selection: { docPaths: ['docs/**', 'steering/test-coverage.json'], fallbackPaths: ['package.json'] } });
    change(root, 'src/app.js', 'a();\n');
    change(root, 'tests/app.test.js', 'test();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toBeNull();
    expect(byId(artifact)['unit.tests'].result.evidence.map((item) => item.summary)).toContain('coverage_skipped: steering/test-coverage.json is missing');
    fs.writeFileSync(path.join(root, 'steering/test-coverage.json'), '{ not json');
    const invalid = await verify(root);
    expect(byId(invalid)['unit.tests'].result.evidence.map((item) => item.summary))
      .toContainEqual(expect.stringMatching(/^coverage_skipped: steering\/test-coverage\.json is invalid: /));
    expect(byId(invalid)['unit.tests'].effectiveStatus).toBe('passed');
    expect(invalid.selection.rejection).toBeNull();
    expect(invalid.ceiling).toBeNull();
  }, TIMEOUT);

  it('reports a failing required command as an ordinary failure instead of checking the paths', async () => {
    const check = { id: 'check', provider: 'builtin.command', required: true, when: { kind: 'always' }, tier: 'change',
      config: { program: process.execPath, args: ['-e', 'process.exitCode = 1'], cwd: '.', env: [] } };
    const root = await project({ validations: [check] });
    change(root, 'src/app.js', 'a();\n');
    change(root, 'tools/build.sh');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1']));
    const artifact = await verify(root);
    expect(artifact.selection.rejection).toBeNull();
    expect(byId(artifact).check.effectiveStatus).toBe('failed');
    expect(artifact.ceiling).toBe('Incomplete');
  }, TIMEOUT);
});

describe('@SCN008 a redispatch reruns the gate with the supervisor guidance (#584 AC7)', () => {
  it('puts guidance for the current head in the selection prompt and records guidanceSupplied, ignoring another head', async () => {
    const root = await project();
    change(root, 'src/app.js', 'a();\n');
    answer = { mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] };
    report(root, testReport(['src/app.js:1']));
    writeGuidance(root, 42, '0'.repeat(40), 'stale guidance');
    expect((await verify(root)).selection.guidanceSupplied).toBe(false);
    writeGuidance(root, 42, git(root, 'rev-parse', 'HEAD'), 'select the hooks tests');
    const artifact = await verify(root);
    expect(calls).toHaveLength(2);
    expect(calls[0].input).not.toContain('Supervisor guidance:');
    expect(calls[1].input).toContain('Supervisor guidance:\nselect the hooks tests');
    expect(artifact.selection).toMatchObject({ guidanceSupplied: true, reused: false });
  }, TIMEOUT);
});

describe('@SCN009 only a docs-only change may select nothing (#584 AC8)', () => {
  it('passes the opted-in validation as selection_empty and gives providers no surfaces', async () => {
    const root = await project();
    change(root, 'docs/guide.md');
    answer = { mode: 'selected', tests: [], surfaces: [] };
    const artifact = await verify(root);
    expect(byId(artifact)['unit.tests']).toMatchObject({ effectiveStatus: 'passed', selection: { reason: 'selection_empty', fallbackPath: null, selectedCount: 0 } });
    expect(artifact.selection).toMatchObject({ reason: 'selection_empty', rejection: null, surfaces: [] });
    expect(ranWith(root)).toBeNull();
    expect(providerRequests.find((item) => item.validationId === 'lint').selection).toEqual({ mode: 'selected', reason: 'selection_empty', surfaces: [] });
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('requires no surface for a doc path that a surface\'s sources also match, as a version commit changes', async () => {
    const root = await project({ selection: { docPaths: ['docs/**', 'VERSION', 'host/plugin.json'] },
      surfaces: [{ id: 'host', sources: ['host/**'] }, { id: 'site', sources: ['site/**'], validations: ['site.smoke'] }],
      baseline: { 'VERSION': '1.0.0\n', 'host/plugin.json': '{"version":"1.0.0"}\n' } });
    change(root, 'VERSION', '1.1.0\n');
    change(root, 'host/plugin.json', '{"version":"1.1.0"}\n');
    answer = { mode: 'selected', tests: [], surfaces: [] };
    const artifact = await verify(root);
    expect(artifact.selection).toMatchObject({ reason: 'selection_empty', requiredSurfaces: [], rejection: null });
    expect(artifact.ceiling).toBeNull();
    change(root, 'host/hook.js', 'h();\n');
    expect((await verify(root)).selection.rejection).toMatchObject({ reasonCode: 'selection_surface_missing', missingSurfaces: ['host'] });
  }, TIMEOUT);

  it('lets a change that only deletes code select nothing, since nothing of it is left to cover', async () => {
    const root = await project({ baseline: { 'lib/old.js': 'gone();\n' } });
    fs.rmSync(path.join(root, 'lib/old.js'));
    git(root, 'commit', '-am', 'delete lib/old.js');
    answer = { mode: 'selected', tests: [], surfaces: [] };
    const artifact = await verify(root);
    expect(artifact.changedPaths).toEqual(['lib/old.js']);
    expect(artifact.selection).toMatchObject({ reason: 'selection_empty', rejection: null });
    expect(artifact.ceiling).toBeNull();
  }, TIMEOUT);

  it('rejects an empty selection for a change with a code path as selection_empty_code_change', async () => {
    const root = await project();
    change(root, 'docs/guide.md');
    change(root, 'lib/x.js');
    answer = { mode: 'selected', tests: [], surfaces: [] };
    const artifact = await verify(root);
    expect(artifact.selection).toMatchObject({ reason: 'selection_empty', rejection: { reasonCode: 'selection_empty_code_change', unaccounted: ['lib/x.js'] } });
    expect(byId(artifact)['unit.tests'].effectiveStatus).toBe('failed');
  }, TIMEOUT);

  it('rejects an empty selection as selection_empty_code_change when no docPaths are declared', async () => {
    const root = await project({ selection: { fallbackPaths: ['package.json'] } });
    change(root, 'docs/guide.md');
    answer = { mode: 'selected', tests: [], surfaces: [] };
    const artifact = await verify(root);
    expect(artifact.selection).toMatchObject({ reason: 'selection_empty', rejection: { reasonCode: 'selection_empty_code_change', unaccounted: ['docs/guide.md'] } });
  }, TIMEOUT);
});

describe('@SCN010 full-run fallbacks give providers every surface (#584 AC9)', () => {
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

describe('@SCN010 an unsafe answer runs everything (#584 AC9)', () => {
  it('fails an id that becomes an option once normalized as selection_failed, never appending it', async () => {
    const root = await project();
    change(root, 'src/app.js');
    answer = { mode: 'selected', tests: ['./--config=evil.json'], surfaces: ['app'] };
    const artifact = await verify(root);
    expect(artifact.selection).toMatchObject({ mode: 'all', reason: 'selection_failed', detail: 'unsafe test entry' });
    expect(ranWith(root)).toEqual([]);
  }, TIMEOUT);

  (process.platform === 'win32' ? it.skip : it)('fails a test reached through a symlinked directory as selection_failed', async () => {
    const root = await project();
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-584-outside-')));
    roots.push(outside);
    fs.writeFileSync(path.join(outside, 'evil.test.js'), '// outside\n');
    fs.symlinkSync(outside, path.join(root, 'link'));
    change(root, 'src/app.js');
    answer = { mode: 'selected', tests: ['link/evil.test.js'], surfaces: ['app'] };
    const artifact = await verify(root);
    expect(artifact.selection).toMatchObject({ mode: 'all', reason: 'selection_failed' });
    expect(artifact.selection.detail).toContain('link/evil.test.js');
    expect(ranWith(root)).toEqual([]);
  }, TIMEOUT);
});

describe('@SCN001 --mode select stores the selection the gate reuses (#584 AC1, FR2)', () => {
  it('refuses an option-shaped base ref before reading the project or asking Claude', async () => {
    // `--all` passes the ref-name character check, so only the leading-dash guard refuses it.
    for (const base of ['--all', '-p']) {
      await expect(verifySteering(['--project', '/nonexistent', '--issue', '42', '--spec', 'specs/42-test', '--base', base, '--mode', 'select'], { runSelection }))
        .rejects.toThrow('invalid_arguments');
    }
    expect(calls).toEqual([]);
  });

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

describe('@SCN002 the gate reads the selection model from steering/sdlc-models.json (#584 AC2)', () => {
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

  it('prints the diagnostic beside the reason code when --mode select fails on the model file', async () => {
    const root = await project();
    change(root, 'src/app.js');
    fs.writeFileSync(path.join(root, 'steering/sdlc-models.json'), JSON.stringify({ version: 1, selection: { model: 'haiku', effort: 'huge' } }));
    const cli = spawnSync(process.execPath, [fileURLToPath(new URL('../sdlc-verify-steering.mjs', import.meta.url)), '--project', root, '--issue', '42', '--spec', 'specs/42-test',
      '--base', 'main', '--mode', 'select'], { encoding: 'utf8' });
    expect(cli.status).toBe(1);
    const printed = JSON.parse(cli.stdout);
    expect(printed).toMatchObject({ ok: false, reasonCode: 'stage_models_invalid' });
    expect(printed.summary).toContain('selection.effort = "huge"');
  }, TIMEOUT);

  it('calls Claude with the configured selection model and effort', async () => {
    const root = await project();
    change(root, 'site/index.html');
    fs.writeFileSync(path.join(root, 'steering/sdlc-models.json'), JSON.stringify({ version: 1, selection: { model: 'sonnet', effort: 'high' } }));
    answer = { mode: 'selected', tests: [], surfaces: ['site'] };
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs/42-test'), baseRef: 'main', runSelection, acquireSlot });
    expect(calls[0].args.slice(0, 5)).toEqual(['-p', '--model', 'sonnet', '--effort', 'high']);
    expect(artifact.selection).toMatchObject({ model: 'sonnet', effort: 'high' });
  }, TIMEOUT);
});
