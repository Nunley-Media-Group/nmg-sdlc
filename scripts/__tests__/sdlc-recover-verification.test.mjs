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
  return `# Verification\n\n${status}<!-- nmg-sdlc-issue-scope: ${JSON.stringify(scope)} -->\n`;
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
    fs.mkdirSync(path.join(f.root, 'src'));
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
});
