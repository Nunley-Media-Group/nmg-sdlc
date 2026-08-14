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
import {
  inspectDeliverableDependencies,
  parseDeliverableRequirements,
} from './deliverable-dependencies.mjs';
import {
  inspectIssueSpecScope,
  ISSUE_SPEC_MARKDOWN_LIMIT_BYTES,
} from './issue-spec-scope.mjs';
import {
  inspectVerificationReadiness,
  MAX_VERIFICATION_REPORT_BYTES,
} from './verification-readiness.mjs';

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
    .filter((entry) => {
      const entryStat = fsApi.lstatSync(path.join(specsDir, entry));
      return entryStat.isDirectory() && !entryStat.isSymbolicLink();
    })
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
        const requirementsStat = fsApi.lstatSync(requirementsPath);
        if (!requirementsStat.isFile() || requirementsStat.isSymbolicLink()) continue;
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
    if (!fsApi.existsSync(filePath)) return true;
    const fileStat = fsApi.lstatSync(filePath);
    return !fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size === 0;
  });
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJson(value[key])]),
    );
  }
  return value;
}

function issueScopeProjection(scope) {
  if (!scope) return null;
  return {
    issueNumber: scope.issueNumber,
    specPath: scope.specPath,
    status: scope.status,
    delivery: scope.delivery,
    regression: scope.regression,
  };
}

function verifyReportScope(content, scope) {
  if (!['scoped', 'implicit_single_issue'].includes(scope?.status)) return { required: false, match: null };
  const marker = String(content).match(/^<!-- nmg-sdlc-issue-scope: (\{.*\}) -->\s*$/m)?.[1];
  if (!marker) return { required: true, match: false, gap: 'verification report lacks active issue scope evidence' };
  try {
    const actual = stableJson(JSON.parse(marker));
    const expected = stableJson(issueScopeProjection(scope));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      return { required: true, match: false, gap: 'verification report issue scope does not match the active issue' };
    }
    return { required: true, match: true };
  } catch (error) {
    return {
      required: true,
      match: false,
      gap: `verification report issue scope is invalid JSON: ${boundedMessage(error.message)}`,
    };
  }
}

