// The change-selection resolver: @SCN001, @SCN002 and @SCN010 (#584 AC1, AC2, AC9, FR2, FR9).
import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { ANSWER_SCHEMA, resolveChangeSelection, selectionPath } from '../../src/sdlc-test-selection.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};

const TECH = '# Tech\n\n## Versioning\n\n| File | Path |\n|------|------|\n| `VERSION` | file text |\n| `package.json` | `version` |\n';

/**
 * A committed project on `work` with a project snippet routed to gate:selection, a technical snippet declaring the
 * version files, the test file tests/app.test.js and one change to src/app.js.
 */
async function project({ fallbackPaths = ['package.json'], baselineFiles = {} } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-584-select-')));
  roots.push(root);
  fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
  await applySteeringPlan(root, createInitializePlan(root, { validations: [] }));
  fs.mkdirSync(path.join(root, 'steering/snippets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steering/snippets/selection.md'), 'Project rule: tests live under tests/.\n');
  const file = path.join(root, 'steering/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.snippets.push({ id: 'project.selection', path: 'steering/snippets/selection.md', consumers: ['gate:selection'], slot: 'body', order: 500 });
  fs.writeFileSync(path.join(root, 'steering/snippets/tech.md'), TECH);
  manifest.snippets.push({ id: 'project.tech', path: 'steering/snippets/tech.md', consumers: ['worker:deliver'], slot: 'body', order: 500 });
  manifest.validations = [{ id: 'unit.tests', provider: 'builtin.command', required: true, when: { kind: 'always' }, tier: 'change', selection: true,
    config: { program: process.execPath, args: ['-e', '0'], cwd: '.', env: [] } }];
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
  fs.mkdirSync(path.join(root, 'src'));
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
  it('records the exit status and Claude stderr in the detail', async () => {
    const { root, runtime } = await project();
    const { run } = recorder(() => ({ status: 2, stdout: '', stderr: 'authentication expired\n' }));
    expect(await resolve(root, runtime, run)).toMatchObject({ reason: 'selection_failed', detail: 'claude exited 2: authentication expired' });
  });

  it('names a selected test that is not a file, and asks again instead of reusing a stored test that was removed', async () => {
    const { root, runtime } = await project();
    const missing = recorder({ mode: 'selected', tests: ['tests/glob.test.js'], surfaces: ['app'] });
    expect(await resolve(root, runtime, missing.run)).toMatchObject({ mode: 'all', reason: 'selection_failed',
      detail: 'selected test is not a file in the project: tests/glob.test.js' });
    const { calls, run } = recorder({ mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    await resolve(root, runtime, run);
    expect(calls).toHaveLength(1);
    // A stored selection is checked again on reuse: an entry that breaks the answer contract is never reused.
    const stored = JSON.parse(fs.readFileSync(selectionPath(root, 42), 'utf8'));
    fs.writeFileSync(selectionPath(root, 42), JSON.stringify({ ...stored, selection: { ...stored.selection, tests: ['--passWithNoTests'] } }));
    expect(await resolve(root, runtime, run)).toMatchObject({ reason: 'selected', tests: ['tests/app.test.js'], reused: false });
    expect(calls).toHaveLength(2);
  });
});

describe('@SCN010 a version bump is not a fallback change (#584 AC9)', () => {
  const manifestJson = (version, extra = {}) => `${JSON.stringify({ name: 'demo', version, ...extra }, null, 2)}\n`;

  it('asks Claude, requires no surface and records the path when package.json changes only its version', async () => {
    const { root, runtime } = await project({ baselineFiles: { 'package.json': manifestJson('1.0.0') } });
    fs.writeFileSync(path.join(root, 'package.json'), manifestJson('1.1.0'));
    const { calls, run } = recorder({ mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    expect(await resolve(root, runtime, run, { paths: ['package.json', 'src/app.js'] })).toMatchObject({ mode: 'selected', reason: 'selected',
      versionOnly: ['package.json'], requiredSurfaces: ['app'] });
    expect(calls).toHaveLength(1);
  });

  it('exempts only the version files technical steering declares', async () => {
    const { root, runtime } = await project({ fallbackPaths: ['config/**'], baselineFiles: { 'VERSION': '1.0.0\n', 'config/models.json': manifestJson('1.0.0') } });
    fs.writeFileSync(path.join(root, 'VERSION'), '1.1.0\n');
    fs.writeFileSync(path.join(root, 'config/models.json'), manifestJson('2.0.0'));
    const { calls, run } = recorder({ mode: 'selected', tests: [], surfaces: [] });
    expect(await resolve(root, runtime, run, { paths: ['VERSION', 'config/models.json'] })).toMatchObject({ mode: 'all', reason: 'fallback_path',
      fallbackPath: 'config/models.json', versionOnly: ['VERSION'] });
    expect(calls).toHaveLength(0);
  });

  it('still runs in full when package.json changes anything besides its version', async () => {
    const { root, runtime } = await project({ baselineFiles: { 'package.json': manifestJson('1.0.0') } });
    fs.writeFileSync(path.join(root, 'package.json'), manifestJson('1.1.0', { type: 'module' }));
    const { calls, run } = recorder({ mode: 'selected', tests: [], surfaces: [] });
    expect(await resolve(root, runtime, run, { paths: ['package.json', 'src/app.js'] })).toMatchObject({ mode: 'all', reason: 'fallback_path',
      fallbackPath: 'package.json', versionOnly: [] });
    expect(calls).toHaveLength(0);
  });
});
