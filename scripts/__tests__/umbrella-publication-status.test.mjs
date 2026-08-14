import { describe, expect, test } from '@jest/globals';

import {
  classifyPublicationEvidence,
  inspectUmbrellaPublication,
  publicationBranchName,
  publicationMarker,
} from '../umbrella-publication-status.mjs';

const tree = '1'.repeat(40);
const sourceCommit = '2'.repeat(40);
const options = {
  projectRoot: '/fixture',
  repository: 'example/project',
  issueNumber: 161,
  pullRequestNumber: 200,
  specPath: 'specs/feature-umbrella',
  tree,
  sourceCommit,
  base: 'main',
};

function payload({
  prState = 'OPEN',
  merged = false,
  issueState = 'OPEN',
  closing = [],
  events = [],
  head = publicationBranchName(options.issueNumber, tree),
  body = `Refs #161\n\n${publicationMarker(options)}`,
  closingHasNextPage = false,
  timelineHasNextPage = false,
  timelineEndCursor = null,
} = {}) {
  return {
    repository: {
      pullRequest: {
        number: 200,
        state: prState,
        merged,
        mergedAt: merged ? '2026-08-14T12:00:00Z' : null,
        url: 'https://github.com/example/project/pull/200',
        baseRefName: 'main',
        headRefName: head,
        headRefOid: sourceCommit,
        body,
        closingIssuesReferences: {
          nodes: closing.map((number) => ({
            number,
            repository: { nameWithOwner: 'example/project' },
          })),
          pageInfo: { hasNextPage: closingHasNextPage },
        },
      },
      issue: {
        number: 161,
        state: issueState,
        url: 'https://github.com/example/project/issues/161',
        timelineItems: {
          nodes: events,
          pageInfo: { hasNextPage: timelineHasNextPage, endCursor: timelineEndCursor },
        },
      },
    },
  };
}

function closedEvent({ pr = 200, repository = 'example/project' } = {}) {
  return {
    __typename: 'ClosedEvent',
    createdAt: '2026-08-14T12:00:01Z',
    actor: { login: 'merge-user' },
    closer: {
      __typename: 'PullRequest',
      number: pr,
      url: `https://github.com/${repository}/pull/${pr}`,
      repository: { nameWithOwner: repository },
    },
  };
}

function reopenedEvent() {
  return {
    __typename: 'ReopenedEvent',
    createdAt: '2026-08-14T12:00:02Z',
    actor: { login: 'reopen-user' },
  };
}

