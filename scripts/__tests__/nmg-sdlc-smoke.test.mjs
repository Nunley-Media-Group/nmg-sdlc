import { describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import { createSmokeProvider } from '../../steering/extensions/nmg-sdlc-smoke.mjs';

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

describe('nmg-sdlc mutable delivery smoke provider', () => {
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
    expect(execute.args).toEqual(['/plugin/scripts/sdlc-execute.mjs', 'run', '#11', '#12']);
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

    expect(outcome).toMatchObject({ status: 'failed', summary: 'nmg-sdlc-smoke nested execution blocked' });
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

  it('runs the explicit issue queue once in order without picker or ad-hoc writes', async () => {
    const fixture = harness();
    const outcome = await fixture.provider(fixture.request);
    const executeCalls = fixture.calls.filter((call) => call.program === process.execPath);

    expect(outcome.status).toBe('passed');
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]).toMatchObject({
      args: ['/plugin/scripts/sdlc-execute.mjs', 'run', '#7', '#9'],
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
