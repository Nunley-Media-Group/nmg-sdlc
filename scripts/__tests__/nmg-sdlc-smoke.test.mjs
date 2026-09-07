import { afterEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectReviewReceipts } from '../../src/sdlc-review-isolation.mjs';
import { createSmokeProvider } from '../../steering/extensions/nmg-sdlc-smoke.mjs';

const SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const VALID_ENV = Object.freeze({
  HERDR_ENV: '1',
  HERDR_SOCKET_PATH: '/tmp/herdr.sock',
  HERDR_PANE_ID: 'w1:p1',
});

function result(status = 0, stdout = '', extra = {}) {
  return { status, signal: null, stdout, stderr: '', reasonCode: status === 0 ? null : 'failed', ...extra };
}

function harness(options = {}) {
  const config = Object.hasOwn(options, 'config') ? options.config : { issues: [7, 9] };
  const { env = VALID_ENV, override } = options;
  const calls = [];
  const rmSync = jest.fn();
  const mkdtempSync = jest.fn(() => '/tmp/nmg-sdlc-smoke-fixture');
  const deliveryHead = (issue) => `${issue}`.repeat(40).slice(0, 40);
  const readFileSync = jest.fn((file) => {
    const issue = Number(String(file).match(/\/smoke-deliveries\/(\d+)\.json$/)?.[1]);
    return JSON.stringify({
      schemaVersion: 1,
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
  const provider = createSmokeProvider({
    runCommand,
    mkdtempSync,
    readFileSync,
    rmSync,
    env,
  });
  const request = {
    identity: { headSha: 'abc123' },
    projectRoot: '/plugin',
    config,
  };
  return { calls, mkdtempSync, provider, readFileSync, request, rmSync, runCommand };
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
    if (args[0] !== 'remote') throw new Error('Unexpected fixture git command');
    console.log('https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git');
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
      env: { ...process.env, ...VALID_ENV, NMG_SDLC_SMOKE_OWNED: '0',
        NMG_SDLC_PLUGIN_ROOT: candidate,
        PATH: `${path.join(fixture.root, 'bin')}${path.delimiter}${process.env.PATH}` },
      mkdtempSync: () => fixture.work,
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

  it('blocks nested smoke ownership before cloning or executing', async () => {
    const fixture = harness({ env: { ...VALID_ENV, NMG_SDLC_SMOKE_OWNED: '1' } });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome).toMatchObject({ status: 'passed', summary: 'nmg-sdlc-smoke nested execution blocked (satisfied by enclosing owned delivery)' });
    expect(fixture.mkdtempSync).not.toHaveBeenCalled();
    expect(fixture.runCommand).not.toHaveBeenCalled();
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
          ...process.env, ...VALID_ENV, NMG_SDLC_SMOKE_OWNED: '0',
          NMG_SDLC_PLUGIN_ROOT: fixture.root,
          PATH: `${path.join(fixture.root, 'bin')}${path.delimiter}${process.env.PATH}`,
        },
        mkdtempSync: () => fixture.work,
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
        env: expect.objectContaining({ NMG_SDLC_SMOKE_OWNED: '1' }),
      },
    });
    const rendered = fixture.calls.map((call) => call.args.join(' ')).join('\n');
    expect(rendered).not.toContain('list-specified');
    expect(rendered).not.toContain('issue create');
    expect(rendered).not.toContain('sdlc-status');
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

  it('passes only with CLOSED issue and exact merged PR evidence, then deletes the clone', async () => {
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
  });

  it('rejects a nonzero execute exit before reading delivery proof', async () => {
    const fixture = harness({ override: (program) => (
      program === process.execPath ? result(1, '', { stderr: 'controller failed' }) : null
    ) });
    const outcome = await fixture.provider(fixture.request);

    expect(outcome).toMatchObject({
      status: 'failed',
      summary: 'nmg-sdlc-smoke execute exited 1',
    });
    expect(retained(outcome)).toBe(true);
    expect(fixture.rmSync).not.toHaveBeenCalled();
    expect(fixture.readFileSync).not.toHaveBeenCalled();
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
