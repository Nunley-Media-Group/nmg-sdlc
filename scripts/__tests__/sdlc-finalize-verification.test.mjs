import { describe, expect, it } from '@jest/globals';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { finalizeVerification } from '../sdlc-finalize-verification.mjs';
import { isRemediableFailedHandoff, validateHandoff } from '../sdlc-execute.mjs';
import { acquireControllerLease, releaseControllerLease } from '../sdlc-controller-lease.mjs';

function report(issue = 42, specPath = 'specs/42-feature', implementationStatus = 'Pass') {
  const scope = { issueNumber: issue, specPath, status: 'scoped', delivery: { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] }, regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] } };
  const status = implementationStatus == null ? '' : `## Implementation Status: **${implementationStatus}**\n\n`;
  return `# Verification\n\n${status}<!-- nmg-sdlc-issue-scope: ${JSON.stringify(scope)} -->\n`;
}
function fixture(implementationStatus = 'Pass') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-finalize-verification-'));
  const spec = path.join(root, 'specs', '42-feature');
  fs.mkdirSync(spec, { recursive: true });
  fs.writeFileSync(path.join(spec, 'verification-report.md'), report(42, 'specs/42-feature', implementationStatus));
  return root;
}
function result(status = 0, stdout = '') { return { status, stdout, stderr: '', error: null }; }
function successfulRun(reportDirty = true) {
  const calls = [];
  let statusCalls = 0;
  const run = (command, args) => {
    calls.push([command, ...args]);
    const key = args.join(' ');
    if (key === 'branch --show-current') return result(0, '42-feature\n');
    if (key === 'status --porcelain=v1 -z') { statusCalls += 1; return result(0, statusCalls === 1 && reportDirty ? ' M specs/42-feature/verification-report.md\0' : ''); }
    if (key === 'diff --cached --quiet -- specs/42-feature/verification-report.md') return result(1);
    if (key === 'rev-parse --abbrev-ref --symbolic-full-name @{u}') return result(0, 'origin/42-feature\n');
    if (key === 'rev-list --left-right --count @{u}...HEAD') return result(0, '0\t0\n');
    return result(0);
  };
  return { run, calls };
}

