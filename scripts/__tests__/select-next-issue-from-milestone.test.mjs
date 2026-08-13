/**
 * Unit tests for selectNextIssueFromMilestone().
 *
 * Derived from:
 * specs/bug-fix-epic-membership-deadlocking-issue-selection/
 * Issue: #149
 */

const runner = await import('../sdlc-runner.mjs');
const { selectNextIssueFromMilestone } = runner;

function labels(value = []) {
  return value.map((name) => ({ name }));
}

function issuePayload(number, detail = {}, includeBody = true) {
  const payload = {
    number,
    state: detail.state || 'OPEN',
    labels: detail.omitLabels ? undefined : labels(detail.labels || []),
    closedByPullRequestsReferences: detail.prs || [],
  };
  if (includeBody) payload.body = detail.body || '';
  return payload;
}

function graphIssue(number, parentNumber, details) {
  if (!parentNumber) return { number, parent: null };
  const parent = details[parentNumber];
  if (!parent) return { number, parent: { number: parentNumber } };
  return {
    number,
    parent: {
      number: parentNumber,
      state: parent.state || 'OPEN',
      labels: parent.omitLabels ? undefined : { nodes: labels(parent.labels || []) },
      closedByPullRequestsReferences: { nodes: parent.prs || [] },
    },
  };
}

function makeGhRunner({
  list,
  details,
  parents = {},
  failViews = [],
  graphqlError = null,
  seen = [],
}) {
  return (cmd) => {
    seen.push(cmd);
    if (cmd.startsWith('issue list')) {
      return JSON.stringify(list.map((number) => ({ number })));
    }
    if (cmd === 'repo view --json owner,name') {
      return JSON.stringify({ owner: { login: 'example' }, name: 'repo' });
    }
    if (cmd.startsWith('api graphql')) {
      if (graphqlError) throw new Error(graphqlError);
      const repository = {};
      for (const number of list) {
        repository[`issue${number}`] = graphIssue(number, parents[number], details);
      }
      return JSON.stringify({ data: { repository } });
    }
    const viewMatch = cmd.match(/^issue view (\d+)\b/);
    if (viewMatch) {
      const number = Number(viewMatch[1]);
      if (failViews.includes(number) || !details[number]) {
        throw new Error(`metadata unavailable for #${number}`);
      }
      return JSON.stringify(issuePayload(number, details[number], /\bbody\b/.test(cmd)));
    }
    throw new Error(`unexpected gh call: ${cmd}`);
  };
}

function select(fixture, milestone = 'M1') {
  const warnings = [];
  const ghRunner = makeGhRunner(fixture);
  const result = selectNextIssueFromMilestone(milestone, {
    ghRunner,
    excluded: fixture.excluded,
    warn: (message) => warnings.push(message),
  });
  return { result, warnings };
}

