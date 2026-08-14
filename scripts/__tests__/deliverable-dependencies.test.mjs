import {
  deliverableDependencyLimits,
  inspectDeliverableDependencies,
  parseDeliverableRequirements,
} from '../deliverable-dependencies.mjs';

const MERGE_OID = 'a'.repeat(40);
const BODY = '- Requires deliverable from #122: T054 validated schema/register baseline\n\nDepends on: #122';

function closingPullRequest(overrides = {}) {
  return {
    number: 200,
    state: 'MERGED',
    mergedAt: '2026-08-14T10:00:00Z',
    baseRefName: 'main',
    mergeCommit: { oid: MERGE_OID },
    ...overrides,
  };
}

function owner(overrides = {}) {
  return {
    number: 122,
    state: 'CLOSED',
    closedByPullRequestsReferences: {
      nodes: [closingPullRequest()],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    ...overrides,
  };
}

function inspect(overrides = {}) {
  return inspectDeliverableDependencies({
    issueNumber: 123,
    body: BODY,
    defaultBranch: 'main',
    executionDependencies: [{ issueNumber: 122, state: 'CLOSED' }],
    targets: [owner()],
    ...overrides,
  });
}

describe('deliverable requirement parsing', () => {
  it('parses exact records, preserves distinct descriptions, and deduplicates exact repeats', () => {
    const result = parseDeliverableRequirements([
      '- Requires deliverable from #122: T054 baseline',
      '- Requires deliverable from #122: T054 baseline',
      '- Requires deliverable from #122: schema artifact',
      'Requires deliverable from #999: not a supported bullet',
    ].join('\n'));

    expect(result).toEqual({
      requirements: [
        { ownerIssue: 122, description: 'T054 baseline' },
        { ownerIssue: 122, description: 'schema artifact' },
      ],
      gaps: [],
    });
  });

  it('reports malformed structured records instead of treating them as prose', () => {
    const result = parseDeliverableRequirements('- Requires deliverable from #122 T054 baseline');
    expect(result.requirements).toEqual([]);
    expect(result.gaps).toEqual([expect.stringContaining('malformed deliverable requirement')]);
  });

  it('bounds body and requirement inputs', () => {
    const oversized = parseDeliverableRequirements('x'.repeat(deliverableDependencyLimits.maxBodyBytes + 1));
    expect(oversized.gaps).toEqual([expect.stringContaining('exceeds')]);

    const many = Array.from(
      { length: deliverableDependencyLimits.maxRequirements + 1 },
      (_, index) => `- Requires deliverable from #${index + 100}: artifact ${index}`,
    ).join('\n');
    expect(parseDeliverableRequirements(many).gaps).toEqual([
      expect.stringContaining('bounded limit'),
    ]);
  });
});

describe('deliverable dependency classification', () => {
  it('preserves ordinary behavior when no requirement is declared', () => {
    expect(inspect({ body: '' })).toMatchObject({
      status: 'none',
      reasonCode: 'no_deliverable_requirements',
      requirements: [],
    });
  });

  it('returns ready only for a matching edge and merged default-branch delivery', () => {
    expect(inspect()).toEqual({
      status: 'ready',
      reasonCode: 'deliverables_available',
      issueNumber: 123,
      defaultBranch: 'main',
      requirements: [{
        ownerIssue: 122,
        description: 'T054 validated schema/register baseline',
        executionEdge: true,
        ownerState: 'CLOSED',
        mergedPullRequest: {
          number: 200,
          mergedAt: '2026-08-14T10:00:00Z',
          baseRefName: 'main',
          mergeCommit: MERGE_OID,
        },
        available: true,
      }],
      gaps: [],
    });
  });

  it('requires a whole-issue execution edge rather than coordination membership', () => {
    const result = inspect({ executionDependencies: [] });
    expect(result).toMatchObject({
      status: 'repair_required',
      reasonCode: 'deliverable_execution_edge_missing',
    });
    expect(result.gaps).toEqual([
      'deliverable owner #122 lacks a whole-issue execution dependency',
    ]);
  });

  it('fails closed before edge repair when relationship classification is incomplete', () => {
    expect(inspect({ relationshipEvidenceComplete: false })).toMatchObject({
      status: 'unverifiable',
      reasonCode: 'execution_relationships_unverifiable',
    });
  });

  test.each([
    ['open owner', owner({ state: 'OPEN' })],
    ['manually closed owner', owner({ closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false } } })],
    ['unmerged closer', owner({ closedByPullRequestsReferences: { nodes: [closingPullRequest({ state: 'OPEN', mergedAt: null, mergeCommit: null })], pageInfo: { hasNextPage: false } } })],
    ['wrong-base closer', owner({ closedByPullRequestsReferences: { nodes: [closingPullRequest({ baseRefName: 'release' })], pageInfo: { hasNextPage: false } } })],
  ])('blocks a %s without default-branch delivery', (_name, target) => {
    const result = inspect({ targets: [target] });
    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'deliverable_not_merged',
      requirements: [{ available: false }],
    });
  });

  test.each([
    ['missing target', []],
    ['incomplete pagination', [owner({ closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'next' } } })]],
    ['missing pagination metadata', [owner({ closedByPullRequestsReferences: { nodes: [] } })]],
    ['missing merge commit', [owner({ closedByPullRequestsReferences: { nodes: [closingPullRequest({ mergeCommit: null })], pageInfo: { hasNextPage: false } } })]],
    ['malformed owner state', [owner({ state: 'UNKNOWN' })]],
  ])('fails closed for %s evidence', (_name, targets) => {
    const result = inspect({ targets });
    expect(result).toMatchObject({
      status: 'unverifiable',
      reasonCode: 'deliverable_metadata_unverifiable',
    });
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it('requires a valid default branch and rejects self-owned prerequisites', () => {
    expect(inspect({ defaultBranch: null })).toMatchObject({
      status: 'unverifiable',
      reasonCode: 'default_branch_unverifiable',
    });
    expect(inspect({
      issueNumber: 122,
      body: '- Requires deliverable from #122: self\nDepends on: #122',
    })).toMatchObject({
      status: 'repair_required',
      reasonCode: 'deliverable_owner_self_reference',
    });
  });
});
