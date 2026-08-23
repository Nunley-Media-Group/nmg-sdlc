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
  listSpecifiedIssues,
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
    expect(parseArgs('#12,#10')).toEqual({ issues: [12, 10], defaultBacklog: false });
    expect(parseArgs('#12, #10')).toEqual({ issues: [12, 10], defaultBacklog: false });
  });

  it('lists open spec-created issues sorted by number', () => {
    const calls = [];
    const issues = listSpecifiedIssues({
      cwd: '/repo',
      run: (command, args, options) => {
        calls.push([command, args, options]);
        return {
          status: 0,
          stdout: JSON.stringify([{ number: 12, title: 'Later' }, { number: 8, title: 'First' }]),
        };
      },
    });
    expect(issues).toEqual([{ number: 8, title: 'First' }, { number: 12, title: 'Later' }]);
    expect(calls).toEqual([[
      'gh',
      ['issue', 'list', '--state', 'open', '--label', 'spec-created', '--limit', '100', '--json', 'number,title'],
      { cwd: '/repo' },
    ]]);
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

  it('nextStep follows both review and fix pairs before verification', () => {
    expect(nextStep(['start', 'implement'])).toBe('review1');
    expect(nextStep(['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'])).toBe('verify');
  });

  it('validateHandoff accepts review and fix steps and rejects unknown steps', () => {
    const base = {
      schemaVersion: 1,
      issue: 42,
      status: 'passed',
      intervention: false,
      summary: 'ok',
      artifacts: [],
      next: null,
      reasonCode: null,
    };
    expect(validateHandoff({ ...base, step: 'review1' }).step).toBe('review1');
    expect(validateHandoff({ ...base, step: 'fix2' }).step).toBe('fix2');
    expect(() => validateHandoff({ ...base, step: 'simplify' })).toThrow('handoff step');
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

  it('workerPrompt maps implementation, review, fix, and delivery workflows', () => {
    const implement = workerPrompt({ step: 'implement', issue: 42 });
    const review = workerPrompt({ step: 'review1', issue: 42 });
    expect(implement).not.toContain('# Simplify');
    expect(implement).toContain('## Commit and Push Implementation');
    expect(implement).toContain('git push');
    expect(review).toContain('# Review Main');
    expect(review).toContain('sdlc-review-main.mjs');
    expect(review).toContain('already run interactively');
    expect(review).toContain('Do not invoke `/review`, `omp`, or a nested agent.');
    expect(workerPrompt({ step: 'fix1', issue: 42 })).toContain('# Apply Review');
    expect(workerPrompt({ step: 'fix1', issue: 42 })).toContain('sdlc-apply-review.mjs');
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

  function makeControllerFixture({
    stalled = false,
    stalledInStderr = false,
    settledBeforeSubmit = false,
    agentStartStatuses = [],
    failedStep = null,
    handoffIssue = 42,
    handoffStep = null,
    paneCloseStatus = 0,
    reviewPromptStatus = 'stalled',
    reviewModeInitiallyVisible = false,
    branchMenuTransition = true,
    writeHandoffs = true,
    promptStatus = 0,
    agentState = 'done',
    labelIssues = [42],
    specifiedIssues = [],
  } = {}) {
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
    const prompts = [];
    const waits = [];
    let paneSequence = 0;
    let activePrompt = '';
    let didStall = false;
    let reviewMenu = null;
    const reviewMenuEvents = [];
    const pendingAgentStartStatuses = [...agentStartStatuses];

    const run = (command, args) => {
      calls.push([command, ...args]);
      if (command === 'gh' && args[0] === 'auth') return { status: 0, stdout: '', stderr: '' };
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'list' && args.includes('--label')) {
        return { status: 0, stdout: JSON.stringify(specifiedIssues), stderr: '' };
      }
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view' && args.some((arg) => arg.includes('labels'))) {
        const issue = Number(args[2]);
        return {
          status: 0,
          stdout: JSON.stringify({
            number: issue,
            labels: labelIssues.includes(issue) ? [{ name: 'spec-created' }] : [],
          }),
          stderr: '',
        };
      }
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
        return { status: 0, stdout: '42-ship-it\n', stderr: '' };
      }
      if (command === 'git' && args[0] === 'branch' && args[1] === '-a') {
        return { status: 0, stdout: '42-ship-it\nmain\norigin/42-ship-it\norigin/main\n', stderr: '' };
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
      paneClose: (paneId) => {
        closed.push(paneId);
        return { status: paneCloseStatus };
      },
      agentStart: (input) => {
        starts.push(input);
        if (reviewModeInitiallyVisible && /^s42-review[12]$/.test(input.name)) {
          reviewMenu = 'mode';
          reviewMenuEvents.push('mode-visible');
        }
        return { status: pendingAgentStartStatuses.shift() ?? 0 };
      },
      agentPrompt: ({ name, prompt }) => {
        activePrompt = prompt;
        prompts.push({ name, prompt });
        if (prompt === '/review') {
          if (reviewPromptStatus === 'worker_failed') {
            reviewMenu = null;
            return { status: 1, reasonCode: reviewPromptStatus };
          }
          if (reviewPromptStatus === 'settled') {
            reviewMenu = 'composer';
            reviewMenuEvents.push('composer-visible');
            return { status: 0, stdout: '{"state":"idle"}\n', stderr: '' };
          }
          reviewMenu = 'mode';
          reviewMenuEvents.push('mode-visible');
          return { status: 1, reasonCode: 'agent_prompt_stalled' };
        }
        reviewMenu = null;
        const step = name.slice(name.lastIndexOf('-') + 1);
        if ((stalled || stalledInStderr) && !didStall) {
          didStall = true;
          return stalledInStderr
            ? { status: 1, stdout: '', stderr: '{"code":"agent_prompt_stalled"}\n' }
            : { status: 1, reasonCode: 'agent_prompt_stalled' };
        }
        if (settledBeforeSubmit && !didStall) {
          didStall = true;
          return { status: 0, stdout: '{"state":"idle"}\n', stderr: '' };
        }
        if (writeHandoffs) {
          const handoffDir = path.join(cwd, '.omp/sdlc/handoffs');
          fs.mkdirSync(handoffDir, { recursive: true });
          fs.writeFileSync(path.join(handoffDir, `42-${step}.json`), `${JSON.stringify({
            schemaVersion: 1,
            issue: handoffIssue,
            step: handoffStep ?? step,
            status: step === failedStep ? 'failed' : 'passed',
            intervention: step === failedStep,
            summary: `${step} complete`,
            artifacts: [],
            next: step === 'deliver' ? null : 'next',
            reasonCode: step === failedStep ? 'implementation_failed' : null,
          })}\n`);
        }
        return { status: promptStatus };
      },
      agentRead: () => {
        if (reviewMenu === 'composer') return '/review';
        if (reviewMenu === 'mode') return 'Review Mode\n/review';
        if (reviewMenu === 'branch') {
          reviewMenuEvents.push('branch-visible');
          return 'Select base branch…';
        }
        return activePrompt;
      },
      agentSendKeys: ({ keys }) => {
        sentKeys.push(keys);
        if (reviewMenu === 'composer') {
          reviewMenuEvents.push(`composer-keys:${keys.join(',')}`);
          if (keys.length !== 1 || keys[0] !== 'enter') return { status: 1 };
          reviewMenu = 'mode';
          reviewMenuEvents.push('mode-visible');
          return { status: 0 };
        }
        if (reviewMenu === 'mode') {
          reviewMenuEvents.push(`mode-keys:${keys.join(',')}`);
          if (keys.length !== 1 || keys[0] !== 'enter') return { status: 1 };
          if (branchMenuTransition) reviewMenu = 'branch';
        } else if (reviewMenu === 'branch') {
          reviewMenuEvents.push(`branch-keys:${keys.join(',')}`);
          reviewMenu = 'reviewing';
        }
        return { status: 0 };
      },
      agentWait: (input) => {
        waits.push(input);
        if (!input.until && writeHandoffs) {
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
      agentGet: () => ({ result: { state: agentState } }),
      listAgents: () => [],
      notificationShow: (notice) => notifications.push(notice),
    };
    return {
      cwd, calls, starts, closed, notifications, sentKeys, waits, prompts, reviewMenuEvents, run, herdr,
    };
  }

  const env = { HERDR_ENV: '1', HERDR_SOCKET_PATH: '/tmp/herdr.sock', HERDR_PANE_ID: 'main-pane' };

  function configurePassedRetainedStartWorker(fixture, agentPayload) {
    writeRun({
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'start',
      completed: { 42: [] },
      failed: { issue: 42, step: 'start', reasonCode: 'missing_handoff' },
      startedAt: '2026-08-21T00:00:00.000Z',
    }, fixture.cwd);
    fs.writeFileSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'start',
      status: 'passed',
      intervention: false,
      summary: 'Start repaired',
      artifacts: [],
      next: 'implement',
      reasonCode: null,
    })}\n`);
    fixture.herdr.listAgents = () => [{
      name: 's42-start',
      pane_id: 'kept-pane',
      state: 'idle',
    }];
    fixture.herdr.agentGet = () => ({ status: 0, stdout: JSON.stringify(agentPayload) });
  }

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

  it('starts nothing when empty args find no open specified issues', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 0, stdout: 'No open spec-created issues.\n', stderr: '' });
    expect(fixture.starts).toEqual([]);
  });

  it('requires an explicit selection when empty args find specified issues', () => {
    const fixture = makeControllerFixture({ specifiedIssues: [{ number: 42, title: 'Ship It' }] });
    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: '', stderr: 'Usage: /sdlc-execute [#N ...]\n' });
    expect(fixture.starts).toEqual([]);
  });

  it('resumes an existing run issue list on empty args', () => {
    const fixture = makeControllerFixture();
    writeRun({
      schemaVersion: 1,
      issues: [42],
      currentIssue: 42,
      currentStep: 'start',
      completed: { 42: [] },
      failed: null,
      startedAt: '2026-08-23T00:00:00.000Z',
    }, fixture.cwd);

    const result = runExecute({ args: '', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.starts[0].name).toBe('s42-start');
  });

  it('names every unlabeled explicit issue and starts no workers', () => {
    const fixture = makeControllerFixture({ labelIssues: [15] });
    const result = runExecute({ args: '#12 #15', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: '#12 has no spec-created label\n', stderr: '' });
    expect(fixture.starts).toEqual([]);
  });

  it('preserves labeled explicit-list order and first-occurrence dedupe', () => {
    const fixture = makeControllerFixture({ labelIssues: [12, 15], writeHandoffs: false });
    for (const issue of [12, 15]) {
      const dir = path.join(fixture.cwd, 'specs', `${issue}-queued`);
      fs.mkdirSync(dir, { recursive: true });
      writeApproved(dir, issue);
    }

    runExecute({ args: '#15,#12 #15', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));
    expect(persisted.issues).toEqual([15, 12]);
    expect(fixture.starts[0].name).toBe('s15-start');
  });

  it('checks the label before approved-spec status', () => {
    const fixture = makeControllerFixture({ labelIssues: [] });
    fs.writeFileSync(path.join(fixture.cwd, 'specs/42-ship-it/design.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 2, stdout: '#42 has no spec-created label\n', stderr: '' });
    expect(fixture.starts).toEqual([]);
  });

  it('runs eight omp sibling workers in queue order', () => {
    const fixture = makeControllerFixture();
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fixture.starts).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-implement', paneId: 'pane-2', kind: 'omp' },
      { name: 's42-review1', paneId: 'pane-3', kind: 'omp' },
      { name: 's42-fix1', paneId: 'pane-4', kind: 'omp' },
      { name: 's42-review2', paneId: 'pane-5', kind: 'omp' },
      { name: 's42-fix2', paneId: 'pane-6', kind: 'omp' },
      { name: 's42-verify', paneId: 'pane-7', kind: 'omp' },
      { name: 's42-deliver', paneId: 'pane-8', kind: 'omp' },
    ]);
    expect(fixture.closed).toEqual([
      'pane-1', 'pane-2', 'pane-3', 'pane-4', 'pane-5', 'pane-6', 'pane-7', 'pane-8',
    ]);
    expect(fixture.prompts.filter(({ prompt }) => prompt === '/review').map(({ name }) => name)).toEqual([
      's42-review1',
      's42-review2',
    ]);
    expect(fixture.sentKeys).toEqual([
      ['enter'],
      ['down', 'enter'],
      ['enter'],
      ['down', 'enter'],
    ]);
    expect(fixture.reviewMenuEvents).toEqual([
      'mode-visible',
      'mode-keys:enter',
      'branch-visible',
      'branch-keys:down,enter',
      'mode-visible',
      'mode-keys:enter',
      'branch-visible',
      'branch-keys:down,enter',
    ]);
    expect(fixture.prompts.some(({ prompt }) => /\bomp\s+\/review\b/.test(prompt))).toBe(false);
  });

  it('rejects a passed handoff left by an earlier worker attempt', () => {
    const fixture = makeControllerFixture({ writeHandoffs: false });
    const handoffDir = path.join(fixture.cwd, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(path.join(handoffDir, '42-start.json'), `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      step: 'start',
      status: 'passed',
      intervention: false,
      summary: 'Stale start result',
      artifacts: [],
      next: 'implement',
      reasonCode: null,
    })}\n`);

    const result = runExecute({
      args: '#42',
      cwd: fixture.cwd,
      env,
      run: fixture.run,
      herdr: fixture.herdr,
    });

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8')).failed).toEqual({
      issue: 42,
      step: 'start',
      reasonCode: 'missing_handoff',
    });
  });

  it('honors a passed idle handoff when the prompt wait reports failure', () => {
    const fixture = makeControllerFixture({ promptStatus: 1 });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(0);
    expect(persisted.failed).toBeNull();
    expect(persisted.completed['42']).toContain('start');
    expect(fixture.closed).toContain('pane-1');
    expect(fixture.starts.map(({ name }) => name)).toContain('s42-implement');
  });

  it('fails closed when prompt wait fails without a matching handoff', () => {
    const fixture = makeControllerFixture({ promptStatus: 1, writeHandoffs: false });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'missing_handoff' });
    expect(fixture.notifications).toEqual([{
      title: 'nmg-sdlc stopped',
      body: 'Stopped on #42 start. Worker pane pane-1 agent s42-start left open.',
      sound: 'request',
    }]);
  });

  it('fails closed when prompt wait fails with a passed but busy worker', () => {
    const fixture = makeControllerFixture({ promptStatus: 1, agentState: 'working' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'passed' });
    expect(fixture.notifications).toEqual([{
      title: 'nmg-sdlc stopped',
      body: 'Stopped on #42 start. Worker pane pane-1 agent s42-start left open.',
      sound: 'request',
    }]);
  });

  it('recovers one pasted stalled prompt without a timeout', () => {
    const fixture = makeControllerFixture({ stalled: true });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fixture.sentKeys).toEqual([
      ['enter'],
      ['enter'],
      ['down', 'enter'],
      ['enter'],
      ['down', 'enter'],
    ]);
    expect(fixture.waits[0]).toEqual({ name: 's42-start', until: 'working' });
    expect(fixture.waits[1]).toEqual({ name: 's42-start' });
    expect(fixture.waits.every((waitCall) => !Object.hasOwn(waitCall, 'timeout'))).toBe(true);
  });

  it('recovers a stalled prompt reported as JSON on stderr', () => {
    const fixture = makeControllerFixture({ stalledInStderr: true });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.sentKeys[0]).toEqual(['enter']);
    expect(fixture.waits.slice(0, 2)).toEqual([
      { name: 's42-start', until: 'working' },
      { name: 's42-start' },
    ]);
    expect(fixture.closed).toContain('pane-1');
  });

  it('fails closed when a stalled prompt is not visibly pasted', () => {
    const fixture = makeControllerFixture({ stalled: true });
    fixture.herdr.agentRead = () => 'You are the reviewer for unrelated work';
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'agent_prompt_stalled' });
  });

  it('submits a pasted prompt when prompt wait settles idle too early', () => {
    const fixture = makeControllerFixture({ settledBeforeSubmit: true });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.sentKeys[0]).toEqual(['enter']);
    expect(fixture.waits.slice(0, 2)).toEqual([
      { name: 's42-start', until: 'working' },
      { name: 's42-start' },
    ]);
    expect(fixture.closed).toContain('pane-1');
  });

  it('waits when detection shows working before the agent state updates', () => {
    const fixture = makeControllerFixture({ settledBeforeSubmit: true, agentState: 'idle' });
    const readAgent = fixture.herdr.agentRead;
    const sendKeys = fixture.herdr.agentSendKeys;
    fixture.herdr.agentRead = (input) => input.name === 's42-start' ? 'Working…' : readAgent(input);
    fixture.herdr.agentSendKeys = (input) => {
      if (input.name === 's42-start') throw new Error('must not resubmit an active worker prompt');
      return sendKeys(input);
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.waits.slice(0, 2)).toEqual([
      { name: 's42-start', until: 'working' },
      { name: 's42-start' },
    ]);
    expect(fixture.closed).toContain('pane-1');
  });

  it('recovers a worker prompt from all three leading previews', () => {
    const fixture = makeControllerFixture({ stalled: true });
    const readAgent = fixture.herdr.agentRead;
    const previews = workerPrompt({ step: 'start', issue: 42 })
      .split('\n', 3)
      .map((line) => line.slice(0, 11))
      .join('\n');
    fixture.herdr.agentRead = (input) => input.name === 's42-start' ? previews : readAgent(input);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.sentKeys[0]).toEqual(['enter']);
    expect(fixture.closed).toContain('pane-1');
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

  it('stops after failed review1 without launching later queue steps', () => {
    const fixture = makeControllerFixture({ failedStep: 'review1' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(1);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-start', 's42-implement', 's42-review1']);

    expect(fixture.starts.some(({ name }) => /s42-(fix1|review2|fix2|verify|deliver)/.test(name))).toBe(false);
    expect(fixture.closed).toEqual(['pane-1', 'pane-2']);
  });

  it('selects visible review mode when prompt wait settles idle', () => {
    const fixture = makeControllerFixture({ reviewPromptStatus: 'settled' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.reviewMenuEvents).toEqual([
      'composer-visible', 'composer-keys:enter', 'mode-visible', 'mode-keys:enter',
      'branch-visible', 'branch-keys:down,enter',
      'composer-visible', 'composer-keys:enter', 'mode-visible', 'mode-keys:enter',
      'branch-visible', 'branch-keys:down,enter',
    ]);
  });

  it('does not resubmit review when Review Mode is already visible', () => {
    const fixture = makeControllerFixture({ reviewModeInitiallyVisible: true });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.prompts.filter(({ prompt }) => prompt === '/review')).toEqual([]);
    expect(fixture.reviewMenuEvents).toEqual([
      'mode-visible', 'mode-keys:enter', 'branch-visible', 'branch-keys:down,enter',
      'mode-visible', 'mode-keys:enter', 'branch-visible', 'branch-keys:down,enter',
    ]);
  });

  it('stops when interactive review mode cannot be selected', () => {
    const fixture = makeControllerFixture({ reviewPromptStatus: 'worker_failed' });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const reviewHandoff = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json');

    expect(result.status).toBe(1);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-start', 's42-implement', 's42-review1']);
    expect(fixture.closed).toEqual(['pane-1', 'pane-2']);
    expect(fs.existsSync(reviewHandoff)).toBe(false);
    expect(fixture.notifications.at(-1)?.body).toContain('s42-review1 left open');
  });

  it('stops when the branch menu transition is not observed', () => {
    const fixture = makeControllerFixture({ branchMenuTransition: false });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const reviewHandoff = path.join(fixture.cwd, '.omp/sdlc/handoffs/42-review1.json');

    expect(result.status).toBe(1);
    expect(fixture.sentKeys).toEqual([['enter']]);
    expect(fixture.reviewMenuEvents).toEqual(['mode-visible', 'mode-keys:enter']);
    expect(fs.existsSync(reviewHandoff)).toBe(false);
    expect(fixture.starts.map(({ name }) => name)).toEqual(['s42-start', 's42-implement', 's42-review1']);
  });

  it.each([
    ['issue', { handoffIssue: 43 }],
    ['step', { handoffStep: 'verify' }],
  ])('keeps the worker pane when handoff %s does not match', (_field, options) => {
    const fixture = makeControllerFixture(options);
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toHaveLength(0);
    expect(persisted.completed['42']).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'invalid_handoff' });
  });

  it('retries one transient agent startup failure in the same pane', () => {
    const fixture = makeControllerFixture({ agentStartStatuses: [1, 0] });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(0);
    expect(fixture.starts.slice(0, 2)).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
    ]);
    expect(persisted.failed).toBeNull();
  });

  it('fails closed after two agent startup failures', () => {
    const fixture = makeControllerFixture({ agentStartStatuses: [1, 1] });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-start', paneId: 'pane-1', kind: 'omp' },
    ]);
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'agent_start_failed' });
  });

  it('stops without completing the step when a new worker pane cannot close', () => {
    const fixture = makeControllerFixture({ paneCloseStatus: 1 });
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.starts).toEqual([{ name: 's42-start', paneId: 'pane-1', kind: 'omp' }]);
    expect(fixture.closed).toEqual(['pane-1']);
    expect(persisted.completed['42']).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'pane_close_failed' });
  });

  it('does not start a second worker when an issue worker is live', () => {
    const fixture = makeControllerFixture();
    fixture.herdr.listAgents = () => [{ name: 's42-verify', pane_id: 'kept-pane', state: 'working' }];
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result.status).toBe(0);
    expect(fixture.starts).toHaveLength(0);
    expect(result.stdout).toContain('no second worker started');
  });

  it.each([
    ['snake-case idle', { result: { agent: { agent_status: 'idle' } } }],
    ['camel-case done', { result: { agent: { agentStatus: 'done' } } }],
  ])('resumes a retained worker from realistic %s Herdr JSON', (_label, agentPayload) => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, agentPayload);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('no second worker started');
    expect(fixture.starts).toEqual([
      { name: 's42-implement', paneId: 'pane-1', kind: 'omp' },
      { name: 's42-review1', paneId: 'pane-2', kind: 'omp' },
      { name: 's42-fix1', paneId: 'pane-3', kind: 'omp' },
      { name: 's42-review2', paneId: 'pane-4', kind: 'omp' },
      { name: 's42-fix2', paneId: 'pane-5', kind: 'omp' },
      { name: 's42-verify', paneId: 'pane-6', kind: 'omp' },
      { name: 's42-deliver', paneId: 'pane-7', kind: 'omp' },
    ]);
    expect(fixture.closed).toEqual([
      'kept-pane', 'pane-1', 'pane-2', 'pane-3', 'pane-4', 'pane-5', 'pane-6', 'pane-7',
    ]);
    expect(persisted.completed['42']).toEqual([
      'start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver',
    ]);
  });

  it('submits a pasted prompt retained from an earlier run', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { agent: { agent_status: 'idle' } } });
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    const readAgent = fixture.herdr.agentRead;
    fixture.herdr.agentRead = (input) => input.name === 's42-start'
      ? workerPrompt({ step: 'start', issue: 42 })
      : readAgent(input);

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(0);
    expect(fixture.sentKeys[0]).toEqual(['enter']);
    expect(fixture.starts.map(({ name }) => name)).not.toContain('s42-start');
    expect(fixture.closed).toContain('kept-pane');
  });

  it('keeps a retained pane open when recovered prompt settlement fails', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { agent: { agent_status: 'idle' } } });
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    const readAgent = fixture.herdr.agentRead;
    fixture.herdr.agentRead = (input) => input.name === 's42-start'
      ? workerPrompt({ step: 'start', issue: 42 })
      : readAgent(input);
    const waitAgent = fixture.herdr.agentWait;
    fixture.herdr.agentWait = (input) => {
      const result = waitAgent(input);
      return input.until ? result : { status: 1 };
    };

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.cwd, '.omp/sdlc/run.json'), 'utf8'));

    expect(result.status).toBe(1);
    expect(fixture.closed).toEqual([]);
    expect(persisted.failed).toEqual({ issue: 42, step: 'start', reasonCode: 'worker_failed' });
  });

  it('does not press enter on a retained worker without a pasted prompt', () => {
    const fixture = makeControllerFixture();
    configurePassedRetainedStartWorker(fixture, { result: { agent: { agent_status: 'idle' } } });
    fs.rmSync(path.join(fixture.cwd, '.omp/sdlc/handoffs/42-start.json'));
    fixture.herdr.agentRead = () => 'You are the reviewer for unrelated work';

    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });

    expect(result.status).toBe(1);
    expect(fixture.sentKeys).toEqual([]);
    expect(fixture.closed).toEqual([]);
  });


  it('stops on an unapproved spec with the write-spec instruction', () => {
    const fixture = makeControllerFixture();
    fs.writeFileSync(path.join(fixture.cwd, 'specs/42-ship-it/design.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = runExecute({ args: '#42', cwd: fixture.cwd, env, run: fixture.run, herdr: fixture.herdr });
    expect(result).toEqual({ status: 0, stdout: 'Run /sdlc-write-spec #42\n', stderr: '' });
    expect(fixture.starts).toHaveLength(0);
  });
});
