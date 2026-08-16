import { describe, expect, test } from '@jest/globals';

import { classifyEpicCompletion } from '../epic-relationships.mjs';

function issue(number, { state = 'CLOSED', title = `Issue ${number}`, labels = [], parent = null, children = [] } = {}) {
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

const authority = { status: 'valid', epicIssue: 108, gaps: [] };

describe('post-merge epic completion classifier', () => {
  test('returns an eligible deterministic Project reconciliation plan', () => {
    const issues = [
      issue(108, { state: 'OPEN', labels: ['epic'], children: [122, 123] }),
      issue(122, { parent: 108, labels: ['epic-child-of-108'] }),
      issue(123, { parent: 108, labels: ['epic-child-of-108'] }),
    ];
    const options = {
      issues,
      epicIssueNumber: 108,
      specAuthority: authority,
      projectItems: [{
        itemId: 'ITEM', projectId: 'PROJECT', projectTitle: 'Backlog',
        statusFieldId: 'STATUS', statusName: 'In Progress',
        doneOptions: [{ id: 'DONE', name: 'Done' }],
      }],
    };
    const first = classifyEpicCompletion(options);
    const second = classifyEpicCompletion(options);

    expect(first).toMatchObject({
      status: 'eligible',
      directChildren: [{ number: 122 }, { number: 123 }],
      incompleteChildren: [],
      projectStatus: 'needs_reconciliation',
      projectMutations: [{ itemId: 'ITEM', optionId: 'DONE', to: 'Done' }],
    });
    expect(second.evidenceDigest).toBe(first.evidenceDigest);
  });

  test('stops on open child, planned authority, zero children, or partial pages', () => {
    const open = [
      issue(108, { state: 'OPEN', labels: ['epic'], children: [122] }),
      issue(122, { state: 'OPEN', parent: 108, labels: ['epic-child-of-108'] }),
    ];
    expect(classifyEpicCompletion({ issues: open, epicIssueNumber: 108, specAuthority: authority }).status).toBe('incomplete');
    expect(classifyEpicCompletion({ issues: open.map((entry) => ({ ...entry, state: 'CLOSED' })), epicIssueNumber: 108, specAuthority: { ...authority, status: 'planned' } }).status).toBe('incomplete');
    expect(classifyEpicCompletion({ issues: [issue(108, { state: 'OPEN', labels: ['epic'] })], epicIssueNumber: 108, specAuthority: authority }).status).toBe('repair_required');
    const partial = issue(108, { state: 'OPEN', labels: ['epic'], children: [122] });
    partial.subIssues.pageInfo.hasNextPage = true;
    expect(classifyEpicCompletion({ issues: [partial, issue(122)], epicIssueNumber: 108, specAuthority: authority }).status).toBe('unverifiable');
  });

  test('returns the next nested parent only after direct completion', () => {
    const issues = [
      issue(200, { state: 'OPEN', labels: ['epic'], children: [108] }),
      issue(108, { state: 'OPEN', labels: ['epic', 'epic-child-of-200'], parent: 200, children: [122] }),
      issue(122, { parent: 108, labels: ['epic-child-of-108'] }),
    ];
    const result = classifyEpicCompletion({ issues, epicIssueNumber: 108, specAuthority: authority });
    expect(result).toMatchObject({ status: 'eligible', nextParentNumber: 200 });
  });

  test('does not let a prematurely closed nested epic satisfy ancestor completion', () => {
    const issues = [
      issue(200, { state: 'OPEN', labels: ['epic'], children: [108] }),
      issue(108, { state: 'CLOSED', labels: ['epic', 'epic-child-of-200'], parent: 200, children: [122] }),
      issue(122, { state: 'OPEN', parent: 108, labels: ['epic-child-of-108'] }),
    ];
    const plannedNestedAuthority = {
      status: 'valid',
      epicIssue: 200,
      gaps: [],
      children: [{
        issue: 108,
        packageKind: 'epic',
        status: 'valid',
        nestedStatus: 'planned',
      }],
    };

    expect(classifyEpicCompletion({
      issues,
      epicIssueNumber: 200,
      specAuthority: plannedNestedAuthority,
    })).toMatchObject({
      status: 'repair_required',
      gaps: [expect.stringContaining('closed nested epic #108 still has planned specification descendants')],
    });
  });

  test('fails closed when readable Project status cannot be proven', () => {
    const issues = [
      issue(108, { state: 'OPEN', labels: ['epic'], children: [122] }),
      issue(122, { parent: 108, labels: ['epic-child-of-108'] }),
    ];
    const result = classifyEpicCompletion({
      issues,
      epicIssueNumber: 108,
      specAuthority: authority,
      projectItems: [{ itemId: null }],
    });
    expect(result.status).toBe('unverifiable');
    expect(result.gaps.join(' ')).toContain('unreadable required Project status metadata');
  });
});
