import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { recoverVerification } from '../sdlc-recover-verification.mjs';
import { inspectIssueSpecScope } from '../issue-spec-scope.mjs';
import { resolveRecoveryOwner } from '../sdlc-safe-recoveries.mjs';

const roots = [];
const SPEC = 'specs/42-feature';
const REPORT = `${SPEC}/verification-report.md`;

function report(root, implementationStatus = 'Incomplete') {
  const { issueNumber, specPath, status: scopeStatus, delivery, regression } = inspectIssueSpecScope({
    projectRoot: root, issueNumber: 42, specPath: SPEC,
  });
  const scope = { issueNumber, specPath, status: scopeStatus, delivery, regression };
  const status = implementationStatus == null ? '' : `## Implementation Status: **${implementationStatus}**\n\n`;
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  return `# Verification\n\n${status}**Verification head**: ${head}\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(scope)} -->\n\n## Remaining Issues\n- src/repair.py: observed assertion failure\n`;
}

function fixture(implementationStatus = 'Incomplete', { createOwner = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-recover-verification-'));
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
  git('config', 'user.name', 'Recover fixture');
  git('config', 'user.email', 'recover@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', path.join(base, 'no-hooks'));
  fs.mkdirSync(path.join(root, SPEC), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'));
  const header = '**Issue**: #42\n**Status**: Approved\n\n';
  fs.writeFileSync(path.join(root, SPEC, 'requirements.md'), `${header}### AC1: Recover external incomplete\n\n| FR1 | External recheck only for external-only incomplete | Must |\n`);
  fs.writeFileSync(path.join(root, SPEC, 'design.md'), `${header}External incomplete recovery after prerequisite.\n`);
  fs.writeFileSync(path.join(root, SPEC, 'tasks.md'), `${header}### T001: Recover verification\n\n**File(s)**: \`${REPORT}\`\n`);
  fs.writeFileSync(path.join(root, SPEC, 'feature.gherkin'), `${header}Feature: Recover\n  Scenario: External only\n    Given external incomplete\n    When prerequisite returns\n    Then recover recheck gate once\n`);
  fs.writeFileSync(path.join(root, REPORT), '# Pending\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.omp/\n');
  git('add', '.');
  git('commit', '-m', 'chore: initialize recover fixture');
  git('remote', 'add', 'origin', remote);
  git('push', '-u', 'origin', '42-feature');
  const ownerId = createOwner ? resolveRecoveryOwner({ cwd: root, issue: 42, step: 'verify' }) : null;
  fs.writeFileSync(path.join(root, REPORT), report(root, implementationStatus));
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, ...args]);
    return spawnSync(command, args, { encoding: 'utf8', ...options });
  };
  let declarations = [];
  const recover = (overrides = {}) => recoverVerification({ issue: 42, spec: SPEC, cwd: root, run, loadRuntime: async () => ({ steeringHash: 'sha256:' + 'a'.repeat(64), validations: declarations }), ...overrides });
  const state = () => {
    const p = path.join(root, '.omp/sdlc/safe-recoveries.json');
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const writeArtifact = (results, overrides = {}) => {
    const required = results.filter((r) => r.required && r.applicable);
    declarations = results.map(({ id, provider, required }) => ({ id, provider, required }));
    const ceiling = required.some((r) => r.effectiveStatus === 'incomplete') ? 'Incomplete' : (required.some((r) => r.effectiveStatus !== 'passed') ? 'Fail' : null);
    const target = path.join(root, '.omp/sdlc/verification/42.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const identity = { headSha: git('rev-parse', 'HEAD'), steeringHash: 'sha256:' + 'a'.repeat(64), ...overrides.identity };
    // compute matching real specHash (recover requires nonempty exact match)
    if (!identity.specHash) {
      const files = ['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md'];
      const joined = files.map((n) => `${n}\0${fs.readFileSync(path.join(root, SPEC, n))}`).join('\0');
      identity.specHash = 'sha256:' + createHash('sha256').update(joined).digest('hex');
    }
    fs.writeFileSync(target, `${JSON.stringify({
      schemaVersion: 1,
      issue: 42,
      identity,
      ceiling,
      coverage: { declared: declarations.length, recorded: results.length, complete: true, missing: [], duplicate: [], unknown: [] },
      results,
      ...overrides,
    })}\n`);
    return target;
  };
  const mutateSpec = (fn) => fn(root, SPEC);
  return { root, remote, git, run, calls, ownerId, recover, state, writeArtifact, mutateSpec };
}

function makeExternalIncomplete(id = 'ext.check') {
  return { id, provider: 'project.ext-check', required: true, applicable: true, effectiveStatus: 'incomplete' };
}
function makeLocalIncomplete(id = 'loc.cmd') {
  return { id, provider: 'builtin.command', required: true, applicable: true, effectiveStatus: 'incomplete' };
}
function makeLocalFailed(id = 'loc.cmd') {
  return { id, provider: 'builtin.command', required: true, applicable: true, effectiveStatus: 'failed' };
}
function makeExternalFailed(id = 'ext.fail') {
  return { id, provider: 'project.remote', required: true, applicable: true, effectiveStatus: 'failed' };
}
function makeSkippedRequired(id = 'skipped') {
  return { id, provider: 'builtin.command', required: true, applicable: true, effectiveStatus: 'skipped' };
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('sdlc-recover-verification external-only incomplete recheck', () => {
  it('classifies ordinary Pass (publication-only) as not_applicable', async () => {
    const f = fixture('Pass');
    f.writeArtifact([ { id: 'ok', provider: 'builtin.command', required: true, applicable: true, effectiveStatus: 'passed' } ]);
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'not_applicable' });
  });


  it('rejects local required failure as ineligible', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeLocalFailed() ]);
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'has_non_recoverable_required_status' });
  });

  it('rejects external required failure as ineligible', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeExternalFailed() ]);
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'has_non_recoverable_required_status' });
  });

  it('rejects local incomplete required (not external-only)', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeLocalIncomplete() ]);
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'has_non_recoverable_required_status' });
  });

  it('rejects skipped required status', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeSkippedRequired() ]);
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'has_non_recoverable_required_status' });
  });

  it('positive: external-only incomplete + matching artifact + owner + clean report-only + nonempty specHash -> recover true after consume', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeExternalIncomplete('ext.prereq') ]);
    const res = await f.recover();
    expect(res).toEqual({ recover: true });
    const after = f.state();
    expect(after && after.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ class: 'external_verification_recheck', runId: f.ownerId, issue: 42, step: 'verify', disposition: 'consumed' }),
    ]));
  });

  it('rechecks a failed report only after a published repair changes the exact head', async () => {
    const f = fixture('Fail');
    const oldHead = f.git('rev-parse', 'HEAD');
    const artifact = f.writeArtifact([makeLocalFailed()]);
    const oldReport = fs.readFileSync(path.join(f.root, REPORT));
    const oldArtifact = fs.readFileSync(artifact);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: repair verification #42');
    f.git('push');

    expect(await f.recover()).toEqual({ recover: true, kind: 'changed_head_failed_report' });
    const records = f.state().records.filter((entry) => entry.class.startsWith('changed_head_verification_recheck:'));
    expect(records).toHaveLength(1);
    expect(records[0].evidence.oldHead).toBe(oldHead);
    expect(records[0].evidence.newHead).toBe(f.git('rev-parse', 'HEAD'));
    const archive = path.join(f.root, records[0].evidence.archive);
    expect(fs.readFileSync(path.join(archive, 'report.md'))).toEqual(oldReport);
    expect(fs.readFileSync(path.join(archive, 'artifact.json'))).toEqual(oldArtifact);
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'changed_head_recheck_already_consumed' });
  });

  it('rechecks a mixed local failure only after a distinct published repair', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([makeLocalFailed(), makeExternalIncomplete()]);
    expect(await f.recover()).toEqual({
      recover: false, reasonCode: 'has_non_recoverable_required_status',
    });
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'new local repair\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: resolve local gate #42');
    f.git('push');
    expect(await f.recover()).toEqual({ recover: true, kind: 'changed_head_failed_report' });
    expect(f.state().records.filter((entry) => entry.class.startsWith('changed_head_verification_recheck:')))
      .toHaveLength(1);
  });

  it('binds a markerless mixed failure to archived controller feedback before rechecking a repair', async () => {
    const f = fixture('Incomplete');
    const oldHead = f.git('rev-parse', 'HEAD');
    const artifactPath = f.writeArtifact([makeLocalFailed(), makeExternalIncomplete()]);
    const reportPath = path.join(f.root, REPORT);
    const markerless = fs.readFileSync(reportPath, 'utf8')
      .replace(/^\*\*Verification head\*\*:.*\n\n/m, '');
    fs.writeFileSync(reportPath, markerless);
    const artifactBytes = fs.readFileSync(artifactPath);
    const artifactDigest = createHash('sha256').update(artifactBytes).digest('hex');
    const reportDigest = createHash('sha256').update(markerless).digest('hex');
    const prefix = `.omp/sdlc/history/verification-feedback/42-${oldHead}-${artifactDigest}`;
    const archivedReport = path.join(f.root, `${prefix}.report.md`);
    const archivedArtifact = path.join(f.root, `${prefix}.artifact.json`);
    fs.mkdirSync(path.dirname(archivedReport), { recursive: true });
    fs.writeFileSync(archivedReport, markerless);
    fs.writeFileSync(archivedArtifact, artifactBytes);
    fs.writeFileSync(path.join(f.root, '.omp/sdlc/run.json'), JSON.stringify({
      schemaVersion: 1, runId: f.ownerId, projectRoot: fs.realpathSync(f.root),
      currentIssue: 42, currentStep: 'verify',
      verificationFeedback: { issue: 42, history: [{
        head: oldHead, report: `${prefix}.report.md`, reportDigest,
        artifact: `${prefix}.artifact.json`, artifactDigest,
      }] },
    }));
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'new local repair\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: resolve local gate #42');
    f.git('push');
    fs.writeFileSync(archivedReport, 'wrong historical report');
    expect(await f.recover({ controllerRunId: f.ownerId })).toEqual({
      recover: false, reasonCode: 'failed_report_head_unproven',
    });
    fs.writeFileSync(archivedReport, markerless);
    expect(await f.recover({ controllerRunId: f.ownerId, probe: true }))
      .toMatchObject({ recover: false, eligible: true, kind: 'changed_head_failed_report' });
    expect(await f.recover({ controllerRunId: f.ownerId }))
      .toEqual({ recover: true, kind: 'changed_head_failed_report' });
  });

  it.each([
    ['exact posted legacy report', true, '2026-09-24T16:48:00Z', true],
    ['unmatched legacy report', false, '2026-09-24T16:48:00Z', true],
    ['comment after server-observed repair push', true, '2026-09-24T17:20:00Z', true],
    ['missing server push event', true, '2026-09-24T16:48:00Z', false],
    ['same-head repush is not A-to-B', true, '2026-09-24T16:48:00Z', true],
  ])('%s requires independent issue-comment proof', async (_label, posted, commentAt, hasPush) => {
    const f = fixture('Fail');
    const oldHead = f.git('rev-parse', 'HEAD');
    f.writeArtifact([makeLocalFailed()], { generatedAt: '2026-09-24T16:47:00Z' });
    const target = path.join(f.root, REPORT);
    const legacy = fs.readFileSync(target, 'utf8').replace(
      /^\*\*Verification head\*\*:.*$/m,
      `The gate wrote \`.omp/sdlc/verification/42.json\` for HEAD \`${oldHead}\``,
    );
    fs.writeFileSync(target, legacy);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: source repair #42');
    f.git('push');
    const run = (command, args, options) => {
      if (command === 'gh' && args[0] === 'issue') return {
        status: 0,
        stdout: JSON.stringify({ comments: [{
          body: posted ? legacy.replace(/\n+$/, '') : 'different report',
          author: { login: 'operator' }, createdAt: commentAt,
        }] }),
      };
      if (command === 'gh' && args[0] === 'repo') return {
        status: 0, stdout: 'example/consumer\n',
      };
      if (command === 'gh' && args[0] === 'api' && args[1].startsWith('repos/example/consumer/events')) {
        return { status: 0, stdout: JSON.stringify(hasPush ? [{
          type: 'PushEvent', created_at: '2026-09-24T17:16:00Z',
          payload: { ref: 'refs/heads/42-feature',
            before: _label === 'same-head repush is not A-to-B' ? f.git('rev-parse', 'HEAD') : oldHead,
            head: f.git('rev-parse', 'HEAD') },
        }] : []) };
      }
      if (command === 'gh' && args[0] === 'api') return { status: 0, stdout: 'operator\n' };
      return f.run(command, args, options);
    };
    expect(await f.recover({ run })).toEqual(posted && commentAt < '2026-09-24T17:16:00Z'
      && hasPush && _label !== 'same-head repush is not A-to-B'
      ? { recover: true, kind: 'changed_head_failed_report' }
      : { recover: false, reasonCode: 'failed_report_head_unproven' });
  });

  it('allows a distinct second published repair but never reuses either head pair', async () => {
    const f = fixture('Fail');
    const firstHead = f.git('rev-parse', 'HEAD');
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'first repair\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: first repair #42');
    f.git('push');
    expect(await f.recover()).toMatchObject({ recover: true });
    const secondHead = f.git('rev-parse', 'HEAD');
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, REPORT), report(f.root, 'Fail'));
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'different repair\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: different repair #42');
    f.git('push');
    expect(await f.recover()).toMatchObject({ recover: true });
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'changed_head_recheck_already_consumed' });
    expect(f.state().records.filter((entry) =>
      entry.class.startsWith('changed_head_verification_recheck:')).map((entry) => entry.evidence.oldHead))
      .toEqual([firstHead, secondHead]);
  });

  it('does not use a B artifact with the unreplaced A failure report to authorize B-to-C', async () => {
    const f = fixture('Fail');
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'first repair\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: first repair #42');
    f.git('push');
    expect(await f.recover()).toMatchObject({ recover: true });
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'second repair\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: second repair #42');
    f.git('push');
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'failed_report_head_unproven' });
    expect(f.state().records.filter((entry) =>
      entry.class.startsWith('changed_head_verification_recheck:'))).toHaveLength(1);
  });

  it('rejects a failed report with a foreign issue-scope marker', async () => {
    const f = fixture('Fail');
    f.writeArtifact([makeLocalFailed()]);
    const target = path.join(f.root, REPORT);
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace('"issueNumber":42', '"issueNumber":43'));
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: source repair #42');
    f.git('push');
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'verification_report_invalid' });
    expect(f.state().records).toEqual([]);
  });

  it('rejects an empty or documentation-only head advance as a repair', async () => {
    const f = fixture('Fail');
    f.writeArtifact([makeLocalFailed()]);
    f.git('commit', '--allow-empty', '-m', 'fix: no behavior changed #42');
    f.git('push');
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'repair_publication_unproven' });
    expect(f.state().records).toEqual([]);
  });

  it('resumes a complete byte-bound archive left before durable consumption', async () => {
    const f = fixture('Fail');
    const oldHead = f.git('rev-parse', 'HEAD');
    const artifact = f.writeArtifact([makeLocalFailed()]);
    const reportBytes = fs.readFileSync(path.join(f.root, REPORT));
    const artifactBytes = fs.readFileSync(artifact);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: published repair #42');
    f.git('push');
    const newHead = f.git('rev-parse', 'HEAD');
    const archive = path.join(f.root, `.omp/sdlc/history/verification-rechecks/42-${oldHead}-${newHead}`);
    fs.mkdirSync(archive, { recursive: true });
    fs.writeFileSync(path.join(archive, 'report.md'), reportBytes);
    fs.writeFileSync(path.join(archive, 'artifact.json'), artifactBytes);
    fs.writeFileSync(path.join(archive, 'receipt.json'), `${JSON.stringify({
      issue: 42, ownerId: f.ownerId, oldHead, newHead,
      reportDigest: 'sha256:' + createHash('sha256').update(reportBytes).digest('hex'),
      artifactDigest: 'sha256:' + createHash('sha256').update(artifactBytes).digest('hex'),
    })}\n`);
    expect(await f.recover()).toEqual({ recover: true, kind: 'changed_head_failed_report' });
    expect(fs.readFileSync(path.join(archive, 'report.md'))).toEqual(reportBytes);
  });

  it('leaves an altered archive untouched rather than consuming a pair', async () => {
    const f = fixture('Fail');
    const oldHead = f.git('rev-parse', 'HEAD');
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: published repair #42');
    f.git('push');
    const archive = path.join(f.root, `.omp/sdlc/history/verification-rechecks/42-${oldHead}-${f.git('rev-parse', 'HEAD')}`);
    fs.mkdirSync(archive, { recursive: true });
    fs.writeFileSync(path.join(archive, 'report.md'), 'not the original report\n');
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'repair_recheck_unavailable' });
    expect(fs.readFileSync(path.join(archive, 'report.md'), 'utf8')).toBe('not the original report\n');
    expect(f.state().records).toEqual([]);
  });

  it('keeps an unchanged failed report out of changed-head recovery', async () => {
    const f = fixture('Fail');
    f.writeArtifact([makeLocalFailed()]);
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'not_applicable' });
    expect(f.state().records).toEqual([]);
  });

  it('rejects an unpushed repair without archiving or consuming evidence', async () => {
    const f = fixture('Fail');
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: repair verification #42');
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'repair_publication_unproven' });
    expect(f.state().records).toEqual([]);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/history/verification-rechecks'))).toBe(false);
  });

  it('rejects dirty non-report state even after a pushed repair', async () => {
    const f = fixture('Partial');
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: repair verification #42');
    f.git('push');
    fs.writeFileSync(path.join(f.root, 'unexpected.txt'), 'unreviewed\n');
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'verification_publish_failed' });
    expect(f.state().records).toEqual([]);
  });

  it('rejects a symlinked failed report without following it', async () => {
    const f = fixture('Fail');
    f.writeArtifact([makeLocalFailed()]);
    const target = path.join(f.root, 'outside.md');
    fs.renameSync(path.join(f.root, REPORT), target);
    fs.symlinkSync(target, path.join(f.root, REPORT));
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'verification_report_invalid' });
    expect(f.state().records).toEqual([]);
  });

  it('rejects a changed registered steering identity before consuming recovery', async () => {
    const f = fixture();
    f.writeArtifact([makeExternalIncomplete()]);
    expect(await f.recover({ loadRuntime: async () => ({ steeringHash: 'sha256:' + 'b'.repeat(64), validations: [] }) }))
      .toEqual({ recover: false, reasonCode: 'artifact_steering_identity_mismatch' });
    expect(f.state().records).toEqual([]);
  });

  it('rejects an artifact result that disagrees with registered provider identity', async () => {
    const f = fixture();
    f.writeArtifact([makeExternalIncomplete()]);
    expect(await f.recover({ loadRuntime: async () => ({
      steeringHash: 'sha256:' + 'a'.repeat(64),
      validations: [{ id: 'ext.check', provider: 'builtin.command', required: true }],
    }) })).toEqual({ recover: false, reasonCode: 'verification_artifact_invalid' });
    expect(f.state().records).toEqual([]);
  });

  it('rejects a symlinked verification artifact without following its target', async () => {
    const f = fixture();
    const artifact = f.writeArtifact([makeExternalIncomplete()]);
    fs.renameSync(artifact, `${artifact}.original`);
    fs.symlinkSync(`${artifact}.original`, artifact);
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'verification_artifact_invalid' });
    expect(f.state().records).toEqual([]);
  });

  it('repeated call after consume returns false with already_consumed (cannot rerun)', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeExternalIncomplete() ]);
    const first = await f.recover();
    expect(first).toEqual({ recover: true });
    const second = await f.recover();
    expect(second).toEqual({ recover: false, reasonCode: 'external_recheck_already_consumed' });
    const recs = (f.state() || { records: [] }).records.filter(r => r.class === 'external_verification_recheck');
    expect(recs.length).toBe(1);
  });

  it('negative: missing specHash in artifact -> spec identity missing', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeExternalIncomplete() ], { identity: { headSha: f.git('rev-parse', 'HEAD'), specHash: '' } });
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'artifact_spec_identity_missing' });
  });

  it('negative: head mismatch -> identity mismatch', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeExternalIncomplete() ], { identity: { headSha: '0'.repeat(40), specHash: 'sha256:' + '0'.repeat(64) } });
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'verification_artifact_invalid' });
  });

  it('negative: spec content change -> spec identity mismatch', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeExternalIncomplete() ]);
    f.mutateSpec((root, spec) => {
      fs.appendFileSync(path.join(root, spec, 'requirements.md'), '\n### AC2: Changed\n');
    });
    f.git('add', SPEC);
    f.git('commit', '-m', 'docs: change spec');
    const artifact = path.join(f.root, '.omp/sdlc/verification/42.json');
    const previous = JSON.parse(fs.readFileSync(artifact, 'utf8'));
    previous.identity.headSha = f.git('rev-parse', 'HEAD');
    fs.writeFileSync(artifact, JSON.stringify(previous));
    const res = await f.recover();
    expect(res.recover).toBe(false);
    expect(res.reasonCode).toBe('artifact_spec_identity_mismatch');
  });

  it('rejects a controller run id that does not match its live checkpoint', async () => {
    const f = fixture();
    f.writeArtifact([makeExternalIncomplete()]);
    fs.writeFileSync(path.join(f.root, '.omp/sdlc/run.json'), JSON.stringify({
      schemaVersion: 1, runId: 'original', projectRoot: f.root,
      currentIssue: 42, currentStep: 'verify',
    }));
    expect(await f.recover({ controllerRunId: 'different' }))
      .toEqual({ recover: false, reasonCode: 'recovery_owner_ambiguous' });
    expect(f.state().records).toEqual([]);
  });

  it('negative: non-report non-runtime dirty blocks', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeExternalIncomplete() ]);
    fs.writeFileSync(path.join(f.root, 'src/unexpected.js'), 'dirty\n');
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'verification_publish_failed' });
  });

  it('negative: missing owner -> recovery_owner_missing or unreadable', async () => {
    const f = fixture('Incomplete', { createOwner: false });
    f.writeArtifact([ makeExternalIncomplete() ]);
    const res = await f.recover();
    expect(res.recover).toBe(false);
    expect(['recovery_owner_missing', 'recovery_owner_unreadable', 'invalid_recovery_params']).toContain(res.reasonCode);
  });

  it('rejects unapproved or bad live scope', async () => {
    const f = fixture('Incomplete');
    f.writeArtifact([ makeExternalIncomplete() ]);
    f.mutateSpec((root, spec) => {
      const d = path.join(root, spec, 'design.md');
      fs.writeFileSync(d, fs.readFileSync(d, 'utf8').replace('Approved', 'Draft'));
    });
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'spec_not_approved' });
  });

  it('rejects when no report present (publication path)', async () => {
    const f = fixture('Incomplete');
    fs.rmSync(path.join(f.root, REPORT));
    f.writeArtifact([ makeExternalIncomplete() ]);
    const res = await f.recover();
    expect(res).toEqual({ recover: false, reasonCode: 'not_applicable' });
  });

  it('probe positive: changed-head failed report after exact A->B repair returns eligible shape, no state writes', async () => {
    const f = fixture('Fail');
    const oldHead = f.git('rev-parse', 'HEAD');
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: source repair #42');
    f.git('push');
    const newHead = f.git('rev-parse', 'HEAD');
    const before = fs.readFileSync(path.join(f.root, '.omp/sdlc/safe-recoveries.json'));
    const res = await f.recover({ probe: true });
    expect(res).toEqual({
      recover: false,
      eligible: true,
      kind: 'changed_head_failed_report',
      oldHead,
      newHead,
      reportDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      artifactDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/safe-recoveries.json'))).toEqual(before);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/history/verification-rechecks'))).toBe(false);
  });

  it('probe with missing owner fails without creating authority', async () => {
    const f = fixture('Fail', { createOwner: false });
    const oldHead = f.git('rev-parse', 'HEAD');
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: source repair #42');
    f.git('push');
    const res = await f.recover({ probe: true });
    expect(res).toEqual({ recover: false, reasonCode: 'recovery_owner_missing' });
    const ownerPath = path.join(f.root, '.omp/sdlc/safe-recoveries.json');
    expect(fs.existsSync(ownerPath)).toBe(false);
  });

  it('probe negative: no repair yet returns reason not eligible', async () => {
    const f = fixture('Fail');
    f.writeArtifact([makeLocalFailed()]);
    const res = await f.recover({ probe: true });
    expect(res.recover).toBe(false);
    expect(res.eligible).toBeUndefined();
    expect(res.reasonCode).toBe('not_applicable');
  });

  it('probe chronology: probe never consumes; list detects consume only after actual consume; multiple probes safe', async () => {
    const f = fixture('Fail');
    const oldHead = f.git('rev-parse', 'HEAD');
    f.writeArtifact([makeLocalFailed()]);
    fs.writeFileSync(path.join(f.root, 'src/repair.py'), 'repaired\n');
    f.git('add', 'src/repair.py');
    f.git('commit', '-m', 'fix: repair #42');
    f.git('push');
    const before = fs.readFileSync(path.join(f.root, '.omp/sdlc/safe-recoveries.json'));
    const p1 = await f.recover({ probe: true });
    expect(p1.eligible).toBe(true);
    const p2 = await f.recover({ probe: true });
    expect(p2.eligible).toBe(true);
    expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/safe-recoveries.json'))).toEqual(before);
    // actual consume succeeds once
    const c = await f.recover();
    expect(c).toEqual({ recover: true, kind: 'changed_head_failed_report' });
    const after = f.state();
    expect(after.records.filter(r => r.class.startsWith('changed_head_verification_recheck:')).length).toBe(1);
    const p3 = await f.recover({ probe: true });
    expect(p3).toEqual({ recover: false, reasonCode: 'changed_head_recheck_already_consumed' });
  });
});
