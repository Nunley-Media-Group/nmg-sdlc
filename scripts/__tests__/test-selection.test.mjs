// The change-selection resolver: @SCN001, @SCN002 and @SCN010 (#584 AC1, AC2, AC9, FR2, FR9).
import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { ANSWER_SCHEMA, clearGuidance, MAX_UNTRACKED_FILE_BYTES, readGuidance, resolveChangeSelection, selectionPath, storedGuidance, writeGuidance } from '../../src/sdlc-test-selection.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};

/**
 * A committed project on `work` with a project snippet routed to gate:selection, the test file tests/app.test.js and
 * one change to src/app.js.
 */
async function project({ fallbackPaths = ['package.json'], baselineFiles = {}, cwd = '.' } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-584-select-')));
  roots.push(root);
  fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
  await applySteeringPlan(root, createInitializePlan(root, { validations: [] }));
  fs.mkdirSync(path.join(root, 'steering/snippets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steering/snippets/selection.md'), 'Project rule: tests live under tests/.\n');
  const file = path.join(root, 'steering/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.snippets.push({ id: 'project.selection', path: 'steering/snippets/selection.md', consumers: ['gate:selection'], slot: 'body', order: 500 });
  manifest.validations = [{ id: 'unit.tests', provider: 'builtin.command', required: true, when: { kind: 'always' }, tier: 'change', selection: true,
    config: { program: process.execPath, args: ['-e', '0'], cwd, env: [] } }];
  manifest.selection = { docPaths: ['docs/**'], fallbackPaths };
  manifest.surfaces = [{ id: 'app', sources: ['src/**'] }, { id: 'cli', sources: ['bin/**'] }];
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, text] of Object.entries({ 'tests/app.test.js': '// app test\n', ...baselineFiles })) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'baseline');
  git(root, 'checkout', '-b', 'work');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/app.js'), 'export const answer = 42;\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'change');
  return { root, runtime: await loadSteeringRuntime(root) };
}
const recorder = (answer) => {
  const calls = [];
  const run = (call) => {
    calls.push(call);
    if (typeof answer === 'function') return answer(call);
    return { status: 0, stdout: JSON.stringify({ type: 'result', structured_output: answer }) };
  };
  return { calls, run };
};
const resolve = (root, runtime, runSelection, extra = {}) => resolveChangeSelection({ projectRoot: root, issue: 42, baseRef: 'main',
  paths: ['src/app.js'], runtime, models: {}, runSelection, ...extra });

