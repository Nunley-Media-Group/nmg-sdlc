#!/usr/bin/env node

/**
 * Read-only manual lifecycle status collector and CLI for nmg-sdlc projects.
 *
 * Usage: node sdlc-status.mjs --project <repo-root> [--json]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  classifyEpicRelationships,
  epicChildLabelTargets,
  parseBodyRelationships,
} from './epic-relationships.mjs';

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
  const descriptor = fsApi.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(maxBytes);
    const bytesRead = fsApi.readSync(descriptor, buffer, 0, maxBytes, 0);
    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    fsApi.closeSync(descriptor);
  }
}

export function findFeatureDir(specsDir, issueNumber, branchSlug, adapters = {}) {
  const fsApi = adapters.fs ?? fs;
  if (!fsApi.existsSync(specsDir)) return null;
  const directories = fsApi.readdirSync(specsDir)
    .filter((entry) => fsApi.statSync(path.join(specsDir, entry)).isDirectory())
    .sort();

  if (branchSlug) {
    const slugMatch = directories.find((entry) => entry === branchSlug || entry.includes(branchSlug));
    if (slugMatch) return path.join(specsDir, slugMatch);
  }

  if (Number.isInteger(issueNumber) && issueNumber > 0) {
    const issuePattern = new RegExp(`(^|[^0-9])#?${issueNumber}([^0-9]|$)`);
    for (const directory of directories) {
      if (issuePattern.test(directory)) return path.join(specsDir, directory);
      const requirementsPath = path.join(specsDir, directory, 'requirements.md');
      if (!fsApi.existsSync(requirementsPath)) continue;
      try {
        const content = readBounded(fsApi, requirementsPath, 32 * 1024);
        const issueField = content.match(/^\*\*Issues?\*\*:.*$/m)?.[0] ?? '';
        if (issuePattern.test(issueField)) return path.join(specsDir, directory);
      } catch {
        // Ignore unreadable candidates; optional evidence remains absent.
      }
    }
  }
  return null;
}

export function checkRequiredSpecFiles(featureDir, adapters = {}) {
  const fsApi = adapters.fs ?? fs;
  return REQUIRED_SPEC_FILES.filter((filename) => {
    const filePath = path.join(featureDir, filename);
    return !fsApi.existsSync(filePath) || fsApi.statSync(filePath).size === 0;
  });
}

function collectVerification(projectRoot, spec, untrackedImplementationPaths, adapters, gaps) {
  if (!spec) return null;
  const reportPath = path.join(projectRoot, spec.path, 'verification-report.md');
  if (!adapters.fs.existsSync(reportPath)) return null;
  const relativeReportPath = toGitPath(path.relative(projectRoot, reportPath));
  try {
    const content = readBounded(adapters.fs, reportPath);
    const match = content.match(/Implementation Status(?:\*\*)?\s*:?\s*(?:\*\*)?\s*(Pass|Partial|Fail)\b/i);
    if (!match) {
      gaps.push('verification report lacks an explicit Implementation Status');
      return { path: relativeReportPath, status: 'unknown', current: false, commit: null };
    }
    const status = match[1].toLowerCase();
    const verification = { path: relativeReportPath, status, current: false, commit: null };
    if (status !== 'pass') return verification;

    const commitResult = adapters.run(
      'git',
      ['log', '-1', '--format=%H', '--', relativeReportPath],
      { cwd: projectRoot },
    );
    const commit = commitResult.ok ? commitResult.stdout.trim() : '';
    if (!/^[0-9a-f]{40}$/i.test(commit)) {
      gaps.push('verification report is not committed; freshness cannot be proven');
      return verification;
    }
    verification.commit = commit;

    const ancestryResult = adapters.run(
      'git',
      ['merge-base', '--is-ancestor', commit, 'HEAD'],
      { cwd: projectRoot },
    );
    if (!ancestryResult.ok) {
      gaps.push('verification report commit is not in the current branch history');
      return verification;
    }

    const diffResult = adapters.run(
      'git',
      ['diff', '--name-only', '-z', commit, '--'],
      { cwd: projectRoot },
    );
    if (!diffResult.ok) {
      gaps.push(`verification freshness unavailable: ${boundedMessage(commandFailure(diffResult))}`);
      return verification;
    }
    const changedSinceVerification = diffResult.stdout.split('\0').filter(Boolean);
    if (changedSinceVerification.includes(relativeReportPath)) {
      gaps.push('verification report has uncommitted changes; freshness cannot be proven');
      return verification;
    }
    const staleImplementationPaths = [...new Set([
      ...changedSinceVerification.filter(isImplementationPath),
      ...untrackedImplementationPaths,
    ])].sort();
    if (staleImplementationPaths.length > 0) {
      gaps.push(`verification report predates implementation changes: ${staleImplementationPaths.join(', ')}`);
      return verification;
    }

    verification.current = true;
    return verification;
  } catch (error) {
    gaps.push(`verification report unavailable: ${boundedMessage(error.message)}`);
    return { path: relativeReportPath, status: 'unknown', current: false, commit: null };
  }
}

function classifyChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return 'absent';
  const values = checks.flatMap((check) => [check.bucket, check.state])
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (values.some((value) => /fail|error|cancel|timed[_ -]?out/.test(value))) return 'failing';
  if (values.some((value) => /pending|queued|in_progress|waiting|requested/.test(value))) return 'pending';
  if (values.some((value) => /pass|success|skipping|neutral/.test(value))) return 'passing';
  return 'unknown';
}

const GRAPHQL_ISSUE_FIELDS = `
  number
  state
  body
  labels(first: 100) { nodes { name } }
  subIssues(first: 100) {
    nodes { number state }
    pageInfo { hasNextPage endCursor }
  }
`;

const MAX_COORDINATION_TARGETS = 100;
const MAX_FALLBACK_TARGETS = 8;

function markCoordinationUnverifiable(result, message) {
  return {
    ...result,
    role: 'unverifiable',
    identity: 'unverifiable',
    gaps: [...result.gaps, message],
  };
}

function relationshipCandidates(issue) {
  const body = parseBodyRelationships(issue?.body);
  return [...new Set([...body.dependsOn, ...epicChildLabelTargets(issue)])]
    .filter((number) => number !== issue?.number)
    .sort((left, right) => left - right);
}

function collectCoordination(projectRoot, activeIssue, adapters, gaps) {
  const fallbackIssues = [activeIssue];
  const candidates = relationshipCandidates(activeIssue);
  if (candidates.length > MAX_COORDINATION_TARGETS) {
    const message = `issue #${activeIssue.number} has more than ${MAX_COORDINATION_TARGETS} relationship targets; bounded coordination classification is unverifiable`;
    gaps.push(message);
    const result = classifyEpicRelationships({
      issues: fallbackIssues,
      activeIssueNumber: activeIssue.number,
      nativeAvailable: false,
    });
    return markCoordinationUnverifiable(result, message);
  }
  try {
    const repoResult = adapters.run(
      'gh',
      ['repo', 'view', '--json', 'nameWithOwner'],
      { cwd: projectRoot, timeout: 30_000 },
    );
    if (repoResult.ok) {
      const nameWithOwner = JSON.parse(repoResult.stdout)?.nameWithOwner;
      const [owner, name, extra] = String(nameWithOwner ?? '').split('/');
      if (owner && name && !extra) {
        const aliases = candidates
          .map((number) => `target${number}: issue(number: ${number}) { ${GRAPHQL_ISSUE_FIELDS} }`)
          .join('\n');
        const query = `query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            active: issue(number: ${activeIssue.number}) {
              ${GRAPHQL_ISSUE_FIELDS}
              parent { ${GRAPHQL_ISSUE_FIELDS} }
            }
            ${aliases}
          }
        }`;
        const graphResult = adapters.run(
          'gh',
          ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`],
          { cwd: projectRoot, timeout: 30_000 },
        );
        if (graphResult.ok) {
          const repository = JSON.parse(graphResult.stdout)?.data?.repository;
          if (repository?.active) {
            const graphIssues = [repository.active, repository.active.parent]
              .concat(candidates.map((number) => repository[`target${number}`]))
              .filter(Boolean);
            const result = classifyEpicRelationships({
              issues: graphIssues,
              activeIssueNumber: activeIssue.number,
              nativeAvailable: true,
            });
            const truncated = [repository.active, repository.active.parent]
              .filter(Boolean)
              .some((issue) => issue.subIssues?.pageInfo?.hasNextPage === true);
            if (!truncated) return result;
            const message = 'GitHub native sub-issue result is paginated; coordination classification is unverifiable until every page is hydrated';
            gaps.push(message);
            return markCoordinationUnverifiable(result, message);
          }
          gaps.push('GitHub coordination response malformed: active issue missing');
        } else {
          gaps.push(`GitHub native coordination unavailable: ${boundedMessage(commandFailure(graphResult))}`);
        }
      } else {
        gaps.push('GitHub repository response malformed: nameWithOwner missing');
      }
    } else {
      gaps.push(`GitHub repository unavailable for coordination: ${boundedMessage(commandFailure(repoResult))}`);
    }
  } catch (error) {
    gaps.push(`GitHub coordination metadata malformed: ${boundedMessage(error.message)}`);
  }

  if (candidates.length > MAX_FALLBACK_TARGETS) {
    const message = `native coordination is unavailable and ${candidates.length} targets exceed the bounded fallback limit of ${MAX_FALLBACK_TARGETS}`;
    gaps.push(message);
    const result = classifyEpicRelationships({
      issues: fallbackIssues,
      activeIssueNumber: activeIssue.number,
      nativeAvailable: false,
    });
    return markCoordinationUnverifiable(result, message);
  }

  for (const number of candidates) {
    try {
      const targetResult = adapters.run(
        'gh',
        ['issue', 'view', String(number), '--json', 'number,state,labels,body'],
        { cwd: projectRoot, timeout: 5_000 },
      );
      if (targetResult.ok) fallbackIssues.push(JSON.parse(targetResult.stdout));
      else gaps.push(`GitHub coordination target #${number} unavailable: ${boundedMessage(commandFailure(targetResult))}`);
    } catch (error) {
      gaps.push(`GitHub coordination target #${number} malformed: ${boundedMessage(error.message)}`);
    }
  }
  return classifyEpicRelationships({
    issues: fallbackIssues,
    activeIssueNumber: activeIssue.number,
    nativeAvailable: false,
  });
}

function collectGithub(projectRoot, branch, issueNumber, adapters, gaps) {
  let issue = issueNumber
    ? { number: issueNumber, title: null, state: 'unknown', source: 'branch' }
    : null;
  let pullRequest = null;

  if (branch && branch !== 'main' && branch !== 'HEAD') {
    const prResult = adapters.run(
      'gh',
      ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,state,url,headRefName,closingIssuesReferences'],
      { cwd: projectRoot, timeout: 30_000 },
    );
    if (prResult.ok) {
      try {
        const [pr] = JSON.parse(prResult.stdout);
        if (pr) {
          const closingIssue = Array.isArray(pr.closingIssuesReferences)
            ? pr.closingIssuesReferences.find((candidate) => Number.isInteger(candidate?.number))
            : null;
          if (!issue && closingIssue) {
            issue = {
              number: closingIssue.number,
              title: closingIssue.title ?? null,
              state: closingIssue.state ?? 'unknown',
              source: 'pullRequest',
            };
          }
          pullRequest = {
            number: pr.number,
            state: pr.state ?? 'unknown',
            url: pr.url ?? null,
            checks: 'unknown',
          };
          if (String(pr.state).toUpperCase() === 'OPEN') {
            const checksResult = adapters.run(
              'gh',
              ['pr', 'checks', String(pr.number), '--json', 'name,state,bucket'],
              { cwd: projectRoot, timeout: 30_000 },
            );
            if (checksResult.ok) {
              try {
                pullRequest.checks = classifyChecks(JSON.parse(checksResult.stdout));
              } catch (error) {
                gaps.push(`GitHub checks response malformed: ${boundedMessage(error.message)}`);
              }
            } else if (/no checks reported/i.test(commandFailure(checksResult))) {
              pullRequest.checks = 'absent';
            } else {
              gaps.push(`GitHub checks unavailable: ${boundedMessage(commandFailure(checksResult))}`);
            }
          }
        }
      } catch (error) {
        gaps.push(`GitHub pull request response malformed: ${boundedMessage(error.message)}`);
      }
    } else {
      gaps.push(`GitHub pull request unavailable: ${boundedMessage(commandFailure(prResult))}`);
    }
  }

  if (issue?.number) {
    const issueResult = adapters.run(
      'gh',
      ['issue', 'view', String(issue.number), '--json', 'number,title,state,body,labels'],
      { cwd: projectRoot, timeout: 30_000 },
    );
    if (issueResult.ok) {
      try {
        const parsed = JSON.parse(issueResult.stdout);
        if (!Number.isInteger(parsed.number) || parsed.number <= 0) {
          gaps.push('GitHub issue response malformed: missing positive issue number');
        } else {
          const coordination = collectCoordination(projectRoot, parsed, adapters, gaps);
          issue = {
            number: parsed.number,
            title: parsed.title ?? null,
            state: parsed.state ?? 'unknown',
            source: issue.source,
            coordination,
          };
        }
      } catch (error) {
        gaps.push(`GitHub issue response malformed: ${boundedMessage(error.message)}`);
      }
    } else {
      gaps.push(`GitHub issue unavailable: ${boundedMessage(commandFailure(issueResult))}`);
    }
  }
  return { issue, pullRequest };
}

export function collectEvidence(projectPath, adapterOverrides = {}) {
  const adapters = createAdapters(adapterOverrides);
  const initialRoot = path.resolve(projectPath);
  const rootResult = adapters.run('git', ['rev-parse', '--show-toplevel'], { cwd: initialRoot });
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

  const diffResult = adapters.run('git', ['diff', '--name-only', 'main...HEAD'], { cwd: projectRoot });
  const commitResult = adapters.run('git', ['log', '--format=%H%x09%s', 'main..HEAD'], { cwd: projectRoot });
  const branchPaths = diffResult.ok
    ? diffResult.stdout.split(/\r?\n/).filter(Boolean)
    : [];
  if (!diffResult.ok && branch !== 'main') {
    gaps.push(`base-relative git evidence unavailable: ${boundedMessage(commandFailure(diffResult))}`);
  }
  const baseRelativeCommits = commitResult.ok
    ? commitResult.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
      const [sha, ...subject] = line.split('\t');
      return { sha, subject: subject.join('\t') };
    })
    : [];
  if (!commitResult.ok && branch !== 'main') {
    gaps.push(`base-relative commit evidence unavailable: ${boundedMessage(commandFailure(commitResult))}`);
  }

  const changedPaths = [...new Set([...branchPaths, ...worktreePaths])].sort();
  const implementationPaths = changedPaths.filter(isImplementationPath);
  const untrackedImplementationPaths = statusLines
    .filter((line) => line.startsWith('?? '))
    .map(parseStatusPath)
    .filter(isImplementationPath);
  const github = collectGithub(projectRoot, branch, issueNumber, adapters, gaps);
  let featureDir = null;
  try {
    featureDir = findFeatureDir(
      path.join(projectRoot, 'specs'),
      github.issue?.number ?? issueNumber,
      branchContext?.slug,
      adapters,
    );
  } catch (error) {
    gaps.push(`spec evidence unavailable: ${boundedMessage(error.message)}`);
  }
  let spec = null;
  if (featureDir) {
    try {
      const missingFiles = checkRequiredSpecFiles(featureDir, adapters);
      spec = {
        path: path.relative(projectRoot, featureDir),
        complete: missingFiles.length === 0,
        missingFiles,
      };
    } catch (error) {
      gaps.push(`spec evidence unavailable: ${boundedMessage(error.message)}`);
    }
  }

  const verification = collectVerification(
    projectRoot,
    spec,
    untrackedImplementationPaths,
    adapters,
    gaps,
  );
  return {
    project: {
      root: projectRoot,
      branch,
      dirty: statusLines.length > 0,
      changedPaths,
      implementationPaths,
      baseRelativeCommits,
    },
    issue: github.issue,
    spec,
    verification,
    pullRequest: github.pullRequest,
    gaps,
  };
}

function phaseCommand(name, issueNumber) {
  return issueNumber ? `$nmg-sdlc:${name} #${issueNumber}` : `$nmg-sdlc:${name}`;
}

function artifactSummary(evidence, stage) {
  const completed = [];
  const verificationCurrent = evidence.verification?.status === 'pass'
    && evidence.verification.current === true;
  if (evidence.issue?.number && evidence.project.branch !== 'main') completed.push('issue branch');
  if (evidence.spec?.complete) completed.push('spec package');
  if (evidence.project.implementationPaths.length > 0) completed.push('implementation');
  if (verificationCurrent) completed.push('verification');
  if (evidence.pullRequest) completed.push('pull request');
  if (stage === 'complete') completed.push('merged delivery');

  const missing = [];
  if (!evidence.issue?.number && evidence.project.branch === 'main') missing.push('issue branch');
  if (!evidence.spec?.complete) missing.push('spec package');
  if (evidence.project.implementationPaths.length === 0) missing.push('implementation');
  if (!verificationCurrent) missing.push('verification');
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
  let stage;
  let nextAction;

  if (prState === 'MERGED') {
    stage = 'complete';
    nextAction = {
      command: '$nmg-sdlc:start-issue',
      reason: 'The pull request is merged; the delivery lifecycle is complete.',
      manualRepairRequired: false,
    };
  } else if (prState === 'OPEN') {
    stage = 'pull-request-open';
    if (evidence.pullRequest.checks === 'failing') {
      nextAction = {
        command: `Manual repair: inspect failing checks on PR #${evidence.pullRequest.number}`,
        reason: 'The pull request is open with failing checks.',
        manualRepairRequired: true,
      };
    } else {
      nextAction = {
        command: phaseCommand('address-pr-comments', issueNumber),
        reason: evidence.pullRequest.checks === 'pending'
          ? 'The pull request is open and checks are still pending.'
          : 'The pull request is open; continue the review-cleanup workflow.',
        manualRepairRequired: false,
      };
    }
  } else {
    const issueClosed = String(evidence.issue?.state).toUpperCase() === 'CLOSED';
    if (prState === 'CLOSED') gaps.push('pull request is closed without merged delivery evidence');
    if (issueClosed) {
      gaps.push('issue is closed without a merged pull request');
    }
    if (verificationPass && !implementationPresent) {
      gaps.push('passing verification conflicts with absent implementation paths');
    }

    if (prState === 'CLOSED' || issueClosed) {
      stage = 'unknown';
      nextAction = {
        command: 'Manual repair: reconcile closed lifecycle evidence',
        reason: 'Closed issue or pull-request evidence conflicts with an incomplete delivery lifecycle.',
        manualRepairRequired: true,
      };
    } else if (verificationPass && implementationPresent) {
      stage = 'verified';
      nextAction = {
        command: phaseCommand('open-pr', issueNumber),
        reason: 'Current verification evidence passes and no open pull request exists.',
        manualRepairRequired: false,
      };
    } else if (implementationPresent) {
      stage = 'implemented';
      nextAction = {
        command: phaseCommand('verify-code', issueNumber),
        reason: 'Implementation paths changed, but passing verification evidence is absent.',
        manualRepairRequired: false,
      };
    } else if (evidence.spec?.complete) {
      stage = 'specified';
      nextAction = {
        command: phaseCommand('write-code', issueNumber),
        reason: 'The matching spec package is complete and implementation evidence is absent.',
        manualRepairRequired: false,
      };
    } else if (issueNumber && evidence.project.branch !== 'main') {
      stage = 'started';
      nextAction = {
        command: phaseCommand('write-spec', issueNumber),
        reason: 'An issue branch is active, but the matching spec package is incomplete or absent.',
        manualRepairRequired: false,
      };
    } else if (evidence.project.branch === 'main' && !issueNumber) {
      stage = 'idle';
      nextAction = {
        command: '$nmg-sdlc:start-issue',
        reason: 'No active issue is present on the base branch.',
        manualRepairRequired: false,
      };
    } else {
      stage = 'unknown';
      nextAction = {
        command: 'Manual repair: inspect lifecycle evidence gaps',
        reason: 'The available evidence does not support a safe lifecycle conclusion.',
        manualRepairRequired: true,
      };
    }
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
    ? `${status.spec.path} (${status.spec.complete ? 'complete' : `missing ${status.spec.missingFiles.join(', ')}`})`
    : 'unknown';
  const verification = status.verification
    ? `${status.verification.status}, ${status.verification.current ? 'current' : 'not current'} (${status.verification.path})`
    : 'unknown';
  const pullRequest = status.pullRequest
    ? `#${status.pullRequest.number} ${status.pullRequest.state} (checks: ${status.pullRequest.checks})`
    : 'unknown';
  const coordination = status.issue?.coordination
    ? `${status.issue.coordination.role} (${status.issue.coordination.identity})${status.issue.coordination.parentNumber ? ` parent #${status.issue.coordination.parentNumber}` : ''}`
    : 'unknown';
  const lines = [
    `SDLC status: ${status.stage}`,
    `Issue: ${issue}`,
    `Coordination: ${coordination}`,
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
  return `${JSON.stringify(status, null, 2)}\n`;
}

function usage() {
  return `Usage: node sdlc-status.mjs --project <repo-root> [--json]\n\nOptions:\n  --project <path>  Git project to inspect\n  --json            Emit schema-versioned JSON only\n  --help            Show this help\n`;
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

const isMainModule = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) process.exitCode = runCli(process.argv.slice(2));
