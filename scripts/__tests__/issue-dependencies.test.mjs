import { describe, expect, it } from '@jest/globals';

import {
  applyBlockedByEdges,
  createIssueDependencyClient,
  eligibleIssues,
  issueDependencyStatus,
  parseLegacyDependencyEvidence,
  preflightBlockedByEdges,
  readDependencyGraph,
} from '../issue-dependencies.mjs';

function result(value, status = 0) {
  return { status, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' };
}

function fixture({ issues, blockers = {}, fail = () => false } = {}) {
  const calls = [];
  const byNumber = new Map(issues.map((issue) => [issue.number, {
    id: issue.id ?? issue.number * 100,
    number: issue.number,
    state: issue.state ?? 'open',
    title: issue.title ?? `Issue ${issue.number}`,
    body: issue.body ?? '',
    repository_url: 'https://api.github.com/repos/acme/widgets',
  }]));
  const run = (command, args) => {
    calls.push([command, args]);
    if (fail(command, args, calls)) return result('', 1);
    if (args[0] === 'repo') return result({ nameWithOwner: 'acme/widgets' });
    if (args[0] === 'api' && args.length === 2) {
      const number = Number(args[1].split('/').at(-1));
      return byNumber.has(number) ? result(byNumber.get(number)) : result('', 1);
    }
    if (args.includes('--paginate')) {
      const number = Number(args.find((arg) => /dependencies\/blocked_by$/.test(arg)).match(/issues\/(\d+)/)[1]);
      return result([(blockers[number] ?? []).map((blocker) => byNumber.get(blocker))]);
    }
    if (args.includes('--method')) return result({});
    return result('', 1);
  };
  return { run, calls };
}

function clientGraph(input) {
  const f = fixture(input);
  const client = createIssueDependencyClient({ cwd: '/repo', run: f.run });
  return { ...f, client, graph: readDependencyGraph(client, [input.issues[0].number]) };
}

describe('official blocked-by adapter', () => {
  it('reads every paginated blocked-by response with explicit GET argv and normalizes REST ids', () => {
    const f = clientGraph({
      issues: [{ number: 3, id: 301 }, { number: 7, id: 701, state: 'closed' }],
      blockers: { 3: [7] },
    });
    expect(f.graph.nodes).toEqual([
      { id: 301, number: 3, state: 'OPEN', repository: 'acme/widgets', title: 'Issue 3' },
      { id: 701, number: 7, state: 'CLOSED', repository: 'acme/widgets', title: 'Issue 7' },
    ]);
    expect(f.calls.some(([, args]) => args.includes('--paginate') && args.includes('--slurp') && args.includes('per_page=100') && args.includes('GET'))).toBe(true);
  });

  it('recursively loads open blockers and leaves independent or closed-blocked issues eligible', () => {
    const f = fixture({ issues: [{ number: 2 }, { number: 3 }, { number: 5, state: 'closed' }], blockers: { 2: [3], 3: [5] } });
    const graph = readDependencyGraph(createIssueDependencyClient({ cwd: '/repo', run: f.run }), [2]);
    expect(issueDependencyStatus(graph, 2)).toEqual({ status: 'blocked', reasonCode: 'dependency_blocked', openBlockers: [3] });
    expect(issueDependencyStatus(graph, 3)).toEqual({ status: 'eligible', reasonCode: null, openBlockers: [] });
    expect(eligibleIssues(graph, [{ number: 2 }, { number: 3 }])).toEqual([{ number: 3 }]);
  });

  it('rejects a canonical open cycle', () => {
    const f = fixture({ issues: [{ number: 7 }, { number: 3 }], blockers: { 7: [3], 3: [7] } });
    expect(() => readDependencyGraph(createIssueDependencyClient({ cwd: '/repo', run: f.run }), [7]))
      .toThrow(expect.objectContaining({ reasonCode: 'dependency_cycle', cycle: [3, 7, 3] }));
  });

  it('fails closed for dangling and malformed evidence', () => {
    const missing = clientGraph({ issues: [{ number: 3 }], blockers: {} });
    expect(() => preflightBlockedByEdges(missing.graph, [{ issue: 3, blockedBy: 999 }]))
      .toThrow(expect.objectContaining({ reasonCode: 'dependency_dangling' }));

    const malformed = fixture({ issues: [{ number: 3 }] });
    const badRun = (command, args) => args.includes('--paginate') ? result('{', 0) : malformed.run(command, args);
    expect(() => readDependencyGraph(createIssueDependencyClient({ cwd: '/repo', run: badRun }), [3]))
      .toThrow(expect.objectContaining({ reasonCode: 'dependency_unreadable' }));
  });

  it('preflights merged edges and omits existing edges', () => {
    const f = clientGraph({ issues: [{ number: 2 }, { number: 3 }], blockers: { 2: [3] } });
    expect(preflightBlockedByEdges(f.graph, [{ issue: 2, blockedBy: 3 }])).toEqual([]);
    expect(() => preflightBlockedByEdges(f.graph, [{ issue: 3, blockedBy: 2 }]))
      .toThrow(expect.objectContaining({ reasonCode: 'dependency_cycle' }));
  });

  it('POSTs numeric REST database ids and rolls back only newly added edges', () => {
    let postCount = 0;
    const f = fixture({
      issues: [{ number: 2, id: 222 }, { number: 3, id: 333 }, { number: 4, id: 444 }],
      fail: (_command, args) => {
        if (args.includes('POST')) postCount += 1;
        return args.includes('POST') && postCount === 2;
      },
    });
    const client = createIssueDependencyClient({ cwd: '/repo', run: f.run });
    expect(() => applyBlockedByEdges(client, [{ issue: 2, blockedBy: 3 }, { issue: 2, blockedBy: 4 }]))
      .toThrow(expect.objectContaining({ reasonCode: 'dependency_apply_failed' }));
    const writes = f.calls.filter(([, args]) => args.includes('--method'));
    expect(writes[0][1]).toContain('issue_id=333');
    expect(writes.at(-1)[1]).toContain('DELETE');
  });

  it('classifies thrown POST and rollback transport failures with exact partial evidence', () => {
    const f = fixture({
      issues: [{ number: 2, id: 222 }, { number: 3, id: 333 }, { number: 4, id: 444 }],
    });
    let postCount = 0;
    const throwingRun = (command, args) => {
      if (args.includes('POST') && ++postCount === 2) throw new Error('connection reset');
      if (args.includes('DELETE')) throw new Error('rollback unavailable');
      return f.run(command, args);
    };
    const client = createIssueDependencyClient({ cwd: '/repo', run: throwingRun });
    let failure;
    try {
      applyBlockedByEdges(client, [{ issue: 2, blockedBy: 3 }, { issue: 2, blockedBy: 4 }]);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      reasonCode: 'dependency_apply_partial',
      applied: [{ issue: 2, blockedBy: 3 }],
      remaining: [{ issue: 2, blockedBy: 4 }, { issue: 2, blockedBy: 3 }],
    });
  });

  it('keeps legacy text migration-only and ignores fenced, quoted, and ambiguous prose', () => {
    expect(parseLegacyDependencyEvidence([
      'Depends on: #7',
      '> Depends on: #8',
      '```',
      'Blocks: #9',
      '```',
      'Requires #10 and #11',
    ].join('\n'))).toEqual({
      edges: [{ relation: 'blockedBy', issue: 7, source: 'Depends on: #7' }],
      findings: [{ line: 'Requires #10 and #11', reason: 'ambiguous_dependency_evidence' }],
    });
  });
});
