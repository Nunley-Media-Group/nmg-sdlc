/**
 * Deterministic terminal-delivery and epic-closure exercises for issue #177.
 *
 * These fixtures model exact GitHub snapshots locally; they never create a PR
 * or mutate a consumer repository.
 */

import { describe, expect, test } from '@jest/globals';

import { classifyEpicCompletion } from '../epic-relationships.mjs';
import { classifyPrDeliveryState } from '../pr-delivery-state.mjs';

const firstHead = 'a'.repeat(40);
const secondHead = 'b'.repeat(40);

function deliverySnapshot(overrides = {}) {
  const value = {
    schemaVersion: 1,
    issue: { number: 122, state: 'OPEN' },
    pullRequest: {
      number: 300,
      state: 'OPEN',
      isDraft: false,
      headRefOid: firstHead,
      baseRefName: 'main',
      headRefName: '122-child-delivery',
      mergeStateStatus: 'CLEAN',
      mergedAt: null,
      mergeCommitOid: null,
    },
    checks: [{
      name: 'test',
      event: 'pull_request',
      state: 'SUCCESS',
      required: true,
      url: 'https://example.invalid/check',
    }],
    reviews: [{
      id: 'R1',
      author: 'reviewer',
      state: 'APPROVED',
      submittedAt: '2026-08-16T12:00:00Z',
    }],
    threads: [{
      id: 'T1',
      isResolved: true,
      isOutdated: false,
      url: 'https://example.invalid/thread',
    }],
    pagination: { checksComplete: true, reviewsComplete: true, threadsComplete: true },
    requiredChecksConfigured: true,
    declaredPrOnlyChecks: [],
    verification: { status: 'pass', headSha: firstHead },
  };
  return {
    ...value,
    ...overrides,
    issue: { ...value.issue, ...(overrides.issue ?? {}) },
    pullRequest: { ...value.pullRequest, ...(overrides.pullRequest ?? {}) },
    pagination: { ...value.pagination, ...(overrides.pagination ?? {}) },
    verification: { ...value.verification, ...(overrides.verification ?? {}) },
  };
}

