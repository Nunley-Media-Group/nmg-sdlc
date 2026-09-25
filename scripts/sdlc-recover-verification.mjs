#!/usr/bin/env node

// Classify one exact verification recheck after an external prerequisite or published repair.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import {
  inspectVerificationArtifactRepair,
  inspectVerificationReadiness,
} from './verification-readiness.mjs';
import { inspectIssueSpecScope } from './issue-spec-scope.mjs';
import { isSpecApproved, resolveSpecDir } from './issue-spec-scope.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { enterControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';
import { parseIssueBranch } from './sdlc-status.mjs';
import { loadSteeringRuntime } from '../src/sdlc-steering-runtime.mjs';

const USAGE = 'Usage: node scripts/sdlc-recover-verification.mjs --issue N --spec specs/N-SLUG [--controller-run-id R] [--probe]';
const MAX_REPORT_BYTES = 256 * 1024;
const MAX_ARTIFACT_BYTES = 512 * 1024;

function readBoundedFile(root, relativePath, maximum) {
  let parent = root;
  for (const part of relativePath.split('/').slice(0, -1)) {
    parent = join(parent, part);
    const stat = fs.lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe_parent');
  }
  const absolute = join(root, relativePath);
  const before = fs.lstatSync(absolute);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > maximum) throw new Error('unsafe_file');
  const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new Error('changed_file');
    const bytes = fs.readFileSync(descriptor);
    const after = fs.lstatSync(absolute);
    if (bytes.length !== before.size || after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.isSymbolicLink()) throw new Error('changed_file');
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function commandSucceeded(result) {
  return result && !result.error && result.status === 0;
}

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function porcelainPaths(output) {
  const entries = String(output ?? '').split('\0');
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2)) && entries[index + 1]) paths.push(entries[index += 1]);
  }
  return paths.filter((path) => !path.startsWith('.omp/'));
}

