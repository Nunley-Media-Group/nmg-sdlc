import { describe, expect, test } from '@jest/globals';

import {
  classifyPrDeliveryState,
  deliveryFingerprint,
  parseCli,
} from '../pr-delivery-state.mjs';

const head = 'a'.repeat(40);

function snapshot(overrides = {}) {
  const value = {
    schemaVersion: 1,
    issue: { number: 177, state: 'OPEN' },
    pullRequest: {
      number: 200,
      state: 'OPEN',
      isDraft: false,
      headRefOid: head,
      baseRefName: 'main',
      headRefName: '177-feature',
      mergeStateStatus: 'CLEAN',
      mergedAt: null,
      mergeCommitOid: null,
    },
    checks: [{ name: 'test', event: 'pull_request', state: 'SUCCESS', required: true, url: 'https://example.test/check' }],
    reviews: [{ id: 'R1', author: 'reviewer', state: 'APPROVED', submittedAt: '2026-08-16T12:00:00Z' }],
    threads: [{ id: 'T1', isResolved: true, isOutdated: false, url: 'https://example.test/thread' }],
    pagination: { checksComplete: true, reviewsComplete: true, threadsComplete: true },
    requiredChecksConfigured: true,
    declaredPrOnlyChecks: [],
    verification: { status: 'pass', headSha: head },
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

describe('exact-head PR delivery state', () => {
  test('classifies only a fully clean exact head as merge ready', () => {
    const result = classifyPrDeliveryState(snapshot(), { issueNumber: 177, expectedHead: head });
    expect(result).toMatchObject({ status: 'merge_ready', reasonCode: 'exact_head_clean', headSha: head });
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test('invalidates evidence when the head or pagination changes', () => {
    expect(classifyPrDeliveryState(snapshot(), { issueNumber: 177, expectedHead: 'b'.repeat(40) })).toMatchObject({
      status: 'unverifiable',
      reasonCode: 'evidence_incomplete_or_invalid',
    });
    expect(classifyPrDeliveryState(snapshot({ pagination: { threadsComplete: false } }), { issueNumber: 177 })).toMatchObject({ status: 'unverifiable' });
  });

  test('distinguishes pending checks, failures, reviews, threads, and mergeability', () => {
    expect(classifyPrDeliveryState(snapshot({ checks: [{ name: 'test', state: 'PENDING' }] }), { issueNumber: 177 }).status).toBe('pending');
    expect(classifyPrDeliveryState(snapshot({ checks: [{ name: 'test', state: 'FAILURE' }] }), { issueNumber: 177 }).status).toBe('remediate');
    expect(classifyPrDeliveryState(snapshot({ reviews: [{ id: 'R2', author: 'reviewer', state: 'CHANGES_REQUESTED', submittedAt: '2026-08-16T13:00:00Z' }] }), { issueNumber: 177 }).reasonCode).toBe('changes_requested');
    expect(classifyPrDeliveryState(snapshot({ threads: [{ id: 'T2', isResolved: false, isOutdated: false }] }), { issueNumber: 177 }).reasonCode).toBe('review_threads_unresolved');
    expect(classifyPrDeliveryState(snapshot({ pullRequest: { mergeStateStatus: 'BEHIND' } }), { issueNumber: 177 }).reasonCode).toBe('mergeability_defect');
  });

  test('requires merged PR proof and child closure before completion', () => {
    const merged = snapshot({
      issue: { state: 'CLOSED' },
      pullRequest: { state: 'MERGED', mergedAt: '2026-08-16T14:00:00Z', mergeCommitOid: 'c'.repeat(40) },
    });
    expect(classifyPrDeliveryState(merged, { issueNumber: 177 })).toMatchObject({
      status: 'complete',
      reasonCode: 'merged_exact_head_and_issue_closed',
    });
    expect(classifyPrDeliveryState({ ...merged, issue: { number: 177, state: 'OPEN' } }, { issueNumber: 177 })).toMatchObject({
      status: 'external_blocker',
      reasonCode: 'merged_pr_child_still_open',
    });
  });

  test('fingerprint and CLI parsing are deterministic', () => {
    expect(deliveryFingerprint({ b: 2, a: 1 })).toBe(deliveryFingerprint({ a: 1, b: 2 }));
    expect(parseCli(['--evidence', '/tmp/state.json', '--issue', '177', '--expected-head', head, '--json'])).toMatchObject({ issueNumber: 177, expectedHead: head });
  });
});
