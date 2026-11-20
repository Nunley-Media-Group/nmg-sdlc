// The change-selection resolver (#584 AC1, AC2, AC7, AC9, FR2, FR9).
import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { loadSteeringRuntime } from '../../src/sdlc-steering-runtime.mjs';
import { ANSWER_SCHEMA, resolveChangeSelection, selectionPath, writeGuidance } from '../../src/sdlc-test-selection.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const git = (root, ...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};

/** A committed project on `work` with a project snippet routed to gate:selection and one change to src/app.js. */
async function project({ fallbackPaths = ['package.json'] } = {}) {
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
    config: { program: process.execPath, args: ['-e', '0'], cwd: '.', env: [] } }];
  manifest.selection = { docPaths: ['docs/**'], fallbackPaths };
  manifest.surfaces = [{ id: 'app', sources: ['src/**'] }, { id: 'cli', sources: ['bin/**'] }];
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
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

describe('Claude selects tests and surfaces (#584 AC1)', () => {
  it('sends the rendered prompt with the project snippet, base ref, changed paths, diff and surface ids', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'selected', tests: ['tests/app.test.js'], surfaces: ['app'] });
    const selection = resolve(root, runtime, run);
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

  it('reads an answer printed as JSON text in the result', async () => {
    const { root, runtime } = await project();
    const { run } = recorder(() => ({ status: 0, stdout: JSON.stringify({ result: '```json\n{"mode":"selected","tests":[],"surfaces":["app"]}\n```' }) }));
    expect(resolve(root, runtime, run)).toMatchObject({ mode: 'selected', reason: 'selected', surfaces: ['app'] });
  });

  it('reuses the stored selection while its binding holds, and asks again when the change moves', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'selected', tests: ['t'], surfaces: ['app'] });
    resolve(root, runtime, run);
    expect(fs.existsSync(selectionPath(root, 42))).toBe(true);
    expect(resolve(root, runtime, run)).toMatchObject({ reused: true, tests: ['t'] });
    expect(calls).toHaveLength(1);
    fs.writeFileSync(path.join(root, 'src/app.js'), 'export const answer = 43;\n');
    expect(resolve(root, runtime, run).reused).toBe(false);
    expect(calls).toHaveLength(2);
  });
});

describe('selection model and effort (#584 AC2)', () => {
  it('uses the configured selection entry and omits --effort for default', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'all', tests: [], surfaces: [] });
    expect(resolve(root, runtime, run, { models: { selection: { model: 'sonnet', effort: 'high' } } })).toMatchObject({ model: 'sonnet', effort: 'high' });
    expect(calls[0].args.slice(0, 5)).toEqual(['-p', '--model', 'sonnet', '--effort', 'high']);
    fs.rmSync(selectionPath(root, 42));
    resolve(root, runtime, run, { models: { selection: { model: 'opus', effort: 'default' } } });
    expect(calls[1].args.slice(0, 4)).toEqual(['-p', '--model', 'opus', '--output-format']);
  });
});

describe('full-run fallbacks (#584 AC9)', () => {
  it('does not ask Claude when a changed path matches a fallback path, and selects every surface', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'selected', tests: [], surfaces: [] });
    expect(resolve(root, runtime, run, { paths: ['src/app.js', 'package.json'] })).toMatchObject({ mode: 'all', reason: 'fallback_path',
      fallbackPath: 'package.json', surfaces: ['app', 'cli'] });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['a non-zero exit', () => ({ status: 1, stdout: '' }), 'selection_failed'],
    ['a timeout', () => ({ status: null, signal: 'SIGTERM', error: Object.assign(new Error('spawnSync claude ETIMEDOUT'), { code: 'ETIMEDOUT' }) }), 'selection_failed'],
    ['malformed output', () => ({ status: 0, stdout: 'not json' }), 'selection_failed'],
    ['an undeclared surface', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: [], surfaces: ['web'] } }) }), 'selection_failed'],
    ['too many tests', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'selected', tests: Array.from({ length: 5001 }, (_, i) => `t${i}`), surfaces: [] } }) }), 'selection_failed'],
    ['an all answer', () => ({ status: 0, stdout: JSON.stringify({ structured_output: { mode: 'all', tests: [], surfaces: [] } }) }), 'selection_all'],
  ])('runs everything for %s', async (_name, answer, reason) => {
    const { root, runtime } = await project();
    const { run } = recorder(answer);
    expect(resolve(root, runtime, run)).toMatchObject({ mode: 'all', reason, surfaces: ['app', 'cli'], tests: [] });
    // A failed call is never stored, so the next run asks again.
    expect(fs.existsSync(selectionPath(root, 42))).toBe(reason !== 'selection_failed');
  });
});

describe('redispatch guidance (#584 AC7)', () => {
  it('appends head-bound guidance to the prompt and records that it was supplied', async () => {
    const { root, runtime } = await project();
    const { calls, run } = recorder({ mode: 'selected', tests: ['t'], surfaces: ['app'] });
    writeGuidance(root, 42, '0'.repeat(40), 'stale guidance');
    expect(resolve(root, runtime, run).guidanceSupplied).toBe(false);
    writeGuidance(root, 42, git(root, 'rev-parse', 'HEAD'), 'check hooks tests');
    const selection = resolve(root, runtime, run);
    expect(calls).toHaveLength(2);
    expect(calls[1].input).toContain('Supervisor guidance:\ncheck hooks tests');
    expect(selection).toMatchObject({ guidanceSupplied: true, reused: false });
  });
});
