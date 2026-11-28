import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runExecute, stageEffort, stageModel, VALID_STEPS, WORKER_PERMISSION_MODES, workerPermissionMode } from '../sdlc-execute.mjs';
import { validateHostRequest } from '../../src/execute-host.mjs';
import { packageRoot } from '../../src/sdlc-workflows.mjs';
import { STAGE_MODEL_DEFAULTS } from '../sdlc-models.mjs';
import { ensureWorktree } from '../sdlc-worktree.mjs';
import { roots, env, git, result, fixture, phasedWorker, ABSENT_STAGE_MODELS_WARNING, issueDeliveryRun, closingRef, closedIssue, mergedPr, advanceOrigin } from '../__fixtures__/sdlc-execute-fixture.mjs';

describe('per-project stage models (steering/sdlc-models.json)', () => {
  const stageFile = (stages) => `${JSON.stringify({ ...STAGE_MODEL_DEFAULTS, ...stages }, null, 2)}\n`;
  const startOf = (state, step) => state.starts.find((start) => start.name.split('-')[1] === step);

  it('resolves stage, repair, and verbatim provider models from the configuration', () => {
    const config = { ...STAGE_MODEL_DEFAULTS, verify: { model: 'sonnet', effort: 'max' },
      repair: { model: 'opus', effort: 'high' }, implement: { model: 'opencode-go/kimi-k3.1-pro', effort: 'xhigh' } };
    expect(stageModel('verify', null, config)).toBe('sonnet');
    expect(stageEffort('verify', null, config)).toBe('max');
    expect(stageModel('verify', { reasonCode: 'verification_not_green' }, config)).toBe('opus');
    expect(stageEffort('verify', { reasonCode: 'verification_not_green' }, config)).toBe('high');
    expect(stageEffort('start', null, config)).toBeUndefined();
    expect(stageModel('implement', null, config)).toBe('opencode-go/kimi-k3.1-pro');
    expect(() => stageModel('rem', null, config)).toThrow('unknown stage: rem');
  });

  it('dispatches the verify worker with the project model and effort', () => {
    const f = fixture({ stageModels: stageFile({ verify: { model: 'sonnet', effort: 'max' } }) });
    const response = f.execute('');
    expect(response).toMatchObject({ status: 0, stderr: '' });
    expect(response.stdout).not.toContain('Warning: steering/sdlc-models.json');
    expect(startOf(f.state, 'verify')).toMatchObject({ model: 'sonnet', effort: 'max' });
    expect(startOf(f.state, 'deliver')).toMatchObject({ model: 'haiku', effort: 'xhigh' });
  });

  it('prints the missing-file warning exactly once and dispatches plugin defaults', () => {
    const f = fixture({ stageModels: null });
    const response = f.execute('');
    expect(response.status).toBe(0);
    expect(response.stdout.startsWith(`${ABSENT_STAGE_MODELS_WARNING}\n`)).toBe(true);
    expect(response.stdout.split(ABSENT_STAGE_MODELS_WARNING).length - 1).toBe(1);
    expect(startOf(f.state, 'verify')).toMatchObject({ model: 'opus', effort: 'medium' });
  });

  it('stops with exit 2 before any spawn, Git, or GitHub call on an invalid project file', () => {
    const f = fixture({ stageModels: stageFile({ verify: { model: 'opus', effort: 'extreme' } }) });
    const calls = [];
    const response = f.execute('', {
      run: (command, args, options) => { calls.push(command); return f.run(command, args, options); },
      host: { spawn: () => { throw new Error('spawn_called'); } },
    });
    expect(response).toEqual({ status: 2, stdout: '', stderr:
      'steering/sdlc-models.json: verify.effort = "extreme": must be one of low, medium, high, xhigh, max, default\n' });
    expect(calls).toEqual([]);
    expect(f.state.starts).toEqual([]);
  });
});

