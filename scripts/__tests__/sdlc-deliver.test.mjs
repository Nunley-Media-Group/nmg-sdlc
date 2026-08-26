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
const SELF_REFERENTIAL_BREAKING_BODY = [
  '## User Story',
  '',
  '**As a** deliver worker',
  '**I want** version bump, PR create/resume, CI/thread classification, exact-head merge, and merge+close proof to run in code',
  '**So that** a model is prompted only when a bot thread or CI failure needs a code change',
  '',
  '## Background',
  '',
  'Every deliver worker currently inlines `workflows/open-pr/WORKFLOW.md` plus `workflows/address-pr-comments/WORKFLOW.md`. That cost is paid even when checks are green. Moving delivery into a controller must still apply bot clear-fixes, still stop on human review, and still refuse success until PR `MERGED` and issue `CLOSED`.',
  '',
  '## Current State',
  '',
  '- `STEP_EXTRA_WORKFLOWS = { implement: [\'simplify\'], deliver: [\'address-pr-comments\'] }`.',
  '- Test `workerPrompt inlines extra workflows for implement and deliver` expects deliver prompts to contain `# Address PR Comments`.',
  '- `scripts/pr-delivery-state.mjs` exports `classifyPrDeliveryState`.',
  '- Open-pr workflow covers spec resolver, BREAKING/major gate, version files, push, PR loop, bot vs human threads, squash merge with `--match-head-commit`.',
  '',
  '## Acceptance Criteria',
  '',
  '### AC1: delivery controller preserves terminal delivery',
  '',
  '**Given** a sibling deliver worker for `#N`',
  '**When** the compact open-pr workflow runs',
  '**Then** it invokes new `scripts/sdlc-deliver.mjs` (no equivalent module; wrap `classifyPrDeliveryState` and verification-readiness, do not fork)',
  '**And** the controller still performs spec/verification gates, version bump of `VERSION` + `package.json` + `CHANGELOG.md` `[Unreleased]` rollover + managed technical steering versioned-files, push, PR create/resume, poll, `gh pr merge --squash --match-head-commit <head> --delete-branch` unless managed technical steering says otherwise, re-fetch MERGED+CLOSED, local branch delete only after proof, and writes `.omp/sdlc/handoffs/N-deliver.json`',
  '**And** leftover `spike` labels still do not skip the version bump',
  '**And** BREAKING without spec `**Version bump**: major` still fails `major_bump_required` with intervention',
  '**And** execute still launches a sibling deliver worker and still does not open PRs in the main pane',
  '',
  '### AC2: bot remediation still happens, just not always inlined',
  '',
  '**Given** unresolved bot threads classified as clear-fix, or failing in-scope checks',
  '**When** the controller cannot finish without an edit',
  '**Then** it prompts the same deliver worker with a compact packet: PR head SHA, failing check names, unresolved thread file:line + comment text, required handoff path',
  '**And** after edits it re-validates head, checks, and threads in code',
  '**And** green PRs with no unresolved bot threads do not inline `address-pr-comments`',
  '**And** implement still inlines `simplify`',
  '**And** bot detection remains `__typename === "Bot"` or login `coderabbitai` or logins in the manifest-registered technical steering snippet',
  '',
  '### AC3: human review still stops the queue',
  '',
  '**Given** an unresolved human or ambiguous review thread',
  '**When** the controller classifies it',
  '**Then** it writes failed handoff `reasonCode: human_review`, `intervention: true`, `step: deliver`',
  '**And** it does not merge',
  '',
  '### AC4: no reduction of merge proof',
  '',
  '**Given** merge or issue-close proof is missing',
  '**When** the controller finishes an attempt',
  '**Then** it writes a failed handoff (e.g. `merge_failed`) rather than reporting success',
  '**And** success still requires PR state `MERGED` with matching head and issue state `CLOSED`',
  '',
  '## Functional Requirements',
  '',
  '| ID | Requirement | Priority |',
  '|----|-------------|----------|',
  '| FR1 | Add `scripts/sdlc-deliver.mjs` with CLI `--issue N`. | Must |',
  '| FR2 | Stop unconditionally inlining `address-pr-comments` in `STEP_EXTRA_WORKFLOWS.deliver`. Update `scripts/__tests__/sdlc-execute.test.mjs`. | Must |',
  '| FR3 | Compact `workflows/open-pr/WORKFLOW.md`. Keep `workflows/address-pr-comments/WORKFLOW.md` as on-demand remediation text or an equivalent packet template. | Must |',
  '| FR4 | No reduction of function versus current open-pr + address-pr-comments. Bot clear-fixes, CI safe fixes, exact-head merge, and human-review intervention all remain. | Must |',
  '',
  '## Notes',
  '',
  'Do not auto-merge over human review. Do not move deliver into the execute orchestrator.',
  '',
  'Depends on: Move start and execute orchestration into controllers behind sibling workers',
  'Blocks: (none)',
].join('\n');

