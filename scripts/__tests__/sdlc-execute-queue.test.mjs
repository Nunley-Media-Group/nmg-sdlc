import { describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guidancePath, resolveChangeSelection, writeGuidance } from '../../src/sdlc-test-selection.mjs';
import { enterMergeQueue, leaveMergeQueue, listMergeQueue, recordInFlight } from '../sdlc-shared-state.mjs';
import { ensureWorktree, listWorktrees } from '../sdlc-worktree.mjs';
import { roots, env, git, result, fixture, phasedWorker, advanceOrigin, ISSUE_EVIDENCE_FIELDS } from '../__fixtures__/sdlc-execute-fixture.mjs';

describe('parallel delivery: worktrees, review-first verify and the merge queue (#551)', () => {
  const stages = (f) => f.state.prompts.map(({ name, prompt }) => {
    const step = name.split('-')[1];
    return step !== 'verify' ? step : prompt.includes('Verify phase: gate.') ? 'gate' : 'review';
  });
  // A start worker that does what start-issue does: the issue gets its own worktree and the invoking checkout stays.
  const worktreeStart = (f) => {
    roots.push(`${f.root}-wt`);
    const worktree = ensureWorktree({ cwd: f.root, branch: '42-example', base: 'main' });
    git(worktree.path, 'push', '-u', 'origin', '42-example');
    f.state.workdir = worktree.path;
    return { status: 'passed', next: 'implement' };
  };

  it('works the issue in its own worktree and leaves a dirty primary checkout untouched (AC1)', () => {
    const f = fixture({ branch: 'main' });
    fs.writeFileSync(path.join(f.root, 'scratch.txt'), 'uncommitted local work\n');
    fs.appendFileSync(path.join(f.root, 'README.md'), 'local edit\n');
    const primary = () => ({ branch: git(f.root, 'branch', '--show-current'), head: git(f.root, 'rev-parse', 'HEAD'),
      status: git(f.root, 'status', '--porcelain', '--', '.', ':(exclude).nmg-sdlc') });
    const before = primary();
    const leases = [];
    f.setWorker((context) => {
      if (context.step === 'start') return worktreeStart(f);
      // Every later stage holds its lease on the worktree, never on the invoking checkout.
      leases.push({ primary: fs.existsSync(path.join(f.root, '.nmg-sdlc/controller.lock')),
        worktree: fs.existsSync(path.join(f.state.workdir, '.nmg-sdlc/controller.lock')) });
      if (context.step === 'implement') {
        fs.writeFileSync(path.join(f.state.workdir, 'helper.py'), 'def helper(): return 42\n');
        context.publish('fix: implement #42');
        return { status: 'passed', next: 'verify' };
      }
      return phasedWorker()(context);
    });
    const response = f.execute('#42');
    expect(response).toMatchObject({ status: 0, stderr: '' });
    expect(response.stdout).toContain('#42: MERGED and CLOSED\n#42: worktree cleanup: removed 42-example');
    for (const reason of ['default_checkout_failed', 'issue_branch_unreadable', 'branch_checkout_failed', 'active_issue_conflict']) {
      expect(response.stdout + response.stderr).not.toContain(reason);
    }
    expect(stages(f)).toEqual(['start', 'implement', 'review', 'gate', 'deliver']);
    const worktree = fs.realpathSync(path.dirname(f.state.workdir)) && f.state.workdir;
    expect(f.state.starts.map((start) => start.cwd)).toEqual([f.root, worktree, worktree, worktree, worktree]);
    expect(leases).toEqual(leases.map(() => ({ primary: false, worktree: true })));
    expect(primary()).toEqual(before);
    // After delivery the worktree, its local branch and the remote branch are gone.
    expect(fs.existsSync(worktree)).toBe(false);
    expect(listWorktrees(f.root)).toHaveLength(1);
    expect(git(f.root, 'branch', '--list', '42-example')).toBe('');
    expect(git(f.root, 'ls-remote', '--heads', 'origin', '42-example')).toBe('');
    expect(listMergeQueue(f.root)).toEqual([]);
  });

  it('resumes an existing worktree for the issue instead of starting it again (FR5)', () => {
    const f = fixture({ branch: 'main' });
    worktreeStart(f);
    fs.writeFileSync(path.join(f.state.workdir, 'helper.py'), 'def helper(): return 7\n');
    f.publish('fix: partial work from an abandoned run');
    f.setWorker(phasedWorker());
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(stages(f)).toEqual(['review', 'gate', 'deliver']);
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
  });

  it('hands every review finding back in one handoff and runs no validation or version preparation (AC14)', () => {
    const f = fixture();
    let gates = 0;
    let reviews = 0;
    f.setWorker((context) => {
      const phase = context.step !== 'verify' ? null : context.prompt.includes('Verify phase: gate.') ? 'gate' : 'review';
      if (phase === 'review' && (reviews += 1) === 1) {
        context.passReview('findings');
        return { status: 'failed', phase: 'review', next: 'implement', reasonCode: 'review_findings',
          summary: 'Review found 2 finding(s), 2 blocking, with no validation run: F1 [blocking] retry loop never backs off; F2 [blocking] empty input raises',
          findings: [{ id: 'F1' }, { id: 'F2' }], artifacts: ['.nmg-sdlc/verification/42-review.json'] };
      }
      if (phase === 'gate') gates += 1;
      if (context.step === 'implement') {
        expect(gates).toBe(0);
        expect(f.state.versionPreparations).toEqual([]);
        fs.appendFileSync(path.join(f.root, 'helper.py'), '# both findings repaired\n');
        context.publish('fix: repair review findings for #42');
        return { status: 'passed', next: 'verify' };
      }
      return phasedWorker()(context);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(stages(f)).toEqual(['review', 'implement', 'review', 'gate', 'deliver']);
    const repair = f.state.prompts[1].prompt;
    expect(repair).toContain('review_findings');
    expect(repair).toContain('F1 [blocking] retry loop never backs off');
    expect(repair).toContain('F2 [blocking] empty input raises');
    expect(f.state.prompts[0].prompt).toContain('Run no steering validation in this phase');
    expect(gates).toBe(1);
  });

  it('waits behind the queue head and runs no gate or version preparation until it is the head (AC3)', () => {
    const f = fixture();
    enterMergeQueue(f.root, { issue: 7, branch: '7-earlier', worktree: f.root });
    f.setWorker(phasedWorker());
    const waits = [];
    const sleep = (milliseconds) => {
      waits.push({ milliseconds, stages: stages(f), preparations: f.state.versionPreparations.length,
        queue: listMergeQueue(f.root).map((entry) => entry.issue) });
      // The head merges and leaves on the second poll.
      if (waits.length === 2) leaveMergeQueue(f.root, 7);
    };
    const response = f.execute('#42', { sleep });
    expect(response).toMatchObject({ status: 0 });
    expect(response.stdout).toContain('#42: queued at position 2 behind #7\n');
    expect(waits).toHaveLength(2);
    for (const wait of waits) expect(wait).toMatchObject({ stages: ['review'], preparations: 0, queue: [7, 42] });
    expect(stages(f)).toEqual(['review', 'gate', 'deliver']);
    expect(listMergeQueue(f.root)).toEqual([]);
  });

  it('drops a queue entry whose controller is dead instead of waiting behind it', () => {
    const f = fixture();
    enterMergeQueue(f.root, { issue: 7, branch: '7-crashed', worktree: f.root, pid: 2 ** 22 + 12345 });
    f.setWorker(phasedWorker());
    const response = f.execute('#42', { sleep: () => { throw new Error('must not wait'); } });
    expect(response).toMatchObject({ status: 0 });
    expect(response.stdout).not.toContain('queued at position');
  });

  it('leaves the queue and gives up its version when the gate fails at the queue head (AC5, FR9)', () => {
    const f = fixture();
    let version = 1;
    f.setPrepareVersion(({ root }) => {
      const subjects = git(root, 'log', '--format=%s', 'origin/main..HEAD').split('\n');
      const delivered = subjects.indexOf('feat: deliver issue #42');
      const reverted = subjects.findIndex((subject) => subject.startsWith('Revert "feat: deliver issue #42"'));
      if (delivered !== -1 && (reverted === -1 || delivered < reverted)) return null;
      // Only the version artifact is committed, as prepare-version does; runtime state stays untracked.
      fs.writeFileSync(path.join(root, 'VERSION'), `1.${version += 1}.0\n`);
      git(root, 'add', 'VERSION');
      git(root, 'commit', '-m', 'feat: deliver issue #42');
      git(root, 'push', 'origin', 'HEAD:42-example');
      return null;
    });
    let gates = 0;
    let atImplement = null;
    let delivered = null;
    f.setWorker((context) => {
      const phase = context.step !== 'verify' ? null : context.prompt.includes('Verify phase: gate.') ? 'gate' : 'review';
      if (phase === 'gate' && (gates += 1) === 1) {
        return { status: 'failed', next: 'implement', reasonCode: 'verification_not_green',
          summary: 'repository.tests failed after integrating the default branch', artifacts: ['.nmg-sdlc/verification/42.json'] };
      }
      if (context.step === 'implement') {
        atImplement = { queue: listMergeQueue(f.root).map((entry) => entry.issue),
          subject: git(f.root, 'log', '-1', '--format=%s'), version: fs.existsSync(path.join(f.root, 'VERSION')),
          published: git(f.root, 'rev-parse', 'HEAD') === git(f.root, 'ls-remote', '--heads', 'origin', '42-example').slice(0, 40) };
        fs.appendFileSync(path.join(f.root, 'helper.py'), '# repaired\n');
        git(f.root, 'add', 'helper.py');
        git(f.root, 'commit', '-m', 'fix: repair the gate failure for #42');
        git(f.root, 'push', 'origin', 'HEAD:42-example');
        return { status: 'passed', next: 'verify' };
      }
      if (context.step === 'deliver') {
        delivered = { subjects: git(f.root, 'log', '--format=%s', 'origin/main..HEAD').split('\n'),
          version: fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8') };
      }
      return phasedWorker()(context);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(stages(f)).toEqual(['review', 'gate', 'implement', 'review', 'gate', 'deliver']);
    // The failed head left the queue, so the next entry can proceed, and its version commit was reverted.
    expect(atImplement).toEqual({ queue: [], subject: 'Revert "feat: deliver issue #42"', version: false, published: true });
    expect(f.state.prompts[2].prompt).toContain('repository.tests failed after integrating the default branch');
    // The branch that was delivered claimed a fresh version when it reached the queue head again.
    expect(delivered.subjects.filter((subject) => subject === 'feat: deliver issue #42')).toHaveLength(2);
    expect(delivered.version).toBe('1.3.0\n');
  });

  it('sends an integration conflict at the queue head back to implement with the conflicting files', () => {
    const f = fixture();
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-conflict-'));
    roots.push(clone);
    execFileSync('git', ['clone', '--quiet', '--branch', 'main', git(f.root, 'remote', 'get-url', 'origin'), clone], { encoding: 'utf8' });
    git(clone, 'config', 'user.name', 'Controller Test');
    git(clone, 'config', 'user.email', 'controller@example.test');
    fs.writeFileSync(path.join(clone, 'helper.py'), 'def helper(): return "merged elsewhere"\n');
    git(clone, 'add', '.');
    git(clone, 'commit', '-m', 'feat: merge #9');
    git(clone, 'push', 'origin', 'HEAD:main');
    f.setWorker((context) => {
      if (context.step === 'implement') {
        expect(listMergeQueue(f.root)).toEqual([]);
        expect(git(f.root, 'status', '--porcelain', '--', '.', ':(exclude).nmg-sdlc')).toBe('');
        git(f.root, 'merge', '-X', 'ours', '--no-edit', 'origin/main');
        fs.appendFileSync(path.join(f.root, 'helper.py'), '# conflict resolved\n');
        context.publish('fix: integrate main for #42');
        return { status: 'passed', next: 'verify' };
      }
      return phasedWorker()(context);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(stages(f)).toEqual(['review', 'implement', 'review', 'gate', 'deliver']);
    expect(f.state.prompts[1].prompt).toContain('integration_conflict');
    expect(f.state.prompts[1].prompt).toContain('conflicts in helper.py');
  });

  it('takes the default branch content for a conflict confined to CHANGELOG.md at the queue head, keeps the branch entry, and keeps delivering (#556 AC4)', () => {
    const f = fixture();
    // The branch and the default branch each add their own CHANGELOG.md, so merging origin/main conflicts in it alone.
    fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n- Branch entry (#42)\n');
    f.publish('docs: changelog for #42');
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-changelog-'));
    roots.push(clone);
    execFileSync('git', ['clone', '--quiet', '--branch', 'main', git(f.root, 'remote', 'get-url', 'origin'), clone], { encoding: 'utf8' });
    git(clone, 'config', 'user.name', 'Controller Test');
    git(clone, 'config', 'user.email', 'controller@example.test');
    const merged = '# Changelog\n\n## [1.1.0]\n\n- Merged elsewhere (#9)\n';
    fs.writeFileSync(path.join(clone, 'CHANGELOG.md'), merged);
    git(clone, 'add', '.');
    git(clone, 'commit', '-m', 'feat: merge #9');
    git(clone, 'push', 'origin', 'HEAD:main');
    const mainHead = git(clone, 'rev-parse', 'HEAD');
    let atGate = null;
    f.setWorker(phasedWorker(({ phase }) => {
      if (phase !== 'gate') return;
      atGate = { changelog: fs.readFileSync(path.join(f.root, 'CHANGELOG.md'), 'utf8'),
        helper: fs.readFileSync(path.join(f.root, 'helper.py'), 'utf8'),
        integrated: spawnSync('git', ['merge-base', '--is-ancestor', mainHead, 'HEAD'], { cwd: f.root }).status === 0,
        clean: git(f.root, 'status', '--porcelain', '--', '.', ':(exclude).nmg-sdlc'),
        published: git(f.root, 'rev-parse', 'HEAD') === git(f.root, 'ls-remote', '--heads', 'origin', '42-example').slice(0, 40),
        queue: listMergeQueue(f.root).map((entry) => entry.issue) };
    }));
    const response = f.execute('#42');
    expect(response).toMatchObject({ status: 0, stderr: '' });
    expect(response.stdout).toContain('#42: integration took origin/main for CHANGELOG.md and kept 1 branch changelog entry\n');
    expect(response.stdout).not.toContain('queue_integration_conflict');
    expect(response.stdout).toContain('#42: MERGED and CLOSED');
    // No repair was dispatched: the branch stayed at the queue head and went straight to its gate.
    expect(stages(f)).toEqual(['review', 'gate', 'deliver']);
    expect(atGate).toEqual({ changelog: '# Changelog\n\n## [Unreleased]\n\n### Changed\n\n- Branch entry (#42)\n\n## [1.1.0]\n\n- Merged elsewhere (#9)\n', helper: 'def helper(): return True\n', integrated: true, clean: '',
      published: true, queue: [42] });
    expect(listMergeQueue(f.root)).toEqual([]);
  });

  it('sends a CHANGELOG.md-only conflict back to implement when a side of the conflict cannot be read (#560 AC5)', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n- Branch entry (#42)\n');
    f.publish('docs: changelog for #42');
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-changelog-unreadable-'));
    roots.push(clone);
    execFileSync('git', ['clone', '--quiet', '--branch', 'main', git(f.root, 'remote', 'get-url', 'origin'), clone], { encoding: 'utf8' });
    git(clone, 'config', 'user.name', 'Controller Test');
    git(clone, 'config', 'user.email', 'controller@example.test');
    fs.writeFileSync(path.join(clone, 'CHANGELOG.md'), '# Changelog\n\n## [1.1.0]\n\n- Merged elsewhere (#9)\n');
    git(clone, 'add', '.');
    git(clone, 'commit', '-m', 'feat: merge #9');
    git(clone, 'push', 'origin', 'HEAD:main');
    let atImplement = null;
    f.setWorker((context) => {
      if (context.step === 'implement') {
        atImplement = { merging: fs.existsSync(path.join(f.root, '.git', 'MERGE_HEAD')),
          changelog: fs.readFileSync(path.join(f.root, 'CHANGELOG.md'), 'utf8') };
        git(f.root, 'merge', '-X', 'ours', '--no-edit', 'origin/main');
        context.publish('fix: integrate main for #42');
        return { status: 'passed', next: 'verify' };
      }
      return phasedWorker()(context);
    });
    let shows = 0;
    const run = (command, args, options) => {
      if (command === 'git' && args[0] === 'show' && args[1] === ':2:CHANGELOG.md' && (shows += 1) === 1) {
        return { status: 128, stdout: '', stderr: 'fatal: path not in index' };
      }
      return f.run(command, args, options);
    };
    expect(f.execute('#42', { run })).toMatchObject({ status: 0 });
    expect(shows).toBe(1);
    // A repair that only touches the version artifacts needs no second review.
    expect(stages(f)).toEqual(['review', 'implement', 'gate', 'deliver']);
    expect(f.state.prompts[1].prompt).toContain('integration_conflict');
    expect(f.state.prompts[1].prompt).toContain('conflicts in CHANGELOG.md');
    // The failed resolution aborted the merge, so implement got the branch as it was.
    expect(atImplement).toEqual({ merging: false, changelog: '# Changelog\n\n## [Unreleased]\n\n- Branch entry (#42)\n' });
  });

  it('reports the files an in-flight issue also declares, at start and in supervised reports (AC6)', () => {
    const f = fixture();
    recordInFlight(f.root, { issue: 7, branch: '7-other', worktree: f.root, stage: 'implement',
      declaredFiles: ['helper.py', 'docs/'] }, { env });
    recordInFlight(f.root, { issue: 8, branch: '8-unrelated', worktree: f.root, stage: 'implement',
      declaredFiles: ['elsewhere.py'] }, { env });
    const reports = [];
    const response = f.execute('#42', { supervise: (report) => { reports.push(report); return { action: 'accept' }; } });
    expect(response).toMatchObject({ status: 0 });
    expect(response.stdout).toContain('#42: overlaps in-flight #7 (7-other) on helper.py\n');
    expect(response.stdout).not.toContain('#8');
    expect(reports[0].overlaps).toEqual([{ issue: 7, branch: '7-other', files: ['helper.py'] }]);
  });
});

describe('@SCN008 a rejected selection escalates to the orchestrator (#584 AC7, FR7)', () => {
  const steps = (f) => f.state.starts.map((entry) => entry.step);
  const escalation = { kind: 'selection', reasonCode: 'selection_unaccounted', uncovered: [], missingSurfaces: [], unaccounted: ['hooks/register.ts'] };
  const escalate = { status: 'failed', next: 'verify', reasonCode: 'selection_escalation', escalation,
    summary: 'Selection for #42 was rejected as selection_unaccounted: hooks/register.ts', artifacts: [] };

  it('offers only redispatch and halt, then reruns verify (not implement) with head-bound guidance', () => {
    const f = fixture();
    let verifications = 0;
    let guidance = null;
    f.setWorker((context) => {
      if (context.step === 'verify') {
        if (verifications++ === 0) return escalate;
        const file = path.join(context.root, '.nmg-sdlc/verification/selection-guidance-42.json');
        guidance = fs.existsSync(file) ? { ...JSON.parse(fs.readFileSync(file, 'utf8')), head: git(context.root, 'rev-parse', 'HEAD') } : null;
        context.passGate();
        return { status: 'passed', next: 'deliver' };
      }
      context.state.merged = true;
      context.state.closed = true;
      return { status: 'passed', next: null };
    });
    const reports = [];
    const supervise = (report) => {
      reports.push(report);
      if (reports.length === 1) return { action: 'redispatch', text: 'check hooks tests' };
      return { action: 'accept' };
    };
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['verify', 'verify', 'deliver']);
    expect(reports[0]).toMatchObject({ kind: 'stage', stage: 'verify', decisions: ['redispatch', 'halt'], escalation });
    expect(guidance).toMatchObject({ schemaVersion: 1, issue: 42, text: 'check hooks tests' });
    expect(guidance.headSha).toBe(guidance.head);
    expect(f.state.prompts[1].prompt).toContain('Supervisor guidance: check hooks tests');
    // The rerun keeps the verify stage entry: a selection escalation is not a repair.
    expect(f.state.starts.map((entry) => entry.entry)).toEqual(['verify', 'verify', 'deliver']);
    expect(f.state.starts.map((entry) => entry.model)).toEqual(['opus', 'opus', 'haiku']);
  });

  it('binds the guidance again to the head the rerun verify runs at after the queue head integrates the default branch', () => {
    const f = fixture();
    let gates = 0;
    let rerun = null;
    let escalatedHead = null;
    f.setWorker((context) => {
      const phase = context.step !== 'verify' ? null : context.prompt.includes('Verify phase: gate.') ? 'gate' : 'review';
      if (phase === 'review') { context.passReview(); return { status: 'passed', next: 'verify', phase: 'review' }; }
      if (phase === 'gate') {
        if (gates++ === 0) { escalatedHead = git(context.root, 'rev-parse', 'HEAD'); return escalate; }
        const file = path.join(context.root, '.nmg-sdlc/verification/selection-guidance-42.json');
        rerun = { guidance: JSON.parse(fs.readFileSync(file, 'utf8')), head: git(context.root, 'rev-parse', 'HEAD'), prompt: context.prompt };
        context.passGate();
        return { status: 'passed', next: 'deliver' };
      }
      context.state.merged = true;
      context.state.closed = true;
      return { status: 'passed', next: null };
    });
    const supervise = (report) => {
      if (!report.escalation) return { action: 'accept' };
      // The default branch moves while the supervisor decides, so the rerun gate runs at a new, integrated head.
      advanceOrigin(f.root);
      return { action: 'redispatch', text: 'check hooks tests' };
    };
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(rerun.head).not.toBe(escalatedHead);
    expect(rerun.guidance).toMatchObject({ issue: 42, headSha: rerun.head, text: 'check hooks tests' });
    // The rerun is told not to repair code for a selection escalation.
    expect(rerun.prompt).toContain('A selection escalation is not a code defect');
    expect(rerun.prompt).not.toContain('Diagnose the cause and choose a different testable repair');
  });

  it('carries the redispatch guidance into the rerun selection prompt and records guidanceSupplied', async () => {
    const f = fixture();
    let verifications = 0;
    let rerun = null;
    f.setWorker((context) => {
      if (context.step === 'verify') {
        if (verifications++ === 0) return escalate;
        rerun = { root: context.root, head: git(context.root, 'rev-parse', 'HEAD') };
        context.passGate();
        return { status: 'passed', next: 'deliver' };
      }
      context.state.merged = true;
      context.state.closed = true;
      return { status: 'passed', next: null };
    });
    let reported = 0;
    const supervise = () => (reported++ === 0 ? { action: 'redispatch', text: 'select scripts/__tests__/hooks.test.mjs' } : { action: 'accept' });
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    // The verify rerun's selection, at the head the controller bound the guidance to, sends that guidance to Claude.
    let input = null;
    const runtime = { surfaces: [], validations: [], selection: { docPaths: [] }, steeringHash: 'sha256:test', snippets: [] };
    const selection = await resolveChangeSelection({ projectRoot: rerun.root, issue: 42, baseRef: 'HEAD', paths: ['hooks/register.ts'],
      runtime, models: {}, headSha: rerun.head,
      runSelection: (request) => { input = request.input; return { status: 0, stdout: JSON.stringify({ structured_output: { mode: 'all', tests: [], surfaces: [] } }) }; } });
    expect(input).toContain('Supervisor guidance:\nselect scripts/__tests__/hooks.test.mjs');
    expect(selection.guidanceSupplied).toBe(true);
  });

  it('reports a rejected selection in the current gate as selection_escalation and never routes it to implement', () => {
    const f = fixture();
    f.passGate();
    const file = path.join(f.root, '.nmg-sdlc/verification/42.json');
    const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...artifact, ceiling: 'Fail',
      results: artifact.results.map((item) => ({ ...item, effectiveStatus: 'failed', result: { ...item.result, status: 'failed' } })),
      selection: { mode: 'selected', reason: 'selected', rejection: escalation } }));
    f.setWorker((context) => {
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'implement') return { status: 'failed', next: null, reasonCode: 'implementation_failed', summary: 'routed to implement', artifacts: [] };
      context.state.merged = true;
      context.state.closed = true;
      return { status: 'passed', next: null };
    });
    expect(f.execute('#42', { supervise: () => ({ action: 'accept' }) })).toMatchObject({ status: 0 });
    expect(steps(f)).not.toContain('implement');
    expect(steps(f)[0]).toBe('verify');
    expect(f.state.starts[0].entry).toBe('verify');
    // Without supervisor guidance the rerun is told only to rerun the gate.
    expect(f.state.prompts[0].prompt).toContain('A selection escalation is not a code defect: rerun the gate, and never edit source or steering to pass it.');
  });

  it('recovers guidance stored by an earlier controller at the next verify, and an implement stage deletes it', () => {
    const f = fixture();
    writeGuidance(f.root, 42, 'a'.repeat(40), 'check hooks tests');
    let verifications = 0;
    const seen = [];
    f.setWorker((context) => {
      if (context.step === 'verify') {
        const file = guidancePath(context.root, 42);
        seen.push({ step: 'verify', guidance: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null,
          head: git(context.root, 'rev-parse', 'HEAD') });
        if (verifications++ === 0) {
          fs.mkdirSync(path.join(f.root, '.nmg-sdlc/verification'), { recursive: true });
          fs.writeFileSync(path.join(f.root, '.nmg-sdlc/verification/42.json'), JSON.stringify({ schemaVersion: 1, issue: 42,
            generatedAt: new Date().toISOString(), identity: { headSha: git(f.root, 'rev-parse', 'HEAD') }, ceiling: 'Fail',
            coverage: { complete: true }, results: [] }));
          return { status: 'failed', next: 'implement', reasonCode: 'verification_not_green', summary: 'tests failed', artifacts: [] };
        }
        context.passGate();
        return { status: 'passed', next: 'deliver' };
      }
      if (context.step === 'implement') {
        seen.push({ step: 'implement', stored: fs.existsSync(guidancePath(context.root, 42)) });
        context.publish('fix: finish #42');
        return { status: 'passed', next: 'verify' };
      }
      context.state.merged = true;
      context.state.closed = true;
      return { status: 'passed', next: null };
    });
    expect(f.execute('#42', { supervise: (report) => ({ action: report.kind === 'stage' ? 'accept' : 'continue' }) })).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['verify', 'implement', 'verify', 'deliver']);
    // The restarted controller binds the stored guidance to the head its first verify runs at.
    expect(seen[0].guidance).toMatchObject({ issue: 42, text: 'check hooks tests', headSha: seen[0].head });
    expect(seen[1]).toEqual({ step: 'implement', stored: false });
    expect(seen[2].guidance).toBeNull();
  });

  it('names a failed opted-in validation that is not required in the implement repair evidence', () => {
    const f = fixture();
    f.passGate();
    const file = path.join(f.root, '.nmg-sdlc/verification/42.json');
    const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tests = artifact.results.find((item) => item.id === 'repository.tests');
    Object.assign(tests, { required: false, effectiveStatus: 'failed', selection: { reason: 'selected' },
      result: { ...tests.result, status: 'failed' } });
    fs.writeFileSync(file, JSON.stringify({ ...artifact, ceiling: 'Fail', selection: { mode: 'selected', reason: 'selected', rejection: null } }));
    f.setWorker((context) => {
      if (context.step === 'implement') { context.publish('fix: finish #42'); return { status: 'passed', next: 'verify' }; }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      context.state.merged = true;
      context.state.closed = true;
      return { status: 'passed', next: null };
    });
    expect(f.execute('#42', { supervise: (report) => ({ action: report.kind === 'stage' ? 'accept' : 'continue' }) })).toMatchObject({ status: 0 });
    expect(steps(f)[0]).toBe('implement');
    expect(f.state.prompts[0].prompt).toContain('Current registered gate is Fail: repository.tests');
  });

  it('stops an unsupervised run with selection_escalation', () => {
    const f = fixture();
    f.setWorker((context) => (context.step === 'verify' ? escalate : { status: 'passed', next: null }));
    const result = f.execute('#42');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('selection_escalation: Selection for #42 was rejected as selection_unaccounted');
    expect(steps(f)).toEqual(['verify']);
  });
});

describe('@SCN003 a gate cut off by a lost session reruns the gate (#564 AC3, FR4)', () => {
  const stages = (f) => f.state.prompts.map(({ name, prompt }) => {
    const step = name.split('-')[1];
    return step !== 'verify' ? step : prompt.includes('Verify phase: gate.') ? 'gate' : 'review';
  });
  // A branch at the queue head with its version prepared, whose registered gate a lost session left with `status`.
  const cutOff = (status) => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'VERSION'), '1.1.0\n');
    f.publish('feat: deliver issue #42');
    f.passGate();
    f.passReview();
    const file = path.join(f.root, '.nmg-sdlc/verification/42.json');
    const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
    const smoke = artifact.results.find((item) => item.id === 'repository.nmg-sdlc-smoke');
    Object.assign(smoke, { effectiveStatus: status, result: { ...smoke.result, status } });
    fs.writeFileSync(file, JSON.stringify({ ...artifact, ceiling: status === 'incomplete' ? 'Incomplete' : 'Fail' }));
    const head = git(f.root, 'rev-parse', 'HEAD');
    const seen = [];
    f.setWorker((context) => {
      seen.push({ step: context.step, head: git(f.root, 'rev-parse', 'HEAD'),
        subjects: git(f.root, 'log', '--format=%s', 'origin/main..HEAD').split('\n') });
      if (context.step === 'implement') { context.publish('fix: repair #42'); return { status: 'passed', next: 'verify' }; }
      return phasedWorker()(context);
    });
    return { f, head, seen };
  };
  it('dispatches the gate again at the reviewed head, with no revert, failure or implement dispatch', () => {
    const { f, head, seen } = cutOff('incomplete');
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(stages(f)).toEqual(['gate', 'deliver']);
    expect(seen[0]).toMatchObject({ step: 'verify', head });
    expect(f.state.prompts[0].prompt).not.toContain('Previous attempted approach');
    // Delivery merges the version prepared before the cut-off, never reverted or prepared again.
    const delivered = seen.find(({ step }) => step === 'deliver').subjects;
    expect(delivered.some((subject) => subject.startsWith('Revert "feat: deliver issue #42"'))).toBe(false);
    expect(delivered.filter((subject) => subject === 'feat: deliver issue #42')).toHaveLength(1);
  });

  it('still routes a gate with a failed required check to implement', () => {
    const { f } = cutOff('failed');
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(stages(f)[0]).toBe('implement');
    expect(f.state.prompts[0].prompt).toContain('Current registered gate is Fail: repository.nmg-sdlc-smoke');
  });
});

