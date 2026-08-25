import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDeliverCli, runDeliver } from '../sdlc-deliver.mjs';
import { validateHandoff } from '../sdlc-execute.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-deliver.mjs');
const H1 = '1'.repeat(40);
const H2 = '2'.repeat(40);

function verification(issue = 42, specPath = 'specs/42-delivery') {
  const scope = { issueNumber: issue, specPath, status: 'scoped', delivery: { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] }, regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] } };
  return `# Verification\n\n## Implementation Status: **Pass**\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(scope)} -->\n`;
}

function makeRoot({ issue = 42, version = '3.4.5', approvedMajor = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-deliver-'));
  const spec = path.join(root, 'specs', `${issue}-delivery`);
  fs.mkdirSync(spec, { recursive: true });
  const header = `**Issue**: #${issue}\n**Status**: Approved\n`;
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) fs.writeFileSync(path.join(spec, name), `${header}${approvedMajor && ['requirements.md', 'design.md'].includes(name) ? '**Version bump**: major\n' : ''}`);
  fs.writeFileSync(path.join(spec, 'verification-report.md'), verification(issue, `specs/${issue}-delivery`));
  fs.mkdirSync(path.join(root, 'steering'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steering', 'tech.md'), '# Tech\n| Predicate | Value | Meaning |\n| `bots` | `true` | bots |\n| `logins` | `["coderabbitai", "review-bot"]` | logins |\n| File | Path | Notes |\n| `VERSION` | file text | version |\n| `package.json` | `version` | version |\n');
  fs.writeFileSync(path.join(root, 'VERSION'), `${version}\n`);
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name: 'fixture', version }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
  return root;
}

function openPr({ head = H1, state = 'OPEN', issueState = 'OPEN', threads = [], reviews = [], mergeStateStatus = 'CLEAN', isDraft = false } = {}) {
  return { number: 77, url: 'https://github.test/owner/repo/pull/77', state, isDraft, headRefName: '42-delivery', headRefOid: head, baseRefName: 'main', mergeStateStatus, mergedAt: state === 'MERGED' ? '2026-08-25T00:00:00Z' : null, mergeCommit: state === 'MERGED' ? { oid: 'a'.repeat(40) } : null, reviewThreads: threads, reviews, issueState };
}

function fixture(options = {}) {
  const root = makeRoot(options);
  const calls = [];
  const sleeps = [];
  const issue = { number: 42, title: options.title ?? 'Ship deterministic delivery', body: options.body ?? '', labels: (options.labels ?? ['enhancement']).map((name) => ({ name })), state: 'OPEN', url: 'https://github.test/issues/42' };
  const views = [...(options.views ?? [openPr(), openPr(), openPr({ state: 'MERGED', issueState: 'CLOSED' })])];
  let lastView = views[views.length - 1] ?? openPr();
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') {
      if (args[0] === 'branch' && args[1] === '--show-current') return { status: 0, stdout: '42-delivery\n', stderr: '' };
      if (args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (args[0] === 'diff') return { status: 1, stdout: '', stderr: '' };
      if (args[0] === 'rev-parse' && args.includes('@{upstream}')) return { status: options.noUpstream ? 1 : 0, stdout: 'origin/42-delivery\n', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command !== 'gh') throw new Error(`unexpected command ${command}`);
    if (args[0] === 'issue' && args[1] === 'view' && args[4]?.includes('title')) return { status: 0, stdout: JSON.stringify(issue), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ number: 42, state: lastView.issueState, url: issue.url }), stderr: '' };
    if (args[0] === 'pr' && args[1] === 'list') return { status: 0, stdout: JSON.stringify(options.existingPr ? [openPr()] : []), stderr: '' };
    if (args[0] === 'pr' && args[1] === 'create') return { status: 0, stdout: 'https://github.test/pr/77\n', stderr: '' };
    if (args[0] === 'pr' && args[1] === 'view') { lastView = views.length ? views.shift() : lastView; return { status: 0, stdout: JSON.stringify(lastView), stderr: '' }; }
    if (args[0] === 'api' && args[1] === 'graphql') return { status: 0, stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: lastView.reviewThreads } } } } }), stderr: '' };
    if (args[0] === 'pr' && args[1] === 'checks') return { status: options.checksStatus ?? 0, stdout: JSON.stringify(options.checks ?? []), stderr: '' };
    if (args[0] === 'pr' && args[1] === 'merge') return { status: 0, stdout: '', stderr: '' };
    throw new Error(`unexpected gh args: ${args.join(' ')}`);
  };
  return { root, calls, sleeps, run, sleep: (milliseconds) => sleeps.push(milliseconds) };
}