function collectVerification(projectRoot, spec, pullRequest, untrackedImplementationPaths, adapters, gaps) {
  if (!spec) return null;
  const reportPath = path.join(projectRoot, spec.path, 'verification-report.md');
  if (!adapters.fs.existsSync(reportPath)) return null;
  const relativeReportPath = toGitPath(path.relative(projectRoot, reportPath));
  try {
    const reportStat = adapters.fs.lstatSync(reportPath);
    if (!reportStat.isFile() || reportStat.isSymbolicLink()) {
      gaps.push('verification report must be a regular file and not a symbolic link');
      return {
        path: relativeReportPath,
        status: 'unknown',
        current: false,
        commit: null,
        scopeMatch: null,
      };
    }
    const content = readBounded(adapters.fs, reportPath, MAX_VERIFICATION_REPORT_BYTES);
    const readiness = inspectVerificationReadiness({
      content,
      options: {
        expectedIssueNumber: spec.scope?.issueNumber,
        expectedSpecPath: spec.path,
        expectedScope: spec.scope,
        expectedHeadSha: pullRequest?.headRefOid ?? undefined,
      },
    });
    const status = readiness.implementationStatus ?? 'unknown';
    const verification = {
      path: relativeReportPath,
      status,
      readinessStatus: readiness.status,
      readiness: readiness.readiness,
      current: false,
      commit: null,
      scopeMatch: null,
    };
    const scopeEvidence = verifyReportScope(content, spec.scope);
    verification.scopeMatch = scopeEvidence.match;
    if (scopeEvidence.required && !scopeEvidence.match) {
      gaps.push(scopeEvidence.gap);
      return verification;
    }
    if (['blocked', 'unverifiable'].includes(readiness.status)) {
      for (const gap of readiness.gaps) gaps.push(`verification readiness: ${gap}`);
      return verification;
    }
    if (readiness.status === 'pr_evidence_satisfied' && !pullRequest?.headRefOid) {
      verification.readinessStatus = 'unverifiable';
      gaps.push('verification readiness: satisfied PR evidence has no matching pull-request head');
      return verification;
    }

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
    return {
      path: relativeReportPath,
      status: 'unknown',
      current: false,
      commit: null,
      scopeMatch: null,
    };
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
  labels(first: 100) {
    nodes { name }
    pageInfo { hasNextPage endCursor }
  }
  subIssues(first: 100) {
    nodes { number state }
    pageInfo { hasNextPage endCursor }
  }
`;

const MAX_COORDINATION_TARGETS = 100;
const MAX_FALLBACK_TARGETS = 8;
const MAX_CONNECTION_PAGES = 10;
const MAX_HYDRATION_REQUESTS = 40;
const MAX_DELIVERABLE_REQUESTS = 60;

function markCoordinationUnverifiable(result, message, nativeAuthority = 'incomplete') {
  return {
    ...result,
    role: 'unverifiable',
    identity: 'unverifiable',
    consistency: 'unverifiable',
    nativeAuthority,
    degraded: true,
    gaps: [...result.gaps, message],
  };
}

function hydrateConnectionPages(projectRoot, owner, name, issue, connection, adapters, budget) {
  const fields = connection === 'labels' ? 'nodes { name }' : 'nodes { number state }';
  for (let page = 0; issue?.[connection]?.pageInfo?.hasNextPage === true; page += 1) {
    const cursor = issue[connection].pageInfo.endCursor;
    if (page >= MAX_CONNECTION_PAGES || typeof cursor !== 'string' || !cursor) {
      return { ok: false, reason: `${connection} pagination exceeded its safe bound or lacked an end cursor` };
    }
    if (budget.remaining <= 0) {
      return { ok: false, reason: 'pagination request budget exhausted' };
    }
    budget.remaining -= 1;
    const query = `query($owner: String!, $name: String!, $cursor: String!) {
      repository(owner: $owner, name: $name) {
        issue(number: ${issue.number}) {
          ${connection}(first: 100, after: $cursor) {
            ${fields}
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }`;
    const response = adapters.run(
      'gh',
      ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-f', `cursor=${cursor}`],
      { cwd: projectRoot, timeout: 30_000 },
    );
    if (!response.ok) return { ok: false, reason: commandFailure(response) };
    try {
      const next = JSON.parse(response.stdout)?.data?.repository?.issue?.[connection];
      if (!next || !Array.isArray(next.nodes) || !next.pageInfo) {
        return { ok: false, reason: `${connection} pagination response was malformed` };
      }
      issue[connection].nodes.push(...next.nodes);
      issue[connection].pageInfo = next.pageInfo;
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }
  return { ok: true };
}

function hydrateGraphConnections(projectRoot, owner, name, issues, adapters) {
  const unique = new Map();
  const budget = { remaining: MAX_HYDRATION_REQUESTS };
  for (const issue of issues) {
    if (Number.isInteger(issue?.number) && !unique.has(issue.number)) unique.set(issue.number, issue);
  }
  for (const issue of unique.values()) {
    const labels = hydrateConnectionPages(projectRoot, owner, name, issue, 'labels', adapters, budget);
    if (!labels.ok) return { ok: false, reason: `issue #${issue.number} labels: ${labels.reason}` };
  }
  for (const issue of unique.values()) {
    const subIssues = hydrateConnectionPages(projectRoot, owner, name, issue, 'subIssues', adapters, budget);
    if (!subIssues.ok) return { ok: false, reason: `issue #${issue.number} sub-issues: ${subIssues.reason}` };
  }
  return { ok: true, issues: [...unique.values()] };
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
            const hydration = hydrateGraphConnections(
              projectRoot,
              owner,
              name,
              graphIssues,
              adapters,
            );
            const result = classifyEpicRelationships({
              issues: hydration.issues ?? graphIssues,
              activeIssueNumber: activeIssue.number,
              nativeAvailable: true,
            });
            if (hydration.ok) return result;
            const message = `GitHub relationship pagination is incomplete: ${boundedMessage(hydration.reason)}`;
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

function collectDeliverableDependencies(projectRoot, activeIssue, coordination, adapters, gaps) {
  const parsed = parseDeliverableRequirements(activeIssue?.body);
  const relationshipEvidenceComplete = coordination !== null
    && !['inconsistent', 'ambiguous', 'unverifiable'].includes(coordination?.role)
    && coordination?.nativeAuthority !== 'incomplete';
  if (parsed.requirements.length === 0 || parsed.gaps.length > 0) {
    return inspectDeliverableDependencies({
      issueNumber: activeIssue?.number,
      body: activeIssue?.body,
      defaultBranch: parsed.requirements.length === 0 ? null : undefined,
      targets: [],
      executionDependencies: coordination?.executionDependencies ?? [],
      relationshipEvidenceComplete,
    });
  }

  let nameWithOwner;
  let defaultBranch;
  try {
    const repoResult = adapters.run(
      'gh',
      ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'],
      { cwd: projectRoot, timeout: 30_000 },
    );
    if (!repoResult.ok) {
      gaps.push(`GitHub repository unavailable for deliverable dependencies: ${boundedMessage(commandFailure(repoResult))}`);
    } else {
      const repository = JSON.parse(repoResult.stdout);
      nameWithOwner = repository?.nameWithOwner;
      defaultBranch = repository?.defaultBranchRef?.name;
    }
  } catch (error) {
    gaps.push(`GitHub repository metadata malformed for deliverable dependencies: ${boundedMessage(error.message)}`);
  }

  const [owner, name, extra] = String(nameWithOwner ?? '').split('/');
  const ownerNumbers = [...new Set(parsed.requirements.map((requirement) => requirement.ownerIssue))]
    .sort((left, right) => left - right);
  const targets = [];
  if (owner && name && !extra && defaultBranch) {
    const aliases = ownerNumbers.map((number) => `
      target${number}: issue(number: ${number}) {
        number
        state
        closedByPullRequestsReferences(first: 100) { ${CLOSING_PULL_REQUEST_FIELDS} }
      }
    `).join('\n');
    const query = `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) { ${aliases} }
    }`;
    const graphResult = adapters.run(
      'gh',
      ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`],
      { cwd: projectRoot, timeout: 30_000 },
    );
    if (!graphResult.ok) {
      gaps.push(`GitHub deliverable metadata unavailable: ${boundedMessage(commandFailure(graphResult))}`);
    } else {
      try {
        const repository = JSON.parse(graphResult.stdout)?.data?.repository;
        for (const number of ownerNumbers) {
          const target = repository?.[`target${number}`];
          if (target) targets.push(target);
        }
      } catch (error) {
        gaps.push(`GitHub deliverable metadata malformed: ${boundedMessage(error.message)}`);
      }
    }
  }

  let remainingRequests = MAX_DELIVERABLE_REQUESTS;
  for (const target of targets) {
    const closingPullRequests = target.closedByPullRequestsReferences;
    for (let page = 0; closingPullRequests?.pageInfo?.hasNextPage === true; page += 1) {
      const cursor = closingPullRequests.pageInfo.endCursor;
      if (page >= MAX_CONNECTION_PAGES || remainingRequests <= 0 || typeof cursor !== 'string' || !cursor) {
        gaps.push(`issue #${target.number} closing pull-request pagination exceeded its safe bound or request budget`);
        break;
      }
      remainingRequests -= 1;
      const query = `query($owner: String!, $name: String!, $cursor: String!) {
        repository(owner: $owner, name: $name) {
          issue(number: ${target.number}) {
            closedByPullRequestsReferences(first: 100, after: $cursor) { ${CLOSING_PULL_REQUEST_FIELDS} }
          }
        }
      }`;
      const nextResult = adapters.run(
        'gh',
        ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-f', `cursor=${cursor}`],
        { cwd: projectRoot, timeout: 30_000 },
      );
      if (!nextResult.ok) {
        gaps.push(`issue #${target.number} closing pull-request pagination failed: ${boundedMessage(commandFailure(nextResult))}`);
        break;
      }
      try {
        const next = JSON.parse(nextResult.stdout)?.data?.repository?.issue?.closedByPullRequestsReferences;
        if (!next || !Array.isArray(next.nodes) || !next.pageInfo) {
          gaps.push(`issue #${target.number} closing pull-request pagination response was malformed`);
          break;
        }
        closingPullRequests.nodes.push(...next.nodes);
        closingPullRequests.pageInfo = next.pageInfo;
      } catch (error) {
        gaps.push(`issue #${target.number} closing pull-request pagination was malformed: ${boundedMessage(error.message)}`);
        break;
      }
    }
  }

  return inspectDeliverableDependencies({
    issueNumber: activeIssue?.number,
    body: activeIssue?.body,
    defaultBranch,
    targets,
    executionDependencies: coordination?.executionDependencies ?? [],
    relationshipEvidenceComplete,
  });
}

function unavailableDeliverableDependencies(issueNumber) {
  return {
    status: 'unverifiable',
    reasonCode: 'deliverable_evidence_unavailable',
    issueNumber,
    defaultBranch: null,
    requirements: [],
    gaps: ['active issue deliverable dependency evidence is unavailable'],
  };
}

function collectGithub(projectRoot, branch, issueNumber, adapters, gaps) {
  let issue = issueNumber
    ? {
      number: issueNumber,
      title: null,
      state: 'unknown',
      source: 'branch',
      coordination: null,
      deliverableDependencies: unavailableDeliverableDependencies(issueNumber),
    }
    : null;
  let pullRequest = null;

  if (branch && branch !== 'main' && branch !== 'HEAD') {
    const prResult = adapters.run(
      'gh',
      ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,state,url,headRefName,headRefOid,isDraft,mergeStateStatus,closingIssuesReferences'],
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
              coordination: null,
              deliverableDependencies: unavailableDeliverableDependencies(closingIssue.number),
            };
          }
          pullRequest = {
            number: pr.number,
            state: pr.state ?? 'unknown',
            url: pr.url ?? null,
            isDraft: typeof pr.isDraft === 'boolean' ? pr.isDraft : null,
            headRefOid: /^[0-9a-f]{40}$/i.test(pr.headRefOid ?? '') ? pr.headRefOid : null,
            mergeStateStatus: pr.mergeStateStatus ?? 'unknown',
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
          const deliverableDependencies = collectDeliverableDependencies(
            projectRoot,
            parsed,
            coordination,
            adapters,
            gaps,
          );
          issue = {
            number: parsed.number,
            title: parsed.title ?? null,
            state: parsed.state ?? 'unknown',
            source: issue.source,
            coordination,
            deliverableDependencies,
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
        path: toGitPath(path.relative(projectRoot, featureDir)),
        complete: missingFiles.length === 0,
        missingFiles,
      };
      const activeIssueNumber = github.issue?.number ?? issueNumber;
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
    } catch (error) {
      gaps.push(`spec evidence unavailable: ${boundedMessage(error.message)}`);
    }
  }

  const verification = collectVerification(
    projectRoot,
    spec,
    github.pullRequest,
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
  const deliveryValidationPending = stage === 'delivery-validation-pending';
  const scopeBlocked = ['repair_required', 'unverifiable'].includes(evidence.spec?.scope?.status);
  const specReady = evidence.spec?.complete && !scopeBlocked;
  if (evidence.issue?.number && evidence.project.branch !== 'main') completed.push('issue branch');
  if (specReady) completed.push('spec package');
  if (evidence.project.implementationPaths.length > 0) completed.push('implementation');
  if (deliveryValidationPending) completed.push('local verification');
  else if (verificationCurrent) completed.push('verification');
  if (evidence.pullRequest) completed.push('pull request');
  if (stage === 'complete') completed.push('merged delivery');

  const missing = [];
  if (!evidence.issue?.number && evidence.project.branch === 'main') missing.push('issue branch');
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
  const readyPrWithPendingVerification = evidence.verification?.current === true
    && evidence.verification.readinessStatus === 'pr_evidence_pending'
    && prState === 'OPEN'
    && evidence.pullRequest?.isDraft === false;
  const scopeStatus = evidence.spec?.scope?.status ?? null;
  const scopeBlocked = ['repair_required', 'unverifiable'].includes(scopeStatus);
  const deliverableStatus = evidence.issue?.deliverableDependencies?.status ?? 'none';
  const deliverableBlocked = ['blocked', 'repair_required', 'unverifiable'].includes(deliverableStatus);
  let stage;
  let nextAction;

  if (deliverableBlocked) {
    const deliverableGaps = evidence.issue.deliverableDependencies.gaps?.length
      ? evidence.issue.deliverableDependencies.gaps.join('; ')
      : evidence.issue.deliverableDependencies.reasonCode;
    gaps.push(`deliverable dependencies ${deliverableStatus}: ${deliverableGaps}`);
    stage = 'blocked';
    nextAction = deliverableStatus === 'repair_required'
      ? {
        command: '$nmg-sdlc:upgrade-project',
        reason: 'The active issue has an unrepresentable or inconsistent cross-child deliverable dependency that requires an approved initialized-project repair.',
        manualRepairRequired: false,
      }
      : {
        command: '$nmg-sdlc:status',
        reason: deliverableStatus === 'blocked'
          ? 'The active issue is waiting for every declared prerequisite to merge through a closing pull request into the repository default branch.'
          : 'Required deliverable dependency evidence is incomplete or unverifiable; restore GitHub evidence before advancing.',
        manualRepairRequired: deliverableStatus === 'unverifiable',
      };
  } else if (scopeBlocked) {
    const scopeGaps = evidence.spec.scope.gaps?.length
      ? evidence.spec.scope.gaps.join('; ')
      : evidence.spec.scope.reasonCode;
    gaps.push(`issue scope ${scopeStatus}: ${scopeGaps}`);
    stage = issueNumber && evidence.project.branch !== 'main' ? 'started' : 'unknown';
    nextAction = {
      command: phaseCommand('write-spec', issueNumber),
      reason: 'The active cumulative spec scope is missing, incomplete, or unverifiable and must be repaired before later lifecycle evidence can advance this issue.',
      manualRepairRequired: false,
    };
  } else if (prState === 'MERGED') {
    stage = 'complete';
    nextAction = {
      command: '$nmg-sdlc:start-issue',
      reason: 'The pull request is merged; the delivery lifecycle is complete.',
      manualRepairRequired: false,
    };
  } else if (readyPrWithPendingVerification) {
    gaps.push('ready pull request conflicts with pending PR-dependent verification');
    stage = 'unknown';
    nextAction = {
      command: `Manual repair: restore controlled draft validation on PR #${evidence.pullRequest.number}`,
      reason: 'A ready pull request cannot be advanced from pending PR-dependent verification evidence.',
      manualRepairRequired: true,
    };
  } else if (deliveryValidationPending) {
    stage = 'delivery-validation-pending';
    nextAction = {
      command: phaseCommand('open-pr', issueNumber),
      reason: evidence.verification.readinessStatus === 'pr_evidence_satisfied'
        ? 'Local and draft-head verification pass, but controlled final-head delivery validation is not complete.'
        : 'Local verification passes and only declared pull-request evidence remains.',
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
  const scope = status.spec?.scope
    ? `${status.spec.scope.status} (delivery: AC ${listOrNone(status.spec.scope.delivery.acceptanceCriteria)}, FR ${listOrNone(status.spec.scope.delivery.functionalRequirements)}, tasks ${listOrNone(status.spec.scope.delivery.tasks)}, scenarios ${listOrNone(status.spec.scope.delivery.scenarios)}; regression: AC ${listOrNone(status.spec.scope.regression.acceptanceCriteria)}, FR ${listOrNone(status.spec.scope.regression.functionalRequirements)}, scenarios ${listOrNone(status.spec.scope.regression.scenarios)})`
    : 'unknown';
  const verification = status.verification
    ? `${status.verification.status}, ${status.verification.current ? 'current' : 'not current'} (${status.verification.path})`
    : 'unknown';
  const pullRequest = status.pullRequest
    ? `#${status.pullRequest.number} ${status.pullRequest.state} (${status.pullRequest.isDraft === true ? 'draft' : status.pullRequest.isDraft === false ? 'ready' : 'draft state unknown'}, head: ${status.pullRequest.headRefOid ?? 'unknown'}, merge: ${status.pullRequest.mergeStateStatus ?? 'unknown'}, checks: ${status.pullRequest.checks})`
    : 'unknown';
  const coordination = status.issue?.coordination
    ? `${status.issue.coordination.role} (${status.issue.coordination.identity}; consistency: ${status.issue.coordination.consistency}; authority: ${status.issue.coordination.nativeAuthority}; degraded: ${status.issue.coordination.degraded ? 'yes' : 'no'})${status.issue.coordination.parentNumber ? ` parent #${status.issue.coordination.parentNumber}` : ''}`
    : 'unknown';
  const deliverables = status.issue?.deliverableDependencies
    ? `${status.issue.deliverableDependencies.status} (${status.issue.deliverableDependencies.requirements.map((requirement) => `#${requirement.ownerIssue}:${requirement.available ? 'available' : 'unavailable'}`).join(', ') || 'none'})`
    : 'unknown';
  const lines = [
    `SDLC status: ${status.stage}`,
    `Issue: ${issue}`,
    `Coordination: ${coordination}`,
    `Deliverables: ${deliverables}`,
    `Branch: ${status.project.branch} (${status.project.dirty ? 'dirty' : 'clean'})`,
    `Spec: ${spec}`,
    `Scope: ${scope}`,
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
