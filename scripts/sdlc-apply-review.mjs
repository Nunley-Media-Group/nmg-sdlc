#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { isCliEntry } from './plugin-controller-path.mjs';
import { enterControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';
import { resolveReviewArtifacts, resolveSpecDir } from './sdlc-execute.mjs';
import { assertInitialStagePublication, inspectPublicationScope, reconcileStagePublication, resolveRecoveryOwner } from './sdlc-safe-recoveries.mjs';

const USAGE = 'Usage: node scripts/sdlc-apply-review.mjs --issue N --step fix1|fix2 [--applied] [--controller-run-id ID]';
const FIX_STEPS = new Set(['fix1', 'fix2']);

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function handoffFor(issue, step, status, summary, artifactPath, reasonCode = null) {
  return {
    schemaVersion: 1,
    issue,
    step,
    status,
    intervention: status !== 'passed',
    summary,
    artifacts: [artifactPath],
    next: status === 'passed' ? (step === 'fix1' ? 'review2' : 'verify') : null,
    reasonCode,
  };
}

function porcelainPaths(stdout) {
  const records = String(stdout || '').split('\0');
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    const path = record.slice(3);
    if (path !== '.omp' && !path.startsWith('.omp/')) paths.push(path);
    if ((status.includes('R') || status.includes('C')) && records[index + 1]) {
      const source = records[++index];
      if (source !== '.omp' && !source.startsWith('.omp/')) paths.push(source);
    }
  }
  return paths;
}