describe('@SCN001 Claude selects tests and surfaces (#584 AC1)', () => {
  it('sends the rendered prompt with the project snippet, base ref, changed paths, diff and surface ids', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    const selection = await resolve(root, runtime, run);
    expect(calls).toHaveLength(1);
    const { input, program, args, cwd, timeout } = calls[0];
    expect(input).toContain('# Test and Surface Selection');
    expect(input).toContain('Project rule: tests live under tests/.');
    expect(input).toContain('Base ref: main');
    expect(input).toContain('- src/app.js');
    expect(input).toContain('+export const answer = 42;');
    expect(input).toContain('- app: src/**');
    expect(input).toContain('- cli: bin/**');
    expect(input).not.toContain('Supervisor guidance:');
    expect(program).toBe('claude');
    expect(args).toEqual(['-p', '--model', 'haiku', '--effort', 'xhigh', '--output-format', 'json', '--json-schema', JSON.stringify(ANSWER_SCHEMA),
      '--tools', '', '--no-session-persistence']);
    expect({ cwd, timeout }).toEqual({ cwd: root, timeout: 300_000 });
    expect(selection).toMatchObject({ mode: 'selected', reason: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'], requiredSurfaces: ['app'],
      model: 'haiku', effort: 'xhigh', guidanceSupplied: false, reused: false });
    expect(selection.prompt.consumer).toBe('gate:selection');
    expect(selection.prompt.fragments.map(({ id }) => id)).toEqual(['plugin.gate.selection', 'project.selection']);
    expect(selection.prompt.fragments.every(({ hash }) => /^sha256:[0-9a-f]{64}$/.test(hash))).toBe(true);
  });

  it('caps the diff with a truncation marker and includes untracked file content', async () => {
    const { root, runtime } = await project();
    fs.writeFileSync(path.join(root, 'src/big.js'), `${'x'.repeat(250_000)}\n`);
    git(root, 'add', 'src/big.js');
    git(root, 'commit', '-m', 'big');
    fs.writeFileSync(path.join(root, 'src/new.js'), 'export const fresh = 1;\n');
    const { calls, run } = recorder({ mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    await resolve(root, runtime, run, { paths: ['src/app.js', 'src/big.js', 'src/new.js'] });
    expect(calls[0].input).toMatch(/\[diff truncated: \d+ more bytes\]/);
    fs.rmSync(path.join(root, 'src/big.js'));
    git(root, 'commit', '-am', 'drop big');
    fs.rmSync(selectionPath(root, 42));
    await resolve(root, runtime, run, { paths: ['src/app.js', 'src/new.js'] });
    expect(calls[1].input).toContain('+export const fresh = 1;');
    // Editing the untracked file moves the binding, so the stored selection is not reused.
    fs.writeFileSync(path.join(root, 'src/new.js'), 'export const fresh = 2;\n');
    expect((await resolve(root, runtime, run, { paths: ['src/app.js', 'src/new.js'] })).reused).toBe(false);
  });

  it('names an untracked file over the size cap instead of reading it into the prompt', async () => {
    const { root, runtime } = await project();
    fs.writeFileSync(path.join(root, 'big.bin'), Buffer.alloc(MAX_UNTRACKED_FILE_BYTES + 1, 0x61));
    const { calls, run } = recorder({ mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    await resolve(root, runtime, run);
    expect(calls[0].input).toContain(`new file (untracked, ${MAX_UNTRACKED_FILE_BYTES + 1} bytes`);
    expect(calls[0].input).not.toContain('a'.repeat(1000));
  });

  (process.platform === 'win32' ? it.skip : it)('spawns claude with the prompt on stdin and reads its structured output', async () => {
    const { root } = await project();
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-584-claude-'));
    roots.push(bin);
    // Selects the test only when the prompt it reads from stdin names the changed path, and records its arguments.
    fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const input = fs.readFileSync(0, 'utf8');
fs.writeFileSync(${JSON.stringify(path.join(bin, 'argv.json'))}, JSON.stringify(process.argv.slice(2)));
const named = input.includes('Changed paths:\\n- src/app.js');
process.stdout.write(JSON.stringify({ type: 'result', structured_output: { mode: 'selected', tests: named ? ['tests/app.test.js'] : [], surfaces: ['app'] } }));
`, { mode: 0o755 });
    // Jest gives a test a copy of process.env, so the resolver runs in a child process whose PATH finds the fake claude.
    const modules = ['../../src/sdlc-steering-runtime.mjs', '../../src/sdlc-test-selection.mjs'].map((file) => new URL(file, import.meta.url).href);
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const { loadSteeringRuntime } = await import(${JSON.stringify(modules[0])});
      const { resolveChangeSelection } = await import(${JSON.stringify(modules[1])});
      const runtime = await loadSteeringRuntime(${JSON.stringify(root)});
      const selection = await resolveChangeSelection({ projectRoot: ${JSON.stringify(root)}, issue: 42, baseRef: 'main', paths: ['src/app.js'], runtime, models: {} });
      process.stdout.write(JSON.stringify(selection));`], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
    expect(child.stderr).toBe('');
    const selection = JSON.parse(child.stdout);
    expect(selection).toMatchObject({ mode: 'selected', reason: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    expect(JSON.parse(fs.readFileSync(path.join(bin, 'argv.json'), 'utf8')).slice(0, 4)).toEqual(['-p', '--model', 'haiku', '--effort']);
  });

  it('reads an answer printed as JSON text in the result', async () => {
    const { root, runtime } = await project();
    const { run } = recorder(() => ({ status: 0, stdout: JSON.stringify({ result: '```json\n{"mode":"selected","tests":[],"surfaces":["app"]}\n```' }) }));
    expect(await resolve(root, runtime, run)).toMatchObject({ mode: 'selected', reason: 'selected', surfaces: ['app'] });
  });

  it('reuses the stored selection while its binding holds, and asks again when the change moves', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    await resolve(root, runtime, run);
    expect(fs.existsSync(selectionPath(root, 42))).toBe(true);
    expect(await resolve(root, runtime, run)).toMatchObject({ reused: true, tests: ['tests/app.test.js'] });
    expect(calls).toHaveLength(1);
    fs.writeFileSync(path.join(root, 'src/app.js'), 'export const answer = 43;\n');
    expect((await resolve(root, runtime, run)).reused).toBe(false);
    expect(calls).toHaveLength(2);
  });
});

describe('@SCN002 selection model and effort (#584 AC2)', () => {
  it('uses the configured selection entry and omits --effort for default', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'all', tests: [], surfaces: [] });
    expect(await resolve(root, runtime, run, { models: { selection: { model: 'sonnet', effort: 'high' } } })).toMatchObject({ model: 'sonnet', effort: 'high' });
    expect(calls[0].args.slice(0, 5)).toEqual(['-p', '--model', 'sonnet', '--effort', 'high']);
    fs.rmSync(selectionPath(root, 42));
    await resolve(root, runtime, run, { models: { selection: { model: 'opus', effort: 'default' } } });
    expect(calls[1].args.slice(0, 4)).toEqual(['-p', '--model', 'opus', '--output-format']);
    fs.rmSync(selectionPath(root, 42));
    expect(await resolve(root, runtime, run, { models: {} })).toMatchObject({ model: 'haiku', effort: 'xhigh' });
    expect(calls[2].args.slice(0, 5)).toEqual(['-p', '--model', 'haiku', '--effort', 'xhigh']);
  });
});

