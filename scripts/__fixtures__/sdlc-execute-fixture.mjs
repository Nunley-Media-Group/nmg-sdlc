// Shared fixtures of the sdlc-execute test files: the repository fixture, worker doubles and GitHub result builders.
import { afterEach, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runExecute } from '../sdlc-execute.mjs';
import { STAGE_MODEL_DEFAULTS, STAGE_MODELS_PATH } from '../sdlc-models.mjs';
import { inspectIssueSpecScope } from '../issue-spec-scope.mjs';
import { canonicalJson } from '../../src/sdlc-steering-runtime.mjs';

export const roots = [];
// Host-wide state (the in-flight mirror) stays inside a temporary directory, never the developer's home.
export const env = { NMG_SDLC_HOST_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'execute-host-state-')) };
// The committed project stage configuration every fixture starts with; `stageModels: null` leaves it absent.
export const DEFAULT_STAGE_MODELS_TEXT = `${JSON.stringify(STAGE_MODEL_DEFAULTS, null, 2)}\n`;
export const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
export const result = (value, status = 0) => ({ status, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' });
export const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
// The fixed handoff reminder's wording, which identifies a reminder among the guidance a worker is appended.
export const REMINDER_TEXT = 'your turn ended without a handoff';
export const GH_PR_VIEW_JSON_FIELDS = new Set(`additions assignees author autoMergeRequest baseRefName baseRefOid body
  changedFiles closed closedAt closingIssuesReferences comments commits createdAt deletions files fullDatabaseId
  headRefName headRefOid headRepository headRepositoryOwner id isCrossRepository isDraft labels latestReviews
  maintainerCanModify mergeCommit mergeStateStatus mergeable mergedAt mergedBy milestone number potentialMergeCommit
  projectCards projectItems reactionGroups reviewDecision reviewRequests reviews state statusCheckRollup title
  updatedAt url`.split(/\s+/));

export function ghPrViewUnknownField(args) {
  const index = args.indexOf('--json');
  if (index === -1) return null;
  const unknown = String(args[index + 1] ?? '').split(',').find((field) => !GH_PR_VIEW_JSON_FIELDS.has(field));
  if (unknown === undefined) return null;
  return `Unknown JSON field: "${unknown}"\nAvailable fields:\n${[...GH_PR_VIEW_JSON_FIELDS].map((field) => `  ${field}`).join('\n')}\n`;
}

export function fixture({ branch = '42-example', dirty = false, existingImplementation = true, withPrEvidence = false,
  stageModels = DEFAULT_STAGE_MODELS_TEXT } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-controller-'));
  roots.push(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Controller Test');
  git(root, 'config', 'user.email', 'controller@example.test');
  fs.writeFileSync(path.join(root, 'README.md'), 'baseline\n');
  if (stageModels !== null) {
    fs.mkdirSync(path.join(root, 'steering'), { recursive: true });
    fs.writeFileSync(path.join(root, STAGE_MODELS_PATH), stageModels);
  }
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'chore: baseline');
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-origin-'));
  roots.push(bare);
  execFileSync('git', ['init', '--bare', bare], { encoding: 'utf8' });
  git(root, 'remote', 'add', 'origin', bare);
  git(root, 'push', '-u', 'origin', 'main');
  if (branch !== 'main') git(root, 'checkout', '-b', branch);
  const specPath = 'specs/42-example';
  const specDir = path.join(root, specPath);
  fs.mkdirSync(specDir, { recursive: true });
  for (const file of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    const extra = file === 'tasks.md' ? '\n### T001: Update helper\n\n**File(s)**: `helper.py`\n**Type**: Modify\n'
      : file === 'requirements.md' && withPrEvidence ? '\n### AC1: Require PR-only checks\n' : '';
    fs.writeFileSync(path.join(specDir, file), `**Issue**: #42\n**Status**: Approved\n\n${extra}`);
  }
  const modules = ['product', 'tech', 'structure', 'verification'];
  const managedFiles = modules.map((role) => {
    const file = `steering/modules/${role}.mjs`;
    const content = `export default Object.freeze({ schemaVersion: 1, id: '${role}', role: '${role}' });\n`;
    fs.mkdirSync(path.join(root, 'steering/modules'), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
    return { path: file, template: `workflows/steering/templates/modules/${role}.mjs`, sha256: digest(content) };
  });
  const extensionPath = 'steering/extensions/fixture-smoke.mjs';
  fs.mkdirSync(path.join(root, 'steering/extensions'), { recursive: true });
  fs.writeFileSync(path.join(root, extensionPath), `export const extension = Object.freeze({
  schemaVersion: 1, id: 'project.fixture-smoke',
  providers: { 'project.nmg-sdlc-smoke': async () => { throw new Error('fixture worker owns result'); } },
});\n`);
  const manifest = {
    schemaVersion: 1, runtimeVersion: '1', managedFiles,
    modules: modules.map((role) => ({ id: role, role, path: `steering/modules/${role}.mjs` })),
    snippets: [], extensions: [{ id: 'project.fixture-smoke', path: extensionPath,
      providers: ['project.nmg-sdlc-smoke'] }],
    validations: [
      { id: 'repository.tests', provider: 'builtin.command', required: true,
        when: { kind: 'always' }, config: { program: 'true', args: [], cwd: '.', env: [] } },
      { id: 'repository.nmg-sdlc-smoke', provider: 'project.nmg-sdlc-smoke', required: true,
        when: { kind: 'always' }, config: { issuesEnv: 'NMG_SDLC_SMOKE_ISSUES' } },
    ],
  };
  const manifestPath = path.join(root, 'steering/manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  if (existingImplementation) fs.writeFileSync(path.join(root, 'helper.py'), 'def helper(): return True\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'feat: implement #42');
  git(root, 'push', '-u', 'origin', branch);
  if (dirty) fs.appendFileSync(path.join(root, 'helper.py'), '# preserved partial change\n');
  const runtime = path.join(root, '.nmg-sdlc');
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(path.join(runtime, 'run.json'), '{stale corrupted checkpoint');
  fs.writeFileSync(path.join(runtime, 'safe-recoveries.json'), '{stale corrupted ledger');
  const state = { merged: false, closed: false, starts: [], prompts: [], reminders: [], appends: [], stops: [], log: [],
    waits: [], finished: 0, sourcePushes: 0, versionPreparations: [], commands: [], workdir: root };
  // The checkout the issue is worked in: the fixture root, or the worktree a start worker sets as `state.workdir`.
  const at = () => state.workdir;
  const runtimeAt = () => path.join(at(), '.nmg-sdlc');
  // `sdlc-deliver.mjs prepare-version`: synchronized (no commit) unless a test arranges a bump or a failure.
  let onPrepareVersion = () => null;
  const run = (command, args, options = {}) => {
    state.commands.push(command);
    if (command === 'git') {
      const response = spawnSync('git', args, { cwd: options.cwd ?? root, encoding: 'utf8' });
      return { status: response.status, stdout: response.stdout, stderr: response.stderr };
    }
    if (command === process.execPath && args[1] === 'prepare-version') {
      state.versionPreparations.push({ args, head: git(at(), 'rev-parse', 'HEAD') });
      const outcome = onPrepareVersion({ state, root: at(), publish });
      if (outcome) return outcome;
      const prepared = { issue: 42, version: '1.0.0', headSha: git(at(), 'rev-parse', 'HEAD'), changedPaths: [] };
      return result(`NMG_SDLC_VERSION_PREPARED: ${JSON.stringify(prepared)}\n`);
    }
    if (command !== 'gh') throw new Error(`unexpected binary ${command}`);
    if (args[0] === 'auth') return result('authenticated');
    if (args[0] === 'repo') return args.includes('--jq') ? result('main') : result({ nameWithOwner: 'example/controller' });
    if (args[0] === 'api' && args.some((arg) => arg.endsWith('/dependencies/blocked_by'))) return result([]);
    if (args[0] === 'api') return result({ id: 4242, number: 42, state: state.closed ? 'CLOSED' : 'OPEN', repository: 'example/controller' });
    if (args[0] === 'issue' && args[1] === 'list') return result([{ number: 42, title: 'Example' }]);
    if (args[0] === 'issue' && args[1] === 'view') {
      const fields = args[args.indexOf('--json') + 1];
      if (fields === 'projectItems') return result({ projectItems: [] });
      return result({ number: 42, title: 'Example', body: '', state: state.closed ? 'CLOSED' : 'OPEN',
        labels: state.labels ?? [{ name: 'spec-created' }], projectItems: { nodes: [] } });
    }
    if (args[0] === 'pr' && args[1] === 'list') return result(state.merged
      ? [{ number: 9, state: 'MERGED', headRefName: '42-example', headRefOid: git(at(), 'rev-parse', 'HEAD') }]
      : []);
    if (args[0] === 'pr' && args[1] === 'view') {
      const unknownField = ghPrViewUnknownField(args);
      if (unknownField) return { status: 1, stdout: '', stderr: unknownField };
      // /sdlc-write-spec publishes the spec PR from the issue branch, so `gh pr view` may report it.
      if (state.specPr && !state.merged && !state.draft) return result({ number: 8, state: 'MERGED', isDraft: false,
        headRefName: '42-example', headRefOid: 'b'.repeat(40), closingIssuesReferences: [] });
      if (!state.merged && !state.draft) return { status: 1, stdout: '', stderr: 'no pull requests found for branch "42-example"\n' };
      if (state.draft && !state.merged) return result({ number: 9, state: 'OPEN',
        isDraft: true, headRefName: '42-example', headRefOid: git(at(), 'rev-parse', 'HEAD') });
      return result({ number: 9, state: 'MERGED', headRefName: '42-example',
        headRefOid: git(at(), 'rev-parse', 'HEAD'), mergedAt: '2026-09-25T00:00:00Z',
        mergeCommit: { oid: 'a'.repeat(40) }, closingIssuesReferences: [{ number: 42 }] });
    }
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  const publish = (message) => {
    git(at(), 'add', '.');
    git(at(), 'commit', '-m', message);
    git(at(), 'push', 'origin', 'HEAD:42-example');
    state.sourcePushes += 1;
  };
  const passGate = ({ satisfied = false } = {}) => {
    const root = at();
    const runtime = runtimeAt();
    const specDir = path.join(root, specPath);
    const manifestPath = path.join(root, 'steering/manifest.json');
    const head = git(root, 'rev-parse', 'HEAD');
    const scope = inspectIssueSpecScope({ projectRoot: root, specPath, issueNumber: 42 });
    const marker = { issueNumber: 42, specPath, status: scope.status,
      delivery: scope.delivery, regression: scope.regression };
    const readiness = satisfied ? { schemaVersion: 1, state: 'pr_evidence_satisfied',
      issueNumber: 42, specPath,
      local: { ...scope.delivery, regression: scope.regression, tests: 'pass', steeringGates: 'pass' },
      evidence: [{ kind: 'required_check', name: 'contract-tests', event: 'pull_request',
        acceptanceCriteria: ['AC1'], headSha: head, conclusion: 'SUCCESS',
        url: 'https://github.example/check/1' }] } : null;
    const report = `# Verification Report\n\n### Implementation Status: Pass\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(marker)} -->\n${readiness ? `<!-- nmg-sdlc-pr-readiness: ${JSON.stringify(readiness)} -->\n` : ''}`;
    fs.writeFileSync(path.join(specDir, 'verification-report.md'), report);
    fs.mkdirSync(path.join(runtime, 'verification'), { recursive: true });
    const steeringHash = digest([manifestPath, ...manifest.modules.map(({ path: file }) => path.join(root, file)),
      ...manifest.extensions.map(({ path: file }) => path.join(root, file))]
      .map((file) => `${path.relative(root, file)}\0${fs.readFileSync(file)}`).join('\0'));
    const specHash = digest(['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md']
      .map((file) => `${file}\0${fs.readFileSync(path.join(specDir, file))}`).join('\0'));
    const results = manifest.validations.map((declaration) => {
      const identity = { headSha: head, steeringHash, specHash,
        validationConfigHash: digest(canonicalJson(declaration)) };
      return { id: declaration.id, provider: declaration.provider, required: true,
        applicable: true, effectiveStatus: 'passed',
        request: { schemaVersion: 1, validationId: declaration.id,
          projectRoot: fs.realpathSync(root), config: declaration.config, identity,
          verification: { runId: `verification-${createHash('sha256')
            .update(`${fs.realpathSync(root)}\0${42}\0${specPath}\0${head}`).digest('hex')}`,
          issue: 42, specPath } },
        result: { schemaVersion: 1, status: 'passed', summary: `${declaration.id} passed`,
          identity, evidence: [{ kind: 'test-fixture', artifact: declaration.id }] } };
    });
    fs.writeFileSync(path.join(runtime, 'verification/42.json'), JSON.stringify({ schemaVersion: 1, issue: 42,
      identity: { headSha: head, steeringHash, specHash },
      coverage: { complete: true, declared: results.length, recorded: results.length,
        missing: [], duplicate: [], unknown: [] },
      results, ceiling: null }));
    git(root, 'add', path.join(specPath, 'verification-report.md'));
    if (spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root }).status !== 0) {
      git(root, 'commit', '-m', 'docs: verification #42');
      git(root, 'push', 'origin', 'HEAD:42-example');
    }
  };
  // The review finalizer's record for the current head: a passed review sends the branch to the merge queue.
  const passReview = (status = 'passed') => {
    fs.mkdirSync(path.join(runtimeAt(), 'verification'), { recursive: true });
    fs.writeFileSync(path.join(runtimeAt(), 'verification/42-review.json'), JSON.stringify({ schemaVersion: 1, issue: 42,
      specPath, headSha: git(at(), 'rev-parse', 'HEAD'), mode: 'full', rows: [], findings: [], lenses: [], status }));
  };
  const writeHandoff = (step, outcome) => {
    // A start handoff is written where the start worker ran: the invoking checkout.
    const runtime = step === 'start' ? path.join(root, '.nmg-sdlc') : runtimeAt();
    fs.mkdirSync(path.join(runtime, 'handoffs'), { recursive: true });
    fs.writeFileSync(path.join(runtime, 'handoffs', `42-${step}.json`), JSON.stringify({ schemaVersion: 1,
      issue: 42, step, status: outcome.status, intervention: outcome.intervention ?? false,
      summary: outcome.summary ?? `${step} complete`, artifacts: outcome.artifacts ?? [],
      next: outcome.next ?? null, reasonCode: outcome.reasonCode ?? null,
      ...(outcome.phase ? { phase: outcome.phase } : {}),
      ...(outcome.findings ? { findings: outcome.findings } : {}),
      ...(outcome.escalation ? { escalation: outcome.escalation } : {}),
      ...(step === 'start' ? { branch: '42-example', head: git(at(), 'rev-parse', 'HEAD'),
        ...(at() === root ? {} : { worktree: at() }) } : {}) }));
  };
  // The controller's reminder to a worker that settled without a handoff; by default the worker ignores it.
  let onReminder = () => null;
  let onWorker = ({ step }) => {
    if (step === 'implement') publish('fix: finish #42');
    if (step === 'verify') passGate();
    if (step === 'deliver') { state.merged = true; state.closed = true; }
    return { status: 'passed', next: { start: 'implement', implement: 'verify', verify: 'deliver', deliver: null }[step] };
  };
  // The fake stage-subagent host. spawn runs the worker fixture synchronously, as the hooks module's subagent
  // would. Each worker's record carries its scripted status, activity and turn end (the `context.record` the worker
  // callback receives): a running worker takes timed waits (`slices`), then runs `onFinish` when its turn ends.
  const hooks = { advance: () => {}, onAppend: () => true };
  const agents = new Map();
  let agentCount = 0;
  const endTurn = (record) => {
    record.status = 'idle';
    const finish = record.onFinish;
    record.onFinish = null;
    if (finish) finish();
  };
  const host = {
    spawn(request) {
      const { issue, step, entry, agent, name, model, effort, permissionMode, cwd, prompt } = request;
      agentCount += 1;
      const agentId = `agent-${agentCount}`;
      state.starts.push({ agentId, issue, step, entry, agent, name, model, effort, permissionMode, cwd });
      state.log.push(`spawn:${agentId}`);
      if (hooks.spawnDeny) throw new Error(`worker_start_refused: ${hooks.spawnDeny}`);
      state.prompts.push({ name, prompt });
      if (state.prompts.length > 10) throw new Error('fixture repeated dispatch without progress');
      const record = { schemaVersion: 1, agentId, step, status: 'idle', toolCalls: [], latestText: '',
        lastActivityAt: 0, slices: 0, slicesDone: 0, onSlice: null, onWait: null, onFinish: null };
      agents.set(agentId, record);
      const outcome = onWorker({ step, prompt, state, root, publish, passGate, passReview, record });
      if (outcome?.handoff !== false) writeHandoff(step, outcome);
      return { agentId };
    },
    activity: (agentId) => agents.get(agentId) ?? null,
    append({ agentId, text }) {
      const record = agents.get(agentId);
      state.appends.push({ agentId, prompt: text });
      // The controller's handoff reminder travels through append; the reminder hook answers it as the worker would.
      if (text.includes(REMINDER_TEXT)) {
        state.reminders.push({ agentId, prompt: text });
        const outcome = onReminder({ step: record.step, prompt: text, state, root, publish, passGate });
        if (outcome) writeHandoff(record.step, outcome);
      }
      const accepted = hooks.onAppend({ text, record, state, passGate, writeHandoff, root }) !== false;
      // A settled worker resumes its turn with the guidance; a busy one takes it at its next model request.
      if (accepted && record.status === 'idle') Object.assign(record, { status: 'running', slices: 0, onFinish: null });
      return accepted;
    },
    send({ agentId, text }) {
      const record = agents.get(agentId);
      state.reminders.push({ agentId, prompt: text });
      const outcome = onReminder({ step: record.step, prompt: text, state, root, publish, passGate });
      if (outcome) writeHandoff(record.step, outcome);
      return true;
    },
    stop(agentId) {
      state.stops.push(agentId);
      state.log.push(`stop:${agentId}`);
      if (hooks.stopDeny) throw new Error(`worker_stop_failed: ${hooks.stopDeny}`);
      agents.get(agentId).status = 'killed';
      return true;
    },
    wait({ agentId, until, timeoutMs, since } = {}) {
      const record = agents.get(agentId);
      state.waits.push({ agentId, until, timeoutMs });
      if (state.waits.length > 60) throw new Error('controller kept waiting without progress');
      record.onWait?.({ until, timeoutMs }, record);
      // Only an active subagent has anything to wait for; a settled, failed or killed one returns at once.
      const active = ['pending', 'running', 'waiting'].includes(record.status);
      // A start is an active status or activity after `since`; a settled worker that does not start times out.
      if (until === 'started') {
        if (active || record.lastActivityAt > since) return { timedOut: false, record };
        hooks.advance(timeoutMs);
        return { timedOut: true, record };
      }
      if (!active || (until === 'working' && (record.status === 'pending' || record.status === 'running'))) {
        return { timedOut: false, record };
      }
      if (timeoutMs !== undefined && record.slices > 0) {
        record.slices -= 1;
        record.slicesDone += 1;
        hooks.advance(timeoutMs);
        record.onSlice?.(record.slicesDone, record);
        return { timedOut: true, record };
      }
      if (until !== 'working') endTurn(record);
      return { timedOut: false, record };
    },
    finish() {
      state.finished += 1;
    },
  };
  return { root, state, run, host, hooks, publish, passGate, passReview, writeHandoff, setWorker: (fn) => { onWorker = fn; },
    setPrepareVersion: (fn) => { onPrepareVersion = fn; },
    setReminder: (fn) => { onReminder = fn; },
    execute: (args = '', options = {}) => runExecute({ args, cwd: root, env, run, host, ...options }) };
}

// A worker that follows the verify phases: the review passes with no validation, then the gate runs at the queue head.
export const phasedWorker = (seen = () => {}) => ({ step, prompt, state, passGate, passReview }) => {
  const phase = step !== 'verify' ? null : prompt.includes('Verify phase: gate.') ? 'gate' : 'review';
  seen({ step, phase });
  if (phase === 'review') { passReview(); return { status: 'passed', next: 'verify', phase: 'review' }; }
  if (phase === 'gate') passGate();
  if (step === 'deliver') { state.merged = true; state.closed = true; }
  return { status: 'passed', next: { verify: 'deliver', deliver: null }[step] };
};

export const ABSENT_STAGE_MODELS_WARNING = 'Warning: steering/sdlc-models.json is missing; using plugin default stage models and efforts. Run /sdlc-upgrade-project to create it.';

// Answers the off-branch issue-side delivery reads from per-test maps; everything else uses f.run.
export function issueDeliveryRun(f, { issues = {}, prs = {} } = {}) {
  return (command, args, options) => {
    if (command === 'gh' && args[0] === 'issue' && args[1] === 'view'
      && args[args.indexOf('--json') + 1] === 'number,state,closedByPullRequestsReferences') {
      return Object.hasOwn(issues, args[2]) ? result(issues[args[2]]) : result('', 1);
    }
    if (command === 'gh' && args[0] === 'pr' && args[1] === 'view' && Object.hasOwn(prs, args[2])) {
      return result(prs[args[2]]);
    }
    return f.run(command, args, options);
  };
}
export const closingRef = (number, login = 'example', name = 'controller') => ({ number, repository: { owner: { login }, name } });
export const closedIssue = (number, references) => ({ number, state: 'CLOSED', closedByPullRequestsReferences: references });
export const mergedPr = (number, issue, headRefName) => ({ number, state: 'MERGED', headRefName,
  mergedAt: '2026-09-29T00:00:00Z', mergeCommit: { oid: 'b'.repeat(40) }, closingIssuesReferences: [{ number: issue }] });
// Moves origin's default branch one commit ahead through a second clone; the fixture's local
// default branch stays where it was.
export const advanceOrigin = (root, branch = 'main') => {
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-advance-'));
  roots.push(clone);
  execFileSync('git', ['clone', '--quiet', '--branch', branch, git(root, 'remote', 'get-url', 'origin'), clone],
    { encoding: 'utf8' });
  git(clone, 'config', 'user.name', 'Controller Test');
  git(clone, 'config', 'user.email', 'controller@example.test');
  fs.writeFileSync(path.join(clone, 'merged.txt'), 'merged elsewhere\n');
  git(clone, 'add', '.');
  git(clone, 'commit', '-m', 'feat: merge #9');
  git(clone, 'push', 'origin', `HEAD:${branch}`);
};

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

// The issue read the controller makes for evidence: the same JSON fields collectGithub requests.
export const ISSUE_EVIDENCE_FIELDS = 'number,title,state,body,labels,projectItems';