function issue(number, {
  state = 'CLOSED',
  title = `Issue ${number}`,
  labels = [],
  parent = null,
  children = [],
} = {}) {
  return {
    number,
    title,
    state,
    body: parent ? `Depends on: #${parent}` : '',
    labels: { nodes: labels.map((name) => ({ name })), pageInfo: { hasNextPage: false, endCursor: null } },
    parent: parent ? { number: parent } : null,
    subIssues: {
      nodes: children.map((child) => ({ number: child, state: 'CLOSED' })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

function authority(epicIssue, children = []) {
  return { status: 'valid', epicIssue, children, gaps: [] };
}

describe('exercise: terminal exact-head delivery state machine', () => {
  test('walks pending, failure, review, new-head, non-CLEAN, merge, and child-closure states', () => {
    const pending = classifyPrDeliveryState(deliverySnapshot({
      checks: [{ name: 'test', event: 'pull_request', state: 'PENDING', required: true }],
    }), { issueNumber: 122, expectedHead: firstHead });
    expect(pending).toMatchObject({ status: 'pending', reasonCode: 'checks_pending' });

    const failing = classifyPrDeliveryState(deliverySnapshot({
      checks: [{ name: 'test', event: 'pull_request', state: 'FAILURE', required: true }],
    }), { issueNumber: 122, expectedHead: firstHead });
    expect(failing).toMatchObject({ status: 'remediate', reasonCode: 'checks_failed' });

    const review = classifyPrDeliveryState(deliverySnapshot({
      reviews: [{ id: 'R2', author: 'reviewer', state: 'CHANGES_REQUESTED', submittedAt: '2026-08-16T13:00:00Z' }],
      threads: [{ id: 'T2', isResolved: false, isOutdated: false }],
    }), { issueNumber: 122, expectedHead: firstHead });
    expect(review).toMatchObject({ status: 'remediate', reasonCode: 'changes_requested' });

    const newHeadSnapshot = deliverySnapshot({
      pullRequest: { headRefOid: secondHead },
      verification: { headSha: secondHead },
    });
    const staleEvidence = classifyPrDeliveryState(newHeadSnapshot, { issueNumber: 122, expectedHead: firstHead });
    expect(staleEvidence).toMatchObject({ status: 'unverifiable', reasonCode: 'evidence_incomplete_or_invalid' });

    const behind = classifyPrDeliveryState(deliverySnapshot({
      pullRequest: { headRefOid: secondHead, mergeStateStatus: 'BEHIND' },
      verification: { headSha: secondHead },
    }), { issueNumber: 122, expectedHead: secondHead });
    expect(behind).toMatchObject({ status: 'remediate', reasonCode: 'mergeability_defect' });

    const mergeReady = classifyPrDeliveryState(newHeadSnapshot, { issueNumber: 122, expectedHead: secondHead });
    expect(mergeReady).toMatchObject({ status: 'merge_ready', reasonCode: 'exact_head_clean', headSha: secondHead });
    expect(mergeReady.fingerprint).not.toBe(pending.fingerprint);

    const mergedOpenChild = classifyPrDeliveryState(deliverySnapshot({
      pullRequest: {
        state: 'MERGED',
        headRefOid: secondHead,
        mergedAt: '2026-08-16T14:00:00Z',
        mergeCommitOid: 'c'.repeat(40),
      },
      verification: { headSha: secondHead },
    }), { issueNumber: 122, expectedHead: secondHead });
    expect(mergedOpenChild).toMatchObject({
      status: 'external_blocker',
      reasonCode: 'merged_pr_child_still_open',
    });

    const complete = classifyPrDeliveryState(deliverySnapshot({
      issue: { state: 'CLOSED' },
      pullRequest: {
        state: 'MERGED',
        headRefOid: secondHead,
        mergedAt: '2026-08-16T14:00:00Z',
        mergeCommitOid: 'c'.repeat(40),
      },
      verification: { headSha: secondHead },
    }), { issueNumber: 122, expectedHead: secondHead });
    expect(complete).toMatchObject({ status: 'complete', reasonCode: 'merged_exact_head_and_issue_closed' });
  });

  test('never treats a draft, policy-blocked PR, partial page, or changed exact head as success', () => {
    expect(classifyPrDeliveryState(deliverySnapshot({ pullRequest: { isDraft: true } }), { issueNumber: 122 }).status).toBe('pending');
    expect(classifyPrDeliveryState(deliverySnapshot({ pullRequest: { mergeStateStatus: 'BLOCKED' } }), { issueNumber: 122 }).status).toBe('external_blocker');
    expect(classifyPrDeliveryState(deliverySnapshot({ pagination: { threadsComplete: false } }), { issueNumber: 122 }).status).toBe('unverifiable');
    expect(classifyPrDeliveryState(deliverySnapshot(), { issueNumber: 122, expectedHead: secondHead }).status).toBe('unverifiable');
  });
});

describe('exercise: final-child and nested epic completion cascade', () => {
  test('closes only after the final direct child and then makes the next ancestor eligible', () => {
    const before = [
      issue(200, { state: 'OPEN', labels: ['epic'], children: [108] }),
      issue(108, { state: 'OPEN', labels: ['epic', 'epic-child-of-200'], parent: 200, children: [122, 123] }),
      issue(122, { parent: 108, labels: ['epic-child-of-108'] }),
      issue(123, { state: 'OPEN', parent: 108, labels: ['epic-child-of-108'] }),
    ];
    const incomplete = classifyEpicCompletion({ issues: before, epicIssueNumber: 108, specAuthority: authority(108) });
    expect(incomplete).toMatchObject({ status: 'incomplete', incompleteChildren: [123] });

    const afterChild = before.map((entry) => entry.number === 123 ? { ...entry, state: 'CLOSED' } : entry);
    const inner = classifyEpicCompletion({
      issues: afterChild,
      epicIssueNumber: 108,
      specAuthority: authority(108),
      projectItems: [{
        itemId: 'INNER_ITEM', projectId: 'PROJECT', projectTitle: 'Backlog',
        statusFieldId: 'STATUS', statusName: 'In Progress', doneOptions: [{ id: 'DONE', name: 'Done' }],
      }],
    });
    expect(inner).toMatchObject({
      status: 'eligible',
      nextParentNumber: 200,
      projectMutations: [{ itemId: 'INNER_ITEM', optionId: 'DONE', to: 'Done' }],
    });

    const afterInnerClose = afterChild.map((entry) => entry.number === 108 ? { ...entry, state: 'CLOSED' } : entry);
    const outer = classifyEpicCompletion({
      issues: afterInnerClose,
      epicIssueNumber: 200,
      specAuthority: authority(200, [{
        issue: 108,
        packageKind: 'epic',
        status: 'valid',
        nestedStatus: 'valid',
      }]),
    });
    expect(outer).toMatchObject({ status: 'eligible', directChildren: [{ number: 108, state: 'CLOSED' }] });
  });

  test('partial pages, zero children, cycles, authority drift, and unreadable Project state stop closure', () => {
    const epic = issue(108, { state: 'OPEN', labels: ['epic'], children: [122] });
    const child = issue(122, { parent: 108, labels: ['epic-child-of-108'] });

    const partial = structuredClone(epic);
    partial.subIssues.pageInfo.hasNextPage = true;
    expect(classifyEpicCompletion({ issues: [partial, child], epicIssueNumber: 108, specAuthority: authority(108) }).status).toBe('unverifiable');
    expect(classifyEpicCompletion({ issues: [issue(108, { state: 'OPEN', labels: ['epic'] })], epicIssueNumber: 108, specAuthority: authority(108) }).status).toBe('repair_required');
    expect(classifyEpicCompletion({ issues: [epic, child], epicIssueNumber: 108, specAuthority: { status: 'repair_required', epicIssue: 108, gaps: ['drift'] } }).status).toBe('repair_required');
    expect(classifyEpicCompletion({ issues: [epic, child], epicIssueNumber: 108, specAuthority: authority(108), projectItems: [{ itemId: null }] }).status).toBe('unverifiable');

    const cyclicParent = issue(200, { state: 'OPEN', labels: ['epic', 'epic-child-of-108'], parent: 108, children: [108] });
    const cyclicChild = issue(108, { state: 'CLOSED', labels: ['epic', 'epic-child-of-200'], parent: 200, children: [200] });
    expect(classifyEpicCompletion({ issues: [cyclicParent, cyclicChild], epicIssueNumber: 200, specAuthority: authority(200) }).status).not.toBe('eligible');
  });
});