function verification(issue = 42, specPath = 'specs/42-delivery') {
  const scope = { issueNumber: issue, specPath, status: 'scoped', delivery: { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] }, regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] } };
  return `# Verification\n\n## Implementation Status: **Pass**\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(scope)} -->\n`;
}

function controlledVerification(state, headSha = H1, evidenceKind = 'required_check') {
  const specPath = 'specs/42-delivery';
  const scope = {
    issueNumber: 42,
    specPath,
    status: 'scoped',
    delivery: { acceptanceCriteria: ['AC1'], functionalRequirements: ['FR1'], tasks: ['T001'], scenarios: ['SCN001'] },
    regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] },
  };
  const local = {
    ...scope.delivery,
    regression: scope.regression,
    tests: 'pass',
    steeringGates: 'pass',
  };
  const identity = {
    kind: evidenceKind,
    name: 'contract-tests',
    event: 'pull_request',
    acceptanceCriteria: ['AC1'],
  };
  const readiness = state === 'pr_evidence_pending'
    ? { schemaVersion: 1, state, issueNumber: 42, specPath, local, pendingEvidence: [identity] }
    : {
      schemaVersion: 1,
      state,
      issueNumber: 42,
      specPath,
      local,
      evidence: [{ ...identity, headSha, conclusion: 'SUCCESS', url: 'https://github.test/checks/h1' }],
    };
  const status = state === 'pr_evidence_pending' ? 'PR Evidence Pending' : 'Pass';
  return `# Verification\n\n## Implementation Status: **${status}**\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(scope)} -->\n<!-- nmg-sdlc-pr-readiness: ${JSON.stringify(readiness)} -->\n`;
}

function makeRoot({
  issue = 42,
  version = '3.4.5',
  approvedMajor = false,
  stack = 'node',
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-deliver-'));
  const spec = path.join(root, 'specs', `${issue}-delivery`);
  fs.mkdirSync(spec, { recursive: true });
  const header = `**Issue**: #${issue}\n**Status**: Approved\n`;
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) fs.writeFileSync(path.join(spec, name), `${header}${approvedMajor && ['requirements.md', 'design.md'].includes(name) ? '**Version bump**: major\n' : ''}`);
  fs.writeFileSync(path.join(spec, 'verification-report.md'), verification(issue, `specs/${issue}-delivery`));
  fs.mkdirSync(path.join(root, 'steering', 'snippets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steering', 'manifest.json'), `${JSON.stringify({
    snippets: [{
      id: 'project.tech',
      path: 'steering/snippets/project-tech.md',
      consumers: ['worker:deliver'],
    }],
  }, null, 2)}\n`);
  const versionRows = stack === 'python'
    ? '| `VERSION` | file text | version source |\n| `pyproject.toml` | `project.version` | package version |\n| `src/pennyscan/__init__.py` | `__version__` | runtime version |\n'
    : '| `VERSION` | file text | version source |\n| `package.json` | `version` | package version |\n';
  fs.writeFileSync(path.join(root, 'steering', 'snippets', 'project-tech.md'), `# Tech\n| Predicate | Value | Meaning |\n| \`bots\` | \`true\` | bots |\n| \`logins\` | \`["coderabbitai", "review-bot"]\` | logins |\n## Versioning\n\n\`VERSION\` is the single version source. Stack-specific files are synchronized during delivery.\n\n| File | Path | Notes |\n|------|------|-------|\n${versionRows}\n### Version Bump Classification\n\n| Label | Bump Type | Description |\n|-------|-----------|-------------|\n| \`bug\` | patch | defect |\n`);
  fs.writeFileSync(path.join(root, 'VERSION'), `${version}\n`);
  if (stack === 'python') {
    fs.mkdirSync(path.join(root, 'src', 'pennyscan'), { recursive: true });
    fs.writeFileSync(path.join(root, 'pyproject.toml'), `[project]\nname = "pennyscan"\nversion = "${version}"\n`);
    fs.writeFileSync(path.join(root, 'src', 'pennyscan', '__init__.py'), `__version__ = "${version}"\n`);
  } else {
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name: 'fixture', version }, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
  return root;
}

