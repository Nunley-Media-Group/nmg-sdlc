import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectReviewReceipts } from '../../src/sdlc-review-isolation.mjs';
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
    if (text.endsWith('/.omp/sdlc/run.json')) {
      if (options.runPresence !== 'valid' && !options.proofAvailable) {
        throw Object.assign(new Error('missing run'), { code: 'ENOENT' });
      }
      return JSON.stringify({
        schemaVersion: 1,
        projectRoot: '/tmp/nmg-sdlc-smoke-fixture',
        runId: 'nested-run',
        issues: configured,
        currentIssue: configured[0],
        currentStep: 'deliver',
        delivery: {
          issue: configured[0],
          pullRequest: configured[0],
          expectedHead: deliveryHead(configured[0]),
        },
      });
    }
    if (text.includes('/smoke-deliveries/') && options.proofAvailable?.value === false) return '{}';
    const issue = Number(text.match(/\/smoke-deliveries\/(\d+)\.json$/)?.[1]);
    return JSON.stringify({
      schemaVersion: 1,
      runId: 'nested-run',
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
  const scope = TEST_SCOPE;
  const provider = createSmokeProvider({
    runCommand,
    mkdtempSync,
    readFileSync,
    rmSync,
    recoveryStore,
    resolveOuterScope: () => scope,
    validateNestedOwnership: options.validateNestedOwnership ?? (() => null),
    readRecoveryRecord: options.readRecoveryRecord ?? ((_read, _work, runId, issue) => (
      runId === 'nested-run' ? {
        issue,
        runId,
        pullRequest: issue,
        headSha: deliveryHead(issue),
      } : null
    )),
    verifyOptionalHandoff: options.verifyOptionalHandoff ?? (() => true),
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

  it('executes the explicit candidate in clone cwd and inspects its unchanged isolation receipts', async () => {
    const fixture = commandFixture();
    const candidate = path.join(fixture.root, 'candidate');
    fs.mkdirSync(path.join(candidate, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(candidate, 'src'));
    fs.writeFileSync(path.join(candidate, 'package.json'), JSON.stringify({ name: 'nmg-sdlc' }));
    fs.copyFileSync(new URL('../../src/sdlc-review-isolation.mjs', import.meta.url),
      path.join(candidate, 'src/sdlc-review-isolation.mjs'));
    const assignmentPath = path.join(fixture.work, 'assignment.json');
    const receiptPath = path.join(fixture.work, 'access.jsonl');
    fs.writeFileSync(path.join(fixture.work, 'allowed.txt'), 'snapshot\n');
    fs.writeFileSync(assignmentPath, JSON.stringify({
      issue: 7, step: 'review1', sliceId: 'reviewer-1', runId: 'owner',
      invocationId: 'candidate-parity', baseSha: 'base', headSha: 'head',
      specDigest: 'digest', snapshotDir: fixture.work, allowedPaths: ['allowed.txt'],
    }));
    const isolation = await import(pathToFileURL(path.join(candidate, 'src/sdlc-review-isolation.mjs')).href);
    const handlers = new Map();
    let tools = [];
    isolation.installReviewIsolation({
      on: (event, fn) => handlers.set(event, fn),
      setActiveTools: async (names) => { tools = names; },
      getActiveTools: () => tools,
    }, { env: { NMG_SDLC_REVIEW_SLICE: '1', NMG_SDLC_REVIEW_ASSIGNMENT: assignmentPath,
      NMG_SDLC_REVIEW_RECEIPT: receiptPath } });
    await handlers.get('session_start')();
    const receiptBytes = fs.readFileSync(receiptPath);
    expect(inspectReviewReceipts(assignmentPath, receiptPath).reasonCode).toBe('review_scope_unproven');
    fs.writeFileSync(path.join(candidate, 'scripts/sdlc-execute.mjs'), `
      import { inspectReviewReceipts } from '../src/sdlc-review-isolation.mjs';
      const inspection = inspectReviewReceipts(${JSON.stringify(assignmentPath)}, ${JSON.stringify(receiptPath)});
      console.log(JSON.stringify({ controller: import.meta.url, cwd: process.cwd(),
        pluginRoot: process.env.NMG_SDLC_PLUGIN_ROOT, inspection }));
      process.exit(inspection.valid ? 0 : 1);
    `);
    const provider = createSmokeProvider({
      env: { ...process.env, ...VALID_ENV,
        NMG_SDLC_PLUGIN_ROOT: candidate,
        PATH: `${path.join(fixture.root, 'bin')}${path.delimiter}${process.env.PATH}` },
      mkdtempSync: () => fixture.work,
      recoveryStore: memoryRecoveryStore(),
      resolveOuterScope: () => TEST_SCOPE,
    });
    const outcome = await provider({ projectRoot: fixture.root, config: { issues: [7] }, identity: {} });
    const execution = outcome.evidence.find(item => item.summary === 'sdlc-execute run #7');
    expect(JSON.parse(execution.stdout)).toMatchObject({
      controller: pathToFileURL(fs.realpathSync(path.join(candidate, 'scripts/sdlc-execute.mjs'))).href,
      cwd: fs.realpathSync(fixture.work), pluginRoot: candidate,
      inspection: { valid: true, contaminated: false },
    });
    expect(fs.readFileSync(receiptPath)).toEqual(receiptBytes);
    expect(outcome.summary).toContain('missing invocation delivery proof');
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

  it('validates the propagated recovery token against the exact nested run layout', () => {
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
      nestedRunId: 'nested-run',
    });
    expect(store.read(key)).toMatchObject({ nestedRunId: 'nested-run' });
    expect(validNestedOwnership(store, `${key}.${'d'.repeat(64)}`, request, [7])).toBeNull();
    expect(validNestedOwnership(store, `${key}.${secret}`, request, [8])).toBeNull();
  });

  it('uses only an identity-matched recovery session handoff when the root deliver handoff failed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-smoke-session-'));
    commandFixtures.push({ root, marker: path.join(root, 'absent-marker') });
    const sessions = path.join(root, '.omp/sdlc/sessions');
    const writeSession = (token, recoveryOwnerId, status) => {
      const directory = path.join(sessions, token, 'handoffs');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(sessions, token, 'recovery-owner.json'), JSON.stringify({
        projectRoot: fs.realpathSync(root),
        issue: 7,
        step: 'deliver',
        branch: '7-fixture',
        recoveryOwnerId,
      }));
      fs.writeFileSync(path.join(directory, '7-deliver.json'), JSON.stringify({
        schemaVersion: 1,
        issue: 7,
        step: 'deliver',
        status,
        intervention: status !== 'passed',
        summary: status,
        artifacts: ['https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/7'],
        next: null,
        reasonCode: status === 'passed' ? null : 'automatic_review_unactionable',
      }));
    };
    fs.mkdirSync(path.join(root, '.omp/sdlc/handoffs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.omp/sdlc/handoffs/7-deliver.json'), JSON.stringify({
      schemaVersion: 1,
      issue: 7,
      step: 'deliver',
      status: 'failed',
      intervention: true,
      summary: 'automatic review cannot be changed safely',
      artifacts: [],
      next: null,
      reasonCode: 'automatic_review_unactionable',
    }));
    writeSession('matched', 'nested-run', 'passed');
    writeSession('decoy', 'other-run', 'passed');
    const expected = {
      issue: 7,
      runId: 'nested-run',
      pullRequest: 7,
      headSha: '7'.repeat(40),
    };

    expect(inspectRecoveredDeliveryHandoff(fs.readFileSync, root, expected, { required: true })).toBe(true);
    const matched = path.join(sessions, 'matched/handoffs/7-deliver.json');
    fs.writeFileSync(matched, fs.readFileSync(matched, 'utf8').replace('"passed"', '"failed"'));
    expect(inspectRecoveredDeliveryHandoff(fs.readFileSync, root, expected, { required: true })).toBe(false);
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
  it('rejects a fabricated proof runId against a still-present nested run', async () => {
    const fixture = harness({ config: { issues: [7] }, runPresence: 'valid' });
    const baseRead = fixture.readFileSync.getMockImplementation();
    fixture.readFileSync.mockImplementation((file) => {
      if (String(file).includes('/smoke-deliveries/')) {
        return JSON.stringify({
          schemaVersion: 1,
          issue: 7,
          runId: 'fabricated-run',
          pullRequest: 7,
          headSha: fixture.deliveryHead(7),
          recordedBeforeMerge: true,
        });
      }
      return baseRead(file);
    });

    await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke completed invocation run identity mismatch',
    });
  });

  it.each([
    ['absent after cleanup', () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }, 'passed'],
    ['present malformed', () => '{}', 'failed'],
  ])('handles nested run.json %s without trusting stale proof identity', async (_case, runFile, expectedStatus) => {
    const fixture = harness({
      config: { issues: [7] },
      readFile: (file) => {
        const text = String(file);
        if (text.endsWith('/.omp/sdlc/run.json')) return runFile();
        const issue = Number(text.match(/\/smoke-deliveries\/(\d+)\.json$/)?.[1]);
        return JSON.stringify({
          schemaVersion: 1,
          issue,
          runId: 'nested-run',
          pullRequest: issue,
          headSha: fixture.deliveryHead(issue),
          recordedBeforeMerge: true,
        });
      },
    });

    expect((await fixture.provider(fixture.request)).status).toBe(expectedStatus);
  });

  it.each([
    ['missing delivery', (run) => { delete run.delivery; }],
    ['malformed delivery', (run) => { run.delivery = { issue: 7, pullRequest: 0, expectedHead: 'bad' }; }],
  ])('rejects a present nested run with %s instead of falling back to proof files', async (_case, mutate) => {
    const fixture = harness({
      config: { issues: [7] },
      readFile: (file) => {
        const text = String(file);
        if (text.endsWith('/.omp/sdlc/run.json')) {
          const run = {
            schemaVersion: 1,
            projectRoot: '/tmp/nmg-sdlc-smoke-fixture',
            runId: 'nested-run',
            issues: [7],
            currentIssue: 7,
            currentStep: 'deliver',
            delivery: { issue: 7, pullRequest: 7, expectedHead: fixture.deliveryHead(7) },
          };
          mutate(run);
          return JSON.stringify(run);
        }
        return JSON.stringify({
          schemaVersion: 1,
          issue: 7,
          runId: 'nested-run',
          pullRequest: 7,
          headSha: fixture.deliveryHead(7),
          recordedBeforeMerge: true,
        });
      },
    });

    await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke completed invocation run identity invalid',
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
    expect(outcome.summary).toContain('completed invocation run identity invalid');
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
        { issue: 7, runId: 'nested-run', pullRequest: 7, headSha: fixture.deliveryHead(7) },
        { issue: 9, runId: 'nested-run', pullRequest: 9, headSha: fixture.deliveryHead(9) },
      ],
    });
  });

  it('fails first, then accepts only the same retained invocation after exact recovery', async () => {
    const proofAvailable = { value: false };
    const fixture = harness({
      config: { issues: [7] },
      proofAvailable,
      override: (program) => (
        program === process.execPath ? result(1, '', { stderr: 'controller reported a recovered stop' }) : null
      ),
    });

    const initial = await fixture.provider(fixture.request);
    expect(initial).toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke execute exited 1',
    });
    fixture.request.identity = {
      ...fixture.request.identity,
      treeState: 'dirty',
      dirtyDiffHash: 'sha256:failed-report',
    };
    expect(retained(initial)).toBe(true);
    proofAvailable.value = true;
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);

    const recovered = await fixture.provider(fixture.request);
    expect(recovered.status).toBe('passed');
    expect(recovered.evidence.filter((item) => item.kind === 'github')).toHaveLength(1);
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
    expect(fixture.mkdtempSync).toHaveBeenCalledTimes(1);
    expect(fixture.rmSync).toHaveBeenCalledWith('/tmp/nmg-sdlc-smoke-fixture', { recursive: true, force: true });
    const terminal = await fixture.provider(fixture.request);
    expect(terminal.status).toBe('passed');
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
    expect(fixture.mkdtempSync).toHaveBeenCalledTimes(1);
    expect(fixture.rmSync).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ancestor', 0, 'passed'],
    ['non-ancestor', 1, 'failed'],
  ])('requires the original expected head to be an %s of the recovered final head', async (_case, ancestryStatus, expectedStatus) => {
    const expectedHead = '23f5f71'.padEnd(40, '0');
    const finalHead = '044365a'.padEnd(40, '0');
    const proofAvailable = { value: false };
    const fixture = harness({
      config: { issues: [7] },
      proofAvailable,
      override: (program, args, _options, calls) => {
        if (program === process.execPath) return result(1);
        if (program === 'git' && args[0] === 'merge-base'
          && args[2] === expectedHead && args[3] === finalHead) return result(ancestryStatus);
        if (program === 'gh' && args[0] === 'api'
          && calls.some((call) => call.program === process.execPath)) {
          return result(0, JSON.stringify({
            data: { repository: { issue: {
              state: 'CLOSED',
              url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/7',
              closedByPullRequestsReferences: {
                nodes: [{
                  number: 7,
                  state: 'MERGED',
                  url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/7',
                  headRefOid: finalHead,
                }],
                pageInfo: { hasNextPage: false },
              },
            } } },
          }));
        }
        return null;
      },
      readRecoveryRecord: (_read, _work, runId) => ({
        issue: 7,
        runId,
        pullRequest: 7,
        headSha: finalHead,
      }),
      readFile: (file, { configured, deliveryHead }) => {
        const text = String(file);
        if (text.endsWith('/.omp/sdlc/run.json')) {
          return JSON.stringify({
            schemaVersion: 1,
            projectRoot: '/tmp/nmg-sdlc-smoke-fixture',
            runId: 'nested-run',
            issues: configured,
            currentIssue: 7,
            currentStep: 'deliver',
            delivery: { issue: 7, pullRequest: 7, expectedHead },
          });
        }
        const issue = Number(text.match(/\/smoke-deliveries\/(\d+)\.json$/)?.[1]);
        return JSON.stringify({
          schemaVersion: 1,
          issue,
          runId: 'nested-run',
          pullRequest: issue,
          headSha: text.includes('/smoke-deliveries/') ? finalHead : deliveryHead(issue),
          recordedBeforeMerge: true,
        });
      },
    });
    expect((await fixture.provider(fixture.request)).status).toBe('failed');
    proofAvailable.value = true;

    expect((await fixture.provider(fixture.request)).status).toBe(expectedStatus);
    expect(fixture.calls).toContainEqual(expect.objectContaining({
      program: 'git',
      args: ['merge-base', '--is-ancestor', expectedHead, finalHead],
    }));
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
  });

  it.each([
    ['nested run', (state) => { state.nestedRunId = 'other-run'; }],
    ['expected PR', (state) => { state.expected[0].pullRequest = 99; }],
    ['original baseline', (state) => { state.baselines = []; }],
    ['validation id', (state) => { state.validationId = 'other.validation'; }],
    ['validation config', (state) => { state.validationConfig = { issues: [99] }; }],
  ])('rejects recovered %s tampering without launching a replacement', async (_name, mutate) => {
    const proofAvailable = { value: false };
    const fixture = harness({
      config: { issues: [7] },
      override: (program) => program === process.execPath ? result(1) : null,
      proofAvailable,
    });
    expect((await fixture.provider(fixture.request)).status).toBe('failed');
    mutate(fixture.states.get(fixture.scope.recoveryKey));
    proofAvailable.value = true;

    expect((await fixture.provider(fixture.request)).status).toBe('failed');
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
    expect(fixture.mkdtempSync).toHaveBeenCalledTimes(1);
  });

  it('rejects a newly configured issue for the same outer run without replacement', async () => {
    const proofAvailable = { value: false };
    const fixture = harness({
      config: { issues: [7] },
      override: (program) => program === process.execPath ? result(1) : null,
      proofAvailable,
    });
    expect((await fixture.provider(fixture.request)).status).toBe('failed');
    fixture.request.config = { issues: [8] };

    await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke recovery identity mismatch',
    });
    expect(fixture.calls.filter((call) => call.program === process.execPath)).toHaveLength(1);
    expect(fixture.mkdtempSync).toHaveBeenCalledTimes(1);
  });

  it('accepts exact recovery despite the original automatic-review deliver failure handoff', async () => {
    const proofAvailable = { value: false };
    const verifyHandoff = jest.fn((_read, _work, _expected, step) => step === 'verify');
    const fixture = harness({
      config: { issues: [7] },
      override: (program) => program === process.execPath ? result(1) : null,
      verifyOptionalHandoff: verifyHandoff,
      proofAvailable,
    });
    expect((await fixture.provider(fixture.request)).status).toBe('failed');
    proofAvailable.value = true;

    expect((await fixture.provider(fixture.request)).status).toBe('passed');
    expect(verifyHandoff).toHaveBeenCalledTimes(1);
    expect(verifyHandoff).toHaveBeenCalledWith(
      fixture.readFileSync,
      '/tmp/nmg-sdlc-smoke-fixture',
      expect.objectContaining({ issue: 7, runId: 'nested-run' }),
      'verify',
    );
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

  it('persists terminal proof before reporting clone cleanup failure', async () => {
    const fixture = harness();
    fixture.rmSync.mockImplementation(() => { throw new Error('cleanup denied'); });

    const outcome = await fixture.provider(fixture.request);
    expect(outcome).toMatchObject({ status: 'incomplete', summary: 'nmg-sdlc-smoke cleanup_failed' });
    const terminal = fixture.states.get(fixture.scope.recoveryKey);
    expect(terminal.phase).toBe('terminal');
    expect(Array.isArray(terminal.accepted)).toBe(true);
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