// @SCN002 (AC2): an invalid steering/test-layers.json stops execute before any Git call.
describe('@SCN002 kept test layers (steering/test-layers.json)', () => {
  it('stops with exit 2 and the diagnostic before any spawn, Git, or GitHub call on an invalid file', () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.root, 'steering'), { recursive: true });
    fs.writeFileSync(path.join(f.root, 'steering/test-layers.json'), '{"version":1,"kept":["bdd","smoke"]}\n');
    const calls = [];
    const response = f.execute('', {
      run: (command, args, options) => { calls.push(command); return f.run(command, args, options); },
      host: { spawn: () => { throw new Error('spawn_called'); } },
    });
    expect(response).toEqual({ status: 2, stdout: '', stderr:
      'steering/test-layers.json: kept[1] = "smoke": unknown test type; must be one of bdd, e2e, unit, integration, property, doc\n' });
    expect(calls).toEqual([]);
    expect(f.state.starts).toEqual([]);
  });

  it('exits 2 from the goal CLI with the diagnostic before any Git call', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-test-layers-cli-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'steering'));
    fs.writeFileSync(path.join(root, 'steering/test-layers.json'), '{"version":2,"kept":["bdd"]}\n');
    const cli = spawnSync(process.execPath, [path.join(packageRoot, 'scripts/sdlc-execute.mjs'), 'goal'],
      { cwd: root, encoding: 'utf8' });
    expect(cli.status).toBe(2);
    expect(cli.stderr).toBe('steering/test-layers.json: version = 2: must be 1\n');
  });

  it('keeps the file and field diagnostic when the issue worktree file turns invalid mid-run', () => {
    const f = fixture({ branch: 'main' });
    f.setWorker((context) => {
      if (context.step !== 'start') throw new Error(`no ${context.step} worker may start`);
      roots.push(`${f.root}-wt`);
      const worktree = ensureWorktree({ cwd: f.root, branch: '42-example', base: 'main' });
      git(worktree.path, 'push', '-u', 'origin', '42-example');
      fs.writeFileSync(path.join(worktree.path, 'steering/test-layers.json'), '{"version":1,"kept":["bdd","smoke"]}\n');
      f.state.workdir = worktree.path;
      return { status: 'passed', next: 'implement' };
    });
    const response = f.execute('#42');
    expect(response.status).not.toBe(0);
    expect(response.stderr).toContain('test_layers_invalid: steering/test-layers.json: kept[1] = "smoke": unknown test type');
    expect(f.state.starts.map((start) => start.step)).toEqual(['start']);
  });
});

// The supervise call that runs under the session id the hooks module chose is driven end to end in
// sdlc-execute-supervisor.test.mjs, which holds the supervise fixture; its refusals need no session.
describe('@SCN002 supervise --session (#567 FR3)', () => {
  const supervise = (cwd, args) => spawnSync(process.execPath,
    [path.join(packageRoot, 'scripts/sdlc-execute.mjs'), 'supervise', ...args], { cwd, encoding: 'utf8' });

  it('@SCN002 refuses a --session that is not a canonical UUID, or whose session already exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-supervise-session-'));
    roots.push(root);
    expect(supervise(root, ['--session', 'not-a-uuid', '#42']))
      .toMatchObject({ status: 2, stdout: '', stderr: expect.stringMatching(/^invalid_session_id: /) });
    expect(fs.existsSync(path.join(root, '.nmg-sdlc'))).toBe(false);
    const session = randomUUID();
    fs.mkdirSync(path.join(root, '.nmg-sdlc', 'execute', session), { recursive: true });
    expect(supervise(root, ['--session', session, '#42']))
      .toMatchObject({ status: 2, stdout: '', stderr: expect.stringMatching(/^session_exists: /) });
  });
});

