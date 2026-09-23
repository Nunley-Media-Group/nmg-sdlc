#!/usr/bin/env node

// Classify one exact external-only Incomplete verification recheck before the gate runs.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import {
  consumeSafeRecovery,
  resolveRecoveryOwner,
} from './sdlc-safe-recoveries.mjs';
import {
  inspectVerificationArtifactRepair,
  inspectVerificationReadiness,
} from './verification-readiness.mjs';
import { inspectIssueSpecScope } from './issue-spec-scope.mjs';
import { isSpecApproved, resolveSpecDir } from './sdlc-execute.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { loadSteeringRuntime } from '../src/sdlc-steering-runtime.mjs';

const USAGE = 'Usage: node scripts/sdlc-recover-verification.mjs --issue N --spec specs/N-SLUG [--controller-run-id R]';
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

export async function recoverVerification({
  issue,
  spec,
  cwd = process.cwd(),
  run = defaultRun,
  controllerRunId,
  loadRuntime = loadSteeringRuntime,
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

  let ownerId;
  try {
    ownerId = resolveRecoveryOwner({
      cwd,
      issue: issueNumber,
      step: 'verify',
      controllerRunId,
      priorIncomplete: true,
      run,
    });
  } catch (error) {
    const code = error && error.reasonCode ? error.reasonCode : 'recovery_owner_unreadable';
    return { recover: false, reasonCode: code };
  }

  const root = resolve(cwd);
  if (controllerRunId) {
    try {
      const checkpoint = JSON.parse(readBoundedFile(root, '.omp/sdlc/run.json', MAX_ARTIFACT_BYTES));
      if (checkpoint.schemaVersion !== 1 || checkpoint.runId !== controllerRunId
        || checkpoint.projectRoot !== fs.realpathSync(root)
        || checkpoint.currentIssue !== issueNumber || checkpoint.currentStep !== 'verify') {
        return { recover: false, reasonCode: 'recovery_owner_ambiguous' };
      }
    } catch {
      return { recover: false, reasonCode: 'recovery_owner_unreadable' };
    }
  }
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

  // report readiness must be lowercase 'incomplete' external-only case
  const readiness = inspectVerificationReadiness({
    content: reportContent,
    options: { expectedIssueNumber: issueNumber, expectedSpecPath: specPath, expectedScope: scope },
  });
  if (
    readiness.status !== 'blocked' ||
    readiness.reasonCode !== 'implementation_non_pass' ||
    readiness.implementationStatus !== 'incomplete'
  ) {
    return { recover: false, reasonCode: 'not_applicable' };
  }

  // branch/head
  const branchRes = run('git', ['branch', '--show-current'], { cwd });
  const branch = commandSucceeded(branchRes) ? String(branchRes.stdout ?? '').trim() : '';
  if (!branch || !branch.startsWith(`${issueNumber}-`)) {
    return { recover: false, reasonCode: 'verification_publish_failed' };
  }
  const headRes = run('git', ['rev-parse', 'HEAD'], { cwd });
  const headSha = commandSucceeded(headRes) ? String(headRes.stdout ?? '').trim() : '';
  if (!/^[0-9a-f]{40}$/i.test(headSha)) {
    return { recover: false, reasonCode: 'head_unreadable' };
  }

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

  const artifactRepair = inspectVerificationArtifactRepair(artifact, {
    expectedIssueNumber: issueNumber,
    expectedHeadSha: headSha,
  });
  if (artifactRepair.status === 'unverifiable' || artifactRepair.reasonCode === 'verification_artifact_invalid') {
    return { recover: false, reasonCode: 'verification_artifact_invalid' };
  }

  // scope ONLY external-only incomplete: required statuses must be passed or (external incomplete); at least one ext inc
  const results = Array.isArray(artifact.results) ? artifact.results : [];
  const requiredResults = results.filter((r) => r && r.required === true && r.applicable === true);
  const externalIncomplete = requiredResults.filter((r) => r.effectiveStatus === 'incomplete' && r.provider && r.provider !== 'builtin.command');
  let hasOnlyRecoverable = true;
  for (const r of requiredResults) {
    if (r.effectiveStatus === 'passed') continue;
    if (r.effectiveStatus === 'incomplete' && r.provider && r.provider !== 'builtin.command') continue;
    hasOnlyRecoverable = false;
    break;
  }
  if (!hasOnlyRecoverable || externalIncomplete.length === 0) {
    return { recover: false, reasonCode: hasOnlyRecoverable ? 'not_applicable' : 'has_non_recoverable_required_status' };
  }

  // exact artifact identity: nonempty specHash + match; steeringHash match from registered runtime
  const artIdentity = artifact.identity || {};
  if (!artIdentity.specHash || typeof artIdentity.specHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(artIdentity.specHash)) {
    return { recover: false, reasonCode: 'artifact_spec_identity_missing' };
  }
  let currentSpecHash;
  try {
    currentSpecHash = computeSpecHash(resolve(root, specPath));
  } catch {
    return { recover: false, reasonCode: 'artifact_identity_mismatch' };
  }
  if (artIdentity.specHash !== currentSpecHash) {
    return { recover: false, reasonCode: 'artifact_spec_identity_mismatch' };
  }
  if (typeof artIdentity.steeringHash !== 'string'
    || !/^sha256:[0-9a-f]{64}$/.test(artIdentity.steeringHash)) {
    return { recover: false, reasonCode: 'artifact_steering_identity_missing' };
  }
  let runtime;
  try {
    runtime = await loadRuntime(root);
    if (runtime.steeringHash !== artIdentity.steeringHash) {
      return { recover: false, reasonCode: 'artifact_steering_identity_mismatch' };
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

  // consume one-use durable for owner
  let consumed;
  try {
    const consumeRes = consumeSafeRecovery({
      cwd,
      ownerId,
      issue: issueNumber,
      step: 'verify',
      class: 'external_verification_recheck',
      evidence: {
        reportPath,
        artifact: artifactRelative,
        headSha,
        incompleteExternal: externalIncomplete.map((r) => r.id),
      },
    });
    consumed = consumeRes.consumed;
  } catch (error) {
    const code = error && error.reasonCode ? error.reasonCode : 'recovery_consume_failed';
    return { recover: false, reasonCode: code };
  }

  if (consumed) {
    return { recover: true };
  }
  return { recover: false, reasonCode: 'external_recheck_already_consumed' };
}

function parseCli(argv) {
  let issue;
  let spec;
  let controllerRunId;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--issue' && issue === undefined && argv[index + 1] !== undefined) {
      issue = argv[index += 1];
    } else if (argv[index] === '--spec' && spec === undefined && argv[index + 1] !== undefined) {
      spec = argv[index += 1];
    } else if (argv[index] === '--controller-run-id' && controllerRunId === undefined && argv[index + 1] !== undefined) {
      controllerRunId = argv[index += 1];
    } else {
      return null;
    }
  }
  if (!/^#?[1-9]\d*$/.test(issue ?? '') || !spec || controllerRunId === '') return null;
  return {
    issue: Number(String(issue).replace(/^#/, '')),
    spec,
    controllerRunId: controllerRunId || undefined,
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
  return outcome && outcome.recover ? 0 : 1;
}

if (isCliEntry(import.meta.url)) {
  runCli().then((code) => { process.exitCode = code; }).catch((err) => {
    process.stderr.write(String(err && err.message || err) + '\n');
    process.exitCode = 1;
  });
}