describe('@SCN010 full-run fallbacks (#584 AC9)', () => {
  it('does not ask Claude when a changed path matches a fallback path, and selects every surface', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'selected', tests: [], surfaces: [] });
    expect(await resolve(root, runtime, run, { paths: ['src/app.js', 'package.json'] })).toMatchObject({ mode: 'all', reason: 'fallback_path',
      fallbackPath: 'package.json', surfaces: ['app', 'cli'] });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['a non-zero exit', () => ({ status: 1, stdout: '' }), 'selection_failed'],
    ['a timeout', () => ({ status: null, signal: 'SIGTERM', error: Object.assign(new Error('spawnSync claude ETIMEDOUT'), { code: 'ETIMEDOUT' }) }), 'selection_failed'],
    ['malformed output', () => ({ status: 0, stdout: 'not json' }), 'selection_failed'],
    ['an unknown mode', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'some', tests: [], surfaces: [] } }) }), 'selection_failed'],
    ['tests that are not strings', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: [1], surfaces: ['app'] } }) }), 'selection_failed'],
    ['an undeclared surface', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: [], surfaces: ['web'] } }) }), 'selection_failed'],
    ['too many tests', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: Array.from({ length: 5001 }, (_, i) => `t${i}`), surfaces: [] } }) }), 'selection_failed'],
    ['an is_error result', () => ({ status: 0, stdout: JSON.stringify({ is_error: true, structured_output: { mode: 'selected', tests: [], surfaces: ['app'] } }) }), 'selection_failed'],
    ['a test that is an option', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: ['--passWithNoTests'], surfaces: ['app'] } }) }), 'selection_failed'],
    ['an absolute test path', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: ['/etc/passwd'], surfaces: ['app'] } }) }), 'selection_failed'],
    ['a test path leaving the project', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: ['tests/../../x.test.js'], surfaces: ['app'] } }) }), 'selection_failed'],
    ['a test that is not a file in the project', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: ['tests/app.test.js', 'tests/glob.test.js'], surfaces: ['app'] } }) }), 'selection_failed'],
    ['an answer with an unexpected key', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: [], surfaces: ['app'], note: 'x' } }) }), 'selection_failed'],
    ['an all answer', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'all', tests: [], surfaces: [] } }) }), 'selection_all'],
  ])('runs everything for %s', async (_name, answer, reason) => {
    const { root, runtime } = await project();
    const { run } = recorder(answer);
    expect(await resolve(root, runtime, run)).toMatchObject({ mode: 'all', reason, surfaces: ['app', 'cli'], tests: [] });
    // A failed call is never stored, so the next run asks again.
    expect(fs.existsSync(selectionPath(root, 42))).toBe(reason !== 'selection_failed');
  });
});