function handoff(root) { return JSON.parse(fs.readFileSync(path.join(root, '.omp/sdlc/handoffs/42-deliver.json'), 'utf8')); }
const roots = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true }); });

describe('sdlc delivery controller', () => {
  test('parses only supported CLI forms and invalid CLI has no handoff', () => {
    expect(parseDeliverCli(['--issue', '#42'])).toEqual({ issue: 42, remediationResult: null });
    expect(parseDeliverCli(['--issue', '42', '--remediation-result', 'human_review'])).toEqual({ issue: 42, remediationResult: 'human_review' });
    const root = makeRoot(); roots.push(root);
    const result = spawnSync(process.execPath, [SCRIPT, '--issue', 'nope'], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('Usage: node scripts/sdlc-deliver.mjs --issue N [--remediation-result human_review]');
    expect(fs.existsSync(path.join(root, '.omp/sdlc/handoffs'))).toBe(false);
  });

  test('fails BREAKING major gate before mutation', () => {
    const f = fixture({ title: 'BREAKING API' }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('major_bump_required');
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.4.5');
    expect(f.calls.some((call) => call[1] === 'commit' || call[2] === 'create')).toBe(false);
  });

  test('bumps leftover spike and resumes existing PR idempotently', () => {
    const fresh = fixture({ labels: ['spike'] }); roots.push(fresh.root);
    expect(runDeliver({ issue: 42, cwd: fresh.root, run: fresh.run, fs, now: () => Date.parse('2026-08-25'), sleep: fresh.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(fresh.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
    expect(JSON.parse(fs.readFileSync(path.join(fresh.root, 'package.json'), 'utf8')).version).toBe('3.5.0');
    const resume = fixture({ existingPr: true }); roots.push(resume.root);
    expect(runDeliver({ issue: 42, cwd: resume.root, run: resume.run, fs, sleep: resume.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(resume.root, 'VERSION'), 'utf8').trim()).toBe('3.4.5');
    expect(resume.calls.some((call) => call[1] === 'commit' || call[2] === 'create')).toBe(false);
  });

  test('emits complete remediation JSON for failing checks and bot threads', () => {
    const thread = { id: 'T1', isResolved: false, isOutdated: false, path: 'src/a.mjs', line: 9, comments: [{ body: 'Fix this', url: 'https://github.test/thread/1', author: { login: 'review-bot', __typename: 'User' } }] };
    const f = fixture({ checksStatus: 1, checks: [{ name: 'test', state: 'FAILURE', link: 'https://github.test/check/1', event: 'pull_request' }], views: [openPr({ threads: [thread] })] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.status).toBe(3);
    expect(result.stdout.match(/NMG_SDLC_REMEDIATION:/g)).toHaveLength(1);
    expect(result.remediation).toMatchObject({ schemaVersion: 1, kind: 'remediation_required', issue: 42, pullRequest: 77, headSha: H1, failingChecks: [{ name: 'test', url: 'https://github.test/check/1' }], threads: [{ path: 'src/a.mjs', line: 9, body: 'Fix this', url: 'https://github.test/thread/1' }], handoffPath: '.omp/sdlc/handoffs/42-deliver.json' });
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/handoffs/42-deliver.json'))).toBe(false);
  });

  test('fetches threads through GraphQL and scopes checks to exact required arguments', () => {
    const f = fixture({ checksStatus: 1, checks: [{ name: 'test', state: 'FAILURE', link: 'https://github.test/check/1', event: 'pull_request' }], views: [openPr()] }); roots.push(f.root);
    expect(runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(3);
    const prView = f.calls.find((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'view');
    expect(prView.join(',')).not.toContain('reviewThreads');
    const graphql = f.calls.find((call) => call[0] === 'gh' && call[1] === 'api');
    expect(graphql.slice(0, 10)).toEqual(['gh', 'api', 'graphql', '-F', 'owner=owner', '-F', 'name=repo', '-F', 'number=77', '-f']);
    expect(graphql[10]).toContain('reviewThreads(first: 100)');
    expect(f.calls.find((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'checks')).toEqual([
      'gh', 'pr', 'checks', '77', '--required', '--json', 'name,state,bucket,link,event',
    ]);
  });

  test('routes pathless automated review threads to human_review', () => {
    const thread = { id: 'T1', isResolved: false, isOutdated: false, path: null, line: null, comments: [{ body: 'General concern', url: 'https://github.test/thread/1', author: { login: 'review-bot', __typename: 'User' } }] };
    const f = fixture({ views: [openPr({ threads: [thread] })] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('human_review');
    expect(result.status).toBe(1);
  });

  test('routes human and ambiguous remediation to human_review', () => {
    const thread = { id: 'T1', isResolved: false, isOutdated: false, comments: [{ body: 'Redesign', author: { login: 'maintainer', __typename: 'User' } }] };
    const f = fixture({ views: [openPr({ threads: [thread] })] }); roots.push(f.root);
    expect(runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep }).handoff.reasonCode).toBe('human_review');
    const explicit = makeRoot(); roots.push(explicit);
    const result = runDeliver({ issue: 42, cwd: explicit, run: () => { throw new Error('must not run'); }, fs, remediationResult: 'human_review' });
    expect(result.handoff.reasonCode).toBe('human_review');
    expect(validateHandoff(result.handoff)).toEqual(result.handoff);
  });

  test('bounds pending delivery with injected 30-second sleeps', () => {
    const f = fixture({ views: [openPr({ mergeStateStatus: 'UNKNOWN', isDraft: true })] }); roots.push(f.root);
    let current = 0;
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, now: () => current, sleep: (milliseconds) => { f.sleeps.push(milliseconds); current += milliseconds; } });
    expect(result.handoff.reasonCode).toBe('delivery_pending');
    expect(f.sleeps).toHaveLength(120);
    expect(new Set(f.sleeps)).toEqual(new Set([30_000]));
  });

  test('reclassifies changed head and merges exact latest head', () => {
    const f = fixture({ views: [openPr({ head: H1 }), openPr({ head: H2 }), openPr({ head: H2 }), openPr({ head: H2 }), openPr({ head: H2, state: 'MERGED', issueState: 'CLOSED' })] }); roots.push(f.root);
    expect(runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(0);
    expect(f.calls.find((call) => call[0] === 'gh' && call[2] === 'merge')).toEqual(['gh', 'pr', 'merge', '77', '--squash', '--match-head-commit', H2]);
    const proof = f.calls.map((call) => call.join(' ')).lastIndexOf('gh issue view 42 --json number,state,url');
    expect(f.calls.findIndex((call) => call.join(' ') === 'git push origin --delete 42-delivery')).toBeGreaterThan(proof);
  });

  test('requires merge and closure proof before local branch deletion', () => {
    const failed = fixture({ views: [openPr(), openPr(), openPr({ state: 'MERGED', issueState: 'OPEN' })] }); roots.push(failed.root);
    expect(runDeliver({ issue: 42, cwd: failed.root, run: failed.run, fs, sleep: failed.sleep }).handoff.reasonCode).toBe('merge_failed');
    expect(failed.calls.some((call) => call[0] === 'git' && call[1] === 'checkout')).toBe(false);
    const passed = fixture(); roots.push(passed.root);
    expect(runDeliver({ issue: 42, cwd: passed.root, run: passed.run, fs, sleep: passed.sleep }).status).toBe(0);
    expect(validateHandoff(handoff(passed.root))).toEqual(handoff(passed.root));
    const proof = passed.calls.map((call) => call.join(' ')).lastIndexOf('gh issue view 42 --json number,state,url');
    expect(passed.calls.findIndex((call) => call[0] === 'git' && call[1] === 'checkout')).toBeGreaterThan(proof);
    expect(passed.calls.findIndex((call) => call.join(' ') === 'git push origin --delete 42-delivery')).toBeGreaterThan(proof);
  });
});
