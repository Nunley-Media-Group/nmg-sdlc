import { describe, expect, test } from '@jest/globals';

import {
  classifyEpicRelationships,
  epicChildLabelTargets,
  normalizeEpicRelationships,
  parseBodyRelationships,
  parseChecklistChildren,
  reconcileEpicSiblings,
} from '../epic-relationships.mjs';

function issue(number, {
  labels = [],
  state = 'OPEN',
  body = '',
  parent = null,
  subIssues = [],
} = {}) {
  return {
    number,
    labels: { nodes: labels.map((name) => ({ name })) },
    state,
    body,
    parent,
    subIssues: { nodes: subIssues.map((child) => (typeof child === 'number' ? { number: child } : child)) },
  };
}

describe('epic relationship parsing', () => {
  test('accepts only line-anchored same-repository body relationships', () => {
    expect(parseBodyRelationships([
      'Depends on: #10, #11',
      'Blocks: #12',
      'Depends on: owner/repo#13',
      'text Depends on: #14',
      'Depends on: #0',
    ].join('\n'))).toEqual({ dependsOn: [10, 11], blocks: [12] });
  });

  test('parses durable child labels and checklist entries deterministically', () => {
    const child = issue(20, { labels: ['enhancement', 'epic-child-of-10', 'EPIC-CHILD-OF-10'] });
    expect(epicChildLabelTargets(child)).toEqual([10]);
    expect(parseChecklistChildren('- [ ] #20 one\n- [x] #21 two\n- #22 unsupported')).toEqual([20, 21]);
  });

  test('deduplicates native, body, and label signals into one child-target pair', () => {
    const parent = issue(10, { labels: ['epic'], subIssues: [20] });
    const child = issue(20, {
      labels: ['epic-child-of-10'],
      parent,
      body: 'Depends on: #10',
    });
    const normalized = normalizeEpicRelationships([parent, child]);
    expect(normalized.pairs).toEqual([{
      child: 20,
      target: 10,
      signals: ['body-depends-on', 'child-label', 'native-parent', 'native-sub-issue'],
    }]);
  });
});