describe('@SCN010 a failed call keeps its diagnostic (#584 AC9)', () => {
  it('runs everything when the prompt cannot be built, before any call', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'selected', tests: [], surfaces: ['app'] });
    const selection = await resolve(root, runtime, run, { packageRoot: path.join(root, 'no-such-plugin') });
    expect(selection).toMatchObject({ mode: 'all', reason: 'selection_failed' });
    expect(selection.detail).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('records the exit status and Claude stderr in the detail', async () => {
    const { root, runtime } = await project();
    const { run } = recorder(() => ({ status: 2, stdout: '', stderr: 'authentication expired\n' }));
    expect(await resolve(root, runtime, run)).toMatchObject({ reason: 'selection_failed', detail: 'claude exited 2: authentication expired' });
  });

  it('names a selected test file that does not exist, spelled exactly, and asks again instead of reusing a stored one that does not', async () => {
    const { root, runtime } = await project();
    for (const missing of ['tests/glob.test.js', 'Tests/App.test.js']) {
      fs.rmSync(selectionPath(root, 42), { force: true });
      const { run } = recorder({ mode: 'selected', tests: [missing], surfaces: ['app'] });
      expect(await resolve(root, runtime, run)).toMatchObject({ mode: 'all', reason: 'selection_failed',
        detail: `selected test is no file in the project: ${missing}` });
    }
    const { calls, run } = recorder({ mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    await resolve(root, runtime, run);
    expect(calls).toHaveLength(1);
    // A stored selection is checked again on reuse: a stored test file that does not exist is never reused.
    const stored = JSON.parse(fs.readFileSync(selectionPath(root, 42), 'utf8'));
    fs.writeFileSync(selectionPath(root, 42), JSON.stringify({ ...stored, selection: { ...stored.selection, tests: ['tests/gone.test.js'] } }));
    expect(await resolve(root, runtime, run)).toMatchObject({ reason: 'selected', tests: ['tests/app.test.js'], reused: false });
    expect(calls).toHaveLength(2);
    // Nor is a stored reason that its lists contradict.
    fs.writeFileSync(selectionPath(root, 42), JSON.stringify({ ...stored, selection: { ...stored.selection, reason: 'selection_empty' } }));
    expect((await resolve(root, runtime, run)).reused).toBe(false);
    expect(calls).toHaveLength(3);
  });
});

(process.platform === 'win32' ? describe.skip : describe)('@SCN010 a failed or timed-out claude process runs everything (#584 AC9)', () => {
  /** Runs the resolver in a child process whose PATH finds a fake claude running `body`, with the given limits. */
  async function resolveWithClaude(body, limits) {
    const { root } = await project();
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-584-claude-'));
    roots.push(bin);
    fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
    const modules = ['../../src/sdlc-steering-runtime.mjs', '../../src/sdlc-test-selection.mjs'].map((file) => new URL(file, import.meta.url).href);
    const started = Date.now();
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const { loadSteeringRuntime } = await import(${JSON.stringify(modules[0])});
      const { resolveChangeSelection } = await import(${JSON.stringify(modules[1])});
      const runtime = await loadSteeringRuntime(${JSON.stringify(root)});
      const selection = await resolveChangeSelection({ projectRoot: ${JSON.stringify(root)}, issue: 42, baseRef: 'main', paths: ['src/app.js'], runtime, models: {},
        limits: ${JSON.stringify(limits)} });
      process.stdout.write(JSON.stringify(selection));`], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
    return { selection: JSON.parse(child.stdout), elapsed: Date.now() - started };
  }

  it('kills a claude call that outlives its timeout', async () => {
    const { selection, elapsed } = await resolveWithClaude('setTimeout(() => {}, 60000);', { timeoutMs: 500 });
    expect(selection).toMatchObject({ mode: 'all', reason: 'selection_failed', detail: 'claude timed out after 500 ms' });
    expect(elapsed).toBeLessThan(20000);
  }, 30000);

  it('settles at the timeout when a descendant of an exited claude still holds its output', async () => {
    const { selection, elapsed } = await resolveWithClaude(
      "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: ['ignore', 'inherit', 'inherit'] });", { timeoutMs: 500 });
    expect(selection).toMatchObject({ mode: 'all', reason: 'selection_failed', detail: 'claude timed out after 500 ms' });
    expect(elapsed).toBeLessThan(20000);
  }, 30000);

  it('fails an answer larger than the output cap', async () => {
    const { selection, elapsed } = await resolveWithClaude("process.stdout.write('x'.repeat(4096)); setTimeout(() => {}, 60000);", { maxOutputBytes: 1024 });
    expect(selection).toMatchObject({ mode: 'all', reason: 'selection_failed', detail: 'claude output exceeded 1024 bytes' });
    // The oversized call is killed at once, not left to run until it exits.
    expect(elapsed).toBeLessThan(20000);
  }, 30000);

  it('keeps the exit status and stderr of a failing claude', async () => {
    const { selection } = await resolveWithClaude("process.stderr.write('quota exhausted'); process.exitCode = 3;", {});
    expect(selection).toMatchObject({ mode: 'all', reason: 'selection_failed', detail: 'claude exited 3: quota exhausted' });
  }, 30000);
});

describe('@SCN001 the selected tests are read in the runner\'s own form (#584 AC1)', () => {
  it('normalizes a test file path, passes other id forms through, and drops a test file the change deletes', async () => {
    const { root, runtime } = await project({ baselineFiles: { 'tests/old.test.js': '// old\n', 'pkg/app_test.go': 'package app\n' } });
    fs.rmSync(path.join(root, 'tests/old.test.js'));
    const tests = ['./tests//app.test.js', 'tests/./app.test.js::adds', './pkg/...', 'tests/', 'crate::tests::adds', 'tests/old.test.js'];
    const { run } = recorder({ mode: 'selected', tests, surfaces: ['app'] });
    expect(await resolve(root, runtime, run, { paths: ['src/app.js', 'tests/old.test.js'] })).toMatchObject({ mode: 'selected', reason: 'selected',
      tests: ['tests/app.test.js', 'tests/app.test.js::adds', './pkg/...', 'tests/', 'crate::tests::adds'] });
  });

  it('lists only files named like tests in the prompt', async () => {
    const { root, runtime } = await project({ baselineFiles: { 'pkg/app_test.go': 'package app\n', 'lib/test_util.py': 'x = 1\n', 'src/AppTest.java': 'class AppTest {}\n',
      '__tests__/helper.js': 'x\n', 'scripts/publish-approved-spec.mjs': 'x\n', 'src/sdlc-test-selection.mjs': 'x\n', 'steering/test-coverage.json': '{}\n',
      'references/spec-context.md': 'x\n', '__tests__/notes.md': 'x\n' } });
    const { calls, run } = recorder({ mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    await resolve(root, runtime, run);
    expect(calls[0].input).toContain('Test files (project-relative files named like tests):\n- __tests__/helper.js\n- lib/test_util.py\n- pkg/app_test.go\n'
      + '- src/AppTest.java\n- tests/app.test.js\n\n');
  });
});

describe('@SCN010 a path-shaped test that names nothing from the project root runs everything (#584 AC9)', () => {
  it.each([
    ['a directory that does not exist', 'nosuchdir/'],
    ['a directory named like a test file', 'tests/dir.test.js'],
    ['a path relative to the opted-in validation\'s directory', 'sub/a.test.js'],
  ])('fails %s as selection_failed', async (_name, test) => {
    const { root, runtime } = await project({ cwd: 'tests', baselineFiles: { 'tests/dir.test.js/a.test.js': '// a\n', 'tests/sub/a.test.js': '// a\n' } });
    const { run } = recorder({ mode: 'selected', tests: ['tests/app.test.js', test], surfaces: ['app'] });
    expect(await resolve(root, runtime, run)).toMatchObject({ mode: 'all', reason: 'selection_failed' });
  });
});

describe('@SCN010 a malformed answer runs everything (#584 AC9)', () => {
  it('fails an id naming the project root and tests holding more than 1 MiB together as selection_failed', async () => {
    const { root, runtime } = await project();
    for (const tests of [['./'], Array.from({ length: 1100 }, (_, index) => `${'t'.repeat(990)}${index}`)]) {
      fs.rmSync(selectionPath(root, 42), { force: true });
      const { run } = recorder({ mode: 'selected', tests, surfaces: ['app'] });
      expect(await resolve(root, runtime, run)).toMatchObject({ mode: 'all', reason: 'selection_failed' });
    }
  });
});

describe('@SCN010 a fallback path changed by a version bump runs everything (#584 AC9)', () => {
  it('does not ask Claude when VERSION and package.json only move to a new version', async () => {
    const manifestJson = (version) => `${JSON.stringify({ name: 'demo', version }, null, 2)}\n`;
    const { root, runtime } = await project({ baselineFiles: { 'VERSION': '1.0.0\n', 'package.json': manifestJson('1.0.0') } });
    fs.writeFileSync(path.join(root, 'VERSION'), '1.1.0\n');
    fs.writeFileSync(path.join(root, 'package.json'), manifestJson('1.1.0'));
    const { calls, run } = recorder({ mode: 'selected', tests: [], surfaces: [] });
    expect(await resolve(root, runtime, run, { paths: ['VERSION', 'package.json', 'src/app.js'] })).toMatchObject({ mode: 'all', reason: 'fallback_path',
      fallbackPath: 'package.json', surfaces: ['app', 'cli'] });
    expect(calls).toHaveLength(0);
  });
});

describe('@SCN008 redispatch guidance survives a controller restart until implement runs (#584 AC7)', () => {
  it('recovers stored guidance whatever head it is bound to, and clearGuidance deletes it', async () => {
    const { root } = await project();
    writeGuidance(root, 42, 'a'.repeat(40), 'check hooks tests');
    expect(readGuidance(root, 42, 'b'.repeat(40))).toBeNull();
    expect(storedGuidance(root, 42)).toBe('check hooks tests');
    clearGuidance(root, 42);
    expect(storedGuidance(root, 42)).toBeNull();
  });
});
