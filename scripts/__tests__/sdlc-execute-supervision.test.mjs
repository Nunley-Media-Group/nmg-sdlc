import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from '../sdlc-execute.mjs';
import { reconcileBackground } from '../../src/execute-host.mjs';
import { packageRoot } from '../../src/sdlc-workflows.mjs';
import { git, fixture } from '../__fixtures__/sdlc-execute-fixture.mjs';

describe('worker supervision while its background work runs (#470)', () => {
  const marker = (f) => path.join(f.root, '.nmg-sdlc/handoffs/42-verify.json.waiting');
  const deliver = ({ state }) => { state.merged = true; state.closed = true; return { status: 'passed', next: null }; };

  it('keeps a worker waiting on its background gate until its later handoff', () => {
    const f = fixture();
    let gateRunning = false;
    f.setWorker((context) => {
      if (context.step === 'verify') {
        fs.mkdirSync(path.dirname(marker(f)), { recursive: true });
        fs.writeFileSync(marker(f), 'sdlc-verify-steering.mjs\n');
        gateRunning = true;
        // Settled with its marker: the background gate's notification resumes the turn, and the turn then ends
        // with the passing handoff once the controller has removed the marker.
        context.record.onWait = ({ timeoutMs }, record) => {
          if (timeoutMs !== 60000 || !gateRunning) return;
          gateRunning = false;
          record.status = 'running';
          record.onFinish = () => {
            expect(fs.existsSync(marker(f))).toBe(false);
            f.passGate();
            f.writeHandoff('verify', { status: 'passed', next: 'deliver' });
          };
        };
        return { handoff: false };
      }
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.step)).toEqual(['verify', 'deliver']);
    expect(f.state.waits).toContainEqual({ agentId: f.state.starts[0].agentId, until: 'started', timeoutMs: 60000 });
    expect(f.state.reminders).toEqual([]);
    // Each stage's worker is stopped once its stage finishes (#638 FR3), so every spawned worker ends stopped.
    expect(f.state.stops).toEqual(f.state.starts.map((entry) => entry.agentId));
  });

  it('removes a stale waiting marker and reminds a settled worker once before it counts as stopped', () => {
    const f = fixture();
    fs.mkdirSync(path.dirname(marker(f)), { recursive: true });
    fs.writeFileSync(marker(f), 'left by an earlier invocation\n');
    f.setWorker((context) => {
      if (context.step === 'verify') return { handoff: false };
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    f.setReminder(({ step, passGate }) => {
      expect(step).toBe('verify');
      passGate();
      return { status: 'passed', next: 'deliver' };
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.reminders).toHaveLength(1);
    expect(f.state.reminders[0].prompt).toContain('.nmg-sdlc/handoffs/42-verify.json');
    expect(f.state.reminders[0].prompt).toContain('.nmg-sdlc/handoffs/42-verify.json.waiting');
    expect(f.state.starts.map((entry) => entry.step)).toEqual(['verify', 'deliver']);
  });

  it('retries verify, not an implement repair, after a verify worker settles without a handoff (missing_handoff)', () => {
    const f = fixture();
    let verifications = 0;
    f.setWorker((context) => {
      if (context.step === 'verify' && verifications++ === 0) return { handoff: false };
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.reminders).toHaveLength(1);
    expect(f.state.starts.map((entry) => entry.step)).toEqual(['verify', 'verify', 'deliver']);
    expect(f.state.prompts[1].prompt).toContain('missing_handoff');
  });

  it.each([['failed', 'process_lost'], ['killed', 'process_lost']])(
    'ends a %s worker without a handoff as %s, with no reminder and no resume wait', (agentStatus, reasonCode) => {
      const f = fixture();
      let verifications = 0;
      f.setWorker((context) => {
        if (context.step === 'verify' && verifications++ === 0) {
          context.record.status = agentStatus;
          return { handoff: false };
        }
        if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
        if (context.step === 'deliver') return deliver(context);
        throw new Error(context.step);
      });
      expect(f.execute('#42')).toMatchObject({ status: 0 });
      expect(f.state.reminders).toEqual([]);
      expect(f.state.waits.some((wait) => wait.timeoutMs !== undefined)).toBe(false);
      expect(f.state.prompts[1].prompt).toContain(reasonCode);
      expect(f.state.starts.map((entry) => entry.step)).toEqual(['verify', 'verify', 'deliver']);
    });

  it('verifies a branch with no commits once this invocation implemented it at that head', () => {
    const f = fixture({ branch: 'main' });
    f.setWorker((context) => {
      if (context.step === 'start') {
        git(context.root, 'checkout', '-b', '42-example');
        git(context.root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      // The implement worker finds nothing left to change and publishes no commit.
      if (context.step === 'implement') return { status: 'passed', next: 'verify' };
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.step)).toEqual(['start', 'implement', 'verify', 'deliver']);
  });
});

describe('Opus supervisor decisions (#491)', () => {
  const steps = (f) => f.state.starts.map((entry) => entry.step);
  const deliver = ({ state }) => { state.merged = true; state.closed = true; return { status: 'passed', next: null }; };
  // Records each report, answers it from `answer(report, index)` (default accept/continue), and captures the
  // controller state the report was taken in.
  const supervisor = (f, answer = () => null) => {
    const reports = [];
    const supervise = (report) => {
      reports.push({ ...report, stopsAtReport: [...f.state.stops], startsAtReport: f.state.starts.length });
      return answer(report, reports.length - 1) ?? { action: report.kind === 'stage' ? 'accept' : 'continue' };
    };
    return { reports, supervise };
  };
  // A verify worker that keeps running for `slices` timed waits, then writes its passing handoff. Each verify
  // spawn runs its own slices; `onSlice(n, record)` runs after each slice with the injected clock advanced.
  const runningWorker = (f, { slices, clock, onSlice = () => {} }) => {
    f.hooks.advance = (ms) => { clock.now += ms; };
    f.setWorker((context) => {
      if (context.step !== 'verify') return deliver(context);
      Object.assign(context.record, {
        status: 'running',
        slices,
        onSlice: (n, record) => onSlice(n, record),
        onFinish: () => {
          f.passGate();
          f.writeHandoff('verify', { status: 'passed', next: 'deliver' });
        },
      });
      return { handoff: false };
    });
  };

  it('returns a stage report at every boundary before the next stage starts', () => {
    const f = fixture({ dirty: true });
    f.setWorker((context) => {
      if (context.step === 'implement') {
        fs.writeFileSync(path.join(context.root, 'stray.txt'), 'outside the spec\n');
        context.publish('fix: finish #42');
        return { status: 'passed', next: 'verify' };
      }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['implement', 'verify', 'deliver']);
    expect(reports.map((report) => `${report.kind}:${report.stage}`)).toEqual(['stage:implement', 'stage:verify', 'stage:deliver']);
    reports.forEach((report, index) => {
      // A stage's worker is stopped when its stage finishes, so a later report finds every earlier worker stopped.
      expect(report.stopsAtReport).toEqual(f.state.starts.slice(0, index).map((entry) => entry.agentId));
      expect(report.startsAtReport).toBe(index + 1);
      expect(report).toMatchObject({ issue: 42, worker: f.state.starts[index].name, agentId: f.state.starts[index].agentId,
        decisions: ['accept', 'prompt', 'redispatch', 'halt'], failureHistory: [] });
      expect(report).not.toHaveProperty('pane');
      expect(report.headBefore).toMatch(/^[0-9a-f]{40}$/);
      expect(report.headAfter).toMatch(/^[0-9a-f]{40}$/);
    });
    const [implement, verify] = reports;
    expect(implement.handoff).toMatchObject({ step: 'implement', status: 'passed' });
    expect(implement.headAfter).not.toBe(implement.headBefore);
    expect(implement.commits.map((commit) => commit.subject)).toEqual(['fix: finish #42']);
    expect(implement.changedPaths).toEqual(expect.arrayContaining(['helper.py', 'stray.txt']));
    expect(implement.outsideSpecPaths).toEqual(['stray.txt']);
    expect(verify.gate).toBe('pass');
    expect(verify.verification).toMatchObject({ report: 'specs/42-example/verification-report.md',
      readiness: { status: 'pass', reasonCode: 'ordinary_pass', gaps: [] }, issues: [] });
    expect(f.state.stops).toEqual(f.state.starts.map((entry) => entry.agentId));
  });

  it('reports a verify stage with its readiness gaps and the report critical and remaining issues', () => {
    const f = fixture();
    f.setWorker((context) => {
      const report = path.join(context.root, 'specs/42-example/verification-report.md');
      fs.writeFileSync(report, '# Verification Report\n\n### Implementation Status: Fail\n\n## Critical Issues\n\n- smoke host unreachable\n\n## Remaining Issues\n\n- none in code\n\n## Notes\n\nunrelated\n');
      return { status: 'failed', next: 'implement', reasonCode: 'verification_not_ready', summary: 'smoke host unreachable', artifacts: [] };
    });
    const { reports, supervise } = supervisor(f, () => ({ action: 'halt', text: 'smoke host unreachable' }));
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 1, stderr: 'supervisor_halt: smoke host unreachable\n' });
    expect(reports[0].verification.readiness).toMatchObject({ status: 'blocked', reasonCode: 'implementation_non_pass' });
    expect(reports[0].verification.readiness.gaps).toContain('issue-scope marker is malformed');
    expect(reports[0].verification.issues).toEqual(['## Critical Issues\n\n- smoke host unreachable', '## Remaining Issues\n\n- none in code']);
    expect(reports[0].gate).toBe('not_green');
  });

  it('prompts the live worker through one host append and reports its fresh handoff before continuing', () => {
    const f = fixture();
    f.setWorker((context) => {
      if (context.step === 'verify') return { status: 'failed', next: 'implement', reasonCode: 'smoke_failed', summary: 'smoke failed', artifacts: [] };
      return deliver(context);
    });
    f.hooks.onAppend = () => {
      f.passGate();
      f.writeHandoff('verify', { status: 'passed', next: 'deliver' });
      return true;
    };
    const { reports, supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'prompt', text: 'the smoke host is back; rerun the gate' } : null));
    expect(f.execute('#42', { supervise })).toMatchObject({ stderr: '', status: 0 });
    expect(f.state.appends).toHaveLength(1);
    expect(f.state.appends[0].agentId).toBe(f.state.starts[0].agentId);
    expect(f.state.appends[0].prompt).toContain('the smoke host is back; rerun the gate');
    expect(f.state.appends[0].prompt).toContain('write and validate a fresh handoff at .nmg-sdlc/handoffs/42-verify.json');
    expect(reports.map((report) => [report.stage, report.handoff.status, report.handoffFresh])).toEqual([
      ['verify', 'failed', true], ['verify', 'passed', true], ['deliver', 'passed', true]]);
    expect(reports[1].stopsAtReport).toEqual([]);
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('re-dispatches the stage with the supervisor guidance beside the failure evidence, stopping the old subagent first', () => {
    const f = fixture({ dirty: true });
    let implementations = 0;
    f.setWorker((context) => {
      if (context.step === 'implement' && implementations++ === 0) {
        return { status: 'failed', next: 'implement', reasonCode: 'tests_failed', summary: 'parser tests failed', artifacts: ['jest.log'] };
      }
      if (context.step === 'implement') { context.publish('fix: finish #42'); return { status: 'passed', next: 'verify' }; }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
    const { reports, supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'redispatch', text: 'use the existing parser' } : null));
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['implement', 'implement', 'verify', 'deliver']);
    expect(f.state.stops).toEqual(f.state.starts.map((entry) => entry.agentId));
    expect(f.state.log.slice(0, 3)).toEqual(['spawn:agent-1', 'stop:agent-1', 'spawn:agent-2']);
    expect(f.state.prompts[1].prompt).toContain('Supervisor guidance: use the existing parser');
    expect(f.state.prompts[1].prompt).toContain('tests_failed: parser tests failed');
    expect(f.state.prompts[2].prompt).not.toContain('Supervisor guidance');
    expect(reports[1].failureHistory).toEqual([expect.objectContaining({ step: 'implement', reasonCode: 'tests_failed' })]);
  });

  it('re-runs verify at the same source head after an environmental failure, held to the full gate', () => {
    const f = fixture();
    let verifications = 0;
    const heads = [];
    f.setWorker((context) => {
      if (context.step === 'verify') {
        heads.push(git(context.root, 'rev-parse', 'HEAD'));
        if (verifications++ === 0) {
          return { status: 'failed', next: 'implement', reasonCode: 'verification_not_ready', summary: 'smoke clone failed: DNS', artifacts: [] };
        }
        context.passGate();
        return { status: 'passed', next: 'deliver' };
      }
      return deliver(context);
    });
    const { supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'redispatch', text: 'DNS restored on the host; rerun verification unchanged' } : null));
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['verify', 'verify', 'deliver']);
    expect(heads[1]).toBe(heads[0]);
    expect(f.state.prompts[1].prompt).toContain('Supervisor guidance: DNS restored on the host');
    expect(f.state.starts.map((entry) => entry.model)).toEqual(['opus', 'opus', 'haiku']);
  });

  it('keeps an environmental verify re-run from delivering until the registered gate is green', () => {
    const f = fixture();
    let verifications = 0;
    f.setWorker((context) => {
      if (context.step === 'verify' && verifications++ < 2) {
        return { status: 'passed', next: 'deliver' };
      }
      if (context.step === 'implement') { context.publish('fix: repair #42'); return { status: 'passed', next: 'verify' }; }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
    const { reports, supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'redispatch', text: 'rerun verify' } : null));
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    // The re-run passed its handoff without a green gate and was accepted: implement, never deliver.
    expect(steps(f)).toEqual(['verify', 'verify', 'implement', 'verify', 'deliver']);
    expect(reports.slice(0, 2).map((report) => report.gate)).toEqual(['not_green', 'not_green']);
  });

  it('halts with the diagnosis after stopping the stage subagent, leaving branch, worktree and remote unchanged', () => {
    const f = fixture();
    f.setWorker(() => ({ status: 'failed', next: 'implement', reasonCode: 'verification_not_ready', summary: 'disk full', artifacts: [] }));
    const snapshot = () => ({
      head: git(f.root, 'rev-parse', 'HEAD'),
      worktree: git(f.root, 'status', '--porcelain', '--', '.', ':(exclude).nmg-sdlc'),
      remote: git(f.root, 'ls-remote', 'origin', 'refs/heads/42-example'),
    });
    const before = snapshot();
    const { supervise } = supervisor(f, () => ({ action: 'halt', text: 'host disk full' }));
    expect(f.execute('#42', { supervise }))
      .toEqual({ status: 1, stdout: '', stderr: 'supervisor_halt: host disk full\n' });
    expect(steps(f)).toEqual(['verify']);
    expect(f.state.stops).toEqual([f.state.starts[0].agentId]);
    expect(f.state.log).toEqual(['spawn:agent-1', 'stop:agent-1']);
    expect(snapshot()).toEqual(before);
    expect(git(f.root, 'branch', '--show-current')).toBe('42-example');
    expect(fs.existsSync(path.join(f.root, '.nmg-sdlc/controller.lock'))).toBe(false);
  });

  it('rejects the removed --retain-worker flag with the usage line and starts nothing', () => {
    const f = fixture();
    expect(f.execute('--retain-worker #42')).toEqual({ status: 2, stdout: '',
      stderr: 'Usage: /sdlc-execute [--check-in-seconds N] [#N ...]\n' });
    expect(f.state.starts).toEqual([]);
  });

  it('never accepts a decision the report does not offer', () => {
    const f = fixture();
    expect(f.execute('#42', { supervise: () => ({ action: 'continue' }) }))
      .toMatchObject({ status: 1, stderr: 'supervisor_decision_invalid: continue\n' });
    const g = fixture();
    expect(g.execute('#42', { supervise: () => ({ action: 'halt', text: ' ' }) }))
      .toMatchObject({ status: 1, stderr: 'supervisor_decision_invalid: halt\n' });
  });

  it('checks in on a running worker each interval with its activity and marker, and continues', () => {
    const f = fixture();
    const clock = { now: 0 };
    const marker = path.join(f.root, '.nmg-sdlc/handoffs/42-verify.json.waiting');
    runningWorker(f, { slices: 4, clock, onSlice: (slice, record) => {
      if (slice === 2) {
        fs.mkdirSync(path.dirname(marker), { recursive: true });
        fs.writeFileSync(marker, 'node scripts/sdlc-verify-steering.mjs --issue 42\n');
      }
      if (slice === 3) Object.assign(record, { latestText: 'smoke delivering #237', lastActivityAt: clock.now });
    } });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 1000 })).toMatchObject({ status: 0 });
    const checkIns = reports.filter((report) => report.kind === 'checkin');
    expect(checkIns.length).toBeGreaterThanOrEqual(2);
    expect(checkIns[0]).toMatchObject({ issue: 42, stage: 'verify', worker: f.state.starts[0].name,
      agentId: f.state.starts[0].agentId, reason: 'interval', waiting: null, commits: [], outsideSpecPaths: [],
      failureHistory: [], activity: { status: 'running', toolCalls: [], latestText: '' },
      decisions: ['continue', 'prompt', 'redispatch', 'halt'] });
    expect(checkIns[0]).not.toHaveProperty('paneTail');
    expect(checkIns[0].sinceDispatchSeconds).toBeGreaterThanOrEqual(1);
    expect(checkIns.some((report) => report.waiting?.command === 'node scripts/sdlc-verify-steering.mjs --issue 42')).toBe(true);
    expect(checkIns.some((report) => report.activity.latestText === 'smoke delivering #237')).toBe(true);
    checkIns.forEach((report) => expect(report.stopsAtReport).toEqual([]));
    expect(reports.at(-2)).toMatchObject({ kind: 'stage', stage: 'verify' });
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('checks in on a settled worker waiting behind its marker, naming the waiting command (#556 AC6)', () => {
    const f = fixture();
    const clock = { now: 0 };
    f.hooks.advance = (ms) => { clock.now += ms; };
    const marker = path.join(f.root, '.nmg-sdlc/handoffs/42-verify.json.waiting');
    let resumeWaits = 0;
    f.setWorker((context) => {
      if (context.step !== 'verify') return deliver(context);
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, 'node scripts/sdlc-verify-steering.mjs --issue 42\n');
      // Settled idle behind its marker: the background gate's notification resumes the turn after five resume waits.
      context.record.onWait = ({ until }, record) => {
        if (until !== 'started' || record.status !== 'idle' || (resumeWaits += 1) < 5) return;
        record.status = 'running';
        record.onFinish = () => {
          f.passGate();
          f.writeHandoff('verify', { status: 'passed', next: 'deliver' });
        };
      };
      return { handoff: false };
    });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 1000 })).toMatchObject({ status: 0 });
    const checkIns = reports.filter((report) => report.kind === 'checkin');
    expect(checkIns.length).toBeGreaterThanOrEqual(3);
    checkIns.forEach((report) => expect(report).toMatchObject({ stage: 'verify', activity: { status: 'idle' },
      waiting: { command: 'node scripts/sdlc-verify-steering.mjs --issue 42' } }));
    expect(f.state.reminders).toEqual([]);
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('checks in as soon as the activity stops changing, once per unchanged span', () => {
    const f = fixture();
    const clock = { now: 0 };
    runningWorker(f, { slices: 9, clock, onSlice: (slice, record) => {
      // Activity is observed once, at 30 s, and then stops changing.
      if (slice === 1) Object.assign(record, { lastActivityAt: clock.now });
    } });
    const { reports, supervise } = supervisor(f);
    // 30 s slices against a 100 s interval: the interval check-in at 120 s, the activity check-in at 150 s
    // (120 s after the last observed change), then the interval counting from 150 s, at 270 s.
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 100_000 })).toMatchObject({ status: 0 });
    const checkIns = reports.filter((report) => report.kind === 'checkin');
    expect(checkIns.map((report) => [report.reason, report.sinceDispatchSeconds])).toEqual([
      ['interval', 120], ['activity_unchanged', 150], ['interval', 270]]);
    expect(checkIns[1]).toMatchObject({ activity: { status: 'running', lastActivitySecondsAgo: 120 } });
    expect(checkIns[1]).not.toHaveProperty('paneTail');
  });

  it('reports a stale waiting marker as a stall once', () => {
    const f = fixture();
    const clock = { now: Date.now() };
    const marker = path.join(f.root, '.nmg-sdlc/handoffs/42-verify.json.waiting');
    runningWorker(f, { slices: 3, clock, onSlice: (slice) => {
      if (slice !== 1) return;
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, 'npm test\n');
      const old = new Date(clock.now - 3_600_000);
      fs.utimesSync(marker, old, old);
    } });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 600_000 })).toMatchObject({ status: 0 });
    const checkIns = reports.filter((report) => report.kind === 'checkin');
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0]).toMatchObject({ reason: 'waiting_marker_stale', waiting: { command: 'npm test' },
      activity: { status: 'running' } });
    expect(checkIns[0]).not.toHaveProperty('paneTail');
    expect(checkIns[0].waiting.ageSeconds).toBeGreaterThanOrEqual(3600);
  });

  it('queues check-in guidance to a busy worker and keeps waiting through it for the handoff', () => {
    const f = fixture();
    const clock = { now: 0 };
    let pending = null;
    runningWorker(f, { slices: 4, clock, onSlice: (slice) => {
      // The worker is mid tool call: the queued guidance lands only when that call finishes.
      if (slice === 3 && pending) { f.state.delivered = pending; pending = null; }
    } });
    f.hooks.onAppend = ({ text }) => { pending = text; return true; };
    const { reports, supervise } = supervisor(f, (report) =>
      (report.kind === 'checkin' && report.reason === 'interval' && !f.state.appends.length
        ? { action: 'prompt', text: 'skip the flaky retry and report the failure' } : null));
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 30_000 })).toMatchObject({ status: 0 });
    expect(f.state.appends).toHaveLength(1);
    expect(f.state.appends[0]).toEqual({ agentId: f.state.starts[0].agentId, prompt: expect.stringContaining('skip the flaky retry') });
    expect(f.state.appends[0].prompt).toContain('Act on this guidance within the current step');
    expect(f.state.delivered).toBe(f.state.appends[0].prompt);
    expect(f.state.stops).toEqual(f.state.starts.map((entry) => entry.agentId));
    expect(reports.filter((report) => report.kind === 'stage').map((report) => report.stage)).toEqual(['verify', 'deliver']);
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('re-dispatches a running worker from a check-in with the guidance, stopping it first', () => {
    const f = fixture();
    const clock = { now: 0 };
    // The first verify keeps working through one slice; the re-dispatched one also runs one slice and finishes.
    runningWorker(f, { slices: 1, clock });
    const { reports, supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'redispatch', text: 'the worker is looping; start verification again' } : null));
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 30_000 })).toMatchObject({ status: 0 });
    expect(reports[0]).toMatchObject({ kind: 'checkin', stage: 'verify' });
    expect(f.state.stops).toEqual(f.state.starts.map((entry) => entry.agentId));
    expect(f.state.log.slice(0, 3)).toEqual(['spawn:agent-1', 'stop:agent-1', 'spawn:agent-2']);
    expect(steps(f)).toEqual(['verify', 'verify', 'deliver']);
    expect(f.state.prompts[1].prompt).toContain('Supervisor guidance: the worker is looping; start verification again');
  });

  it('halts a running worker from a check-in, stopping it before the halt', () => {
    const f = fixture();
    const clock = { now: 0 };
    runningWorker(f, { slices: 5, clock });
    const { supervise } = supervisor(f, (report) =>
      (report.kind === 'checkin' ? { action: 'halt', text: 'worker is editing unrelated files' } : null));
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 30_000 }))
      .toEqual({ status: 1, stdout: '', stderr: 'supervisor_halt: worker is editing unrelated files\n' });
    expect(steps(f)).toEqual(['verify']);
    expect(f.state.stops).toEqual([f.state.starts[0].agentId]);
    expect(fs.existsSync(path.join(f.root, '.nmg-sdlc/controller.lock'))).toBe(false);
  });

  it('accepts a configurable check-in interval in the execute arguments', () => {
    expect(parseArgs('--check-in-seconds 120 #42')).toEqual({ issues: [42], defaultBacklog: false, checkInSeconds: 120 });
    expect(parseArgs('--check-in-seconds 60')).toMatchObject({ checkInSeconds: 60, defaultBacklog: true });
    for (const args of ['--check-in-seconds', '--check-in-seconds 0 #42', '--check-in-seconds 1.5', '--check-in-seconds 86401',
      '--check-in-seconds 60 --check-in-seconds 60']) {
      expect(() => parseArgs(args)).toThrow('Usage: /sdlc-execute [--check-in-seconds N] [#N ...]');
    }
  });

  it('rejects --retain-worker in parseArgs with a usage error that names the removed flag', () => {
    expect(() => parseArgs(['--retain-worker', '#1'])).toThrow('--retain-worker');
    expect(() => parseArgs('#42 --retain-worker')).toThrow('--retain-worker is removed');
  });
});