function hashValue(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function computeSpecHash(specDir) {
  const files = ['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md'];
  const joined = files
    .map((name) => {
      const p = join(specDir, name);
      const content = fs.readFileSync(p);
      return `${name}\0${content}`;
    })
    .join('\0');
  return hashValue(joined);
}
function archiveFailedVerification(root, archive, reportBytes, artifactBytes, receiptBytes) {
  const history = join(root, '.omp/sdlc/history');
  const parent = join(history, 'verification-rechecks');
  for (const directory of [history, parent]) {
    if (!fs.existsSync(directory)) fs.mkdirSync(directory);
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe_archive');
  }
  const expectedParent = join(fs.realpathSync(root), '.omp/sdlc/history/verification-rechecks');
  if (fs.realpathSync(parent) !== expectedParent) throw new Error('unsafe_archive');
  const parentStat = fs.lstatSync(parent);
  const target = join(root, archive);
  if (!fs.existsSync(target)) {
    const staging = fs.mkdtempSync(join(parent, '.pending-'));
    fs.writeFileSync(join(staging, 'report.md'), reportBytes, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(join(staging, 'artifact.json'), artifactBytes, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(join(staging, 'receipt.json'), receiptBytes, { flag: 'wx', mode: 0o600 });
    const after = fs.lstatSync(parent);
    if (after.dev !== parentStat.dev || after.ino !== parentStat.ino
      || after.isSymbolicLink() || fs.realpathSync(parent) !== expectedParent) throw new Error('unsafe_archive');
    fs.renameSync(staging, target);
  }
  for (const [name, bytes, maximum] of [
    ['report.md', reportBytes, MAX_REPORT_BYTES],
    ['artifact.json', artifactBytes, MAX_ARTIFACT_BYTES],
    ['receipt.json', receiptBytes, MAX_REPORT_BYTES],
  ]) {
    if (!readBoundedFile(root, `${archive}/${name}`, maximum).equals(bytes)) throw new Error('archive_mismatch');
  }
}



export async function recoverVerification({
  issue,
  spec,
  cwd = process.cwd(),
  run = defaultRun,
  controllerRunId,
  loadRuntime = loadSteeringRuntime,
  probe = false,
} = {}) {
  const issueNumber = Number(issue);
  const specPath = String(spec ?? '').split('\\').join('/').replace(/\/$/, '');
  const reportPath = `${specPath}/verification-report.md`;
  const artifactRelative = `.omp/sdlc/verification/${issueNumber}.json`;

  if (
    !Number.isInteger(issueNumber) ||
    issueNumber <= 0 ||
    isAbsolute(specPath) ||
    !new RegExp(`^specs/${issueNumber}-[^/]+$`).test(specPath)
  ) {
    return { recover: false, reasonCode: 'not_applicable' };
  }

  // fresh source/issue/spec/gate evidence - no run.json checkpoint, no resolveRecoveryOwner/one-use (plan step 3); lease for changed head only
  const root = resolve(cwd);
  const absoluteReport = resolve(root, reportPath);
  if (!fs.existsSync(absoluteReport)) {
    return { recover: false, reasonCode: 'not_applicable' };
  }
  let reportContent;
  try {
    reportContent = readBoundedFile(root, reportPath, MAX_REPORT_BYTES).toString('utf8');
  } catch {
    return { recover: false, reasonCode: 'verification_report_invalid' };
  }

  // singular Approved spec and live scope
  const selectedSpec = resolveSpecDir(root, issueNumber);
  if (selectedSpec !== resolve(root, specPath) || !isSpecApproved(selectedSpec, issueNumber)) {
    return { recover: false, reasonCode: 'spec_not_approved' };
  }
  let scope;
  try {
    scope = inspectIssueSpecScope(
      { projectRoot: root, issueNumber, specPath },
      {
        lstat: (filePath) => fs.lstatSync(filePath),
        readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
      },
    );
  } catch {
    return { recover: false, reasonCode: 'spec_not_approved' };
  }
  if (!['scoped', 'implicit_single_issue'].includes(scope.status)) {
    return { recover: false, reasonCode: 'spec_not_approved' };
  }

  // External-only Incomplete stays same-head; a mixed local failure is repairable at a new head.
  const readiness = inspectVerificationReadiness({
    content: reportContent,
    options: { expectedIssueNumber: issueNumber, expectedSpecPath: specPath, expectedScope: scope },
  });
  const nonPass = readiness.status === 'blocked' && readiness.reasonCode === 'implementation_non_pass';
  let changedHeadFailure = nonPass && ['fail', 'partial'].includes(readiness.implementationStatus);
  if (!nonPass || (!changedHeadFailure && readiness.implementationStatus !== 'incomplete')) {
    return { recover: false, reasonCode: 'not_applicable' };
  }

  const branchRes = run('git', ['branch', '--show-current'], { cwd });
  const branchName = commandSucceeded(branchRes) ? String(branchRes.stdout ?? '').trim() : '';
  const p = typeof parseIssueBranch === 'function' ? parseIssueBranch(branchName) : null;
  if (!branchName || (p && p.issueNumber !== issueNumber) || (!p && !branchName.startsWith(`${issueNumber}-`))) {
    return { recover: false, reasonCode: 'verification_publish_failed' };
  }
  const headRes = run('git', ['rev-parse', 'HEAD'], { cwd });
  const headSha = commandSucceeded(headRes) ? String(headRes.stdout ?? '').trim() : '';
  if (!/^[0-9a-f]{40}$/i.test(headSha)) {
    return { recover: false, reasonCode: 'head_unreadable' };
  }
  // note: probe is evidence-only below; no ledger owner check

  // clean non-runtime tree / report-only
  const statusRes = run('git', ['status', '--porcelain=v1', '-z'], { cwd });
  if (!commandSucceeded(statusRes)) {
    return { recover: false, reasonCode: 'verification_publish_failed' };
  }
  const dirty = porcelainPaths(statusRes.stdout);
  if (dirty.some((path) => path !== reportPath)) {
    return { recover: false, reasonCode: 'verification_publish_failed' };
  }

  const artifactPath = join(root, artifactRelative);
  if (!fs.existsSync(artifactPath)) {
    return { recover: false, reasonCode: 'verification_artifact_invalid' };
  }
  let artifactBytes;
  try {
    artifactBytes = readBoundedFile(root, artifactRelative, MAX_ARTIFACT_BYTES);
  } catch {
    return { recover: false, reasonCode: 'verification_artifact_invalid' };
  }
  let artifact;
  try {
    artifact = JSON.parse(artifactBytes.toString('utf8'));
  } catch {
    return { recover: false, reasonCode: 'verification_artifact_invalid' };
  }

  const oldHead = artifact?.identity?.headSha;
  if (!/^[0-9a-f]{40}$/i.test(oldHead ?? '')) {
    return { recover: false, reasonCode: 'verification_artifact_invalid' };
  }
  let mixedChangedHead = false;
  if (!changedHeadFailure && readiness.implementationStatus === 'incomplete'
    && oldHead !== headSha && artifact.ceiling === 'Incomplete') {
    const mixed = inspectVerificationArtifactRepair(artifact, {
      expectedIssueNumber: issueNumber, expectedHeadSha: oldHead,
    });
    mixedChangedHead = mixed.status === 'repairable' && mixed.failedLocal.length > 0
      && mixed.incomplete.length > 0;
    changedHeadFailure = mixedChangedHead;
  }
  if (changedHeadFailure && (!Array.isArray(readiness.gaps) || readiness.gaps.length > 0)) {
    return { recover: false, reasonCode: 'verification_report_invalid' };
  }
  if (changedHeadFailure && oldHead === headSha) {
    return { recover: false, reasonCode: 'not_applicable' };
  }
  if (changedHeadFailure) {
    const markers = [...reportContent.matchAll(/^\*\*Verification head\*\*:\s*([0-9a-f]{40})\s*$/gm)];
    const reportHead = markers.length === 1 ? markers[0][1] : null;
    if (markers.length !== 1 || reportHead !== oldHead) {
      return { recover: false, reasonCode: 'failed_report_head_unproven' };
    }
  }
  const artifactRepair = inspectVerificationArtifactRepair(artifact, {
    expectedIssueNumber: issueNumber,
    expectedHeadSha: changedHeadFailure ? oldHead : headSha,
  });
  if (artifactRepair.status === 'unverifiable' || artifactRepair.reasonCode === 'verification_artifact_invalid') {
    return { recover: false, reasonCode: 'verification_artifact_invalid' };
  }

  const results = Array.isArray(artifact.results) ? artifact.results : [];
  let runtime;
  try {
    runtime = await loadRuntime(root, { metadataOnly: true });
    if (runtime.steeringHash !== artifact.identity?.steeringHash) {
      return { recover: false, reasonCode: 'artifact_steering_identity_mismatch' };
    }
    const files = ['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md'];
    const liveSpecHash = `sha256:${createHash('sha256').update(files.map((name) =>
      `${name}\0${fs.readFileSync(join(root, specPath, name))}`).join('\0')).digest('hex')}`;
    if (artifact.identity?.specHash !== liveSpecHash) {
      return { recover: false, reasonCode: 'artifact_spec_identity_mismatch' };
    }
  } catch {
    return { recover: false, reasonCode: 'steering_runtime_invalid' };
  }
  const declarations = runtime.validations;
  if (!Array.isArray(declarations) || declarations.length !== results.length
    || artifact.coverage.declared !== declarations.length
    || artifact.coverage.recorded !== results.length
    || declarations.some((declared) => {
      const matching = results.filter((result) => result.id === declared.id);
      return matching.length !== 1 || matching[0].provider !== declared.provider
        || matching[0].required !== declared.required;
    })) {
    return { recover: false, reasonCode: 'verification_artifact_invalid' };
  }

  // coverage
  const cov = artifact.coverage || {};
  if (cov.complete !== true ||
      (Array.isArray(cov.missing) && cov.missing.length) ||
      (Array.isArray(cov.duplicate) && cov.duplicate.length) ||
      (Array.isArray(cov.unknown) && cov.unknown.length)) {
    return { recover: false, reasonCode: 'verification_artifact_invalid' };
  }

  if (changedHeadFailure) {
    const ancestry = run('git', ['merge-base', '--is-ancestor', oldHead, headSha], { cwd });
    const subjects = run('git', ['log', '--format=%s', `${oldHead}..${headSha}`], { cwd });
    const upstream = run('git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'], { cwd });
    const changedPaths = run('git', ['diff', '--name-only', '-z', `${oldHead}..${headSha}`], { cwd });
    const remainingIssues = reportContent.split(/^## Remaining Issues\s*$/m)[1]?.split(/^## /m)[0] ?? '';
    const substantive = commandSucceeded(changedPaths)
      && String(changedPaths.stdout).split('\0').some((file) => file
        && !file.startsWith('specs/') && !file.startsWith('docs/')
        && !/\.(?:md|txt)$/i.test(file) && remainingIssues.includes(file));
    const repairs = String(subjects.stdout ?? '').trim().split('\n');
    if (!commandSucceeded(ancestry) || !commandSucceeded(subjects)
      || repairs.length === 0
      || repairs.some((subject) => !/^fix:/.test(subject) || !subject.includes(`#${issueNumber}`))
      || !substantive || !commandSucceeded(upstream) || !/^0\s+0$/.test(String(upstream.stdout).trim())) {
      return { recover: false, reasonCode: 'repair_publication_unproven' };
    }

    if (probe) {
      // read-only probe for parent controller integration per contract; never archive/consume/lease/alter ledger
      const reportDigest = hashValue(reportContent);
      const artifactDigest = hashValue(artifactBytes);
      return { recover: false, eligible: true, kind: 'changed_head_failed_report', oldHead, newHead: headSha, reportDigest, artifactDigest };
    }

    let lease;
    try {
      lease = enterControllerLease({ projectRoot: root, runId: controllerRunId });
      const currentStatus = run('git', ['status', '--porcelain=v1', '-z'], { cwd });
      const currentUpstream = run('git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'], { cwd });
      const currentHead = run('git', ['rev-parse', 'HEAD'], { cwd });
      if (!readBoundedFile(root, reportPath, MAX_REPORT_BYTES).equals(Buffer.from(reportContent))
        || !readBoundedFile(root, artifactRelative, MAX_ARTIFACT_BYTES).equals(artifactBytes)
        || !commandSucceeded(run('git', ['diff', '--quiet', oldHead, headSha, '--',
          ...['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'].map((name) => `${specPath}/${name}`)], { cwd }))
        || !commandSucceeded(currentHead) || String(currentHead.stdout).trim() !== headSha
        || !commandSucceeded(currentUpstream) || !/^0\s+0$/.test(String(currentUpstream.stdout).trim())
        || !commandSucceeded(currentStatus)
        || porcelainPaths(currentStatus.stdout).some((path) => path !== reportPath)) {
        return { recover: false, reasonCode: 'repair_evidence_changed' };
      }
      const archive = `.omp/sdlc/history/verification-rechecks/${issueNumber}-${oldHead}-${headSha}`;
      const ownerForReceipt = controllerRunId || 'fresh-evidence';
      const receipt = `${JSON.stringify({
        issue: issueNumber, ownerId: ownerForReceipt, oldHead, newHead: headSha,
        reportDigest: hashValue(reportContent), artifactDigest: hashValue(artifactBytes),
      })}\n`;
      archiveFailedVerification(root, archive, Buffer.from(reportContent), artifactBytes, Buffer.from(receipt));
      return { recover: true, kind: 'changed_head_failed_report' };
    } catch (error) {
      return { recover: false, reasonCode: error?.reasonCode ?? 'repair_recheck_unavailable' };
    } finally {
      if (lease?.owned) releaseControllerLease(lease.lease);
    }
  }

  if (probe) {
    // probe is read-only; never consume on external path either
    return { recover: false, reasonCode: 'not_applicable' };
  }

  // external recheck eligible by current report+artifact+head evidence (no ledger consume/one-use)
  return { recover: true };
}

function parseCli(argv) {
  let issue;
  let spec;
  let controllerRunId;
  let probe = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--issue' && issue === undefined && argv[index + 1] !== undefined) {
      issue = argv[index += 1];
    } else if (argv[index] === '--spec' && spec === undefined && argv[index + 1] !== undefined) {
      spec = argv[index += 1];
    } else if (argv[index] === '--controller-run-id' && controllerRunId === undefined && argv[index + 1] !== undefined) {
      controllerRunId = argv[index += 1];
    } else if (argv[index] === '--probe' && !probe) {
      probe = true;
    } else {
      return null;
    }
  }
  if (!/^#?[1-9]\d*$/.test(issue ?? '') || !spec) return null;
  return {
    issue: Number(String(issue).replace(/^#/, '')),
    spec,
    controllerRunId: controllerRunId || undefined,
    probe,
  };
}

async function runCli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (!options) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const outcome = await recoverVerification(options);
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
  if (options.probe) {
    // exit 0 only after full exact A→B proof per contract; else nonzero with reasonCode in json
    return (outcome && outcome.eligible === true && outcome.kind === 'changed_head_failed_report') ? 0 : 1;
  }
  return outcome && outcome.recover ? 0 : 1;
}

if (isCliEntry(import.meta.url)) {
  runCli().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