describe('verification finalization controller', () => {
  it('publishes the changed report before writing a passed handoff', () => {
    const root = fixture();
    const { run, calls } = successfulRun(true);
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root, run });
    expect(outcome.status).toBe(0);
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
    expect(outcome.handoff).toMatchObject({ status: 'passed', intervention: false, next: 'deliver' });
    expect(calls).toContainEqual(['git', 'add', '--', 'specs/42-feature/verification-report.md']);
    expect(calls).toContainEqual(['git', 'commit', '-m', 'docs: record verification for #42']);
    expect(calls).toContainEqual(['git', 'push']);
  });
  it.each(['Fail', 'Partial'])('writes a remediable failed handoff for %s reports', (implementationStatus) => {
    const root = fixture(implementationStatus);
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root });
    expect(outcome.status).toBe(1);
    expect(outcome.handoff).toMatchObject({
      status: 'failed',
      intervention: false,
      reasonCode: 'verification_not_ready',
      step: 'verify',
      next: null,
    });
    expect(outcome.handoff.artifacts).toEqual(['specs/42-feature/verification-report.md']);
    expect(outcome.handoff.summary).toContain('implementation_non_pass');
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
    for (const state of ['idle', 'done']) {
      expect(isRemediableFailedHandoff({ step: 'verify', state, handoff: outcome.handoff })).toBe(true);
    }
  });
  it('keeps Incomplete reports as intervention', () => {
    const root = fixture('Incomplete');
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root });
    expect(outcome.status).toBe(1);
    expect(outcome.handoff).toMatchObject({
      status: 'failed',
      intervention: true,
      reasonCode: 'verification_not_ready',
      step: 'verify',
      next: null,
    });
    expect(isRemediableFailedHandoff({ step: 'verify', state: 'idle', handoff: outcome.handoff })).toBe(false);
  });
  it('keeps a missing Implementation Status as intervention', () => {
    const root = fixture(null);
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root });
    expect(outcome.status).toBe(1);
    expect(outcome.handoff).toMatchObject({
      status: 'failed',
      intervention: true,
      step: 'verify',
      next: null,
    });
    expect(isRemediableFailedHandoff({ step: 'verify', state: 'idle', handoff: outcome.handoff })).toBe(false);
  });
  it('requires the execute lease identity before publishing protected state', () => {
    const root = fixture();
    const lease = acquireControllerLease({
      projectRoot: root,
      runId: 'execute-run',
      controllerPaneId: 'execute-pane',
    });
    const { run, calls } = successfulRun(false);
    const rejected = finalizeVerification({
      issue: 42,
      spec: 'specs/42-feature',
      cwd: root,
      run,
    });
    expect(rejected).toMatchObject({
      status: 1,
      stderr: 'controller_lease_held\n',
      handoff: null,
    });
    expect(calls).toHaveLength(0);

    const scoped = finalizeVerification({
      issue: 42,
      spec: 'specs/42-feature',
      controllerRunId: 'execute-run',
      cwd: root,
      run,
    });
    expect(scoped.status).toBe(0);
    expect(releaseControllerLease(lease)).toBe(true);
  });
  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])('releases its owned lease on %s', (signal, exitCode) => {
    const root = fixture();
    const processApi = new EventEmitter();
    processApi.exit = (code) => {
      throw new Error(`signal_exit_${code}`);
    };
    const { run: baseRun } = successfulRun(false);
    const run = (command, args, options) => {
      if (args.join(' ') === 'branch --show-current') processApi.emit(signal);
      return baseRun(command, args, options);
    };

    expect(() => finalizeVerification({
      issue: 42,
      spec: 'specs/42-feature',
      cwd: root,
      run,
      processApi,
    })).toThrow(`signal_exit_${exitCode}`);
    expect(fs.existsSync(path.join(root, '.omp/sdlc/controller.lock'))).toBe(false);
    expect(processApi.listenerCount('SIGINT')).toBe(0);
    expect(processApi.listenerCount('SIGTERM')).toBe(0);
  });

  it('does not create an empty commit for an already published report', () => {
    const root = fixture();
    const { run, calls } = successfulRun(false);
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root, run });
    expect(outcome.status).toBe(0);
    expect(calls.some((call) => ['add', 'commit', 'push'].includes(call[1]))).toBe(false);
  });
  it('rejects unrelated dirty paths without staging anything', () => {
    const root = fixture();
    const calls = [];
    const run = (_command, args) => {
      calls.push(args);
      if (args.join(' ') === 'branch --show-current') return result(0, '42-feature\n');
      if (args.join(' ') === 'status --porcelain=v1 -z') return result(0, ' M specs/42-feature/verification-report.md\0 M src/app.mjs\0');
      return result(0);
    };
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root, run });
    expect(outcome.status).toBe(1);
    expect(outcome.handoff).toMatchObject({ status: 'failed', intervention: true, reasonCode: 'verification_publish_failed' });
    expect(calls.some((args) => args[0] === 'add')).toBe(false);
  });
  it('fails closed when report staging fails', () => {
    const root = fixture();
    const { run: baseRun } = successfulRun(true);
    const run = (command, args, options) => args[0] === 'add' ? result(1) : baseRun(command, args, options);
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root, run });
    expect(outcome.status).toBe(1);
    expect(outcome.handoff.reasonCode).toBe('verification_publish_failed');
  });
  it.each(['commit', 'push'])('fails closed when git %s fails', (operation) => {
    const root = fixture();
    const { run: baseRun } = successfulRun(true);
    const run = (command, args, options) => args[0] === operation ? result(1) : baseRun(command, args, options);
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root, run });
    expect(outcome.status).toBe(1);
    expect(outcome.handoff.reasonCode).toBe('verification_publish_failed');
  });
  it.each([
    ['missing upstream', 'rev-parse --abbrev-ref --symbolic-full-name @{u}', result(1)],
    ['branch divergence', 'rev-list --left-right --count @{u}...HEAD', result(0, '0\t1\n')],
  ])('fails closed for %s', (_label, failingCommand, failure) => {
    const root = fixture();
    const { run: baseRun } = successfulRun(false);
    const run = (command, args, options) => args.join(' ') === failingCommand ? failure : baseRun(command, args, options);
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root, run });
    expect(outcome.status).toBe(1);
    expect(outcome.handoff.reasonCode).toBe('verification_publish_failed');
  });
  it('rejects an unsafe symlink report', () => {
    const root = fixture();
    const reportPath = path.join(root, 'specs', '42-feature', 'verification-report.md');
    fs.rmSync(reportPath);
    fs.writeFileSync(path.join(root, 'outside.md'), report());
    fs.symlinkSync(path.join(root, 'outside.md'), reportPath);
    const outcome = finalizeVerification({ issue: 42, spec: 'specs/42-feature', cwd: root, run: () => result(0) });
    expect(outcome.status).toBe(1);
    expect(outcome.handoff.reasonCode).toBe('verification_report_invalid');
  });
});