describe('umbrella publication GitHub semantic classifier', () => {
  test('accepts an exact dedicated-head open PR with no closing relationship', () => {
    const result = classifyPublicationEvidence(options, payload());

    expect(result.status).toBe('pending_safe');
    expect(result.reasonCode).toBe('publication_pr_non_closing');
    expect(result.evidence.dedicatedHead).toBe(true);
    expect(result.evidence.closingIssueNumbers).toEqual([]);
  });

  test('rejects an open PR whose closing references contain the umbrella', () => {
    const result = classifyPublicationEvidence(options, payload({ closing: [161] }));

    expect(result.status).toBe('closing_relationship');
    expect(result.reasonCode).toBe('publication_pr_closes_umbrella');
  });

  test('rejects an open exact-marker PR that uses the issue-linked source head', () => {
    const result = classifyPublicationEvidence(options, payload({ head: '161-linked-sealing-branch' }));

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('open_pr_uses_issue_linked_or_unexpected_head');
  });

  test('accepts a merged publication only while the umbrella remains open', () => {
    const result = classifyPublicationEvidence(options, payload({ prState: 'MERGED', merged: true }));

    expect(result.status).toBe('merged_safe');
    expect(result.reasonCode).toBe('publication_merged_umbrella_open');
    expect(result.evidence.recovered).toBe(false);
  });

  test('attributes an exact publication-caused closure through ClosedEvent evidence', () => {
    const result = classifyPublicationEvidence(options, payload({
      prState: 'MERGED',
      merged: true,
      issueState: 'CLOSED',
      closing: [161],
      events: [closedEvent()],
      head: '161-historical-linked-head',
    }));

    expect(result.status).toBe('publication_closed_umbrella');
    expect(result.reasonCode).toBe('publication_pr_closed_umbrella');
    expect(result.evidence.dedicatedHead).toBe(false);
    expect(result.evidence.publicationClosedEvents).toHaveLength(1);
  });

  test('never attributes an unrelated closure to the publication PR', () => {
    const result = classifyPublicationEvidence(options, payload({
      prState: 'MERGED',
      merged: true,
      issueState: 'CLOSED',
      events: [closedEvent({ pr: 199 })],
    }));

    expect(result.status).toBe('closed_unrelated');
    expect(result.reasonCode).toBe('umbrella_closed_by_other_cause');
  });

  test('recognizes a successful exact reopen without erasing closure evidence', () => {
    const result = classifyPublicationEvidence(options, payload({
      prState: 'MERGED',
      merged: true,
      issueState: 'OPEN',
      closing: [161],
      events: [closedEvent(), reopenedEvent()],
      head: '161-historical-linked-head',
    }));

    expect(result.status).toBe('merged_safe');
    expect(result.reasonCode).toBe('publication_closure_recovered');
    expect(result.evidence.recovered).toBe(true);
    expect(result.evidence.activeClosure).toBeNull();
  });

  test('attributes only the active closure after publication close, reopen, and unrelated close', () => {
    const laterUnrelatedClose = closedEvent({ pr: 199 });
    laterUnrelatedClose.createdAt = '2026-08-14T12:00:03Z';
    const result = classifyPublicationEvidence(options, payload({
      prState: 'MERGED',
      merged: true,
      issueState: 'CLOSED',
      closing: [161],
      events: [closedEvent(), reopenedEvent(), laterUnrelatedClose],
      head: '161-historical-linked-head',
    }));

    expect(result.status).toBe('closed_unrelated');
    expect(result.reasonCode).toBe('umbrella_closed_by_other_cause');
    expect(result.evidence.publicationClosedEvents).toHaveLength(1);
    expect(result.evidence.activeClosure.closerNumber).toBe(199);
  });

  test('does not attribute a same-number pull request from another repository', () => {
    const result = classifyPublicationEvidence(options, payload({
      prState: 'MERGED',
      merged: true,
      issueState: 'CLOSED',
      events: [closedEvent({ repository: 'other/project' })],
      head: '161-historical-linked-head',
    }));

    expect(result.status).toBe('closed_unrelated');
    expect(result.evidence.publicationClosedEvents).toHaveLength(0);
    expect(result.evidence.activeClosure.closerRepository).toBe('other/project');
  });

  test('fails closed on marker, base, commit, or truncated evidence mismatches', () => {
    const invalidMarker = classifyPublicationEvidence(options, payload({ body: 'Refs #161' }));
    expect(invalidMarker.status).toBe('unverifiable');
    expect(invalidMarker.gaps).toContain('pull request body does not contain exactly one expected umbrella marker');

    const invalidBase = payload();
    invalidBase.repository.pullRequest.baseRefName = 'develop';
    expect(classifyPublicationEvidence(options, invalidBase).gaps).toContain('base ref is develop, expected main');

    const invalidCommit = payload();
    invalidCommit.repository.pullRequest.headRefOid = '3'.repeat(40);
    expect(classifyPublicationEvidence(options, invalidCommit).gaps).toContain('head commit does not match the validated seal commit');

    const truncated = classifyPublicationEvidence(options, payload({ closingHasNextPage: true }));
    expect(truncated.gaps).toContain('closing issue references are missing or truncated');

    const truncatedTimeline = classifyPublicationEvidence(options, payload({
      timelineHasNextPage: true,
      timelineEndCursor: 'cursor-1',
    }));
    expect(truncatedTimeline.gaps).toContain('issue close/reopen timeline is missing or truncated');
  });

  test('walks close/reopen timeline pages before classifying a merged closure', () => {
    const first = payload({
      prState: 'MERGED',
      merged: true,
      issueState: 'CLOSED',
      closing: [161],
      timelineHasNextPage: true,
      timelineEndCursor: 'cursor-1',
    });
    const second = payload({
      prState: 'MERGED',
      merged: true,
      issueState: 'CLOSED',
      closing: [161],
      events: [closedEvent()],
    });
    let calls = 0;
    const run = (_command, args) => {
      calls += 1;
      if (calls === 1) expect(args).not.toContain('cursor=cursor-1');
      if (calls === 2) expect(args).toContain('cursor=cursor-1');
      return { ok: true, status: 0, stdout: JSON.stringify({ data: calls === 1 ? first : second }), stderr: '' };
    };

    const result = inspectUmbrellaPublication(options, { run });

    expect(calls).toBe(2);
    expect(result.status).toBe('publication_closed_umbrella');
  });

  test('validates branch naming and all required inputs', () => {
    expect(publicationBranchName(161, tree)).toBe('nmg-sdlc/spec-publication-161-111111111111');
    const result = classifyPublicationEvidence({ ...options, tree: 'short' }, payload());
    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('invalid_input');
  });
});
