import { describe, expect, test } from '@jest/globals';

import {
  classifyEpicCompletion,
  classifyEpicRelationships,
  deriveEpicLineage,
  epicChildLabelTargets,
  normalizeEpicRelationships,
  parseBodyRelationships,
  parseChecklistChildren,
  reconcileEpicSiblings,
} from '../epic-relationships.mjs';

function issue(number, {
  title = `Issue ${number}`,
  labels = [],
  state = 'OPEN',
  body = '',
  parent = null,
  subIssues = [],
  hasNextPage = false,
} = {}) {
  return {
    number,
    title,
    labels: { nodes: labels.map((name) => ({ name })) },
    state,
    body,
    parent,
    subIssues: {
      nodes: subIssues.map((child) => (typeof child === 'number' ? { number: child } : child)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? 'cursor' : null },
    },
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

  test.each([
    ['native-only', issue(10, { labels: ['epic'], subIssues: [20] }), issue(20, {
      parent: issue(10, { labels: ['epic'] }),
    }), 'agreeing body relationship'],
    ['body-only', issue(10, { labels: ['epic'] }), issue(20, {
      body: 'Depends on: #10',
    }), 'agreeing native relationship'],
  ])('does not assign legacy identity from %s evidence', (_name, parent, child, gap) => {
    const result = classifyEpicRelationships({ issues: [parent, child], activeIssueNumber: 20 });
    expect(result).toMatchObject({
      role: 'unverifiable',
      parentNumber: 10,
      identity: 'unverifiable',
      consistency: 'unverifiable',
      degraded: true,
    });
    expect(result.gaps).toEqual(expect.arrayContaining([expect.stringContaining(gap)]));
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

describe('epic lineage', () => {
  test('returns root-to-parent titles while retaining only genuine execution dependencies', () => {
    const root = issue(5, { title: 'Root epic', labels: ['epic'], subIssues: [10] });
    const inner = issue(10, {
      title: 'Inner epic',
      labels: ['epic', 'epic-child-of-5'],
      parent: root,
      body: 'Depends on: #5',
      subIssues: [20],
    });
    const dependency = issue(19, { title: 'Real prerequisite', state: 'CLOSED' });
    const child = issue(20, {
      title: 'Leaf child',
      labels: ['epic-child-of-10'],
      parent: inner,
      body: 'Depends on: #10\nDepends on: #19',
    });
    const result = deriveEpicLineage({ issues: [root, inner, dependency, child], activeIssueNumber: 20 });
    expect(result).toMatchObject({
      status: 'resolved',
      lineage: [
        { number: 5, title: 'Root epic' },
        { number: 10, title: 'Inner epic' },
      ],
      executionDependencies: [expect.objectContaining({ issueNumber: 19, blocking: false })],
      gaps: [],
    });
  });

  test('fails closed on an incomplete native page', () => {
    const parent = issue(10, { labels: ['epic'], subIssues: [20], hasNextPage: true });
    const child = issue(20, { labels: ['epic-child-of-10'], parent, body: 'Depends on: #10' });
    const result = deriveEpicLineage({ issues: [parent, child], activeIssueNumber: 20 });
    expect(result.status).toBe('unverifiable');
    expect(result.gaps).toContain('epic #10 native sub-issue connection is incomplete');
  });

  test('names a nested cycle without looping', () => {
    const first = issue(10, {
      title: 'First',
      labels: ['epic', 'epic-child-of-11'],
      body: 'Depends on: #11',
    });
    const second = issue(11, {
      title: 'Second',
      labels: ['epic', 'epic-child-of-10'],
      body: 'Depends on: #10',
    });
    first.parent = second;
    first.subIssues.nodes = [{ number: 11 }];
    second.parent = first;
    second.subIssues.nodes = [{ number: 10 }];
    const result = deriveEpicLineage({ issues: [first, second], activeIssueNumber: 10 });
    expect(result.status).toBe('cycle');
    expect(result.gaps[0]).toContain('#10 -> #11 -> #10');
  });
});

describe('epic completion classification', () => {
  function completedGraph({ openChild = null, hasNextPage = false } = {}) {
    const outer = issue(5, { title: 'Outer', labels: ['epic'], subIssues: [10] });
    const epic = issue(10, {
      title: 'Inner',
      labels: ['epic', 'epic-child-of-5'],
      state: 'OPEN',
      parent: outer,
      body: 'Depends on: #5',
      subIssues: [20, 30],
      hasNextPage,
    });
    const child20 = issue(20, { title: 'First child', state: openChild === 20 ? 'OPEN' : 'CLOSED' });
    const child30 = issue(30, { title: 'Second child', state: openChild === 30 ? 'OPEN' : 'CLOSED' });
    return [outer, epic, child20, child30];
  }

  test('returns eligible with exact Done mutations and the next parent', () => {
    const result = classifyEpicCompletion({
      issues: completedGraph(),
      epicIssueNumber: 10,
      specAuthority: { status: 'valid', epicIssue: 10, evidenceDigest: 'sha256:spec' },
      projectItems: [{
        itemId: 'ITEM',
        projectId: 'PROJECT',
        projectTitle: 'Delivery',
        statusFieldId: 'STATUS',
        statusName: 'In Progress',
        doneOptions: [{ id: 'DONE', name: 'Done' }],
      }],
    });
    expect(result).toMatchObject({
      status: 'eligible',
      epicIssueNumber: 10,
      directChildren: [
        { number: 20, title: 'First child', state: 'CLOSED', epic: false },
        { number: 30, title: 'Second child', state: 'CLOSED', epic: false },
      ],
      incompleteChildren: [],
      nextParentNumber: 5,
      projectStatus: 'needs_reconciliation',
      projectMutations: [{ itemId: 'ITEM', optionId: 'DONE', to: 'Done' }],
      gaps: [],
    });
    expect(result.evidenceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('stops normally at incomplete children and planned spec authority', () => {
    const open = classifyEpicCompletion({
      issues: completedGraph({ openChild: 30 }),
      epicIssueNumber: 10,
      specAuthority: { status: 'valid', epicIssue: 10 },
    });
    expect(open).toMatchObject({ status: 'incomplete', incompleteChildren: [30] });

    const planned = classifyEpicCompletion({
      issues: completedGraph(),
      epicIssueNumber: 10,
      specAuthority: { status: 'planned', epicIssue: 10 },
    });
    expect(planned.status).toBe('incomplete');
    expect(planned.gaps[0]).toContain('planned child specification packages');
  });

  test.each([
    ['zero-child', [issue(10, { labels: ['epic'], subIssues: [] })], 'repair_required', 'zero native children'],
    ['partial-page', completedGraph({ hasNextPage: true }), 'unverifiable', 'connection is incomplete'],
  ])('fails closed for %s evidence', (_name, issues, status, gap) => {
    const result = classifyEpicCompletion({
      issues,
      epicIssueNumber: 10,
      specAuthority: { status: 'valid', epicIssue: 10 },
    });
    expect(result.status).toBe(status);
    expect(result.gaps.join(' ')).toContain(gap);
  });

  test('requires readable and unambiguous Project status metadata', () => {
    const result = classifyEpicCompletion({
      issues: completedGraph(),
      epicIssueNumber: 10,
      specAuthority: { status: 'valid', epicIssue: 10 },
      projectItems: [{ itemId: 'ITEM', projectId: 'PROJECT', projectTitle: 'Delivery' }],
    });
    expect(result.status).toBe('unverifiable');
    expect(result.gaps[0]).toContain('unreadable required Project status metadata');
  });

  test('produces an identical digest for repeated unchanged evidence', () => {
    const input = {
      issues: completedGraph(),
      epicIssueNumber: 10,
      specAuthority: { status: 'valid', epicIssue: 10 },
    };
    expect(classifyEpicCompletion(input)).toEqual(classifyEpicCompletion(input));
  });

  test('normalizes Project mutations independently of input order', () => {
    const projectItems = [
      {
        itemId: 'ITEM-B', projectId: 'PROJECT-B', projectTitle: 'Beta',
        statusFieldId: 'STATUS-B', statusName: 'In Progress',
        doneOptions: [{ id: 'DONE-B', name: 'Done' }],
      },
      {
        itemId: 'ITEM-A', projectId: 'PROJECT-A', projectTitle: 'Alpha',
        statusFieldId: 'STATUS-A', statusName: 'Backlog',
        doneOptions: [{ id: 'DONE-A', name: 'Done' }],
      },
    ];
    const input = {
      issues: completedGraph(),
      epicIssueNumber: 10,
      specAuthority: { status: 'valid', epicIssue: 10, evidenceDigest: 'sha256:spec' },
    };
    const forward = classifyEpicCompletion({ ...input, projectItems });
    const reversed = classifyEpicCompletion({ ...input, projectItems: [...projectItems].reverse() });

    expect(forward.projectMutations).toEqual(reversed.projectMutations);
    expect(forward.evidenceDigest).toBe(reversed.evidenceDigest);
  });

  test('binds the completion digest to valid spec-authority evidence', () => {
    const input = {
      issues: completedGraph(),
      epicIssueNumber: 10,
      specAuthority: { status: 'valid', epicIssue: 10, evidenceDigest: 'sha256:first' },
    };
    const first = classifyEpicCompletion(input);
    const second = classifyEpicCompletion({
      ...input,
      specAuthority: { ...input.specAuthority, evidenceDigest: 'sha256:second' },
    });

    expect(first.specAuthorityEvidenceDigest).toBe('sha256:first');
    expect(second.specAuthorityEvidenceDigest).toBe('sha256:second');
    expect(second.evidenceDigest).not.toBe(first.evidenceDigest);
  });
});
