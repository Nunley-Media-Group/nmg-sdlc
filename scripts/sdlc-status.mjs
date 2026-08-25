#!/usr/bin/env node

/**
 * Read-only SDLC status for nmg-sdlc v3.
 * Usage: /sdlc-status [--json]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isCliEntry } from './plugin-controller-path.mjs';

import {
  createIssueDependencyClient,
  issueDependencyStatus,
  readDependencyGraph,
} from './issue-dependencies.mjs';
import {
  inspectIssueSpecScope,
  ISSUE_SPEC_MARKDOWN_LIMIT_BYTES,
} from './issue-spec-scope.mjs';
import {
  evidenceIdentity,
  inspectDeliveryValidation,
  inspectVerificationReadiness,
  MAX_VERIFICATION_REPORT_BYTES,
} from './verification-readiness.mjs';
import { isSpecApproved } from './sdlc-execute.mjs';

export const REQUIRED_SPEC_FILES = [
  'requirements.md',
  'design.md',
  'tasks.md',
  'feature.gherkin',
];

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: options.timeout ?? 30_000,
    env: process.env,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.error?.message ?? result.stderr ?? '',
  };
}

export function createAdapters(overrides = {}) {
  return {
    fs: overrides.fs ?? fs,
    run: overrides.run ?? defaultRun,
  };
}

function commandFailure(result) {
  return (result.stderr || result.stdout || `exit ${result.status ?? 'unknown'}`).trim();
}

function boundedMessage(value) {
  const singleLine = String(value ?? '').replace(/\s+/g, ' ').trim();
  return singleLine.length > 240 ? `${singleLine.slice(0, 237)}...` : singleLine;
}

function toGitPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function parseIssueBranch(branch) {
  if (typeof branch !== 'string') return null;
  const match = branch.match(/^(\d+)-(.+)$/)
    ?? branch.match(/^(?:feature\/|issue\/)(\d+)[-/](.+)$/)
    ?? branch.match(/^issue-(\d+)(?:-(.+))?$/);
  if (!match) return null;
  const issueNumber = Number(match[1]);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) return null;
  return { issueNumber, slug: match[2] ?? null };
}

function parseStatusPath(line) {
  const raw = line.slice(3).trim();
  const renamed = raw.includes(' -> ') ? raw.split(' -> ').at(-1) : raw;
  return renamed.replace(/^"|"$/g, '');
}

function isImplementationPath(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  if (/^(?:specs|steering|docs)\//.test(normalized)) return false;
  if (/^\.codex\//.test(normalized)) return false;
  return !/^(?:README(?:\.md)?|CHANGELOG\.md|CONTRIBUTING\.md|AGENTS\.md|LICENSE(?:\.md)?)$/i.test(normalized);
}

function readBounded(fsApi, filePath, maxBytes = 64 * 1024) {
  try {
    const fd = fsApi.openSync(filePath, 'r');
    const buf = Buffer.allocUnsafe(maxBytes);
    const bytes = fsApi.readSync(fd, buf, 0, maxBytes, 0);
    fsApi.closeSync(fd);
    return buf.slice(0, bytes).toString('utf8');
  } catch {
    return '';
  }
}

export function findFeatureDir(specsDir, issueNumber, branchSlug, adapters = {}) {
  const fsApi = adapters.fs ?? fs;
  if (!Number.isInteger(issueNumber) || issueNumber <= 0 || !fsApi.existsSync(specsDir)) return null;
  const entries = fsApi.readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => name.startsWith(`${issueNumber}-`))
    .sort();
  const branchMatch = branchSlug ? `${issueNumber}-${branchSlug}` : null;
  if (branchMatch && entries.includes(branchMatch)) return branchMatch;
  if (entries.length > 1) throw new Error(`multiple spec directories found for #${issueNumber}: ${entries.join(', ')}`);
  return entries[0] ?? null;
}

export function checkRequiredSpecFiles(featureDir, adapters = {}) {
  const fsApi = adapters.fs ?? fs;
  const missing = [];
  for (const f of REQUIRED_SPEC_FILES) {
    if (!fsApi.existsSync(path.join(featureDir, f))) missing.push(f);
  }
  return { complete: missing.length === 0, missingFiles: missing };
}


export function collectVerification(projectRoot, spec, pullRequest, untrackedImplementationPaths, adapters, gaps) {
  if (!spec?.path) return null;
  const reportPath = path.join(projectRoot, spec.path, 'verification-report.md');
  if (!adapters.fs.existsSync(reportPath)) return null;
  const relativeReportPath = toGitPath(path.relative(projectRoot, reportPath));
  const content = readBounded(adapters.fs, reportPath, MAX_VERIFICATION_REPORT_BYTES);
  const expectedHeadSha = pullRequest?.headRefOid;
  const readiness = inspectVerificationReadiness({
    content,
    options: {
      expectedIssueNumber: spec.scope?.issueNumber,
      expectedSpecPath: spec.path,
      expectedScope: spec.scope,
      expectedHeadSha,
    },
  });
  const verificationGaps = [...readiness.gaps];
  if (untrackedImplementationPaths.length > 0) {
    verificationGaps.push(
      `untracked implementation paths invalidate verification: ${untrackedImplementationPaths.join(', ')}`,
    );
  }

  const readinessStatus = ['pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status)
    ? readiness.status
    : null;
  let deliveryValidationStatus = null;
  let deliveryValidationGaps = [];
  if (content.includes('<!-- nmg-sdlc-delivery-validation:')) {
    const declaredEvidence = readiness.readiness?.evidence ?? readiness.readiness?.pendingEvidence;
    const delivery = inspectDeliveryValidation({
      content,
      options: {
        expectedIssueNumber: spec.scope?.issueNumber,
        expectedSpecPath: spec.path,
        expectedPullRequestNumber: pullRequest?.number,
        expectedHeadSha,
        deliveryAcceptanceCriteria: spec.scope?.delivery?.acceptanceCriteria,
        expectedEvidenceIdentities: Array.isArray(declaredEvidence)
          ? declaredEvidence.map(evidenceIdentity)
          : undefined,
      },
    });
    deliveryValidationStatus = delivery.status;
    deliveryValidationGaps = delivery.gaps;
    verificationGaps.push(...delivery.gaps);
  }
  gaps.push(...verificationGaps.map((gap) => `verification evidence: ${gap}`));

  return {
    path: relativeReportPath,
    status: readiness.implementationStatus ?? 'unknown',
    current: readiness.status !== 'unverifiable' && untrackedImplementationPaths.length === 0,
    readinessStatus,
    deliveryValidationStatus,
    deliveryValidationGaps,
    gaps: [...new Set(verificationGaps)],
  };
}

function classifyChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return 'none';
  const bad = checks.filter((c) => !['success', 'neutral', 'skipped'].includes(String(c.state || c.conclusion || '').toLowerCase()));
  return bad.length ? 'failing' : 'passing';
}

const CLOSING_PULL_REQUEST_FIELDS = `
  nodes {
    number
    state
    mergedAt
    baseRefName
    mergeCommit { oid }
  }
  pageInfo { hasNextPage endCursor }
`;

function normalizeProjectItems(items) {
  return (items || []).map((it) => ({
    id: it.id,
    projectId: it.project?.id,
    projectTitle: it.project?.title,
    statusFieldId: it.fieldValueByName?.field?.id,
    statusName: it.fieldValueByName?.name,
  }));
}

function collectGithub(projectRoot, branch, issueNumber, adapters, gaps) {
  const result = { issue: null, pullRequest: null, projectItems: [] };
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return result;
  }
  try {
    const issueRes = adapters.run('gh', ['issue', 'view', String(issueNumber), '--json', 'number,title,state,body,labels,projectItems'], { cwd: projectRoot, timeout: 20_000 });
    if (issueRes.ok) {
      const raw = JSON.parse(issueRes.stdout);
      result.issue = {
        number: raw.number,
        title: raw.title,
        state: raw.state,
        body: raw.body,
        labels: (raw.labels || []).map((l) => l.name),
        dependency: { status: 'unknown', reasonCode: 'dependency_unreadable' },
      };
      const items = raw.projectItems?.nodes || [];
      result.projectItems = normalizeProjectItems(items);
      try {
        const client = createIssueDependencyClient({ cwd: projectRoot, run: adapters.run });
        const graph = readDependencyGraph(client, [issueNumber]);
        result.issue.dependency = issueDependencyStatus(graph, issueNumber);
      } catch (error) {
        const reasonCode = error?.reasonCode || 'dependency_unreadable';
        const status = ['dependency_cycle', 'dependency_dangling'].includes(reasonCode) ? 'blocked' : 'unknown';
        result.issue.dependency = { status, reasonCode };
        gaps.push(`official blocked-by evidence: ${reasonCode}`);
      }
    } else {
      gaps.push(`issue #${issueNumber} fetch failed: ${boundedMessage(commandFailure(issueRes))}`);
    }
  } catch (e) {
    gaps.push(`issue #${issueNumber} parse failed: ${boundedMessage(e.message)}`);
  }

  // PR from branch
  try {
    const prRes = adapters.run('gh', ['pr', 'view', '--json', 'number,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,closingIssuesReferences,reviewThreads'], { cwd: projectRoot, timeout: 20_000 });
    if (prRes.ok) {
      const p = JSON.parse(prRes.stdout);
      if (p && p.headRefName === branch) {
        result.pullRequest = {
          number: p.number,
          state: p.state,
          isDraft: p.isDraft,
          headRefOid: p.headRefOid,
          baseRefName: p.baseRefName,
          mergeStateStatus: p.mergeStateStatus,
          checks: 'unknown',
          closing: (p.closingIssuesReferences || []).map((c) => c.number),
        };
      }
    }
  } catch (e) {
    // non fatal
  }
  return result;
}
function discoverDefaultBranch(projectRoot, adapters) {
  const remoteHead = adapters.run(
    'git',
    ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
    { cwd: projectRoot, timeout: 10_000 },
  );
  if (remoteHead.ok) {
    const ref = remoteHead.stdout.trim();
    if (ref.startsWith('origin/') && ref.length > 'origin/'.length) {
      return { name: ref.slice('origin/'.length), gap: null };
    }
  }

  const repository = adapters.run(
    'gh',
    ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'],
    { cwd: projectRoot, timeout: 10_000 },
  );
  const name = repository.ok ? repository.stdout.trim() : '';
  if (name) return { name, gap: null };

  for (const candidate of ['main', 'master']) {
    const local = adapters.run(
      'git',
      ['show-ref', '--verify', '--quiet', `refs/heads/${candidate}`],
      { cwd: projectRoot, timeout: 10_000 },
    );
    if (local.ok) return { name: candidate, gap: null };
  }

  const detail = boundedMessage(commandFailure(repository))
    || boundedMessage(commandFailure(remoteHead))
    || 'no local or remote default-branch evidence';
  return { name: null, gap: `default branch unavailable: ${detail}` };
}

export function collectEvidence(projectPath, adapterOverrides = {}) {
  const adapters = createAdapters(adapterOverrides);
  const rootResult = adapters.run('git', ['rev-parse', '--show-toplevel'], { cwd: projectPath, timeout: 10_000 });
  if (!rootResult.ok) {
    throw new Error(`not a git project: ${boundedMessage(commandFailure(rootResult))}`);
  }
  const projectRoot = path.resolve(rootResult.stdout.trim());

  const branchResult = adapters.run('git', ['branch', '--show-current'], { cwd: projectRoot });
  const statusResult = adapters.run(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: projectRoot },
  );
  if (!branchResult.ok || !statusResult.ok) {
    const failure = !branchResult.ok ? branchResult : statusResult;
    throw new Error(`required git evidence unavailable: ${boundedMessage(commandFailure(failure))}`);
  }

  const branch = branchResult.stdout.trim() || 'HEAD';
  const branchContext = parseIssueBranch(branch);
  const issueNumber = branchContext?.issueNumber ?? null;
  const statusLines = statusResult.stdout.split(/\r?\n/).filter(Boolean);
  const worktreePaths = statusLines.map(parseStatusPath).filter(Boolean);
  const gaps = [];
  const defaultBranchEvidence = discoverDefaultBranch(projectRoot, adapters);
  if (defaultBranchEvidence.gap) gaps.push(defaultBranchEvidence.gap);
  const defaultBranch = defaultBranchEvidence.name;
  let branchPaths = [];
  let baseRelativeCommits = [];
  if (defaultBranch) {
    const diffResult = adapters.run('git', ['diff', '--name-only', `${defaultBranch}...HEAD`], { cwd: projectRoot });
    const commitResult = adapters.run('git', ['log', '--format=%H%x09%s', `${defaultBranch}..HEAD`], { cwd: projectRoot });
    branchPaths = diffResult.ok ? diffResult.stdout.split(/\r?\n/).filter(Boolean) : [];
    if (!diffResult.ok && branch !== defaultBranch) {
      gaps.push(`base-relative git evidence unavailable: ${boundedMessage(commandFailure(diffResult))}`);
    }
    baseRelativeCommits = commitResult.ok
      ? commitResult.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
          const [sha, ...subject] = line.split('\t');
          return { sha, subject: subject.join('\t') };
        })
      : [];
    if (!commitResult.ok && branch !== defaultBranch) {
      gaps.push(`base-relative commit evidence unavailable: ${boundedMessage(commandFailure(commitResult))}`);
    }
  }

  const changedPaths = [...new Set([...branchPaths, ...worktreePaths])].sort();
  const implementationPaths = changedPaths.filter(isImplementationPath);
  const untrackedImplementationPaths = statusLines
    .filter((line) => line.startsWith('?? '))
    .map(parseStatusPath)
    .filter(isImplementationPath);
  const github = collectGithub(projectRoot, branch, issueNumber, adapters, gaps);
  const activeIssueNumber = github.issue?.number ?? issueNumber;

  let spec = null;
  try {
    const specsDir = path.join(projectRoot, 'specs');
    const featureName = findFeatureDir(specsDir, activeIssueNumber, branchContext?.slug, adapters);
    if (featureName) {
      const full = path.join(specsDir, featureName);
      const check = checkRequiredSpecFiles(full, adapters);
      spec = {
        path: toGitPath(path.relative(projectRoot, full)),
        complete: check.complete && isSpecApproved(full, activeIssueNumber),
        missingFiles: check.missingFiles,
      };
      if (Number.isInteger(activeIssueNumber) && activeIssueNumber > 0) {
        spec.scope = inspectIssueSpecScope(
          {
            projectRoot,
            specPath: spec.path,
            issueNumber: activeIssueNumber,
          },
          {
            readFile: (filePath) => readBounded(
              adapters.fs,
              filePath,
              ISSUE_SPEC_MARKDOWN_LIMIT_BYTES,
            ),
            lstat: (filePath) => adapters.fs.lstatSync(filePath),
            realpath: (filePath) => adapters.fs.realpathSync(filePath),
          },
        );
      }
    }
  } catch (error) {
    gaps.push(`spec evidence unavailable: ${boundedMessage(error.message)}`);
  }

  const verification = collectVerification(
    projectRoot,
    spec,
    github.pullRequest,
    untrackedImplementationPaths,
    adapters,
    gaps,
  );
  const publicPullRequest = github.pullRequest
    ? Object.fromEntries(Object.entries(github.pullRequest).filter(([key]) => key !== 'body'))
    : null;
  return {
    project: {
      root: projectRoot,
      branch,
      defaultBranch,
      dirty: statusLines.length > 0,
      changedPaths,
      implementationPaths,
      baseRelativeCommits,
    },
    issue: github.issue,
    spec,
    verification,
    pullRequest: publicPullRequest,
    gaps,
  };
}

function sdlcCommand(name, issueNumber) {
  return issueNumber ? `/sdlc-${name} #${issueNumber}` : `/sdlc-${name}`;
}

function artifactSummary(evidence, stage) {
  const completed = [];
  const verificationCurrent = evidence.verification?.status === 'pass'
    && evidence.verification.current === true;
  const deliveryValidationPending = stage === 'delivery-validation-pending';
  const scopeBlocked = ['repair_required', 'unverifiable'].includes(evidence.spec?.scope?.status);
  const onDefaultBranch = evidence.project.defaultBranch != null
    && evidence.project.branch === evidence.project.defaultBranch;
  const specReady = evidence.spec?.complete && !scopeBlocked;
  if (evidence.issue?.number && !onDefaultBranch) completed.push('issue branch');
  if (specReady) completed.push('spec package');
  if (evidence.project.implementationPaths.length > 0) completed.push('implementation');
  if (deliveryValidationPending) completed.push('local verification');
  else if (verificationCurrent) completed.push('verification');
  if (evidence.pullRequest) completed.push('pull request');
  if (stage === 'complete') completed.push('merged delivery');

  const missing = [];
  if (!evidence.issue?.number && (onDefaultBranch || !parseIssueBranch(evidence.project.branch))) missing.push('issue branch');
  if (!specReady) missing.push(scopeBlocked ? 'issue scope repair' : 'spec package');
  if (evidence.project.implementationPaths.length === 0) missing.push('implementation');
  if (deliveryValidationPending) missing.push('PR evidence');
  else if (!verificationCurrent) missing.push('verification');
  if (!evidence.pullRequest) missing.push('pull request');
  return { completed, missing: stage === 'complete' ? [] : missing };
}

export function inferLifecycle(evidence) {
  const gaps = [...evidence.gaps];
  const issueNumber = evidence.issue?.number ?? parseIssueBranch(evidence.project.branch)?.issueNumber;
  const prState = String(evidence.pullRequest?.state ?? '').toUpperCase();
  const implementationPresent = evidence.project.implementationPaths.length > 0;
  const verificationPass = evidence.verification?.status === 'pass'
    && evidence.verification.current === true;
  const deliveryValidationPending = evidence.verification?.current === true
    && (
      (evidence.verification.readinessStatus === 'pr_evidence_pending'
        && (!evidence.pullRequest || (prState === 'OPEN' && evidence.pullRequest.isDraft === true)))
      || (evidence.verification.readinessStatus === 'pr_evidence_satisfied'
        && prState === 'OPEN'
        && evidence.pullRequest?.isDraft === true)
    );
  const controlledReadiness = ['pr_evidence_pending', 'pr_evidence_satisfied']
    .includes(evidence.verification?.readinessStatus);
  const finalDeliveryValidated = evidence.verification?.current === true
    && evidence.verification.deliveryValidationStatus === 'final_sha_validated';
  const exposedPrDependentVerification = controlledReadiness
    && (
      prState === 'MERGED'
      || (prState === 'OPEN' && evidence.pullRequest?.isDraft !== true)
    )
    && !finalDeliveryValidated;
  const scopeStatus = evidence.spec?.scope?.status ?? null;
  const scopeBlocked = ['repair_required', 'unverifiable'].includes(scopeStatus);
  const dependency = evidence.issue?.dependency ?? { status: 'unknown', reasonCode: 'dependency_unreadable' };
  const onDefaultBranch = evidence.project.defaultBranch != null
    && evidence.project.branch === evidence.project.defaultBranch;
  let stage;
  let nextAction;

  const specApproved = evidence.spec && evidence.spec.complete && !scopeBlocked;

  if (issueNumber && !evidence.issue) {
    gaps.push(`issue #${issueNumber} evidence unavailable`);
    stage = 'unknown';
    nextAction = {
      command: '/sdlc-status',
      reason: 'issue_evidence_unavailable',
      manualRepairRequired: true,
    };
  } else if (evidence.issue && (dependency.status === 'blocked' || dependency.status === 'unknown')) {
    gaps.push(`official blocked-by dependency: ${dependency.reasonCode}`);
    stage = dependency.status === 'blocked' ? 'blocked' : 'unknown';
    nextAction = {
      command: '/sdlc-status',
      reason: dependency.reasonCode,
      manualRepairRequired: dependency.status === 'unknown',
    };
  } else if (scopeBlocked) {
    const scopeGaps = evidence.spec.scope.gaps?.length ? evidence.spec.scope.gaps.join('; ') : evidence.spec.scope.reasonCode;
    gaps.push(`issue scope ${scopeStatus}: ${scopeGaps}`);
    stage = issueNumber && !onDefaultBranch ? 'started' : 'unknown';
    nextAction = { command: issueNumber ? `/sdlc-write-spec #${issueNumber}` : `/sdlc-write-spec`, reason: 'write spec', manualRepairRequired: false };
  } else if ((verificationPass || deliveryValidationPending) && !implementationPresent) {
    gaps.push('passing verification conflicts with missing implementation evidence');
    stage = 'specified';
    nextAction = { command: sdlcCommand('execute', issueNumber), reason: 'implementation evidence missing; recommend /sdlc-execute', manualRepairRequired: false };
  } else if (
    verificationPass
    && prState === 'MERGED'
    && String(evidence.issue?.state ?? '').toUpperCase() === 'CLOSED'
    && (!controlledReadiness || finalDeliveryValidated)
  ) {
    stage = 'complete';
    nextAction = { command: '/sdlc-status', reason: 'delivery complete', manualRepairRequired: false };
  } else if (exposedPrDependentVerification) {
    stage = 'delivery-validation-pending';
    nextAction = { command: sdlcCommand('open-pr', issueNumber), reason: 'PR evidence pending', manualRepairRequired: false };
  } else if (verificationPass && evidence.pullRequest && prState === 'OPEN' && !evidence.pullRequest.isDraft) {
    stage = 'review';
    nextAction = { command: sdlcCommand('open-pr', issueNumber), reason: 'await merge', manualRepairRequired: false };
  } else if (verificationPass || deliveryValidationPending) {
    stage = 'verified';
    nextAction = { command: sdlcCommand('open-pr', issueNumber), reason: 'ready to deliver', manualRepairRequired: false };
  } else if (implementationPresent) {
    stage = 'implementing';
    nextAction = { command: sdlcCommand('verify-code', issueNumber), reason: 'verify after implement', manualRepairRequired: false };
  } else if (specApproved) {
    stage = 'specified';
    nextAction = { command: sdlcCommand('execute', issueNumber), reason: 'approved spec exists and unblocked; recommend /sdlc-execute', manualRepairRequired: false };
  } else if (issueNumber) {
    stage = 'ready';
    nextAction = { command: `/sdlc-write-spec #${issueNumber}`, reason: 'first ready issue has no approved spec', manualRepairRequired: false };
  } else {
    stage = 'unknown';
    nextAction = { command: '/sdlc-draft-issue', reason: 'no active issue', manualRepairRequired: false };
  }

  const artifacts = artifactSummary(evidence, stage);
  return {
    schemaVersion: 1,
    project: evidence.project,
    issue: evidence.issue,
    spec: evidence.spec,
    verification: evidence.verification,
    pullRequest: evidence.pullRequest,
    stage,
    completedArtifacts: artifacts.completed,
    missingArtifacts: artifacts.missing,
    gaps: [...new Set(gaps)],
    nextAction,
  };
}


function listOrNone(values) {
  return values.length ? values.join(', ') : 'none';
}

export function renderText(status) {
  const issue = status.issue
    ? `#${status.issue.number}${status.issue.title ? ` ${status.issue.title}` : ''} (${status.issue.state ?? 'unknown'})`
    : 'unknown';
  const spec = status.spec
    ? `${status.spec.path ?? 'not authored'} (${status.spec.complete ? 'complete' : status.spec.missingFiles.length ? `missing ${status.spec.missingFiles.join(', ')}` : 'not executable'})`
    : 'unknown';
  const verification = status.verification
    ? `${status.verification.status}, ${status.verification.current ? 'current' : 'not current'} (${status.verification.path})`
    : 'unknown';
  const pullRequest = status.pullRequest
    ? `#${status.pullRequest.number} ${status.pullRequest.state} (${status.pullRequest.isDraft === true ? 'draft' : status.pullRequest.isDraft === false ? 'ready' : 'draft state unknown'}, head: ${status.pullRequest.headRefOid ?? 'unknown'}, merge: ${status.pullRequest.mergeStateStatus ?? 'unknown'})`
    : 'unknown';
  const dependencies = status.issue?.dependency
    ? `${status.issue.dependency.status}${status.issue.dependency.reasonCode ? ` (${status.issue.dependency.reasonCode})` : ''}`
    : 'unknown';
  const lines = [
    `SDLC status: ${status.stage}`,
    `Issue: ${issue}`,
    `Dependencies: ${dependencies}`,
    `Branch: ${status.project.branch} (${status.project.dirty ? 'dirty' : 'clean'})`,
    `Spec: ${spec}`,
    `Verification: ${verification}`,
    `Pull request: ${pullRequest}`,
    `Completed: ${listOrNone(status.completedArtifacts)}`,
    `Missing: ${listOrNone(status.missingArtifacts)}`,
  ];
  if (status.gaps.length) lines.push(`Gaps: ${status.gaps.join('; ')}`);
  lines.push(`Next: ${status.nextAction.command}`);
  return lines.join('\n');
}

export function renderJson(status) {
  // ensure no epicAuthority or coordination emitted
  const out = { ...status };
  if (out.spec) delete out.spec.epicAuthority;
  if (out.issue) delete out.issue.coordination;
  return `${JSON.stringify(out, null, 2)}\n`;
}

function usage() {
  return `Usage: /sdlc-status [--json]\n`;
}

export function runCli(argv, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  let values;
  try {
    values = parseArgs({
      args: argv,
      options: {
        project: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    stderr.write(`Argument error: ${error.message}\n`);
    return 2;
  }

  if (values.help) {
    stdout.write(usage());
    return 0;
  }
  if (!values.project) {
    stderr.write('Argument error: --project <repo-root> is required\n');
    return 2;
  }

  try {
    const status = inferLifecycle(collectEvidence(values.project, options.adapters));
    stdout.write(values.json ? renderJson(status) : `${renderText(status)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Status error: ${error.message}\n`);
    return 1;
  }
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli(process.argv.slice(2));
