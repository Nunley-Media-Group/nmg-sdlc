import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { finalizeVerification } from '../sdlc-finalize-verification.mjs';
import { inspectIssueSpecScope } from '../issue-spec-scope.mjs';
import { isRemediableFailedHandoff, remediationCompletedSteps, validateHandoff } from '../sdlc-execute.mjs';
import { acquireControllerLease, releaseControllerLease } from '../sdlc-controller-lease.mjs';
import { canonicalJson } from '../../src/sdlc-steering-runtime.mjs';
import { consumeSafeRecovery, resolveRecoveryOwner } from '../sdlc-safe-recoveries.mjs';

const roots = [];
const SPEC = 'specs/42-feature';
const REPORT = `${SPEC}/verification-report.md`;
const SUBJECT = 'docs: record verification for #42';
const failed = { status: 1, stdout: '', stderr: 'injected git failure', error: null };

function report(root, implementationStatus = 'Pass') {
  const { issueNumber, specPath, status: scopeStatus, delivery, regression } = inspectIssueSpecScope({
    projectRoot: root, issueNumber: 42, specPath: SPEC,
  });
  const scope = { issueNumber, specPath, status: scopeStatus, delivery, regression };
  const status = implementationStatus == null ? '' : `## Implementation Status: **${implementationStatus}**\n\n`;
  return `# Verification\n\n${status}<!-- nmg-sdlc-issue-scope: ${JSON.stringify(scope)} -->\n`;
}

