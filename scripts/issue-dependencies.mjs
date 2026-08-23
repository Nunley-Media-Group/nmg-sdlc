import { spawnSync } from 'node:child_process';

const POSITIVE = /^[1-9]\d*$/;

export class IssueDependencyError extends Error {
  constructor(reasonCode, message, evidence = {}) {
    super(message);
    this.name = 'IssueDependencyError';
    this.reasonCode = reasonCode;
    Object.assign(this, evidence);
  }
}

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function positiveInteger(value) {
  const parsed = typeof value === 'number' ? value : POSITIVE.test(String(value ?? '').trim()) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseResult(result, description) {
  if (!result || result.status !== 0) {
    throw new IssueDependencyError('dependency_unreadable', `${description} failed`);
  }
  try {
    return JSON.parse(result.stdout || 'null');
  } catch {
    throw new IssueDependencyError('dependency_unreadable', `${description} returned malformed JSON`);
  }
}

function repositoryFromUrl(value) {
  const match = String(value ?? '').match(/\/repos\/([^/]+\/[^/]+)$/);
  return match?.[1] ?? null;
}

function normalizeState(value) {
  const state = String(value ?? '').toUpperCase();
  return state === 'OPEN' || state === 'CLOSED' ? state : null;
}

function normalizeIssue(raw, repository, { dependency = false } = {}) {
  const id = positiveInteger(raw?.id);
  const number = positiveInteger(raw?.number);
  const state = normalizeState(raw?.state);
  const recordRepository = raw?.repository?.nameWithOwner
    ?? raw?.repository
    ?? repositoryFromUrl(raw?.repository_url)
    ?? repository;
  if (!id || !number || !state || recordRepository !== repository) {
    const reasonCode = dependency && number ? 'dependency_dangling' : 'dependency_unreadable';
    throw new IssueDependencyError(reasonCode, `Invalid dependency metadata for issue #${number ?? '?'}`, {
      edgeTarget: number ?? null,
    });
  }
  return Object.freeze({
    id,
    number,
    state,
    repository,
    title: typeof raw.title === 'string' ? raw.title : '',
  });
}

function flattenPages(value) {
  if (!Array.isArray(value)) throw new IssueDependencyError('dependency_unreadable', 'Dependency response is not an array');
  if (value.every(Array.isArray)) return value.flat();
  if (value.some(Array.isArray)) throw new IssueDependencyError('dependency_unreadable', 'Dependency pagination response is malformed');
  return value;
}

function runJson(client, args, description) {
  return parseResult(client.run('gh', args, { cwd: client.cwd }), description);
}

export function createIssueDependencyClient({ cwd = process.cwd(), run = defaultRun } = {}) {
  const repo = parseResult(run('gh', ['repo', 'view', '--json', 'nameWithOwner'], { cwd }), 'Repository lookup');
  if (typeof repo?.nameWithOwner !== 'string' || !/^[^/]+\/[^/]+$/.test(repo.nameWithOwner)) {
    throw new IssueDependencyError('dependency_unreadable', 'Repository identity is unreadable');
  }
  return {
    cwd,
    run,
    repository: repo.nameWithOwner,
    issueCache: new Map(),
    blockedByCache: new Map(),
  };
}

function readIssue(client, issueNumber) {
  const number = positiveInteger(issueNumber);
  if (!number) throw new IssueDependencyError('dependency_unreadable', `Invalid issue number: ${issueNumber}`);
  const raw = runJson(client, ['api', `repos/${client.repository}/issues/${number}`], `Issue #${number}`);
  const issue = normalizeIssue(raw, client.repository, { dependency: true });
  if (issue.number !== number) {
    throw new IssueDependencyError('dependency_dangling', `Issue #${number} resolved as #${issue.number}`, { edgeTarget: number });
  }
  client.issueCache.set(number, issue);
  return issue;
}

export function readBlockedBy(client, issueNumber) {
  const issue = readIssue(client, issueNumber);
  if (client.blockedByCache.has(issue.number)) return client.blockedByCache.get(issue.number);
  const endpoint = `repos/${client.repository}/issues/${issue.number}/dependencies/blocked_by`;
  const pages = runJson(client, ['api', '--method', 'GET', '--paginate', '--slurp', '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint, '-f', 'per_page=100'], `Blocked-by dependencies for #${issue.number}`);
  const blockers = flattenPages(pages)
    .map((raw) => normalizeIssue(raw, client.repository, { dependency: true }))
    .sort((left, right) => left.number - right.number);
  const unique = Object.freeze(blockers.filter((blocker, index) => index === 0 || blocker.number !== blockers[index - 1].number));
  for (const blocker of unique) client.issueCache.set(blocker.number, blocker);
  client.blockedByCache.set(issue.number, unique);
  return unique;
}

function freezeGraph(repository, nodes, edges) {
  return Object.freeze({
    repository,
    nodes: Object.freeze([...nodes.values()].sort((a, b) => a.number - b.number)),
    edges: Object.freeze([...edges.values()].sort((a, b) => a.issue - b.issue || a.blockedBy - b.blockedBy)),
  });
}

export function readDependencyGraph(client, issueNumbers, { allIssues = null } = {}) {
  const queue = [...new Set((issueNumbers ?? []).map(positiveInteger))];
  if (queue.some((number) => number === null)) throw new IssueDependencyError('dependency_unreadable', 'Invalid requested issue number');
  const nodes = new Map();
  const edges = new Map();
  if (Array.isArray(allIssues)) {
    for (const raw of allIssues) {
      const issue = normalizeIssue(raw, client.repository);
      nodes.set(issue.number, issue);
      client.issueCache.set(issue.number, issue);
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const number = queue[index];
    const issue = readIssue(client, number);
    nodes.set(number, issue);
    for (const blocker of readBlockedBy(client, number)) {
      nodes.set(blocker.number, blocker);
      edges.set(`${number}:${blocker.number}`, Object.freeze({ issue: number, blockedBy: blocker.number }));
      if (blocker.state === 'OPEN' && !queue.includes(blocker.number)) queue.push(blocker.number);
    }
  }
  return validateDependencyGraph(freezeGraph(client.repository, nodes, edges));
}

function graphMaps(graph) {
  const nodes = new Map((graph?.nodes ?? []).map((node) => [positiveInteger(node?.number), node]));
  const edges = (graph?.edges ?? []).map((edge) => ({ issue: positiveInteger(edge?.issue), blockedBy: positiveInteger(edge?.blockedBy) }));
  return { nodes, edges };
}

function canonicalCycle(cycle) {
  const path = cycle.slice(0, -1);
  const minimum = Math.min(...path);
  const index = path.indexOf(minimum);
  const rotated = [...path.slice(index), ...path.slice(0, index)];
  return [...rotated, rotated[0]];
}

export function validateDependencyGraph(graph) {
  const { nodes, edges } = graphMaps(graph);
  for (const [number, node] of nodes) {
    if (!number || !positiveInteger(node?.id) || !normalizeState(node?.state) || node?.repository !== graph?.repository) {
      throw new IssueDependencyError('dependency_unreadable', 'Graph contains invalid issue metadata');
    }
  }
  for (const edge of edges) {
    if (!edge.issue || !edge.blockedBy || !nodes.has(edge.issue) || !nodes.has(edge.blockedBy)) {
      throw new IssueDependencyError('dependency_dangling', `Dependency edge #${edge.issue ?? '?'} -> #${edge.blockedBy ?? '?'} is dangling`, { edge: [edge.issue, edge.blockedBy] });
    }
    if (edge.issue === edge.blockedBy) {
      throw new IssueDependencyError('dependency_cycle', `Dependency cycle: #${edge.issue} -> #${edge.issue}`, { cycle: [edge.issue, edge.issue] });
    }
  }
  const open = new Set([...nodes].filter(([, node]) => node.state === 'OPEN').map(([number]) => number));
  const adjacency = new Map([...open].map((number) => [number, []]));
  for (const edge of edges) if (open.has(edge.issue) && open.has(edge.blockedBy)) adjacency.get(edge.issue).push(edge.blockedBy);
  for (const targets of adjacency.values()) targets.sort((a, b) => a - b);
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (number) => {
    if (visiting.has(number)) {
      const cycle = canonicalCycle([...stack.slice(stack.indexOf(number)), number]);
      throw new IssueDependencyError('dependency_cycle', `Dependency cycle: ${cycle.map((item) => `#${item}`).join(' -> ')}`, { cycle });
    }
    if (visited.has(number)) return;
    visiting.add(number);
    stack.push(number);
    for (const target of adjacency.get(number) ?? []) visit(target);
    stack.pop();
    visiting.delete(number);
    visited.add(number);
  };
  for (const number of [...open].sort((a, b) => a - b)) visit(number);
  return graph;
}

export function issueDependencyStatus(graph, issueNumber) {
  try {
    validateDependencyGraph(graph);
  } catch (error) {
    if (error?.reasonCode === 'dependency_cycle') return { status: 'blocked', reasonCode: error.reasonCode, cycle: error.cycle };
    if (error?.reasonCode === 'dependency_dangling') return { status: 'blocked', reasonCode: error.reasonCode, edge: error.edge };
    return { status: 'unknown', reasonCode: 'dependency_unreadable' };
  }
  const number = positiveInteger(issueNumber);
  const nodes = new Map(graph.nodes.map((node) => [node.number, node]));
  if (!number || !nodes.has(number)) return { status: 'unknown', reasonCode: 'dependency_unreadable' };
  const openBlockers = graph.edges
    .filter((edge) => edge.issue === number && nodes.get(edge.blockedBy)?.state === 'OPEN')
    .map((edge) => edge.blockedBy)
    .sort((a, b) => a - b);
  return openBlockers.length
    ? { status: 'blocked', reasonCode: 'dependency_blocked', openBlockers }
    : { status: 'eligible', reasonCode: null, openBlockers: [] };
}

export function eligibleIssues(graph, issues) {
  validateDependencyGraph(graph);
  return [...(issues ?? [])]
    .filter((issue) => issueDependencyStatus(graph, issue.number).status === 'eligible')
    .sort((left, right) => left.number - right.number);
}

export function preflightBlockedByEdges(graph, proposedEdges) {
  const existing = new Set(graph.edges.map((edge) => `${edge.issue}:${edge.blockedBy}`));
  const additions = [];
  for (const raw of proposedEdges ?? []) {
    const edge = { issue: positiveInteger(raw?.issue), blockedBy: positiveInteger(raw?.blockedBy) };
    if (!edge.issue || !edge.blockedBy || !graph.nodes.some((node) => node.number === edge.issue) || !graph.nodes.some((node) => node.number === edge.blockedBy)) {
      throw new IssueDependencyError('dependency_dangling', `Proposed dependency edge is dangling`, { edge: [edge.issue, edge.blockedBy] });
    }
    const key = `${edge.issue}:${edge.blockedBy}`;
    if (!existing.has(key)) {
      existing.add(key);
      additions.push(Object.freeze(edge));
    }
  }
  validateDependencyGraph(freezeGraph(graph.repository, new Map(graph.nodes.map((node) => [node.number, node])), new Map([...existing].map((key) => {
    const [issue, blockedBy] = key.split(':').map(Number);
    return [key, { issue, blockedBy }];
  }))));
  return Object.freeze(additions.sort((a, b) => a.issue - b.issue || a.blockedBy - b.blockedBy));
}

function apiWrite(client, method, edge) {
  try {
    const endpoint = `repos/${client.repository}/issues/${edge.issue}/dependencies/blocked_by`;
    const blocker = readIssue(client, edge.blockedBy);
    const args = ['api', '--method', method, '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint, '-F', `issue_id=${blocker.id}`];
    const result = client.run('gh', args, { cwd: client.cwd });
    return result?.status === 0;
  } catch {
    return false;
  }
}

export function applyBlockedByEdges(client, edges) {
  const applied = [];
  for (const edge of edges ?? []) {
    if (apiWrite(client, 'POST', edge)) {
      applied.push(edge);
      continue;
    }
    const rollbackFailed = [];
    for (const added of [...applied].reverse()) if (!apiWrite(client, 'DELETE', added)) rollbackFailed.push(added);
    const reasonCode = rollbackFailed.length ? 'dependency_apply_partial' : 'dependency_apply_failed';
    throw new IssueDependencyError(reasonCode, `Failed to apply blocked-by edge #${edge.issue} -> #${edge.blockedBy}`, {
      applied: applied.filter((added) => rollbackFailed.includes(added)),
      remaining: [edge, ...rollbackFailed],
    });
  }
  return Object.freeze([...applied]);
}

function stripIgnoredProse(body) {
  return String(body ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');
}

export function parseLegacyDependencyEvidence(body) {
  const edges = [];
  const findings = [];
  for (const line of stripIgnoredProse(body).split(/\r?\n/)) {
    const field = line.match(/^\s*(Depends on|Blocked by|Requires|After|Precursor|Blocks):\s*(.+?)\s*$/i);
    const clause = field ?? line.match(/\b(blocked by|depends on|requires|after|precursor)\b.*#([1-9]\d*)\b/i);
    if (!clause) continue;
    const refs = [...String(field ? field[2] : line).matchAll(/#([1-9]\d*)/g)].map((match) => Number(match[1]));
    if (refs.length === 0 || (!field && refs.length !== 1)) {
      findings.push({ line: line.trim(), reason: 'ambiguous_dependency_evidence' });
      continue;
    }
    const relation = String(field ? field[1] : clause[1]).toLowerCase();
    for (const issue of refs) {
      edges.push({ relation: relation === 'blocks' ? 'blocks' : 'blockedBy', issue, source: line.trim() });
    }
  }
  return { edges, findings };
}