describe('stage subagent dispatch (#538)', () => {
  const stageFile = (stages) => `${JSON.stringify({ ...STAGE_MODEL_DEFAULTS, ...stages }, null, 2)}\n`;

  it('selects the worker permission mode from NMG_SDLC_WORKER_PERMISSION_MODE', () => {
    expect(WORKER_PERMISSION_MODES).toEqual(['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions']);
    for (const mode of WORKER_PERMISSION_MODES) {
      expect(workerPermissionMode({ NMG_SDLC_WORKER_PERMISSION_MODE: mode })).toBe(mode);
    }
  });

  it('falls back to auto when the permission mode override is missing or invalid', () => {
    expect(workerPermissionMode({})).toBe('auto');
    expect(workerPermissionMode(undefined)).toBe('auto');
    for (const value of ['', 'plan', 'manual', 'AUTO', 'bypass', ' auto', 'auto ', 'acceptedits']) {
      expect(workerPermissionMode({ NMG_SDLC_WORKER_PERMISSION_MODE: value })).toBe('auto');
    }
  });

  it('spawns every stage with the permission mode from NMG_SDLC_WORKER_PERMISSION_MODE, falling back to auto', () => {
    for (const [workerEnv, mode] of [[{ NMG_SDLC_WORKER_PERMISSION_MODE: 'dontAsk' }, 'dontAsk'],
      [{ NMG_SDLC_WORKER_PERMISSION_MODE: 'yolo' }, 'auto'], [{}, 'auto']]) {
      const f = fixture();
      // The injected host state directory stays in the environment, so the run never records in the real ~/.nmg-sdlc.
      expect(f.execute('#42', { env: { ...env, ...workerEnv } })).toMatchObject({ status: 0 });
      expect(f.state.starts.map((start) => start.permissionMode)).toEqual([mode, mode]);
    }
  });

  it('starts each fresh stage on its model and a repair re-dispatch on opus', () => {
    expect(VALID_STEPS.map((step) => stageModel(step, null))).toEqual(['haiku', 'haiku', 'opus', 'haiku']);
    for (const step of ['implement', 'verify', 'deliver']) {
      expect(stageModel(step, { reasonCode: 'verification_not_green' })).toBe('opus');
      expect(stageModel(step, { reasonCode: 'pr_evidence_pending' })).toBe(stageModel(step, null));
      expect(stageModel(step, { reasonCode: 'mergeability_reverification_required' })).toBe(stageModel(step, null));
    }
    expect(stageModel('start', { reasonCode: 'verification_not_green' })).toBe('haiku');
    expect(() => stageModel('rem', null)).toThrow('unknown stage: rem');
  });

  it('starts verify at medium, implement at xhigh, deliver at xhigh, and every repair re-dispatch at the default effort', () => {
    expect(VALID_STEPS.map((step) => stageEffort(step, null))).toEqual([undefined, 'xhigh', 'medium', 'xhigh']);
    for (const step of ['implement', 'verify', 'deliver']) {
      expect(stageEffort(step, { reasonCode: 'verification_not_green' })).toBeUndefined();
      expect(stageEffort(step, { reasonCode: 'pr_evidence_pending' })).toBe(stageEffort(step, null));
    }
    expect(stageEffort('start', { reasonCode: 'verification_not_green' })).toBeUndefined();
    expect(() => stageEffort('rem', null)).toThrow('unknown stage: rem');
  });

  it('carries each entry model and effort on its spawn request, with a default effort as null', () => {
    const f = fixture({ dirty: true, stageModels: stageFile({
      implement: { model: 'opencode-go/kimi-k3.1-pro', effort: 'xhigh' },
      verify: { model: 'opus[1m]', effort: 'max' },
      deliver: { model: 'claude-opus-5-5', effort: 'default' },
    }) });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map(({ step, entry, agent, model, effort, permissionMode }) => (
      { step, entry, agent, model, effort, permissionMode }))).toEqual([
      { step: 'implement', entry: 'implement', agent: 'spec-implementer', model: 'opencode-go/kimi-k3.1-pro', effort: 'xhigh', permissionMode: 'auto' },
      { step: 'verify', entry: 'verify', agent: 'architecture-reviewer', model: 'opus[1m]', effort: 'max', permissionMode: 'auto' },
      { step: 'deliver', entry: 'deliver', agent: 'deliverer', model: 'claude-opus-5-5', effort: null, permissionMode: 'auto' },
    ]);
  });

  it('builds spawn requests the hooks module accepts for the configured models, including opus[1m] and claude-opus-5-5', () => {
    const f = fixture({ dirty: true, stageModels: stageFile({
      implement: { model: 'opencode-go/kimi-k3.1-pro', effort: 'xhigh' },
      verify: { model: 'opus[1m]', effort: 'max' },
      deliver: { model: 'claude-opus-5-5', effort: 'default' },
    }) });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    const session = '0f8fbc1e-5b8e-4a3c-9d2a-6e1f0c3b7a11';
    const requests = f.state.starts.map((start, index) => ({ schemaVersion: 1, session, n: index + 1, kind: 'spawn',
      issue: start.issue, entry: start.entry, agent: start.agent, name: start.name, model: start.model,
      effort: start.effort, permissionMode: start.permissionMode, promptFile: `request-${index + 1}.prompt.md`,
      cwd: start.cwd }));
    expect(requests.map((request) => validateHostRequest(request))).toEqual(requests.map(() => ({ ok: true })));
    expect(validateHostRequest({ ...requests[0], model: 'not a model!' })).toMatchObject({ ok: false });
  });

  it('redispatches a repairable failure on the repair entry, and its stage entry once the failure is cleared', () => {
    const f = fixture();
    let verifications = 0;
    f.setWorker(({ step, publish, passGate, state }) => {
      if (step === 'verify' && verifications++ === 0) {
        return { status: 'failed', next: 'implement', reasonCode: 'same_check', summary: 'same failing check', artifacts: [] };
      }
      if (step === 'implement') { publish('fix: repair #42'); return { status: 'passed', next: 'verify' }; }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((start) => [start.step, start.entry])).toEqual([
      ['verify', 'verify'], ['implement', 'repair'], ['verify', 'verify'], ['deliver', 'deliver'],
    ]);
    expect(f.state.starts[1]).toMatchObject({ model: 'opus', effort: null });
  });

  it('runs no herdr command: every stage goes through the host, with no integration probe', () => {
    const f = fixture();
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.commands).not.toContain('herdr');
    expect(f.state.starts).toHaveLength(2);
  });

  it('exits 2 without a host, before any Git, GitHub or spawn call', () => {
    const calls = [];
    expect(runExecute({ args: '#42', env: {}, run: (command) => { calls.push(command); return { status: 0, stdout: '' }; } }))
      .toEqual({ status: 2, stdout: '', stderr: 'execute requires /sdlc-execute in a Claude Code session\n' });
    expect(calls).toEqual([]);
  });

  it('checks gh auth and nothing else before a spawn when there is no probe to run first', () => {
    const calls = [];
    const response = runExecute({ args: '#42', cwd: '/nonexistent-nmg-sdlc-root', env: {},
      host: { spawn: () => { throw new Error('spawn_called'); } },
      run: (command, args) => { calls.push([command, ...args.slice(0, 2)]); return { status: 1, stdout: '', stderr: 'no auth' }; } });
    expect(response).toEqual({ status: 1, stdout: `${ABSENT_STAGE_MODELS_WARNING}\n`, stderr: 'gh auth status failed\n' });
    expect(calls).toEqual([['gh', 'auth', 'status']]);
  });

  it('stops a denied spawn with worker_start_refused and the reason, dispatching no deliver and no prompt', () => {
    const f = fixture({ dirty: true });
    f.hooks.spawnDeny = 'nmg-sdlc: stage subagents are not allowed in this session';
    expect(f.execute('#42')).toEqual({ status: 1, stdout: '',
      stderr: `worker_start_refused: ${f.hooks.spawnDeny}\n` });
    expect(f.state.starts.map((start) => start.step)).toEqual(['implement']);
    expect(f.state.prompts).toEqual([]);
  });
});

