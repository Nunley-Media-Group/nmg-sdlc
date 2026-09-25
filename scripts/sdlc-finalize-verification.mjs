#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  inspectVerificationArtifactRepair,
  inspectVerificationReadiness,
} from './verification-readiness.mjs';
import { inspectIssueSpecScope } from './issue-spec-scope.mjs';
import { isSpecApproved, resolveSpecDir } from './sdlc-execute.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { enterControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';
import { assertInitialStagePublication, getChangedHeadVerificationRecord, resolveRecoveryOwner, reconcileStagePublication } from './sdlc-safe-recoveries.mjs';
import { canonicalJson, resolveSteeringPath } from '../src/sdlc-steering-runtime.mjs';
import { changedPaths, evaluateCondition, validationResultCoverage } from '../src/sdlc-verification-runtime.mjs';

const USAGE = 'Usage: node scripts/sdlc-finalize-verification.mjs --issue N --spec specs/N-SLUG [--controller-run-id ID]';

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function commandSucceeded(result) {
  return result && !result.error && result.status === 0;
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

function matchesRegisteredResults(root, artifact, { issue, specPath, gateHead, activeRun, reportPath, run }) {
  try {
    const manifestPath = resolveSteeringPath(root, 'steering/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.runtimeVersion !== '1'
      || !Array.isArray(manifest.validations)
      || !['modules', 'snippets', 'extensions'].every((key) => Array.isArray(manifest[key]))
      || !Array.isArray(artifact.results)) return false;
    const sourcePaths = [manifestPath, ...['modules', 'snippets', 'extensions']
      .flatMap((kind) => manifest[kind].map(({ path }) => resolveSteeringPath(root, path, kind)))];
    const steeringHash = `sha256:${createHash('sha256')
      .update(sourcePaths.map((file) => `${relative(root, file)}\0${readFileSync(file)}`).join('\0'))
      .digest('hex')}`;
    if (artifact.identity?.steeringHash !== steeringHash) return false;
    const specFiles = ['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md'];
    const specHash = `sha256:${createHash('sha256')
      .update(specFiles.map((name) =>
        `${name}\0${readFileSync(join(root, specPath, name))}`).join('\0')).digest('hex')}`;
    if (artifact.identity.specHash !== specHash) return false;
    const paths = Array.isArray(artifact.changedPaths) ? artifact.changedPaths : [];
    if (manifest.validations.some((validation) => validation.when?.kind === 'changed_paths')) {
      const defaultBranch = run('gh', ['repo', 'view', '--json', 'defaultBranchRef',
        '--jq', '.defaultBranchRef.name'], { cwd: root });
      if (!commandSucceeded(defaultBranch)
        || artifact.baseRef !== String(defaultBranch.stdout).trim()) return false;
      const current = changedPaths(root, artifact.baseRef).filter((path) => path !== reportPath);
      const recorded = paths.filter((path) => path !== reportPath);
      if (JSON.stringify(current) !== JSON.stringify(recorded)) return false;
    }
    const coverage = validationResultCoverage(manifest.validations, artifact.results);
    if (!coverage.complete || artifact.coverage?.complete !== true
      || artifact.coverage.declared !== coverage.declared
      || artifact.coverage.recorded !== coverage.recorded
      || !['missing', 'duplicate', 'unknown'].every((key) =>
        JSON.stringify(artifact.coverage[key]) === JSON.stringify(coverage[key]))) return false;
    return manifest.validations.every((declaration, index) => {
      const result = artifact.results[index];
      const applicable = evaluateCondition(declaration.when, { projectRoot: root, paths });
      if (result?.id !== declaration.id || result.provider !== declaration.provider
        || result.required !== declaration.required || result.applicable !== applicable) return false;
      if (!applicable) return result.effectiveStatus === 'skipped'
        && result.result === null && !Object.hasOwn(result, 'request');
      if (!declaration.required) return true;
      const request = result.request;
      const proof = result.result;
      const expectedRunId = activeRun?.runId ?? `verification-${createHash('sha256')
        .update(`${realpathSync(root)}\0${issue}\0${specPath}\0${gateHead}`).digest('hex')}`;
      const { timeoutMs: _legacyTimeoutMs, ...registered } = declaration;
      const validationHash = `sha256:${createHash('sha256')
        .update(canonicalJson(registered)).digest('hex')}`;
      return request?.schemaVersion === 1 && request.validationId === declaration.id
        && request.projectRoot === realpathSync(root)
        && canonicalJson(request.config) === canonicalJson(declaration.config)
        && request.identity?.headSha === gateHead
        && request.identity.steeringHash === steeringHash
        && request.identity.specHash === specHash
        && request.identity.validationConfigHash === validationHash
        && request.verification?.runId === expectedRunId
        && request.verification.issue === issue
        && request.verification.specPath === specPath
        && proof?.schemaVersion === 1 && proof.status === 'passed'
        && proof.status === result.effectiveStatus
        && typeof proof.summary === 'string' && proof.summary.length > 0
        && Array.isArray(proof.evidence) && proof.evidence.length > 0
        && canonicalJson(proof.identity) === canonicalJson(request.identity);
    });
  } catch {
    return false;
  }
}

function reportOnlyPublicationHead(root, reportPath, run) {
  const parents = run('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { cwd: root });
  const paths = run('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], { cwd: root });
  if (!commandSucceeded(parents) || !commandSucceeded(paths)) return null;
  const commits = String(parents.stdout).trim().split(/\s+/);
  const changed = String(paths.stdout).trim().split(/\r?\n/).filter(Boolean);
  return commits.length === 2 && /^[0-9a-f]{40}$/.test(commits[1])
    && changed.length === 1 && changed[0] === reportPath ? commits[1] : null;
}

function handoff(issue, status, summary, reportPath, reasonCode = null, options = {}) {
  const passed = status === 'passed';
  return {
    schemaVersion: 1,
    issue,
    step: 'verify',
    status,
    intervention: options.intervention ?? (status !== 'passed'),
    summary,
    artifacts: options.artifacts ?? (passed ? [reportPath] : []),
    next: passed ? 'deliver' : options.next ?? null,
    reasonCode,
    ...(options.verificationHead ? { verificationHead: options.verificationHead } : {}),
  };
}

function finalizeVerificationUnlocked({
  issue,
  spec,
  cwd = process.cwd(),
  run = defaultRun,
  fs = { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync },
  controllerRunId,
  explicitControllerRunId = false,
  sessionToken,
} = {}) {
  const issueNumber = Number(issue);
  const specPath = String(spec ?? '').split('\\').join('/').replace(/\/$/, '');
  const reportPath = `${specPath}/verification-report.md`;
  const handoffPath = `.omp/sdlc/handoffs/${issueNumber}-verify.json`;
  const root = resolve(cwd);
  const absoluteHandoff = resolve(root, handoffPath);
  if (!(absoluteHandoff.startsWith(`${root}${sep}`)) || relative(root, absoluteHandoff).split(sep).join('/') !== handoffPath) {
    return { status: 2, stdout: '', stderr: `${USAGE}\n`, handoff: null, handoffPath: null };
  }
  const ensureSafeHandoffStorage = () => {
    let current = root;
    for (const segment of ['.omp', 'sdlc', 'handoffs']) {
      current = join(current, segment);
      if (fs.existsSync(current)) {
        const st = fs.lstatSync(current);
        if (st.isSymbolicLink() || !st.isDirectory()) {
          return false;
        }
      }
    }
    return true;
  };
  const writeHandoff = (value) => {
    const absolute = absoluteHandoff;
    const parent = dirname(absolute);
    if (!ensureSafeHandoffStorage()) {
      return { status: 1, stdout: '', stderr: 'handoff_path_unsafe\n', handoff: null, handoffPath };
    }
    if (fs.existsSync(absolute)) {
      const st = fs.lstatSync(absolute);
      if (st.isSymbolicLink() || !st.isFile()) {
        return { status: 1, stdout: '', stderr: 'handoff_target_unsafe\n', handoff: null, handoffPath };
      }
    }
    if (!fs.existsSync(parent)) {
      let cur = root;
      for (const segment of ['.omp', 'sdlc', 'handoffs']) {
        cur = join(cur, segment);
        if (!fs.existsSync(cur)) {
          fs.mkdirSync(cur);
          const ns = fs.lstatSync(cur);
          if (ns.isSymbolicLink() || !ns.isDirectory()) {
            return { status: 1, stdout: '', stderr: 'handoff_path_unsafe\n', handoff: null, handoffPath };
          }
        }
      }
    }
    // atomic no-follow: tmp write + rename replaces directory entry without following any symlink target
    const tmp = `${absolute}.tmp.${randomUUID()}`;
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(tmp, absolute);
    try {
      const post = fs.lstatSync(absolute);
      if (post.isSymbolicLink() || !post.isFile()) {
        fs.unlinkSync(absolute);
        return { status: 1, stdout: '', stderr: 'handoff_target_unsafe\n', handoff: null, handoffPath };
      }
    } catch {}
    return { status: value.status === 'passed' ? 0 : 1, stdout: `NMG_SDLC_HANDOFF: ${handoffPath}\n`, stderr: '', handoff: value, handoffPath };
  };
  const fail = (reasonCode, summary, options) => writeHandoff(handoff(issueNumber, 'failed', summary, reportPath, reasonCode, options));

  if (!Number.isInteger(issueNumber) || issueNumber <= 0 || isAbsolute(specPath)
    || !new RegExp(`^specs/${issueNumber}-[^/]+$`).test(specPath)) {
    return { status: 2, stdout: '', stderr: `${USAGE}\n`, handoff: null, handoffPath: null };
  }
  if (!ensureSafeHandoffStorage()) {
    return { status: 1, stdout: '', stderr: 'handoff_path_unsafe\n', handoff: null, handoffPath };
  }
  if (fs.existsSync(absoluteHandoff)) {
    try {
      const st = fs.lstatSync(absoluteHandoff);
      if (st.isSymbolicLink() || !st.isFile()) {
        return { status: 1, stdout: '', stderr: 'handoff_target_unsafe\n', handoff: null, handoffPath };
      }
    } catch {}
  }
  let activeRun = null;
  const runPath = join(root, '.omp/sdlc/run.json');
  try {
    const runStat = fs.existsSync(runPath) ? fs.lstatSync(runPath) : null;
    if (runStat) {
      if (!runStat.isFile() || runStat.isSymbolicLink()) throw new Error('unsafe_run');
      activeRun = JSON.parse(fs.readFileSync(runPath, 'utf8'));
      if (activeRun.schemaVersion !== 1 || activeRun.projectRoot !== fs.realpathSync(root)
        || activeRun.currentIssue !== issueNumber || activeRun.currentStep !== 'verify') {
        throw new Error('foreign_run');
      }
    }
  } catch {
    return { status: 1, stdout: '', stderr: 'recovery_owner_ambiguous\n', handoff: null, handoffPath };
  }
  if (explicitControllerRunId && (!activeRun || activeRun.runId !== controllerRunId)) {
    return { status: 1, stdout: '', stderr: 'recovery_owner_ambiguous\n', handoff: null, handoffPath };
  }
  let ownerId;
  try {
    ownerId = resolveRecoveryOwner({ cwd, issue: issueNumber, step: 'verify', controllerRunId, sessionToken, run });
  } catch (error) {
    return fail(error.reasonCode ?? 'recovery_owner_unreadable', `Verification owner unavailable for #${issueNumber}: ${error.message}`);
  }
  if (activeRun && ownerId !== activeRun.runId) {
    return { status: 1, stdout: '', stderr: 'recovery_owner_ambiguous\n', handoff: null, handoffPath };
  }
  const absoluteReport = resolve(root, reportPath);
  if (!(absoluteReport.startsWith(`${root}${sep}`)) || relative(root, absoluteReport).split(sep).join('/') !== reportPath
    || !fs.existsSync(absoluteReport)) return fail('verification_report_invalid', `Verification report missing for #${issueNumber}`);
  const stat = fs.lstatSync(absoluteReport);
  if (!stat.isFile() || stat.isSymbolicLink()) return fail('verification_report_invalid', `Verification report is unsafe for #${issueNumber}`);

  const selectedSpec = resolveSpecDir(root, issueNumber);
  if (selectedSpec !== resolve(root, specPath) || !isSpecApproved(selectedSpec, issueNumber)) {
    return fail('spec_not_approved', `Approved singular spec authority is unavailable for #${issueNumber}`);
  }
  const scope = inspectIssueSpecScope({
    projectRoot: root,
    issueNumber,
    specPath,
  }, {
    lstat: (filePath) => fs.lstatSync(filePath),
    readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
  });
  if (!['scoped', 'implicit_single_issue'].includes(scope.status)) {
    return fail('spec_not_approved', `Live spec scope is unavailable for #${issueNumber}: ${scope.reasonCode}`);
  }

  const readiness = inspectVerificationReadiness({
    content: fs.readFileSync(absoluteReport, 'utf8'),
    options: { expectedIssueNumber: issueNumber, expectedSpecPath: specPath, expectedScope: scope },
  });
  const headResult = run('git', ['rev-parse', 'HEAD'], { cwd });
  const headSha = commandSucceeded(headResult) ? String(headResult.stdout ?? '').trim() : '';
  const artifactRelative = `.omp/sdlc/verification/${issueNumber}.json`;
  const artifactPath = join(root, artifactRelative);
  let artifactRepair = {
    status: 'unverifiable',
    reasonCode: 'verification_artifact_invalid',
    failedLocal: [],
    failedExternal: [],
    incomplete: [],
  };
  let freshArtifact;
  if (fs.existsSync(artifactPath)) {
    try {
      const artifactStat = fs.lstatSync(artifactPath);
      const bytes = fs.readFileSync(artifactPath);
      if (artifactStat.isFile() && !artifactStat.isSymbolicLink() && bytes.length <= 512 * 1024) {
        freshArtifact = JSON.parse(bytes.toString('utf8'));
        artifactRepair = inspectVerificationArtifactRepair(freshArtifact, {
          expectedIssueNumber: issueNumber,
          expectedHeadSha: headSha,
        });
      }
    } catch {
      // Invalid runtime evidence remains intervention-bearing below.
    }
  }
  let changedHeadRecheck;
  try {
    changedHeadRecheck = getChangedHeadVerificationRecord({
      cwd, ownerId, issue: issueNumber, headSha,
    });
  } catch {
    return fail('verification_recheck_invalid', `Changed-head recheck owner is unavailable for #${issueNumber}`);
  }
  const mixedLocalFailure = readiness.status === 'blocked'
    && readiness.reasonCode === 'implementation_non_pass'
    && readiness.implementationStatus === 'incomplete'
    && artifactRepair.status === 'repairable'
    && artifactRepair.failedLocal.length > 0;
  if (changedHeadRecheck) {
    const markers = [...fs.readFileSync(absoluteReport, 'utf8')
      .matchAll(/^\*\*Verification head\*\*:\s*([0-9a-f]{40})\s*$/gm)];
    const reportHead = markers.length === 1 ? markers[0][1] : null;
    if (changedHeadRecheck.evidence?.newHead !== headSha
      || !Array.isArray(readiness.gaps) || readiness.gaps.length > 0
      || artifactRepair.status === 'unverifiable'
      || (['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status)
        && (freshArtifact?.ceiling !== null
          || freshArtifact.results.some((result) => result.required && result.applicable
            && result.effectiveStatus !== 'passed')))) {
      return fail('verification_recheck_invalid', `Changed-head verification evidence is inconsistent for #${issueNumber}`);
    }
    if (reportHead !== headSha || markers.length !== 1) {
      return fail('verification_recheck_not_ready', `Changed-head verification report is stale for #${issueNumber}`, {
        intervention: true, artifacts: [reportPath, artifactRelative],
      });
    }
    const externalBlocker = freshArtifact.ceiling === 'Incomplete'
      || freshArtifact.results.some((result) => result.required && result.applicable
        && (result.effectiveStatus === 'skipped'
          || (result.provider !== 'builtin.command' && result.effectiveStatus !== 'passed')));
    if (externalBlocker && !mixedLocalFailure) {
      return fail('verification_recheck_not_ready', `Changed-head required provider evidence blocks #${issueNumber}`, {
        intervention: true, artifacts: [reportPath, artifactRelative],
      });
    }
    if (readiness.implementationStatus === 'incomplete' && !mixedLocalFailure) {
      return fail('verification_recheck_not_ready', `Changed-head verification is incomplete for #${issueNumber}`, {
        intervention: true, artifacts: [reportPath, artifactRelative],
      });
    }
  }
  if (!['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status)) {
    const remediableReport = readiness.status === 'unverifiable'
      || (readiness.status === 'blocked'
        && readiness.reasonCode === 'implementation_non_pass'
        && ['fail', 'partial'].includes(readiness.implementationStatus))
      || mixedLocalFailure;
    const detail = mixedLocalFailure
      ? `; local failures: ${artifactRepair.failedLocal.join(', ')}`
        + `${artifactRepair.incomplete.length ? `; external incomplete: ${artifactRepair.incomplete.join(', ')}` : ''}`
      : '';
    return fail(
      'verification_not_ready',
      `Verification is not ready for #${issueNumber}: ${readiness.reasonCode}${detail}`,
      remediableReport
        ? {
          intervention: false,
          artifacts: changedHeadRecheck || mixedLocalFailure ? [reportPath, artifactRelative] : [reportPath],
          ...(mixedLocalFailure || changedHeadRecheck ? { verificationHead: headSha } : {}),
          ...(mixedLocalFailure || changedHeadRecheck ? { next: 'implement' } : {}),
        }
        : undefined,
    );
  }

  // No Pass publication, standalone or execute-owned, without the current registered gate.
  if (['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status)) {
    const markers = [...fs.readFileSync(absoluteReport, 'utf8')
      .matchAll(/^\*\*Verification head\*\*:\s*([0-9a-f]{40})\s*$/gm)];
    const gateHead = freshArtifact?.identity?.headSha;
    const reportOnlyParent = gateHead !== headSha
      ? reportOnlyPublicationHead(root, reportPath, run) : null;
    const gateRepair = gateHead === reportOnlyParent
      ? inspectVerificationArtifactRepair(freshArtifact, {
        expectedIssueNumber: issueNumber, expectedHeadSha: gateHead,
      }) : artifactRepair;
    const isCompletePassingExactHead =
      markers.length === 1 && markers[0][1] === gateHead &&
      (gateHead === headSha || gateHead === reportOnlyParent) &&
      gateRepair.status !== 'unverifiable' &&
      freshArtifact.ceiling === null &&
      matchesRegisteredResults(root, freshArtifact, {
        issue: issueNumber, specPath, gateHead, activeRun, reportPath, run,
      }) &&
      !freshArtifact.results.some((result) => result && result.required && result.applicable && result.effectiveStatus !== 'passed');
    if (!isCompletePassingExactHead) {
      return fail('verification_recheck_invalid', `Passing report requires complete passing exact-source-head registered artifact for #${issueNumber}`);
    }
  }

  const branch = run('git', ['branch', '--show-current'], { cwd });
  if (!commandSucceeded(branch) || !String(branch.stdout ?? '').trim().startsWith(`${issueNumber}-`)) {
    return fail('verification_publish_failed', `Verification branch does not belong to #${issueNumber}`);
  }
  const status = run('git', ['status', '--porcelain=v1', '-z'], { cwd });
  if (!commandSucceeded(status)) return fail('verification_publish_failed', `Failed to inspect verification changes for #${issueNumber}`);
  const dirty = porcelainPaths(status.stdout);
  if (dirty.some((path) => path !== reportPath)) {
    return fail('verification_publish_failed', `Unexpected verification changes for #${issueNumber}: ${dirty.filter((path) => path !== reportPath).join(', ')}`);
  }

  let needsReconciliation = !dirty.includes(reportPath);
  if (dirty.includes(reportPath)) {
    try {
      assertInitialStagePublication({ cwd, ownerId, issue: issueNumber, step: 'verify', run });
    } catch (error) {
      return fail('verification_publish_failed', `Verification publication remains stopped: ${error.reasonCode ?? error.message}`);
    }
    const add = run('git', ['add', '--', reportPath], { cwd });
    if (!commandSucceeded(add)) return fail('verification_publish_failed', `Failed to stage verification report for #${issueNumber}`);
    const staged = run('git', ['diff', '--cached', '--quiet', '--', reportPath], { cwd });
    if (staged?.status !== 1) return fail('verification_publish_failed', `Verification report for #${issueNumber} produced no publishable change`);
    const commit = run('git', ['commit', '-m', `docs: record verification for #${issueNumber}`], { cwd });
    if (!commandSucceeded(commit)) return fail('verification_publish_failed', `Failed to commit verification report for #${issueNumber}`);
    const push = run('git', ['push'], { cwd });
    needsReconciliation = !commandSucceeded(push);
  }
  if (needsReconciliation) {
    // Reconcile a failed first push before emitting a terminal handoff.
    const publication = reconcileStagePublication({
      cwd, issue: issueNumber, step: 'verify', ownerId, run,
      expectedSubject: `docs: record verification for #${issueNumber}`, allowedPaths: [reportPath],
    });
    if (!publication.passed) return fail('verification_publish_failed', publication.summary);
  }

  const upstream = run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd });
  if (!commandSucceeded(upstream) || !String(upstream.stdout ?? '').trim()) {
    return fail('verification_publish_failed', `Verification branch has no upstream for #${issueNumber}`);
  }
  const divergence = run('git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'], { cwd });
  const counts = commandSucceeded(divergence) ? String(divergence.stdout ?? '').trim().split(/\s+/).map(Number) : [];
  if (counts.length !== 2 || counts.some((count) => !Number.isInteger(count)) || counts[0] !== 0 || counts[1] !== 0) {
    return fail('verification_publish_failed', `Verification branch is not synchronized for #${issueNumber}`);
  }
  const finalStatus = run('git', ['status', '--porcelain=v1', '-z'], { cwd });
  if (!commandSucceeded(finalStatus) || porcelainPaths(finalStatus.stdout).length > 0) {
    return fail('verification_publish_failed', `Verification worktree is not clean for #${issueNumber}`);
  }

  return writeHandoff(handoff(
    issueNumber,
    'passed',
    `Verification evidence published for #${issueNumber}`,
    reportPath,
  ));
}

export function finalizeVerification(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const processApi = options.processApi ?? process;
  let leaseContext;
  try {
    leaseContext = enterControllerLease({
      projectRoot: cwd,
      runId: options.controllerRunId,
    });
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: `${error?.reasonCode || 'controller_lease_held'}\n`,
      handoff: null,
      handoffPath: `.omp/sdlc/handoffs/${options.issue}-verify.json`,
    };
  }
  const signalHandlers = [];
  if (leaseContext.owned) {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => {
        releaseControllerLease(leaseContext.lease);
        leaseContext = null;
        processApi.exit(signal === 'SIGINT' ? 130 : 143);
      };
      processApi.once(signal, handler);
      signalHandlers.push([signal, handler]);
    }
  }
  try {
    const controllerRunId = leaseContext.owned ? leaseContext.lease.record.runId : leaseContext.lease.runId;
    return finalizeVerificationUnlocked({
      ...options, controllerRunId, explicitControllerRunId: options.controllerRunId != null,
    });
  } finally {
    for (const [signal, handler] of signalHandlers) processApi.removeListener(signal, handler);
    if (leaseContext?.owned) releaseControllerLease(leaseContext.lease);
  }
}

function parseCli(argv) {
  let issue;
  let spec;
  let controllerRunId;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--issue' && issue === undefined && argv[index + 1] !== undefined) issue = argv[index += 1];
    else if (argv[index] === '--spec' && spec === undefined && argv[index + 1] !== undefined) spec = argv[index += 1];
    else if (argv[index] === '--controller-run-id' && controllerRunId === undefined && argv[index + 1] !== undefined) controllerRunId = argv[index += 1];
    else return null;
  }
  if (!/^#?[1-9]\d*$/.test(issue ?? '') || !spec || controllerRunId === '') return null;
  return { issue: Number(String(issue).replace(/^#/, '')), spec, controllerRunId };
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  if (!options) { process.stderr.write(`${USAGE}\n`); return 2; }
  const outcome = finalizeVerification(options);
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  return outcome.status;
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