describe('@SCN002 transient GitHub reads while collecting issue evidence (#575)', () => {
  // Fails the first evidence read with the given stderr; every other call goes to the fixture.
  const failFirstEvidenceRead = (f, stderr) => {
    let reads = 0;
    return (command, args, options) => {
      if (command === 'gh' && args[0] === 'issue' && args[1] === 'view'
        && args[args.indexOf('--json') + 1] === ISSUE_EVIDENCE_FIELDS && (reads += 1) === 1) {
        return { status: 1, stdout: '', stderr };
      }
      return f.run(command, args, options);
    };
  };

  it('@SCN002 retries a transient 5xx issue read after 1 s and continues the run without losing the decision', () => {
    const f = fixture();
    f.setWorker(phasedWorker());
    const sleeps = [];
    const response = f.execute('#42', {
      run: failFirstEvidenceRead(f, 'HTTP 502: Bad Gateway\n'),
      sleep: (milliseconds) => sleeps.push(milliseconds),
    });
    expect(response).toMatchObject({ status: 0 });
    expect(response.stderr).not.toContain('evidence unavailable');
    expect(sleeps).toEqual([1000]);
    expect(f.state.finished).toBeGreaterThan(0);
  });

  it('@SCN002 does not retry a non-transient issue read failure such as HTTP 404', () => {
    const f = fixture();
    f.setWorker(phasedWorker());
    const sleeps = [];
    const response = f.execute('#42', {
      run: failFirstEvidenceRead(f, 'HTTP 404: Not Found\n'),
      sleep: (milliseconds) => sleeps.push(milliseconds),
    });
    expect(sleeps).toEqual([]);
    expect(response.status).not.toBe(0);
    expect(response.stderr).toContain('issue #42 evidence unavailable');
  });
});