describe('idle workers, prompt refusals, restart routing and background activity (#546)', () => {
  const steps = (f) => f.state.starts.map((entry) => entry.step);
  const deliver = ({ state }) => { state.merged = true; state.closed = true; return { status: 'passed', next: null }; };
  const intentFile = (f) => path.join(f.root, '.nmg-sdlc/execute/gate-intent/42.json');
  const gateFile = (f) => path.join(f.root, '.nmg-sdlc/verification/42.json');
  const writeGate = (f, { head, generatedAt, ceiling }) => {
    fs.mkdirSync(path.dirname(gateFile(f)), { recursive: true });
    fs.writeFileSync(gateFile(f), JSON.stringify({ schemaVersion: 1, issue: 42, generatedAt,
      identity: { headSha: head }, ceiling, coverage: { complete: true }, results: [] }));
  };
  const supervisor = (f, answer = () => null) => {
    const reports = [];
    const supervise = (report) => {
      reports.push({ ...report, stopsAtReport: [...f.state.stops], startsAtReport: f.state.starts.length });
      return answer(report, reports.length - 1) ?? { action: report.kind === 'stage' ? 'accept' : 'continue' };
    };
    return { reports, supervise };
  };
  // A verify worker that settles without a handoff until `silent` runs out, then passes the gate.
  const verifyWorkerSilentUntil = (f, silent) => {
    let verifications = 0;
    f.setWorker((context) => {
      if (context.step === 'verify' && verifications++ < silent) return { handoff: false };
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
  };

  it('resumes a worker that settles without a handoff through append, and reports the handoff its resumed turn wrote', () => {
    const f = fixture();
    f.setWorker((context) => {
      if (context.step === 'verify') return { handoff: false };
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    f.setReminder(({ passGate }) => { passGate(); return { status: 'passed', next: 'deliver' }; });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(f.state.reminders).toHaveLength(1);
    expect(f.state.waits.some((wait) => wait.until === 'started')).toBe(true);
    const verify = reports.filter((report) => report.kind === 'stage' && report.stage === 'verify');
    expect(verify).toHaveLength(1);
    expect(verify[0]).toMatchObject({ handoffFresh: true, handoff: { status: 'passed' }, workerState: 'idle', promptRefusal: null });
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('holds the stage report until a tracked background command clears, and reports the commit it landed', () => {
    // A dirty worktree routes the branch to implement first.
    const f = fixture({ dirty: true });
    let landed = false;
    f.setWorker((context) => {
      if (context.step === 'implement') {
        Object.assign(context.record, {
          background: [{ taskId: 'task-1', command: 'npm test', startedAt: 0 }],
          // The commit lands while the settled worker's background command is still tracked.
          onWait: ({ until }) => {
            if (until !== 'started' || landed) return;
            landed = true;
            context.publish('fix: finish #42');
            context.record.background = [];
          },
        });
        return { status: 'passed', next: 'verify' };
      }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(landed).toBe(true);
    const implement = reports.find((report) => report.kind === 'stage' && report.stage === 'implement');
    expect(implement.commits.map((commit) => commit.subject)).toEqual(['fix: finish #42']);
    expect(implement.headAfter).not.toBe(implement.headBefore);
    expect(implement.commits[0].sha).toBe(implement.headAfter);
  });

  it('reports an undelivered prompt as stage_prompt_undelivered, and does not offer prompt on that report', () => {
    const f = fixture();
    verifyWorkerSilentUntil(f, 1);
    f.hooks.onAppend = ({ text }) => !text.includes('supervisor guidance');
    const { reports, supervise } = supervisor(f, (report, index) => {
      if (index === 0) return { action: 'prompt', text: 'rerun the gate' };
      if (index === 1) return { action: 'redispatch', text: 'start over' };
      return null;
    });
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(reports[0].decisions).toContain('prompt');
    expect(reports[1]).toMatchObject({ kind: 'stage', promptRefusal: { reasonCode: 'stage_prompt_undelivered' } });
    expect(reports[1].decisions).not.toContain('prompt');
    expect(steps(f)).toEqual(['verify', 'verify', 'deliver']);
  });

  it('reports a prompt the worker never starts a turn for as stage_prompt_not_resumed, within 60 seconds', () => {
    const f = fixture();
    const clock = { now: 0 };
    f.hooks.advance = (ms) => { clock.now += ms; };
    verifyWorkerSilentUntil(f, 1);
    // The guidance is accepted, but the worker stays settled.
    f.hooks.onAppend = ({ text, record }) => {
      if (text.includes('supervisor guidance')) record.status = 'completed';
      return true;
    };
    const { reports, supervise } = supervisor(f, (report, index) => {
      if (index === 0) return { action: 'prompt', text: 'rerun the gate' };
      if (index === 1) return { action: 'redispatch', text: 'start over' };
      return null;
    });
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 300_000 })).toMatchObject({ status: 0 });
    expect(f.state.appends.filter((entry) => entry.prompt.includes('supervisor guidance'))).toHaveLength(1);
    expect(reports[1]).toMatchObject({ kind: 'stage', promptRefusal: { reasonCode: 'stage_prompt_not_resumed' } });
    expect(reports[1].decisions).not.toContain('prompt');
    expect(steps(f)).toEqual(['verify', 'verify', 'deliver']);
  });

  it('dispatches verify, not implement, after a restart at an unchanged head with a verify intent and an older failed gate', () => {
    const f = fixture();
    const head = git(f.root, 'rev-parse', 'HEAD');
    const dispatchedAt = Date.now();
    fs.mkdirSync(path.dirname(intentFile(f)), { recursive: true });
    fs.writeFileSync(intentFile(f), JSON.stringify({ schemaVersion: 1, issue: 42, head, dispatchedAt }));
    writeGate(f, { head, generatedAt: new Date(dispatchedAt - 60_000).toISOString(), ceiling: 'Fail' });
    f.setWorker((context) => {
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'implement') { context.publish('fix: finish #42'); return { status: 'passed', next: 'verify' }; }
      return deliver(context);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('routes a failed gate to implement once its verify report is accepted, after clearing the verify intent', () => {
    const f = fixture();
    let verifications = 0;
    let intentDuringVerify = null;
    let intentAfterVerify = null;
    f.setWorker((context) => {
      if (context.step === 'verify' && verifications++ === 0) {
        intentDuringVerify = fs.existsSync(intentFile(f));
        writeGate(f, { head: git(f.root, 'rev-parse', 'HEAD'), generatedAt: new Date().toISOString(), ceiling: 'Fail' });
        return { status: 'failed', next: 'implement', reasonCode: 'verification_not_green', summary: 'tests failed', artifacts: [] };
      }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'implement') {
        intentAfterVerify = fs.existsSync(intentFile(f));
        context.publish('fix: finish #42');
        return { status: 'passed', next: 'verify' };
      }
      return deliver(context);
    });
    const { supervise } = supervisor(f);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(intentDuringVerify).toBe(true);
    expect(intentAfterVerify).toBe(false);
    expect(steps(f)).toEqual(['verify', 'implement', 'verify', 'deliver']);
  });

  it('names a running background command in check-ins, and does not report its unchanged activity as a stall', () => {
    const f = fixture();
    const clock = { now: 0 };
    f.hooks.advance = (ms) => { clock.now += ms; };
    f.setWorker((context) => {
      if (context.step !== 'verify') return deliver(context);
      Object.assign(context.record, {
        status: 'running', slices: 9,
        onSlice: (slice, record) => {
          if (slice !== 1) return;
          Object.assign(record, { lastActivityAt: clock.now,
            background: [{ taskId: 'task-1', command: 'npm run gate', startedAt: clock.now }] });
        },
        onFinish: () => {
          // The background command has finished by the time the worker's turn ends.
          context.record.background = [];
          f.passGate();
          f.writeHandoff('verify', { status: 'passed', next: 'deliver' });
        },
      });
      return { handoff: false };
    });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 100_000 })).toMatchObject({ status: 0 });
    const checkIns = reports.filter((report) => report.kind === 'checkin');
    expect(checkIns.length).toBeGreaterThanOrEqual(1);
    expect(checkIns.map((report) => report.reason)).not.toContain('activity_unchanged');
    expect(checkIns[0].activity.background).toEqual({ command: 'npm run gate', elapsedSeconds: expect.any(Number) });
    expect(checkIns[0].activity.background.elapsedSeconds).toBeGreaterThan(0);
  });
});

// #574: a settled worker's tracked background commands are reconciled against the host's in-flight list at each
// stop event, so the settle wait returns without the worker taking another turn.
describe('a finished worker\'s exited background commands (#574)', () => {
  const steps = (f) => f.state.starts.map((entry) => entry.step);
  const supervise = (report) => ({ action: report.kind === 'stage' ? 'accept' : 'continue' });
  // A verify worker that passes its gate and writes its handoff, settled, with one tracked background command; at
  // each of its settle waits, `stopEvent(n)` returns the stop event's in-flight list the hooks module reconciles.
  const settledWithBackground = (f, stopEvent) => {
    const seen = { pauses: 0, listedAtStage: null };
    f.setWorker((context) => {
      if (context.step === 'deliver') { context.state.merged = true; context.state.closed = true; return { status: 'passed', next: null }; }
      context.passGate();
      Object.assign(context.record, {
        background: [{ taskId: 'task-1', command: 'npm run gate', startedAt: 0 }],
        onWait: ({ until }, record) => {
          if (until !== 'started') return;
          seen.pauses += 1;
          Object.assign(record, reconcileBackground(record, stopEvent(seen.pauses), seen.pauses));
        },
      });
      return { status: 'passed', next: 'deliver' };
    });
    return seen;
  };

  it('@SCN001 routes the next step once the stop event no longer lists the exited command, with no further worker turn', () => {
    const f = fixture();
    // The command has exited: the next stop event reports nothing in flight.
    const seen = settledWithBackground(f, () => []);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(seen.pauses).toBe(1);
    expect(f.state.appends).toEqual([]);
    expect(f.state.reminders).toEqual([]);
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('@SCN001 the hooks module reconciles stage workers at subagent and main-loop stops, passing each stop through', () => {
    const source = fs.readFileSync(path.join(packageRoot, 'hooks/register.ts'), 'utf8');
    expect(source).toMatch(/on\('classic\.SubagentStop', async \(\$, e, next\) => \{\n\s+await reconcileWorker\(\$, e\.agent_id, e\.background_tasks\)\n\s+return next\(e\)/);
    // The main loop's stop reconciles before the headless hold decides the outcome, which reconciliation never changes.
    expect(source).toMatch(/on\('classic\.Stop', async \(\$, e, next\) => \{\n\s+await reconcileSettledWorkers\(\$, e\.background_tasks\)\n\s+const hold = await headlessHoldNotice\(\$\)\n\s+return hold === null \? next\(e\) : \{ block: hold \}/);
    expect(source.match(/on\('classic\.Stop'/g)).toHaveLength(1);
    // The main loop's stop reconciles only settled workers, all at once, keeping commands started after its list.
    expect(source).toMatch(/if \(since !== undefined && !SETTLED_AGENT_STATUSES\.includes\(record\.status\)\) return/);
    expect(source).toContain('reconcileBackground(record, inFlight, await $.clock.now(), since)');
    expect(source).toContain('Promise.all([...workers.keys()].map((agentId) => reconcileWorker($, agentId, inFlight, since)))');
    // An unchanged or missing record is never written.
    expect(source).toContain('if (reconciled !== record) await writeJsonFile($, path, reconciled)');
    expect(source).not.toMatch(/from 'node:/);
  });

  it('@SCN002 keeps waiting while the command is still listed in flight, and routes only after it is removed', () => {
    const f = fixture();
    // Two stops list the command, one stop reports no list at all, then the command exits.
    const events = [[{ id: 'task-1', type: 'shell', status: 'running' }], [{ id: 'task-1' }, { id: 'task-9' }], undefined, []];
    const seen = settledWithBackground(f, (n) => events[n - 1]);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(seen.pauses).toBe(4);
    expect(f.state.appends).toEqual([]);
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('@SCN002 a listed command is kept, and a stop without a list leaves the record unchanged', () => {
    const record = { agentId: 'a', background: [{ taskId: 'task-1' }, { taskId: 'task-2' }], updatedAt: 1 };
    expect(reconcileBackground(record, [{ id: 'task-1' }, { id: 'task-2' }], 5)).toBe(record);
    expect(reconcileBackground(record, undefined, 5)).toBe(record);
    expect(reconcileBackground(record, [{ id: 'task-2' }], 5)).toEqual({ ...record, background: [{ taskId: 'task-2' }], updatedAt: 5 });
    // A command started at or after the list was taken is still running, though the list cannot name it.
    const late = { ...record, background: [{ taskId: 'task-1', startedAt: 3 }, { taskId: 'task-2', startedAt: 7 }] };
    expect(reconcileBackground(late, [], 9, 7)).toEqual({ ...late, background: [{ taskId: 'task-2', startedAt: 7 }], updatedAt: 9 });
    expect(reconcileBackground(late, [], 9, 3)).toBe(late);
  });
});
