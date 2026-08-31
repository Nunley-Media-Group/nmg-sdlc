import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  enrichMissingCheckEvents,
  initializeDeliverySession,
  parseDeliverCli,
  runDeliver,
} from '../sdlc-deliver.mjs';
import { validateHandoff, writeRun } from '../sdlc-execute.mjs';
import {
  acquireControllerLease,
  releaseControllerLease,
} from '../sdlc-controller-lease.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-deliver.mjs');
const H1 = '1'.repeat(40);
const H2 = '2'.repeat(40);

describe('required check event enrichment', () => {
  const headSha = 'a'.repeat(40);
  const linked = (event = '') => ({
    name: 'required aggregate',
    event,
    state: 'SUCCESS',
    required: true,
    url: 'https://github.com/example/project/actions/runs/12345/job/67890',
  });

  it.each(['pull_request', 'pull_request_target'])('canonicalizes exact-head %s Actions provenance', (event) => {
    expect(enrichMissingCheckEvents([linked()], {
      headSha,
      resolveRun: () => ({ event, headSha }),
    })[0].event).toBe('pull_request');
  });

  it.each(['push', 'merge_group'])('retains resolved non-PR event %s for fail-closed classification', (event) => {
    expect(enrichMissingCheckEvents([linked()], {
      headSha,
      resolveRun: () => ({ event, headSha }),
    })[0].event).toBe(event);
  });

  it.each([
    ['', headSha],
    ['pull_request', 'b'.repeat(40)],
  ])('does not enrich unusable event/head evidence', (event, observedHead) => {
    expect(enrichMissingCheckEvents([linked()], {
      headSha,
      resolveRun: () => ({ event, headSha: observedHead }),
    })[0].event).toBe('');
  });

  it('preserves explicit events without resolving a run', () => {
    let calls = 0;
    const result = enrichMissingCheckEvents([linked('pull_request')], {
      headSha,
      resolveRun: () => { calls += 1; return { event: 'push', headSha }; },
    });
    expect(result[0].event).toBe('pull_request');
    expect(calls).toBe(0);
  });

  it('rejects malformed links and caches shared run lookups', () => {
    let calls = 0;
    const checks = [
      linked(),
      { ...linked(), name: 'second aggregate' },
      { ...linked(), name: 'malformed', url: 'https://example.test/actions/runs/12345' },
    ];
    const result = enrichMissingCheckEvents(checks, {
      headSha,
      resolveRun: () => { calls += 1; return { event: 'pull_request', headSha }; },
    });
    expect(result.map(({ event }) => event)).toEqual(['pull_request', 'pull_request', '']);
    expect(calls).toBe(1);
  });

  it('keeps unreadable run evidence fail-closed', () => {
    expect(enrichMissingCheckEvents([linked()], {
      headSha,
      resolveRun: () => { throw new Error('unavailable'); },
    })[0].event).toBe('');
  });
});
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

