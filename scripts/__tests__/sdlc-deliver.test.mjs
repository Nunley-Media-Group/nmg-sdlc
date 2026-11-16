import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from '@jest/globals';

import { changelogFragmentBullets, changelogFragmentFile, insertChangelogFragment, mergeUnreleasedEntries, parseDeliverCli, runDeliver } from '../sdlc-deliver.mjs';
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

function fixture({ pending = false, unpublishedPending = false, smokeStatus = 'passed', remoteIssueState = 'OPEN', existing = false, lostAck = false, checksState = 'SUCCESS', declaredName = 'contract-tests', checkResponses = {}, smokeOwned = false, receiptRoot = null, humanReview = false, versionPrepared = true, issueTitle = 'Deliver verified changes', labels = ['enhancement'], unreleased = '', requirements = '', versionBump = false, closingReferences = [{ number: 42, url: 'https://github.test/owner/repo/issues/42' }] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-delivery-current-'));
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-delivery-remote-'));
  roots.push(root, remote);
  git(remote, 'init', '--bare', '-q');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'Test Author');
  git(root, 'config', 'user.email', 'test@example.test');
  fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
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
    'requirements.md': `### AC1: Deliver verified changes\n\n| FR1 | Deliver current evidence | Must |\n${versionBump ? '\n**Version bump**: major\n' : ''}${requirements}`,
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
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), `# Changelog\n\n## [Unreleased]\n\n${unreleased ? `${unreleased}\n\n` : ''}## [3.4.5] - 2026-01-01\n\n- old\n`);
  fs.writeFileSync(path.join(root, 'CONTRIBUTING.md'), '# Contributing\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'feat: implement delivery #42');
  if (versionPrepared) {
    // The version commit `prepare-version` makes before verification.
    fs.writeFileSync(path.join(root, 'VERSION'), '3.5.0\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture","version":"3.5.0"}\n');
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [3.5.0] - 2026-01-02\n\n### Added\n\n- Deliver verified changes (#42)\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'feat: deliver issue #42');
  }
  const sourceHead = git(root, 'rev-parse', 'HEAD');
  const scope = inspectIssueSpecScope({ projectRoot: root, issueNumber: 42, specPath: spec });
  const projection = Object.fromEntries(['issueNumber', 'specPath', 'status', 'delivery', 'regression'].map((key) => [key, scope[key]]));
  const local = { ...projection.delivery, regression: projection.regression, tests: 'pass', steeringGates: 'pass' };
  const identity = { kind: 'required_check', name: declaredName, event: 'pull_request', acceptanceCriteria: ['AC1'] };
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
  fs.mkdirSync(path.join(root, '.nmg-sdlc', 'verification'), { recursive: true });
  fs.writeFileSync(path.join(root, '.nmg-sdlc/verification/42.json'), `${JSON.stringify(artifact)}\n`);
  const calls = [];
  let issueState = remoteIssueState;
  let closing = closingReferences;
  let pr = existing ? {
    number: 77, title: 'Deliver verified changes', url: 'https://github.test/owner/repo/pull/77', state: 'OPEN',
    isDraft: pending, headRefName: 'feature/42-delivery', headRefOid: git(root, 'rev-parse', 'HEAD'),
    baseRefName: 'main', mergeStateStatus: 'CLEAN', mergedAt: null, mergeCommit: null,
    body: `Closes #42\n`,
  } : null;
  const issueUrl = 'https://github.test/owner/repo/issues/42';
  const issue = { number: 42, title: issueTitle, body: '', labels: labels.map((name) => ({ name })), state: issueState, url: issueUrl };
  const success = [{ name: 'contract-tests', state: checksState, bucket: checksState === 'SUCCESS' ? 'pass' : 'fail', link: 'https://github.test/checks/77', event: 'pull_request' }];
  const checkCalls = { required: 0, all: 0 };
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
      closingIssuesReferences: closing }), stderr: '' };
    if (args[0] === 'pr' && args[1] === 'edit') {
      pr.body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'checks') {
      const query = args.includes('--required') ? 'required' : 'all';
      const responses = checkResponses[query];
      const index = checkCalls[query]++;
      if (!responses) return { status: 0, stdout: JSON.stringify(success), stderr: '' };
      return Array.isArray(responses) ? responses[Math.min(index, responses.length - 1)] : responses;
    }
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
        const receipt = JSON.parse(fs.readFileSync(path.join(receiptRoot ?? root, '.nmg-sdlc/smoke-deliveries/42.json'), 'utf8'));
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
    set closingReferences(value) { closing = value; },
    env: smokeOwned ? { NMG_SDLC_SMOKE_OWNED: '1', NMG_SDLC_SMOKE_RECOVERY: `${'a'.repeat(64)}.${'b'.repeat(64)}` } : {},
  };
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const deliveryCalls = (f, verb) => f.calls.filter((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === verb);

// Publishes satisfied PR-only evidence for the draft made by `prepare-pr-evidence`,
// commits and pushes the report, and returns the final head that delivery observes.
function publishSatisfiedDraftEvidence(f, { name = 'contract-tests' } = {}) {
  const h1 = f.currentHead;
  const reportPath = path.join(f.root, 'specs/42-delivery/verification-report.md');
  const report = fs.readFileSync(reportPath, 'utf8');
  const pending = JSON.parse(report.match(/<!-- nmg-sdlc-pr-readiness: (.*?) -->/)?.[1]);
  const satisfied = {
    schemaVersion: 1, state: 'pr_evidence_satisfied', issueNumber: 42,
    specPath: 'specs/42-delivery', local: pending.local,
    evidence: pending.pendingEvidence.map((identity) => ({
      ...identity, name, headSha: h1, conclusion: 'SUCCESS', url: 'https://github.test/checks/77',
    })),
  };
  fs.writeFileSync(reportPath, report
    .replace('PR Evidence Pending', 'Pass')
    .replace(`**Verification head**: ${f.sourceHead}`, `**Verification head**: ${h1}`)
    .replace(/<!-- nmg-sdlc-pr-readiness: .* -->/, `<!-- nmg-sdlc-pr-readiness: ${JSON.stringify(satisfied)} -->`));
  const artifactPath = path.join(f.root, '.nmg-sdlc/verification/42.json');
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
  return f.currentHead;
}

describe('live issue delivery', () => {
  test('CLI accepts branch-first standalone and preparation modes, rejects removed session cursor', () => {
    expect(parseDeliverCli(['--issue', '42'])).toEqual({ action: 'deliver', issue: 42 });
    expect(parseDeliverCli(['prepare-version', '--issue', '42'])).toEqual({ action: 'prepare-version', issue: 42 });
    expect(parseDeliverCli(['prepare-pr-evidence', '--issue', '42'])).toEqual({ action: 'prepare-pr-evidence', issue: 42 });
    expect(() => parseDeliverCli(['session-init', '--issue', '42'])).toThrow();
    expect(() => parseDeliverCli(['--issue', '42', '--session-token', 'abc'])).toThrow();
  });

  test('actual standalone CLI prepares and publishes version before the verification gate', () => {
    const f = fixture({ versionPrepared: false });
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
    expect(fs.existsSync(path.join(f.root, '.nmg-sdlc/handoffs/42-deliver.json'))).toBe(false);
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
    expect(fs.existsSync(path.join(f.root, '.nmg-sdlc/run.json'))).toBe(false);
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
    const finalHead = publishSatisfiedDraftEvidence(f);
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(f.pr.headRefOid).toBe(finalHead);
    expect(deliveryCalls(f, 'ready')).toHaveLength(1);
    expect(deliveryCalls(f, 'merge')).toHaveLength(1);
    expect(f.pr.body).toContain(`\"headSha\":\"${finalHead}\"`);
  });

  test('version preparation precedes verification and is idempotent on the actual issue branch', () => {
    const f = fixture({ versionPrepared: false });
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

  test.each([
    ['is missing', 'delete', 'CHANGELOG.md is missing'],
    ['lacks the Unreleased heading', 'rewrite', '## [Unreleased]'],
  ])('prepare-version fails with version_artifact_missing when CHANGELOG.md %s, before any write or commit', (_name, mode, summaryText) => {
    const f = fixture({ versionPrepared: false });
    if (mode === 'delete') git(f.root, 'rm', '-q', 'CHANGELOG.md');
    else fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), '# Changelog\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    git(f.root, 'add', '-A');
    git(f.root, 'commit', '-qm', 'chore: break changelog for #42');
    const headBefore = git(f.root, 'rev-parse', 'HEAD');
    const result = runDeliver({ cwd: f.root, issue: 42, action: 'prepare-version', run: f.run });
    expect(result).toMatchObject({ status: 1, handoff: { status: 'failed', reasonCode: 'version_artifact_missing', next: null } });
    expect(result.handoff.summary).toContain(summaryText);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8')).toBe('3.4.5\n');
    expect(git(f.root, 'rev-parse', 'HEAD')).toBe(headBefore);
  });

  describe('prepare-version rolls hand-written issue entries (#503)', () => {
    const prepare = (f) => runDeliver({ cwd: f.root, issue: 42, action: 'prepare-version', run: f.run });
    const changelogAt = (f) => fs.readFileSync(path.join(f.root, 'CHANGELOG.md'), 'utf8');
    const releaseAt = (changelog, version) => {
      const start = changelog.indexOf(`## [${version}]`);
      const end = changelog.indexOf('\n## [', start + 1);
      return changelog.slice(start, end < 0 ? changelog.length : end);
    };
    const stageUnreleased = (f, unreleased) => {
      const body = unreleased ? `${unreleased}\n` : '';
      fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), `# Changelog\n\n## [Unreleased]\n\n${body}\n## [3.4.5] - 2026-01-01\n\n- old\n`);
      git(f.root, 'add', '--', 'CHANGELOG.md');
      git(f.root, 'commit', '-qm', 'docs: stage unreleased notes for #42');
    };
    // Moves the verification report and artifact onto the prepared head, as a report-only commit above it.
    function verifyPreparedHead(f) {
      const head = f.currentHead;
      const reportPath = path.join(f.root, 'specs/42-delivery/verification-report.md');
      fs.writeFileSync(reportPath, fs.readFileSync(reportPath, 'utf8')
        .replace(`**Verification head**: ${f.sourceHead}`, `**Verification head**: ${head}`));
      const artifactPath = path.join(f.root, '.nmg-sdlc/verification/42.json');
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      artifact.identity.headSha = head;
      for (const result of artifact.results) {
        result.request.identity.headSha = head;
        result.result.identity.headSha = head;
        result.request.verification.runId = `verification-${createHash('sha256')
          .update(`${fs.realpathSync(f.root)}\0${42}\0specs/42-delivery\0${head}`).digest('hex')}`;
      }
      fs.writeFileSync(artifactPath, `${JSON.stringify(artifact)}\n`);
      git(f.root, 'add', '--', 'specs/42-delivery/verification-report.md');
      git(f.root, 'commit', '-qm', 'docs: record verification for #42');
      expect(f.run('git', ['push', 'origin', 'HEAD:refs/heads/feature/42-delivery']).status).toBe(0);
    }

    test('AC1 a hand-written issue entry is rolled once and no generated Changed line is added', () => {
      const f = fixture({ versionPrepared: false });
      stageUnreleased(f, '### Fixed\n\n- Corrected delivery (#42).');
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { issue: 42, version: '3.5.0' } });
      const changelog = changelogAt(f);
      const section = releaseAt(changelog, '3.5.0');
      expect(section.split('- Corrected delivery (#42).')).toHaveLength(2);
      expect(section).toContain('### Fixed');
      expect(section).not.toContain('### Changed');
      expect(changelog).toMatch(/## \[Unreleased\]\n\n## \[3\.5\.0\] - \d{4}-\d{2}-\d{2}/);
    });

    test('#556 AC4 a branch entry kept by integration is rolled once and no generated Changed line is added', () => {
      const f = fixture({ versionPrepared: false });
      const released = '## [3.4.5] - 2026-01-01\n\n- old\n';
      const theirs = `# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- Merged elsewhere (#9)\n\n${released}`;
      const ours = `# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- Corrected delivery (#42)\n\n${released}`;
      const merged = mergeUnreleasedEntries(theirs, ours);
      expect(merged.kept).toBe(1);
      fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), merged.content);
      git(f.root, 'add', '--', 'CHANGELOG.md');
      git(f.root, 'commit', '-qm', 'chore: integrate origin/main for #42');
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { issue: 42, version: '3.5.0' } });
      const section = releaseAt(changelogAt(f), '3.5.0');
      expect(section).toContain('### Fixed\n\n- Merged elsewhere (#9)\n- Corrected delivery (#42)\n');
      expect(section.split('(#42)')).toHaveLength(2);
      expect(section).not.toContain('Deliver verified changes');
    });

    test.each([
      ['is empty', ''],
      ['holds only a (#7) bullet', '### Fixed\n\n- Corrected parser (#7).'],
    ])('AC2 a generated Changed line is added when Unreleased %s', (_name, unreleased) => {
      const f = fixture({ versionPrepared: false });
      stageUnreleased(f, unreleased);
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '3.5.0' } });
      const section = releaseAt(changelogAt(f), '3.5.0');
      expect(section).toContain(unreleased);
      expect(section.endsWith('### Changed\n\n- Deliver verified changes (#42)\n')).toBe(true);
    });

    test('AC3 an approved breaking issue keeps the generated BREAKING category', () => {
      const f = fixture({ versionPrepared: false, issueTitle: 'BREAKING: Deliver verified changes', versionBump: true });
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '4.0.0' } });
      expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8')).toBe('4.0.0\n');
      expect(releaseAt(changelogAt(f), '4.0.0'))
        .toContain('### Changed (BREAKING)\n\n- BREAKING: Deliver verified changes (#42)\n');
    });

    test('AC4 a re-run after rolling a hand-written entry changes nothing and delivery does not fail with version_not_prepared', () => {
      const f = fixture({ versionPrepared: false });
      stageUnreleased(f, '### Fixed\n\n- Corrected delivery (#42).');
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '3.5.0' } });
      const prepared = f.currentHead;
      const files = ['VERSION', 'package.json', 'CHANGELOG.md'];
      const before = files.map((name) => fs.readFileSync(path.join(f.root, name), 'utf8'));
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '3.5.0' } });
      expect(f.currentHead).toBe(prepared);
      expect(files.map((name) => fs.readFileSync(path.join(f.root, name), 'utf8'))).toEqual(before);
      verifyPreparedHead(f);
      const delivered = runDeliver({ cwd: f.root, issue: 42, run: f.run });
      expect(delivered.handoff?.reasonCode).not.toBe('version_not_prepared');
      expect(delivered).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    });

    test('AC5 bullets referencing (#4) or (#420) do not count as references to issue 42', () => {
      const f = fixture({ versionPrepared: false });
      stageUnreleased(f, '### Fixed\n\n- Corrected parser (#4).\n- Corrected cache (#420).');
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '3.5.0' } });
      expect(releaseAt(changelogAt(f), '3.5.0')).toContain('### Changed\n\n- Deliver verified changes (#42)\n');
    });
  });

  describe('prepare-version files the generated line under the issue category (#512)', () => {
    const prepare = (f) => runDeliver({ cwd: f.root, issue: 42, action: 'prepare-version', run: f.run });
    const changelogAt = (f) => fs.readFileSync(path.join(f.root, 'CHANGELOG.md'), 'utf8');
    const releaseAt = (changelog, version) => {
      const start = changelog.indexOf(`## [${version}]`);
      const end = changelog.indexOf('\n## [', start + 1);
      return changelog.slice(start, end < 0 ? changelog.length : end);
    };

    test('AC1 a bug issue line is filed under Fixed with no Changed heading', () => {
      const f = fixture({ versionPrepared: false, labels: ['bug'] });
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { issue: 42, version: '3.4.6' } });
      const section = releaseAt(changelogAt(f), '3.4.6');
      expect(section.endsWith('### Fixed\n\n- Deliver verified changes (#42)\n')).toBe(true);
      expect(section).not.toContain('### Changed');
    });

    test('AC2 the generated bug line is the last bullet of an existing Fixed section', () => {
      const f = fixture({
        versionPrepared: false,
        labels: ['bug'],
        unreleased: '### Fixed\n\n- Corrected the widget (#7)\n\n### Changed\n\n- Renamed the option (#8)',
      });
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '3.4.6' } });
      const section = releaseAt(changelogAt(f), '3.4.6');
      expect(section.split('### Fixed')).toHaveLength(2);
      expect(section).toContain('### Fixed\n\n- Corrected the widget (#7)\n- Deliver verified changes (#42)\n\n### Changed\n\n- Renamed the option (#8)\n');
    });

    test('AC3 an enhancement line joins an existing Changed section without a Fixed heading', () => {
      const f = fixture({ versionPrepared: false, unreleased: '### Changed\n\n- Renamed the option (#8)' });
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '3.5.0' } });
      const section = releaseAt(changelogAt(f), '3.5.0');
      expect(section.split('### Changed')).toHaveLength(2);
      expect(section).toContain('### Changed\n\n- Renamed the option (#8)\n- Deliver verified changes (#42)\n');
      expect(section).not.toContain('### Fixed');
    });

    test('AC4 an approved breaking bug fix stays under Changed (BREAKING) with no Fixed heading', () => {
      const f = fixture({
        versionPrepared: false,
        labels: ['bug'],
        issueTitle: 'BREAKING: Deliver verified changes',
        requirements: '\n**Version bump**: major\n',
      });
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '4.0.0' } });
      const section = releaseAt(changelogAt(f), '4.0.0');
      expect(section.endsWith('### Changed (BREAKING)\n\n- BREAKING: Deliver verified changes (#42)\n')).toBe(true);
      expect(section).not.toContain('### Fixed');
    });

    test('AC5 a re-run on a bug issue reports the same version and changes nothing', () => {
      const f = fixture({ versionPrepared: false, labels: ['bug'] });
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '3.4.6' } });
      expect(releaseAt(changelogAt(f), '3.4.6')).toContain('### Fixed\n\n- Deliver verified changes (#42)\n');
      const prepared = f.currentHead;
      const files = ['VERSION', 'package.json', 'CHANGELOG.md'];
      const before = files.map((name) => fs.readFileSync(path.join(f.root, name), 'utf8'));
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '3.4.6' } });
      expect(f.currentHead).toBe(prepared);
      expect(files.map((name) => fs.readFileSync(path.join(f.root, name), 'utf8'))).toEqual(before);
      expect(deliveryCalls(f, 'create')).toHaveLength(0);
    });
  });

  describe('prepare-version spaces the generated line under an empty matching heading (#519)', () => {
    const prepare = (f) => runDeliver({ cwd: f.root, issue: 42, action: 'prepare-version', run: f.run });
    const changelogAt = (f) => fs.readFileSync(path.join(f.root, 'CHANGELOG.md'), 'utf8');
    const releaseAt = (changelog, version) => {
      const start = changelog.indexOf(`## [${version}]`);
      const end = changelog.indexOf('\n## [', start + 1);
      return changelog.slice(start, end < 0 ? changelog.length : end);
    };

    test('AC1 an empty trailing Fixed heading gets one blank line before the generated bullet', () => {
      const f = fixture({ versionPrepared: false, labels: ['bug'], unreleased: '### Fixed\n\n' });
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { issue: 42, version: '3.4.6' } });
      const section = releaseAt(changelogAt(f), '3.4.6');
      expect(section.endsWith('### Fixed\n\n- Deliver verified changes (#42)\n')).toBe(true);
      expect(section.split('### Fixed')).toHaveLength(2);
    });

    test('AC2 an empty Fixed heading followed by Changed gets one blank line on each side of the generated bullet', () => {
      const f = fixture({
        versionPrepared: false,
        labels: ['bug'],
        unreleased: '### Fixed\n\n\n### Changed\n\n- Renamed the option (#8)',
      });
      expect(prepare(f)).toMatchObject({ status: 0, prepared: { version: '3.4.6' } });
      const section = releaseAt(changelogAt(f), '3.4.6');
      expect(section.split('### Fixed')).toHaveLength(2);
      expect(section).toContain('### Fixed\n\n- Deliver verified changes (#42)\n\n### Changed\n\n- Renamed the option (#8)\n');
    });
  });

  test('delivery without a prepared version fails before any pull request is created', () => {
    const f = fixture({ versionPrepared: false });
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({ status: 1, handoff: { status: 'failed', reasonCode: 'version_not_prepared', next: 'verify' } });
    expect(deliveryCalls(f, 'create')).toHaveLength(0);
    expect(deliveryCalls(f, 'merge')).toHaveLength(0);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8')).toBe('3.4.5\n');
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
    const packet = JSON.parse(fs.readFileSync(path.join(f.root, '.nmg-sdlc/remediation/42-deliver.json'), 'utf8'));
    expect(packet.headSha).toBe(f.currentHead);
  });

  test('stale malformed cursors and consumed recovery ledgers cannot veto current live proof', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, '.nmg-sdlc/run.json'), '{broken tracking');
    fs.writeFileSync(path.join(f.root, '.nmg-sdlc/safe-recoveries.json'), '{broken ledger');
    const result = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(fs.readFileSync(path.join(f.root, '.nmg-sdlc/run.json'), 'utf8')).toBe('{broken tracking');
    expect(fs.readFileSync(path.join(f.root, '.nmg-sdlc/safe-recoveries.json'), 'utf8')).toBe('{broken ledger');
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
    expect(JSON.parse(fs.readFileSync(path.join(f.root, '.nmg-sdlc/smoke-deliveries/42.json'), 'utf8')))
      .toMatchObject({
        issue: 42, invocationId: 'a'.repeat(64), pullRequest: 77,
        headSha: f.currentHead, recordedBeforeMerge: true,
      });
  });

  test('smoke receipt from an issue worktree is written to the primary checkout, which outlives the worktree (#551)', () => {
    const primary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-delivery-primary-')));
    roots.push(primary);
    const f = fixture({ smokeOwned: true, receiptRoot: primary });
    const run = (binary, args, opts = {}) => (binary === 'git' && args[0] === 'worktree' && args[1] === 'list'
      ? { status: 0, stdout: `worktree ${primary}\nHEAD ${'c'.repeat(40)}\nbranch refs/heads/main\n\nworktree ${f.root}\nHEAD ${f.currentHead}\nbranch refs/heads/feature/42-delivery\n`, stderr: '' }
      : f.run(binary, args, opts));
    const result = runDeliver({ cwd: f.root, issue: 42, run, env: f.env });
    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(JSON.parse(fs.readFileSync(path.join(primary, '.nmg-sdlc/smoke-deliveries/42.json'), 'utf8')))
      .toMatchObject({ issue: 42, invocationId: 'a'.repeat(64), pullRequest: 77, recordedBeforeMerge: true });
    expect(fs.existsSync(path.join(f.root, '.nmg-sdlc/smoke-deliveries/42.json'))).toBe(false);
  });

  test('lost merge acknowledgment reconciles remote MERGED and CLOSED without replay', () => {
    const f = fixture({ existing: true, lostAck: true });
    const first = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(first).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    const second = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(second).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(deliveryCalls(f, 'merge')).toHaveLength(1);
  });

  test.each([
    ['no closing references', []],
    ['a reference to the issue number in another repository', [{ number: 42, url: 'https://github.test/other/repo/issues/42' }]],
    ['a same-repository reference to another issue', [{ number: 41, url: 'https://github.test/owner/repo/issues/41' }]],
  ])('unobserved closing linkage (%s) blocks the exact-head merge until linkage is observed', (_label, references) => {
    const f = fixture({ closingReferences: references });
    const blocked = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(blocked).toMatchObject({
      status: 1,
      handoff: {
        status: 'failed', reasonCode: 'closing_linkage_unobserved',
        summary: 'PR #77 does not link issue #42; exact-head merge not attempted',
      },
    });
    expect(deliveryCalls(f, 'merge')).toHaveLength(0);
    expect(f.pr.state).toBe('OPEN');
    expect(f.issueState).toBe('OPEN');
    expect(git(f.root, 'branch', '--show-current')).toBe('feature/42-delivery');
    expect(git(f.root, 'ls-remote', 'origin', 'refs/heads/feature/42-delivery')).toContain(f.currentHead);

    f.closingReferences = [{ number: 42, url: 'https://github.test/owner/repo/issues/42' }];
    const delivered = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(delivered).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(deliveryCalls(f, 'merge')).toHaveLength(1);
    expect(deliveryCalls(f, 'merge')[0]).toContain(f.currentHead);
    expect(f.issueState).toBe('CLOSED');
    const mergeIndex = f.calls.findIndex((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge');
    const lastView = f.calls.slice(0, mergeIndex).findLast((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'view');
    expect(lastView[lastView.indexOf('--json') + 1].split(',')).toContain('closingIssuesReferences');
  });

  test('a merged PR without closing linkage still fails post-merge reconciliation without a new merge', () => {
    const f = fixture();
    expect(runDeliver({ cwd: f.root, issue: 42, run: f.run })).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(deliveryCalls(f, 'merge')).toHaveLength(1);
    f.closingReferences = [];
    const reconciled = runDeliver({ cwd: f.root, issue: 42, run: f.run });
    expect(reconciled).toMatchObject({
      status: 1,
      handoff: { reasonCode: 'delivery_linkage_unproven', summary: 'Merged PR #77 does not link issue #42' },
    });
    expect(deliveryCalls(f, 'merge')).toHaveLength(1);
  });

  describe('draft PR-only evidence resolution', () => {
    const PUSH_LINK = 'https://github.test/checks/push-77';
    const PR_LINK = 'https://github.test/checks/pr-77';
    const PENDING_SUMMARY = 'Draft PR #77 PR-only checks remain pending';
    const UNRESOLVED_SUMMARY = 'Delivery failed for #42: verification_not_ready';
    const BUCKETS = { SUCCESS: 'pass', PENDING: 'pending', FAILURE: 'fail' };
    const checkRow = (name, { event = 'pull_request', state = 'SUCCESS', link = PR_LINK, workflow } = {}) => ({
      name, state, bucket: BUCKETS[state], link, event, ...(workflow ? { workflow } : {}),
    });
    const observedChecks = (...rows) => {
      const response = { status: 0, stdout: JSON.stringify(rows), stderr: '' };
      return { all: response, required: response };
    };
    const draftWith = (rows, { declaredName = 'contract-tests' } = {}) => {
      const f = fixture({ pending: true, declaredName, checkResponses: observedChecks(...rows) });
      const draft = runDeliver({ cwd: f.root, issue: 42, action: 'prepare-pr-evidence', run: f.run });
      expect(draft).toMatchObject({ status: 3, prEvidence: { pullRequest: 77 } });
      publishSatisfiedDraftEvidence(f, { name: declaredName });
      return f;
    };
    const deliverDraft = (f) => runDeliver({
      cwd: f.root, issue: 42, run: f.run, sleep: () => { throw new Error('unexpected wait'); },
    });
    const expectNotReady = (f, summary) => {
      const result = deliverDraft(f);
      expect(result).toMatchObject({ status: 1, handoff: { status: 'failed', reasonCode: 'verification_not_ready' } });
      expect(result.handoff.summary).toBe(summary);
      expect(deliveryCalls(f, 'ready')).toHaveLength(0);
      expect(deliveryCalls(f, 'merge')).toHaveLength(0);
      expect(f.pr.body).not.toContain('nmg-sdlc-delivery-validation');
    };

    test('AC1 a same-name push check does not block pull_request evidence', () => {
      const f = draftWith([checkRow('contract-tests', { event: 'push', link: PUSH_LINK }), checkRow('contract-tests')]);
      const result = deliverDraft(f);
      expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
      expect(deliveryCalls(f, 'ready')).toHaveLength(1);
      expect(deliveryCalls(f, 'merge')).toHaveLength(1);
      expect(f.pr.body).toContain(PR_LINK);
      expect(f.pr.body).not.toContain(PUSH_LINK);
    });

    test('AC2 a push check is never counted as declared evidence', () => {
      expectNotReady(draftWith([checkRow('contract-tests', { event: 'push', link: PUSH_LINK })]), PENDING_SUMMARY);
    });

    test('AC3 a missing pull_request check stays pending', () => {
      expectNotReady(draftWith([]), PENDING_SUMMARY);
    });

    test('AC4 duplicate pull_request checks fail closed', () => {
      expectNotReady(draftWith([
        checkRow('contract-tests'),
        checkRow('contract-tests', { link: 'https://github.test/checks/pr-78' }),
      ]), UNRESOLVED_SUMMARY);
    });

    test.each([
      ['contract-tests'],
      ['CI / contract-tests'],
    ])('AC5 a single pull_request SUCCESS match for declared %s merges', (declaredName) => {
      const f = draftWith([checkRow('contract-tests', { workflow: 'CI' })], { declaredName });
      const result = deliverDraft(f);
      expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
      expect(deliveryCalls(f, 'ready')).toHaveLength(1);
      expect(deliveryCalls(f, 'merge')).toHaveLength(1);
    });

    test.each([
      ['PENDING', PENDING_SUMMARY],
      ['FAILURE', UNRESOLVED_SUMMARY],
    ])('AC5 a single pull_request %s match reports its outcome without merging', (state, summary) => {
      expectNotReady(draftWith([checkRow('contract-tests', { workflow: 'CI', state })]), summary);
    });
  });

  describe('PR check queries', () => {
    const PLAN_UNAVAILABLE = 'gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)';
    const checkRow = (state, bucket, name = 'contract-tests') => ({
      name, state, bucket, link: 'https://github.test/checks/77', event: 'pull_request',
    });
    const checks = (...rows) => ({ status: rows.some((row) => row.bucket === 'pending') ? 8 : 0, stdout: JSON.stringify(rows), stderr: '' });

    test.each([
      ['required', 'gh pr checks --required'],
      ['all', 'gh pr checks'],
    ])('the account-plan diagnostic on the %s query fails delivery instead of becoming an empty check set', (query, description) => {
      const f = fixture({ existing: true, checkResponses: { [query]: { status: 1, stdout: '', stderr: PLAN_UNAVAILABLE } } });
      const result = runDeliver({ cwd: f.root, issue: 42, run: f.run, sleep: () => { throw new Error('unexpected wait'); } });
      expect(result).toMatchObject({ status: 1, handoff: { status: 'failed', reasonCode: 'delivery_failed' } });
      expect(result.handoff.summary).toContain(`${description} returned no JSON`);
      expect(deliveryCalls(f, 'merge')).toHaveLength(0);
      expect(f.issueState).toBe('OPEN');
    });

    test.each([
      ['required', 'malformed', { status: 0, stdout: '{', stderr: '' }, 'gh pr checks --required returned invalid JSON'],
      ['all', 'malformed', { status: 0, stdout: '{"checks":[]}', stderr: '' }, 'gh pr checks did not return a check array'],
      ['required', 'unreadable', { status: 4, stdout: '', stderr: 'gh: Bad credentials (HTTP 401)' }, 'gh pr checks --required failed: gh: Bad credentials (HTTP 401)'],
      ['all', 'unreadable', { status: 1, stdout: '', stderr: 'error connecting to api.github.com' }, 'gh pr checks returned no JSON'],
    ])('%s query %s output fails closed without merging', (query, _kind, response, summary) => {
      const f = fixture({ existing: true, checkResponses: { [query]: response } });
      const result = runDeliver({ cwd: f.root, issue: 42, run: f.run, sleep: () => { throw new Error('unexpected wait'); } });
      expect(result).toMatchObject({ status: 1, handoff: { status: 'failed', reasonCode: 'delivery_failed' } });
      expect(result.handoff.summary).toContain(summary);
      expect(deliveryCalls(f, 'merge')).toHaveLength(0);
    });

    test('a failed check reported only by the unfiltered query blocks merge with remediation', () => {
      const f = fixture({
        existing: true,
        checkResponses: { all: { status: 1, stdout: JSON.stringify([checkRow('SUCCESS', 'pass'), checkRow('FAILURE', 'fail', 'lint')]), stderr: '' } },
      });
      const result = runDeliver({ cwd: f.root, issue: 42, run: f.run, sleep: () => { throw new Error('unexpected wait'); } });
      expect(result).toMatchObject({
        status: 1,
        handoff: { status: 'failed', reasonCode: 'checks_failed' },
        remediation: { failingChecks: [{ name: 'lint' }] },
      });
      expect(deliveryCalls(f, 'merge')).toHaveLength(0);
    });

    test.each([
      ['required', checks(checkRow('PENDING', 'pending')), checks(checkRow('SUCCESS', 'pass'))],
      ['unfiltered', checks(checkRow('SUCCESS', 'pass'), checkRow('PENDING', 'pending', 'lint')),
        checks(checkRow('SUCCESS', 'pass'), checkRow('SUCCESS', 'pass', 'lint'))],
    ])('a pending %s check waits and merges only after it passes', (label, pendingChecks, passingChecks) => {
      const query = label === 'required' ? 'required' : 'all';
      const f = fixture({ existing: true, checkResponses: { [query]: [pendingChecks, passingChecks] } });
      const result = runDeliver({ cwd: f.root, issue: 42, run: f.run, sleep: () => f.calls.push(['sleep']) });
      expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
      const merge = f.calls.findIndex((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge');
      const firstWait = f.calls.findIndex((call) => call[0] === 'sleep');
      expect(firstWait).toBeGreaterThan(-1);
      expect(merge).toBeGreaterThan(firstWait);
      expect(deliveryCalls(f, 'merge')).toHaveLength(1);
      expect(deliveryCalls(f, 'merge')[0]).toContain(f.currentHead);
    });
  });
});

describe('changelog fragments (#551 AC4)', () => {
  function tryGit(cwd, ...args) {
    return spawnSync('git', args, { cwd, encoding: 'utf8' });
  }
  function write(root, files) {
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    }
  }
  function directory(files = {}) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-fragments-')));
    roots.push(root);
    write(root, files);
    return root;
  }
  const optIn = (dir = 'changelog.d') => ({ 'steering/manifest.json': `${JSON.stringify({ changelog: { fragments: { dir } } })}\n` });
  const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');

  describe('changelogFragmentFile', () => {
    test('is the issue\'s own <dir>/<N>.md in a project that opted in', () => {
      const root = directory({ ...optIn(), 'changelog.d/42.md': '- Queue (#42)\n', 'changelog.d/43.md': '- Pool (#43)\n', 'changelog.d/README.md': 'How to\n' });

      expect(changelogFragmentFile(fs, root, 42)).toEqual({ relative: 'changelog.d/42.md', absolute: path.join(root, 'changelog.d/42.md') });
      expect(changelogFragmentFile(fs, root, 43)).toEqual({ relative: 'changelog.d/43.md', absolute: path.join(root, 'changelog.d/43.md') });
      expect(changelogFragmentFile(fs, root, 4)).toBeNull();
      expect(changelogFragmentFile(fs, root, 420)).toBeNull();

      const nested = directory({ ...optIn('docs/changes'), 'docs/changes/42.md': '- Queue (#42)\n', 'changelog.d/42.md': '- Elsewhere (#42)\n' });
      expect(changelogFragmentFile(fs, nested, 42)).toEqual({ relative: 'docs/changes/42.md', absolute: path.join(nested, 'docs/changes/42.md') });
    });

    test('is null without the opt-in, with the old `directory` key, or with an invalid manifest', () => {
      const fragment = { 'changelog.d/42.md': '- Queue (#42)\n' };
      for (const manifest of [
        null, '{"schemaVersion":1}', '{broken', '[]',
        JSON.stringify({ changelog: { fragments: { directory: 'changelog.d' } } }),
        JSON.stringify({ changelog: { fragments: { dir: '../outside' } } }),
        JSON.stringify({ changelog: { fragments: { dir: '.nmg-sdlc/changes' } } }),
        JSON.stringify({ changelog: { fragments: { dir: 'changelog.d', pattern: '*.md' } } }),
        JSON.stringify({ changelog: { fragments: {} } }),
      ]) {
        const root = directory({ ...fragment, ...(manifest === null ? {} : { 'steering/manifest.json': manifest }) });
        expect([manifest, changelogFragmentFile(fs, root, 42)]).toEqual([manifest, null]);
      }
    });

    test('is null when the fragment is missing, a directory or a symbolic link, or the issue is not a positive integer', () => {
      const root = directory({ ...optIn(), 'changelog.d/42-queue.md': '- Wrong name (#42)\n', 'outside.md': '- Outside (#44)\n' });
      fs.mkdirSync(path.join(root, 'changelog.d/43.md'));
      fs.symlinkSync(path.join(root, 'outside.md'), path.join(root, 'changelog.d/44.md'));
      fs.symlinkSync(path.join(root, 'missing.md'), path.join(root, 'changelog.d/45.md'));

      for (const issue of [42, 43, 44, 45, 0, -1, 1.5, '42', null]) expect([issue, changelogFragmentFile(fs, root, issue)]).toEqual([issue, null]);
      expect(changelogFragmentFile(fs, directory(optIn()), 42)).toBeNull();
    });

    test('refuses a fragments directory that resolves outside the project', () => {
      const outside = directory({ '42.md': '- Queue (#42)\n' });
      const root = directory(optIn());
      fs.symlinkSync(outside, path.join(root, 'changelog.d'));

      expect(() => changelogFragmentFile(fs, root, 42)).toThrow('version artifact path escapes the repository');
    });
  });

  describe('changelogFragmentBullets and insertChangelogFragment', () => {
    const RELEASED = '## [1.2.0] - 2026-01-01\n\n### Changed\n\n- Older change (#7)\n\n## [1.1.0] - 2025-12-01\n\n- Oldest change (#3)\n';
    const changelog = (unreleased = '') => `# Changelog\n\nAll notable changes.\n\n## [Unreleased]\n\n${unreleased ? `${unreleased}\n\n` : ''}${RELEASED}`;
    const insert = (unreleased, body, category = 'Changed') => insertChangelogFragment(changelog(unreleased), body, category);

    test('a fragment\'s bullets are its bullet lines with their indented continuation lines, and nothing else', () => {
      expect(changelogFragmentBullets('# Fragment for #42\n\nSome prose.\n\n### Added\n\n- Add a merge queue (#42)   \n  One queue per repository.\n    - nested detail\n'
        + '* Second entry (#42)\n\n  Not a continuation: a blank line ended the bullet.\n-not a bullet\n- \n')).toEqual([
        '- Add a merge queue (#42)\n  One queue per repository.\n    - nested detail', '- Second entry (#42)',
      ]);
      expect(changelogFragmentBullets('- Add a merge queue (#42)\r\n  More detail.\r\n')).toEqual(['- Add a merge queue (#42)\n  More detail.']);
      expect(changelogFragmentBullets('')).toEqual([]);
      expect(changelogFragmentBullets('Only prose.\n\n### Added\n')).toEqual([]);
    });

    test('bullets go under the classification heading, whatever headings the fragment itself has', () => {
      expect(insert('', '- Add a merge queue (#42)\n- Queue survives a crash (#42)\n')).toBe(changelog('### Changed\n\n- Add a merge queue (#42)\n- Queue survives a crash (#42)'));
      expect(insert('', '### Added\n\n- Add a merge queue (#42)\n\n### Security\n\n- Validate the queue file (#42)\n', 'Fixed'))
        .toBe(changelog('### Fixed\n\n- Add a merge queue (#42)\n- Validate the queue file (#42)'));
    });

    test('an existing classification section is appended to rather than duplicated, and other sections are kept', () => {
      const existing = '### Added\n\n- Hand-written addition (#40)\n\n### Fixed\n\n- Hand-written fix (#41)';
      const result = insert(existing, '- Stop losing the queue (#42)\n  It is written atomically.\n', 'Fixed');

      expect(result).toBe(changelog('### Added\n\n- Hand-written addition (#40)\n\n### Fixed\n\n- Hand-written fix (#41)\n- Stop losing the queue (#42)\n  It is written atomically.'));
      expect(result.match(/^### Fixed$/gm)).toHaveLength(1);
      expect(insert(existing, '- Rework the queue (#42)\n', 'Changed')).toBe(changelog(`${existing}\n\n### Changed\n\n- Rework the queue (#42)`));
    });

    test('a bullet already present is not added twice', () => {
      const existing = '### Added\n\n- Add a merge queue (#42)';
      expect(insert(existing, '- Add a merge queue (#42)\n- Add a pool (#42)\n', 'Added')).toBe(changelog('### Added\n\n- Add a merge queue (#42)\n- Add a pool (#42)'));
      expect(insert(existing, '- Add a merge queue (#42)\n', 'Changed')).toBe(changelog(existing));
      expect(insert('', '- Pool heavy jobs (#43)\n- Pool heavy jobs (#43)\n')).toBe(changelog('### Changed\n\n- Pool heavy jobs (#43)'));
      const once = insert('', '- Add a merge queue (#42)\n  More detail.\n');
      expect(insertChangelogFragment(once, '- Add a merge queue (#42)\n  More detail.\n', 'Changed')).toBe(once);
    });

    test('released sections are left untouched, and a fragment without bullets changes nothing', () => {
      const result = insert('### Changed\n\n- Hand-written change (#40)', '- Older change (#7)\n- Add a merge queue (#42)\n');
      // A bullet that only an earlier release holds is still new to this one.
      expect(result).toBe(changelog('### Changed\n\n- Hand-written change (#40)\n- Older change (#7)\n- Add a merge queue (#42)'));
      expect(result.endsWith(`\n\n${RELEASED}`)).toBe(true);
      expect(insert('### Added\n\n- Hand-written addition (#40)', 'Only prose.\n')).toBe(changelog('### Added\n\n- Hand-written addition (#40)'));
      expect(insertChangelogFragment('# Changelog\n\n## [Unreleased]\n', '- Add a merge queue (#42)\n', 'Changed'))
        .toBe('# Changelog\n\n## [Unreleased]\n\n### Changed\n\n- Add a merge queue (#42)\n');
    });

    test('a changelog without an Unreleased section throws version_artifact_missing', () => {
      let failure = null;
      try { insertChangelogFragment(`# Changelog\n\n${RELEASED}`, '- Add a merge queue (#42)\n', 'Changed'); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect(failure.reasonCode).toBe('version_artifact_missing');
      expect(failure.message).toBe('CHANGELOG.md lacks a ## [Unreleased] heading');
    });
  });

  describe('mergeUnreleasedEntries (#556 AC4)', () => {
    const RELEASED_100 = '## [1.0.0] - 2026-01-01\n\n- Old (#1)\n';

    test('adds the branch bullets the default branch lacks under the same category, with continuation lines', () => {
      const theirs = `# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- Other fix (#9)\n\n${RELEASED_100}`;
      const ours = '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- New thing (#42)\n  More detail.\n\n### Fixed\n\n'
        + `- Fix (#42)\n\n${RELEASED_100}`;
      expect(mergeUnreleasedEntries(theirs, ours)).toEqual({ kept: 2, content: '# Changelog\n\n## [Unreleased]\n\n'
        + '### Fixed\n\n- Other fix (#9)\n- Fix (#42)\n\n### Added\n\n- New thing (#42)\n  More detail.\n\n' + RELEASED_100 });
    });

    test('keeps nothing already on the default branch, including bullets it has rolled into a version', () => {
      const theirs = `# Changelog\n\n## [Unreleased]\n\n## [1.1.0] - 2026-02-01\n\n- Shared (#7)\n\n${RELEASED_100}`;
      const ours = `# Changelog\n\n## [Unreleased]\n\n### Changed\n\n- Shared (#7)\n\n${RELEASED_100}`;
      expect(mergeUnreleasedEntries(theirs, ours)).toEqual({ kept: 0, content: theirs });
    });

    test('counts a repeated branch bullet once and reads bullets written with an asterisk', () => {
      const theirs = `# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n* Other fix (#9)\n\n${RELEASED_100}`;
      const ours = '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- Other fix (#9)\n* Fix (#42)\n- Fix (#42)\n\n'
        + RELEASED_100;
      expect(mergeUnreleasedEntries(theirs, ours)).toEqual({ kept: 1, content: '# Changelog\n\n## [Unreleased]\n\n'
        + `### Fixed\n\n* Other fix (#9)\n- Fix (#42)\n\n${RELEASED_100}` });
    });

    test('restores the Unreleased heading above the first version when the default branch has none', () => {
      expect(mergeUnreleasedEntries(`# Changelog\n\n${RELEASED_100}`, '# Changelog\n\n## [Unreleased]\n\n- Mine (#42)\n'))
        .toEqual({ kept: 1, content: `# Changelog\n\n## [Unreleased]\n\n### Changed\n\n- Mine (#42)\n\n${RELEASED_100}` });
    });
  });

  describe('prepare-version', () => {
    const HEADER = (issue) => `**Issue**: #${issue}\n**Status**: Approved\n\n`;
    const BASE_CHANGELOG = '# Changelog\n\n## [Unreleased]\n\n## [3.4.5] - 2026-01-01\n\n- old\n';
    const ISSUES = {
      42: { title: 'Queue merges', branch: 'feature/42-queue', spec: 'specs/42-queue', labels: ['enhancement'] },
      43: { title: 'Pool heavy jobs', branch: 'feature/43-pool', spec: 'specs/43-pool', labels: ['bug'] },
    };
    const FRAGMENTS = {
      42: '- Queue merges across worktrees (#42)\n  One queue per repository.\n- Stop a crashed session blocking the queue (#42)\n',
      43: '- Reclaim a heavy-job slot from a dead holder (#43)\n',
    };

    /**
     * A project with a bare remote and two pushed issue branches cut from the same `main`. Each branch adds its
     * spec, its work and `fragmentFiles(issue)`; neither edits CHANGELOG.md. `changelog` is the manifest's opt-in.
     */
    function fragmentProject({ changelog = { fragments: { dir: 'changelog.d' } }, fragmentFiles = (issue) => ({ [`changelog.d/${issue}.md`]: FRAGMENTS[issue] }) } = {}) {
      const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-fragments-deliver-')));
      const remote = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-fragments-remote-')));
      roots.push(root, remote);
      git(remote, 'init', '--bare', '-q');
      git(root, 'init', '-q', '-b', 'main');
      git(root, 'config', 'user.name', 'Test Author');
      git(root, 'config', 'user.email', 'test@example.test');
      const tech = '# Tech\n\n## Versioning\n\n| File | Path | Notes |\n|------|------|-------|\n| `VERSION` | file text | version |\n| `package.json` | `version` | version |\n';
      const manifest = {
        schemaVersion: 1, runtimeVersion: '1', modules: [], extensions: [],
        snippets: [{ id: 'project.tech', path: 'steering/snippets/project-tech.md', consumers: ['worker:deliver'] }],
        validations: [], ...(changelog ? { changelog } : {}),
      };
      write(root, {
        '.gitignore': '.nmg-sdlc/\n',
        'README.md': '# Base\n',
        'steering/snippets/project-tech.md': tech,
        'steering/manifest.json': `${JSON.stringify(manifest)}\n`,
        ...Object.fromEntries(['product', 'tech', 'structure', 'verification'].map((name) => [`steering/modules/${name}.mjs`, 'export default {};\n'])),
        VERSION: '3.4.5\n',
        'package.json': '{"name":"fixture","version":"3.4.5"}\n',
        'CHANGELOG.md': BASE_CHANGELOG,
        'changelog.d/README.md': 'One fragment file per issue: <N>.md.\n',
      });
      git(root, 'add', '.');
      git(root, 'commit', '-qm', 'chore: base');
      git(root, 'remote', 'add', 'origin', remote);
      git(root, 'push', '-q', '-u', 'origin', 'main');
      for (const issue of [42, 43]) {
        const { branch, spec, title } = ISSUES[issue];
        git(root, 'checkout', '-q', '-b', branch, 'main');
        write(root, {
          [`${spec}/requirements.md`]: `${HEADER(issue)}### AC1: ${title}\n\n| FR1 | ${title} | Must |\n`,
          [`${spec}/design.md`]: `${HEADER(issue)}${title}.\n`,
          [`${spec}/tasks.md`]: `${HEADER(issue)}### T001: ${title}\n\n**File(s)**: \`src/${issue}.js\`\n`,
          [`${spec}/feature.gherkin`]: `${HEADER(issue)}Feature: ${title}\n  Scenario: ${title}\n    Given the project\n    When the change ships\n    Then it works\n`,
          [`src/${issue}.js`]: `export const issue = ${issue};\n`,
          ...fragmentFiles(issue),
        });
        git(root, 'add', '.');
        git(root, 'commit', '-qm', `feat: implement #${issue}`);
        git(root, 'push', '-q', '-u', 'origin', branch);
      }
      const run = (binary, args, opts = {}) => {
        if (binary === 'git' || binary === process.execPath) {
          const result = spawnSync(binary, args, { cwd: opts.cwd ?? root, encoding: 'utf8' });
          return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
        }
        if (binary !== 'gh') throw new Error(`Unexpected binary ${binary}`);
        if (args[0] === 'repo') return {
          status: 0, stderr: '',
          stdout: args.includes('--jq') ? 'main\n' : JSON.stringify({ url: 'https://github.test/owner/repo', defaultBranchRef: { name: 'main' } }),
        };
        if (args[0] === 'issue' && args[1] === 'view') {
          const number = Number(args[2]);
          const { title, labels } = ISSUES[number];
          return { status: 0, stderr: '', stdout: JSON.stringify({ number, title, body: '', labels: labels.map((name) => ({ name })), state: 'OPEN',
            url: `https://github.test/owner/repo/issues/${number}` }) };
        }
        if (args[0] === 'pr' && args[1] === 'list') return { status: 0, stdout: '[]', stderr: '' };
        throw new Error(`Unexpected gh ${args.join(' ')}`);
      };
      const prepare = (issue) => runDeliver({ cwd: root, issue, action: 'prepare-version', run, now: () => Date.parse('2026-02-03T04:05:06Z') });
      return { root, remote, prepare };
    }

    test('inserts the issue\'s fragment bullets into the new version section, skips the generated line and deletes the fragment in the version commit', () => {
      const f = fragmentProject({ fragmentFiles: (issue) => ({
        [`changelog.d/${issue}.md`]: FRAGMENTS[issue],
        // Another issue's fragment, and a file that is not `<N>.md`, are not this issue's to assemble.
        ...(issue === 42 ? { 'changelog.d/99.md': '- Someone else\'s change (#99)\n', 'changelog.d/42-notes.md': '- Not a fragment (#42)\n' } : {}),
      }) });
      git(f.root, 'checkout', '-q', ISSUES[42].branch);
      const before = git(f.root, 'rev-parse', 'HEAD');

      const result = f.prepare(42);

      expect(result).toMatchObject({ status: 0, handoff: null, prepared: { issue: 42, version: '3.5.0' } });
      expect(result.prepared.changedPaths).toEqual(['VERSION', 'CHANGELOG.md', 'package.json', 'changelog.d/42.md']);
      // The bullets sit under the issue's classification heading; no `- Queue merges (#42)` line was generated.
      expect(read(f.root, 'CHANGELOG.md')).toBe('# Changelog\n\n## [Unreleased]\n\n## [3.5.0] - 2026-02-03\n\n'
        + '### Changed\n\n- Queue merges across worktrees (#42)\n  One queue per repository.\n- Stop a crashed session blocking the queue (#42)\n\n'
        + '## [3.4.5] - 2026-01-01\n\n- old\n');
      expect(read(f.root, 'VERSION')).toBe('3.5.0\n');
      expect(JSON.parse(read(f.root, 'package.json')).version).toBe('3.5.0');
      // Only this issue's fragment is gone.
      expect(fs.readdirSync(path.join(f.root, 'changelog.d')).sort()).toEqual(['42-notes.md', '99.md', 'README.md']);
      expect(read(f.root, 'changelog.d/99.md')).toBe('- Someone else\'s change (#99)\n');

      // One version commit carries the changelog, the version files and the deletion.
      const head = git(f.root, 'rev-parse', 'HEAD');
      expect(result.prepared.headSha).toBe(head);
      expect(git(f.root, 'rev-parse', 'HEAD~1')).toBe(before);
      expect(git(f.root, 'log', '-1', '--format=%s')).toBe('feat: deliver issue #42');
      expect(git(f.root, 'show', '--name-status', '--format=', 'HEAD').split('\n').sort()).toEqual([
        'D\tchangelog.d/42.md', 'M\tCHANGELOG.md', 'M\tVERSION', 'M\tpackage.json',
      ]);
      expect(git(f.root, 'status', '--porcelain')).toBe('');
      expect(git(f.remote, 'rev-parse', `refs/heads/${ISSUES[42].branch}`)).toBe(head);

      // Preparing again finds the version already synchronized and commits nothing.
      expect(f.prepare(42)).toMatchObject({ status: 0, prepared: { version: '3.5.0', headSha: head, changedPaths: [] } });
      expect(git(f.root, 'rev-parse', 'HEAD')).toBe(head);
    });

    test('adds the generated line as well when no fragment bullet cites the issue', () => {
      const f = fragmentProject({ fragmentFiles: (issue) => ({ [`changelog.d/${issue}.md`]: '- Reclaim a slot from a dead holder\n- See also (#430) and (#4)\n' }) });
      git(f.root, 'checkout', '-q', ISSUES[43].branch);

      expect(f.prepare(43)).toMatchObject({ status: 0, prepared: { version: '3.4.6' } });

      expect(read(f.root, 'CHANGELOG.md')).toBe('# Changelog\n\n## [Unreleased]\n\n## [3.4.6] - 2026-02-03\n\n'
        + '### Fixed\n\n- Reclaim a slot from a dead holder\n- See also (#430) and (#4)\n- Pool heavy jobs (#43)\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
      expect(fs.existsSync(path.join(f.root, 'changelog.d/43.md'))).toBe(false);
    });

    test('AC4: two branches with fragments get different versions, both issues\' bullets reach CHANGELOG.md, and neither integration conflicts', () => {
      const f = fragmentProject();
      // Until version preparation, CHANGELOG.md is identical on main and on both issue branches.
      for (const { branch } of Object.values(ISSUES)) {
        expect(git(f.root, 'diff', '--name-only', `main...${branch}`).split('\n')).not.toContain('CHANGELOG.md');
        expect(git(f.root, 'show', `${branch}:CHANGELOG.md`)).toBe(BASE_CHANGELOG.trim());
      }

      // #42 is at the head of the queue: it prepares its version and merges.
      git(f.root, 'checkout', '-q', ISSUES[42].branch);
      const first = f.prepare(42);
      expect(first).toMatchObject({ status: 0, prepared: { issue: 42, version: '3.5.0' } });
      git(f.root, 'checkout', '-q', 'main');
      git(f.root, 'merge', '-q', '--no-ff', '-m', 'Queue merges (#42)', ISSUES[42].branch);
      git(f.root, 'push', '-q', 'origin', 'main');

      // #43 integrates the new default branch: the changelog and version files changed on one side only.
      git(f.root, 'checkout', '-q', ISSUES[43].branch);
      const merge = tryGit(f.root, 'merge', '--no-ff', '-m', "Merge branch 'main' into feature/43-pool", 'main');
      expect(merge.status).toBe(0);
      expect(`${merge.stdout}${merge.stderr}`).not.toMatch(/CONFLICT/);
      expect(git(f.root, 'status', '--porcelain')).toBe('');
      expect(fs.readdirSync(path.join(f.root, 'changelog.d')).sort()).toEqual(['43.md', 'README.md']);

      const second = f.prepare(43);

      expect(second).toMatchObject({ status: 0, prepared: { issue: 43, version: '3.5.1' } });
      expect(second.prepared.version).not.toBe(first.prepared.version);
      expect(second.prepared.changedPaths).toEqual(['VERSION', 'CHANGELOG.md', 'package.json', 'changelog.d/43.md']);
      expect(read(f.root, 'CHANGELOG.md')).toBe('# Changelog\n\n## [Unreleased]\n\n## [3.5.1] - 2026-02-03\n\n'
        + '### Fixed\n\n- Reclaim a heavy-job slot from a dead holder (#43)\n\n'
        + '## [3.5.0] - 2026-02-03\n\n'
        + '### Changed\n\n- Queue merges across worktrees (#42)\n  One queue per repository.\n- Stop a crashed session blocking the queue (#42)\n\n'
        + '## [3.4.5] - 2026-01-01\n\n- old\n');
      expect(git(f.root, 'log', '-1', '--format=%s')).toBe('fix: deliver issue #43');
      // Both fragment files are gone.
      expect(fs.readdirSync(path.join(f.root, 'changelog.d'))).toEqual(['README.md']);

      // The prepared branch merges into the default branch cleanly too.
      git(f.root, 'checkout', '-q', 'main');
      expect(tryGit(f.root, 'merge', '--no-ff', '-m', 'Pool heavy jobs (#43)', ISSUES[43].branch).status).toBe(0);
      expect(read(f.root, 'VERSION')).toBe('3.5.1\n');
      expect(fs.readdirSync(path.join(f.root, 'changelog.d'))).toEqual(['README.md']);
    });

    test('is unchanged without the opt-in: the fragment file is neither read nor deleted', () => {
      const f = fragmentProject({ changelog: null });
      git(f.root, 'checkout', '-q', ISSUES[42].branch);

      const result = f.prepare(42);

      expect(result).toMatchObject({ status: 0, prepared: { version: '3.5.0', changedPaths: ['VERSION', 'CHANGELOG.md', 'package.json'] } });
      expect(read(f.root, 'CHANGELOG.md')).toBe('# Changelog\n\n## [Unreleased]\n\n## [3.5.0] - 2026-02-03\n\n### Changed\n\n- Queue merges (#42)\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
      expect(read(f.root, 'changelog.d/42.md')).toBe(FRAGMENTS[42]);
      expect(git(f.root, 'show', '--name-status', '--format=', 'HEAD').split('\n').sort()).toEqual(['M\tCHANGELOG.md', 'M\tVERSION', 'M\tpackage.json']);
    });

    test('with the opt-in but no fragment for the issue, the generated line is the entry', () => {
      const f = fragmentProject({ fragmentFiles: () => ({}) });
      git(f.root, 'checkout', '-q', ISSUES[43].branch);

      expect(f.prepare(43)).toMatchObject({ status: 0, prepared: { version: '3.4.6', changedPaths: ['VERSION', 'CHANGELOG.md', 'package.json'] } });
      expect(read(f.root, 'CHANGELOG.md')).toBe('# Changelog\n\n## [Unreleased]\n\n## [3.4.6] - 2026-02-03\n\n### Fixed\n\n- Pool heavy jobs (#43)\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    });
  });
});