function runApplyReviewUnlocked({
  issue, step, cwd = process.cwd(), run = defaultRun,
  fs = { existsSync, mkdirSync, readFileSync, writeFileSync },
  applied = false, controllerRunId, sessionToken,
} = {}) {
  const issueNumber = Number(issue);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0 || !FIX_STEPS.has(step)) {
    return { status: 2, stdout: '', stderr: `${USAGE}\n`, handoff: null, handoffPath: null };
  }
  const reviewStep = step === 'fix1' ? 'review1' : 'review2';
  const { artifactPath } = resolveReviewArtifacts({ cwd, issue: issueNumber, step: reviewStep });
  const handoffPath = `.omp/sdlc/handoffs/${issueNumber}-${step}.json`;
  const writeHandoff = (handoff) => {
    const absolutePath = join(cwd, handoffPath);
    if (!fs.existsSync(dirname(absolutePath))) fs.mkdirSync(dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, `${JSON.stringify(handoff, null, 2)}\n`);
    return { status: handoff.status === 'passed' ? 0 : 1, stdout: `NMG_SDLC_HANDOFF: ${handoffPath}\n`, stderr: '', handoff, handoffPath };
  };
  const fail = (summary, reasonCode) => writeHandoff(handoffFor(issueNumber, step, 'failed', summary, artifactPath, reasonCode));
  const pass = (summary) => writeHandoff(handoffFor(issueNumber, step, 'passed', summary, artifactPath));
  const absoluteArtifact = join(cwd, artifactPath);
  if (!fs.existsSync(absoluteArtifact)) return fail(`Review artifact missing for #${issueNumber} ${reviewStep}`, 'review_artifact_missing');
  const artifactBytes = fs.readFileSync(absoluteArtifact, 'utf8');
  const findings = artifactBytes.trim();
  if (!findings || findings === 'No findings.') return pass(`No ${reviewStep} findings to apply for #${issueNumber}`);
  let ownerId;
  try {
    ownerId = resolveRecoveryOwner({ cwd, issue: issueNumber, step, controllerRunId, sessionToken, run });
  } catch (error) {
    return fail(`Review-fix owner unavailable: ${error.message}`, error.reasonCode ?? 'recovery_owner_unreadable');
  }
  const artifactDigest = createHash('sha256').update(artifactBytes).digest('hex');
  const identityPath = join(cwd, `.omp/sdlc/reviews/${issueNumber}-${step}.publication.json`);

  const expectedSubject = `fix: apply ${reviewStep} findings for #${issueNumber}`;
  let allowedPaths;
  try {
    const specRoot = resolveSpecDir(cwd, issueNumber);
    if (!specRoot) return fail('Approved review-fix scope is unavailable', 'spec_not_approved');
    allowedPaths = inspectPublicationScope({
      cwd, issue: issueNumber, step, spec: `specs/${specRoot.split(/[\\/]/).at(-1)}`, run,
    });
  } catch (error) {
    return fail(`Review-fix scope is unavailable: ${error.message}`, error.reasonCode ?? 'spec_not_approved');
  }
  const status = run('git', ['status', '--porcelain=v1', '-z'], { cwd });
  if (status?.status !== 0) return fail(`Failed to inspect review fixes for #${issueNumber}`, 'apply_review_failed');
  const paths = porcelainPaths(status.stdout);
  if (!paths.length) {
    const divergence = run('git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'], { cwd });
    const subject = run('git', ['log', '-1', '--format=%s', 'HEAD'], { cwd });
    if (divergence?.status !== 0 || subject?.status !== 0) return fail('Review-fix publication state is unreadable', 'apply_review_failed');
    if (!/^0\s+0$/.test(String(divergence.stdout).trim()) || String(subject.stdout).trim() === expectedSubject) {
      let publicationIdentity = null;
      if (fs.existsSync(identityPath)) {
        try { publicationIdentity = JSON.parse(fs.readFileSync(identityPath, 'utf8')); } catch {}
      }
      const head = run('git', ['rev-parse', 'HEAD'], { cwd });
      const commitSha = String(head?.stdout ?? '').trim();
      if (head?.status !== 0 || !/^[0-9a-f]{40}$/.test(commitSha)) return fail('Review-fix HEAD is unreadable', 'apply_review_failed');
      const identityMatches = publicationIdentity?.schemaVersion === 1
        && publicationIdentity.ownerId === ownerId
        && publicationIdentity.issue === issueNumber
        && publicationIdentity.step === step
        && publicationIdentity.artifactPath === artifactPath
        && publicationIdentity.artifactDigest === artifactDigest
        && publicationIdentity.commitSha === commitSha;
      if (!identityMatches) {
        if (!applied) {
          // Neither a reused subject nor a failed handoff proves which findings were applied.
          const packet = { schemaVersion: 1, kind: 'apply_review_required', issue: issueNumber, step, artifactPath, handoffPath };
          return { status: 3, stdout: `NMG_SDLC_APPLY_REVIEW: ${JSON.stringify(packet)}\n`, stderr: '', handoff: null, handoffPath };
        }
        // Explicit --applied no-change invocation may acknowledge current findings only after
        // reconcileStagePublication validates publication. Persist current identity; rejected must not.
        const publication = reconcileStagePublication({ cwd, issue: issueNumber, step, ownerId, run, expectedSubject, allowedPaths });
        if (!publication.passed) return fail(publication.summary, 'apply_review_failed');
        const publicationIdentity = {
          schemaVersion: 1,
          ownerId,
          issue: issueNumber,
          step,
          artifactPath,
          artifactDigest,
          commitSha,
        };
        if (!fs.existsSync(dirname(identityPath))) fs.mkdirSync(dirname(identityPath), { recursive: true });
        fs.writeFileSync(identityPath, `${JSON.stringify(publicationIdentity, null, 2)}\n`);
        return pass(`Reconciled published ${reviewStep} findings for #${issueNumber}`);
      }
      const publication = reconcileStagePublication({ cwd, issue: issueNumber, step, ownerId, run, expectedSubject, allowedPaths });
      if (!publication.passed) return fail(publication.summary, 'apply_review_failed');
      return pass(`Reconciled published ${reviewStep} findings for #${issueNumber}`);
    }
  }
  if (!applied) {
    const packet = { schemaVersion: 1, kind: 'apply_review_required', issue: issueNumber, step, artifactPath, handoffPath };
    return { status: 3, stdout: `NMG_SDLC_APPLY_REVIEW: ${JSON.stringify(packet)}\n`, stderr: '', handoff: null, handoffPath };
  }
  if (paths.some((path) => !allowedPaths.includes(path))) return fail('Review fixes exceed approved task scope', 'apply_review_failed');
  if (!paths.length) return pass(`No ${reviewStep} changes to commit for #${issueNumber}`);
  try {
    assertInitialStagePublication({ cwd, ownerId, issue: issueNumber, step, run });
  } catch (error) {
    return fail(`Review publication remains stopped: ${error.reasonCode ?? error.message}`, 'apply_review_failed');
  }
  const stageable = run('git', ['--literal-pathspecs', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...paths], { cwd });
  const names = String(stageable?.stdout ?? '');
  if (stageable?.status !== 0 || (names && !names.endsWith('\0'))) {
    return fail(`Failed to inspect stageable ${reviewStep} fixes for #${issueNumber}`, 'apply_review_failed');
  }
  const stagePaths = [...new Set(names.split('\0').filter(Boolean))];
  if (stagePaths.some((path) => !paths.includes(path))) return fail('Stageable paths exceed observed review fixes', 'apply_review_failed');
  if (stagePaths.length) {
    const add = run('git', ['--literal-pathspecs', 'add', '--', ...stagePaths], { cwd });
    if (add?.status !== 0) return fail(`Failed to stage ${reviewStep} fixes for #${issueNumber}`, 'apply_review_failed');
  }
  const commit = run('git', ['commit', '-m', expectedSubject], { cwd });
  if (commit?.status !== 0) return fail(`Failed to commit ${reviewStep} fixes for #${issueNumber}`, 'apply_review_failed');
  // Persist exact application evidence before the first publication side effect.
  const publishedHead = run('git', ['rev-parse', 'HEAD'], { cwd });
  const commitSha = String(publishedHead?.stdout ?? '').trim();
  if (publishedHead?.status !== 0 || !/^[0-9a-f]{40}$/.test(commitSha)) return fail('Review-fix HEAD is unreadable', 'apply_review_failed');
  const publicationIdentity = {
    schemaVersion: 1,
    ownerId,
    issue: issueNumber,
    step,
    artifactPath,
    artifactDigest,
    commitSha,
  };
  if (!fs.existsSync(dirname(identityPath))) fs.mkdirSync(dirname(identityPath), { recursive: true });
  fs.writeFileSync(identityPath, `${JSON.stringify(publicationIdentity, null, 2)}\n`);
  const push = run('git', ['push'], { cwd });
  const publication = reconcileStagePublication({ cwd, issue: issueNumber, step, ownerId, run, expectedSubject, allowedPaths });
  if (!publication.passed) return fail(`${publication.summary}${push?.status !== 0 ? '; initial push failed' : ''}`, 'apply_review_failed');
  return pass(`Applied and pushed ${reviewStep} findings for #${issueNumber}`);
}