function fixture(implementationStatus = 'Pass', { createOwner = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-finalize-verification-'));
  roots.push(base);
  const root = path.join(base, 'work');
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(root);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git('init', '--bare', remote);
  git('init', '-b', '42-feature');
  git('config', 'user.name', 'Publication fixture');
  git('config', 'user.email', 'publication@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', path.join(base, 'no-hooks'));
  fs.mkdirSync(path.join(root, SPEC), { recursive: true });
  const header = '**Issue**: #42\n**Status**: Approved\n\n';
  fs.writeFileSync(path.join(root, SPEC, 'requirements.md'), `${header}### AC1: Publish verified evidence\n\n| FR1 | Publish only current evidence | Must |\n`);
  fs.writeFileSync(path.join(root, SPEC, 'design.md'), `${header}Publish the report only after verifying its scope.\n`);
  fs.writeFileSync(path.join(root, SPEC, 'tasks.md'), `${header}### T001: Publish verified evidence\n\n**File(s)**: \`${REPORT}\`\n`);
  fs.writeFileSync(path.join(root, SPEC, 'feature.gherkin'), `${header}Feature: Verification\n  Scenario: Publish current evidence\n    Given verification passed\n    When the report is finalized\n    Then the current evidence is published\n`);
  fs.writeFileSync(path.join(root, REPORT), '# Pending verification\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.omp/\nsteering/\n');
  git('add', '.');
  git('commit', '-m', 'chore: initialize publication fixture');
  git('remote', 'add', 'origin', remote);
  git('push', '-u', 'origin', '42-feature');
  // Ownership predates report generation and every partial publication.
  const ownerId = createOwner ? resolveRecoveryOwner({ cwd: root, issue: 42, step: 'verify' }) : null;
  fs.writeFileSync(path.join(root, REPORT), report(root, implementationStatus));
  if (implementationStatus === 'Pass') {
    writeVerificationArtifact({ root, git }, []);
    fs.appendFileSync(path.join(root, REPORT), `\n**Verification head**: ${git('rev-parse', 'HEAD')}\n`);
  }
  const calls = [];
  const leaseIds = [];
  const run = (command, args, options) => {
    calls.push([command, ...args]);
    const lock = path.join(root, '.omp/sdlc/controller.lock');
    if (fs.existsSync(lock)) leaseIds.push(JSON.parse(fs.readFileSync(lock, 'utf8')).runId);
    return spawnSync(command, args, { encoding: 'utf8', ...options });
  };
  const finalize = (overrides = {}) => finalizeVerification({ issue: 42, spec: SPEC, cwd: root, run, ...overrides });
  const state = () => JSON.parse(fs.readFileSync(path.join(root, '.omp/sdlc/safe-recoveries.json'), 'utf8'));
  const commitReport = () => { git('add', '--', REPORT); git('commit', '-m', SUBJECT); return git('rev-parse', 'HEAD'); };
  return { root, remote, git, run, calls, leaseIds, ownerId, finalize, state, commitReport };
}

const mutations = (calls) => calls.filter((call) => ['add', 'commit', 'push'].includes(call[1]));

function writeVerificationArtifact(f, results, overrides = {}) {
  const required = results.filter((result) => result.required && result.applicable);
  const ceiling = required.some(({ effectiveStatus }) => effectiveStatus === 'incomplete')
    ? 'Incomplete'
    : required.some(({ effectiveStatus }) => effectiveStatus !== 'passed')
      ? 'Fail'
      : null;
  const manifest = {
    schemaVersion: 1, runtimeVersion: '1', managedFiles: [],
    modules: [], snippets: [], extensions: [],
    validations: results.map(({ id, provider, required, when }) => ({
      id, provider, required, when: when ?? { kind: 'always' }, config: {},
    })),
  };
  const steering = path.join(f.root, 'steering');
  fs.mkdirSync(steering, { recursive: true });
  const manifestPath = path.join(steering, 'manifest.json');
  const manifestBytes = JSON.stringify(manifest);
  fs.writeFileSync(manifestPath, manifestBytes);
  const steeringHash = `sha256:${createHash('sha256')
    .update(`steering/manifest.json\0${manifestBytes}`).digest('hex')}`;
  const target = path.join(f.root, '.omp/sdlc/verification/42.json');
  const head = f.git('rev-parse', 'HEAD');
  const specHash = `sha256:${createHash('sha256').update(
    ['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md']
      .map((name) => `${name}\0${fs.readFileSync(path.join(f.root, SPEC, name))}`).join('\0'),
  ).digest('hex')}`;
  const runPath = path.join(f.root, '.omp/sdlc/run.json');
  const runId = fs.existsSync(runPath) ? JSON.parse(fs.readFileSync(runPath)).runId
    : `verification-${createHash('sha256')
      .update(`${fs.realpathSync(f.root)}\0${42}\0${SPEC}\0${head}`).digest('hex')}`;
  const registeredResults = results.map((result, index) => {
    const validation = manifest.validations[index];
    const validationConfigHash = `sha256:${createHash('sha256')
      .update(canonicalJson(validation)).digest('hex')}`;
    const identity = { headSha: head, steeringHash, specHash, validationConfigHash };
    if (!result.applicable) return { ...result, result: null };
    return {
      ...result,
      request: {
        schemaVersion: 1, validationId: result.id, projectRoot: fs.realpathSync(f.root),
        config: validation.config, identity,
        verification: { runId, issue: 42, specPath: SPEC },
      },
      result: {
        schemaVersion: 1, status: result.effectiveStatus, identity,
        summary: result.effectiveStatus === 'passed' ? 'command exited 0' : 'provider failed',
        evidence: [{ kind: 'command', summary: 'registered fixture gate' }],
      },
    };
  });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({
    schemaVersion: 1,
    issue: 42,
    identity: { headSha: head, steeringHash, specHash },
    baseRef: 'main',
    changedPaths: [],
    ceiling,
    coverage: { declared: results.length, recorded: results.length,
      complete: true, missing: [], duplicate: [], unknown: [] },
    results: registeredResults,
    ...overrides,
  })}\n`);
  return target;
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('verification finalization controller', () => {
  it('publishes resolver-produced scope to the actual upstream before passing', () => {
    const f = fixture();
    const outcome = f.finalize();
    expect(outcome).toMatchObject({ status: 0, handoff: { status: 'passed', intervention: false, next: 'deliver' } });
    expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
    expect(f.git('log', '-1', '--format=%s')).toBe(SUBJECT);
    expect(f.git('--git-dir', f.remote, 'rev-parse', 'refs/heads/42-feature')).toBe(f.git('rev-parse', 'HEAD'));
    expect(f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).toBe(REPORT);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/run.json'))).toBe(false);
  });
  it('rejects standalone Pass when the registered gate artifact is absent', () => {
    const f = fixture();
    fs.rmSync(path.join(f.root, '.omp/sdlc/verification/42.json'));
    expect(f.finalize()).toMatchObject({
      status: 1, handoff: { status: 'failed', reasonCode: 'verification_recheck_invalid' },
    });
    expect(mutations(f.calls)).toEqual([]);
  });


  it.each([
    ['a newly required AC', (root) => fs.appendFileSync(path.join(root, SPEC, 'requirements.md'), '\n### AC2: Verify publication head\n')],
    ['a renamed scenario', (root) => {
      const target = path.join(root, SPEC, 'feature.gherkin');
      fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace('Scenario: Publish current evidence', 'Scenario: Publish exact-head evidence'));
    }],
  ])('rejects stale report after %s as local evidence repair', (_description, changeSpec) => {
    const f = fixture(); changeSpec(f.root);
    const outcome = f.finalize();
    expect(outcome).toMatchObject({ status: 1, handoff: { intervention: false, reasonCode: 'verification_not_ready', next: null } });
    expect(isRemediableFailedHandoff({ step: 'verify', state: 'idle', handoff: outcome.handoff })).toBe(true);
    expect(mutations(f.calls)).toEqual([]);
  });

  it.each([
    ['missing spec file', (root) => fs.rmSync(path.join(root, SPEC, 'design.md'))],
    ['ambiguous spec selection', (root) => fs.mkdirSync(path.join(root, 'specs/42-other'))],
    ['invalid inventory', (root) => fs.appendFileSync(path.join(root, SPEC, 'requirements.md'), '\n### AC1: Duplicate authority\n')],
    ['invalid ownership manifest', (root) => fs.writeFileSync(path.join(root, SPEC, 'issue-scope.json'), '{}\n')],
    ['unapproved spec', (root) => {
      const target = path.join(root, SPEC, 'design.md');
      fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace('Status**: Approved', 'Status**: Draft'));
    }],
  ])('keeps %s as intervention', (_description, changeSpec) => {
    const f = fixture(); changeSpec(f.root);
    const outcome = f.finalize();
    expect(outcome).toMatchObject({ status: 1, handoff: { intervention: true, reasonCode: 'spec_not_approved', next: null } });
    expect(isRemediableFailedHandoff({ step: 'verify', state: 'idle', handoff: outcome.handoff })).toBe(false);
    expect(mutations(f.calls)).toEqual([]);
  });

  it.each(['Fail', 'Partial', 'Incomplete'])('never rewrites or publishes a %s report on repeated finalization', (status) => {
    const f = fixture(status);
    const before = fs.readFileSync(path.join(f.root, REPORT));
    for (let invocation = 0; invocation < 2; invocation += 1) {
      const outcome = f.finalize();
      expect(outcome).toMatchObject({ status: 1, handoff: { status: 'failed', reasonCode: 'verification_not_ready', intervention: status === 'Incomplete', next: null } });
      expect(validateHandoff(outcome.handoff)).toEqual(outcome.handoff);
      expect(isRemediableFailedHandoff({ step: 'verify', state: 'idle', handoff: outcome.handoff })).toBe(status !== 'Incomplete');
    }
    expect(fs.readFileSync(path.join(f.root, REPORT))).toEqual(before);
    expect(mutations(f.calls)).toEqual([]);
    expect(f.state().records).toEqual([]);
  });

  it('stops a consumed changed-head recheck when its new gate fails', () => {
    const f = fixture('Fail');
    const head = f.git('rev-parse', 'HEAD');
    consumeSafeRecovery({
      cwd: f.root, ownerId: f.ownerId, issue: 42, step: 'verify',
      class: `changed_head_verification_recheck:${'a'.repeat(40)}:${head}`, evidence: { newHead: head },
    });
    writeVerificationArtifact(f, [{
      id: 'repository.api-tests', provider: 'builtin.command',
      required: true, applicable: true, effectiveStatus: 'failed',
    }]);
    const outcome = f.finalize();
    expect(outcome).toMatchObject({
      status: 1,
      handoff: { intervention: true, reasonCode: 'verification_recheck_not_ready', next: null },
    });
    expect(mutations(f.calls)).toEqual([]);
  });

  it('publishes a passing replacement report only with passing changed-head gate evidence', () => {
    const f = fixture('Fail');
    consumeSafeRecovery({
      cwd: f.root, ownerId: f.ownerId, issue: 42, step: 'verify',
      class: `changed_head_verification_recheck:${'a'.repeat(40)}:${f.git('rev-parse', 'HEAD')}`, evidence: { newHead: f.git('rev-parse', 'HEAD') },
    });
    writeVerificationArtifact(f, [{
      id: 'repository.api-tests', provider: 'builtin.command',
      required: true, applicable: true, effectiveStatus: 'passed',
    }]);
    expect(f.finalize().handoff).toMatchObject({ intervention: true, reasonCode: 'verification_recheck_not_ready' });
    fs.writeFileSync(path.join(f.root, REPORT), `${report(f.root, 'Pass')}\n**Verification head**: ${f.git('rev-parse', 'HEAD')}\n`);
    expect(f.finalize()).toMatchObject({ status: 0, handoff: { status: 'passed', next: 'deliver' } });
  });

  it('retains a truthful new-head failure as remediable without delivering', () => {
    const f = fixture('Fail');
    const head = f.git('rev-parse', 'HEAD');
    consumeSafeRecovery({
      cwd: f.root, ownerId: f.ownerId, issue: 42, step: 'verify',
      class: `changed_head_verification_recheck:${'a'.repeat(40)}:${head}`, evidence: { newHead: head },
    });
    writeVerificationArtifact(f, [{
      id: 'repository.api-tests', provider: 'builtin.command',
      required: true, applicable: true, effectiveStatus: 'failed',
    }]);
    fs.writeFileSync(path.join(f.root, REPORT), `${report(f.root, 'Fail')}\n**Verification head**: ${head}\n`);
    const outcome = f.finalize();
    expect(outcome).toMatchObject({
      status: 1, handoff: { intervention: false, reasonCode: 'verification_not_ready', next: 'implement', verificationHead: head },
    });
    expect(remediationCompletedSteps({
      issue: 42, step: 'verify',
      completed: ['start', 'implement', 'review1', 'fix1', 'review2', 'fix2'],
      handoff: outcome.handoff,
    })).toEqual(['start']);
  });

  it.each(['incomplete', 'failed'])('does not turn a %s project-provider gate into implementation authority', (status) => {
    const f = fixture('Partial');
    const head = f.git('rev-parse', 'HEAD');
    consumeSafeRecovery({
      cwd: f.root, ownerId: f.ownerId, issue: 42, step: 'verify',
      class: `changed_head_verification_recheck:${'a'.repeat(40)}:${head}`,
      evidence: { newHead: head },
    });
    writeVerificationArtifact(f, [{
      id: 'repository.provider', provider: 'project.external',
      required: true, applicable: true, effectiveStatus: status,
    }]);
    fs.writeFileSync(path.join(f.root, REPORT), `${report(f.root, 'Partial')}\n**Verification head**: ${head}\n`);
    expect(f.finalize()).toMatchObject({
      status: 1,
      handoff: { intervention: true, reasonCode: 'verification_recheck_not_ready', next: null },
    });
  });

  it('rewinds mixed Incomplete evidence to implementation for trusted local failures', () => {
    const f = fixture('Incomplete');
    writeVerificationArtifact(f, [
      {
        id: 'repository.api-tests', provider: 'builtin.command',
        required: true, applicable: true, effectiveStatus: 'failed',
      },
      {
        id: 'repository.robot-integration', provider: 'project.robot-integration',
        required: true, applicable: true, effectiveStatus: 'incomplete',
      },
    ]);
    const outcome = f.finalize();
    expect(outcome).toMatchObject({
      status: 1,
      handoff: {
        status: 'failed',
        intervention: false,
        reasonCode: 'verification_not_ready',
        next: 'implement',
        artifacts: [
          REPORT,
          '.omp/sdlc/verification/42.json',
        ],
        summary: expect.stringContaining('local failures: repository.api-tests'),
      },
    });
    expect(outcome.handoff.summary).toContain('external incomplete: repository.robot-integration');
    expect(isRemediableFailedHandoff({
      step: 'verify',
      state: 'idle',
      handoff: outcome.handoff,
    })).toBe(true);
    expect(mutations(f.calls)).toEqual([]);
  });

  it('retains local repair feedback after a changed-head mixed gate', () => {
    const f = fixture('Incomplete');
    const head = f.git('rev-parse', 'HEAD');
    consumeSafeRecovery({
      cwd: f.root, ownerId: f.ownerId, issue: 42, step: 'verify',
      class: `changed_head_verification_recheck:${'a'.repeat(40)}:${head}`,
      evidence: { newHead: head },
    });
    writeVerificationArtifact(f, [
      { id: 'repository.api-tests', provider: 'builtin.command',
        required: true, applicable: true, effectiveStatus: 'failed' },
      { id: 'repository.robot-integration', provider: 'project.robot-integration',
        required: true, applicable: true, effectiveStatus: 'incomplete' },
    ]);
    fs.appendFileSync(path.join(f.root, REPORT), `\n**Verification head**: ${head}\n`);
    expect(f.finalize()).toMatchObject({
      status: 1,
      handoff: { status: 'failed', intervention: false,
        reasonCode: 'verification_not_ready', next: 'implement', verificationHead: head },
    });
    expect(mutations(f.calls)).toEqual([]);
  });

  it.each([
    ['incomplete-only', [{
      id: 'repository.robot-integration', provider: 'project.robot-integration',
      required: true, applicable: true, effectiveStatus: 'incomplete',
    }], {}],
    ['external failure', [{
      id: 'repository.remote-policy', provider: 'project.remote-policy',
      required: true, applicable: true, effectiveStatus: 'failed',
    }], {}],
    ['stale head', [{
      id: 'repository.api-tests', provider: 'builtin.command',
      required: true, applicable: true, effectiveStatus: 'failed',
    }], { identity: { headSha: 'f'.repeat(40) } }],
  ])('keeps %s Incomplete artifact evidence as intervention', (_label, results, overrides) => {
    const f = fixture('Incomplete');
    writeVerificationArtifact(f, results, overrides);
    expect(f.finalize()).toMatchObject({
      status: 1,
      handoff: {
        intervention: true,
        reasonCode: 'verification_not_ready',
        next: null,
      },
    });
  });

  it('permits regenerated complete evidence without publishing the incomplete report', () => {
    const f = fixture(null);
    const outcome = f.finalize();
    expect(outcome).toMatchObject({ status: 1, handoff: { intervention: false, next: null } });
    expect(isRemediableFailedHandoff({ step: 'verify', state: 'idle', handoff: outcome.handoff })).toBe(true);
    expect(mutations(f.calls)).toEqual([]);
    writeVerificationArtifact(f, []);
    fs.writeFileSync(path.join(f.root, REPORT),
      `${report(f.root)}\n**Verification head**: ${f.git('rev-parse', 'HEAD')}\n`);
    expect(f.finalize()).toMatchObject({ status: 0, handoff: { status: 'passed' } });
  });

  it('rejects a symlink report without publishing', () => {
    const f = fixture();
    const target = path.join(f.root, 'foreign-report.md');
    fs.renameSync(path.join(f.root, REPORT), target);
    fs.symlinkSync(target, path.join(f.root, REPORT));
    expect(f.finalize().handoff).toMatchObject({ intervention: true, reasonCode: 'verification_report_invalid' });
    expect(mutations(f.calls)).toEqual([]);
  });

  it('requires the execute lease identity before publishing protected state', () => {
    const f = fixture();
    const lease = acquireControllerLease({ projectRoot: f.root, runId: 'execute-run', controllerPaneId: 'execute-pane' });
    try {
      expect(f.finalize()).toMatchObject({ status: 1, stderr: 'controller_lease_held\n', handoff: null });
      expect(f.calls).toEqual([]);
      expect(f.finalize({ controllerRunId: 'execute-run' })).toMatchObject({
        status: 1, stderr: 'recovery_owner_ambiguous\n', handoff: null,
      });
    } finally { releaseControllerLease(lease); }
  });

  it.each(['fresh', 'joined'])('publishes under the original controller owner through a %s lease', (mode) => {
    const f = fixture('Pass', { createOwner: false });
    const runId = 'execute-original';
    const runPath = path.join(f.root, '.omp/sdlc/run.json');
    fs.mkdirSync(path.dirname(runPath), { recursive: true });
    fs.writeFileSync(runPath, JSON.stringify({
      schemaVersion: 1, runId, projectRoot: fs.realpathSync(f.root),
      issues: [42], currentIssue: 42, currentStep: 'verify',
      remediation: { completedAttempts: 2 }, recoveries: [],
    }));
    writeVerificationArtifact(f, [{
      id: 'repository.api-tests', provider: 'builtin.command',
      required: true, applicable: true, effectiveStatus: 'passed',
    }]);
    const checkpoint = fs.readFileSync(runPath);
    const lease = mode === 'joined' ? acquireControllerLease({ projectRoot: f.root, runId }) : null;
    try {
      expect(f.finalize({ controllerRunId: runId })).toMatchObject({ status: 0, handoff: { status: 'passed' } });
      expect(f.state().owners).toEqual([expect.objectContaining({ ownerId: runId, issue: 42, step: 'verify' })]);
      expect(f.state().records).toEqual([]);
      expect(f.git('--git-dir', f.remote, 'rev-parse', 'refs/heads/42-feature')).toBe(f.git('rev-parse', 'HEAD'));
      expect(fs.readFileSync(runPath)).toEqual(checkpoint);
      const lockPath = path.join(f.root, '.omp/sdlc/controller.lock');
      if (lease) expect(fs.readFileSync(lockPath, 'utf8')).toBe(lease.serialized);
      else expect(fs.existsSync(lockPath)).toBe(false);
    } finally { if (lease) releaseControllerLease(lease); }
  });
  it('accepts a complete zero-declaration gate under an active controller', () => {
    const f = fixture('Pass', { createOwner: false });
    const runId = 'execute-no-registered-gates';
    const runPath = path.join(f.root, '.omp/sdlc/run.json');
    fs.mkdirSync(path.dirname(runPath), { recursive: true });
    fs.writeFileSync(runPath, JSON.stringify({
      schemaVersion: 1, runId, projectRoot: fs.realpathSync(f.root),
      issues: [42], currentIssue: 42, currentStep: 'verify',
    }));
    writeVerificationArtifact(f, []);
    expect(f.finalize({ controllerRunId: runId })).toMatchObject({
      status: 0, handoff: { status: 'passed' },
    });
  });

  it.each(['omitted', 'optional', 'bare pass', 'wrong invocation', 'stale report'])('rejects %s required verification evidence under an active controller', (defect) => {
    const f = fixture('Pass', { createOwner: false });
    const runId = 'execute-exact-gate';
    const runPath = path.join(f.root, '.omp/sdlc/run.json');
    fs.mkdirSync(path.dirname(runPath), { recursive: true });
    fs.writeFileSync(runPath, JSON.stringify({
      schemaVersion: 1, runId, projectRoot: fs.realpathSync(f.root),
      issues: [42], currentIssue: 42, currentStep: 'verify',
    }));
    const target = writeVerificationArtifact(f, [
      { id: 'required.one', provider: 'builtin.command', required: true,
        applicable: true, effectiveStatus: 'passed' },
      { id: 'required.two', provider: 'builtin.command', required: true,
        applicable: true, effectiveStatus: 'passed' },
    ]);
    if (defect === 'stale report') {
      const reportPath = path.join(f.root, REPORT);
      fs.writeFileSync(reportPath, fs.readFileSync(reportPath, 'utf8')
        .replace(f.git('rev-parse', 'HEAD'), 'a'.repeat(40)));
    }
    if (defect !== 'stale report') {
      const artifact = JSON.parse(fs.readFileSync(target));
      if (defect === 'omitted') {
        artifact.results.pop();
        artifact.coverage.recorded = 1;
      } else if (defect === 'optional') {
        artifact.results[1].required = false;
        artifact.results[1].effectiveStatus = 'failed';
      } else if (defect === 'bare pass') {
        delete artifact.results[1].request;
        delete artifact.results[1].result;
      } else {
        artifact.results[1].request.verification.runId = 'foreign-run';
      }
      fs.writeFileSync(target, JSON.stringify(artifact));
    }
    expect(f.finalize({ controllerRunId: runId })).toMatchObject({
      status: 1, handoff: { status: 'failed', reasonCode: 'verification_recheck_invalid' },
    });
    expect(mutations(f.calls)).toEqual([]);
  });
  it('rejects a required path-exists validation falsely marked inapplicable', () => {
    const f = fixture('Pass');
    const target = writeVerificationArtifact(f, [{
      id: 'required.path', provider: 'builtin.command', required: true,
      when: { kind: 'path_exists', path: SPEC },
      applicable: false, effectiveStatus: 'skipped',
    }]);
    const artifact = JSON.parse(fs.readFileSync(target));
    artifact.ceiling = null;
    fs.writeFileSync(target, JSON.stringify(artifact));
    expect(f.finalize()).toMatchObject({
      status: 1, handoff: { status: 'failed', reasonCode: 'verification_recheck_invalid' },
    });
    expect(mutations(f.calls)).toEqual([]);
  });
  it.each([
    ['falsified source change', true, 1],
    ['truly inapplicable', false, 0],
  ])('checks changed-path applicability for %s', (_label, sourceChanged, expectedStatus) => {
    const f = fixture('Pass');
    f.git('branch', 'main');
    if (sourceChanged) {
      fs.mkdirSync(path.join(f.root, 'src'));
      fs.writeFileSync(path.join(f.root, 'src/change.py'), 'changed = True\n');
      f.git('add', 'src/change.py');
      f.git('commit', '-m', 'fix: changed project source');
    }
    fs.writeFileSync(path.join(f.root, REPORT),
      `${report(f.root)}\n**Verification head**: ${f.git('rev-parse', 'HEAD')}\n`);
    writeVerificationArtifact(f, [{
      id: 'required.paths', provider: 'builtin.command', required: true,
      when: { kind: 'changed_paths', include: ['src/**'] },
      applicable: false, effectiveStatus: 'skipped',
    }], { changedPaths: [] });
    const run = (command, args, options) => command === 'gh' && args[0] === 'repo'
      ? { status: 0, stdout: 'main\n' } : f.run(command, args, options);
    const outcome = f.finalize({ run });
    expect(outcome).toMatchObject({
      status: expectedStatus,
      handoff: { status: expectedStatus ? 'failed' : 'passed',
        ...(expectedStatus ? { reasonCode: 'verification_recheck_invalid' } : {}) },
    });
    if (sourceChanged) expect(mutations(f.calls)).toEqual([]);
  });




  it.each([['SIGINT', 130], ['SIGTERM', 143]])('releases its owned lease on %s', (signal, exitCode) => {
    const f = fixture();
    const processApi = new EventEmitter();
    processApi.exit = (code) => { throw new Error(`signal_exit_${code}`); };
    const run = (command, args, options) => {
      if (args.join(' ') === 'branch --show-current') processApi.emit(signal);
      return f.run(command, args, options);
    };
    expect(() => f.finalize({ run, processApi })).toThrow(`signal_exit_${exitCode}`);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/controller.lock'))).toBe(false);
    expect(processApi.listenerCount('SIGINT')).toBe(0);
    expect(processApi.listenerCount('SIGTERM')).toBe(0);
  });

  it('acknowledges an exact published report without an empty commit or push', () => {
    const f = fixture(); const head = f.commitReport(); f.git('push');
    expect(f.finalize().status).toBe(0);
    expect(mutations(f.calls)).toEqual([]);
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
  });

  it('automatically reconciles a failed first push before handing off, then acknowledges under a new lease', () => {
    const f = fixture();
    let pushes = 0;
    const initial = f.finalize({ run: (command, args, options) => {
      if (args[0] === 'push' && pushes++ === 0) return failed;
      return f.run(command, args, options);
    } });
    expect(initial).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(pushes).toBe(2);
    const head = f.git('rev-parse', 'HEAD');
    expect(f.git('rev-parse', '@{u}')).toBe(head);
    const firstLease = f.leaseIds[0];
    const consumed = f.state();
    expect(consumed.records).toEqual([expect.objectContaining({ class: 'stage_publication', runId: f.ownerId, issue: 42, step: 'verify', evidence: expect.objectContaining({ commitSha: head }) })]);
    expect(f.calls.filter((call) => call[1] === 'commit')).toHaveLength(1);
    expect(f.calls.filter((call) => call[1] === 'push')).toEqual([['git', 'push', 'origin', 'HEAD:refs/heads/42-feature']]);
    f.calls.length = 0; f.leaseIds.length = 0;
    expect(f.finalize().status).toBe(0);
    expect(f.leaseIds[0]).not.toBe(firstLease);
    expect(f.state()).toEqual(consumed);
    expect(mutations(f.calls)).toEqual([]);
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
    expect(f.git('--git-dir', f.remote, 'rev-parse', 'refs/heads/42-feature')).toBe(head);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('does not repeat a consumed recovery push after restart with a new session and lease', () => {
    const f = fixture(); f.commitReport();
    let pushes = 0;
    const run = (command, args, options) => {
      if (args[0] === 'push') { pushes += 1; return failed; }
      return f.run(command, args, options);
    };
    expect(f.finalize({ run, sessionToken: '11111111-1111-4111-8111-111111111111' }).status).toBe(1);
    const firstLease = f.leaseIds[0];
    const consumed = f.state();
    f.leaseIds.length = 0;
    expect(f.finalize({ run, sessionToken: '22222222-2222-4222-8222-222222222222' }).status).toBe(1);
    expect(f.leaseIds[0]).not.toBe(firstLease);
    expect(pushes).toBe(1);
    expect(consumed.records).toHaveLength(1);
    expect(f.state()).toEqual(consumed);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/run.json'))).toBe(false);
  });

  it('stops dirty partial publication without recommitting the known pending report', () => {
    const f = fixture(); const head = f.commitReport();
    fs.appendFileSync(path.join(f.root, REPORT), '\nUncommitted partial evidence\n');
    const before = fs.readFileSync(path.join(f.root, REPORT));
    expect(f.finalize()).toMatchObject({ status: 1, handoff: { reasonCode: 'verification_publish_failed' } });
    expect(mutations(f.calls)).toEqual([]);
    expect(f.git('rev-parse', 'HEAD')).toBe(head);
    expect(fs.readFileSync(path.join(f.root, REPORT))).toEqual(before);
    expect(f.state().records).toEqual([]);
  });

  it('rejects unrelated dirty paths without staging anything', () => {
    const f = fixture(); fs.writeFileSync(path.join(f.root, 'unrelated.txt'), 'leave alone\n');
    expect(f.finalize().handoff).toMatchObject({ intervention: true, reasonCode: 'verification_publish_failed' });
    expect(mutations(f.calls)).toEqual([]);
    expect(fs.readFileSync(path.join(f.root, 'unrelated.txt'), 'utf8')).toBe('leave alone\n');
  });

  it.each(['add', 'commit', 'push'])('fails closed when initial git %s fails', (operation) => {
    const f = fixture();
    const outcome = f.finalize({ run: (command, args, options) => args[0] === operation ? failed : f.run(command, args, options) });
    expect(outcome).toMatchObject({ status: 1, handoff: { reasonCode: 'verification_publish_failed' } });
  });

  it('stops clean publication without an upstream instead of inventing one', () => {
    const f = fixture(); f.commitReport(); f.git('branch', '--unset-upstream');
    expect(f.finalize().handoff.reasonCode).toBe('verification_publish_failed');
    expect(mutations(f.calls)).toEqual([]);
  });

  it('rejects foreign --controller-run-id relative to active run.json/owner before handoff or publication', () => {
    const f = fixture('Pass', { createOwner: false });
    const runId = 'execute-original';
    const foreign = 'foreign-run-xyz';
    const runPath = path.join(f.root, '.omp/sdlc/run.json');
    fs.mkdirSync(path.dirname(runPath), { recursive: true });
    fs.writeFileSync(runPath, JSON.stringify({
      schemaVersion: 1, runId, projectRoot: fs.realpathSync(f.root),
      issues: [42], currentIssue: 42, currentStep: 'verify',
      remediation: { completedAttempts: 2 }, recoveries: [],
    }));
    const checkpoint = fs.readFileSync(runPath);
    const outcome = f.finalize({ controllerRunId: foreign });
    expect(outcome).toMatchObject({ status: 1, stderr: 'recovery_owner_ambiguous\n', handoff: null });
    expect(mutations(f.calls)).toEqual([]);
    expect(fs.readFileSync(runPath)).toEqual(checkpoint);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/handoffs/42-verify.json'))).toBe(false);
  });

  it('fails closed on symlinked/nonregular handoff target or parent with no outside overwrite', () => {
    const f = fixture();
    const handoffs = path.join(f.root, '.omp/sdlc/handoffs');
    fs.mkdirSync(handoffs, { recursive: true });
    const outside = path.join(f.root, 'outside-handoff.json');
    fs.writeFileSync(outside, '{"foreign":true}\n');
    const target = path.join(handoffs, '42-verify.json');
    fs.symlinkSync(outside, target);
    const outcome = f.finalize();
    expect(outcome.status).toBe(1);
    expect(outcome.handoff).toBeNull();
    expect(outcome.stderr).toMatch(/handoff_target_unsafe/);
    expect(fs.readFileSync(outside, 'utf8')).toBe('{"foreign":true}\n'); // no overwrite
    expect(mutations(f.calls)).toEqual([]);
  });

  it('keeps provider ceiling as intervention under active controller or recheck history', () => {
    const f = fixture('Pass');
    const head = f.git('rev-parse', 'HEAD');
    consumeSafeRecovery({
      cwd: f.root, ownerId: f.ownerId, issue: 42, step: 'verify',
      class: `changed_head_verification_recheck:${'c'.repeat(40)}:${head}`, evidence: { newHead: head },
    });
    writeVerificationArtifact(f, [{
      id: 'policy.check', provider: 'project.external',
      required: true, applicable: true, effectiveStatus: 'passed',
    }], { ceiling: 'Fail' });
    const outcome = f.finalize();
    expect(outcome).toMatchObject({ status: 1, handoff: { intervention: true, reasonCode: 'verification_recheck_invalid' } });
    expect(mutations(f.calls)).toEqual([]);
  });

  it('rejects Pass at C with stale B artifact when owner has prior changed-head recheck history', () => {
    const f = fixture('Fail');
    const bHead = 'b'.repeat(40);
    const cHead = f.git('rev-parse', 'HEAD');
    consumeSafeRecovery({
      cwd: f.root, ownerId: f.ownerId, issue: 42, step: 'verify',
      class: `changed_head_verification_recheck:${'a'.repeat(40)}:${bHead}`, evidence: { newHead: bHead },
    });
    writeVerificationArtifact(f, [{
      id: 'repository.api-tests', provider: 'builtin.command',
      required: true, applicable: true, effectiveStatus: 'passed',
    }], { identity: { headSha: bHead } });
    fs.writeFileSync(path.join(f.root, REPORT), `${report(f.root, 'Pass')}\n**Verification head**: ${cHead}\n`);
    const outcome = f.finalize();
    expect(outcome).toMatchObject({ status: 1, handoff: { intervention: true, reasonCode: 'verification_recheck_invalid' } });
    expect(mutations(f.calls)).toEqual([]);
  });
});
