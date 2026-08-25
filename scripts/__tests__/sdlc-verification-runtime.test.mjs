import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { evaluateCondition, runSteeringValidations, verificationCeiling } from '../../src/sdlc-verification-runtime.mjs';

function run(root, program, args) {
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
async function fixture(validations) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-verification-'));
  fs.mkdirSync(path.join(root, 'specs', '42-test'), { recursive: true });
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) fs.writeFileSync(path.join(root, 'specs', '42-test', name), `${name}\n`);
  fs.writeFileSync(path.join(root, 'evidence.json'), '{"ok":true}\n');
  await applySteeringPlan(root, createInitializePlan(root, { validations }));
  run(root, 'git', ['init']);
  run(root, 'git', ['config', 'user.email', 'test@example.com']);
  run(root, 'git', ['config', 'user.name', 'Test']);
  run(root, 'git', ['add', '.']);
  run(root, 'git', ['commit', '-m', 'test fixture']);
  return root;
}
function command(id, code, required = true, when = { kind: 'always' }) {
  return { id, provider: 'builtin.command', required, when, timeoutMs: 10000, config: { program: process.execPath, args: ['-e', code], cwd: '.', env: [] } };
}

describe('deterministic verification runtime', () => {
  it('runs every applicable validation and writes identity-bound evidence', async () => {
    const root = await fixture([
      command('required.pass', 'process.stdout.write("ok")'),
      { id: 'artifact.pass', provider: 'builtin.artifact', required: true, when: { kind: 'always' }, timeoutMs: 10000, config: { path: 'evidence.json', checks: ['nonempty', 'json'] } },
      command('not.changed', 'process.exit(9)', true, { kind: 'changed_paths', include: ['src/**'] }),
    ]);
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'HEAD' });
    expect(artifact.ceiling).toBeNull();
    expect(artifact.results.map(({ effectiveStatus }) => effectiveStatus)).toEqual(['passed', 'passed', 'skipped']);
    expect(artifact.results[0].request.identity).toEqual(expect.objectContaining({ headSha: expect.stringMatching(/^[a-f0-9]{40}$/), treeState: 'clean', specHash: expect.stringMatching(/^sha256:/), steeringHash: expect.stringMatching(/^sha256:/), validationConfigHash: expect.stringMatching(/^sha256:/) }));
    expect(fs.existsSync(path.join(root, '.omp', 'sdlc', 'verification', '42.json'))).toBe(true);
  });

  it('caps required failures while optional failures remain recorded', async () => {
    const root = await fixture([command('required.fail', 'process.exit(2)'), command('optional.fail', 'process.exit(3)', false)]);
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'HEAD' });
    expect(artifact.ceiling).toBe('Fail');
    expect(artifact.results.map(({ effectiveStatus }) => effectiveStatus)).toEqual(['failed', 'failed']);
    expect(verificationCeiling([artifact.results[1]])).toBeNull();
  });

  it('converts timeout and malformed external evidence to incomplete', async () => {
    const validations = [
      { ...command('required.timeout', 'setTimeout(() => {}, 10000)'), timeoutMs: 20 },
      { id: 'external.bad', provider: 'builtin.external-evidence', required: true, when: { kind: 'always' }, timeoutMs: 10000, config: { path: 'evidence.json' } },
    ];
    const root = await fixture(validations);
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'HEAD' });
    expect(artifact.ceiling).toBe('Incomplete');
    expect(artifact.results.map(({ effectiveStatus }) => effectiveStatus)).toEqual(['incomplete', 'incomplete']);
  });

  it('evaluates the closed condition kinds before provider launch', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-condition-'));
    fs.writeFileSync(path.join(root, 'exists.txt'), 'x');
    expect(evaluateCondition({ kind: 'always' }, { projectRoot: root, paths: [] })).toBe(true);
    expect(evaluateCondition({ kind: 'changed_paths', include: ['src/**'], exclude: ['src/generated/**'] }, { projectRoot: root, paths: ['src/a.mjs'] })).toBe(true);
    expect(evaluateCondition({ kind: 'changed_paths', include: ['src/**'], exclude: ['src/generated/**'] }, { projectRoot: root, paths: ['src/generated/a.mjs'] })).toBe(false);
    expect(evaluateCondition({ kind: 'path_exists', path: 'exists.txt' }, { projectRoot: root, paths: [] })).toBe(true);
    expect(evaluateCondition({ kind: 'glob_exists', root: '.', pattern: '*.txt' }, { projectRoot: root, paths: [] })).toBe(true);
  });
});