// #638 FR3/FR4 and AC4-AC6: every stage worker is stopped once its stage finishes and before the next one starts, every
// worker a run spawned is stopped when the run ends, and a stop that stays unconfirmed fails the run and is named.
describe('stage worker disposal (#638)', () => {
  const agentIds = (f) => f.state.starts.map((entry) => entry.agentId);
  const activeIds = (f) => agentIds(f).filter((id) => ['pending', 'running', 'waiting'].includes(f.host.activity(id)?.status));

  it('@SCN004 stops a finished stage worker before the next stage worker is spawned', () => {
    const f = fixture();
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    const ids = agentIds(f);
    expect(ids.length).toBeGreaterThan(1);
    ids.forEach((id, index) => {
      expect(f.state.log.indexOf(`stop:${id}`)).toBeGreaterThan(f.state.log.indexOf(`spawn:${id}`));
      if (index + 1 < ids.length) {
        expect(f.state.log.indexOf(`stop:${id}`)).toBeLessThan(f.state.log.indexOf(`spawn:${ids[index + 1]}`));
      }
    });
    expect(f.host.activity(ids[0]).status).toBe('killed');
  });

  it.each([
    ['success', 0, (f) => f.execute('#42')],
    ['failure', 1, (f) => {
      f.setWorker(({ step }) => ({ status: 'failed', intervention: true, reasonCode: 'provider_unavailable',
        summary: `${step} cannot reach the required provider`, artifacts: [] }));
      return f.execute('#42');
    }],
    ['halt', 1, (f) => f.execute('#42', { supervise: () => ({ action: 'halt', text: 'host disk full' }) })],
  ])('@SCN005 stops every worker the run spawned when it ends by %s', (_ending, status, runEnding) => {
    const f = fixture();
    expect(runEnding(f)).toMatchObject({ status });
    expect(agentIds(f).length).toBeGreaterThan(0);
    expect(f.state.stops).toEqual(expect.arrayContaining(agentIds(f)));
    expect(activeIds(f)).toEqual([]);
  });

  it('@SCN006 stops a worker twice, fails the run with worker_stop_failed, and names the unconfirmed worker', () => {
    const f = fixture();
    f.hooks.stopDeny = 'nmg-sdlc: stop not confirmed for agent-1: status running';
    const result = f.execute('#42');
    expect(result).toMatchObject({ status: 1, stderr: expect.stringContaining('worker_stop_failed') });
    expect(f.state.stops).toEqual(['agent-1', 'agent-1']);
    expect(f.state.starts).toHaveLength(1);
    expect(result.stdout.split('\n')).toContain('stage worker agent-1: stop not confirmed');
  });

  it('@SCN006 retries a refused stop once, and a confirmed retry lets the run finish', () => {
    const f = fixture();
    const stop = f.host.stop;
    let refusals = 1;
    f.host.stop = (agentId) => {
      if (refusals > 0) {
        refusals -= 1;
        f.state.stops.push(agentId);
        throw new Error('worker_stop_failed: stop not confirmed yet');
      }
      return stop(agentId);
    };
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.stops.slice(0, 2)).toEqual(['agent-1', 'agent-1']);
    expect(f.state.stops).toHaveLength(agentIds(f).length + 1);
    expect(activeIds(f)).toEqual([]);
  });
});