describe('epic relationship classification', () => {
  test('classifies the full tuple as durable and excludes the parent from dependencies', () => {
    const parent = issue(10, {
      labels: ['epic'],
      body: '## Child Issues\n\n- [ ] #20\n- [ ] #30',
      subIssues: [20, 30],
    });
    const child = issue(20, {
      labels: ['enhancement', 'epic-child-of-10'],
      parent,
      body: 'Depends on: #10',
    });
    const result = classifyEpicRelationships({ issues: [parent, child], activeIssueNumber: 20 });
    expect(result).toMatchObject({
      role: 'epic-child',
      parentNumber: 10,
      identity: 'durable',
      consistency: 'consistent',
      nativeAuthority: 'native',
      degraded: false,
      executionDependencies: [],
      siblingNumbers: [30],
      gaps: [],
    });
  });

  test('preserves a supported legacy child and recommends the missing label', () => {
    const parent = issue(10, { labels: ['epic'], subIssues: [20] });
    const child = issue(20, { parent, body: 'Depends on: #10' });
    const result = classifyEpicRelationships({ issues: [parent, child], activeIssueNumber: 20 });
    expect(result).toMatchObject({ role: 'epic-child', parentNumber: 10, identity: 'legacy' });
    expect(result.gaps).toContain('issue #20 is missing label epic-child-of-10');
  });

  test('does not authorize legacy identity when native discovery is unavailable', () => {
    const parent = issue(10, {
      labels: ['epic'],
      body: '- [ ] #20',
    });
    const child = issue(20, { body: 'Depends on: #10' });
    const result = classifyEpicRelationships({
      issues: [parent, child],
      activeIssueNumber: 20,
      nativeAvailable: false,
    });
    expect(result).toMatchObject({
      role: 'unverifiable',
      parentNumber: 10,
      identity: 'unverifiable',
      consistency: 'unverifiable',
      nativeAuthority: 'checklist-fallback',
      degraded: true,
    });
    expect(result.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('coordination with epic #10 is unverifiable'),
      expect.stringContaining('sibling authority degraded to checklist-fallback'),
    ]));
  });

  test('rejects a labeled child when an available native identity signal is missing', () => {
    const parent = issue(10, { labels: ['epic'] });
    const child = issue(20, {
      labels: ['epic-child-of-10'],
      body: 'Depends on: #10',
    });
    const result = classifyEpicRelationships({ issues: [parent, child], activeIssueNumber: 20 });
    expect(result).toMatchObject({
      role: 'inconsistent',
      identity: 'inconsistent',
      consistency: 'inconsistent',
      degraded: true,
    });
    expect(result.gaps).toContain('issue #20 has no native relationship to labeled epic #10');
  });

  test('fails a labeled child closed when native identity is unavailable', () => {
    const parent = issue(10, { labels: ['epic'] });
    const child = issue(20, {
      labels: ['epic-child-of-10'],
      body: 'Depends on: #10',
    });
    const result = classifyEpicRelationships({
      issues: [parent, child],
      activeIssueNumber: 20,
      nativeAvailable: false,
    });
    expect(result).toMatchObject({
      role: 'unverifiable',
      parentNumber: 10,
      identity: 'unverifiable',
      consistency: 'unverifiable',
      nativeAuthority: 'checklist-fallback',
      degraded: true,
    });
    expect(result.gaps).toContain('issue #20 native relationship discovery is unavailable; coordination with epic #10 is unverifiable');
  });

  test('keeps a genuine sibling dependency blocking beside a durable parent', () => {
    const parent = issue(10, { labels: ['epic'], subIssues: [20] });
    const sibling = issue(19, { labels: ['enhancement'], state: 'OPEN' });
    const child = issue(20, {
      labels: ['epic-child-of-10'],
      parent,
      body: 'Depends on: #10\nDepends on: #19',
    });
    const result = classifyEpicRelationships({ issues: [parent, sibling, child], activeIssueNumber: 20 });
    expect(result).toMatchObject({ role: 'epic-child', parentNumber: 10 });
    expect(result.executionDependencies).toEqual([expect.objectContaining({
      issueNumber: 19,
      blocking: true,
      metadata: 'confirmed-non-epic',
    })]);
  });

  test('prefers a fully hydrated target over a stale nested sub-issue stub', () => {
    const parent = issue(10, {
      labels: ['epic'],
      subIssues: [{ number: 19, state: 'OPEN' }, 20],
    });
    const sibling = issue(19, { labels: ['enhancement'], state: 'CLOSED' });
    const child = issue(20, {
      labels: ['epic-child-of-10'],
      parent,
      body: 'Depends on: #10\nDepends on: #19',
    });
    const result = classifyEpicRelationships({ issues: [parent, sibling, child], activeIssueNumber: 20 });
    expect(result.executionDependencies).toEqual([expect.objectContaining({
      issueNumber: 19,
      state: 'CLOSED',
      blocking: false,
    })]);
  });

  test.each([
    ['mismatched label', [
      issue(10, { labels: ['epic'] }),
      issue(11, { labels: ['enhancement'] }),
      issue(20, { labels: ['epic-child-of-11'], parent: issue(10, { labels: ['epic'] }) }),
    ], 'inconsistent'],
    ['unknown labeled target', [
      issue(20, { labels: ['epic-child-of-99'], body: 'Depends on: #99' }),
    ], 'unverifiable'],
    ['multiple epic parents', [
      issue(10, { labels: ['epic'] }),
      issue(11, { labels: ['epic'] }),
      issue(20, { body: 'Depends on: #10, #11' }),
    ], 'ambiguous'],
  ])('fails safely for %s', (_name, issues, role) => {
    expect(classifyEpicRelationships({ issues, activeIssueNumber: 20 }).role).toBe(role);
  });

  test('classifies an epic parent and reconciles stale checklist evidence', () => {
    const parent = issue(10, {
      labels: ['epic'],
      body: '- [ ] #20\n- [ ] #99',
      subIssues: [20, 30],
    });
    const result = classifyEpicRelationships({ issues: [parent], activeIssueNumber: 10 });
    expect(result).toMatchObject({
      role: 'epic',
      identity: 'durable',
      consistency: 'consistent',
      nativeAuthority: 'native',
      degraded: true,
      siblingNumbers: [20, 30],
      siblingReconciliation: {
        authority: 'native',
        nativeOnly: [30],
        checklistOnly: [99],
      },
    });
    expect(result.gaps).toEqual([
      'parent #10 checklist omits native children: #30',
      'parent #10 checklist contains non-native children: #99',
    ]);
  });

  test('reports checklist fallback as degraded without misleading drift gaps', () => {
    const parent = issue(10, {
      labels: ['epic'],
      body: '- [ ] #20\n- [ ] #30',
    });
    const result = classifyEpicRelationships({
      issues: [parent],
      activeIssueNumber: 10,
      nativeAvailable: false,
    });
    expect(result).toMatchObject({
      role: 'unverifiable',
      identity: 'unverifiable',
      consistency: 'unverifiable',
      nativeAuthority: 'checklist-fallback',
      degraded: true,
      siblingNumbers: [20, 30],
    });
    expect(result.gaps).toEqual([
      'issue #10 native sub-issue discovery is unavailable; epic coordination is unverifiable',
      'parent #10 sibling authority degraded to checklist-fallback; native sub-issue discovery was unavailable',
    ]);
  });
});

describe('sibling reconciliation', () => {
  test('uses native relationships authoritatively and reports both discrepancy directions', () => {
    expect(reconcileEpicSiblings({
      nativeChildren: [20, 30],
      checklistChildren: [20, 99],
      nativeAvailable: true,
    })).toEqual({
      authority: 'native',
      siblingNumbers: [20, 30],
      observedNumbers: [20, 30, 99],
      nativeOnly: [30],
      checklistOnly: [99],
    });
  });

  test('uses the checklist only when native discovery itself is unavailable', () => {
    expect(reconcileEpicSiblings({
      nativeChildren: [],
      checklistChildren: [20, 30],
      nativeAvailable: false,
    })).toMatchObject({ authority: 'checklist-fallback', siblingNumbers: [20, 30] });
  });
});
