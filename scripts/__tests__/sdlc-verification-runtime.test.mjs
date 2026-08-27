import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { applySteeringPlan, createInitializePlan } from '../sdlc-steering.mjs';
import { evaluateCondition, runSteeringValidations, validationResultCoverage, verificationCeiling } from '../../src/sdlc-verification-runtime.mjs';

const VERIFY_SCRIPT = path.resolve('sdlc-verify-steering.mjs');

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
  return { id, provider: 'builtin.command', required, when, config: { program: process.execPath, args: ['-e', code], cwd: '.', env: [] } };
}


describe('validation result coverage', () => {
  it('treats zero declarations and zero results as complete', () => {
    expect(validationResultCoverage([], [])).toEqual({
      declared: 0,
      recorded: 0,
      complete: true,
      missing: [],
      duplicate: [],
      unknown: [],
    });
  });

  it('fails closed for missing, duplicate, and unknown result ids', () => {
    const validations = [{ id: 'required.one' }, { id: 'required.two' }];
    const results = [
      { id: 'required.one' },
      { id: 'required.one' },
      { id: 'unknown.result' },
    ];
    const coverage = validationResultCoverage(validations, results);
    expect(coverage).toEqual({
      declared: 2,
      recorded: 3,
      complete: false,
      missing: ['required.two'],
      duplicate: ['required.one'],
      unknown: ['unknown.result'],
    });
    expect(verificationCeiling([], coverage)).toBe('Incomplete');
  });
});
describe('deterministic verification runtime', () => {
  it('records complete coverage when the manifest declares no validations', async () => {
    const root = await fixture([]);
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'HEAD' });
    expect(artifact).toMatchObject({
      ceiling: null,
      coverage: {
        declared: 0,
        recorded: 0,
        complete: true,
        missing: [],
        duplicate: [],
        unknown: [],
      },
      results: [],
    });
    const cli = spawnSync(process.execPath, [
      VERIFY_SCRIPT,
      '--project', root,
      '--issue', '42',
      '--spec', 'specs/42-test',
      '--base', 'HEAD',
    ], { cwd: root, encoding: 'utf8', shell: false });
    expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stdout)).toMatchObject({
      ok: true,
      ceiling: null,
      issue: 42,
      coverage: {
        declared: 0,
        recorded: 0,
        complete: true,
      },
    });
  });

  it('runs every applicable validation and writes identity-bound evidence', async () => {
    const root = await fixture([
      command('required.pass', 'process.stdout.write("ok")'),
      { id: 'artifact.pass', provider: 'builtin.artifact', required: true, when: { kind: 'always' }, config: { path: 'evidence.json', checks: ['nonempty', 'json'] } },
      command('not.changed', 'process.exit(9)', true, { kind: 'changed_paths', include: ['src/**'] }),
    ]);
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'HEAD' });
    expect(artifact.ceiling).toBeNull();
    expect(artifact.coverage).toEqual({
      declared: 3,
      recorded: 3,
      complete: true,
      missing: [],
      duplicate: [],
      unknown: [],
    });
    expect(artifact.results.map(({ effectiveStatus }) => effectiveStatus)).toEqual(['passed', 'passed', 'skipped']);
    expect(artifact.results[0].request.identity).toEqual(expect.objectContaining({ headSha: expect.stringMatching(/^[a-f0-9]{40}$/), treeState: 'clean', specHash: expect.stringMatching(/^sha256:/), steeringHash: expect.stringMatching(/^sha256:/), validationConfigHash: expect.stringMatching(/^sha256:/) }));
    expect(fs.existsSync(path.join(root, '.omp', 'sdlc', 'verification', '42.json'))).toBe(true);
  });

  it('hashes untracked directories and preserves complete rename paths', async () => {
    const root = await fixture([
      command('renamed.path', 'process.stdout.write("ok")', true, {
        kind: 'changed_paths',
        include: ['renamed/**'],
      }),
    ]);
    fs.writeFileSync(path.join(root, 'old.txt'), 'tracked\n');
    run(root, 'git', ['add', 'old.txt']);
    run(root, 'git', ['commit', '-m', 'tracked rename source']);
    fs.mkdirSync(path.join(root, 'renamed'));
    run(root, 'git', ['mv', 'old.txt', 'renamed/destination.txt']);
    fs.mkdirSync(path.join(root, 'untracked', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'untracked', 'nested', 'evidence.txt'), 'evidence\n');

    const artifact = await runSteeringValidations({
      projectRoot: root,
      issue: 42,
      specDir: path.join(root, 'specs', '42-test'),
      baseRef: 'HEAD',
    });
    expect(artifact.results[0].effectiveStatus).toBe('passed');
    expect(artifact.results[0].request.identity).toMatchObject({
      treeState: 'dirty',
      dirtyDiffHash: expect.stringMatching(/^sha256:/),
    });
  });

  it('caps required failures while optional failures remain recorded', async () => {
    const root = await fixture([command('required.fail', 'process.exit(2)'), command('optional.fail', 'process.exit(3)', false)]);
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'HEAD' });
    expect(artifact.ceiling).toBe('Fail');
    expect(artifact.results.map(({ effectiveStatus }) => effectiveStatus)).toEqual(['failed', 'failed']);
    expect(verificationCeiling([artifact.results[1]])).toBeNull();
  });

  it('ignores a legacy timeout and preserves eventual success', async () => {
    const validations = [
      { ...command('required.slow', 'setTimeout(() => process.stdout.write("done"), 40)'), timeoutMs: 1 },
      { id: 'external.bad', provider: 'builtin.external-evidence', required: true, when: { kind: 'always' }, config: { path: 'evidence.json' } },
    ];
    const root = await fixture(validations);
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'HEAD' });
    expect(artifact.ceiling).toBe('Incomplete');
    expect(artifact.results.map(({ effectiveStatus }) => effectiveStatus)).toEqual(['passed', 'incomplete']);
    expect(artifact.results[0].request).not.toHaveProperty('timeoutMs');
    expect(artifact.results[0].result.evidence[0].stdout).toBe('done');
  });

  it('passes an immutable request to a trusted extension provider', async () => {
    const root = await fixture([]);
    fs.mkdirSync(path.join(root, 'steering', 'extensions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'steering', 'extensions', 'real-provider.mjs'), [
      'export const extension = Object.freeze({',
      '  schemaVersion: 1,',
      '  id: "test.extension",',
      '  providers: Object.freeze({',
      '    "project.real": async (request) => {',
      '      await new Promise((resolve) => setTimeout(resolve, 30));',
      '      return {',
      '        schemaVersion: 1,',
      '        status: Object.isFrozen(request) && Object.isFrozen(request.config) && request.signal === undefined ? "passed" : "failed",',
      '        summary: "extension provider ran",',
      '        identity: request.identity,',
      '        evidence: [{ kind: "extension", summary: request.validationId, artifact: null }],',
      '      };',
      '    },',
      '  }),',
      '});',
      '',
    ].join('\n'));
    const manifestPath = path.join(root, 'steering', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.extensions.push({ id: 'test.extension', path: 'steering/extensions/real-provider.mjs', providers: ['project.real'] });
    manifest.validations.push({ id: 'extension.pass', provider: 'project.real', required: true, when: { kind: 'always' }, timeoutMs: 1, config: { value: 1 } });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    run(root, 'git', ['add', '.']);
    run(root, 'git', ['commit', '-m', 'register extension']);

    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'HEAD' });
    expect(artifact.ceiling).toBeNull();
    expect(artifact.results[0].effectiveStatus).toBe('passed');

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    const cancelled = await runSteeringValidations({
      projectRoot: root,
      issue: 42,
      specDir: path.join(root, 'specs', '42-test'),
      baseRef: 'HEAD',
      signal: controller.signal,
    });
    expect(cancelled.ceiling).toBe('Incomplete');
    expect(cancelled.results[0].result.summary).toBe('cancelled');
  });

  it('cancels an active command and cleans up its process group', async () => {
    const source = 'const {spawn}=require("node:child_process"); spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:["ignore","inherit","inherit"]}); setInterval(()=>{},1000)';
    const root = await fixture([command('required.cancelled.tree', source)]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 40);
    const artifact = await runSteeringValidations({
      projectRoot: root,
      issue: 42,
      specDir: path.join(root, 'specs', '42-test'),
      baseRef: 'HEAD',
      signal: controller.signal,
    });
    expect(artifact.ceiling).toBe('Incomplete');
    expect(artifact.results[0].effectiveStatus).toBe('incomplete');
    expect(artifact.results[0].result.summary).toBe('command cancelled');
  });

  it('does not launch a command when cancellation is already explicit', async () => {
    const root = await fixture([command('required.pre.cancelled', 'process.stdout.write("unexpected")')]);
    const controller = new AbortController();
    controller.abort();
    const artifact = await runSteeringValidations({
      projectRoot: root,
      issue: 42,
      specDir: path.join(root, 'specs', '42-test'),
      baseRef: 'HEAD',
      signal: controller.signal,
    });
    expect(artifact.results[0].result.summary).toBe('command cancelled');
    expect(artifact.results[0].result.evidence).toEqual([]);
  });

  it('classifies confirmed command process loss as incomplete', async () => {
    const root = await fixture([command('required.process.lost', 'unused')]);
    const spawnCommand = () => {
      const child = new EventEmitter();
      child.pid = undefined;
      child.exitCode = null;
      child.signalCode = null;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      queueMicrotask(() => child.emit('close', null, null));
      return child;
    };
    const artifact = await runSteeringValidations({
      projectRoot: root,
      issue: 42,
      specDir: path.join(root, 'specs', '42-test'),
      baseRef: 'HEAD',
      spawnCommand,
    });
    expect(artifact.ceiling).toBe('Incomplete');
    expect(artifact.results[0].result.summary).toBe('command process lost');
  });

  it('records an incomplete artifact when the base ref cannot be diffed', async () => {
    const root = await fixture([command('changed.pass', 'process.exit(0)', true, { kind: 'changed_paths', include: ['src/**'] })]);
    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'missing-base-ref' });
    expect(artifact).toMatchObject({ ceiling: 'Incomplete', changedPaths: [], results: [] });
    expect(artifact).not.toHaveProperty('coverage');
    expect(artifact.runtimeError.summary).toContain('missing-base-ref');
  });

  it('replaces stale success evidence when identity setup fails', async () => {
    const root = await fixture([command('required.pass', 'process.exit(0)')]);
    const artifactPath = path.join(root, '.omp', 'sdlc', 'verification', '42.json');
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, '{"ceiling":null,"stale":true}\n');
    fs.rmSync(path.join(root, 'specs', '42-test', 'design.md'));

    const artifact = await runSteeringValidations({ projectRoot: root, issue: 42, specDir: path.join(root, 'specs', '42-test'), baseRef: 'HEAD' });
    expect(artifact).toMatchObject({ ceiling: 'Incomplete', results: [] });
    expect(artifact).not.toHaveProperty('coverage');
    expect(JSON.parse(fs.readFileSync(artifactPath, 'utf8'))).not.toHaveProperty('stale');
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