function openPr({ head = H1, state = 'OPEN', issueState = 'OPEN', threads = [], reviews = [], mergeStateStatus = 'CLEAN', isDraft = false, body = 'Closes #42', base = 'main' } = {}) {
  return { number: 77, url: 'https://github.test/owner/repo/pull/77', state, isDraft, headRefName: '42-delivery', headRefOid: head, baseRefName: base, mergeStateStatus, mergedAt: state === 'MERGED' ? '2026-08-25T00:00:00Z' : null, mergeCommit: state === 'MERGED' ? { oid: 'a'.repeat(40) } : null, reviewThreads: threads, reviews, issueState, body };
}

function fixture(options = {}) {
  const root = makeRoot(options);
  const calls = [];
  const sleeps = [];
  const issue = { number: 42, title: options.title ?? 'Ship deterministic delivery', body: options.body ?? '', labels: (options.labels ?? ['enhancement']).map((name) => ({ name })), state: 'OPEN', url: 'https://github.test/issues/42' };
  const views = [...(options.views ?? [openPr(), openPr(), openPr({ state: 'MERGED', issueState: 'CLOSED' })])];
  let lastView = views[views.length - 1] ?? openPr();
  let editedBody = null;
  let gitHead = options.gitHead ?? H1;
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') {
      if (args[0] === 'branch' && args[1] === '--show-current') return { status: 0, stdout: '42-delivery\n', stderr: '' };
      if (args[0] === 'status') {
        const stdout = (options.dirtyPaths ?? []).map((entry) => ` M ${entry}\0`).join('');
        return { status: 0, stdout, stderr: '' };
      }
      if (args[0] === 'diff' && args.includes('--cached')) return { status: options.emptyStagedDiff ? 0 : 1, stdout: '', stderr: '' };
      if (args[0] === 'diff' && args[1] === '--quiet') return { status: options.deliveryStateDirty ? 1 : 0, stdout: '', stderr: '' };
      if (args[0] === 'log') return { status: options.deliveryCommit ? 0 : 1, stdout: options.deliveryCommit ? `${H1}\n` : '', stderr: '' };
      if (args[0] === 'show') {
        const defaultPaths = options.stack === 'python'
          ? ['VERSION', 'pyproject.toml', 'src/pennyscan/__init__.py', 'CHANGELOG.md']
          : ['VERSION', 'package.json', 'CHANGELOG.md'];
        return { status: 0, stdout: `${(options.deliveryPaths ?? defaultPaths).join('\0')}\0`, stderr: '' };
      }
      if (args[0] === 'rev-parse' && args.includes('@{upstream}')) return { status: options.noUpstream ? 1 : 0, stdout: 'origin/42-delivery\n', stderr: '' };
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return { status: 0, stdout: `${gitHead}\n`, stderr: '' };
      if (args[0] === 'commit') gitHead = H2;
      const failure = options.gitFailures?.find(({ match }) => args.join(' ').includes(match));
      if (failure) return { status: 1, stdout: '', stderr: failure.message ?? 'failed' };
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command !== 'gh') throw new Error(`unexpected command ${command}`);
    if (args[0] === 'repo' && args[1] === 'view') {
      return { status: 0, stdout: JSON.stringify({ defaultBranchRef: { name: options.defaultBase ?? 'main' } }), stderr: '' };
    }
    if (args[0] === 'issue' && args[1] === 'view' && args[4]?.includes('title')) return { status: 0, stdout: JSON.stringify(issue), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ number: 42, state: lastView.issueState, url: issue.url }), stderr: '' };
    if (args[0] === 'pr' && args[1] === 'list') {
      const existing = options.existingPr === true ? openPr() : options.existingPr;
      return { status: 0, stdout: JSON.stringify(existing ? [existing] : []), stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'create') return { status: 0, stdout: 'https://github.test/pr/77\n', stderr: '' };
    if (args[0] === 'pr' && args[1] === 'view') {
      lastView = views.length ? views.shift() : lastView;
      if (editedBody !== null) lastView.body = editedBody;
      return { status: 0, stdout: JSON.stringify(lastView), stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'edit') {
      editedBody = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
      lastView.body = editedBody;
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'ready') { lastView.isDraft = false; return { status: 0, stdout: '', stderr: '' }; }
    if (args[0] === 'api' && args[1] === 'graphql') {
      const graphThreads = lastView.reviewThreads.map((thread) => ({
        ...thread,
        comments: {
          nodes: Array.isArray(thread.comments) ? thread.comments : (thread.comments?.nodes ?? []),
          pageInfo: { hasNextPage: options.commentsHasNextPage === true },
        },
      }));
      const value = options.graphqlErrors
        ? { errors: options.graphqlErrors }
        : { data: { repository: { pullRequest: { reviewThreads: {
          nodes: graphThreads,
          pageInfo: { hasNextPage: options.threadsHasNextPage === true },
        } } } } };
      return { status: 0, stdout: JSON.stringify(value), stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'checks') {
      const required = args.includes('--required');
      if (required && options.noRequiredChecks) {
        const message = typeof options.noRequiredChecks === 'string'
          ? options.noRequiredChecks
          : "no required checks reported on the '42-delivery' branch";
        return { status: 1, stdout: '', stderr: `${message}\n` };
      }
      const checks = required && options.requiredChecks !== undefined
        ? options.requiredChecks
        : (options.checks ?? []);
      const status = required && options.requiredChecksStatus !== undefined
        ? options.requiredChecksStatus
        : (options.checksStatus ?? 0);
      return { status, stdout: JSON.stringify(checks), stderr: '' };
    }
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

  test('does not treat the exact self-referential issue body as a breaking declaration', () => {
    const f = fixture({ body: SELF_REFERENTIAL_BREAKING_BODY }); roots.push(f.root);
    expect(runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
  });

  test.each([
    { title: 'breaking: Remove the legacy API' },
    { body: 'Compatibility impact follows.\nBrEaKiNg: Remove the legacy API' },
  ])('fails a genuine BREAKING declaration before mutation: $title$body', (declaration) => {
    const f = fixture(declaration); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('major_bump_required');
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.4.5');
    expect(f.calls.some((call) => call[1] === 'commit' || call[2] === 'create')).toBe(false);
  });

  test('bumps leftover spike and resumes only a verified synchronized delivery state', () => {
    const fresh = fixture({ labels: ['spike'] }); roots.push(fresh.root);
    expect(runDeliver({ issue: 42, cwd: fresh.root, run: fresh.run, fs, now: () => Date.parse('2026-08-25'), sleep: fresh.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(fresh.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
    expect(JSON.parse(fs.readFileSync(path.join(fresh.root, 'package.json'), 'utf8')).version).toBe('3.5.0');

    const preVersionPr = fixture({ existingPr: true }); roots.push(preVersionPr.root);
    expect(runDeliver({ issue: 42, cwd: preVersionPr.root, run: preVersionPr.run, fs, sleep: preVersionPr.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(preVersionPr.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
    expect(preVersionPr.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(true);

    const resume = fixture({ existingPr: true, version: '3.5.0', deliveryCommit: true }); roots.push(resume.root);
    fs.writeFileSync(path.join(resume.root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [3.5.0] - 2026-08-25\n\n### Changed\n\n- Ship deterministic delivery (#42)\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    expect(runDeliver({ issue: 42, cwd: resume.root, run: resume.run, fs, sleep: resume.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(resume.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
    expect(resume.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(false);
  });

  test('synchronizes steering-declared Python mirrors without package.json', () => {
    const f = fixture({ stack: 'python' }); roots.push(f.root);
    expect(runDeliver({
      issue: 42,
      cwd: f.root,
      run: f.run,
      fs,
      now: () => Date.parse('2026-08-25'),
      sleep: f.sleep,
    }).status).toBe(0);
    expect(fs.existsSync(path.join(f.root, 'package.json'))).toBe(false);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
    expect(fs.readFileSync(path.join(f.root, 'pyproject.toml'), 'utf8')).toContain('version = "3.5.0"');
    expect(fs.readFileSync(path.join(f.root, 'src/pennyscan/__init__.py'), 'utf8')).toContain('__version__ = "3.5.0"');
    const add = f.calls.find((call) => call[0] === 'git' && call[1] === 'add');
    expect(add).toEqual([
      'git', 'add', '--', 'VERSION', 'CHANGELOG.md',
      'pyproject.toml', 'src/pennyscan/__init__.py',
    ]);
  });

  test.each([
    {
      name: 'missing',
      arrange: (root) => fs.rmSync(path.join(root, 'pyproject.toml')),
      message: 'declared version artifact is missing: pyproject.toml',
    },
    {
      name: 'not synchronized',
      arrange: (root) => fs.writeFileSync(
        path.join(root, 'pyproject.toml'),
        '[project]\nname = "pennyscan"\nversion = "0.0.0"\n',
      ),
      message: 'declared version field is not synchronized in pyproject.toml: project.version',
    },
    {
      name: 'outside the repository',
      arrange: (root) => {
        const techPath = path.join(root, 'steering', 'snippets', 'project-tech.md');
        const tech = fs.readFileSync(techPath, 'utf8');
        fs.writeFileSync(
          techPath,
          tech.replace(
            '\n### Version Bump Classification',
            '\n| `../outside.toml` | `project.version` | package version |\n\n### Version Bump Classification',
          ),
        );
      },
      message: 'version artifact path escapes the repository: ../outside.toml',
    },
    {
      name: 'ambiguous',
      arrange: (root) => fs.writeFileSync(
        path.join(root, 'src', 'pennyscan', '__init__.py'),
        '__version__ = "3.4.5"\nlegacy___version__ = "3.4.5"\n',
      ),
      message: 'declared text version field is ambiguous in src/pennyscan/__init__.py: __version__',
    },
  ])('fails before mutation when a declared mirror is $name', ({ arrange, message }) => {
    const f = fixture({ stack: 'python' }); roots.push(f.root);
    arrange(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff).toMatchObject({ status: 'failed', reasonCode: 'delivery_failed' });
    expect(result.handoff.summary).toContain(message);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.4.5');
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(false);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'create')).toBe(false);
  });

  test('does not resume when the delivery commit omits a configured Python mirror', () => {
    const f = fixture({
      stack: 'python',
      existingPr: true,
      version: '3.5.0',
      deliveryCommit: true,
      deliveryPaths: ['VERSION', 'pyproject.toml', 'CHANGELOG.md'],
    }); roots.push(f.root);
    fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [3.5.0] - 2026-08-25\n\n### Changed\n\n- Ship deterministic delivery (#42)\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    expect(runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.6.0');
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(true);
  });

  test('emits complete remediation JSON for failing checks and bot threads', () => {
    const thread = { id: 'T1', isResolved: false, isOutdated: false, comments: [{ body: 'Fix this', path: 'src/a.mjs', line: 9, url: 'https://github.test/thread/1', author: { login: 'review-bot', __typename: 'User' } }] };
    const f = fixture({ checksStatus: 1, checks: [{ name: 'test', state: 'FAILURE', link: 'https://github.test/check/1', event: 'pull_request' }], views: [openPr({ threads: [thread] })] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.status).toBe(3);
    expect(result.stdout.match(/NMG_SDLC_REMEDIATION:/g)).toHaveLength(1);
    expect(result.remediation).toMatchObject({ schemaVersion: 1, kind: 'remediation_required', issue: 42, pullRequest: 77, headSha: H1, failingChecks: [{ name: 'test', url: 'https://github.test/check/1' }], threads: [{ path: 'src/a.mjs', line: 9, body: 'Fix this', url: 'https://github.test/thread/1' }], handoffPath: '.omp/sdlc/handoffs/42-deliver.json' });
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/handoffs/42-deliver.json'))).toBe(false);
  });
  test('keeps the originating inline location when a bot later replies pathlessly', () => {
    const thread = {
      id: 'T1',
      isResolved: false,
      isOutdated: false,
      comments: [
        { body: 'Original', path: 'src/origin.mjs', line: 17, url: 'https://github.test/thread/1', author: { login: 'review-bot', __typename: 'User' } },
        { body: 'Still unresolved', url: 'https://github.test/thread/2', author: { login: 'review-bot', __typename: 'User' } },
      ],
    };
    const f = fixture({ views: [openPr({ threads: [thread] })] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.remediation.threads).toEqual([{
      path: 'src/origin.mjs',
      line: 17,
      body: 'Still unresolved',
      url: 'https://github.test/thread/2',
    }]);
  });


  test('fetches threads through GraphQL and scopes checks to exact required arguments', () => {
    const f = fixture({ checksStatus: 1, checks: [{ name: 'test', state: 'FAILURE', link: 'https://github.test/check/1', event: 'pull_request' }], views: [openPr()] }); roots.push(f.root);
    expect(runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(3);
    const prView = f.calls.find((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'view');
    expect(prView.join(',')).not.toContain('reviewThreads');
    const graphql = f.calls.find((call) => call[0] === 'gh' && call[1] === 'api');
    expect(graphql.slice(0, 10)).toEqual(['gh', 'api', 'graphql', '-F', 'owner=owner', '-F', 'name=repo', '-F', 'number=77', '-f']);
    expect(graphql[10]).toContain('reviewThreads(first: 100)');
    expect(graphql[10]).not.toMatch(/isOutdated\s+path/);
    expect(f.calls.find((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'checks')).toEqual([
      'gh', 'pr', 'checks', '77', '--required', '--json', 'name,state,bucket,link,event',
    ]);
  });

  test('fails closed when GraphQL returns response errors', () => {
    const f = fixture({ graphqlErrors: [{ message: 'Review thread query rejected' }], views: [openPr()] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('delivery_failed');
    expect(result.handoff.summary).toContain('GraphQL review thread query failed: Review thread query rejected');
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'checks')).toBe(false);
  });

  test('fails closed for incomplete pagination and missing check event provenance', () => {
    const paged = fixture({ threadsHasNextPage: true, views: [openPr()] }); roots.push(paged.root);
    const pagedResult = runDeliver({ issue: 42, cwd: paged.root, run: paged.run, fs, sleep: paged.sleep });
    expect(pagedResult.status).toBe(1);
    expect(paged.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge')).toBe(false);

    const unknownEvent = fixture({
      checks: [{ name: 'test', state: 'SUCCESS', link: 'https://github.test/check/1' }],
      views: [openPr()],
    }); roots.push(unknownEvent.root);
    const eventResult = runDeliver({ issue: 42, cwd: unknownEvent.root, run: unknownEvent.run, fs, sleep: unknownEvent.sleep });
    expect(eventResult.status).toBe(1);
    expect(eventResult.handoff.summary).toContain('evidence_incomplete_or_invalid');
  });

  test('fails closed instead of emitting an empty mergeability remediation packet', () => {
    const f = fixture({ views: [openPr({ mergeStateStatus: 'BEHIND' })] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result).toMatchObject({
      status: 1,
      handoff: {
        reasonCode: 'merge_failed',
        intervention: true,
      },
    });
    expect(result.handoff.summary).toContain('mergeability_defect');
    expect(result.stdout).not.toContain('NMG_SDLC_REMEDIATION');
  });
  test('fails closed when required-check collection is not a check status', () => {
    const f = fixture({ checksStatus: 2, views: [openPr()] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('delivery_failed');
    expect(result.handoff.summary).toContain('gh pr checks --required failed');
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge')).toBe(false);
  });
  test.each([
    "no required checks reported on the '42-delivery' branch",
    "no checks reported on the '42-delivery' branch",
  ])('treats the gh empty-check response as an empty complete set: %s', (message) => {
    const merged = openPr({ state: 'MERGED', issueState: 'CLOSED' });
    const f = fixture({
      existingPr: merged,
      gitHead: H1,
      noRequiredChecks: message,
      views: [merged],
    }); roots.push(f.root);
    expect(runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(0);
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

  test('rolls preserved Unreleased notes into the new release', () => {
    const f = fixture(); roots.push(f.root);
    fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- retained note\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    expect(runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, now: () => Date.parse('2026-08-25'), sleep: f.sleep }).status).toBe(0);
    const changelog = fs.readFileSync(path.join(f.root, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('## [Unreleased]\n\n## [3.5.0] - 2026-08-25\n\n### Fixed\n\n- retained note');
    expect(changelog).toContain('### Changed\n\n- Ship deterministic delivery (#42)');
  });

  test('keeps successful delivery passed when post-proof cleanup is already complete', () => {
    const f = fixture({
      gitFailures: [
        { match: 'branch -D 42-delivery' },
        { match: 'push origin --delete 42-delivery' },
      ],
    }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.status).toBe(0);
    expect(result.handoff.summary).toContain('cleanup incomplete: local branch deletion, remote branch deletion');
  });

  test('recognizes an already-merged exact-branch PR without another bump or PR', () => {
    const merged = openPr({ state: 'MERGED', issueState: 'CLOSED' });
    const f = fixture({ existingPr: merged, views: [merged], gitHead: H1 }); roots.push(f.root);
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.4.5');
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'create')).toBe(false);
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(false);
  });

  test('binds controlled-draft H1 evidence to H2 before readiness and merge', () => {
    const pending = fixture({ views: [openPr({ isDraft: true, head: H1 })] }); roots.push(pending.root);
    fs.writeFileSync(path.join(pending.root, 'specs/42-delivery/verification-report.md'), controlledVerification('pr_evidence_pending'));
    const request = runDeliver({ issue: 42, cwd: pending.root, run: pending.run, fs, sleep: pending.sleep });
    expect(request).toMatchObject({
      status: 3,
      prEvidence: { kind: 'pr_evidence_verification_required', headSha: H1, pullRequest: 77 },
    });
    expect(pending.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'ready')).toBe(false);
    expect(pending.calls.find((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'create')).toContain('--base');


    const satisfied = fixture({
      existingPr: openPr({ isDraft: true, head: H1 }),
      dirtyPaths: ['specs/42-delivery/verification-report.md'],
      checks: [{ name: 'contract-tests', state: 'SUCCESS', link: 'https://github.test/checks/h2', event: 'pull_request' }],
      requiredChecks: [],
      views: [
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H2 }),
        openPr({ isDraft: true, head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2, state: 'MERGED', issueState: 'CLOSED' }),
      ],
    }); roots.push(satisfied.root);
    fs.writeFileSync(path.join(satisfied.root, 'specs/42-delivery/verification-report.md'), controlledVerification('pr_evidence_satisfied', H1, 'check_run'));
    const result = runDeliver({ issue: 42, cwd: satisfied.root, run: satisfied.run, fs, sleep: satisfied.sleep });
    expect(result.status).toBe(0);
    const ready = satisfied.calls.findIndex((call) => call.join(' ') === 'gh pr ready 77');
    const edit = satisfied.calls.findIndex((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'edit');
    const merge = satisfied.calls.findIndex((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge');
    expect(edit).toBeGreaterThanOrEqual(0);
    expect(ready).toBeGreaterThan(edit);
    expect(merge).toBeGreaterThan(ready);
    expect(satisfied.calls[merge]).toEqual(['gh', 'pr', 'merge', '77', '--squash', '--match-head-commit', H2]);
    expect(satisfied.calls).toContainEqual([
      'gh', 'pr', 'checks', '77', '--json', 'name,state,bucket,link,event',
    ]);
  });

  test('uses the repository default base for controlled draft creation and validation', () => {
    const f = fixture({
      defaultBase: 'trunk',
      views: [openPr({ isDraft: true, head: H1, base: 'trunk' })],
    }); roots.push(f.root);
    fs.writeFileSync(path.join(f.root, 'specs/42-delivery/verification-report.md'), controlledVerification('pr_evidence_pending'));
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.status).toBe(3);
    expect(f.calls.find((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'create')).toEqual(expect.arrayContaining([
      'gh', 'pr', 'create', '--base', 'trunk',
    ]));
  });

  test('pushes an existing local H2 and still requires remote advancement', () => {
    const f = fixture({
      existingPr: openPr({ isDraft: true, head: H1 }),
      version: '3.5.0',
      deliveryCommit: true,
      gitHead: H2,
      emptyStagedDiff: true,
      views: [
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H1 }),
      ],
    }); roots.push(f.root);
    fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [3.5.0] - 2026-08-25\n\n### Changed\n\n- Ship deterministic delivery (#42)\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    fs.writeFileSync(path.join(f.root, 'specs/42-delivery/verification-report.md'), controlledVerification('pr_evidence_satisfied', H1));
    const result = runDeliver({ issue: 42, cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('verification_not_ready');
    expect(result.handoff.summary).toContain('did not advance H1 to H2');
    expect(f.calls.some((call) => call.join(' ') === 'git push')).toBe(true);
  });
});