describe('stale local default branch (#502)', () => {
  const steps = (f) => f.state.starts.map((entry) => entry.name.split('-')[1]);
  const deliver = ({ state }) => { state.merged = true; state.closed = true; return { status: 'passed', next: null }; };

  it('routes an empty issue branch created from origin to implement with no version prepared first', () => {
    const f = fixture({ branch: 'main' });
    advanceOrigin(f.root);
    let versionsBeforeImplement = null;
    f.setWorker((context) => {
      if (context.step === 'start') {
        git(context.root, 'fetch', '--quiet', 'origin');
        git(context.root, 'checkout', '-b', '42-example', 'origin/main');
        git(context.root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (context.step === 'implement') {
        versionsBeforeImplement = f.state.versionPreparations.length;
        // The implement worker finds nothing to change and publishes no commit.
        return { status: 'passed', next: 'verify' };
      }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(steps(f).slice(0, 2)).toEqual(['start', 'implement']);
    expect(versionsBeforeImplement).toBe(0);
  });

  it('routes a branch with real commits to review, then integrates the moved default branch and prepares the version before the gate', () => {
    const f = fixture();
    advanceOrigin(f.root);
    const seen = [];
    f.setWorker(phasedWorker(({ step, phase }) => seen.push({ stage: phase ?? step, preparations: f.state.versionPreparations.length,
      integrated: spawnSync('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { cwd: f.root }).status === 0 })));
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(seen.map(({ stage }) => stage)).toEqual(['review', 'gate', 'deliver']);
    expect(seen[0]).toMatchObject({ preparations: 0, integrated: false });
    expect(seen[1].preparations).toBeGreaterThan(0);
    expect(seen[1].integrated).toBe(true);
  });

  it('fails closed with default_branch_unreadable and starts no worker when the remote default ref cannot be fetched', () => {
    const f = fixture();
    const failingFetch = (command, args, options) => (command === 'git' && args[0] === 'fetch'
      ? { status: 128, stdout: '', stderr: "fatal: couldn't find remote ref refs/heads/main\n" }
      : f.run(command, args, options));
    expect(f.execute('', { run: failingFetch })).toEqual({ status: 1, stdout: '', stderr: 'default_branch_unreadable\n' });
    expect(f.state.starts).toEqual([]);
    expect(f.state.versionPreparations).toEqual([]);
  });
});

describe('post-delivery branch cleanup (#523)', () => {
  const remoteBranchExists = (root) => git(root, 'ls-remote', '--heads', 'origin', '42-example') !== '';
  const localBranchExists = (root) => spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/42-example'],
    { cwd: root }).status === 0;
  const delivered = (f) => { f.state.merged = true; f.state.closed = true; };
  const cleaned = '#42: branch cleanup: deleted 42-example and fast-forwarded main\n';
  // Fails only the command `when` matches; every other command reaches the fixture.
  const failing = (f, when) => (command, args, options) => (when(command, args)
    ? { status: 1, stdout: '', stderr: 'injected failure\n' } : f.run(command, args, options));

  it('deletes the proven branch remotely and locally and fast-forwards the default branch (AC1, bare re-entry)', () => {
    const f = fixture();
    delivered(f);
    expect(f.execute('')).toEqual({ status: 0, stdout: `#42: MERGED and CLOSED\n${cleaned}`, stderr: '' });
    expect(remoteBranchExists(f.root)).toBe(false);
    expect(localBranchExists(f.root)).toBe(false);
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
    expect(git(f.root, 'rev-parse', 'main')).toBe(git(f.root, 'rev-parse', 'origin/main'));
    expect(f.state.starts).toEqual([]);
  });

  it('skips the remote deletion silently when the remote branch is already absent (AC2)', () => {
    const f = fixture();
    delivered(f);
    git(f.root, 'push', 'origin', '--delete', '42-example');
    expect(f.execute('')).toEqual({ status: 0, stdout: `#42: MERGED and CLOSED\n${cleaned}`, stderr: '' });
    expect(localBranchExists(f.root)).toBe(false);
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
  });

  it('preserves the branch and uncommitted changes when the worktree is dirty outside .nmg-sdlc/ (AC3)', () => {
    const f = fixture({ dirty: true });
    delivered(f);
    expect(f.execute('')).toEqual({ status: 0,
      stdout: '#42: MERGED and CLOSED\n#42: branch cleanup skipped: worktree_dirty\n', stderr: '' });
    expect(git(f.root, 'branch', '--show-current')).toBe('42-example');
    expect(localBranchExists(f.root)).toBe(true);
    expect(remoteBranchExists(f.root)).toBe(true);
    expect(fs.readFileSync(path.join(f.root, 'helper.py'), 'utf8')).toContain('# preserved partial change');
  });

  it('preserves the branch when the local head moves after delivery was proven (AC3)', () => {
    const f = fixture();
    delivered(f);
    // completed() reads the issue last; a commit landing then moves HEAD past the proven head.
    const run = (command, args, options) => {
      const response = f.run(command, args, options);
      if (command === 'gh' && args.includes('number,state')) git(f.root, 'commit', '--allow-empty', '-m', 'chore: move after proof');
      return response;
    };
    expect(f.execute('', { run })).toEqual({ status: 0,
      stdout: '#42: MERGED and CLOSED\n#42: branch cleanup skipped: local_head_mismatch\n', stderr: '' });
    expect(git(f.root, 'branch', '--show-current')).toBe('42-example');
    expect(remoteBranchExists(f.root)).toBe(true);
  });

  it('preserves the branch when the default branch cannot fast-forward to origin (AC3)', () => {
    const f = fixture();
    delivered(f);
    // Local main and origin/main each gain a commit the other lacks, so the pull cannot fast-forward.
    git(f.root, 'checkout', 'main');
    fs.writeFileSync(path.join(f.root, 'local.txt'), 'local only\n');
    git(f.root, 'add', 'local.txt');
    git(f.root, 'commit', '-m', 'chore: local main');
    git(f.root, 'checkout', '42-example');
    advanceOrigin(f.root);
    expect(f.execute('')).toEqual({ status: 0,
      stdout: '#42: MERGED and CLOSED\n#42: branch cleanup skipped: pull_not_fast_forward\n', stderr: '' });
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
    expect(localBranchExists(f.root)).toBe(true);
  });

  it.each([
    ['default_branch_unreadable', (command, args) => command === 'gh' && args.includes('--jq'),
      '#42: branch cleanup skipped: default_branch_unreadable\n', { localKept: true, remoteKept: false }],
    ['default_checkout_failed', (command, args) => command === 'git' && args[0] === 'switch',
      '#42: branch cleanup skipped: default_checkout_failed\n', { localKept: true, remoteKept: false }],
    ['local_branch_delete_failed', (command, args) => command === 'git' && args[0] === 'branch' && args[1] === '-D',
      '#42: branch cleanup skipped: local_branch_delete_failed\n', { localKept: true, remoteKept: false }],
    ['remote_head_unreadable', (command, args) => command === 'git' && args[0] === 'ls-remote',
      `#42: remote branch cleanup skipped: remote_head_unreadable\n${cleaned}`, { localKept: false, remoteKept: true }],
    ['remote_delete_failed', (command, args) => command === 'git' && args[0] === 'push' && args.includes('--delete'),
      `#42: remote branch cleanup skipped: remote_delete_failed\n${cleaned}`, { localKept: false, remoteKept: true }],
  ])('reports %s and keeps only what the failed step leaves in place', (_reason, when, tail, kept) => {
    const f = fixture();
    delivered(f);
    expect(f.execute('', { run: failing(f, when) })).toEqual({ status: 0, stdout: `#42: MERGED and CLOSED\n${tail}`, stderr: '' });
    expect(localBranchExists(f.root)).toBe(kept.localKept);
    expect(remoteBranchExists(f.root)).toBe(kept.remoteKept);
  });

  it('reports remote_head_mismatch and still deletes the local branch when the remote moved (AC4)', () => {
    const f = fixture();
    delivered(f);
    git(f.root, 'push', '--force', 'origin', 'HEAD~1:refs/heads/42-example');
    expect(f.execute('')).toEqual({ status: 0,
      stdout: `#42: MERGED and CLOSED\n#42: remote branch cleanup skipped: remote_head_mismatch\n${cleaned}`, stderr: '' });
    expect(remoteBranchExists(f.root)).toBe(true);
    expect(localBranchExists(f.root)).toBe(false);
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
  });

  it('finishes the delivered branch before the next queued issue starts from the default branch (AC5)', () => {
    const f = fixture();
    delivered(f);
    const run = issueDeliveryRun(f, {
      issues: { 43: closedIssue(43, [closingRef(10)]) },
      prs: { 10: mergedPr(10, 43, '43-next') },
    });
    expect(f.execute('#42 #43', { run })).toEqual({ status: 0,
      stdout: `#42: MERGED and CLOSED\n${cleaned}#43: MERGED and CLOSED\n`, stderr: '' });
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
    expect(f.state.starts).toEqual([]);
  });
});
