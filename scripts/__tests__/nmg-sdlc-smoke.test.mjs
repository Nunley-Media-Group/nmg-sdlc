import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
// review removed
// import { inspectReviewReceipts } from "../../src/sdlc-review-isolation.mjs";
import { 
  createSmokeProvider,
  createSmokeRecoveryStore,
  inspectRecoveredDeliveryHandoff,
  inspectRecoveredVerificationEvidence,
  resolveSmokeRecoveryScope,
  validNestedOwnership,
} from '../../steering/extensions/nmg-sdlc-smoke.mjs';

const SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const VALID_ENV = Object.freeze({
  HERDR_ENV: '1',
  HERDR_SOCKET_PATH: '/tmp/herdr.sock',
  HERDR_PANE_ID: 'w1:p1',
});

function result(status = 0, stdout = '', extra = {}) {
  return { status, signal: null, stdout, stderr: '', reasonCode: status === 0 ? null : 'failed', ...extra };
}

function memoryRecoveryStore(states = new Map()) {
  return {
    read: jest.fn((key) => states.get(key) ?? null),
    write: jest.fn((key, value) => states.set(key, structuredClone(value))),
    remove: jest.fn((key) => states.delete(key)),
    states,
  };
}

const TEST_SCOPE = Object.freeze({
  recoveryKey: 'b'.repeat(64),
  projectRoot: '/plugin',
  runId: 'outer-run',
  issue: 379,
  specPath: 'specs/379-fix',
});

