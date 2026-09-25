import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from '@jest/globals';

import { parseDeliverCli, runDeliver } from '../sdlc-deliver.mjs';
import { inspectIssueSpecScope } from '../issue-spec-scope.mjs';
import { canonicalJson } from '../../src/sdlc-steering-runtime.mjs';
const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-deliver.mjs');

const roots = [];
const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function fixture({ pending = false, unpublishedPending = false, smokeStatus = 'passed', remoteIssueState = 'OPEN', existing = false, lostAck = false, checksState = 'SUCCESS', smokeOwned = false, humanReview = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-delivery-current-'));
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-delivery-remote-'));
  roots.push(root, remote);
  git(remote, 'init', '--bare', '-q');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'Test Author');
  git(root, 'config', 'user.email', 'test@example.test');
  fs.writeFileSync(path.join(root, '.gitignore'), '.omp/\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# Base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'chore: base');
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-q', '-u', 'origin', 'main');
  git(root, 'checkout', '-qb', 'feature/42-delivery');
  const spec = 'specs/42-delivery';
  fs.mkdirSync(path.join(root, spec), { recursive: true });
  const header = '**Issue**: #42\n**Status**: Approved\n\n';
  const documents = {
    'requirements.md': '### AC1: Deliver verified changes\n\n| FR1 | Deliver current evidence | Must |\n',
    'design.md': 'Publish exact-head verification before delivery.\n',
    'tasks.md': '### T001: Deliver verified changes\n\n**File(s)**: `scripts/sdlc-deliver.mjs`, `VERSION`, `CHANGELOG.md`, `package.json`\n',
    'feature.gherkin': 'Feature: Delivery\n  Scenario: Deliver current evidence\n    Given verification passed\n    When delivery runs\n    Then verified changes are delivered\n',
  };
  for (const [name, text] of Object.entries(documents)) fs.writeFileSync(path.join(root, spec, name), `${header}${text}`);
  fs.mkdirSync(path.join(root, 'steering', 'snippets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'steering', 'modules'), { recursive: true });
  for (const name of ['product.mjs', 'tech.mjs', 'structure.mjs', 'verification.mjs']) {
    fs.writeFileSync(path.join(root, 'steering', 'modules', name), 'export default {};\n');
  }
  const tech = '# Tech\n\n## Versioning\n\n| File | Path | Notes |\n|------|------|-------|\n| `VERSION` | file text | version |\n| `package.json` | `version` | version |\n';
  fs.writeFileSync(path.join(root, 'steering', 'snippets', 'project-tech.md'), tech);
  const validations = [
    { id: 'repository.tests', provider: 'builtin.command', required: true, when: { kind: 'always' }, config: { program: 'node', args: ['--version'] } },
    { id: 'repository.nmg-sdlc-smoke', provider: 'project.nmg-sdlc-smoke', required: true, when: { kind: 'always' }, config: { issue: 42 } },
  ];
  const manifest = {
    schemaVersion: 1, runtimeVersion: '1', modules: [], extensions: [],
    snippets: [{ id: 'project.tech', path: 'steering/snippets/project-tech.md', consumers: ['worker:deliver'] }],
    validations,
  };
  fs.writeFileSync(path.join(root, 'steering', 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  fs.writeFileSync(path.join(root, 'VERSION'), '3.4.5\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture","version":"3.4.5"}\n');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
  fs.writeFileSync(path.join(root, 'CONTRIBUTING.md'), '# Contributing\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'feat: implement delivery #42');
  const sourceHead = git(root, 'rev-parse', 'HEAD');
  const scope = inspectIssueSpecScope({ projectRoot: root, issueNumber: 42, specPath: spec });
  const projection = Object.fromEntries(['issueNumber', 'specPath', 'status', 'delivery', 'regression'].map((key) => [key, scope[key]]));
  const local = { ...projection.delivery, regression: projection.regression, tests: 'pass', steeringGates: 'pass' };
  const identity = { kind: 'required_check', name: 'contract-tests', event: 'pull_request', acceptanceCriteria: ['AC1'] };
  const readiness = pending ? {
    schemaVersion: 1, state: 'pr_evidence_pending', issueNumber: 42, specPath: spec,
    local, pendingEvidence: [identity],
  } : null;
  const report = `# Verification\n\n## Implementation Status: **${pending ? 'PR Evidence Pending' : 'Pass'}**\n\n**Verification head**: ${sourceHead}\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(projection)} -->\n${readiness ? `<!-- nmg-sdlc-pr-readiness: ${JSON.stringify(readiness)} -->\n` : ''}`;
  fs.writeFileSync(path.join(root, spec, 'verification-report.md'), report);
  if (!unpublishedPending) {
    git(root, 'add', '--', `${spec}/verification-report.md`);
    git(root, 'commit', '-qm', 'docs: record verification for #42');
  }
  git(root, 'push', '-q', '-u', 'origin', 'HEAD:refs/heads/feature/42-delivery');
  const specHash = sha(['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md']
    .map((name) => `${name}\0${fs.readFileSync(path.join(root, spec, name))}`).join('\0'));
  const steeringHash = sha([
    'steering/manifest.json', 'steering/snippets/project-tech.md',
  ].map((name) => `${name}\0${fs.readFileSync(path.join(root, name))}`).join('\0'));
  const results = validations.map((declaration) => {
    const requestIdentity = {
      headSha: sourceHead, treeState: 'clean', dirtyDiffHash: null,
      specHash, steeringHash, validationConfigHash: sha(canonicalJson(declaration)),
    };
    const request = {
      schemaVersion: 1, validationId: declaration.id, projectRoot: fs.realpathSync(root),
      config: declaration.config, identity: requestIdentity,
      verification: {
        runId: `verification-${createHash('sha256').update(`${fs.realpathSync(root)}\0${42}\0${spec}\0${sourceHead}`).digest('hex')}`,
        issue: 42, specPath: spec,
      },
    };
    const status = declaration.id === 'repository.nmg-sdlc-smoke' ? smokeStatus : 'passed';
    return {
      id: declaration.id, provider: declaration.provider, required: true, applicable: true,
      effectiveStatus: status, request,
      result: { schemaVersion: 1, status, summary: status === 'passed' ? 'Validation passed' : 'Smoke failed',
        identity: requestIdentity, evidence: ['https://github.test/checks/42'] },
    };
  });
  const artifact = {
    schemaVersion: 1, issue: 42, identity: { headSha: sourceHead, steeringHash, specHash },
    changedPaths: [], results,
    coverage: { declared: 2, recorded: 2, complete: true, missing: [], duplicate: [], unknown: [] },
    ceiling: smokeStatus === 'passed' ? null : 'Fail',
  };
  fs.mkdirSync(path.join(root, '.omp', 'sdlc', 'verification'), { recursive: true });
  fs.writeFileSync(path.join(root, '.omp/sdlc/verification/42.json'), `${JSON.stringify(artifact)}\n`);
  const calls = [];
  let issueState = remoteIssueState;
  let pr = existing ? {
    number: 77, title: 'Deliver verified changes', url: 'https://github.test/owner/repo/pull/77', state: 'OPEN',
    isDraft: pending, headRefName: 'feature/42-delivery', headRefOid: git(root, 'rev-parse', 'HEAD'),
    baseRefName: 'main', mergeStateStatus: 'CLEAN', mergedAt: null, mergeCommit: null,
    body: `Closes #42\n`,
  } : null;
  const issueUrl = 'https://github.test/owner/repo/issues/42';
  const issue = { number: 42, title: 'Deliver verified changes', body: '', labels: [{ name: 'enhancement' }], state: issueState, url: issueUrl };
  const success = [{ name: 'contract-tests', state: checksState, bucket: checksState === 'SUCCESS' ? 'pass' : 'fail', link: 'https://github.test/checks/77', event: 'pull_request' }];
  const run = (binary, args, opts = {}) => {
    calls.push([binary, ...args]);
    if (binary === 'git' || binary === process.execPath) {
      const result = spawnSync(binary, args, { cwd: opts.cwd ?? root, encoding: 'utf8' });
      if (binary === 'git' && args[0] === 'push' && result.status === 0 && pr?.state === 'OPEN') {
        pr.headRefOid = git(root, 'rev-parse', 'HEAD');
      }
      return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    }
    if (binary !== 'gh') throw new Error(`Unexpected binary ${binary}`);
    if (args[0] === 'repo') return {
      status: 0,
      stdout: args.includes('--jq') ? 'main\n'
        : JSON.stringify({ url: 'https://github.test/owner/repo', defaultBranchRef: { name: 'main' } }),
      stderr: '',
    };
    if (args[0] === 'issue' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ ...issue, state: issueState }), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'close') { issueState = 'CLOSED'; return { status: 0, stdout: '', stderr: '' }; }
    if (args[0] === 'pr' && args[1] === 'list') return { status: 0, stdout: JSON.stringify(pr ? [pr] : []), stderr: '' };
    if (args[0] === 'pr' && args[1] === 'create') {
      const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      pr = { number: 77, title: issue.title, url: 'https://github.test/owner/repo/pull/77', state: 'OPEN',
        isDraft: args.includes('--draft'), headRefName: 'feature/42-delivery', headRefOid: git(root, 'rev-parse', 'HEAD'),
        baseRefName: 'main', mergeStateStatus: 'CLEAN', mergedAt: null, mergeCommit: null, body };
      return { status: 0, stdout: `${pr.url}\n`, stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ ...pr,
      closingIssuesReferences: [{ number: 42, url: issueUrl }] }), stderr: '' };
    if (args[0] === 'pr' && args[1] === 'edit') {
      pr.body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'checks') return { status: 0, stdout: JSON.stringify(success), stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { status: 0, stdout: JSON.stringify({ data: { repository: { pullRequest: {
      reviews: { nodes: humanReview ? [{
        id: 'human-review', author: { login: 'reviewer', __typename: 'User' },
        state: 'CHANGES_REQUESTED', submittedAt: '2026-09-25T00:00:00Z',
      }] : [], pageInfo: { hasNextPage: false } },
      reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
    } } } }), stderr: '' };
    if (args[0] === 'pr' && args[1] === 'ready') { pr.isDraft = false; return { status: 0, stdout: '', stderr: '' }; }
    if (args[0] === 'pr' && args[1] === 'merge') {
      if (smokeOwned) {
        const receipt = JSON.parse(fs.readFileSync(path.join(root, '.omp/sdlc/smoke-deliveries/42.json'), 'utf8'));
        if (receipt.pullRequest !== 77 || receipt.headSha !== git(root, 'rev-parse', 'HEAD')) {
          throw new Error('Smoke receipt was not written before exact-head merge');
        }
      }
      if (args[args.indexOf('--match-head-commit') + 1] !== git(root, 'rev-parse', 'HEAD')) throw new Error('Attempted merge at wrong head');
      pr.state = 'MERGED'; pr.mergedAt = '2026-09-25T00:00:00Z'; pr.mergeCommit = { oid: 'a'.repeat(40) };
      issueState = 'CLOSED';
      return { status: lostAck ? 1 : 0, stdout: '', stderr: lostAck ? 'connection reset' : '' };
    }
    throw new Error(`Unexpected gh ${args.join(' ')}`);
  };
  return {
    root, sourceHead, get currentHead() { return git(root, 'rev-parse', 'HEAD'); },
    run, calls, get pr() { return pr; }, get issueState() { return issueState; },
    env: smokeOwned ? { NMG_SDLC_SMOKE_OWNED: '1', NMG_SDLC_SMOKE_RECOVERY: `${'a'.repeat(64)}.${'b'.repeat(64)}` } : {},
  };
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const deliveryCalls = (f, verb) => f.calls.filter((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === verb);

describe('live issue delivery', () => {
  test('CLI accepts branch-first standalone and preparation modes, rejects removed session cursor', () => {
    expect(parseDeliverCli(['--issue', '42'])).toEqual({ action: 'deliver', issue: 42 });
    expect(parseDeliverCli(['prepare-version', '--issue', '42'])).toEqual({ action: 'prepare-version', issue: 42 });
    expect(parseDeliverCli(['prepare-pr-evidence', '--issue', '42'])).toEqual({ action: 'prepare-pr-evidence', issue: 42 });
    expect(() => parseDeliverCli(['session-init', '--issue', '42'])).toThrow();
    expect(() => parseDeliverCli(['--issue', '42', '--session-token', 'abc'])).toThrow();
  });

  test('actual standalone CLI prepares and publishes version before the verification gate', () => {
    const f = fixture();
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-gh-delivery-'));
    roots.push(bin);
    const mockGh = path.join(bin, 'gh');
    fs.writeFileSync(mockGh, `#!/usr/bin/env node
const args = process.argv.slice(2);
let value;
if (args[0] === 'repo' && args[1] === 'view') value = { url: 'https://github.test/owner/repo' };
else if (args[0] === 'issue' && args[1] === 'view') value = {
  number: 42, title: 'Deliver verified changes', body: '', labels: [{ name: 'enhancement' }],
  state: 'OPEN', url: 'https://github.test/owner/repo/issues/42',
};
else if (args[0] === 'pr' && args[1] === 'list') value = [];
else { console.error('Unexpected gh command: ' + args.join(' ')); process.exit(2); }
console.log(JSON.stringify(value));
`);
    fs.chmodSync(mockGh, 0o755);
    const result = spawnSync(process.execPath, [SCRIPT, 'prepare-version', '--issue', '42'], {
      cwd: f.root,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('NMG_SDLC_VERSION_PREPARED: ');
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8')).toBe('3.5.0\n');
    expect(git(f.root, 'ls-remote', '--exit-code', 'origin', 'refs/heads/feature/42-delivery'))
      .toContain(f.currentHead);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/handoffs/42-deliver.json'))).toBe(false);
  });

  test('normal delivery uses live branch and full registered gate, merges exact head and closes linked issue', () => {
    const f = fixture();
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(f.pr.headRefOid).toBe(f.currentHead);
    expect(deliveryCalls(f, 'merge')).toHaveLength(1);
    expect(deliveryCalls(f, 'merge')[0]).toContain(f.currentHead);
    expect(f.issueState).toBe('CLOSED');
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(false);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/run.json'))).toBe(false);
  });

  test('a required smoke failure prevents even draft creation and normal merge', () => {
    const f = fixture({ smokeStatus: 'failed' });
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({ status: 1, handoff: { reasonCode: 'verification_recheck_invalid' } });
    expect(deliveryCalls(f, 'create')).toHaveLength(0);
    expect(deliveryCalls(f, 'merge')).toHaveLength(0);
  });

  test('PR-only pending creates a draft and observes live checks without ready or merge', () => {
    const f = fixture({ pending: true });
    const result = runDeliver({ cwd: f.root, issue: 42, action: 'prepare-pr-evidence', run: f.run });
    expect(result).toMatchObject({ status: 3, prEvidence: { pullRequest: 77, headSha: f.currentHead } });
    expect(f.pr.isDraft).toBe(true);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'checks')).toBe(true);
    expect(deliveryCalls(f, 'ready')).toHaveLength(0);
    expect(deliveryCalls(f, 'merge')).toHaveLength(0);
    const normal = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(normal).toMatchObject({ status: 1, handoff: { reasonCode: 'verification_not_ready' } });
  });

  test('an unpublished pending report is published once as report-only source-parent proof before draft creation', () => {
    const f = fixture({ pending: true, unpublishedPending: true });
    expect(f.currentHead).toBe(f.sourceHead);
    const result = runDeliver({ cwd: f.root, issue: 42, action: 'prepare-pr-evidence', run: f.run });
    expect(result).toMatchObject({ status: 3, prEvidence: { pullRequest: 77 } });
    expect(f.currentHead).not.toBe(f.sourceHead);
    expect(git(f.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'))
      .toBe('specs/42-delivery/verification-report.md');
    const again = runDeliver({ cwd: f.root, issue: 42, action: 'prepare-pr-evidence', run: f.run });
    expect(again).toMatchObject({ status: 3, prEvidence: { headSha: f.currentHead } });
    expect(deliveryCalls(f, 'create')).toHaveLength(1);
    expect(deliveryCalls(f, 'merge')).toHaveLength(0);
  });

  test('a draft becomes mergeable only after fresh source gate, satisfied PR evidence and final-head checks', () => {
    const f = fixture({ pending: true });
    const draft = runDeliver({ cwd: f.root, issue: 42, action: 'prepare-pr-evidence', run: f.run });
    expect(draft).toMatchObject({ status: 3, prEvidence: { headSha: f.currentHead } });
    const h1 = f.currentHead;
    const reportPath = path.join(f.root, 'specs/42-delivery/verification-report.md');
    const report = fs.readFileSync(reportPath, 'utf8');
    const pending = JSON.parse(report.match(/<!-- nmg-sdlc-pr-readiness: (.*?) -->/)?.[1]);
    const satisfied = {
      schemaVersion: 1, state: 'pr_evidence_satisfied', issueNumber: 42,
      specPath: 'specs/42-delivery', local: pending.local,
      evidence: pending.pendingEvidence.map((identity) => ({
        ...identity, headSha: h1, conclusion: 'SUCCESS', url: 'https://github.test/checks/77',
      })),
    };
    fs.writeFileSync(reportPath, report
      .replace('PR Evidence Pending', 'Pass')
      .replace(`**Verification head**: ${f.sourceHead}`, `**Verification head**: ${h1}`)
      .replace(/<!-- nmg-sdlc-pr-readiness: .* -->/, `<!-- nmg-sdlc-pr-readiness: ${JSON.stringify(satisfied)} -->`));
    const artifactPath = path.join(f.root, '.omp/sdlc/verification/42.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    artifact.identity.headSha = h1;
    for (const result of artifact.results) {
      result.request.identity.headSha = h1;
      result.result.identity.headSha = h1;
      result.request.verification.runId = `verification-${createHash('sha256')
        .update(`${fs.realpathSync(f.root)}\0${42}\0specs/42-delivery\0${h1}`).digest('hex')}`;
    }
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact)}\n`);
    git(f.root, 'add', '--', 'specs/42-delivery/verification-report.md');
    git(f.root, 'commit', '-qm', 'docs: record verification for #42');
    expect(f.run('git', ['push', 'origin', 'HEAD:refs/heads/feature/42-delivery']).status).toBe(0);
    const finalHead = f.currentHead;
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(f.pr.headRefOid).toBe(finalHead);
    expect(deliveryCalls(f, 'ready')).toHaveLength(1);
    expect(deliveryCalls(f, 'merge')).toHaveLength(1);
    expect(f.pr.body).toContain(`\"headSha\":\"${finalHead}\"`);
  });

  test('version preparation precedes verification and is idempotent on the actual issue branch', () => {
    const f = fixture();
    const first = runDeliver({ cwd: f.root, issue: 42, action: 'prepare-version', run: f.run });
    expect(first).toMatchObject({ status: 0, handoff: null, prepared: { issue: 42, version: '3.5.0' } });
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8')).toBe('3.5.0\n');
    const prepared = f.currentHead;
    expect(prepared).not.toBe(f.sourceHead);
    const second = runDeliver({ cwd: f.root, issue: 42, action: 'prepare-version', run: f.run });
    expect(second).toMatchObject({ status: 0, handoff: null, prepared: { issue: 42, version: '3.5.0' } });
    expect(f.currentHead).toBe(prepared);
    expect(deliveryCalls(f, 'create')).toHaveLength(0);
  });

  test('failed required CI produces concrete implement remediation and never merges', () => {
    const f = fixture({ existing: true, checksState: 'FAILURE' });
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({
      status: 1,
      handoff: { status: 'failed', intervention: false, next: 'implement', reasonCode: 'checks_failed' },
      remediation: { headSha: f.currentHead, failingChecks: [{ name: 'contract-tests' }] },
    });
    expect(deliveryCalls(f, 'merge')).toHaveLength(0);
    const packet = JSON.parse(fs.readFileSync(path.join(f.root, '.omp/sdlc/remediation/42-deliver.json'), 'utf8'));
    expect(packet.headSha).toBe(f.currentHead);
  });

  test('stale malformed cursors and consumed recovery ledgers cannot veto current live proof', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, '.omp/sdlc/run.json'), '{broken tracking');
    fs.writeFileSync(path.join(f.root, '.omp/sdlc/safe-recoveries.json'), '{broken ledger');
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'), 'utf8')).toBe('{broken tracking');
    expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/safe-recoveries.json'), 'utf8')).toBe('{broken ledger');
  });

  test('a remote branch not equal to local verified HEAD blocks PR creation', () => {
    const f = fixture();
    git(f.root, 'commit', '--allow-empty', '-qm', 'feat: divergent local source #42');
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({ status: 1, handoff: { reasonCode: 'delivery_reconciliation_required' } });
    expect(deliveryCalls(f, 'create')).toHaveLength(0);
    expect(deliveryCalls(f, 'merge')).toHaveLength(0);
  });

  test('human change requests block without manufacturing approval', () => {
    const f = fixture({ existing: true, humanReview: true });
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({ status: 1, handoff: { reasonCode: 'human_review', intervention: true } });
    expect(deliveryCalls(f, 'ready')).toHaveLength(0);
    expect(deliveryCalls(f, 'merge')).toHaveLength(0);
  });

  test('pre-merge smoke receipt binds invocation digest, PR and exact head', () => {
    const f = fixture({ smokeOwned: true });
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run, env: f.env });
    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(JSON.parse(fs.readFileSync(path.join(f.root, '.omp/sdlc/smoke-deliveries/42.json'), 'utf8')))
      .toMatchObject({
        issue: 42, invocationId: 'a'.repeat(64), pullRequest: 77,
        headSha: f.currentHead, recordedBeforeMerge: true,
      });
  });

  test('lost merge acknowledgment reconciles remote MERGED and CLOSED without replay', () => {
    const f = fixture({ existing: true, lostAck: true });
    const first = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(first).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    const second = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(second).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(deliveryCalls(f, 'merge')).toHaveLength(1);
  });
});
