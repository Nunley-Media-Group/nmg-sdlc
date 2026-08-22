import { afterEach, describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  selectBacklog,
  validateHandoff,
  nextStep,
  isSpecApproved,
  specStatus,
  workerPrompt,
  writeRun,
  runExecute,
} from '../sdlc-execute.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sdlc-execute.mjs');

const temporaryRoots = [];

function makeSpecDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-spec-'));
  temporaryRoots.push(root);
  return root;
}

function writeApproved(dir, issueN, extra = {}) {
  const body = [
    extra.issue === undefined ? `**Issue**: #${issueN}` : extra.issue,
    extra.status === undefined ? '**Status**: Approved' : extra.status,
    '',
    extra.body ?? 'content',
    '',
  ].filter((line) => line !== null).join('\n');
  for (const name of extra.files ?? ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}


describe('sdlc-execute helpers (SCN001–SCN007)', () => {
  it('parseArgs empty defaults to backlog', () => {
    expect(parseArgs('')).toEqual({ issues: [], defaultBacklog: true });
    expect(parseArgs('   ')).toEqual({ issues: [], defaultBacklog: true });
  });

  it('parseArgs collects unique numbers in given order', () => {
    expect(parseArgs('#12 #10')).toEqual({ issues: [12, 10], defaultBacklog: false });
    expect(parseArgs('#12 #12')).toEqual({ issues: [12], defaultBacklog: false });
  });

  it('parseArgs rejects other tokens and lists over 20', () => {
    expect(() => parseArgs('foo')).toThrow(/Usage: \/sdlc-execute \[#N \.\.\.\]/);
    const twentyOne = Array.from({ length: 21 }, (_, index) => `#${index + 1}`).join(' ');
    expect(() => parseArgs(twentyOne)).toThrow();
  });

  it('selectBacklog returns the lowest unblocked non-Done issue', () => {
    const issues = [
      { number: 8, title: 'Later', labels: [], body: '' },
      { number: 3, title: 'First', labels: [], body: '' },
    ];
    expect(selectBacklog({
      issues,
      parentStates: {},
      projectStatuses: {},
    })).toBe(3);
  });

  it('selectBacklog drops open Depends-on parents and Project Done', () => {
    const issues = [
      { number: 8, title: 'Ready', labels: [], body: '' },
      { number: 3, title: 'Blocked', labels: [], body: 'Depends on: #1\n' },
      { number: 4, title: 'Done', labels: [], body: '' },
    ];
    expect(selectBacklog({
      issues,
      parentStates: { 1: 'OPEN' },
      projectStatuses: { 4: ['Done'] },
    })).toBe(8);
  });

  it('selectBacklog throws when parent state is unreadable', () => {
    expect(() => selectBacklog({
      issues: [{ number: 3, title: 'Blocked', labels: [], body: 'Depends on: #1\n' }],
      parentStates: {},
      parentLookupError: new Error('graphql failed'),
    })).toThrow();
  });

  it('validateHandoff accepts a golden passed object', () => {
    const handoff = {
      schemaVersion: 1,
      issue: 42,
      step: 'verify',
      status: 'passed',
      intervention: false,
      summary: 'ok',
      artifacts: ['specs/42-slug/verification-report.md'],
      next: 'deliver',
      reasonCode: null,
    };
    expect(validateHandoff(handoff)).toEqual(handoff);
  });

  it('validateHandoff rejects missing status', () => {
    expect(() => validateHandoff({
      schemaVersion: 1,
      issue: 42,
      step: 'verify',
      intervention: false,
      summary: 'ok',
      artifacts: [],
      next: 'deliver',
      reasonCode: null,
    })).toThrow();
  });

  it('nextStep skips completed prefix steps', () => {
    expect(nextStep(['start', 'implement'])).toBe('verify');
  });

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('isSpecApproved rejects a directory missing required artifacts', () => {
    const dir = makeSpecDir();
    fs.writeFileSync(path.join(dir, 'design.md'), '**Issue**: #42\n**Status**: Approved\n');
    expect(isSpecApproved(dir, 42)).toBe(false);
  });

  it('isSpecApproved rejects files with no Issue field', () => {
    const dir = makeSpecDir();
    writeApproved(dir, 42, { issue: null });
    expect(isSpecApproved(dir, 42)).toBe(false);
  });

  it('isSpecApproved accepts four approved files for the matching issue', () => {
    const dir = makeSpecDir();
    writeApproved(dir, 42);
    expect(isSpecApproved(dir, 42)).toBe(true);
    expect(isSpecApproved(dir, 7)).toBe(false);
  });

  it('isSpecApproved rejects trailing data on Issue and Status lines', () => {
    const extraIssue = makeSpecDir();
    writeApproved(extraIssue, 42, { issue: '**Issue**: #42, #43' });
    expect(isSpecApproved(extraIssue, 42)).toBe(false);

    const extraStatus = makeSpecDir();
    writeApproved(extraStatus, 42, { status: '**Status**: Approved extra' });
    expect(isSpecApproved(extraStatus, 42)).toBe(false);
  });

  it('writeRun creates run and handoff state beneath the supplied root', () => {
    const root = makeSpecDir();
    writeRun({ schemaVersion: 1 }, root);
    expect(fs.existsSync(path.join(root, '.omp', 'sdlc', 'run.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.omp', 'sdlc', 'handoffs'))).toBe(true);
  });

  it('workerPrompt and CLI inline start-issue without /skill:', () => {
    const prompt = workerPrompt({ step: 'start', issue: 42 });
    expect(prompt).toContain('# Start Issue');
    expect(prompt).toContain('$ARGUMENTS: #42');
    expect(prompt).not.toMatch(/\/skill:/);

    const cli = spawnSync(process.execPath, [SCRIPT, 'worker-prompt', '--step', 'start', '--issue', '42'], {
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain('# Start Issue');
    expect(cli.stdout).not.toMatch(/\/skill:/);
  });

  it('workerPrompt inlines extra workflows for implement and deliver', () => {
    expect(workerPrompt({ step: 'implement', issue: 42 })).toContain('# Simplify');
    expect(workerPrompt({ step: 'deliver', issue: 42 })).toContain('# Address PR Comments');
  });


  it('write-run CLI persists run state', () => {
    const root = makeSpecDir();
    const run = { schemaVersion: 1 };
    const cli = spawnSync(process.execPath, [SCRIPT, 'write-run', JSON.stringify(run)], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.omp/sdlc/run.json'), 'utf8'))).toEqual(run);
  });

  it('specStatus keeps a worktree Draft unapproved when origin is Approved', () => {
    const { root } = makeGitRepo();
    const specDir = path.join(root, 'specs', '42-add-x');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 42);
    git(root, ['checkout', '-b', '42-add-x']);
    git(root, ['add', 'specs/42-add-x']);
    git(root, ['commit', '-m', 'docs: approve spec for #42']);
    git(root, ['push', '-u', 'origin', 'HEAD']);
    git(root, ['checkout', 'main']);
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 42, { status: '**Status**: Draft' });
    expect(specStatus(42, root)).toEqual({
      dir: specDir,
      approved: false,
    });
  });

  it('specStatus treats a unique origin approved branch as approved', () => {
    const { root } = makeGitRepo();
    const specDir = path.join(root, 'specs', '42-add-x');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 42);
    git(root, ['checkout', '-b', '42-add-x']);
    git(root, ['add', 'specs/42-add-x']);
    git(root, ['commit', '-m', 'docs: approve spec for #42']);
    git(root, ['push', '-u', 'origin', 'HEAD']);
    git(root, ['checkout', 'main']);
    git(root, ['branch', '-D', '42-add-x']);
    fs.rmSync(path.join(root, 'specs'), { recursive: true, force: true });
    expect(specStatus(42, root)).toEqual({
      dir: 'specs/42-add-x',
      approved: true,
      ref: 'origin/42-add-x',
    });
  });

  it('specStatus treats two local issue branches as unapproved', () => {
    const { root } = makeGitRepo();
    git(root, ['checkout', '-b', '42-add-x']);
    git(root, ['checkout', 'main']);
    git(root, ['checkout', '-b', '42-other']);
    git(root, ['checkout', 'main']);
    expect(specStatus(42, root)).toEqual({ dir: null, approved: false });
  });

});

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function makeGitRepo() {
  const root = makeSpecDir();
  const remote = makeSpecDir();
  execFileSync('git', ['init', '--bare'], { cwd: remote, encoding: 'utf8' });
  git(root, ['init', '-b', 'main']);
  fs.writeFileSync(path.join(root, 'README.md'), 'root\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'init']);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '-u', 'origin', 'HEAD']);
  return { root, remote };
}

describe('runExecute controller', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  function makeControllerFixture({ stalled = false, failedStep = null } = {}) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-run-controller-'));
    roots.push(cwd);
    const specDir = path.join(cwd, 'specs', '42-ship-it');
    fs.mkdirSync(specDir, { recursive: true });
    writeApproved(specDir, 42);
    const calls = [];
    const starts = [];
    const closed = [];
    const notifications = [];
    const sentKeys = [];
    const waits = [];
    let paneSequence = 0;
    let activePrompt = '';
    let didStall = false;

    const run = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'gh' && args[0] === 'auth') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
        return { status: 0, stdout: '42-ship-it\n', stderr: '' };
      }
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('title')) {
        return { status: 0, stdout: JSON.stringify({ title: 'Ship It' }), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.includes('state')) {
        return { status: 0, stdout: JSON.stringify({ state: 'CLOSED' }), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'pr') {
        return { status: 0, stdout: JSON.stringify([{ state: 'MERGED' }]), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'repo') return { status: 0, stdout: 'main\n', stderr: '' };
      if (command === 'git' && ['checkout', 'pull'].includes(args[0])) return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'branch' && args[1] === '-d') return { status: 0, stdout: '', stderr: '' };
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };

    const herdr = {
      integrationStatus: () => ({ status: 0, stdout: 'omp: current (v8)\n' }),
      paneLayout: () => ({ result: { width: 120, height: 40 } }),
      paneSplit: ({ direction }) => {
        expect(direction).toBe('right');
        paneSequence += 1;
        return { result: { pane: { pane_id: `pane-${paneSequence}` } } };
      },
      paneClose: (paneId) => closed.push(paneId),
      agentStart: (input) => {
        starts.push(input);
        return { status: 0 };
      },
      agentPrompt: ({ name, prompt }) => {
        activePrompt = prompt;
        const step = name.slice(name.lastIndexOf('-') + 1);
        if (stalled && !didStall) {
          didStall = true;
          return { status: 1, reasonCode: 'agent_prompt_stalled' };
        }
        const handoffDir = path.join(cwd, '.omp/sdlc/handoffs');
        fs.mkdirSync(handoffDir, { recursive: true });
        fs.writeFileSync(path.join(handoffDir, `42-${step}.json`), `${JSON.stringify({
          schemaVersion: 1,
          issue: 42,
          step,
          status: step === failedStep ? 'failed' : 'passed',
          intervention: step === failedStep,
          summary: `${step} complete`,
          artifacts: [],
          next: step === 'deliver' ? null : 'next',
          reasonCode: step === failedStep ? 'implementation_failed' : null,
        })}\n`);
        return { status: 0 };
      },
      agentRead: () => activePrompt,
      agentSendKeys: ({ keys }) => {
        sentKeys.push(keys);
        return { status: 0 };
      },
      agentWait: (input) => {
        waits.push(input);
        if (!input.until) {
          const name = input.name;
          const step = name.slice(name.lastIndexOf('-') + 1);
          const handoffDir = path.join(cwd, '.omp/sdlc/handoffs');
          fs.mkdirSync(handoffDir, { recursive: true });
          fs.writeFileSync(path.join(handoffDir, `42-${step}.json`), `${JSON.stringify({
            schemaVersion: 1,
            issue: 42,
            step,
            status: 'passed',
            intervention: false,
            summary: `${step} complete after a 3600-second active worker`,
            artifacts: [],
            next: 'implement',
            reasonCode: null,
          })}\n`);
        }
        return { status: 0 };
      },
      agentGet: () => ({ result: { state: 'done' } }),
      listAgents: () => [],
      notificationShow: (notice) => notifications.push(notice),
    };
    return { cwd, calls, starts, closed, notifications, sentKeys, waits, run, herdr };
  }

  const env = { HERDR_ENV: '1', HERDR_SOCKET_PATH: '/tmp/herdr.sock', HERDR_PANE_ID: 'main-pane' };

  it('fails before Herdr mutation when the session environment is missing', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env: {}, run: fixture.run, herdr: fixture.herdr });
    expect(result).toMatchObject({ status: 2, stdout: 'execute requires a Herdr OMP session\n' });
    expect(fixture.starts).toHaveLength(0);
  });

  it('prints the exact install instruction and performs no mutation without omp integration', () => {
    const fixture = makeControllerFixture();
    fixture.herdr.integrationStatus = () => ({ status: 0, stdout: 'omp: not installed\n' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: 'Run: herdr integration install omp\n', stderr: '' });
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.starts).toHaveLength(0);
  });

  it('rejects invalid arguments with the stable usage line', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: '#42 nope', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: '', stderr: 'Usage: /sdlc-execute [#N ...]\n' });
    expect(fixture.calls).toHaveLength(0);
  });

  it('runs four omp sibling workers and preserves helper prompt composition', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fixture.starts).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-implement', paneId: 'pane-2', kind: 'omp' },
      { name: 's42-verify', paneId: 'pane-3', kind: 'omp' },
      { name: 's42-deliver', paneId: 'pane-4', kind: 'omp' },
    ]);
    expect(fixture.closed).toEqual(['pane-1', 'pane-2', 'pane-3', 'pane-4']);
    expect(workerPrompt({ step: 'implement', issue: 42 })).toContain('# Simplify');
    expect(workerPrompt({ step: 'deliver', issue: 42 })).toContain('# Address PR Comments');
  });

  it('recovers one pasted stalled prompt without a timeout', () => {
    const fixture = makeControllerFixture({ stalled: true });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fixture.sentKeys).toEqual([['enter']]);
    expect(fixture.waits[0]).toEqual({ name: 's42-start', until: 'working' });
    expect(fixture.waits[1]).toEqual({ name: 's42-start' });
    expect(fixture.waits.every((waitCall) => !Object.hasOwn(waitCall, 'timeout'))).toBe(true);
  });

  it('keeps a failed worker pane and sends the exact notification', () => {
    const fixture = makeControllerFixture({ failedStep: 'implement' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(1);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(fixture.notifications).toEqual([{
      title: 'nmg-sdlc stopped',
      body: 'Stopped on #42 implement. Worker pane pane-2 agent s42-implement left open.',
      sound: 'request',
    }]);
  });

  it('does not start a second worker when an issue worker is live', () => {
    const fixture = makeControllerFixture();
    fixture.herdr.listAgents = () => [{ name: 's42-verify', pane_id: 'kept-pane', state: 'working' }];
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fixture.starts).toHaveLength(0);
    expect(result.stdout).toContain('no second worker started');
  });

  it('stops on an unapproved spec with the write-spec instruction', () => {
    const fixture = makeControllerFixture();
    fs.writeFileSync(path.join(fixture.cwd, 'specs/42-ship-it/design.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 0, stdout: 'Run /sdlc-write-spec #42\n', stderr: '' });
    expect(fixture.starts).toHaveLength(0);
  });
});