describe('selectNextIssueFromMilestone', () => {
  test('returns the lowest-numbered ready issue', () => {
    const { result } = select({
      list: [42, 7, 100],
      details: { 7: {}, 42: {}, 100: {} },
    });
    expect(result).toEqual({ issue: 7, blockedIssues: [] });
  });

  test('deduplicates native-plus-body epic membership and keeps the child ready', () => {
    const seen = [];
    const { result } = select({
      list: [20],
      details: {
        10: { labels: ['epic'] },
        20: { body: 'Depends on: #10' },
      },
      parents: { 20: 10 },
      seen,
    });
    expect(result.issue).toBe(20);
    expect(result.blockedIssues).toEqual([]);
    expect(seen.filter((cmd) => cmd.startsWith('issue view 10'))).toHaveLength(0);
  });

  test('body-only epic membership is non-blocking outside the automatable pool', () => {
    const { result } = select({
      list: [20],
      details: {
        10: { labels: ['epic'] },
        20: { body: 'Depends on: #10' },
      },
    });
    expect(result.issue).toBe(20);
    expect(result.blockedIssues).toEqual([]);
  });

  test('native-only epic membership is non-blocking', () => {
    const { result } = select({
      list: [20],
      details: { 10: { labels: ['epic'] }, 20: {} },
      parents: { 20: 10 },
    });
    expect(result.issue).toBe(20);
    expect(result.blockedIssues).toEqual([]);
  });

  test('confirmed non-epic native parent remains a blocker', () => {
    const { result } = select({
      list: [20],
      details: { 10: { labels: ['bug'] }, 20: {} },
      parents: { 20: 10 },
    });
    expect(result.issue).toBeNull();
    expect(result.blockedIssues).toEqual([{ issue: 20, blockers: [10] }]);
  });

  test('open sibling blocks while the coordination epic is omitted from diagnostics', () => {
    const { result } = select({
      list: [20, 30],
      details: {
        10: { labels: ['epic'] },
        20: {},
        30: { body: 'Depends on: #10\nDepends on: #20' },
      },
      parents: { 20: 10, 30: 10 },
    });
    expect(result.issue).toBe(20);
    expect(result.blockedIssues).toEqual([{ issue: 30, blockers: [20] }]);
  });

  test('known target metadata failure blocks and emits one actionable warning', () => {
    const { result, warnings } = select({
      list: [20],
      details: { 20: { body: 'Depends on: #10' } },
    });
    expect(result.issue).toBeNull();
    expect(result.blockedIssues).toEqual([{ issue: 20, blockers: [10] }]);
    expect(warnings).toEqual([
      'WARNING: Could not confirm relationship metadata for child #20 -> target #10; treating #10 as a blocking execution dependency. Retry after GitHub metadata is available.',
    ]);
  });

  test('malformed target labels fail safe as unknown metadata', () => {
    const { result, warnings } = select({
      list: [20],
      details: {
        10: { omitLabels: true },
        20: { body: 'Depends on: #10' },
      },
    });
    expect(result.blockedIssues).toEqual([{ issue: 20, blockers: [10] }]);
    expect(warnings[0]).toContain('child #20 -> target #10');
  });

  test('closed dependency with a merged PR is satisfied outside the pool', () => {
    const { result } = select({
      list: [20],
      details: {
        10: { state: 'CLOSED', prs: [{ state: 'MERGED', mergedAt: '2026-08-13T00:00:00Z' }] },
        20: { body: 'Depends on: #10' },
      },
    });
    expect(result.issue).toBe(20);
    expect(result.blockedIssues).toEqual([]);
  });

  test('closed dependency without a merged PR remains blocking', () => {
    const { result } = select({
      list: [20],
      details: {
        10: { state: 'CLOSED', prs: [] },
        20: { body: 'Depends on: #10' },
      },
    });
    expect(result.issue).toBeNull();
    expect(result.blockedIssues).toEqual([{ issue: 20, blockers: [10] }]);
  });

  test('parses multiple Depends on targets and sorts blockers', () => {
    const { result } = select({
      list: [30],
      details: {
        10: {},
        20: {},
        30: { body: 'Depends on: #20, #10' },
      },
    });
    expect(result.blockedIssues).toEqual([{ issue: 30, blockers: [10, 20] }]);
  });

  test('normalizes Blocks lines in the correct direction', () => {
    const { result } = select({
      list: [10, 20],
      details: { 10: { body: 'Blocks: #20' }, 20: {} },
    });
    expect(result.issue).toBe(10);
    expect(result.blockedIssues).toEqual([{ issue: 20, blockers: [10] }]);
  });

  test('GraphQL failure degrades to body relationships with a warning', () => {
    const { result, warnings } = select({
      list: [20],
      details: {
        10: { labels: ['epic'] },
        20: { body: 'Depends on: #10' },
      },
      graphqlError: 'GraphQL unavailable',
    });
    expect(result.issue).toBe(20);
    expect(warnings[0]).toMatch(/^WARNING: Native dependency links unavailable; using body cross-refs only\./);
  });

  test('candidate fetch failure excludes it from the ready set', () => {
    const { result } = select({
      list: [10, 20],
      details: { 10: {}, 20: {} },
      failViews: [10],
    });
    expect(result.issue).toBe(20);
    expect(result.blockedIssues).toEqual([{ issue: 10, blockers: [], reason: 'fetch-failed' }]);
  });

  test('excluded issues are removed before graph construction', () => {
    const { result } = select({
      list: [10, 20],
      details: { 10: {}, 20: {} },
      excluded: new Set([10]),
    });
    expect(result.issue).toBe(20);
  });

  test('self-references and cross-repository references are ignored', () => {
    const { result } = select({
      list: [10],
      details: { 10: { body: 'Depends on: #10\nDepends on: owner/repo#20' } },
    });
    expect(result.issue).toBe(10);
    expect(result.blockedIssues).toEqual([]);
  });

  test('empty milestone returns no issue, blockers, or warnings', () => {
    const { result } = select({ list: [], details: {} });
    expect(result).toEqual({ issue: null, blockedIssues: [] });
  });

  test('throws when issue listing fails', () => {
    expect(() => selectNextIssueFromMilestone('M1', {
      ghRunner: () => { throw new Error('gh auth failed'); },
      warn: () => {},
    })).toThrow(/Failed to list milestone issues/);
  });

  test('milestone quotes are shell-escaped and null milestone omits the flag', () => {
    const quotedSeen = [];
    select({ list: [], details: {}, seen: quotedSeen }, "Sprint 'Q2'");
    expect(quotedSeen[0]).toContain(`'Sprint '\\''Q2'\\'''`);

    const repoSeen = [];
    select({ list: [], details: {}, seen: repoSeen }, null);
    expect(repoSeen[0]).not.toContain('-m');
    expect(repoSeen[0]).toContain('--label automatable');
  });

  // @regression — issue #91
  test('never requests parent through gh issue view --json', () => {
    const seen = [];
    select({ list: [10], details: { 10: {} }, seen });
    const viewCommands = seen.filter((cmd) => /^issue view \d+/.test(cmd));
    expect(viewCommands.length).toBeGreaterThan(0);
    for (const cmd of viewCommands) {
      const fields = cmd.match(/--json (\S+)/)?.[1]?.split(',') || [];
      expect(fields).not.toContain('parent');
    }
    expect(seen.some((cmd) => cmd.startsWith('api graphql'))).toBe(true);
  });
});