export function runApplyReview(options = {}) {
  let lease;
  try {
    lease = enterControllerLease({ projectRoot: options.cwd ?? process.cwd(), runId: options.controllerRunId ?? process.env.NMG_SDLC_CONTROLLER_RUN_ID });
    const controllerRunId = lease.owned ? lease.lease.record.runId : lease.lease.runId;
    return runApplyReviewUnlocked({ ...options, controllerRunId });
  } catch (error) {
    return { status: 1, stdout: '', stderr: `${error.reasonCode ?? error.message}\n`, handoff: null, handoffPath: null };
  } finally {
    if (lease?.owned) releaseControllerLease(lease.lease);
  }
}

function parseCli(argv) {
  let issue;
  let step;
  let applied = false;
  let controllerRunId;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--issue' && issue === undefined && argv[index + 1] !== undefined) {
      issue = argv[index + 1];
      index += 1;
    } else if (argument === '--step' && step === undefined && argv[index + 1] !== undefined) {
      step = argv[index + 1];
      index += 1;
    } else if (argument === '--applied' && !applied) {
      applied = true;
    } else if (argument === '--controller-run-id' && controllerRunId === undefined && argv[index + 1] !== undefined) {
      controllerRunId = argv[++index];
    } else {
      return null;
    }
  }
  const match = /^#?([1-9]\d*)$/.exec(issue || '');
  if (!match || !FIX_STEPS.has(step)) return null;
  return { issue: Number(match[1]), step, applied, controllerRunId };
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (!options) {
    console.error(USAGE);
    return 2;
  }
  const outcome = runApplyReview(options);
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  return outcome.status;
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
