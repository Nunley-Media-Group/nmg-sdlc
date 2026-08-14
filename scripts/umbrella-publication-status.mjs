#!/usr/bin/env node

/**
 * Read-only GitHub semantic classifier for umbrella spec publications.
 *
 * It verifies the exact publication marker and dedicated head ref, inspects
 * closingIssuesReferences, and walks issue ClosedEvent timeline pages.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const FULL_OID = /^[0-9a-f]{40}$/i;
const SPEC_PATH = /^specs\/[a-z0-9][a-z0-9-]*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_TIMELINE_PAGES = 10;
const MAX_OUTPUT = 8 * 1024 * 1024;

const QUERY = `
query UmbrellaPublicationStatus(
  $owner: String!
  $name: String!
  $pullRequest: Int!
  $issue: Int!
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
      timelineItems(first: 100, after: $cursor, itemTypes: [CLOSED_EVENT]) {
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
        }
        pageInfo { hasNextPage endCursor }
      }
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

function markerCount(body) {
  return [...String(body ?? '').matchAll(/<!-- nmg-sdlc:umbrella-spec\s+[\s\S]*?-->/g)].length;
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
    evidence,
    gaps,
  };
}

function invalid(reasonCode, expected, gaps, evidence = {}) {
  return result('unverifiable', reasonCode, expected, evidence, gaps);
}

function normalizeExpected(options) {
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
  return { repository, issueNumber, pullRequestNumber, specPath, tree, sourceCommit, base, head };
}

function validateExpected(expected) {
  const gaps = [];
  if (!REPOSITORY.test(expected.repository)) gaps.push('repository must be owner/name');
  if (!Number.isSafeInteger(expected.issueNumber) || expected.issueNumber <= 0) gaps.push('issue must be a positive integer');
  if (!Number.isSafeInteger(expected.pullRequestNumber) || expected.pullRequestNumber <= 0) gaps.push('pull request must be a positive integer');
  if (!expected.specPath) gaps.push('spec must be a normalized specs/<slug> path');
  if (!FULL_OID.test(expected.tree)) gaps.push('tree must be a full 40-character Git object ID');
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
  if (!pullRequest || !issue) {
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
    closingIssueNumbers: [],
    publicationClosedEvents: [],
    otherClosedEvents: [],
    dedicatedHead: pullRequest.headRefName === expected.head,
    recovered: false,
  };
  const gaps = [];
  if (pullRequest.number !== expected.pullRequestNumber) gaps.push('pull request number does not match');
  if (issue.number !== expected.issueNumber) gaps.push('issue number does not match');
  if (pullRequest.baseRefName !== expected.base) gaps.push(`base ref is ${pullRequest.baseRefName ?? 'missing'}, expected ${expected.base}`);
  if (String(pullRequest.headRefOid ?? '').toLowerCase() !== expected.sourceCommit) gaps.push('head commit does not match the validated seal commit');
  const marker = publicationMarker(expected);
  if (markerCount(pullRequest.body) !== 1 || !String(pullRequest.body ?? '').includes(marker)) {
    gaps.push('pull request body does not contain exactly one expected umbrella marker');
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

  const timeline = issue.timelineItems;
  if (!timeline || !Array.isArray(timeline.nodes) || timeline.pageInfo?.hasNextPage) {
    gaps.push('issue ClosedEvent timeline is missing or truncated');
  } else {
    for (const event of timeline.nodes) {
      if (event?.__typename !== 'ClosedEvent') continue;
      const item = {
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
      (publicationCloser ? evidence.publicationClosedEvents : evidence.otherClosedEvents).push(item);
    }
  }
  if (gaps.length > 0) return invalid('evidence_mismatch', expected, gaps, evidence);

  const closesUmbrella = evidence.closingIssueNumbers.includes(expected.issueNumber);
  const publicationClosed = evidence.publicationClosedEvents.length > 0;
  const merged = pullRequest.merged === true || evidence.pullRequestState === 'MERGED';

  if (!merged && evidence.pullRequestState === 'OPEN') {
    if (evidence.issueState !== 'OPEN') {
      return result('closed_unrelated', 'umbrella_closed_before_publication_merge', expected, evidence);
    }
    if (closesUmbrella) {
      return result('closing_relationship', 'publication_pr_closes_umbrella', expected, evidence);
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
    if (publicationClosed && evidence.issueState === 'OPEN') {
      evidence.recovered = true;
      return result('merged_safe', 'publication_closure_recovered', expected, evidence);
    }
    if (evidence.issueState === 'CLOSED') {
      return result('closed_unrelated', 'umbrella_closed_by_other_cause', expected, evidence);
    }
    if (closesUmbrella) {
      return result('closing_relationship', 'merged_pr_retains_unexplained_closing_relationship', expected, evidence);
    }
    return result(
      'merged_safe',
      evidence.dedicatedHead ? 'publication_merged_umbrella_open' : 'legacy_publication_merged_umbrella_open',
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
  return invalid('timeline_page_limit_exceeded', expected, [`more than ${MAX_TIMELINE_PAGES * 100} ClosedEvent nodes`]);
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string' },
      repository: { type: 'string' },
      issue: { type: 'string' },
      pr: { type: 'string' },
      spec: { type: 'string' },
      tree: { type: 'string' },
      source: { type: 'string' },
      base: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  for (const key of ['project', 'repository', 'issue', 'pr', 'spec', 'tree', 'source', 'base']) {
    if (!values[key]) throw new Error(`--${key} is required`);
  }
  if (!values.json) throw new Error('--json is required');
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
