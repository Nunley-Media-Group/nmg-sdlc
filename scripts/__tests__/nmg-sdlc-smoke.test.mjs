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
  inspectLegacySmokeFailure,
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
  const scope = options.scope ?? TEST_SCOPE;
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

function legacyBootstrapFixture(mutateArtifact = () => {}, smokeIssues = '109', fresh = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-smoke-outer-'));
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-smoke-'));
  commandFixtures.push({ root, marker: path.join(root, 'absent-marker') });
  commandFixtures.push({ root: clone, marker: path.join(clone, 'absent-marker') });
  const outerRoot = fs.realpathSync(root);
  const cloneRoot = fs.realpathSync(clone);
  const immutableHead = '23f5f71'.padEnd(40, '0');
  const finalHead = '044365a'.padEnd(40, '0');
  const initialHead = '7f64196'.padEnd(40, '0');
  const nestedRunId = '85bad261-c3e2-4895-a2f9-a52a28a4decd';
  const currentIdentity = {
    headSha: 'b'.repeat(40),
    treeState: 'dirty',
    dirtyDiffHash: 'sha256:current-report',
    specHash: `sha256:${'c'.repeat(64)}`,
    steeringHash: `sha256:${'d'.repeat(64)}`,
    validationConfigHash: `sha256:${'e'.repeat(64)}`,
  };
  const legacyIdentity = {
    headSha: 'b'.repeat(40),
    treeState: 'dirty',
    dirtyDiffHash: 'sha256:legacy-report',
    specHash: `sha256:${'c'.repeat(64)}`,
    steeringHash: `sha256:${'d'.repeat(64)}`,
    validationConfigHash: currentIdentity.validationConfigHash,
  };
  const writeJson = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };
  writeJson(path.join(cloneRoot, '.omp/sdlc/run.json'), {
    schemaVersion: 1,
    projectRoot: cloneRoot,
    runId: nestedRunId,
    issue: 109,
    head: initialHead,
    issues: [109],
    currentIssue: 109,
    currentStep: 'deliver',
    failed: {
      issue: 109,
      step: 'deliver',
      reasonCode: 'automatic_review_unactionable',
    },
    delivery: {
      issue: 109,
      pullRequest: 112,
      expectedHead: immutableHead,
      status: 'expected',
    },
  });
  writeJson(path.join(cloneRoot, '.omp/sdlc/safe-recoveries.json'), {
    schemaVersion: 1,
    records: [{
      class: 'post_merge_observation',
      runId: nestedRunId,
      issue: 109,
      step: 'deliver',
      disposition: 'consumed',
      evidence: { pullRequest: 112, headSha: finalHead },
    }],
  });
  writeJson(path.join(cloneRoot, '.omp/sdlc/verification/109.json'), {
    schemaVersion: 1,
    issue: 109,
    ceiling: null,
    coverage: { complete: true },
    identity: { headSha: immutableHead },
    results: [],
  });
  writeJson(path.join(cloneRoot, '.omp/sdlc/handoffs/109-deliver.json'), {
    schemaVersion: 1,
    issue: 109,
    step: 'deliver',
    status: 'failed',
    intervention: true,
    summary: 'Automatic delivery remediation for #109 is unsafe, unsupported, or unchanged',
    artifacts: [],
    next: null,
    reasonCode: 'automatic_review_unactionable',
  });
  const session = path.join(cloneRoot, '.omp/sdlc/sessions/recovered');
  writeJson(path.join(session, 'recovery-owner.json'), {
    projectRoot: cloneRoot,
    recoveryOwnerId: nestedRunId,
    issue: 109,
    step: 'deliver',
  });
  writeJson(path.join(session, 'handoffs/109-deliver.json'), {
    schemaVersion: 1,
    issue: 109,
    step: 'deliver',
    status: 'passed',
    intervention: false,
    artifacts: ['https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/112'],
    reasonCode: null,
  });
  const baseline = {
    data: {
      repository: {
        issue: {
          state: 'OPEN',
          url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/109',
          closedByPullRequestsReferences: {
            nodes: [],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    },
  };
  const artifact = {
    schemaVersion: 1,
    issue: 379,
    identity: {
      headSha: legacyIdentity.headSha,
      steeringHash: legacyIdentity.steeringHash,
      specHash: legacyIdentity.specHash,
    },
    ceiling: 'Fail',
    coverage: { complete: true },
    results: [{
      id: 'repository.nmg-sdlc-smoke',
      provider: 'project.nmg-sdlc-smoke',
      required: true,
      applicable: true,
      effectiveStatus: 'failed',
      request: {
        schemaVersion: 1,
        validationId: 'repository.nmg-sdlc-smoke',
        projectRoot: outerRoot,
        config: { issuesEnv: 'NMG_SDLC_SMOKE_ISSUES' },
        identity: legacyIdentity,
      },
      result: {
        schemaVersion: 1,
        status: 'failed',
        summary: 'nmg-sdlc-smoke execute exited 1',
        identity: legacyIdentity,
        evidence: [
          {
            kind: 'command',
            summary: 'git clone --single-branch https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git',
            artifact: cloneRoot,
            stdout: '',
            stderr: '',
          },
          {
            kind: 'command',
            summary: 'gh issue closing PR baseline 109',
            artifact: null,
            stdout: JSON.stringify(baseline),
            stderr: '',
          },
          {
            kind: 'command',
            summary: 'sdlc-execute run #109',
            artifact: cloneRoot,
            stdout: 'Stopped on #109 deliver.',
            stderr: '',
          },
          {
            kind: 'artifact',
            summary: 'retained smoke clone',
            artifact: cloneRoot,
          },
        ],
      },
    }],
  };
  mutateArtifact(artifact, { cloneRoot, legacyIdentity });
  writeJson(path.join(outerRoot, '.omp/sdlc/verification/379.json'), artifact);
  const calls = [];
  const runCommand = jest.fn(async (program, args, options = {}) => {
    calls.push({ program, args, options });
    if (program === 'git' && args[0] === 'clone') {
      commandFixtures.push({ root: args.at(-1), marker: path.join(args.at(-1), 'absent-marker') });
      return fresh ? result() : result(1, '', { reasonCode: 'launch_failed' });
    }
    if (fresh && program === 'git' && args[0] === 'status') return result();
    if (fresh && program === 'git' && args[0] === 'rev-parse') return result(0, 'a'.repeat(40));
    if (fresh && program === process.execPath) {
      return result(1, '', { reasonCode: 'launch_failed' });
    }
    if (program === 'gh' && args[0] === 'auth') return result();
    if (program === 'git' && args[0] === 'remote') {
      return result(0, 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git\n');
    }
    if (program === 'git' && args[0] === 'merge-base') return result();
    if (fresh && program === 'gh' && args[0] === 'api') {
      const issue = Number(args.find((arg) => arg.startsWith('number='))?.slice('number='.length));
      return result(0, JSON.stringify({
        data: { repository: { issue: {
          state: 'OPEN',
          url: `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/${issue}`,
          closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false } },
        } } },
      }));
    }
    if (program === 'gh' && args[0] === 'api') {
      return result(0, JSON.stringify({
        data: {
          repository: {
            issue: {
              state: 'CLOSED',
              url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/issues/109',
              closedByPullRequestsReferences: {
                nodes: [{
                  number: 112,
                  state: 'MERGED',
                  url: 'https://github.com/Nunley-Media-Group/nmg-sdlc-smoke/pull/112',
                  headRefOid: finalHead,
                }],
                pageInfo: { hasNextPage: false },
              },
            },
          },
        },
      }));
    }
    throw new Error(`unexpected command: ${program} ${args.join(' ')}`);
  });
  const states = new Map();
  const recoveryStore = memoryRecoveryStore(states);
  const scope = {
    recoveryKey: 'd'.repeat(64),
    projectRoot: outerRoot,
    runId: 'outer-run',
    issue: 379,
    specPath: 'specs/379-fix',
  };
  const request = {
    validationId: 'repository.nmg-sdlc-smoke',
    projectRoot: outerRoot,
    config: { issuesEnv: 'NMG_SDLC_SMOKE_ISSUES' },
    identity: currentIdentity,
    verification: {
      runId: scope.runId,
      issue: scope.issue,
      specPath: scope.specPath,
    },
  };
  const provider = createSmokeProvider({
    runCommand,
    recoveryStore,
    resolveOuterScope: () => scope,
    env: { ...VALID_ENV, NMG_SDLC_SMOKE_ISSUES: smokeIssues },
  });
  return { artifact, calls, cloneRoot, provider, recoveryStore, request, scope, states };
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
    writeSession('duplicate-match', 'nested-run', 'failed');
    expect(inspectRecoveredDeliveryHandoff(fs.readFileSync, root, expected, { required: true })).toBe(false);
    fs.rmSync(path.join(sessions, 'duplicate-match'), { recursive: true, force: true });
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

  it('upgrades the real #379/#109 pre-store failure layout and reconciles the retained invocation', async () => {
    const fixture = legacyBootstrapFixture();
    expect(fs.existsSync(path.join(
      fixture.cloneRoot,
      '.omp/sdlc/smoke-deliveries/109.json',
    ))).toBe(false);

    const outcome = await fixture.provider(fixture.request);

    expect(outcome.status).toBe('passed');
    expect(fixture.calls.some((call) => call.program === process.execPath)).toBe(false);
    expect(fixture.states.get(fixture.scope.recoveryKey)).toMatchObject({
      phase: 'terminal',
      executeStatus: 1,
      nestedRunId: '85bad261-c3e2-4895-a2f9-a52a28a4decd',
      expected: [{
        issue: 109,
        runId: '85bad261-c3e2-4895-a2f9-a52a28a4decd',
        pullRequest: 112,
        headSha: '23f5f71'.padEnd(40, '0'),
      }],
      accepted: [{
        issue: 109,
        runId: '85bad261-c3e2-4895-a2f9-a52a28a4decd',
        pullRequest: 112,
        headSha: '044365a'.padEnd(40, '0'),
      }],
      bootstrap: {
        kind: 'legacy-verification-failure',
        issue: 379,
        deliveryProofRequired: false,
      },
    });
    expect(fs.existsSync(fixture.cloneRoot)).toBe(false);
  });

  it('rejects legacy recovery when only otherwise-valid Markdown verification remains', async () => {
    const fixture = legacyBootstrapFixture((_artifact, { cloneRoot }) => {
      fs.rmSync(path.join(cloneRoot, '.omp/sdlc/verification/109.json'));
      const specPath = 'specs/109-fixture';
      const directory = path.join(cloneRoot, specPath);
      fs.mkdirSync(directory, { recursive: true });
      const scope = {
        issueNumber: 109,
        specPath,
        status: 'scoped',
        delivery: {
          acceptanceCriteria: [],
          functionalRequirements: [],
          tasks: [],
          scenarios: [],
        },
        regression: {
          acceptanceCriteria: [],
          functionalRequirements: [],
          scenarios: [],
        },
      };
      fs.writeFileSync(
        path.join(directory, 'verification-report.md'),
        `# Verification Report\n\n### Implementation Status: Pass\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(scope)} -->\n`,
      );
    });
    const recovered = {
      issue: 109,
      runId: '85bad261-c3e2-4895-a2f9-a52a28a4decd',
      pullRequest: 112,
      headSha: '044365a'.padEnd(40, '0'),
    };
    const immutable = { ...recovered, headSha: '23f5f71'.padEnd(40, '0') };
    expect(inspectRecoveredVerificationEvidence(
      fs.readFileSync,
      fixture.cloneRoot,
      recovered,
      immutable,
    )).toBe(true);
    expect(inspectRecoveredVerificationEvidence(
      fs.readFileSync,
      fixture.cloneRoot,
      recovered,
      immutable,
      { jsonOnly: true },
    )).toBe(false);

    await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke execute exited 1',
    });
    expect(fixture.states.get(fixture.scope.recoveryKey)).toMatchObject({ phase: 'failed' });
    expect(fixture.calls.some((call) => call.program === process.execPath)).toBe(false);
    expect(fs.existsSync(fixture.cloneRoot)).toBe(true);
  });

  it.each([
    ['duplicate retained clones', (artifact) => {
      artifact.results[0].result.evidence.push({
        ...artifact.results[0].result.evidence.at(-1),
      });
    }],
    ['incomplete baseline', (artifact) => {
      artifact.results[0].result.evidence = artifact.results[0].result.evidence
        .filter((item) => item.summary !== 'gh issue closing PR baseline 109');
    }],
    ['ambiguous execute evidence', (artifact) => {
      artifact.results[0].result.evidence.push({
        ...artifact.results[0].result.evidence.find((item) => item.summary === 'sdlc-execute run #109'),
      });
    }],
    ['nonterminal failure', (artifact) => {
      artifact.results[0].result.status = 'incomplete';
    }],
    ['unproved nested delivery', (_artifact, { cloneRoot }) => {
      fs.rmSync(path.join(cloneRoot, '.omp/sdlc/handoffs/109-deliver.json'));
    }],
    ['mismatched config', (artifact) => {
      artifact.results[0].request.config = { issues: [110] };
    }],
    ['tampered outer identity', (artifact) => {
      artifact.identity.specHash = 'sha256:tampered';
    }],
  ])('rejects legacy bootstrap with %s without launching a replacement', async (_name, mutate) => {
    const fixture = legacyBootstrapFixture(mutate);
    expect(inspectLegacySmokeFailure(fs.readFileSync, {
      request: fixture.request,
      scope: fixture.scope,
      issues: [109],
      pluginRoot: SOURCE_ROOT,
    }).presence).toBe('invalid');

    await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke legacy recovery evidence invalid',
    });
    expect(fixture.states.size).toBe(0);
    expect(fixture.calls.some((call) => call.program === process.execPath)).toBe(false);
    expect(fixture.calls.some((call) => call.program === 'git' && call.args[0] === 'clone')).toBe(false);
  });

  it.each([
    ['changed head', '109', (request) => { request.identity.headSha = 'c'.repeat(40); }],
    ['changed spec', '109', (request) => { request.identity.specHash = 'sha256:new-spec'; }],
    ['changed steering', '109', (request) => { request.identity.steeringHash = 'sha256:new-steering'; }],
    ['changed config identity', '109', (request) => { request.identity.validationConfigHash = 'sha256:new-config'; }],
    ['changed head and queue', '135', (request) => { request.identity.headSha = 'c'.repeat(40); }],
    ['changed queue', '135', () => {}],
  ])('preserves historical evidence and starts a fresh clone for %s', async (_name, queue, change) => {
    const fixture = legacyBootstrapFixture(undefined, queue, true);
    change(fixture.request);
    const artifactPath = path.join(fixture.scope.projectRoot, '.omp/sdlc/verification/379.json');
    const before = fs.readFileSync(artifactPath);

    const outcome = await fixture.provider(fixture.request);

    expect(outcome).toMatchObject({ status: 'incomplete', summary: 'nmg-sdlc-smoke execute launch_failed' });
    expect(fixture.calls.filter((call) => call.program === 'git' && call.args[0] === 'clone')).toHaveLength(1);
    expect(fixture.calls.filter((call) => call.program === 'gh' && call.args[0] === 'api')
      .map((call) => call.args.find((arg) => arg.startsWith('number=')))).toEqual([`number=${queue}`]);
    expect(fixture.calls.filter((call) => call.program === process.execPath)
      .map((call) => call.args.at(-1))).toEqual([`#${queue}`]);
    expect(fixture.states.get(fixture.scope.recoveryKey)).toMatchObject({
      issues: [Number(queue)],
      phase: 'incomplete',
    });
    expect(fs.readFileSync(artifactPath)).toEqual(before);
    expect(fs.existsSync(fixture.cloneRoot)).toBe(true);
  });

  it('keeps ambiguous old provider results fail-closed even across a changed identity', async () => {
    const fixture = legacyBootstrapFixture((artifact) => {
      artifact.results.push(structuredClone(artifact.results[0]));
    });
    fixture.request.identity.headSha = 'c'.repeat(40);

    expect(inspectLegacySmokeFailure(fs.readFileSync, {
      request: fixture.request,
      scope: fixture.scope,
      issues: [109],
      pluginRoot: SOURCE_ROOT,
    }).presence).toBe('invalid');
    await expect(fixture.provider(fixture.request)).resolves.toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke legacy recovery evidence invalid',
    });
    expect(fixture.calls.some((call) => call.program === 'git' && call.args[0] === 'clone')).toBe(false);
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

  it('accepts exact multi-issue nonzero proof when run.json names only the current delivery', async () => {
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