function controlledVerification(
  state,
  headSha = H1,
  evidenceKind = 'required_check',
  names = ['contract-tests'],
) {
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
  const identities = names.map((name) => ({
    kind: evidenceKind,
    name,
    event: 'pull_request',
    acceptanceCriteria: ['AC1'],
  }));
  const readiness = state === 'pr_evidence_pending'
    ? { schemaVersion: 1, state, issueNumber: 42, specPath, local, pendingEvidence: identities }
    : {
      schemaVersion: 1,
      state,
      issueNumber: 42,
      specPath,
      local,
      evidence: identities.map((identity) => ({
        ...identity,
        headSha,
        conclusion: 'SUCCESS',
        url: 'https://github.test/checks/h1',
      })),
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

const leases = [];

function fixture(options = {}) {
  const root = makeRoot(options);
  const calls = [];
  const sleeps = [];
  const issue = { number: 42, title: options.title ?? 'Ship deterministic delivery', body: options.body ?? '', labels: (options.labels ?? ['enhancement']).map((name) => ({ name })), state: 'OPEN', url: 'https://github.test/issues/42' };
  const views = [...(options.views ?? [openPr(), openPr(), openPr({ state: 'MERGED', issueState: 'CLOSED' })])];
  let lastView = views[views.length - 1] ?? openPr();
  const existingPr = options.existingPr === true ? openPr() : options.existingPr;
  const checksSequence = [...(options.checksSequence ?? [])];
  let editedBody = null;
  let gitHead = options.gitHead ?? H1;
  let dirtyPaths = [...(options.dirtyPaths ?? [])];
  writeRun({
    schemaVersion: 1,
    projectRoot: fs.realpathSync(root),
    runId: 'execute-run',
    issue: 42,
    branch: '42-delivery',
    head: gitHead,
    issues: [42],
    revision: 1,
    currentIssue: 42,
    currentStep: 'deliver',
    completed: {},
    failed: null,
    startedAt: '2026-08-25T00:00:00.000Z',
  }, root, 0);
  if (options.scoped !== false) {
    leases.push(acquireControllerLease({
      projectRoot: root,
      runId: 'execute-run',
      controllerPaneId: 'execute-pane',
    }));
  }
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') {
      if (args[0] === 'branch' && args[1] === '--show-current') return { status: 0, stdout: '42-delivery\n', stderr: '' };
      if (args[0] === 'status') {
        const stdout = dirtyPaths.map((entry) => ` M ${entry}\0`).join('');
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
      if (args[0] === 'commit') {
        gitHead = H2;
        const message = args[args.indexOf('-m') + 1] ?? '';
        dirtyPaths = message.startsWith('docs: record PR evidence')
          ? []
          : dirtyPaths.filter((entry) => entry.endsWith('/verification-report.md'));
      }
      if (args[0] === 'push' && dirtyPaths.length === 0
        && existingPr?.state === 'OPEN' && options.advanceExistingPrOnPush !== false) {
        for (const view of views) {
          if (view.headRefName === existingPr.headRefName && view.headRefOid === existingPr.headRefOid) {
            view.headRefOid = gitHead;
          }
        }
      }
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
      return { status: 0, stdout: JSON.stringify(existingPr ? [existingPr] : []), stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'create') return { status: 0, stdout: 'https://github.test/pr/77\n', stderr: '' };
    if (args[0] === 'pr' && args[1] === 'view') {
      const identityOnly = !String(args[4] ?? '').includes('reviews');
      lastView = views.length ? (identityOnly ? views[0] : views.shift()) : lastView;
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
      const checks = !required && checksSequence.length
        ? checksSequence.shift()
        : required && options.requiredChecks !== undefined
          ? options.requiredChecks
          : (options.checks ?? []);
      const status = required && options.requiredChecksStatus !== undefined
        ? options.requiredChecksStatus
        : (options.checksStatus ?? 0);
      return { status, stdout: JSON.stringify(checks), stderr: '' };
    }
    if (args[0] === 'pr' && args[1] === 'merge') {
      if (options.mergeView) lastView = options.mergeView;
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`unexpected gh args: ${args.join(' ')}`);
  };
  return { root, calls, sleeps, run, sleep: (milliseconds) => sleeps.push(milliseconds) };
}

function handoff(root) { return JSON.parse(fs.readFileSync(path.join(root, '.omp/sdlc/handoffs/42-deliver.json'), 'utf8')); }
function seedReconciliation(root, relativeRunPath = '.omp/sdlc/run.json') {
  const runPath = path.join(root, relativeRunPath);
  const runState = JSON.parse(fs.readFileSync(runPath, 'utf8'));
  runState.revision += 1;
  runState.delivery = {
    issue: 42,
    pullRequest: 77,
    expectedHead: H1,
    status: 'reconciliation_required',
    reconciliation: {
      expected: { pullRequest: 77, head: H1 },
      observed: { pullRequest: 77, head: H2, state: 'OPEN' },
    },
  };
  fs.writeFileSync(runPath, `${JSON.stringify(runState, null, 2)}\n`);
  return runPath;
}
const roots = [];
afterEach(() => {
  while (leases.length) releaseControllerLease(leases.pop());
  while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

describe('sdlc delivery controller', () => {
  test('parses only supported CLI forms and invalid CLI has no handoff', () => {
    expect(() => parseDeliverCli(['--issue', '#42'])).toThrow();
    expect(parseDeliverCli(['session-init', '--issue', '#42'])).toEqual({ command: 'session-init', issue: 42 });
    expect(parseDeliverCli([
      '--issue', '42', '--controller-run-id', 'run-42', '--remediation-result', 'human_review',
    ])).toEqual({
      issue: 42,
      controllerRunId: 'run-42',
      remediationResult: 'human_review',
    });
    const token = '11111111-1111-4111-8111-111111111111';
    expect(parseDeliverCli([
      '--issue', '42', '--session-token', token,
    ])).toEqual({
      issue: 42,
      sessionToken: token,
      remediationResult: null,
    });
    const root = makeRoot(); roots.push(root);
    const result = spawnSync(process.execPath, [SCRIPT, '--issue', 'nope'], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('Usage: node scripts/sdlc-deliver.mjs session-init --issue N | --issue N (--controller-run-id R | --session-token T) [--remediation-result human_review]');
    expect(fs.existsSync(path.join(root, '.omp/sdlc/handoffs'))).toBe(false);
  });

  test('rejects an unscoped delivery helper without changing protected artifacts', () => {
    const f = fixture({ scoped: false });
    roots.push(f.root);
    const lease = acquireControllerLease({
      projectRoot: f.root,
      runId: 'execute-run',
      controllerPaneId: 'execute-pane',
    });
    const version = fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8');
    const changelog = fs.readFileSync(path.join(f.root, 'CHANGELOG.md'), 'utf8');
    const callCount = f.calls.length;

    const rejected = runDeliver({
      issue: 42,
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(rejected).toMatchObject({
      status: 1,
      stderr: 'delivery_scope_required\n',
      handoff: null,
    });
    expect(f.calls).toHaveLength(callCount);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8')).toBe(version);
    expect(fs.readFileSync(path.join(f.root, 'CHANGELOG.md'), 'utf8')).toBe(changelog);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/handoffs/42-deliver.json'))).toBe(false);

    const scoped = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });
    expect(scoped.status).toBe(0);
    expect(releaseControllerLease(lease)).toBe(true);
  });

  test('isolates standalone session state and handoffs from canonical execute state', () => {
    const f = fixture(); roots.push(f.root);
    const token = '22222222-2222-4222-8222-222222222222';
    const canonicalRunPath = path.join(f.root, '.omp/sdlc/run.json');
    fs.writeFileSync(canonicalRunPath, `${JSON.stringify({
      schemaVersion: 1,
      projectRoot: fs.realpathSync(f.root),
      runId: 'execute-run',
      issue: 41,
      branch: '41-canonical',
      head: H1,
      issues: [41],
      revision: 1,
      currentIssue: 41,
      currentStep: 'verify',
      completed: {},
      failed: null,
      startedAt: '2026-08-25T00:00:00.000Z',
    }, null, 2)}\n`);
    const canonicalHandoff = path.join(f.root, '.omp/sdlc/handoffs/41-deliver.json');
    fs.writeFileSync(canonicalHandoff, 'canonical-handoff\n');
    const canonicalRun = fs.readFileSync(canonicalRunPath, 'utf8');
    const canonicalHandoffBytes = fs.readFileSync(canonicalHandoff, 'utf8');

    const initialized = initializeDeliverySession({
      issue: 42,
      cwd: f.root,
      run: f.run,
      fs,
      token,
      now: () => '2026-08-25T00:00:00.000Z',
    });
    expect(initialized.stdout).toBe(`NMG_SDLC_SESSION: ${token}\n`);
    expect(initialized.runState).toMatchObject({
      schemaVersion: 1,
      runId: token,
      issue: 42,
      revision: 1,
      currentStep: 'deliver',
    });

    const result = runDeliver({
      issue: 42,
      sessionToken: token,
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });
    expect(result).toMatchObject({
      status: 0,
      handoffPath: `.omp/sdlc/sessions/${token}/handoffs/42-deliver.json`,
      handoff: { status: 'passed' },
    });
    expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'), 'utf8')).toBe(canonicalRun);
    expect(fs.readFileSync(canonicalHandoff, 'utf8')).toBe(canonicalHandoffBytes);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/handoffs/42-deliver.json'))).toBe(false);
  });

  test.each([
    ['run.json', '33333333-3333-4333-8333-333333333333'],
    ['handoffs', '44444444-4444-4444-8444-444444444444'],
  ])('rejects a symlinked isolated-session %s before reading state or invoking commands', (entry, token) => {
    const f = fixture(); roots.push(f.root);
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-session-boundary-')); roots.push(external);
    initializeDeliverySession({
      issue: 42,
      cwd: f.root,
      run: f.run,
      fs,
      token,
      now: () => '2026-08-25T00:00:00.000Z',
    });
    const sessionRoot = path.join(f.root, '.omp/sdlc/sessions', token);
    const sessionEntry = path.join(sessionRoot, entry);
    if (entry === 'run.json') {
      fs.copyFileSync(sessionEntry, path.join(external, 'run.json'));
      fs.rmSync(sessionEntry);
      fs.symlinkSync(path.join(external, 'run.json'), sessionEntry);
    } else {
      fs.rmSync(sessionEntry, { recursive: true });
      fs.symlinkSync(external, sessionEntry);
    }
    const callCount = f.calls.length;

    const result = runDeliver({
      issue: 42,
      sessionToken: token,
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result).toMatchObject({
      status: 1,
      stderr: 'unsafe_session_path\n',
      handoff: null,
    });
    expect(f.calls).toHaveLength(callCount);
    expect(fs.readdirSync(external)).toEqual(entry === 'run.json' ? ['run.json'] : []);
  });

  test('does not treat the exact self-referential issue body as a breaking declaration', () => {
    const f = fixture({ body: SELF_REFERENTIAL_BREAKING_BODY }); roots.push(f.root);
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
  });

  test.each([
    { title: 'breaking: Remove the legacy API' },
    { body: 'Compatibility impact follows.\nBrEaKiNg: Remove the legacy API' },
  ])('fails a genuine BREAKING declaration before mutation: $title$body', (declaration) => {
    const f = fixture(declaration); roots.push(f.root);
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('major_bump_required');
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.4.5');
    expect(f.calls.some((call) => call[1] === 'commit' || call[2] === 'create')).toBe(false);
  });

  test('bumps leftover spike and resumes only a verified synchronized delivery state', () => {
    const fresh = fixture({ labels: ['spike'] }); roots.push(fresh.root);
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: fresh.root, run: fresh.run, fs, now: () => Date.parse('2026-08-25'), sleep: fresh.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(fresh.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
    expect(JSON.parse(fs.readFileSync(path.join(fresh.root, 'package.json'), 'utf8')).version).toBe('3.5.0');

    const preVersionPr = fixture({ existingPr: true }); roots.push(preVersionPr.root);
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: preVersionPr.root, run: preVersionPr.run, fs, sleep: preVersionPr.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(preVersionPr.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
    expect(preVersionPr.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(true);
    expect(preVersionPr.calls).toContainEqual([
      'gh', 'pr', 'merge', '77', '--squash', '--match-head-commit', H2,
    ]);
    expect(preVersionPr.calls).not.toContainEqual([
      'gh', 'pr', 'merge', '77', '--squash', '--match-head-commit', H1,
    ]);

    const resume = fixture({ existingPr: true, version: '3.5.0', deliveryCommit: true }); roots.push(resume.root);
    fs.writeFileSync(path.join(resume.root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [3.5.0] - 2026-08-25\n\n### Changed\n\n- Ship deterministic delivery (#42)\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: resume.root, run: resume.run, fs, sleep: resume.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(resume.root, 'VERSION'), 'utf8').trim()).toBe('3.5.0');
    expect(resume.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(false);
  });

  test('never merges a stale existing PR at its pre-version head', () => {
    const f = fixture({
      existingPr: openPr({ head: H1 }),
      advanceExistingPrOnPush: false,
      views: [openPr({ head: H1 })],
    }); roots.push(f.root);

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result).toMatchObject({
      status: 1,
      handoff: { reasonCode: 'delivery_reconciliation_required' },
    });
    expect(f.calls).toContainEqual(['git', 'push']);
    expect(f.calls.some((call) => (
      call[0] === 'gh' && call[1] === 'pr' && ['ready', 'merge'].includes(call[2])
    ))).toBe(false);
  });

  test('synchronizes steering-declared Python mirrors without package.json', () => {
    const f = fixture({ stack: 'python' }); roots.push(f.root);
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root,
    run: f.run,
    fs,
    now: () => Date.parse('2026-08-25'),
    sleep: f.sleep, }).status).toBe(0);
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
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
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
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(0);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.6.0');
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(true);
  });

  test('emits complete remediation JSON for failing checks and bot threads', () => {
    const thread = { id: 'T1', isResolved: false, isOutdated: false, comments: [{ body: 'Fix this', path: 'src/a.mjs', line: 9, url: 'https://github.test/thread/1', author: { login: 'review-bot', __typename: 'User' } }] };
    const f = fixture({ checksStatus: 1, checks: [{ name: 'test', state: 'FAILURE', link: 'https://github.test/check/1', event: 'pull_request' }], views: [openPr({ threads: [thread] })] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.status).toBe(3);
    expect(result.stdout.match(/NMG_SDLC_REMEDIATION:/g)).toHaveLength(1);
    expect(result.remediation).toMatchObject({ schemaVersion: 1, kind: 'remediation_required', issue: 42, pullRequest: 77, headSha: H1, failingChecks: [{ name: 'test', url: 'https://github.test/check/1' }], threads: [{ path: 'src/a.mjs', line: 9, body: 'Fix this', url: 'https://github.test/thread/1' }], handoffPath: '.omp/sdlc/handoffs/42-deliver.json' });
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/handoffs/42-deliver.json'))).toBe(false);
  });
  test('remediates a failing non-required check instead of polling UNSTABLE', () => {
    const contributionGate = {
      name: 'Validate nmg-sdlc contribution evidence',
      state: 'FAILURE',
      link: 'https://github.test/check/gate',
      event: 'pull_request',
    };
    const requiredCheck = {
      name: 'contract-tests',
      state: 'SUCCESS',
      link: 'https://github.test/check/contract-tests',
      event: 'pull_request',
    };
    const f = fixture({
      requiredChecks: [requiredCheck],
      checks: [requiredCheck, contributionGate],
      views: [openPr({ mergeStateStatus: 'UNSTABLE' })],
    }); roots.push(f.root);

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result.status).toBe(3);
    expect(result.stdout.match(/NMG_SDLC_REMEDIATION:/g)).toHaveLength(1);
    expect(result.remediation.failingChecks).toContainEqual({
      name: contributionGate.name,
      url: contributionGate.link,
    });
    expect(result.handoff).toBeNull();
    expect(f.sleeps).toEqual([]);
  });

  test('polls a pending non-required check before merging after it succeeds', () => {
    const requiredCheck = {
      name: 'contract-tests',
      state: 'SUCCESS',
      link: 'https://github.test/check/contract-tests',
      event: 'pull_request',
    };
    const pendingCheck = {
      name: 'Validate nmg-sdlc contribution evidence',
      state: 'PENDING',
      link: 'https://github.test/check/gate',
      event: 'pull_request',
    };
    const options = {
      requiredChecks: [requiredCheck],
      checks: [requiredCheck, pendingCheck],
      views: [
        openPr({ mergeStateStatus: 'UNSTABLE' }),
        openPr(),
        openPr({ state: 'MERGED', issueState: 'CLOSED' }),
      ],
    };
    const f = fixture(options); roots.push(f.root);
    let mergeAttemptedWhilePending = false;
    const sleep = (milliseconds) => {
      f.sleeps.push(milliseconds);
      mergeAttemptedWhilePending = f.calls.some(
        (call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge',
      );
      options.checks = [
        requiredCheck,
        { ...pendingCheck, state: 'SUCCESS' },
      ];
    };

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep,
    });

    expect(result.status).toBe(0);
    expect(f.sleeps).toEqual([30_000]);
    expect(mergeAttemptedWhilePending).toBe(false);
    expect(result.stdout).not.toContain('NMG_SDLC_REMEDIATION');
    expect(f.calls.some(
      (call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge',
    )).toBe(true);
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
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.remediation.threads).toEqual([{
      path: 'src/origin.mjs',
      line: 17,
      body: 'Still unresolved',
      url: 'https://github.test/thread/2',
    }]);
  });


  test('fetches threads through GraphQL and scopes checks to exact required arguments', () => {
    const f = fixture({ checksStatus: 1, checks: [{ name: 'test', state: 'FAILURE', link: 'https://github.test/check/1', event: 'pull_request' }], views: [openPr()] }); roots.push(f.root);
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(3);
    const prView = f.calls.find((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'view');
    expect(prView.join(',')).not.toContain('reviewThreads');
    const graphql = f.calls.find((call) => call[0] === 'gh' && call[1] === 'api');
    expect(graphql.slice(0, 10)).toEqual(['gh', 'api', 'graphql', '-F', 'owner=owner', '-F', 'name=repo', '-F', 'number=77', '-f']);
    expect(graphql[10]).toContain('reviewThreads(first: 100)');
    expect(graphql[10]).not.toMatch(/isOutdated\s+path/);
    expect(f.calls.find((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'checks')).toEqual([
      'gh', 'pr', 'checks', '77', '--required', '--json', 'name,state,bucket,link,event,workflow',
    ]);
    expect(f.calls).toContainEqual([
      'gh', 'pr', 'checks', '77', '--json', 'name,state,bucket,link,event,workflow',
    ]);
  });

  test.each(['push', 'merge_group'])('preserves distinct unfiltered %s checks and fails closed', (event) => {
    const f = fixture({
      requiredChecks: [{ name: 'shared', state: 'SUCCESS', link: 'https://github.test/check/required', event: 'pull_request' }],
      checks: [{ name: 'shared', state: 'FAILURE', link: 'https://github.test/check/extra', event }],
    }); roots.push(f.root);

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result.status).toBe(1);
    expect(result.handoff.summary).toContain('evidence_incomplete_or_invalid');
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge')).toBe(false);
  });

  test('fails closed when GraphQL returns response errors', () => {
    const f = fixture({ graphqlErrors: [{ message: 'Review thread query rejected' }], views: [openPr()] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('delivery_failed');
    expect(result.handoff.summary).toContain('GraphQL review thread query failed: Review thread query rejected');
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'checks')).toBe(false);
  });

  test('fails closed for incomplete pagination and missing check event provenance', () => {
    const paged = fixture({ threadsHasNextPage: true, views: [openPr()] }); roots.push(paged.root);
    const pagedResult = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: paged.root, run: paged.run, fs, sleep: paged.sleep });
    expect(pagedResult.status).toBe(1);
    expect(paged.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge')).toBe(false);

    const unknownEvent = fixture({
      checks: [{ name: 'test', state: 'SUCCESS', link: 'https://github.test/check/1' }],
      views: [openPr()],
    }); roots.push(unknownEvent.root);
    const eventResult = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: unknownEvent.root, run: unknownEvent.run, fs, sleep: unknownEvent.sleep });
    expect(eventResult.status).toBe(1);
    expect(eventResult.handoff.summary).toContain('evidence_incomplete_or_invalid');
  });

  test('fails closed instead of emitting an empty mergeability remediation packet', () => {
    const f = fixture({ views: [openPr({ mergeStateStatus: 'BEHIND' })] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
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
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
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
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep }).status).toBe(0);
  });



  test('routes pathless automated review threads to human_review', () => {
    const thread = { id: 'T1', isResolved: false, isOutdated: false, path: null, line: null, comments: [{ body: 'General concern', url: 'https://github.test/thread/1', author: { login: 'review-bot', __typename: 'User' } }] };
    const f = fixture({ views: [openPr({ threads: [thread] })] }); roots.push(f.root);
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('human_review');
    expect(result.status).toBe(1);
  });

  test('routes human and ambiguous remediation to human_review', () => {
    const thread = { id: 'T1', isResolved: false, isOutdated: false, comments: [{ body: 'Redesign', author: { login: 'maintainer', __typename: 'User' } }] };
    const f = fixture({ views: [openPr({ threads: [thread] })] }); roots.push(f.root);
    expect(runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    }).handoff.reasonCode).toBe('human_review');

    const explicit = fixture(); roots.push(explicit.root);
    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: explicit.root,
      run: explicit.run,
      fs,
      remediationResult: 'human_review',
    });
    expect(result.handoff.reasonCode).toBe('human_review');
    expect(validateHandoff(result.handoff)).toEqual(result.handoff);
  });

  test('continues pending delivery beyond the former one-hour ceiling', () => {
    const pendingViews = Array.from(
      { length: 125 },
      () => openPr({ mergeStateStatus: 'UNKNOWN', isDraft: true }),
    );
    const f = fixture({
      views: [
        ...pendingViews,
        openPr(),
        openPr(),
        openPr({ state: 'MERGED', issueState: 'CLOSED' }),
      ],
    }); roots.push(f.root);
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.status).toBe(0);
    expect(f.sleeps.length).toBeGreaterThan(120);
    expect(new Set(f.sleeps)).toEqual(new Set([30_000]));
  });
  test('persists unexpected head changes as byte-stable reconciliation failures', () => {
    const f = fixture({
      views: [openPr({ head: H1 }), openPr({ head: H2 })],
    }); roots.push(f.root);
    const options = {
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    };
    const result = runDeliver(options);
    expect(result).toMatchObject({
      status: 1,
      handoff: { reasonCode: 'delivery_reconciliation_required' },
    });
    const runPath = path.join(f.root, '.omp/sdlc/run.json');
    const handoffPath = path.join(f.root, '.omp/sdlc/handoffs/42-deliver.json');
    const runBytes = fs.readFileSync(runPath, 'utf8');
    const handoffBytes = fs.readFileSync(handoffPath, 'utf8');
    const callsBeforeRerun = f.calls.length;
    expect(runDeliver(options)).toMatchObject({
      status: 1,
      handoff: { reasonCode: 'delivery_reconciliation_required' },
    });
    expect(fs.readFileSync(runPath, 'utf8')).toBe(runBytes);
    expect(fs.readFileSync(handoffPath, 'utf8')).toBe(handoffBytes);
    const rerunCalls = f.calls.slice(callsBeforeRerun);
    expect(rerunCalls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'view')).toBe(true);
    expect(f.calls.filter((call) => call[0] === 'gh' && call[2] === 'create')).toHaveLength(1);
    expect(rerunCalls.some((call) => (
      call[0] === 'gh' && ['list', 'create', 'ready', 'merge'].includes(call[2])
    ) || call[0] === 'git' && call[1] === 'push')).toBe(false);
  });

  test('@SCN001 resumes controller reconciliation at H2 and completes ordinary delivery', () => {
    const successfulCheck = {
      name: 'contract-tests',
      state: 'SUCCESS',
      link: 'https://github.test/check/contract-tests',
      event: 'pull_request',
    };
    const f = fixture({
      gitHead: H2,
      requiredChecks: [successfulCheck],
      checks: [successfulCheck],
      views: [
        openPr({ head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2, state: 'MERGED', issueState: 'CLOSED' }),
      ],
    }); roots.push(f.root);
    seedReconciliation(f.root);

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(JSON.parse(fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'), 'utf8')).delivery).toEqual({
      issue: 42,
      pullRequest: 77,
      expectedHead: H2,
      status: 'complete',
      reconciliation: null,
    });
    expect(f.calls).toContainEqual(['gh', 'pr', 'merge', '77', '--squash', '--match-head-commit', H2]);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && ['list', 'create'].includes(call[2]))).toBe(false);
    expect(f.calls.find(
      (call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'checks',
    )).toEqual([
      'gh', 'pr', 'checks', '77', '--required', '--json', 'name,state,bucket,link,event,workflow',
    ]);
  });

  test('@SCN001 resumes isolated-session reconciliation before ordinary delivery', () => {
    const token = '55555555-5555-4555-8555-555555555555';
    const successfulCheck = {
      name: 'contract-tests',
      state: 'SUCCESS',
      link: 'https://github.test/check/contract-tests',
      event: 'pull_request',
    };
    const f = fixture({
      gitHead: H2,
      requiredChecks: [successfulCheck],
      checks: [successfulCheck],
      views: [
        openPr({ head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2, state: 'MERGED', issueState: 'CLOSED' }),
      ],
    }); roots.push(f.root);
    initializeDeliverySession({
      issue: 42,
      cwd: f.root,
      run: f.run,
      fs,
      token,
      now: () => '2026-08-31T00:00:00.000Z',
    });
    const relativeRunPath = `.omp/sdlc/sessions/${token}/run.json`;
    seedReconciliation(f.root, relativeRunPath);

    const result = runDeliver({
      issue: 42,
      sessionToken: token,
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result).toMatchObject({ status: 0, handoff: { status: 'passed' } });
    expect(JSON.parse(fs.readFileSync(path.join(f.root, relativeRunPath), 'utf8')).delivery).toMatchObject({
      pullRequest: 77,
      expectedHead: H2,
      status: 'complete',
      reconciliation: null,
    });
    expect(f.calls).toContainEqual(['gh', 'pr', 'merge', '77', '--squash', '--match-head-commit', H2]);
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && ['list', 'create'].includes(call[2]))).toBe(false);
  });

  const successfulRequiredCheck = {
    name: 'ci',
    state: 'SUCCESS',
    link: 'https://github.test/check/ci',
    event: 'pull_request',
  };

  test.each([
    ['pending checks', { requiredChecks: [{ name: 'ci', state: 'PENDING' }] }],
    ['failed checks', { requiredChecks: [{ name: 'ci', state: 'FAILURE' }] }],
    ['unknown checks', { requiredChecks: [{ name: 'ci', state: 'UNKNOWN' }] }],
    ['missing check state', { requiredChecks: [{ name: 'ci' }] }],
    ['empty check JSON without none-required evidence', { requiredChecks: [] }],
    ['unreadable checks', { requiredChecks: [successfulRequiredCheck], requiredChecksStatus: 2 }],
    ['a different PR number', {
      requiredChecks: [successfulRequiredCheck],
      views: [{ ...openPr({ head: H2 }), number: 78 }],
    }],
    ['a closed PR', {
      requiredChecks: [successfulRequiredCheck],
      views: [openPr({ head: H2, state: 'CLOSED' })],
    }],
    ['a merged PR', {
      requiredChecks: [successfulRequiredCheck],
      views: [openPr({ head: H2, state: 'MERGED' })],
    }],
    ['a dirty non-runtime path', {
      requiredChecks: [successfulRequiredCheck],
      dirtyPaths: ['src/changed.mjs'],
    }],
    ['a PR head different from local HEAD', {
      requiredChecks: [successfulRequiredCheck],
      views: [openPr({ head: H1 })],
    }],
    ['a foreign PR head branch', {
      requiredChecks: [successfulRequiredCheck],
      views: [{ ...openPr({ head: H2 }), headRefName: 'other-branch' }],
    }],
  ])('@SCN002 keeps reconciliation sticky for %s', (_description, options) => {
    const f = fixture({
      gitHead: H2,
      views: [openPr({ head: H2 })],
      ...options,
    }); roots.push(f.root);
    const runPath = seedReconciliation(f.root);
    const runBytes = fs.readFileSync(runPath, 'utf8');

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result).toMatchObject({
      status: 1,
      handoff: { reasonCode: 'delivery_reconciliation_required' },
    });
    expect(fs.readFileSync(runPath, 'utf8')).toBe(runBytes);
    expect(f.sleeps).toEqual([]);
    expect(f.calls.some((call) => (
      call[0] === 'gh' && ['list', 'create', 'ready', 'merge'].includes(call[2])
    ) || call[0] === 'git' && ['push', 'commit'].includes(call[1]))).toBe(false);
  });

  test('@SCN002 keeps expected-status H1 to H2 rebind independent of pending required checks', () => {
    const f = fixture({
      existingPr: openPr({ head: H1 }),
      requiredChecks: [{ name: 'ci', state: 'PENDING', event: 'pull_request' }],
      checks: [{ name: 'ci', state: 'PENDING', event: 'pull_request' }],
      views: [
        openPr({ head: H1 }),
        openPr({ head: H1 }),
        openPr({ head: H1 }),
      ],
    }); roots.push(f.root);

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: () => { throw new Error('stop after observing pending checks'); },
    });

    expect(result).toMatchObject({ status: 1, handoff: { reasonCode: 'delivery_failed' } });
    expect(JSON.parse(fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'), 'utf8')).delivery).toEqual({
      issue: 42,
      pullRequest: 77,
      expectedHead: H2,
      status: 'expected',
      reconciliation: null,
    });
    expect(f.calls).toContainEqual([
      'gh', 'pr', 'checks', '77', '--required', '--json', 'name,state,bucket,link,event,workflow',
    ]);
  });

  test('requires merge and closure proof before local branch deletion', () => {
    const failed = fixture({ views: [openPr(), openPr(), openPr({ state: 'MERGED', issueState: 'OPEN' })] }); roots.push(failed.root);
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: failed.root, run: failed.run, fs, sleep: failed.sleep }).handoff.reasonCode).toBe('merge_failed');
    expect(failed.calls.some((call) => call[0] === 'git' && call[1] === 'checkout')).toBe(false);
    const passed = fixture(); roots.push(passed.root);
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: passed.root, run: passed.run, fs, sleep: passed.sleep }).status).toBe(0);
    expect(validateHandoff(handoff(passed.root))).toEqual(handoff(passed.root));
    const completed = JSON.parse(fs.readFileSync(path.join(passed.root, '.omp/sdlc/run.json'), 'utf8'));
    expect(completed.delivery).toEqual({
      issue: 42,
      pullRequest: 77,
      expectedHead: H1,
      status: 'complete',
      reconciliation: null,
    });
    expect(passed.calls).toContainEqual([
      'gh', 'pr', 'merge', '77', '--squash', '--match-head-commit', H1,
    ]);
    const proof = passed.calls.map((call) => call.join(' ')).lastIndexOf('gh issue view 42 --json number,state,url');
    expect(passed.calls.findIndex((call) => call[0] === 'git' && call[1] === 'checkout')).toBeGreaterThan(proof);
    expect(passed.calls.findIndex((call) => call.join(' ') === 'git push origin --delete 42-delivery')).toBeGreaterThan(proof);
  });

  test('rolls preserved Unreleased notes into the new release', () => {
    const f = fixture(); roots.push(f.root);
    fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- retained note\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    expect(runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, now: () => Date.parse('2026-08-25'), sleep: f.sleep }).status).toBe(0);
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
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.status).toBe(0);
    expect(result.handoff.summary).toContain('cleanup incomplete: local branch deletion, remote branch deletion');
  });

  test('recognizes an already-merged exact-branch PR without another bump or PR', () => {
    const merged = openPr({ state: 'MERGED', issueState: 'CLOSED' });
    const f = fixture({ existingPr: merged, views: [merged], gitHead: H1 }); roots.push(f.root);
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.4.5');
    expect(f.calls.some((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'create')).toBe(false);
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'commit')).toBe(false);
  });

  test('refuses merged-PR cleanup when local HEAD has diverged', () => {
    const merged = openPr({ state: 'MERGED', issueState: 'CLOSED' });
    const f = fixture({ existingPr: merged, views: [merged], gitHead: H2 }); roots.push(f.root);

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result).toMatchObject({
      status: 1,
      handoff: { reasonCode: 'delivery_reconciliation_required' },
    });
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.4.5');
    expect(f.calls.some((call) => call[0] === 'git' && call[1] === 'checkout')).toBe(false);
    expect(f.calls.some((call) => call.join(' ') === 'git branch -D 42-delivery')).toBe(false);
  });

  test('reconciles a persisted PR closed before version mutation', () => {
    const closed = openPr({ state: 'CLOSED' });
    const f = fixture({ existingPr: closed, views: [closed] }); roots.push(f.root);
    const runPath = path.join(f.root, '.omp/sdlc/run.json');
    const runState = JSON.parse(fs.readFileSync(runPath, 'utf8'));
    const expectedRevision = runState.revision;
    runState.revision += 1;
    runState.delivery = {
      issue: 42,
      pullRequest: 77,
      expectedHead: H1,
      status: 'expected',
      reconciliation: null,
    };
    writeRun(runState, f.root, expectedRevision);

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result).toMatchObject({
      status: 1,
      handoff: { reasonCode: 'delivery_reconciliation_required' },
    });
    expect(fs.readFileSync(path.join(f.root, 'VERSION'), 'utf8').trim()).toBe('3.4.5');
    expect(f.calls.some((call) => call[0] === 'git' && ['commit', 'push'].includes(call[1]))).toBe(false);
  });

  test('binds controlled-draft H1 evidence to H2 before readiness and merge', () => {
    const pending = fixture({ views: [openPr({ isDraft: true, head: H1 })] }); roots.push(pending.root);
    fs.writeFileSync(path.join(pending.root, 'specs/42-delivery/verification-report.md'), controlledVerification('pr_evidence_pending'));
    const request = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: pending.root, run: pending.run, fs, sleep: pending.sleep });
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
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H2 }),
        openPr({ isDraft: true, head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2, state: 'MERGED', issueState: 'CLOSED' }),
      ],
    }); roots.push(satisfied.root);
    fs.writeFileSync(path.join(satisfied.root, 'specs/42-delivery/verification-report.md'), controlledVerification('pr_evidence_satisfied', H1, 'check_run'));
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: satisfied.root, run: satisfied.run, fs, sleep: satisfied.sleep });
    expect(result.status).toBe(0);
    expect(JSON.parse(
      fs.readFileSync(path.join(satisfied.root, '.omp/sdlc/run.json'), 'utf8'),
    ).delivery).toMatchObject({
      pullRequest: 77,
      expectedHead: H2,
      status: 'complete',
    });
    const ready = satisfied.calls.findIndex((call) => call.join(' ') === 'gh pr ready 77');
    const edit = satisfied.calls.findIndex((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'edit');
    const merge = satisfied.calls.findIndex((call) => call[0] === 'gh' && call[1] === 'pr' && call[2] === 'merge');
    expect(edit).toBeGreaterThanOrEqual(0);
    expect(ready).toBeGreaterThan(edit);

    expect(merge).toBeGreaterThan(ready);
    expect(satisfied.calls[merge]).toEqual(['gh', 'pr', 'merge', '77', '--squash', '--match-head-commit', H2]);
    expect(satisfied.calls).toContainEqual([
      'gh', 'pr', 'checks', '77', '--json', 'name,state,bucket,link,event,workflow',
    ]);
  });
  test('completes H2 evidence for workflow-qualified declarations without extra polling', () => {
    const names = [
      'Python CI / verify',
      'nmg-sdlc contribution gate / Validate nmg-sdlc contribution evidence',
    ];
    const f = fixture({
      existingPr: openPr({ isDraft: true, head: H1 }),
      dirtyPaths: ['specs/42-delivery/verification-report.md'],
      checks: [
        {
          name: 'verify',
          workflow: ' Python CI ',
          state: 'SUCCESS',
          link: 'https://github.test/checks/verify',
          event: 'pull_request',
        },
        {
          name: 'Validate nmg-sdlc contribution evidence',
          workflow: 'nmg-sdlc contribution gate',
          state: 'SUCCESS',
          link: 'https://github.test/checks/contribution',
          event: 'pull_request',
        },
      ],
      requiredChecks: [],
      views: [
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H2 }),
        openPr({ isDraft: true, head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2 }),
        openPr({ head: H2, state: 'MERGED', issueState: 'CLOSED' }),
      ],
    }); roots.push(f.root);
    fs.writeFileSync(
      path.join(f.root, 'specs/42-delivery/verification-report.md'),
      controlledVerification('pr_evidence_satisfied', H1, 'check_run', names),
    );

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result.status).toBe(0);
    expect(f.sleeps).toHaveLength(0);
    expect(f.calls.some((call) => call.join(' ') === 'gh pr ready 77')).toBe(true);
    expect(f.calls.some((call) => call[1] === 'pr' && call[2] === 'merge')).toBe(true);
  });

  test('fails closed on a terminal bare-name collision without polling', () => {
    const f = fixture({
      existingPr: openPr({ isDraft: true, head: H1 }),
      dirtyPaths: ['specs/42-delivery/verification-report.md'],
      checks: [
        {
          name: 'verify',
          workflow: 'Python CI',
          state: 'SUCCESS',
          link: 'https://github.test/checks/python',
          event: 'pull_request',
        },
        {
          name: 'verify',
          workflow: 'Node CI',
          state: 'SUCCESS',
          link: 'https://github.test/checks/node',
          event: 'pull_request',
        },
      ],
      requiredChecks: [],
      views: [
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H2 }),
      ],
    }); roots.push(f.root);
    fs.writeFileSync(
      path.join(f.root, 'specs/42-delivery/verification-report.md'),
      controlledVerification('pr_evidence_satisfied', H1, 'check_run', ['verify']),
    );

    const result = runDeliver({
      issue: 42,
      controllerRunId: 'execute-run',
      cwd: f.root,
      run: f.run,
      fs,
      sleep: f.sleep,
    });

    expect(result).toMatchObject({
      status: 1,
      handoff: { reasonCode: 'verification_not_ready' },
    });
    expect(f.sleeps).toHaveLength(0);
    expect(f.calls.some((call) => call.join(' ') === 'gh pr ready 77')).toBe(false);
  });
  test('waits for final-head evidence beyond the former one-hour ceiling', () => {
    const successCheck = {
      name: 'contract-tests',
      state: 'SUCCESS',
      link: 'https://github.test/checks/h2',
      event: 'pull_request',
    };
    const options = {
      existingPr: openPr({ isDraft: true, head: H1 }),
      dirtyPaths: ['specs/42-delivery/verification-report.md'],
      checks: [],
      requiredChecks: [],
      views: [
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H2 }),
      ],
      mergeView: openPr({ head: H2, state: 'MERGED', issueState: 'CLOSED' }),
    };
    const f = fixture(options); roots.push(f.root);
    fs.writeFileSync(
      path.join(f.root, 'specs/42-delivery/verification-report.md'),
      controlledVerification('pr_evidence_satisfied', H1, 'check_run'),
    );
    const sleep = (milliseconds) => {
      f.sleeps.push(milliseconds);
      if (f.sleeps.length === 125) options.checks = [successCheck];
    };
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep });
    expect(result.status).toBe(0);
    expect(f.sleeps.length).toBeGreaterThan(120);
  });

  test('uses the repository default base for controlled draft creation and validation', () => {
    const f = fixture({
      defaultBase: 'trunk',
      views: [openPr({ isDraft: true, head: H1, base: 'trunk' })],
    }); roots.push(f.root);
    fs.writeFileSync(path.join(f.root, 'specs/42-delivery/verification-report.md'), controlledVerification('pr_evidence_pending'));
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
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
      advanceExistingPrOnPush: false,
      views: [
        openPr({ isDraft: true, head: H1 }),
        openPr({ isDraft: true, head: H1 }),
      ],
    }); roots.push(f.root);
    fs.writeFileSync(path.join(f.root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [3.5.0] - 2026-08-25\n\n### Changed\n\n- Ship deterministic delivery (#42)\n\n## [3.4.5] - 2026-01-01\n\n- old\n');
    fs.writeFileSync(path.join(f.root, 'specs/42-delivery/verification-report.md'), controlledVerification('pr_evidence_satisfied', H1));
    const result = runDeliver({ issue: 42, controllerRunId: 'execute-run', cwd: f.root, run: f.run, fs, sleep: f.sleep });
    expect(result.handoff.reasonCode).toBe('verification_not_ready');
    expect(result.handoff.summary).toContain('did not advance H1 to H2');
    expect(f.calls.some((call) => call.join(' ') === 'git push')).toBe(true);
  });
});