function harness(options = {}) {
  const config = Object.hasOwn(options, 'config') ? options.config : { issues: [7, 9] };
  const { env = VALID_ENV, override } = options;
  const calls = [];
  const rmSync = jest.fn();
  const mkdtempSync = jest.fn(() => '/tmp/nmg-sdlc-smoke-fixture');
  const deliveryHead = (issue) => `${issue}`.repeat(40).slice(0, 40);
  const configured = Array.isArray(config?.issues) ? config.issues : [11, 12];
  const readFileSync = jest.fn((file) => {
    if (options.readFile) return options.readFile(file, { configured, deliveryHead });
    const text = String(file);
    if (text.includes('/smoke-deliveries/') && options.proofAvailable?.value === false) return '{}';
    const issue = Number(text.match(/\/smoke-deliveries\/(\d+)\.json$/)?.[1]);
    return JSON.stringify({
      schemaVersion: 1,
      invocationId: TEST_SCOPE.recoveryKey,
      issue,
      pullRequest: issue,
      headSha: deliveryHead(issue),
      recordedBeforeMerge: true,
    });
  });
  const runCommand = jest.fn(async (program, args, commandOptions = {}) => {
    calls.push({ program, args, options: commandOptions });
    const overridden = await override?.(program, args, commandOptions, calls);
    if (overridden) return overridden;
    if (program === 'gh' && args[0] === 'auth') return result();
    if (program === 'git' && args[0] === 'clone') return result();
    if (program === 'git' && args[0] === 'remote') {
      return result(0, 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git\n');
    }
    if (program === 'git' && args[0] === 'status') return result();
    if (program === 'git' && ['read-tree', 'add'].includes(args[0])) return result();
    if (program === 'git' && args[0] === 'write-tree') return result(0, `${options.candidate?.value ?? 'e'.repeat(40)}\n`);
    if (program === 'git' && args[0] === 'rev-parse') return result(0, 'a'.repeat(40));
    if (program === 'git' && args[0] === 'merge-base') return result();
    if (program === process.execPath) return result();
    if (program === 'gh' && args[0] === 'api') {
      const issue = Number(args.find((arg) => arg.startsWith('number='))?.slice('number='.length));
      const delivered = calls.some((call) => call.program === process.execPath);
      const pullRequests = delivered ? [{
        number: issue,
        state: 'MERGED',
        url: `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/${issue}`,
        headRefOid: deliveryHead(issue),
      }] : [];
      return result(0, JSON.stringify({
        data: {
          repository: {
            issue: {
              state: delivered ? 'CLOSED' : 'OPEN',
              url: `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/${issue}`,
              closedByPullRequestsReferences: {
                nodes: pullRequests,
                pageInfo: { hasNextPage: false },
              },
            },
          },
        },
      }));
    }
    throw new Error(`unexpected command: ${program} ${args.join(' ')}`);
  });
  const states = options.states ?? new Map();
  const recoveryStore = memoryRecoveryStore(states);
  const scope = options.scope ?? TEST_SCOPE;
  const provider = createSmokeProvider({
    runCommand,
    mkdtempSync,
    readFileSync,
    rmSync,
    recoveryStore,
    resolveOuterScope: () => scope,
    validateNestedOwnership: options.validateNestedOwnership ?? (() => null),
    readRecoveryRecord: options.readRecoveryRecord ?? ((_read, _work, invocationId, issue) => (
      invocationId === TEST_SCOPE.recoveryKey ? {
        issue,
        invocationId,
        pullRequest: issue,
        headSha: deliveryHead(issue),
      } : null
    )),
    verifyRecoveredDelivery: options.verifyRecoveredDelivery ?? (() => true),
    verifyCurrentEvidence: options.verifyCurrentEvidence ?? (() => true),
    verifyRetainedClone: options.verifyRetainedClone ?? (async () => ({ status: 'passed', evidence: [] })),
    env,
  });
  const request = {
    identity: {
      headSha: 'a'.repeat(40),
      treeState: 'clean',
      dirtyDiffHash: null,
      specHash: 'sha256:test',
      steeringHash: 'sha256:steering',
      validationConfigHash: 'sha256:validation',
    },
    validationId: 'repository.nmg-sdlc-smoke',
    projectRoot: '/plugin',
    config,
  };
  return {
    calls, deliveryHead, mkdtempSync, provider, readFileSync, recoveryStore,
    request, rmSync, runCommand, scope, states,
  };
}

function retained(resultEnvelope) {
  return resultEnvelope.evidence.some((item) => item.summary === 'retained smoke clone');
}

const commandFixtures = [];
afterEach(async () => {
  jest.restoreAllMocks();
  for (const fixture of commandFixtures.splice(0)) {
    if (fs.existsSync(fixture.marker)) {
      const { pid } = JSON.parse(fs.readFileSync(fixture.marker, 'utf8'));
      try { process.kill(-pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    if (fixture.foreign && fixture.foreign.exitCode === null && fixture.foreign.signalCode === null) {
      const closed = new Promise(resolve => fixture.foreign.once('close', resolve));
      fixture.foreign.kill('SIGKILL');
      await closed;
    }
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

async function until(predicate, detail) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Did not observe ${detail}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function commandFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-smoke-command-'));
  const bin = path.join(root, 'bin');
  const work = path.join(root, 'work');
  const marker = path.join(root, 'waiting.json');
  fs.mkdirSync(bin);
  fs.mkdirSync(work);
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'nmg-sdlc' }));
  const executable = (name, source) => {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${source}`);
    fs.chmodSync(file, 0o755);
  };
  executable('gh', `
    const args = process.argv.slice(2);
    if (args[0] === 'auth') process.exit(0);
    if (args[0] !== 'api') throw new Error('Unexpected fixture gh command');
    console.log(JSON.stringify({ data: { repository: { issue: {
      state: 'OPEN', url: 'https://example.test/issues/7',
      closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false } },
    } } } }));
  `);
  executable('git', `
    const args = process.argv.slice(2);
    if (args[0] === 'clone' || args[0] === 'status') process.exit(0);
    if (args[0] === 'rev-parse') console.log('${'a'.repeat(40)}');
    else if (args[0] === 'remote') console.log('https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git');
    else if (args[0] === 'read-tree' || args[0] === 'add') process.exit(0);
    else if (args[0] === 'write-tree') console.log('${'e'.repeat(40)}');
    else throw new Error('Unexpected fixture git command');
  `);
  fs.writeFileSync(path.join(root, 'scripts', 'sdlc-execute.mjs'), `
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    process.stdout.write('owned command stdout\\n');
    process.stderr.write('owned command stderr\\n');
    writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ pid: process.pid, descendant: descendant.pid }));
    setInterval(() => {}, 1000);
  `);
  const value = { root, work, marker };
  commandFixtures.push(value);
  return value;
}

describe('nmg-sdlc mutable delivery smoke provider', () => {
  it('fails an unresolved selected controller before any remote command', async () => {
    const local = commandFixture();
    fs.unlinkSync(path.join(local.root, 'scripts/sdlc-execute.mjs'));
    const fixture = harness({ env: { ...VALID_ENV, NMG_SDLC_PLUGIN_ROOT: local.root } });
    await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
      status: 'failed', summary: 'nmg-sdlc-smoke controller unresolved: sdlc-execute.mjs',
    });
    expect(fixture.runCommand).not.toHaveBeenCalled();
    expect(fixture.mkdtempSync).not.toHaveBeenCalled();
  });


  it('registers the required production env-backed smoke queue', () => {
    const manifest = JSON.parse(fs.readFileSync(
      new URL('../../steering/manifest.json', import.meta.url),
      'utf8',
    ));
    const validation = manifest.validations.find(({ id }) => id === 'repository.nmg-sdlc-smoke');

    expect(validation).toEqual({
      id: 'repository.nmg-sdlc-smoke',
      provider: 'project.nmg-sdlc-smoke',

      required: true,
      when: { kind: 'always' },
      config: { issuesEnv: 'NMG_SDLC_SMOKE_ISSUES' },
    });
    expect(validation.config).not.toHaveProperty('issues');
  });
  it('keeps the real outer identity and stable lookup key unchanged by external persistence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-smoke-identity-'));
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-smoke-store-'));
    commandFixtures.push({ root, marker: path.join(root, 'absent-marker') });
    commandFixtures.push({ root: storeRoot, marker: path.join(storeRoot, 'absent-marker') });
    const specPath = 'specs/379-fixture';
    fs.mkdirSync(path.join(root, specPath), { recursive: true });
    const documents = {
      'design.md': '**Issue**: #379\nDesign\n',
      'feature.gherkin': '**Issue**: #379\nFeature: fixture\n',
      'requirements.md': '**Issue**: #379\nRequirements\n',
      'tasks.md': '**Issue**: #379\nTasks\n',
    };
    for (const [name, content] of Object.entries(documents)) {
      fs.writeFileSync(path.join(root, specPath, name), content);
    }
    for (const args of [
      ['init', '-q'],
      ['config', 'user.email', 'test@example.com'],
      ['config', 'user.name', 'Test'],
      ['add', '.'],
      ['commit', '-qm', 'fixture'],
    ]) expect(spawnSync('git', args, { cwd: root }).status).toBe(0);
    const headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const specHash = `sha256:${createHash('sha256').update(
      ['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md']
        .map((name) => `${name}\0${fs.readFileSync(path.join(root, specPath, name))}`).join('\0'),
    ).digest('hex')}`;
    const identity = {
      headSha,
      treeState: 'clean',
      dirtyDiffHash: null,
      specHash,
      steeringHash: 'sha256:steering',
      validationConfigHash: 'sha256:validation',
    };
    const verification = { runId: 'outer-run', issue: 379, specPath };
    const beforeStatus = spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root }).stdout;
    const before = resolveSmokeRecoveryScope({ projectRoot: root, identity, verification });
    const store = createSmokeRecoveryStore({ root: storeRoot });
    store.write(before.recoveryKey, { schemaVersion: 1, recoveryKey: before.recoveryKey, audit: identity });
    const persistedStatus = spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root }).stdout;
    fs.writeFileSync(path.join(root, specPath, 'verification-report.md'), 'failed verification\n');
    const after = resolveSmokeRecoveryScope({
      projectRoot: root,
      identity: { ...identity, treeState: 'dirty', dirtyDiffHash: 'sha256:failed-report' },
      verification,
    });
    const afterStatus = spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root }).stdout;

    expect(after).toEqual(before);
    expect(persistedStatus).toEqual(beforeStatus);
    expect(afterStatus).not.toEqual(beforeStatus);
    expect(String(afterStatus)).toContain('verification-report.md');
    expect(after.recoveryKey).toBe(before.recoveryKey);
    expect(store.read(after.recoveryKey)).toMatchObject({ audit: identity });
    expect(path.relative(root, storeRoot).startsWith('..')).toBe(true);
  });

  it('preserves another writer lock until its owner releases it', async () => {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-smoke-lock-'));
    commandFixtures.push({ root: storeRoot, marker: path.join(storeRoot, 'absent-marker') });
    const key = 'c'.repeat(64);
    const lockPath = path.join(storeRoot, `${key}.json.lock`);
    const releasePath = path.join(storeRoot, 'release-owner');
    const moduleUrl = new URL('../../steering/extensions/nmg-sdlc-smoke.mjs', import.meta.url).href;
    const owner = spawn(process.execPath, ['-e', `
      const fs = require('node:fs');
      (async () => {
        const { createSmokeRecoveryStore } = await import(${JSON.stringify(moduleUrl)});
        const store = createSmokeRecoveryStore({ root: ${JSON.stringify(storeRoot)} });
        store.write(${JSON.stringify(key)}, {
          toJSON() {
            process.stdout.write('locked\\n');
            const wait = new Int32Array(new SharedArrayBuffer(4));
            while (!fs.existsSync(${JSON.stringify(releasePath)})) Atomics.wait(wait, 0, 0, 10);
            return { schemaVersion: 1, recoveryKey: ${JSON.stringify(key)}, owner: true };
          },
        });
      })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    `], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve, reject) => {
      owner.once('error', reject);
      owner.stdout.once('data', resolve);
    });

    const firstContender = createSmokeRecoveryStore({ root: storeRoot });
    const secondContender = createSmokeRecoveryStore({ root: storeRoot });
    const value = { schemaVersion: 1, recoveryKey: key, replacement: true };
    try {
      expect(() => firstContender.write(key, value)).toThrow(/EEXIST/);
      expect(fs.existsSync(lockPath)).toBe(true);
      expect(() => secondContender.write(key, value)).toThrow(/EEXIST/);
      expect(fs.existsSync(lockPath)).toBe(true);
    } finally {
      const ownerExit = new Promise((resolve) => owner.once('exit', resolve));
      fs.writeFileSync(releasePath, 'release');
      expect(await ownerExit).toBe(0);
    }

    expect(fs.existsSync(lockPath)).toBe(false);
    expect(firstContender.read(key)).toMatchObject({ owner: true });
    firstContender.write(key, value, { replace: true });
    expect(firstContender.read(key)).toEqual(value);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('accepts only a current deterministic verification artifact on a recovered main checkout', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-smoke-verification-'));
    commandFixtures.push({ root, marker: path.join(root, 'absent-marker') });
    const directory = path.join(root, '.omp/sdlc/verification');
    fs.mkdirSync(directory, { recursive: true });
    const verifiedHead = '23f5f71'.padEnd(40, '0');
    const finalHead = '044365a'.padEnd(40, '0');
    const artifactPath = path.join(directory, '7.json');
    const artifact = {
      schemaVersion: 1,
      issue: 7,
      ceiling: null,
      coverage: { complete: true },
      identity: { headSha: verifiedHead },
      results: [{ required: true, applicable: true, effectiveStatus: 'passed' }],
    };
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    const recovered = { issue: 7, runId: 'nested-run', pullRequest: 7, headSha: finalHead };
    const immutable = { ...recovered, headSha: verifiedHead };

    expect(inspectRecoveredVerificationEvidence(fs.readFileSync, root, recovered, immutable)).toBe(true);
    fs.writeFileSync(artifactPath, JSON.stringify({
      ...artifact,
      identity: { headSha: finalHead },
    }));
    expect(inspectRecoveredVerificationEvidence(fs.readFileSync, root, recovered, immutable)).toBe(false);
    fs.rmSync(artifactPath);
    expect(inspectRecoveredVerificationEvidence(fs.readFileSync, root, recovered, immutable)).toBe(false);
  });

  it.each([
    undefined,
    {},
    { issues: [] },
    { issues: ['7'] },
    { issues: [0] },
    { issues: [7, 7] },
    { issues: [Number.MAX_SAFE_INTEGER + 1] },
  ])('fails invalid explicit issue config %# before cloning', async (config) => {
    const fixture = harness({ config });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome).toMatchObject({ status: 'failed', summary: 'nmg-sdlc-smoke issues config invalid' });
    expect(fixture.mkdtempSync).not.toHaveBeenCalled();
    expect(fixture.runCommand).not.toHaveBeenCalled();
  });

  it('resolves a fresh explicit queue from the configured environment variable', async () => {
    const fixture = harness({
      config: { issuesEnv: 'NMG_SDLC_SMOKE_ISSUES' },
      env: { ...VALID_ENV, NMG_SDLC_SMOKE_ISSUES: '#11, 12' },
    });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome.status).toBe('passed');
    const execute = fixture.calls.find((call) => call.program === process.execPath);
    expect(execute.args).toEqual([path.join(SOURCE_ROOT, 'scripts/sdlc-execute.mjs'), 'run', '#11', '#12']);
  });

  it('fails when the reusable queue environment variable is absent or invalid', async () => {
    for (const value of [undefined, '', '#7 nope', '#7,7']) {
      const env = { ...VALID_ENV };
      if (value !== undefined) env.NMG_SDLC_SMOKE_ISSUES = value;
      const fixture = harness({ config: { issuesEnv: 'NMG_SDLC_SMOKE_ISSUES' }, env });
      await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
        status: 'failed',
        summary: 'nmg-sdlc-smoke issues config invalid',
      });
      expect(fixture.runCommand).not.toHaveBeenCalled();
    }
  });

  it('rejects a bare outer NMG_SDLC_SMOKE_OWNED bypass', async () => {
    const fixture = harness({ env: { ...VALID_ENV, NMG_SDLC_SMOKE_OWNED: '1' } });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome).toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke outer ownership bypass rejected',
    });
    expect(fixture.mkdtempSync).not.toHaveBeenCalled();
    expect(fixture.runCommand).not.toHaveBeenCalled();
  });

  it('suppresses recursion only with the separately validated provider token', async () => {
    const fixture = harness({
      env: {
        ...VALID_ENV,
        NMG_SDLC_SMOKE_OWNED: '1',
        NMG_SDLC_SMOKE_RECOVERY: `${'b'.repeat(64)}.${'c'.repeat(64)}`,
      },
      validateNestedOwnership: () => ({ pluginRoot: path.resolve(SOURCE_ROOT) }),
    });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome).toMatchObject({
      status: 'passed',
      summary: 'nmg-sdlc-smoke nested execution blocked (satisfied by enclosing owned delivery)',
    });
    expect(fixture.mkdtempSync).not.toHaveBeenCalled();
    expect(fixture.calls).toEqual([
      expect.objectContaining({ program: 'git', args: ['remote', 'get-url', 'origin'] }),
    ]);
  });

  it('validates the propagated token from the outer invocation without reading nested run state', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-smoke-owner-'));
    commandFixtures.push({ root, marker: path.join(root, 'absent-marker') });
    fs.mkdirSync(path.join(root, '.omp/sdlc'), { recursive: true });
    fs.writeFileSync(path.join(root, '.omp/sdlc/run.json'), JSON.stringify({
      schemaVersion: 1,
      projectRoot: fs.realpathSync(root),
      runId: 'nested-run',
      issues: [7],
      currentIssue: 7,
      currentStep: 'verify',
    }));
    const key = 'b'.repeat(64);
    const secret = 'c'.repeat(64);
    const store = memoryRecoveryStore(new Map([[
      key,
      {
        schemaVersion: 1,
        recoveryKey: key,
        tokenSecret: secret,
        clonePath: path.resolve(root),
        issues: [7],
        phase: 'running',
        nestedRunId: null,
      },
    ]]));
    const request = { projectRoot: root };

    expect(validNestedOwnership(store, `${key}.${secret}`, request, [7])).toMatchObject({
      nestedRunId: key,
    });
    expect(store.read(key)).toMatchObject({ nestedRunId: key });
    expect(validNestedOwnership(store, `${key}.${'d'.repeat(64)}`, request, [7])).toBeNull();
    expect(validNestedOwnership(store, `${key}.${secret}`, request, [8])).toBeNull();
  });

  it('accepts only the invocation-bound pre-merge receipt for retained delivery', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-smoke-receipt-'));
    commandFixtures.push({ root, marker: path.join(root, 'absent-marker') });
    const receipt = path.join(root, '.omp/sdlc/smoke-deliveries/7.json');
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    const expected = {
      issue: 7, invocationId: TEST_SCOPE.recoveryKey, pullRequest: 7, headSha: '7'.repeat(40),
    };
    const writeProof = (changes = {}) => fs.writeFileSync(receipt, JSON.stringify({
      schemaVersion: 1, ...expected, recordedBeforeMerge: true, ...changes,
    }));
    writeProof();
    expect(inspectRecoveredDeliveryHandoff(fs.readFileSync, root, expected)).toBe(true);
    for (const changes of [
      { invocationId: 'a'.repeat(64) },
      { pullRequest: 8 },
      { headSha: '8'.repeat(40) },
      { recordedBeforeMerge: false },
    ]) {
      writeProof(changes);
      expect(inspectRecoveredDeliveryHandoff(fs.readFileSync, root, expected)).toBe(false);
    }
    fs.rmSync(receipt);
    expect(inspectRecoveredDeliveryHandoff(fs.readFileSync, root, expected)).toBe(false);
  });

  it('fails closed when Herdr context or GitHub auth is missing', async () => {
    const noHerdr = harness({ env: {} });
    await expect(noHerdr.provider(noHerdr.request)).resolves.toMatchObject({ status: 'failed', summary: expect.stringContaining('Herdr') });
    expect(noHerdr.mkdtempSync).not.toHaveBeenCalled();

    const noAuth = harness({ override: (program, args) => program === 'gh' && args[0] === 'auth' ? result(1, '', { stderr: 'not logged in' }) : null });
    await expect(noAuth.provider(noAuth.request)).resolves.toMatchObject({ status: 'failed', summary: expect.stringContaining('auth') });
    expect(noAuth.mkdtempSync).not.toHaveBeenCalled();
  });

  it('retains clones rejected by origin or dirty-tree policy', async () => {
    const wrongOrigin = harness({ override: (program, args) => program === 'git' && args[0] === 'remote' ? result(0, 'https://github.com/example/other.git\n') : null });
    const originOutcome = await wrongOrigin.provider(wrongOrigin.request);
    expect(originOutcome).toMatchObject({ status: 'failed', summary: expect.stringContaining('origin not allowlisted') });
    expect(retained(originOutcome)).toBe(true);
    expect(wrongOrigin.rmSync).not.toHaveBeenCalled();

    const dirty = harness({ override: (program, args) => program === 'git' && args[0] === 'status' ? result(0, ' M README.md\n') : null });
    const dirtyOutcome = await dirty.provider(dirty.request);
    expect(dirtyOutcome).toMatchObject({ status: 'failed', summary: expect.stringContaining('clone dirty') });
    expect(retained(dirtyOutcome)).toBe(true);
    expect(dirty.rmSync).not.toHaveBeenCalled();
  });

  it('classifies clone launch failure as incomplete and retains the clone', async () => {
    const fixture = harness({ override: (program, args) => program === 'git' && args[0] === 'clone'
      ? result(null, '', { reasonCode: 'launch_failed', error: new Error('spawn failed') })
      : null });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome).toMatchObject({ status: 'incomplete', summary: expect.stringContaining('launch_failed') });
    expect(retained(outcome)).toBe(true);
    expect(fixture.rmSync).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'process_lost'])('classifies execute %s as incomplete and retains the clone', async (reasonCode) => {
    const fixture = harness({ override: (program) => program === process.execPath
      ? result(null, '', { reasonCode })
      : null });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome).toMatchObject({ status: 'incomplete', summary: expect.stringContaining(reasonCode) });
    expect(retained(outcome)).toBe(true);
    expect(fixture.rmSync).not.toHaveBeenCalled();
  });

  (process.platform === 'win32' ? it.skip : it).each(['SIGKILL', 'cancel', 'denied'])(
    'settles real smoke command descendant cleanup truthfully on %s and retains evidence',
    async (mode) => {
      const fixture = commandFixture();
      fixture.foreign = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        detached: true, stdio: 'ignore',
      });
      const controller = new AbortController();
      const provider = createSmokeProvider({
        env: {
          ...process.env, ...VALID_ENV,
          NMG_SDLC_PLUGIN_ROOT: fixture.root,
          PATH: `${path.join(fixture.root, 'bin')}${path.delimiter}${process.env.PATH}`,
        },
        mkdtempSync: () => fixture.work,
        recoveryStore: memoryRecoveryStore(),
        resolveOuterScope: () => TEST_SCOPE,
      });
      const pending = provider({
        projectRoot: fixture.root, config: { issues: [7] },
        identity: { headSha: 'fixture-head' }, signal: controller.signal,
      });
      await until(() => fs.existsSync(fixture.marker), 'the owned smoke command starting its descendant');
      const tree = JSON.parse(fs.readFileSync(fixture.marker, 'utf8'));
      if (mode === 'denied') {
        const kill = process.kill;
        jest.spyOn(process, 'kill').mockImplementation((pid, signal) => {
          if (pid === -tree.pid) throw Object.assign(new Error('fixture group termination denied'), { code: 'EPERM' });
          return kill(pid, signal);
        });
      }
      if (mode === 'cancel') controller.abort();
      else process.kill(tree.pid, 'SIGKILL');
      const outcome = await pending;
      expect(outcome.status).toBe(mode === 'SIGKILL' ? 'failed' : 'incomplete');
      expect(retained(outcome)).toBe(true);
      expect(fs.existsSync(fixture.work)).toBe(true);
      if (mode === 'denied') {
        expect(outcome.summary).toContain('cleanup_failed');
        expect(outcome.evidence).toContainEqual(expect.objectContaining({
          kind: 'command', stderr: 'fixture group termination denied',
        }));
        expect(alive(tree.descendant)).toBe(true);
      } else {
        expect(outcome.evidence).toContainEqual(expect.objectContaining({
          kind: 'command', stdout: 'owned command stdout\n', stderr: 'owned command stderr\n',
        }));
        await until(() => !alive(tree.descendant), 'the owned smoke descendant exiting before teardown');
      }
      expect(alive(fixture.foreign.pid)).toBe(true);
    },
    20_000,
  );

  it('runs the explicit issue queue once in order without picker or ad-hoc writes', async () => {
    const fixture = harness();
    const outcome = await fixture.provider(fixture.request);
    const executeCalls = fixture.calls.filter((call) => call.program === process.execPath);


    expect(outcome.status).toBe('passed');
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]).toMatchObject({
      args: [path.join(SOURCE_ROOT, 'scripts/sdlc-execute.mjs'), 'run', '#7', '#9'],
      options: {
        cwd: '/tmp/nmg-sdlc-smoke-fixture',
        env: expect.objectContaining({
          NMG_SDLC_SMOKE_OWNED: '1',
          NMG_SDLC_SMOKE_RECOVERY: expect.stringMatching(/^[0-9a-f]{64}\.[0-9a-f]{64}$/),
        }),
      },
    });
    const persisted = fixture.states.get(fixture.scope.recoveryKey);
    expect(executeCalls[0].options.env.NMG_SDLC_SMOKE_RECOVERY).toBe(
      `${fixture.scope.recoveryKey}.${persisted.tokenSecret}`,
    );
    const rendered = fixture.calls.map((call) => call.args.join(' ')).join('\n');
    expect(rendered).not.toContain('list-specified');
    expect(rendered).not.toContain('issue create');
    expect(rendered).not.toContain('sdlc-status');
  });
  it('rejects a runId-only receipt even when a nested run file exists', async () => {
    const fixture = harness({ config: { issues: [7] } });
    const baseRead = fixture.readFileSync.getMockImplementation();
    fixture.readFileSync.mockImplementation((file) => String(file).includes('/smoke-deliveries/')
      ? JSON.stringify({
        schemaVersion: 1, issue: 7, runId: 'fabricated-run', pullRequest: 7,
        headSha: fixture.deliveryHead(7), recordedBeforeMerge: true,
      })
      : baseRead(file));
    await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke issue #7 missing invocation delivery proof',
    });
  });

  it('rejects a receipt from another invocation despite matching issue, PR and head', async () => {
    const fixture = harness({ config: { issues: [7] } });
    const baseRead = fixture.readFileSync.getMockImplementation();
    fixture.readFileSync.mockImplementation((file) => String(file).includes('/smoke-deliveries/')
      ? JSON.stringify({
        schemaVersion: 1, issue: 7, invocationId: 'a'.repeat(64), pullRequest: 7,
        headSha: fixture.deliveryHead(7), recordedBeforeMerge: true,
      })
      : baseRead(file));
    await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke completed invocation run identity mismatch',
    });
  });

  it('does not accept status-only output as delivery proof', async () => {
    const fixture = harness({ override: (program) => (
      program === process.execPath
        ? result(0, JSON.stringify({ nextAction: { command: '/sdlc-draft-issue' } }))
        : null
    ) });
    fixture.readFileSync.mockReturnValue('{}');
    const outcome = await fixture.provider(fixture.request);

    expect(outcome.status).toBe('failed');
    expect(outcome.summary).toContain('missing invocation delivery proof');
    expect(retained(outcome)).toBe(true);
    expect(fixture.rmSync).not.toHaveBeenCalled();
  });

  it('persists terminal proof, deletes the clone, and replays the same result without a new queue', async () => {
    const fixture = harness();
    const outcome = await fixture.provider(fixture.request);

    expect(outcome.status).toBe('passed');
    expect(outcome.evidence.filter((item) => item.kind === 'github')).toHaveLength(2);
    for (const issue of [7, 9]) {
      expect(outcome.evidence).toContainEqual(expect.objectContaining({
        summary: expect.stringMatching(new RegExp(`issue #${issue} .* CLOSED; PR .* MERGED at .+`)),
      }));
    }
    expect(fixture.rmSync).toHaveBeenCalledWith('/tmp/nmg-sdlc-smoke-fixture', { recursive: true, force: true });

    const repeated = await fixture.provider(fixture.request);
    expect(repeated.status).toBe('passed');
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
    expect(fixture.mkdtempSync).toHaveBeenCalledTimes(1);
    expect(fixture.rmSync).toHaveBeenCalledTimes(1);
    expect(fixture.states.get(fixture.scope.recoveryKey)).toMatchObject({
      phase: 'terminal',
      validationId: 'repository.nmg-sdlc-smoke',
      validationConfig: { issues: [7, 9] },
      accepted: [
        { issue: 7, invocationId: fixture.scope.recoveryKey, pullRequest: 7, headSha: fixture.deliveryHead(7) },
        { issue: 9, invocationId: fixture.scope.recoveryKey, pullRequest: 9, headSha: fixture.deliveryHead(9) },
      ],
    });
  });

  it('revalidates terminal proof after an approved provider-only head advance', async () => {
    const storedHead = 'a'.repeat(40);
    const currentHead = 'b'.repeat(40);
    const scope = {
      ...TEST_SCOPE,
      specPath: 'specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch',
    };
    const changedPaths = [
      'CHANGELOG.md',
      'scripts/__tests__/nmg-sdlc-smoke.test.mjs',
      'steering/extensions/nmg-sdlc-smoke.mjs',
      `${scope.specPath}/design.md`,
      `${scope.specPath}/feature.gherkin`,
      `${scope.specPath}/requirements.md`,
      `${scope.specPath}/tasks.md`,
    ];
    const fixture = harness({
      config: { issues: [7] },
      scope,
      override: (program, args) => {
        if (program === 'git' && args[0] === 'merge-base') return result();
        if (program === 'git' && args[0] === 'diff') return result(0, `${changedPaths.join('\0')}\0`);
        return null;
      },
    });
    expect((await fixture.provider(fixture.request)).status).toBe('passed');
    const terminalBefore = structuredClone(fixture.states.get(scope.recoveryKey));
    expect(terminalBefore.outerIdentity.headSha).toBe(storedHead);
    const executeCalls = fixture.calls.filter((call) => call.program === process.execPath).length;
    const remoteProofCalls = fixture.calls.filter((call) => call.program === 'gh' && call.args[0] === 'api').length;
    fixture.request.identity = {
      ...fixture.request.identity,
      headSha: currentHead,
      specHash: 'sha256:advanced-spec',
      steeringHash: 'sha256:advanced-steering',
    };

    const advanced = await fixture.provider(fixture.request);

    expect(advanced.status).toBe('passed');
    const terminalAfter = fixture.states.get(scope.recoveryKey);
    expect(terminalAfter.outerIdentity).toEqual(terminalBefore.outerIdentity);
    expect(terminalAfter.accepted).toEqual(terminalBefore.accepted);
    expect(terminalAfter.validationHead).toBe(currentHead);
    expect(terminalAfter.validationIdentity).toEqual({
      headSha: currentHead,
      specHash: 'sha256:advanced-spec',
      steeringHash: 'sha256:advanced-steering',
      validationConfigHash: fixture.request.identity.validationConfigHash,
    });
    expect((await fixture.provider(fixture.request)).status).toBe('passed');
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(executeCalls);
    expect(fixture.calls.filter((call) => call.program === 'git' && call.args[0] === 'merge-base')).toHaveLength(2);
    expect(fixture.calls.filter((call) => call.program === 'git' && call.args[0] === 'diff')).toHaveLength(2);
    expect(fixture.calls.filter((call) => call.program === 'gh' && call.args[0] === 'api')).toHaveLength(remoteProofCalls + 2);
  });

  it.each([
    ['ancestry', 'scripts/__tests__/nmg-sdlc-smoke.test.mjs'],
    ['changed path', 'scripts/sdlc-execute.mjs'],
  ])('rejects a same-head terminal replay after %s evidence changes', async (tamper, replayPath) => {
    const currentHead = 'b'.repeat(40);
    const scope = {
      ...TEST_SCOPE,
      specPath: 'specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch',
    };
    let replay = false;
    const fixture = harness({
      config: { issues: [7] },
      scope,
      override: (program, args) => {
        if (program === 'git' && args[0] === 'merge-base') {
          return result(replay && tamper === 'ancestry' ? 1 : 0);
        }
        if (program === 'git' && args[0] === 'diff') {
          const changedPath = replay ? replayPath : 'scripts/__tests__/nmg-sdlc-smoke.test.mjs';
          return result(0, `${changedPath}\0`);
        }
      },
    });
    expect((await fixture.provider(fixture.request)).status).toBe('passed');
    fixture.request.identity = {
      ...fixture.request.identity,
      headSha: currentHead,
      specHash: 'sha256:advanced-spec',
      steeringHash: 'sha256:advanced-steering',
    };
    expect((await fixture.provider(fixture.request)).status).toBe('passed');
    const terminalAfterAdvance = structuredClone(fixture.states.get(scope.recoveryKey));
    replay = true;

    expect((await fixture.provider(fixture.request)).status).toBe('failed');
    expect(fixture.states.get(scope.recoveryKey)).toEqual(terminalAfterAdvance);
  });

  it.each([
    ['non-ancestor head', null, 1],
    ['controller path', 'scripts/sdlc-execute.mjs', 0],
    ['delivery path', 'scripts/sdlc-deliver.mjs', 0],
    ['workflow path', 'workflows/verify-code/WORKFLOW.md', 0],
    ['unapproved consumer-facing path', 'README.md', 0],
  ])('rejects terminal proof advancement with %s', async (_case, changedPath, ancestryStatus) => {
    const currentHead = 'b'.repeat(40);
    const scope = {
      ...TEST_SCOPE,
      specPath: 'specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch',
    };
    const fixture = harness({
      config: { issues: [7] },
      scope,
      override: (program, args) => {
        if (program === 'git' && args[0] === 'merge-base') return result(ancestryStatus);
        if (program === 'git' && args[0] === 'diff') return result(0, `${changedPath}\0`);
        return null;
      },
    });
    expect((await fixture.provider(fixture.request)).status).toBe('passed');
    const terminalBefore = structuredClone(fixture.states.get(scope.recoveryKey));
    const executeCalls = fixture.calls.filter((call) => call.program === process.execPath).length;
    const remoteProofCalls = fixture.calls.filter((call) => call.program === 'gh' && call.args[0] === 'api').length;
    fixture.request.identity = {
      ...fixture.request.identity,
      headSha: currentHead,
      specHash: 'sha256:advanced-spec',
      steeringHash: 'sha256:advanced-steering',
    };

    const rejected = await fixture.provider(fixture.request);

    expect(rejected.status).toBe('failed');
    expect(fixture.states.get(scope.recoveryKey)).toEqual(terminalBefore);
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(executeCalls);
    expect(fixture.calls.filter((call) => call.program === 'gh' && call.args[0] === 'api')).toHaveLength(remoteProofCalls);
  });


  it('continues a nonzero execute through exact same-invocation remote proof', async () => {
    const fixture = harness({
      config: { issues: [7] },
      runPresence: 'valid',
      override: (program) => program === process.execPath ? result(1) : null,
    });

    const outcome = await fixture.provider(fixture.request);
    expect(outcome.status).toBe('passed');
    expect(outcome.evidence).toContainEqual(expect.objectContaining({
      kind: 'github',
      summary: expect.stringContaining('PR https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/7 MERGED'),
    }));
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
  });

  it('accepts exact multi-issue nonzero proof without a nested run ledger', async () => {
    const fixture = harness({
      config: { issues: [7, 9] },
      runPresence: 'valid',
      override: (program) => program === process.execPath ? result(1) : null,
    });

    const outcome = await fixture.provider(fixture.request);
    expect(outcome.status).toBe('passed');
    expect(outcome.evidence.filter((item) => item.kind === 'github')).toHaveLength(2);
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
  });

  it('reuses a retained invocation receipt after remote merge without relaunching the queue', async () => {
    let merged = false;
    const fixture = harness({
      config: { issues: [7] },
      override: (program, args, _options, calls) => {
        if (program === process.execPath) return result(1);
        if (program === 'gh' && args[0] === 'api'
          && !merged && calls.some((call) => call.program === process.execPath)) {
          return result(0, JSON.stringify({ data: { repository: { issue: {
            state: 'OPEN',
            url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/7',
            closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false } },
          } } } }));
        }
        return null;
      },
    });
    const initial = await fixture.provider(fixture.request);
    expect(initial.status).toBe('failed');
    expect(initial.summary).toContain('not CLOSED');
    merged = true;
    const recovered = await fixture.provider(fixture.request);
    expect(recovered.status).toBe('passed');
    expect(recovered.evidence).toContainEqual(expect.objectContaining({
      kind: 'github',
      summary: expect.stringContaining('MERGED'),
    }));
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
    expect(fixture.mkdtempSync).toHaveBeenCalledTimes(1);
  });

  it('relaunches a receipt-less failure only after the plugin candidate changes', async () => {
    const candidate = { value: '1'.repeat(40) };
    let launches = 0;
    const fixture = harness({
      config: { issues: [7] },
      candidate,
      readFile: () => { throw Object.assign(new Error('missing receipt'), { code: 'ENOENT' }); },
      override: (program) => {
        if (program === process.execPath) {
          launches += 1;
          return result(1, '', { stderr: 'pane_layout_unavailable' });
        }
        return null;
      },
    });
    expect(await fixture.provider(fixture.request)).toMatchObject({ status: 'failed' });
    expect(await fixture.provider(fixture.request)).toMatchObject({ status: 'failed' });
    expect(launches).toBe(1);
    candidate.value = '2'.repeat(40);
    expect(await fixture.provider(fixture.request)).toMatchObject({ status: 'failed' });
    expect(launches).toBe(2);
    expect(fixture.states.get(fixture.scope.recoveryKey)).toMatchObject({ candidateTree: '2'.repeat(40) });
    fixture.request.identity = { ...fixture.request.identity, steeringHash: 'sha256:changed-provider' };
    expect(await fixture.provider(fixture.request)).toMatchObject({ status: 'failed' });
    expect(launches).toBe(3);
  });

  it('retries only cleanup after terminal proof was persisted', async () => {
    const fixture = harness();
    fixture.rmSync
      .mockImplementationOnce(() => { throw new Error('cleanup denied'); })
      .mockImplementationOnce(() => undefined);

    const first = await fixture.provider(fixture.request);
    expect(first).toMatchObject({ status: 'incomplete', summary: 'nmg-sdlc-smoke cleanup_failed' });
    expect(fixture.states.get(fixture.scope.recoveryKey).phase).toBe('cleanup_pending');

    const second = await fixture.provider(fixture.request);
    expect(second.status).toBe('passed');
    expect(fixture.states.get(fixture.scope.recoveryKey).phase).toBe('terminal');
    expect(fixture.rmSync).toHaveBeenCalledTimes(2);
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
    expect(fixture.mkdtempSync).toHaveBeenCalledTimes(1);
  });

  it('keeps cleanup pending across repeated cleanup failures without executing again', async () => {
    const fixture = harness();
    fixture.rmSync.mockImplementation(() => { throw new Error('cleanup denied'); });

    expect((await fixture.provider(fixture.request)).status).toBe('incomplete');
    expect((await fixture.provider(fixture.request)).status).toBe('incomplete');
    expect(fixture.states.get(fixture.scope.recoveryKey).phase).toBe('cleanup_pending');
    expect(fixture.rmSync).toHaveBeenCalledTimes(2);
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
    expect(fixture.mkdtempSync).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['accepted duplicate', (state) => { state.accepted = [state.accepted[0], state.accepted[0]]; }],
    ['accepted head', (state) => { state.accepted[0].headSha = 'f'.repeat(40); }],
    ['terminal baseline', (state) => { state.baselines = []; }],
  ])('rejects terminal %s tampering without clone or queue recreation', async (_name, mutate) => {
    const fixture = harness();
    expect((await fixture.provider(fixture.request)).status).toBe('passed');
    mutate(fixture.states.get(fixture.scope.recoveryKey));

    expect((await fixture.provider(fixture.request)).status).toBe('failed');
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
    expect(fixture.mkdtempSync).toHaveBeenCalledTimes(1);
    expect(fixture.rmSync).toHaveBeenCalledTimes(1);
  });

  it('rejects a nonzero execute exit when invocation delivery proof is missing', async () => {
    const fixture = harness({ override: (program) => (
      program === process.execPath ? result(1, '', { stderr: 'controller failed' }) : null
    ) });
    fixture.readFileSync.mockReturnValue('{}');
    const outcome = await fixture.provider(fixture.request);

    expect(outcome.status).toBe('failed');
    expect(outcome.summary).toContain('execute exited 1');
    expect(retained(outcome)).toBe(true);
    expect(fixture.rmSync).not.toHaveBeenCalled();
  });

  it('rejects a pre-existing closing PR and requires a new exact-head reference', async () => {
    const fixture = harness({ config: { issues: [7] }, override: (program, args) => {
      if (program !== 'gh' || args[0] !== 'api') return null;
      const historical = {
        number: 7,
        state: 'MERGED',
        url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/7',
        headRefOid: '7'.repeat(40),
      };
      return result(0, JSON.stringify({
        data: {
          repository: {
            issue: {
              state: 'CLOSED',
              url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/7',
              closedByPullRequestsReferences: {
                nodes: [historical],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        },
      }));
    } });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome.status).toBe('failed');
    expect(outcome.summary).toContain('missing new exact-head merged PR proof');
    expect(retained(outcome)).toBe(true);
    expect(fixture.rmSync).not.toHaveBeenCalled();
    expect(fixture.calls.some((call) => call.args.includes('linked:issue-7'))).toBe(false);
  });

  it('accepts an open baseline PR only when this invocation merges its receipted exact head', async () => {
    const fixture = harness({ config: { issues: [7] }, override: (program, args, _options, calls) => {
      if (program !== 'gh' || args[0] !== 'api') return null;
      const merged = calls.some((call) => call.program === process.execPath);
      return result(0, JSON.stringify({ data: { repository: { issue: {
        state: merged ? 'CLOSED' : 'OPEN',
        url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/7',
        closedByPullRequestsReferences: { nodes: [{
          number: 7,
          state: merged ? 'MERGED' : 'OPEN',
          url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/7',
          headRefOid: fixture.deliveryHead(7),
        }], pageInfo: { hasNextPage: false } },
      } } } }));
    } });
    const outcome = await fixture.provider(fixture.request);
    expect(outcome.status).toBe('passed');
    expect(fixture.states.get(fixture.scope.recoveryKey).baselines).toEqual([
      expect.objectContaining({ issue: 7, pullRequests: [] }),
    ]);
  });

  it('retains failed proof and never invokes a smoke-project toolchain', async () => {
    const fixture = harness({ override: (program, args, _options, calls) => {
      if (program !== 'gh' || args[0] !== 'api' || !calls.some((call) => call.program === process.execPath)) return null;
      return result(0, JSON.stringify({
        data: {
          repository: {
            issue: {
              state: 'CLOSED',
              url: 'https://example.test/issue',
              closedByPullRequestsReferences: {
                nodes: [],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        },
      }));
    } });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome.status).toBe('failed');
    expect(retained(outcome)).toBe(true);
    expect(fixture.rmSync).not.toHaveBeenCalled();
    expect(fixture.calls.map((call) => call.program)).not.toEqual(expect.arrayContaining(['npm', 'pytest', 'go']));
  });
});
