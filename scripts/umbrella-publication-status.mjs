#!/usr/bin/env node

/**
 * Read-only GitHub semantic classifier for umbrella spec publications.
 *
 * It verifies the exact publication marker and dedicated head ref, inspects
 * closingIssuesReferences, and walks issue close/reopen timeline pages.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const FULL_OID = /^[0-9a-f]{40}$/i;
const SPEC_PATH = /^specs\/[a-z0-9][a-z0-9-]*$/;
const AGGREGATE_PATH = /^specs\/epic-[a-z0-9][a-z0-9-]*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_TIMELINE_PAGES = 10;
const MAX_OUTPUT = 8 * 1024 * 1024;

const QUERY = `
query UmbrellaPublicationStatus(
  $owner: String!
  $name: String!
  $pullRequest: Int!
  $issue: Int!
  $childIssue: Int!
  $cursor: String
) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pullRequest) {
      number
      state
      merged
      mergedAt
      url
      baseRefName
      headRefName
      headRefOid
      body
      closingIssuesReferences(first: 100) {
        nodes {
          number
          repository { nameWithOwner }
        }
        pageInfo { hasNextPage }
      }
    }
    issue(number: $issue) {
      number
      state
      url
      timelineItems(first: 100, after: $cursor, itemTypes: [CLOSED_EVENT, REOPENED_EVENT]) {
        nodes {
          __typename
          ... on ClosedEvent {
            createdAt
            actor { login }
            closer {
              __typename
              ... on PullRequest {
                number
                url
                repository { nameWithOwner }
              }
            }
          }
          ... on ReopenedEvent {
            createdAt
            actor { login }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
    childIssue: issue(number: $childIssue) {
      number
      state
      url
    }
  }
}`;

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: options.timeout ?? 30_000,
    maxBuffer: MAX_OUTPUT,
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
  return { run: overrides.run ?? defaultRun };
}

function bounded(value) {
  const message = String(value ?? '').replace(/\s+/g, ' ').trim();
  return message.length > 300 ? `${message.slice(0, 297)}...` : message;
}

function commandFailure(result) {
  return bounded(result.stderr || result.stdout || `exit ${result.status ?? 'unknown'}`);
}

export function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function normalizeSpecPath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll('\\', '/').replace(/\/$/, '');
  if (!SPEC_PATH.test(normalized) || path.posix.normalize(normalized) !== normalized) return null;
  return normalized;
}

export function publicationBranchName(issueNumber, tree) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0 || !FULL_OID.test(tree ?? '')) return null;
  return `nmg-sdlc/spec-publication-${issueNumber}-${tree.toLowerCase().slice(0, 12)}`;
}

export function publicationMarker({ issueNumber, specPath, tree }) {
  const normalized = normalizeSpecPath(specPath);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0 || !normalized || !FULL_OID.test(tree ?? '')) return null;
  return [
    '<!-- nmg-sdlc:umbrella-spec',
    `issue: #${issueNumber}`,
    `path: ${normalized}/`,
    `tree: ${tree.toLowerCase()}`,
    '-->',
  ].join('\n');
}

function stableBundleValue(options) {
  return {
    schemaVersion: 1,
    epicIssue: Number(options.epicIssueNumber),
    aggregatePath: normalizeSpecPath(options.aggregatePath),
    aggregateTree: String(options.aggregateTree ?? '').toLowerCase(),
    childIssue: Number(options.childIssueNumber),
    childSpecPath: normalizeSpecPath(options.childSpecPath),
    childTree: String(options.childTree ?? '').toLowerCase(),
  };
}

export function aggregatePublicationDigest(options) {
  const value = stableBundleValue(options);
  if (!Number.isSafeInteger(value.epicIssue) || value.epicIssue <= 0
    || !Number.isSafeInteger(value.childIssue) || value.childIssue <= 0
    || !value.aggregatePath || !AGGREGATE_PATH.test(value.aggregatePath)
    || !value.childSpecPath || value.childSpecPath === value.aggregatePath
    || !FULL_OID.test(value.aggregateTree) || !FULL_OID.test(value.childTree)) return null;
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function aggregatePublicationBranchName(options) {
  const digest = aggregatePublicationDigest(options);
  return digest
    ? `nmg-sdlc/spec-publication-${Number(options.epicIssueNumber)}-${Number(options.childIssueNumber)}-${digest.slice(0, 12)}`
    : null;
}

export function aggregatePublicationMarker(options) {
  const value = stableBundleValue(options);
  const digest = aggregatePublicationDigest(options);
  if (!digest) return null;
  return [
    '<!-- nmg-sdlc:aggregate-child-spec',
    `epic: #${value.epicIssue}`,
    `aggregate: ${value.aggregatePath}/`,
    `aggregate-tree: ${value.aggregateTree}`,
    `child: #${value.childIssue}`,
    `child-spec: ${value.childSpecPath}/`,
    `child-tree: ${value.childTree}`,
    `digest: ${digest}`,
    '-->',
  ].join('\n');
}

const MARKER_PATTERNS = {
  'aggregate-child': /<!-- nmg-sdlc:aggregate-child-spec\s+[\s\S]*?-->/g,
  umbrella: /<!-- nmg-sdlc:umbrella-spec\s+[\s\S]*?-->/g,
};

function markerCount(body, kind) {
  const source = String(body ?? '');
  const counts = Object.fromEntries(Object.entries(MARKER_PATTERNS)
    .map(([name, pattern]) => [name, [...source.matchAll(pattern)].length]));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const expectedKind = kind === 'aggregate-child' ? 'aggregate-child' : 'umbrella';
  return counts[expectedKind] === 1 && total === 1 ? 1 : total;
}

function result(status, reasonCode, expected, evidence = {}, gaps = []) {
  return {
    status,
    reasonCode,
    repository: expected.repository,
    issueNumber: expected.issueNumber,
    pullRequestNumber: expected.pullRequestNumber,
    expectedHead: expected.head,
    expectedBase: expected.base,
    specPath: expected.specPath,
    tree: expected.tree,
    sourceCommit: expected.sourceCommit,
    publicationKind: expected.kind,
    epicIssueNumber: expected.epicIssueNumber ?? null,
    childIssueNumber: expected.childIssueNumber ?? null,
    aggregatePath: expected.aggregatePath ?? null,
    aggregateTree: expected.aggregateTree ?? null,
    childSpecPath: expected.childSpecPath ?? null,
    childTree: expected.childTree ?? null,
    bundleDigest: expected.bundleDigest ?? null,
    evidence,
    gaps,
  };
}

function invalid(reasonCode, expected, gaps, evidence = {}) {
  return result('unverifiable', reasonCode, expected, evidence, gaps);
}

function normalizeExpected(options) {
  if (options.aggregatePath || options.childSpecPath) {
    const epicIssueNumber = typeof options.epicIssueNumber === 'number'
      ? options.epicIssueNumber
      : parsePositiveInteger(String(options.epicIssueNumber ?? ''));
    const childIssueNumber = typeof options.childIssueNumber === 'number'
      ? options.childIssueNumber
      : parsePositiveInteger(String(options.childIssueNumber ?? ''));
    const aggregatePath = normalizeSpecPath(options.aggregatePath);
    const childSpecPath = normalizeSpecPath(options.childSpecPath);
    const aggregateTree = String(options.aggregateTree ?? '').toLowerCase();
    const childTree = String(options.childTree ?? '').toLowerCase();
    const bundleOptions = {
      epicIssueNumber,
      aggregatePath,
      aggregateTree,
      childIssueNumber,
      childSpecPath,
      childTree,
    };
    const bundleDigest = aggregatePublicationDigest(bundleOptions);
    return {
      kind: 'aggregate-child',
      repository: typeof options.repository === 'string' ? options.repository.trim() : '',
      issueNumber: epicIssueNumber,
      epicIssueNumber,
      childIssueNumber,
      pullRequestNumber: typeof options.pullRequestNumber === 'number'
        ? options.pullRequestNumber
        : parsePositiveInteger(String(options.pullRequestNumber ?? '')),
      specPath: childSpecPath,
      tree: childTree,
      aggregatePath,
      aggregateTree,
      childSpecPath,
      childTree,
      bundleDigest,
      sourceCommit: String(options.sourceCommit ?? '').toLowerCase(),
      base: typeof options.base === 'string' ? options.base.trim() : '',
      head: aggregatePublicationBranchName(bundleOptions),
    };
  }
  const repository = typeof options.repository === 'string' ? options.repository.trim() : '';
  const issueNumber = typeof options.issueNumber === 'number'
    ? options.issueNumber
    : parsePositiveInteger(String(options.issueNumber ?? ''));
  const pullRequestNumber = typeof options.pullRequestNumber === 'number'
    ? options.pullRequestNumber
    : parsePositiveInteger(String(options.pullRequestNumber ?? ''));
  const specPath = normalizeSpecPath(options.specPath);
  const tree = String(options.tree ?? '').toLowerCase();
  const sourceCommit = String(options.sourceCommit ?? '').toLowerCase();
  const base = typeof options.base === 'string' ? options.base.trim() : '';
  const head = publicationBranchName(issueNumber, tree);
  return { kind: 'legacy', repository, issueNumber, pullRequestNumber, specPath, tree, sourceCommit, base, head };
}

function validateExpected(expected) {
  const gaps = [];
  if (!REPOSITORY.test(expected.repository)) gaps.push('repository must be owner/name');
  if (!Number.isSafeInteger(expected.issueNumber) || expected.issueNumber <= 0) gaps.push('issue must be a positive integer');
  if (!Number.isSafeInteger(expected.pullRequestNumber) || expected.pullRequestNumber <= 0) gaps.push('pull request must be a positive integer');
  if (expected.kind === 'aggregate-child') {
    if (!expected.aggregatePath || !AGGREGATE_PATH.test(expected.aggregatePath)) gaps.push('aggregate must be a normalized specs/epic-<slug> path');
    if (!expected.childSpecPath || expected.childSpecPath === expected.aggregatePath) {
      gaps.push('child spec must be a normalized executable child or distinct nested epic aggregate path');
    }
    if (!Number.isSafeInteger(expected.childIssueNumber) || expected.childIssueNumber <= 0) gaps.push('child issue must be a positive integer');
    if (!FULL_OID.test(expected.aggregateTree)) gaps.push('aggregate tree must be a full 40-character Git object ID');
    if (!FULL_OID.test(expected.childTree)) gaps.push('child tree must be a full 40-character Git object ID');
    if (!expected.bundleDigest) gaps.push('aggregate/child publication identity is invalid');
  } else {
    if (!expected.specPath) gaps.push('spec must be a normalized specs/<slug> path');
    if (!FULL_OID.test(expected.tree)) gaps.push('tree must be a full 40-character Git object ID');
  }
  if (!FULL_OID.test(expected.sourceCommit)) gaps.push('source must be a full 40-character Git commit ID');
  if (!/^[A-Za-z0-9._/-]+$/.test(expected.base) || expected.base.startsWith('/') || expected.base.includes('..')) {
    gaps.push('base must be a normalized branch name');
  }
  return gaps;
}

function collectionNodes(value) {
  return Array.isArray(value?.nodes) ? value.nodes : [];
}

function sameRepository(value, expected) {
  return String(value ?? '').toLowerCase() === expected.toLowerCase();
}

export function classifyPublicationEvidence(options, payload) {
  const expected = normalizeExpected(options);
  const inputGaps = validateExpected(expected);
  if (inputGaps.length > 0) return invalid('invalid_input', expected, inputGaps);

  const repository = payload?.repository;
  const pullRequest = repository?.pullRequest;
  const issue = repository?.issue;
  const childIssue = repository?.childIssue;
  if (!pullRequest || !issue || (expected.kind === 'aggregate-child' && !childIssue)) {
    return invalid('github_object_missing', expected, ['pull request or issue was not returned']);
  }

  const evidence = {
    pullRequestUrl: pullRequest.url ?? null,
    pullRequestState: String(pullRequest.state ?? 'UNKNOWN').toUpperCase(),
    mergedAt: pullRequest.mergedAt ?? null,
    headRefName: pullRequest.headRefName ?? null,
    headRefOid: pullRequest.headRefOid ?? null,
    baseRefName: pullRequest.baseRefName ?? null,
    issueUrl: issue.url ?? null,
    issueState: String(issue.state ?? 'UNKNOWN').toUpperCase(),
    childIssueUrl: childIssue?.url ?? null,
    childIssueState: childIssue ? String(childIssue.state ?? 'UNKNOWN').toUpperCase() : null,
    closingIssueNumbers: [],
    timelineEvents: [],
    publicationClosedEvents: [],
    otherClosedEvents: [],
    activeClosure: null,
    dedicatedHead: pullRequest.headRefName === expected.head,
    recovered: false,
  };
  const gaps = [];
  if (pullRequest.number !== expected.pullRequestNumber) gaps.push('pull request number does not match');
  if (issue.number !== expected.issueNumber) gaps.push('issue number does not match');
  if (pullRequest.baseRefName !== expected.base) gaps.push(`base ref is ${pullRequest.baseRefName ?? 'missing'}, expected ${expected.base}`);
  if (String(pullRequest.headRefOid ?? '').toLowerCase() !== expected.sourceCommit) gaps.push('head commit does not match the validated seal commit');
  const marker = expected.kind === 'aggregate-child'
    ? aggregatePublicationMarker(expected)
    : publicationMarker(expected);
  if (markerCount(pullRequest.body, expected.kind) !== 1 || !String(pullRequest.body ?? '').includes(marker)) {
    gaps.push(expected.kind === 'aggregate-child'
      ? 'pull request body does not contain exactly one expected aggregate/child marker'
      : 'pull request body does not contain exactly one expected umbrella marker');
  }

  const closing = pullRequest.closingIssuesReferences;
  if (!closing || !Array.isArray(closing.nodes) || closing.pageInfo?.hasNextPage) {
    gaps.push('closing issue references are missing or truncated');
  } else {
    evidence.closingIssueNumbers = closing.nodes
      .filter((candidate) => sameRepository(candidate?.repository?.nameWithOwner, expected.repository))
      .map((candidate) => candidate?.number)
      .filter((number) => Number.isSafeInteger(number) && number > 0)
      .sort((left, right) => left - right);
  }
  if (expected.kind === 'aggregate-child') {
    if (childIssue.number !== expected.childIssueNumber) gaps.push('child issue number does not match');
    if (evidence.childIssueState !== 'OPEN') gaps.push('spec publication requires the child issue to remain open');
  }

  const timeline = issue.timelineItems;
  if (!timeline || !Array.isArray(timeline.nodes) || timeline.pageInfo?.hasNextPage) {
    gaps.push('issue close/reopen timeline is missing or truncated');
  } else {
    for (const [index, event] of timeline.nodes.entries()) {
      if (!['ClosedEvent', 'ReopenedEvent'].includes(event?.__typename)) continue;
      const item = {
        type: event.__typename,
        index,
        createdAt: event.createdAt ?? null,
        actor: event.actor?.login ?? null,
        closerType: event.closer?.__typename ?? null,
        closerNumber: event.closer?.number ?? null,
        closerUrl: event.closer?.url ?? null,
        closerRepository: event.closer?.repository?.nameWithOwner ?? null,
      };
      const publicationCloser = item.closerType === 'PullRequest'
        && item.closerNumber === expected.pullRequestNumber
        && sameRepository(item.closerRepository, expected.repository);
      item.publicationCloser = publicationCloser;
      evidence.timelineEvents.push(item);
      if (item.type === 'ClosedEvent') {
        (publicationCloser ? evidence.publicationClosedEvents : evidence.otherClosedEvents).push(item);
      }
    }
  }
  if (gaps.length > 0) return invalid('evidence_mismatch', expected, gaps, evidence);

  evidence.timelineEvents.sort((left, right) => {
    const chronological = String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? ''));
    return chronological || left.index - right.index;
  });
  for (const event of evidence.timelineEvents) {
    if (event.type === 'ReopenedEvent') evidence.activeClosure = null;
    else if (event.type === 'ClosedEvent') evidence.activeClosure = event;
  }

  const closesUmbrella = evidence.closingIssueNumbers.includes(expected.issueNumber);
  const closesChild = expected.kind === 'aggregate-child'
    && evidence.closingIssueNumbers.includes(expected.childIssueNumber);
  const publicationClosed = evidence.activeClosure?.publicationCloser === true;
  const merged = pullRequest.merged === true || evidence.pullRequestState === 'MERGED';

  if (evidence.issueState === 'OPEN' && evidence.activeClosure !== null) {
    return invalid('issue_state_timeline_mismatch', expected, [
      'issue is open but the latest close/reopen timeline event is a closure',
    ], evidence);
  }

  if (!merged && evidence.pullRequestState === 'OPEN') {
    if (evidence.issueState !== 'OPEN') {
      return result('closed_unrelated', 'umbrella_closed_before_publication_merge', expected, evidence);
    }
    if (closesUmbrella || closesChild) {
      return result(
        'closing_relationship',
        closesUmbrella ? 'publication_pr_closes_umbrella' : 'publication_pr_closes_child',
        expected,
        evidence,
      );
    }
    if (!evidence.dedicatedHead) {
      return invalid('open_pr_uses_issue_linked_or_unexpected_head', expected, [
        `head ref is ${evidence.headRefName ?? 'missing'}, expected ${expected.head}`,
      ], evidence);
    }
    return result('pending_safe', 'publication_pr_non_closing', expected, evidence);
  }

  if (merged) {
    if (publicationClosed && evidence.issueState === 'CLOSED') {
      return result('publication_closed_umbrella', 'publication_pr_closed_umbrella', expected, evidence);
    }
    if (!publicationClosed && evidence.issueState === 'OPEN' && evidence.publicationClosedEvents.length > 0) {
      evidence.recovered = true;
      return result('merged_safe', 'publication_closure_recovered', expected, evidence);
    }
    if (evidence.issueState === 'CLOSED') {
      return result('closed_unrelated', 'umbrella_closed_by_other_cause', expected, evidence);
    }
    if (closesUmbrella || closesChild) {
      return result('closing_relationship', 'merged_pr_retains_unexplained_closing_relationship', expected, evidence);
    }
    return result(
      'merged_safe',
      expected.kind === 'aggregate-child'
        ? 'publication_merged_epic_and_child_open'
        : evidence.dedicatedHead ? 'publication_merged_umbrella_open' : 'legacy_publication_merged_umbrella_open',
      expected,
      evidence,
    );
  }

  return invalid('publication_pr_not_open_or_merged', expected, [
    `pull request state is ${evidence.pullRequestState}`,
  ], evidence);
}

function graphqlArgs(expected, cursor) {
  const [owner, name] = expected.repository.split('/');
  const args = [
    'api', 'graphql',
    '-f', `query=${QUERY}`,
    '-F', `owner=${owner}`,
    '-F', `name=${name}`,
    '-F', `pullRequest=${expected.pullRequestNumber}`,
    '-F', `issue=${expected.issueNumber}`,
    '-F', `childIssue=${expected.childIssueNumber ?? expected.issueNumber}`,
  ];
  if (cursor) args.push('-F', `cursor=${cursor}`);
  return args;
}

export function inspectUmbrellaPublication(options, adapters = createAdapters()) {
  const expected = normalizeExpected(options);
  const inputGaps = validateExpected(expected);
  if (inputGaps.length > 0) return invalid('invalid_input', expected, inputGaps);

  const timelineNodes = [];
  let cursor = null;
  let firstRepository = null;
  for (let page = 0; page < MAX_TIMELINE_PAGES; page += 1) {
    const query = adapters.run('gh', graphqlArgs(expected, cursor), {
      cwd: options.projectRoot,
      timeout: 30_000,
    });
    if (!query.ok) {
      return invalid('github_query_failed', expected, [commandFailure(query)]);
    }
    let payload;
    try {
      payload = JSON.parse(query.stdout);
    } catch (error) {
      return invalid('github_response_invalid', expected, [bounded(error.message)]);
    }
    const repository = payload?.data?.repository;
    if (!repository) return invalid('github_repository_missing', expected, ['repository was not returned']);
    if (!firstRepository) firstRepository = repository;
    const timeline = repository.issue?.timelineItems;
    timelineNodes.push(...collectionNodes(timeline));
    if (!timeline?.pageInfo?.hasNextPage) {
      firstRepository.issue.timelineItems = {
        nodes: timelineNodes,
        pageInfo: { hasNextPage: false, endCursor: timeline?.pageInfo?.endCursor ?? null },
      };
      return classifyPublicationEvidence(expected, { repository: firstRepository });
    }
    cursor = timeline.pageInfo.endCursor;
    if (!cursor) return invalid('timeline_cursor_missing', expected, ['timeline has another page but no end cursor']);
  }
  return invalid('timeline_page_limit_exceeded', expected, [`more than ${MAX_TIMELINE_PAGES * 100} close/reopen timeline nodes`]);
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string' },
      repository: { type: 'string' },
      issue: { type: 'string' },
      epic: { type: 'string' },
      child: { type: 'string' },
      pr: { type: 'string' },
      spec: { type: 'string' },
      tree: { type: 'string' },
      aggregate: { type: 'string' },
      'aggregate-tree': { type: 'string' },
      'child-spec': { type: 'string' },
      'child-tree': { type: 'string' },
      source: { type: 'string' },
      base: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  for (const key of ['project', 'repository', 'pr', 'source', 'base']) {
    if (!values[key]) throw new Error(`--${key} is required`);
  }
  if (!values.json) throw new Error('--json is required');
  const aggregateMode = Boolean(
    values.epic || values.child || values.aggregate || values['aggregate-tree']
    || values['child-spec'] || values['child-tree'],
  );
  if (aggregateMode) {
    for (const key of ['epic', 'child', 'aggregate', 'aggregate-tree', 'child-spec', 'child-tree']) {
      if (!values[key]) throw new Error(`--${key} is required for aggregate/child publication`);
    }
    if (values.issue || values.spec || values.tree) {
      throw new Error('--issue, --spec, and --tree are legacy publication options and cannot be combined with aggregate/child publication');
    }
    return {
      projectRoot: path.resolve(values.project),
      repository: values.repository,
      epicIssueNumber: parsePositiveInteger(values.epic),
      childIssueNumber: parsePositiveInteger(values.child),
      pullRequestNumber: parsePositiveInteger(values.pr),
      aggregatePath: values.aggregate,
      aggregateTree: values['aggregate-tree'],
      childSpecPath: values['child-spec'],
      childTree: values['child-tree'],
      sourceCommit: values.source,
      base: values.base,
    };
  }
  for (const key of ['issue', 'spec', 'tree']) {
    if (!values[key]) throw new Error(`--${key} is required`);
  }
  return {
    projectRoot: path.resolve(values.project),
    repository: values.repository,
    issueNumber: parsePositiveInteger(values.issue),
    pullRequestNumber: parsePositiveInteger(values.pr),
    specPath: values.spec,
    tree: values.tree,
    sourceCommit: values.source,
    base: values.base,
  };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/umbrella-publication-status.mjs --project <path> --repository <owner/name> --issue <N> --pr <N> --spec <specs/slug> --tree <oid> --source <commit> --base <branch> --json',
    '  node scripts/umbrella-publication-status.mjs --project <path> --repository <owner/name> --epic <N> --child <N> --pr <N> --aggregate <specs/epic-slug> --aggregate-tree <oid> --child-spec <specs/child-slug> --child-tree <oid> --source <commit> --base <branch> --json',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Argument error: ${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(inspectUmbrellaPublication(options), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
