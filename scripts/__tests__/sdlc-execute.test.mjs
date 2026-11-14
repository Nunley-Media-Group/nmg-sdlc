import { afterEach, describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runExecute, parseArgs, stageEffort, stageModel, validateHandoff, VALID_STEPS, WORKER_PERMISSION_MODES,
  workerPermissionMode } from '../sdlc-execute.mjs';
import { validateHostRequest } from '../../src/execute-host.mjs';
import { packageRoot } from '../../src/sdlc-workflows.mjs';
import { STAGE_MODEL_DEFAULTS, STAGE_MODELS_PATH } from '../sdlc-models.mjs';
import { inspectIssueSpecScope } from '../issue-spec-scope.mjs';
import { canonicalJson } from '../../src/sdlc-steering-runtime.mjs';

const roots = [];
const env = {};
// The committed project stage configuration every fixture starts with; `stageModels: null` leaves it absent.
const DEFAULT_STAGE_MODELS_TEXT = `${JSON.stringify(STAGE_MODEL_DEFAULTS, null, 2)}\n`;
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const result = (value, status = 0) => ({ status, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' });
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
// The fixed handoff reminder's wording, which identifies a reminder among the guidance a worker is appended.
const REMINDER_TEXT = 'your turn ended without a handoff';
const GH_PR_VIEW_JSON_FIELDS = new Set(`additions assignees author autoMergeRequest baseRefName baseRefOid body
  changedFiles closed closedAt closingIssuesReferences comments commits createdAt deletions files fullDatabaseId
  headRefName headRefOid headRepository headRepositoryOwner id isCrossRepository isDraft labels latestReviews
  maintainerCanModify mergeCommit mergeStateStatus mergeable mergedAt mergedBy milestone number potentialMergeCommit
  projectCards projectItems reactionGroups reviewDecision reviewRequests reviews state statusCheckRollup title
  updatedAt url`.split(/\s+/));

function ghPrViewUnknownField(args) {
  const index = args.indexOf('--json');
  if (index === -1) return null;
  const unknown = String(args[index + 1] ?? '').split(',').find((field) => !GH_PR_VIEW_JSON_FIELDS.has(field));
  if (unknown === undefined) return null;
  return `Unknown JSON field: "${unknown}"\nAvailable fields:\n${[...GH_PR_VIEW_JSON_FIELDS].map((field) => `  ${field}`).join('\n')}\n`;
}

function fixture({ branch = '42-example', dirty = false, existingImplementation = true, withPrEvidence = false,
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
    waits: [], finished: 0, sourcePushes: 0, versionPreparations: [], commands: [] };
  // `sdlc-deliver.mjs prepare-version`: synchronized (no commit) unless a test arranges a bump or a failure.
  let onPrepareVersion = () => null;
  const run = (command, args, options = {}) => {
    state.commands.push(command);
    if (command === 'git') {
      const response = spawnSync('git', args, { cwd: options.cwd ?? root, encoding: 'utf8' });
      return { status: response.status, stdout: response.stdout, stderr: response.stderr };
    }
    if (command === process.execPath && args[1] === 'prepare-version') {
      state.versionPreparations.push({ args, head: git(root, 'rev-parse', 'HEAD') });
      const outcome = onPrepareVersion({ state, root, publish });
      if (outcome) return outcome;
      const prepared = { issue: 42, version: '1.0.0', headSha: git(root, 'rev-parse', 'HEAD'), changedPaths: [] };
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
      ? [{ number: 9, state: 'MERGED', headRefName: '42-example', headRefOid: git(root, 'rev-parse', 'HEAD') }]
      : []);
    if (args[0] === 'pr' && args[1] === 'view') {
      const unknownField = ghPrViewUnknownField(args);
      if (unknownField) return { status: 1, stdout: '', stderr: unknownField };
      // /sdlc-write-spec publishes the spec PR from the issue branch, so `gh pr view` may report it.
      if (state.specPr && !state.merged && !state.draft) return result({ number: 8, state: 'MERGED', isDraft: false,
        headRefName: '42-example', headRefOid: 'b'.repeat(40), closingIssuesReferences: [] });
      if (!state.merged && !state.draft) return { status: 1, stdout: '', stderr: 'no pull requests found for branch "42-example"\n' };
      if (state.draft && !state.merged) return result({ number: 9, state: 'OPEN',
        isDraft: true, headRefName: '42-example', headRefOid: git(root, 'rev-parse', 'HEAD') });
      return result({ number: 9, state: 'MERGED', headRefName: '42-example',
        headRefOid: git(root, 'rev-parse', 'HEAD'), mergedAt: '2026-09-25T00:00:00Z',
        mergeCommit: { oid: 'a'.repeat(40) }, closingIssuesReferences: [{ number: 42 }] });
    }
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
  const publish = (message) => {
    git(root, 'add', '.');
    git(root, 'commit', '-m', message);
    git(root, 'push', 'origin', 'HEAD:42-example');
    state.sourcePushes += 1;
  };
  const passGate = ({ satisfied = false } = {}) => {
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
  const writeHandoff = (step, outcome) => {
    fs.mkdirSync(path.join(runtime, 'handoffs'), { recursive: true });
    fs.writeFileSync(path.join(runtime, 'handoffs', `42-${step}.json`), JSON.stringify({ schemaVersion: 1,
      issue: 42, step, status: outcome.status, intervention: outcome.intervention ?? false,
      summary: outcome.summary ?? `${step} complete`, artifacts: outcome.artifacts ?? [],
      next: outcome.next ?? null, reasonCode: outcome.reasonCode ?? null,
      ...(step === 'start' ? { branch: '42-example', head: git(root, 'rev-parse', 'HEAD') } : {}) }));
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
      const outcome = onWorker({ step, prompt, state, root, publish, passGate, record });
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
  return { root, state, run, host, hooks, publish, passGate, writeHandoff, setWorker: (fn) => { onWorker = fn; },
    setPrepareVersion: (fn) => { onPrepareVersion = fn; },
    setReminder: (fn) => { onReminder = fn; },
    execute: (args = '', options = {}) => runExecute({ args, cwd: root, env, run, host, ...options }) };
}

const ABSENT_STAGE_MODELS_WARNING = 'Warning: steering/sdlc-models.json is missing; using plugin default stage models and efforts. Run /sdlc-upgrade-project to create it.';

describe('per-project stage models (steering/sdlc-models.json)', () => {
  const stageFile = (stages) => `${JSON.stringify({ ...STAGE_MODEL_DEFAULTS, ...stages }, null, 2)}\n`;
  const startOf = (state, step) => state.starts.find((start) => start.name.split('-')[1] === step);

  it('resolves stage, repair, and verbatim provider models from the configuration', () => {
    const config = { ...STAGE_MODEL_DEFAULTS, verify: { model: 'sonnet', effort: 'max' },
      repair: { model: 'opus', effort: 'high' }, implement: { model: 'opencode-go/kimi-k3.1-pro', effort: 'xhigh' } };
    expect(stageModel('verify', null, config)).toBe('sonnet');
    expect(stageEffort('verify', null, config)).toBe('max');
    expect(stageModel('verify', { reasonCode: 'verification_not_green' }, config)).toBe('opus');
    expect(stageEffort('verify', { reasonCode: 'verification_not_green' }, config)).toBe('high');
    expect(stageEffort('start', null, config)).toBeUndefined();
    expect(stageModel('implement', null, config)).toBe('opencode-go/kimi-k3.1-pro');
    expect(() => stageModel('rem', null, config)).toThrow('unknown stage: rem');
  });

  it('dispatches the verify worker with the project model and effort', () => {
    const f = fixture({ stageModels: stageFile({ verify: { model: 'sonnet', effort: 'max' } }) });
    const response = f.execute('');
    expect(response).toMatchObject({ status: 0, stderr: '' });
    expect(response.stdout).not.toContain('Warning: steering/sdlc-models.json');
    expect(startOf(f.state, 'verify')).toMatchObject({ model: 'sonnet', effort: 'max' });
    expect(startOf(f.state, 'deliver')).toMatchObject({ model: 'haiku', effort: 'xhigh' });
  });

  it('prints the missing-file warning exactly once and dispatches plugin defaults', () => {
    const f = fixture({ stageModels: null });
    const response = f.execute('');
    expect(response.status).toBe(0);
    expect(response.stdout.startsWith(`${ABSENT_STAGE_MODELS_WARNING}\n`)).toBe(true);
    expect(response.stdout.split(ABSENT_STAGE_MODELS_WARNING).length - 1).toBe(1);
    expect(startOf(f.state, 'verify')).toMatchObject({ model: 'opus', effort: 'high' });
  });

  it('stops with exit 2 before any spawn, Git, or GitHub call on an invalid project file', () => {
    const f = fixture({ stageModels: stageFile({ verify: { model: 'opus', effort: 'extreme' } }) });
    const calls = [];
    const response = f.execute('', {
      run: (command, args, options) => { calls.push(command); return f.run(command, args, options); },
      host: { spawn: () => { throw new Error('spawn_called'); } },
    });
    expect(response).toEqual({ status: 2, stdout: '', stderr:
      'steering/sdlc-models.json: verify.effort = "extreme": must be one of low, medium, high, xhigh, max, default\n' });
    expect(calls).toEqual([]);
    expect(f.state.starts).toEqual([]);
  });
});

// Answers the off-branch issue-side delivery reads from per-test maps; everything else uses f.run.
function issueDeliveryRun(f, { issues = {}, prs = {} } = {}) {
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
const closingRef = (number, login = 'example', name = 'controller') => ({ number, repository: { owner: { login }, name } });
const closedIssue = (number, references) => ({ number, state: 'CLOSED', closedByPullRequestsReferences: references });
const mergedPr = (number, issue, headRefName) => ({ number, state: 'MERGED', headRefName,
  mergedAt: '2026-09-29T00:00:00Z', mergeCommit: { oid: 'b'.repeat(40) }, closingIssuesReferences: [{ number: issue }] });
// Moves origin's default branch one commit ahead through a second clone; the fixture's local
// default branch stays where it was.
const advanceOrigin = (root, branch = 'main') => {
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

describe('stage subagent dispatch (#538)', () => {
  const stageFile = (stages) => `${JSON.stringify({ ...STAGE_MODEL_DEFAULTS, ...stages }, null, 2)}\n`;

  it('selects the worker permission mode from NMG_SDLC_WORKER_PERMISSION_MODE', () => {
    expect(WORKER_PERMISSION_MODES).toEqual(['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions']);
    for (const mode of WORKER_PERMISSION_MODES) {
      expect(workerPermissionMode({ NMG_SDLC_WORKER_PERMISSION_MODE: mode })).toBe(mode);
    }
  });

  it('falls back to auto when the permission mode override is missing or invalid', () => {
    expect(workerPermissionMode({})).toBe('auto');
    expect(workerPermissionMode(undefined)).toBe('auto');
    for (const value of ['', 'plan', 'manual', 'AUTO', 'bypass', ' auto', 'auto ', 'acceptedits']) {
      expect(workerPermissionMode({ NMG_SDLC_WORKER_PERMISSION_MODE: value })).toBe('auto');
    }
  });

  it('spawns every stage with the permission mode from NMG_SDLC_WORKER_PERMISSION_MODE, falling back to auto', () => {
    for (const [workerEnv, mode] of [[{ NMG_SDLC_WORKER_PERMISSION_MODE: 'dontAsk' }, 'dontAsk'],
      [{ NMG_SDLC_WORKER_PERMISSION_MODE: 'yolo' }, 'auto'], [{}, 'auto']]) {
      const f = fixture();
      expect(f.execute('#42', { env: workerEnv })).toMatchObject({ status: 0 });
      expect(f.state.starts.map((start) => start.permissionMode)).toEqual([mode, mode]);
    }
  });

  it('starts each fresh stage on its model and a repair re-dispatch on opus', () => {
    expect(VALID_STEPS.map((step) => stageModel(step, null))).toEqual(['haiku', 'haiku', 'opus', 'haiku']);
    for (const step of ['implement', 'verify', 'deliver']) {
      expect(stageModel(step, { reasonCode: 'verification_not_green' })).toBe('opus');
      expect(stageModel(step, { reasonCode: 'pr_evidence_pending' })).toBe(stageModel(step, null));
      expect(stageModel(step, { reasonCode: 'mergeability_reverification_required' })).toBe(stageModel(step, null));
    }
    expect(stageModel('start', { reasonCode: 'verification_not_green' })).toBe('haiku');
    expect(() => stageModel('rem', null)).toThrow('unknown stage: rem');
  });

  it('starts verify at high, implement and deliver at xhigh, and every repair re-dispatch at the default effort', () => {
    expect(VALID_STEPS.map((step) => stageEffort(step, null))).toEqual([undefined, 'xhigh', 'high', 'xhigh']);
    for (const step of ['implement', 'verify', 'deliver']) {
      expect(stageEffort(step, { reasonCode: 'verification_not_green' })).toBeUndefined();
      expect(stageEffort(step, { reasonCode: 'pr_evidence_pending' })).toBe(stageEffort(step, null));
    }
    expect(stageEffort('start', { reasonCode: 'verification_not_green' })).toBeUndefined();
    expect(() => stageEffort('rem', null)).toThrow('unknown stage: rem');
  });

  it('carries each entry model and effort on its spawn request, with a default effort as null', () => {
    const f = fixture({ dirty: true, stageModels: stageFile({
      implement: { model: 'opencode-go/kimi-k3.1-pro', effort: 'xhigh' },
      verify: { model: 'opus[1m]', effort: 'max' },
      deliver: { model: 'claude-opus-5-5', effort: 'default' },
    }) });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map(({ step, entry, agent, model, effort, permissionMode }) => (
      { step, entry, agent, model, effort, permissionMode }))).toEqual([
      { step: 'implement', entry: 'implement', agent: 'spec-implementer', model: 'opencode-go/kimi-k3.1-pro', effort: 'xhigh', permissionMode: 'auto' },
      { step: 'verify', entry: 'verify', agent: 'architecture-reviewer', model: 'opus[1m]', effort: 'max', permissionMode: 'auto' },
      { step: 'deliver', entry: 'deliver', agent: 'deliverer', model: 'claude-opus-5-5', effort: null, permissionMode: 'auto' },
    ]);
  });

  it('builds spawn requests the hooks module accepts for the configured models, including opus[1m] and claude-opus-5-5', () => {
    const f = fixture({ dirty: true, stageModels: stageFile({
      implement: { model: 'opencode-go/kimi-k3.1-pro', effort: 'xhigh' },
      verify: { model: 'opus[1m]', effort: 'max' },
      deliver: { model: 'claude-opus-5-5', effort: 'default' },
    }) });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    const session = '0f8fbc1e-5b8e-4a3c-9d2a-6e1f0c3b7a11';
    const requests = f.state.starts.map((start, index) => ({ schemaVersion: 1, session, n: index + 1, kind: 'spawn',
      issue: start.issue, entry: start.entry, agent: start.agent, name: start.name, model: start.model,
      effort: start.effort, permissionMode: start.permissionMode, promptFile: `request-${index + 1}.prompt.md`,
      cwd: start.cwd }));
    expect(requests.map((request) => validateHostRequest(request))).toEqual(requests.map(() => ({ ok: true })));
    expect(validateHostRequest({ ...requests[0], model: 'not a model!' })).toMatchObject({ ok: false });
  });

  it('redispatches a repairable failure on the repair entry, and its stage entry once the failure is cleared', () => {
    const f = fixture();
    let verifications = 0;
    f.setWorker(({ step, publish, passGate, state }) => {
      if (step === 'verify' && verifications++ === 0) {
        return { status: 'failed', next: 'implement', reasonCode: 'same_check', summary: 'same failing check', artifacts: [] };
      }
      if (step === 'implement') { publish('fix: repair #42'); return { status: 'passed', next: 'verify' }; }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((start) => [start.step, start.entry])).toEqual([
      ['verify', 'verify'], ['implement', 'repair'], ['verify', 'verify'], ['deliver', 'deliver'],
    ]);
    expect(f.state.starts[1]).toMatchObject({ model: 'opus', effort: null });
  });

  it('runs no herdr command: every stage goes through the host, with no integration probe', () => {
    const f = fixture();
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.commands).not.toContain('herdr');
    expect(f.state.starts).toHaveLength(2);
  });

  it('exits 2 without a host, before any Git, GitHub or spawn call', () => {
    const calls = [];
    expect(runExecute({ args: '#42', env: {}, run: (command) => { calls.push(command); return { status: 0, stdout: '' }; } }))
      .toEqual({ status: 2, stdout: '', stderr: 'execute requires /sdlc-execute in a Claude Code session\n' });
    expect(calls).toEqual([]);
  });

  it('checks gh auth and nothing else before a spawn when there is no probe to run first', () => {
    const calls = [];
    const response = runExecute({ args: '#42', cwd: '/nonexistent-nmg-sdlc-root', env: {},
      host: { spawn: () => { throw new Error('spawn_called'); } },
      run: (command, args) => { calls.push([command, ...args.slice(0, 2)]); return { status: 1, stdout: '', stderr: 'no auth' }; } });
    expect(response).toEqual({ status: 1, stdout: `${ABSENT_STAGE_MODELS_WARNING}\n`, stderr: 'gh auth status failed\n' });
    expect(calls).toEqual([['gh', 'auth', 'status']]);
  });

  it('stops a denied spawn with worker_start_refused and the reason, dispatching no deliver and no prompt', () => {
    const f = fixture({ dirty: true });
    f.hooks.spawnDeny = 'nmg-sdlc: stage subagents are not allowed in this session';
    expect(f.execute('#42')).toEqual({ status: 1, stdout: '',
      stderr: `worker_start_refused: ${f.hooks.spawnDeny}\n` });
    expect(f.state.starts.map((start) => start.step)).toEqual(['implement']);
    expect(f.state.prompts).toEqual([]);
  });
});
describe('branch-first execute', () => {
  it('accepts only the four active stages and no stale recovery flag', () => {
    expect(VALID_STEPS).toEqual(['start', 'implement', 'verify', 'deliver']);
    expect(parseArgs('')).toEqual({ issues: [], defaultBacklog: true });
    expect(() => parseArgs('#42 --retain-worker')).toThrow('--retain-worker is removed');
    expect(() => parseArgs('--recover-stale')).toThrow();
    expect(() => validateHandoff({ schemaVersion: 1, issue: 42, step: 'review1', status: 'passed',
      intervention: false, summary: '', artifacts: [], next: null, reasonCode: null })).toThrow();
  });

  it('starts verification immediately from a clean implemented feature branch despite stale checkpoint', () => {
    const f = fixture();
    const response = f.execute('');
    expect(response).toEqual({ status: 0, stdout: '#42: verify passed\n#42: deliver passed\n#42: MERGED and CLOSED\n#42: branch cleanup: deleted 42-example and fast-forwarded main\n', stderr: '' });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['verify', 'deliver']);
    expect(f.state.merged && f.state.closed).toBe(true);
    expect(fs.readFileSync(path.join(f.root, '.nmg-sdlc/run.json'), 'utf8')).toContain('stale corrupted');
  });

  it('prepares the version before verification and verifies the version commit before delivery', () => {
    const f = fixture();
    let bumped = false;
    f.setPrepareVersion(({ root, publish }) => {
      if (bumped) return null;
      bumped = true;
      fs.writeFileSync(path.join(root, 'VERSION'), '1.1.0\n');
      publish('feat: deliver issue #42');
      return null;
    });
    const heads = [];
    f.setWorker(({ step, state, passGate }) => {
      heads.push({ step, head: git(f.root, 'rev-parse', 'HEAD') });
      if (step === 'verify') passGate();
      if (step === 'deliver') { state.merged = true; state.closed = true; }
      return { status: 'passed', next: { verify: 'deliver', deliver: null }[step] };
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['verify', 'deliver']);
    // The verifier saw the version commit; the first preparation ran before any worker started.
    expect(git(f.root, 'log', '-1', '--format=%s', heads[0].head)).toBe('feat: deliver issue #42');
    expect(f.state.versionPreparations[0].args).toEqual([
      path.join(packageRoot, 'scripts', 'sdlc-deliver.mjs'), 'prepare-version', '--issue', '42',
      '--controller-run-id', expect.any(String),
    ]);
    // Every later preparation found the version synchronized and made no second commit.
    expect(f.state.versionPreparations.length).toBeGreaterThan(1);
    expect(git(f.root, 'log', '--format=%s', '--grep=deliver issue #42').split('\n')).toHaveLength(1);
  });

  it('prepares the version although the merged spec PR shares the issue branch name', () => {
    const f = fixture();
    f.state.specPr = true;
    const heads = [];
    f.setPrepareVersion(({ root, publish, state }) => {
      if (state.versionPreparations.length > 1) return null;
      fs.writeFileSync(path.join(root, 'VERSION'), '1.1.0\n');
      publish('feat: deliver issue #42');
      return null;
    });
    f.setWorker(({ step, state, passGate }) => {
      heads.push(git(f.root, 'rev-parse', 'HEAD'));
      if (step === 'verify') passGate();
      if (step === 'deliver') { state.merged = true; state.closed = true; }
      return { status: 'passed', next: { verify: 'deliver', deliver: null }[step] };
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['verify', 'deliver']);
    expect(git(f.root, 'log', '-1', '--format=%s', heads[0])).toBe('feat: deliver issue #42');
  });

  it('stops with the preparation reason and starts no worker when the version cannot be prepared', () => {
    const f = fixture();
    f.setPrepareVersion(({ root }) => {
      fs.mkdirSync(path.join(root, '.nmg-sdlc/handoffs'), { recursive: true });
      fs.writeFileSync(path.join(root, '.nmg-sdlc/handoffs/42-deliver.json'), JSON.stringify({ reasonCode: 'major_bump_required' }));
      return { status: 1, stdout: 'NMG_SDLC_HANDOFF: .nmg-sdlc/handoffs/42-deliver.json\n', stderr: '' };
    });
    expect(f.execute('#42')).toMatchObject({
      status: 1, stderr: expect.stringContaining('version_preparation_failed: major_bump_required'),
    });
    expect(f.state.starts).toEqual([]);
  });

  it('prints the version_artifact_missing reason with the deliver handoff summary and starts no worker', () => {
    const f = fixture();
    f.setPrepareVersion(({ root }) => {
      fs.mkdirSync(path.join(root, '.nmg-sdlc/handoffs'), { recursive: true });
      fs.writeFileSync(path.join(root, '.nmg-sdlc/handoffs/42-deliver.json'), JSON.stringify({
        reasonCode: 'version_artifact_missing',
        summary: 'CHANGELOG.md is missing; create it with a ## [Unreleased] section',
      }));
      return { status: 1, stdout: 'NMG_SDLC_HANDOFF: .nmg-sdlc/handoffs/42-deliver.json\n', stderr: '' };
    });
    expect(f.execute('#42')).toMatchObject({
      status: 1,
      stderr: expect.stringContaining('version_preparation_failed: version_artifact_missing — CHANGELOG.md is missing'),
    });
    expect(f.state.starts).toEqual([]);
  });

  it('keeps the bare reason when the preparation handoff carries no summary', () => {
    const f = fixture();
    f.setPrepareVersion(({ root }) => {
      fs.mkdirSync(path.join(root, '.nmg-sdlc/handoffs'), { recursive: true });
      fs.writeFileSync(path.join(root, '.nmg-sdlc/handoffs/42-deliver.json'), JSON.stringify({ reasonCode: 'major_bump_required' }));
      return { status: 1, stdout: 'NMG_SDLC_HANDOFF: .nmg-sdlc/handoffs/42-deliver.json\n', stderr: '' };
    });
    const result = f.execute('#42');
    expect(result.stderr).toContain('version_preparation_failed: major_bump_required');
    expect(result.stderr).not.toContain('—');
  });

  it('prepares no version while the branch has uncommitted work', () => {
    const f = fixture({ dirty: true });
    f.setWorker(({ step, state, publish, passGate }) => {
      if (step === 'implement') {
        expect(state.versionPreparations).toEqual([]);
        publish('fix: finish #42');
      }
      if (step === 'verify') passGate();
      if (step === 'deliver') { state.merged = true; state.closed = true; }
      return { status: 'passed', next: { implement: 'verify', verify: 'deliver', deliver: null }[step] };
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.versionPreparations.length).toBeGreaterThan(0);
  });

  it('reverifies a locally edited green report rather than delivering uncommitted evidence', () => {
    const f = fixture();
    f.passGate();
    fs.appendFileSync(path.join(f.root, 'specs/42-example/verification-report.md'), '\nunpublished report edit\n');
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['verify', 'deliver']);
  });

  it('routes PR Evidence Pending through draft evidence and back to verification, never early merge', () => {
    const f = fixture({ withPrEvidence: true });
    f.passGate();
    const specPath = 'specs/42-example';
    const scope = inspectIssueSpecScope({ projectRoot: f.root, specPath, issueNumber: 42 });
    const marker = { issueNumber: 42, specPath, status: scope.status,
      delivery: scope.delivery, regression: scope.regression };
    const readiness = { schemaVersion: 1, state: 'pr_evidence_pending', issueNumber: 42,
      specPath, local: { ...scope.delivery, regression: scope.regression,
        tests: 'pass', steeringGates: 'pass' },
      pendingEvidence: [{ kind: 'required_check', name: 'contract-tests',
        event: 'pull_request', acceptanceCriteria: ['AC1'] }] };
    fs.writeFileSync(path.join(f.root, specPath, 'verification-report.md'),
      `# Verification Report\n\n### Implementation Status: PR Evidence Pending\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(marker)} -->\n<!-- nmg-sdlc-pr-readiness: ${JSON.stringify(readiness)} -->\n`);
    let verifications = 0;
    f.setWorker(({ step, prompt, passGate, state }) => {
      if (step === 'verify' && verifications++ === 0) {
        expect(state.merged).toBe(false);
        return { status: 'failed', next: 'verify', reasonCode: 'pr_evidence_pending',
          summary: 'draft checks needed', artifacts: [`${specPath}/verification-report.md`] };
      }
      if (step === 'verify' && verifications === 2) {
        expect(prompt).toContain('prepare-pr-evidence --issue 42');
        expect(state.merged).toBe(false);
        state.draft = true;
        return { status: 'failed', next: 'verify', reasonCode: 'pr_evidence_pending',
          summary: 'waiting for required checks', artifacts: [`${specPath}/verification-report.md`] };
      }
      if (step === 'verify') {
        expect(prompt).toContain('do not invoke prepare-pr-evidence again');
        expect(prompt).not.toContain('prepare-pr-evidence --issue 42');
        state.checksGreen = true;
        passGate({ satisfied: true });
        return { status: 'passed', next: 'deliver' };
      }
      if (step === 'deliver') {
        expect(state.draft).toBe(true);
        state.merged = true;
        state.closed = true;
        return { status: 'passed', next: null };
      }
      throw new Error(step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual([
      'verify', 'verify', 'verify', 'deliver',
    ]);
    // The exempt pr_evidence_pending failure keeps every re-dispatch on its stage entry, never repair.
    expect(f.state.starts.map((entry) => entry.entry)).toEqual(['verify', 'verify', 'verify', 'deliver']);
  });

  it('recognizes an exact-head merged PR and closed issue without a label or new worker', () => {
    const f = fixture();
    f.state.merged = true;
    f.state.closed = true;
    f.state.labels = [];
    expect(f.execute('')).toEqual({ status: 0, stdout: '#42: MERGED and CLOSED\n#42: branch cleanup: deleted 42-example and fast-forwarded main\n', stderr: '' });
    expect(f.state.starts).toEqual([]);
  });

  it('starts an explicit issue from a non-issue branch, then uses its new live branch', () => {
    const f = fixture({ branch: 'main' });
    f.setWorker(({ step, root, publish, passGate, state }) => {
      if (step === 'start') {
        git(root, 'checkout', '-b', '42-example');
        git(root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (step === 'implement') { publish('fix: implement #42 on its new branch'); return { status: 'passed', next: 'verify' }; }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }

      throw new Error(step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    // The new branch has no commits relative to main, so it is implemented before anything is verified.
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['start', 'implement', 'verify', 'deliver']);
    expect(f.state.starts.map((entry) => entry.model)).toEqual(['haiku', 'haiku', 'opus', 'haiku']);
    expect(f.state.starts.map((entry) => entry.effort)).toEqual([null, 'xhigh', 'high', 'xhigh']);
  });
  it('continues an explicit queue on the default branch after the previous issue is delivered', () => {
    const f = fixture({ branch: 'main' });
    f.setWorker(({ step, root, publish, passGate, state }) => {
      if (step === 'start') {
        git(root, 'checkout', '-b', '42-example');
        git(root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (step === 'implement') { publish('fix: implement #42 on its new branch'); return { status: 'passed', next: 'verify' }; }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    const response = f.execute('#42 #43');
    // #43 reaches its own eligibility checks (the fixture's GitHub fake only knows #42).
    expect(response.status).toBe(1);
    expect(response.stderr).not.toContain('active_issue_conflict');
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['start', 'implement', 'verify', 'deliver']);
  });
  it('recognizes delivered issues off-branch without a worker and continues the queue', () => {
    const f = fixture({ branch: 'main' });
    const run = issueDeliveryRun(f, {
      issues: { 42: closedIssue(42, [closingRef(9), closingRef(77, 'someone', 'fork')]), 43: closedIssue(43, [closingRef(10)]) },
      prs: { 9: mergedPr(9, 42, '42-example'), 10: mergedPr(10, 43, '43-next') },
    });
    expect(f.execute('#42 #43', { run })).toEqual({ status: 0,
      stdout: '#42: MERGED and CLOSED\n#43: MERGED and CLOSED\n', stderr: '' });
    expect(f.state.starts).toEqual([]);
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
  });
  it.each([
    ['no closing pull request', { issues: { 42: closedIssue(42, []) } }],
    ['only an open closing pull request', { issues: { 42: closedIssue(42, [closingRef(9)]) },
      prs: { 9: { ...mergedPr(9, 42, '42-example'), state: 'OPEN' } } }],
  ])('stops a closed off-branch issue with %s as undelivered', (_label, maps) => {
    const f = fixture({ branch: 'main' });
    expect(f.execute('#42', { run: issueDeliveryRun(f, maps) }))
      .toEqual({ status: 1, stdout: '', stderr: 'issue_closed_undelivered: #42\n' });
    expect(f.state.starts).toEqual([]);
  });
  it.each([
    ['two merged closing pull requests', 'merged_pr_ambiguous', { issues: { 42: closedIssue(42, [closingRef(9), closingRef(10)]) },
      prs: { 9: mergedPr(9, 42, '42-example'), 10: mergedPr(10, 42, '42-retry') } }],
    ['a failed issue read', 'delivery_evidence_unavailable', {}],
    ['an issue read missing closing references', 'delivery_evidence_unavailable',
      { issues: { 42: { number: 42, state: 'CLOSED' } } }],
    ['a failed pull-request read', 'delivery_evidence_unavailable', { issues: { 42: closedIssue(42, [closingRef(9)]) } }],
    ['a merged pull request missing mergedAt', 'delivery_evidence_unavailable', { issues: { 42: closedIssue(42, [closingRef(9)]) },
      prs: { 9: { ...mergedPr(9, 42, '42-example'), mergedAt: undefined } } }],
  ])('stops a closed off-branch issue with %s', (_label, reasonCode, maps) => {
    const f = fixture({ branch: 'main' });
    expect(f.execute('#42', { run: issueDeliveryRun(f, maps) }))
      .toEqual({ status: 1, stdout: '', stderr: `${reasonCode}: #42\n` });
    expect(f.state.starts).toEqual([]);
  });
  it('keeps spec-created label admission for an open off-branch issue', () => {
    const f = fixture({ branch: 'main' });
    f.state.labels = [];
    const run = issueDeliveryRun(f, { issues: { 42: { number: 42, state: 'OPEN', closedByPullRequestsReferences: [] } } });
    expect(f.execute('#42', { run })).toEqual({ status: 1, stdout: '', stderr: '#42 has no spec-created label\n' });
    expect(f.state.starts).toEqual([]);
  });

  it('keeps a dirty delivered issue branch instead of moving to the next queued issue', () => {
    const f = fixture({ branch: 'main' });
    f.setWorker(({ step, root, publish, passGate, state }) => {
      if (step === 'start') {
        git(root, 'checkout', '-b', '42-example');
        git(root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (step === 'implement') { publish('fix: implement #42 on its new branch'); return { status: 'passed', next: 'verify' }; }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') {
        state.merged = true;
        state.closed = true;
        fs.writeFileSync(path.join(root, 'notes.txt'), 'uncommitted\n');
        return { status: 'passed', next: null };
      }
      throw new Error(step);
    });
    expect(f.execute('#42 #43')).toMatchObject({ status: 1, stderr: expect.stringContaining('active_issue_conflict') });
    expect(git(f.root, 'branch', '--show-current')).toBe('42-example');
    expect(fs.readFileSync(path.join(f.root, 'notes.txt'), 'utf8')).toBe('uncommitted\n');
  });
  it('leaves a delivered issue branch before a different explicit first issue', () => {
    const f = fixture();
    f.state.merged = true;
    f.state.closed = true;
    const response = f.execute('#43');
    // #43 reaches its own eligibility checks (the fixture's GitHub fake only knows #42).
    expect(response.status).toBe(1);
    expect(response.stderr).not.toContain('active_issue_conflict');
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
    expect(f.state.starts).toEqual([]);
  });
  it('resumes a queue from the first queued issue branch and then continues past it', () => {
    const f = fixture();
    f.setWorker(({ step, passGate, state }) => {
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    const response = f.execute('#42 #43');
    expect(response.status).toBe(1);
    expect(response.stderr).not.toContain('active_issue_conflict');
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['verify', 'deliver']);
  });
  it('does not deliver when the registered required smoke result is red despite a passed verifier handoff', () => {
    const f = fixture();
    let verifications = 0;
    f.setWorker(({ step, root, publish, passGate, state }) => {
      if (step === 'verify') {
        passGate();
        if (verifications++ === 0) {
          const artifactPath = path.join(root, '.nmg-sdlc/verification/42.json');
          const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
          artifact.results[1].effectiveStatus = 'failed';
          artifact.results[1].result.status = 'failed';
          artifact.ceiling = 'Fail';
          fs.writeFileSync(artifactPath, JSON.stringify(artifact));
        }
        return { status: 'passed', next: 'deliver' };
      }
      if (step === 'implement') {
        expect(state.merged).toBe(false);
        // Commit only the source change so runtime state stays untracked, as it is in real projects.
        fs.writeFileSync(path.join(root, 'required.txt'), 'smoke fix\n');
        git(root, 'add', 'required.txt');
        git(root, 'commit', '-m', 'fix: required smoke #42');
        git(root, 'push', 'origin', 'HEAD:42-example');
        return { status: 'passed', next: 'verify' };
      }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('#42')).toEqual({ status: 0,
      stdout: '#42: implement passed\n#42: verify passed\n#42: deliver passed\n#42: MERGED and CLOSED\n#42: branch cleanup: deleted 42-example and fast-forwarded main\n', stderr: '' });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual([
      'verify', 'implement', 'verify', 'deliver',
    ]);
  });

  it('diagnoses a previously failed exact-source gate instead of rerunning unchanged smoke', () => {
    const f = fixture();
    f.passGate();
    const artifactPath = path.join(f.root, '.nmg-sdlc/verification/42.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    artifact.results[1].effectiveStatus = 'failed';
    artifact.results[1].result.status = 'failed';
    artifact.ceiling = 'Fail';
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    const oldHandoff = path.join(f.root, '.nmg-sdlc/handoffs/42-verify.json');
    fs.mkdirSync(path.dirname(oldHandoff), { recursive: true });
    fs.writeFileSync(oldHandoff, JSON.stringify({ schemaVersion: 1, issue: 42, step: 'verify',
      status: 'failed', intervention: false, summary: 'old checkpoint narrative',
      artifacts: ['old.json'], next: 'implement', reasonCode: 'stale_failure' }));
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual([
      'implement', 'verify', 'deliver',
    ]);
    expect(f.state.prompts[0].prompt).toContain('repository.nmg-sdlc-smoke');
    expect(f.state.prompts[0].prompt).toContain('tree ');
    expect(f.state.prompts[0].prompt).not.toContain('old checkpoint narrative');
    expect(f.state.sourcePushes).toBe(1);
  });

  it('picks a specified issue on the non-issue branch without replaying a checkpoint', () => {
    const f = fixture({ branch: 'main' });
    let presented;
    const picker = { ...f.host, pickIssue: (candidates) => {
      presented = candidates;
      return 42;
    } };
    f.setWorker(({ step, root, publish, passGate, state }) => {
      if (step === 'start') {
        git(root, 'checkout', '-b', '42-example');
        git(root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (step === 'implement') { publish('fix: implement #42 on its new branch'); return { status: 'passed', next: 'verify' }; }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('', { host: picker })).toMatchObject({ status: 0 });
    expect(presented).toEqual([{ number: 42, title: 'Example' }]);
  });

  it('accepts rewritten identical failure evidence and diagnoses it in a new repair', () => {
    const f = fixture();
    let failures = 0;
    let repairs = 0;
    f.setWorker(({ step, publish, passGate, state }) => {
      if (step === 'verify' && failures++ < 2) return {
        status: 'failed', reasonCode: 'same_check', summary: 'same failing check',
        artifacts: ['verification/42.json'], next: 'implement',
      };
      if (step === 'implement') {
        publish(`fix: different repair ${++repairs} #42`);
        return { status: 'passed', next: 'verify' };
      }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(repairs).toBe(2);
    expect(f.state.prompts[3].prompt).toContain('same failing check');
  });

  it('reconciles an unacknowledged implementation push before deciding to verify', () => {
    const f = fixture({ dirty: true });
    let implementations = 0;
    f.setWorker(({ step, publish, passGate, state }) => {
      if (step === 'implement') {
        implementations += 1;
        publish('fix: unacknowledged #42');
        return { handoff: false };
      }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(implementations).toBe(1);
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['implement', 'verify', 'deliver']);
  });

  it('preserves dirty partial work and repairs more than two distinct failures without an attempt cap', () => {
    const f = fixture({ dirty: true });
    let failedVerifications = 0;
    let implementationCount = 0;
    f.setWorker(({ step, prompt, publish, passGate, state }) => {
      if (step === 'implement') {
        implementationCount += 1;
        publish(`fix: attempt ${implementationCount} #42`);
        return { status: 'passed', next: 'verify' };
      }
      if (step === 'verify' && failedVerifications++ < 2) {
        return { status: 'failed', next: 'implement', reasonCode: `gate_${failedVerifications}`,
          summary: `required check ${failedVerifications} failed`, artifacts: [`gate-${failedVerifications}.json`] };
      }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    const response = f.execute('#42');
    expect(response).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual([
      'implement', 'verify', 'implement', 'verify', 'implement', 'verify', 'deliver',
    ]);
    // Fresh implement on haiku; each repair implement after a failed verify on opus; deliver after the pass on haiku.
    expect(f.state.starts.map((entry) => entry.model)).toEqual([
      'haiku', 'opus', 'opus', 'opus', 'opus', 'opus', 'haiku',
    ]);
    expect(f.state.starts.map((entry) => entry.effort)).toEqual([
      'xhigh', 'high', null, 'high', null, 'high', 'xhigh',
    ]);
    expect(f.state.prompts[2].prompt).toContain('gate-1.json');
    expect(f.state.prompts[4].prompt).toContain('gate-2.json');
    expect(fs.readFileSync(path.join(f.root, 'helper.py'), 'utf8')).toContain('preserved partial change');
  });

  it('rejects explicit different issue on active branch without starting a worker', () => {
    const f = fixture({ dirty: true });
    expect(f.execute('#43')).toMatchObject({ status: 1, stderr: expect.stringContaining('active_issue_conflict') });
    expect(f.state.starts).toEqual([]);
  });

  it('stops on a real intervention without treating it as another repair attempt', () => {
    const f = fixture();
    f.setWorker(({ step }) => {
      expect(step).toBe('verify');
      return { status: 'failed', intervention: true, reasonCode: 'provider_unavailable',
        summary: 'required provider cannot be reached', artifacts: ['verification/42.json'] };
    });
    expect(f.execute('#42')).toMatchObject({ status: 1,
      stderr: expect.stringContaining('provider_unavailable: required provider cannot be reached') });
    expect(f.state.starts).toHaveLength(1);
  });

  it('runs full verification again after delivery publishes a new mergeability head', () => {
    const f = fixture();
    let deliveries = 0;
    f.setWorker(({ step, root, publish, passGate, state }) => {
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver' && deliveries++ === 0) {
        fs.appendFileSync(path.join(root, 'helper.py'), '# mergeability reconciliation\n');
        publish('fix: reconcile mergeability #42');
        return { status: 'failed', intervention: false, next: 'verify',
          reasonCode: 'mergeability_reverification_required',
          summary: 'published a new source head', artifacts: ['helper.py'] };
      }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual([
      'verify', 'deliver', 'verify', 'deliver',
    ]);
    expect(deliveries).toBe(2);
  });

  it('reconciles a lost delivery handoff and an already merged/closed exact head without duplicate remote action', () => {
    const f = fixture();
    let deliveryCalls = 0;
    f.setWorker(({ step, passGate, state }) => {
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') {
        deliveryCalls += 1;
        state.merged = true;
        state.closed = true;
        return { handoff: false };
      }
      throw new Error(step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(deliveryCalls).toBe(1);
    // Post-delivery cleanup removed the issue branch, so the repeat recognizes the delivery off-branch.
    const run = issueDeliveryRun(f, {
      issues: { 42: closedIssue(42, [closingRef(9)]) },
      prs: { 9: mergedPr(9, 42, '42-example') },
    });
    expect(f.execute('#42', { run })).toEqual({ status: 0, stdout: '#42: MERGED and CLOSED\n', stderr: '' });
    expect(deliveryCalls).toBe(1);
  });
});

describe('worker supervision while its background work runs (#470)', () => {
  const marker = (f) => path.join(f.root, '.nmg-sdlc/handoffs/42-verify.json.waiting');
  const deliver = ({ state }) => { state.merged = true; state.closed = true; return { status: 'passed', next: null }; };

  it('keeps a worker waiting on its background gate until its later handoff', () => {
    const f = fixture();
    let gateRunning = false;
    f.setWorker((context) => {
      if (context.step === 'verify') {
        fs.mkdirSync(path.dirname(marker(f)), { recursive: true });
        fs.writeFileSync(marker(f), 'sdlc-verify-steering.mjs\n');
        gateRunning = true;
        // Settled with its marker: the background gate's notification resumes the turn, and the turn then ends
        // with the passing handoff once the controller has removed the marker.
        context.record.onWait = ({ timeoutMs }, record) => {
          if (timeoutMs !== 60000 || !gateRunning) return;
          gateRunning = false;
          record.status = 'running';
          record.onFinish = () => {
            expect(fs.existsSync(marker(f))).toBe(false);
            f.passGate();
            f.writeHandoff('verify', { status: 'passed', next: 'deliver' });
          };
        };
        return { handoff: false };
      }
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.step)).toEqual(['verify', 'deliver']);
    expect(f.state.waits).toContainEqual({ agentId: f.state.starts[0].agentId, until: 'started', timeoutMs: 60000 });
    expect(f.state.reminders).toEqual([]);
    expect(f.state.stops).toEqual([]);
  });

  it('removes a stale waiting marker and reminds a settled worker once before it counts as stopped', () => {
    const f = fixture();
    fs.mkdirSync(path.dirname(marker(f)), { recursive: true });
    fs.writeFileSync(marker(f), 'left by an earlier invocation\n');
    f.setWorker((context) => {
      if (context.step === 'verify') return { handoff: false };
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    f.setReminder(({ step, passGate }) => {
      expect(step).toBe('verify');
      passGate();
      return { status: 'passed', next: 'deliver' };
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.reminders).toHaveLength(1);
    expect(f.state.reminders[0].prompt).toContain('.nmg-sdlc/handoffs/42-verify.json');
    expect(f.state.reminders[0].prompt).toContain('.nmg-sdlc/handoffs/42-verify.json.waiting');
    expect(f.state.starts.map((entry) => entry.step)).toEqual(['verify', 'deliver']);
  });

  it('retries verify, not an implement repair, after a verify worker settles without a handoff (missing_handoff)', () => {
    const f = fixture();
    let verifications = 0;
    f.setWorker((context) => {
      if (context.step === 'verify' && verifications++ === 0) return { handoff: false };
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.reminders).toHaveLength(1);
    expect(f.state.starts.map((entry) => entry.step)).toEqual(['verify', 'verify', 'deliver']);
    expect(f.state.prompts[1].prompt).toContain('missing_handoff');
  });

  it.each([['failed', 'process_lost'], ['killed', 'process_lost']])(
    'ends a %s worker without a handoff as %s, with no reminder and no resume wait', (agentStatus, reasonCode) => {
      const f = fixture();
      let verifications = 0;
      f.setWorker((context) => {
        if (context.step === 'verify' && verifications++ === 0) {
          context.record.status = agentStatus;
          return { handoff: false };
        }
        if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
        if (context.step === 'deliver') return deliver(context);
        throw new Error(context.step);
      });
      expect(f.execute('#42')).toMatchObject({ status: 0 });
      expect(f.state.reminders).toEqual([]);
      expect(f.state.waits.some((wait) => wait.timeoutMs !== undefined)).toBe(false);
      expect(f.state.prompts[1].prompt).toContain(reasonCode);
      expect(f.state.starts.map((entry) => entry.step)).toEqual(['verify', 'verify', 'deliver']);
    });

  it('verifies a branch with no commits once this invocation implemented it at that head', () => {
    const f = fixture({ branch: 'main' });
    f.setWorker((context) => {
      if (context.step === 'start') {
        git(context.root, 'checkout', '-b', '42-example');
        git(context.root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      // The implement worker finds nothing left to change and publishes no commit.
      if (context.step === 'implement') return { status: 'passed', next: 'verify' };
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.step)).toEqual(['start', 'implement', 'verify', 'deliver']);
  });
});
describe('Opus supervisor decisions (#491)', () => {
  const steps = (f) => f.state.starts.map((entry) => entry.step);
  const deliver = ({ state }) => { state.merged = true; state.closed = true; return { status: 'passed', next: null }; };
  // Records each report, answers it from `answer(report, index)` (default accept/continue), and captures the
  // controller state the report was taken in.
  const supervisor = (f, answer = () => null) => {
    const reports = [];
    const supervise = (report) => {
      reports.push({ ...report, stopsAtReport: [...f.state.stops], startsAtReport: f.state.starts.length });
      return answer(report, reports.length - 1) ?? { action: report.kind === 'stage' ? 'accept' : 'continue' };
    };
    return { reports, supervise };
  };
  // A verify worker that keeps running for `slices` timed waits, then writes its passing handoff. Each verify
  // spawn runs its own slices; `onSlice(n, record)` runs after each slice with the injected clock advanced.
  const runningWorker = (f, { slices, clock, onSlice = () => {} }) => {
    f.hooks.advance = (ms) => { clock.now += ms; };
    f.setWorker((context) => {
      if (context.step !== 'verify') return deliver(context);
      Object.assign(context.record, {
        status: 'running',
        slices,
        onSlice: (n, record) => onSlice(n, record),
        onFinish: () => {
          f.passGate();
          f.writeHandoff('verify', { status: 'passed', next: 'deliver' });
        },
      });
      return { handoff: false };
    });
  };

  it('returns a stage report at every boundary before the next stage starts', () => {
    const f = fixture({ dirty: true });
    f.setWorker((context) => {
      if (context.step === 'implement') {
        fs.writeFileSync(path.join(context.root, 'stray.txt'), 'outside the spec\n');
        context.publish('fix: finish #42');
        return { status: 'passed', next: 'verify' };
      }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['implement', 'verify', 'deliver']);
    expect(reports.map((report) => `${report.kind}:${report.stage}`)).toEqual(['stage:implement', 'stage:verify', 'stage:deliver']);
    reports.forEach((report, index) => {
      expect(report.stopsAtReport).toEqual([]);
      expect(report.startsAtReport).toBe(index + 1);
      expect(report).toMatchObject({ issue: 42, worker: f.state.starts[index].name, agentId: f.state.starts[index].agentId,
        decisions: ['accept', 'prompt', 'redispatch', 'halt'], failureHistory: [] });
      expect(report).not.toHaveProperty('pane');
      expect(report.headBefore).toMatch(/^[0-9a-f]{40}$/);
      expect(report.headAfter).toMatch(/^[0-9a-f]{40}$/);
    });
    const [implement, verify] = reports;
    expect(implement.handoff).toMatchObject({ step: 'implement', status: 'passed' });
    expect(implement.headAfter).not.toBe(implement.headBefore);
    expect(implement.commits.map((commit) => commit.subject)).toEqual(['fix: finish #42']);
    expect(implement.changedPaths).toEqual(expect.arrayContaining(['helper.py', 'stray.txt']));
    expect(implement.outsideSpecPaths).toEqual(['stray.txt']);
    expect(verify.gate).toBe('pass');
    expect(verify.verification).toMatchObject({ report: 'specs/42-example/verification-report.md',
      readiness: { status: 'pass', reasonCode: 'ordinary_pass', gaps: [] }, issues: [] });
    expect(f.state.stops).toEqual([]);
  });

  it('reports a verify stage with its readiness gaps and the report critical and remaining issues', () => {
    const f = fixture();
    f.setWorker((context) => {
      const report = path.join(context.root, 'specs/42-example/verification-report.md');
      fs.writeFileSync(report, '# Verification Report\n\n### Implementation Status: Fail\n\n## Critical Issues\n\n- smoke host unreachable\n\n## Remaining Issues\n\n- none in code\n\n## Notes\n\nunrelated\n');
      return { status: 'failed', next: 'implement', reasonCode: 'verification_not_ready', summary: 'smoke host unreachable', artifacts: [] };
    });
    const { reports, supervise } = supervisor(f, () => ({ action: 'halt', text: 'smoke host unreachable' }));
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 1, stderr: 'supervisor_halt: smoke host unreachable\n' });
    expect(reports[0].verification.readiness).toMatchObject({ status: 'blocked', reasonCode: 'implementation_non_pass' });
    expect(reports[0].verification.readiness.gaps).toContain('issue-scope marker is malformed');
    expect(reports[0].verification.issues).toEqual(['## Critical Issues\n\n- smoke host unreachable', '## Remaining Issues\n\n- none in code']);
    expect(reports[0].gate).toBe('not_green');
  });

  it('prompts the live worker through one host append and reports its fresh handoff before continuing', () => {
    const f = fixture();
    f.setWorker((context) => {
      if (context.step === 'verify') return { status: 'failed', next: 'implement', reasonCode: 'smoke_failed', summary: 'smoke failed', artifacts: [] };
      return deliver(context);
    });
    f.hooks.onAppend = () => {
      f.passGate();
      f.writeHandoff('verify', { status: 'passed', next: 'deliver' });
      return true;
    };
    const { reports, supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'prompt', text: 'the smoke host is back; rerun the gate' } : null));
    expect(f.execute('#42', { supervise })).toMatchObject({ stderr: '', status: 0 });
    expect(f.state.appends).toHaveLength(1);
    expect(f.state.appends[0].agentId).toBe(f.state.starts[0].agentId);
    expect(f.state.appends[0].prompt).toContain('the smoke host is back; rerun the gate');
    expect(f.state.appends[0].prompt).toContain('write and validate a fresh handoff at .nmg-sdlc/handoffs/42-verify.json');
    expect(reports.map((report) => [report.stage, report.handoff.status, report.handoffFresh])).toEqual([
      ['verify', 'failed', true], ['verify', 'passed', true], ['deliver', 'passed', true]]);
    expect(reports[1].stopsAtReport).toEqual([]);
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('re-dispatches the stage with the supervisor guidance beside the failure evidence, stopping the old subagent first', () => {
    const f = fixture({ dirty: true });
    let implementations = 0;
    f.setWorker((context) => {
      if (context.step === 'implement' && implementations++ === 0) {
        return { status: 'failed', next: 'implement', reasonCode: 'tests_failed', summary: 'parser tests failed', artifacts: ['jest.log'] };
      }
      if (context.step === 'implement') { context.publish('fix: finish #42'); return { status: 'passed', next: 'verify' }; }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
    const { reports, supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'redispatch', text: 'use the existing parser' } : null));
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['implement', 'implement', 'verify', 'deliver']);
    expect(f.state.stops).toEqual([f.state.starts[0].agentId]);
    expect(f.state.log.slice(0, 3)).toEqual(['spawn:agent-1', 'stop:agent-1', 'spawn:agent-2']);
    expect(f.state.prompts[1].prompt).toContain('Supervisor guidance: use the existing parser');
    expect(f.state.prompts[1].prompt).toContain('tests_failed: parser tests failed');
    expect(f.state.prompts[2].prompt).not.toContain('Supervisor guidance');
    expect(reports[1].failureHistory).toEqual([expect.objectContaining({ step: 'implement', reasonCode: 'tests_failed' })]);
  });

  it('re-runs verify at the same source head after an environmental failure, held to the full gate', () => {
    const f = fixture();
    let verifications = 0;
    const heads = [];
    f.setWorker((context) => {
      if (context.step === 'verify') {
        heads.push(git(context.root, 'rev-parse', 'HEAD'));
        if (verifications++ === 0) {
          return { status: 'failed', next: 'implement', reasonCode: 'verification_not_ready', summary: 'smoke clone failed: DNS', artifacts: [] };
        }
        context.passGate();
        return { status: 'passed', next: 'deliver' };
      }
      return deliver(context);
    });
    const { supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'redispatch', text: 'DNS restored on the host; rerun verification unchanged' } : null));
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['verify', 'verify', 'deliver']);
    expect(heads[1]).toBe(heads[0]);
    expect(f.state.prompts[1].prompt).toContain('Supervisor guidance: DNS restored on the host');
    expect(f.state.starts.map((entry) => entry.model)).toEqual(['opus', 'opus', 'haiku']);
  });

  it('keeps an environmental verify re-run from delivering until the registered gate is green', () => {
    const f = fixture();
    let verifications = 0;
    f.setWorker((context) => {
      if (context.step === 'verify' && verifications++ < 2) {
        return { status: 'passed', next: 'deliver' };
      }
      if (context.step === 'implement') { context.publish('fix: repair #42'); return { status: 'passed', next: 'verify' }; }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
    const { reports, supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'redispatch', text: 'rerun verify' } : null));
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    // The re-run passed its handoff without a green gate and was accepted: implement, never deliver.
    expect(steps(f)).toEqual(['verify', 'verify', 'implement', 'verify', 'deliver']);
    expect(reports.slice(0, 2).map((report) => report.gate)).toEqual(['not_green', 'not_green']);
  });

  it('halts with the diagnosis after stopping the stage subagent, leaving branch, worktree and remote unchanged', () => {
    const f = fixture();
    f.setWorker(() => ({ status: 'failed', next: 'implement', reasonCode: 'verification_not_ready', summary: 'disk full', artifacts: [] }));
    const snapshot = () => ({
      head: git(f.root, 'rev-parse', 'HEAD'),
      worktree: git(f.root, 'status', '--porcelain', '--', '.', ':(exclude).nmg-sdlc'),
      remote: git(f.root, 'ls-remote', 'origin', 'refs/heads/42-example'),
    });
    const before = snapshot();
    const { supervise } = supervisor(f, () => ({ action: 'halt', text: 'host disk full' }));
    expect(f.execute('#42', { supervise }))
      .toEqual({ status: 1, stdout: '', stderr: 'supervisor_halt: host disk full\n' });
    expect(steps(f)).toEqual(['verify']);
    expect(f.state.stops).toEqual([f.state.starts[0].agentId]);
    expect(f.state.log).toEqual(['spawn:agent-1', 'stop:agent-1']);
    expect(snapshot()).toEqual(before);
    expect(git(f.root, 'branch', '--show-current')).toBe('42-example');
    expect(fs.existsSync(path.join(f.root, '.nmg-sdlc/controller.lock'))).toBe(false);
  });

  it('rejects the removed --retain-worker flag with the usage line and starts nothing', () => {
    const f = fixture();
    expect(f.execute('--retain-worker #42')).toEqual({ status: 2, stdout: '',
      stderr: 'Usage: /sdlc-execute [--check-in-seconds N] [#N ...]\n' });
    expect(f.state.starts).toEqual([]);
  });

  it('never accepts a decision the report does not offer', () => {
    const f = fixture();
    expect(f.execute('#42', { supervise: () => ({ action: 'continue' }) }))
      .toMatchObject({ status: 1, stderr: 'supervisor_decision_invalid: continue\n' });
    const g = fixture();
    expect(g.execute('#42', { supervise: () => ({ action: 'halt', text: ' ' }) }))
      .toMatchObject({ status: 1, stderr: 'supervisor_decision_invalid: halt\n' });
  });

  it('checks in on a running worker each interval with its activity and marker, and continues', () => {
    const f = fixture();
    const clock = { now: 0 };
    const marker = path.join(f.root, '.nmg-sdlc/handoffs/42-verify.json.waiting');
    runningWorker(f, { slices: 4, clock, onSlice: (slice, record) => {
      if (slice === 2) {
        fs.mkdirSync(path.dirname(marker), { recursive: true });
        fs.writeFileSync(marker, 'node scripts/sdlc-verify-steering.mjs --issue 42\n');
      }
      if (slice === 3) Object.assign(record, { latestText: 'smoke delivering #237', lastActivityAt: clock.now });
    } });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 1000 })).toMatchObject({ status: 0 });
    const checkIns = reports.filter((report) => report.kind === 'checkin');
    expect(checkIns.length).toBeGreaterThanOrEqual(2);
    expect(checkIns[0]).toMatchObject({ issue: 42, stage: 'verify', worker: f.state.starts[0].name,
      agentId: f.state.starts[0].agentId, reason: 'interval', waiting: null, commits: [], outsideSpecPaths: [],
      failureHistory: [], activity: { status: 'running', toolCalls: [], latestText: '' },
      decisions: ['continue', 'prompt', 'redispatch', 'halt'] });
    expect(checkIns[0]).not.toHaveProperty('paneTail');
    expect(checkIns[0].sinceDispatchSeconds).toBeGreaterThanOrEqual(1);
    expect(checkIns.some((report) => report.waiting?.command === 'node scripts/sdlc-verify-steering.mjs --issue 42')).toBe(true);
    expect(checkIns.some((report) => report.activity.latestText === 'smoke delivering #237')).toBe(true);
    checkIns.forEach((report) => expect(report.stopsAtReport).toEqual([]));
    expect(reports.at(-2)).toMatchObject({ kind: 'stage', stage: 'verify' });
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('checks in as soon as the activity stops changing, once per unchanged span', () => {
    const f = fixture();
    const clock = { now: 0 };
    runningWorker(f, { slices: 9, clock, onSlice: (slice, record) => {
      // Activity is observed once, at 30 s, and then stops changing.
      if (slice === 1) Object.assign(record, { lastActivityAt: clock.now });
    } });
    const { reports, supervise } = supervisor(f);
    // 30 s slices against a 100 s interval: the interval check-in at 120 s, the activity check-in at 150 s
    // (120 s after the last observed change), then the interval counting from 150 s, at 270 s.
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 100_000 })).toMatchObject({ status: 0 });
    const checkIns = reports.filter((report) => report.kind === 'checkin');
    expect(checkIns.map((report) => [report.reason, report.sinceDispatchSeconds])).toEqual([
      ['interval', 120], ['activity_unchanged', 150], ['interval', 270]]);
    expect(checkIns[1]).toMatchObject({ activity: { status: 'running', lastActivitySecondsAgo: 120 } });
    expect(checkIns[1]).not.toHaveProperty('paneTail');
  });

  it('reports a stale waiting marker as a stall once', () => {
    const f = fixture();
    const clock = { now: Date.now() };
    const marker = path.join(f.root, '.nmg-sdlc/handoffs/42-verify.json.waiting');
    runningWorker(f, { slices: 3, clock, onSlice: (slice) => {
      if (slice !== 1) return;
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, 'npm test\n');
      const old = new Date(clock.now - 3_600_000);
      fs.utimesSync(marker, old, old);
    } });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 600_000 })).toMatchObject({ status: 0 });
    const checkIns = reports.filter((report) => report.kind === 'checkin');
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0]).toMatchObject({ reason: 'waiting_marker_stale', waiting: { command: 'npm test' },
      activity: { status: 'running' } });
    expect(checkIns[0]).not.toHaveProperty('paneTail');
    expect(checkIns[0].waiting.ageSeconds).toBeGreaterThanOrEqual(3600);
  });

  it('queues check-in guidance to a busy worker and keeps waiting through it for the handoff', () => {
    const f = fixture();
    const clock = { now: 0 };
    let pending = null;
    runningWorker(f, { slices: 4, clock, onSlice: (slice) => {
      // The worker is mid tool call: the queued guidance lands only when that call finishes.
      if (slice === 3 && pending) { f.state.delivered = pending; pending = null; }
    } });
    f.hooks.onAppend = ({ text }) => { pending = text; return true; };
    const { reports, supervise } = supervisor(f, (report) =>
      (report.kind === 'checkin' && report.reason === 'interval' && !f.state.appends.length
        ? { action: 'prompt', text: 'skip the flaky retry and report the failure' } : null));
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 30_000 })).toMatchObject({ status: 0 });
    expect(f.state.appends).toHaveLength(1);
    expect(f.state.appends[0]).toEqual({ agentId: f.state.starts[0].agentId, prompt: expect.stringContaining('skip the flaky retry') });
    expect(f.state.appends[0].prompt).toContain('Act on this guidance within the current step');
    expect(f.state.delivered).toBe(f.state.appends[0].prompt);
    expect(f.state.stops).toEqual([]);
    expect(reports.filter((report) => report.kind === 'stage').map((report) => report.stage)).toEqual(['verify', 'deliver']);
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('re-dispatches a running worker from a check-in with the guidance, stopping it first', () => {
    const f = fixture();
    const clock = { now: 0 };
    // The first verify keeps working through one slice; the re-dispatched one also runs one slice and finishes.
    runningWorker(f, { slices: 1, clock });
    const { reports, supervise } = supervisor(f, (report, index) =>
      (index === 0 ? { action: 'redispatch', text: 'the worker is looping; start verification again' } : null));
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 30_000 })).toMatchObject({ status: 0 });
    expect(reports[0]).toMatchObject({ kind: 'checkin', stage: 'verify' });
    expect(f.state.stops).toEqual([f.state.starts[0].agentId]);
    expect(f.state.log.slice(0, 3)).toEqual(['spawn:agent-1', 'stop:agent-1', 'spawn:agent-2']);
    expect(steps(f)).toEqual(['verify', 'verify', 'deliver']);
    expect(f.state.prompts[1].prompt).toContain('Supervisor guidance: the worker is looping; start verification again');
  });

  it('halts a running worker from a check-in, stopping it before the halt', () => {
    const f = fixture();
    const clock = { now: 0 };
    runningWorker(f, { slices: 5, clock });
    const { supervise } = supervisor(f, (report) =>
      (report.kind === 'checkin' ? { action: 'halt', text: 'worker is editing unrelated files' } : null));
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 30_000 }))
      .toEqual({ status: 1, stdout: '', stderr: 'supervisor_halt: worker is editing unrelated files\n' });
    expect(steps(f)).toEqual(['verify']);
    expect(f.state.stops).toEqual([f.state.starts[0].agentId]);
    expect(fs.existsSync(path.join(f.root, '.nmg-sdlc/controller.lock'))).toBe(false);
  });

  it('accepts a configurable check-in interval in the execute arguments', () => {
    expect(parseArgs('--check-in-seconds 120 #42')).toEqual({ issues: [42], defaultBacklog: false, checkInSeconds: 120 });
    expect(parseArgs('--check-in-seconds 60')).toMatchObject({ checkInSeconds: 60, defaultBacklog: true });
    for (const args of ['--check-in-seconds', '--check-in-seconds 0 #42', '--check-in-seconds 1.5', '--check-in-seconds 86401',
      '--check-in-seconds 60 --check-in-seconds 60']) {
      expect(() => parseArgs(args)).toThrow('Usage: /sdlc-execute [--check-in-seconds N] [#N ...]');
    }
  });

  it('rejects --retain-worker in parseArgs with a usage error that names the removed flag', () => {
    expect(() => parseArgs(['--retain-worker', '#1'])).toThrow('--retain-worker');
    expect(() => parseArgs('#42 --retain-worker')).toThrow('--retain-worker is removed');
  });
});
describe('stale local default branch (#502)', () => {
  const steps = (f) => f.state.starts.map((entry) => entry.name.split('-')[1]);
  const deliver = ({ state }) => { state.merged = true; state.closed = true; return { status: 'passed', next: null }; };

  it('routes an empty issue branch created from origin to implement with no version prepared first', () => {
    const f = fixture({ branch: 'main' });
    advanceOrigin(f.root);
    let versionsBeforeImplement = null;
    f.setWorker((context) => {
      if (context.step === 'start') {
        git(context.root, 'fetch', '--quiet', 'origin');
        git(context.root, 'checkout', '-b', '42-example', 'origin/main');
        git(context.root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (context.step === 'implement') {
        versionsBeforeImplement = f.state.versionPreparations.length;
        // The implement worker finds nothing to change and publishes no commit.
        return { status: 'passed', next: 'verify' };
      }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(steps(f).slice(0, 2)).toEqual(['start', 'implement']);
    expect(versionsBeforeImplement).toBe(0);
  });

  it('routes a branch with real commits to verify, preparing the version first, despite the stale local default branch', () => {
    const f = fixture();
    advanceOrigin(f.root);
    let versionsBeforeVerify = null;
    f.setWorker(({ step, state, passGate }) => {
      if (step === 'verify') { versionsBeforeVerify = f.state.versionPreparations.length; passGate(); }
      if (step === 'deliver') { state.merged = true; state.closed = true; }
      return { status: 'passed', next: { verify: 'deliver', deliver: null }[step] };
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['verify', 'deliver']);
    expect(versionsBeforeVerify).toBeGreaterThan(0);
  });

  it('fails closed with default_branch_unreadable and starts no worker when the remote default ref cannot be fetched', () => {
    const f = fixture();
    const failingFetch = (command, args, options) => (command === 'git' && args[0] === 'fetch'
      ? { status: 128, stdout: '', stderr: "fatal: couldn't find remote ref refs/heads/main\n" }
      : f.run(command, args, options));
    expect(f.execute('', { run: failingFetch })).toEqual({ status: 1, stdout: '', stderr: 'default_branch_unreadable\n' });
    expect(f.state.starts).toEqual([]);
    expect(f.state.versionPreparations).toEqual([]);
  });
});

describe('post-delivery branch cleanup (#523)', () => {
  const remoteBranchExists = (root) => git(root, 'ls-remote', '--heads', 'origin', '42-example') !== '';
  const localBranchExists = (root) => spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/42-example'],
    { cwd: root }).status === 0;
  const delivered = (f) => { f.state.merged = true; f.state.closed = true; };
  const cleaned = '#42: branch cleanup: deleted 42-example and fast-forwarded main\n';
  // Fails only the command `when` matches; every other command reaches the fixture.
  const failing = (f, when) => (command, args, options) => (when(command, args)
    ? { status: 1, stdout: '', stderr: 'injected failure\n' } : f.run(command, args, options));

  it('deletes the proven branch remotely and locally and fast-forwards the default branch (AC1, bare re-entry)', () => {
    const f = fixture();
    delivered(f);
    expect(f.execute('')).toEqual({ status: 0, stdout: `#42: MERGED and CLOSED\n${cleaned}`, stderr: '' });
    expect(remoteBranchExists(f.root)).toBe(false);
    expect(localBranchExists(f.root)).toBe(false);
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
    expect(git(f.root, 'rev-parse', 'main')).toBe(git(f.root, 'rev-parse', 'origin/main'));
    expect(f.state.starts).toEqual([]);
  });

  it('skips the remote deletion silently when the remote branch is already absent (AC2)', () => {
    const f = fixture();
    delivered(f);
    git(f.root, 'push', 'origin', '--delete', '42-example');
    expect(f.execute('')).toEqual({ status: 0, stdout: `#42: MERGED and CLOSED\n${cleaned}`, stderr: '' });
    expect(localBranchExists(f.root)).toBe(false);
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
  });

  it('preserves the branch and uncommitted changes when the worktree is dirty outside .nmg-sdlc/ (AC3)', () => {
    const f = fixture({ dirty: true });
    delivered(f);
    expect(f.execute('')).toEqual({ status: 0,
      stdout: '#42: MERGED and CLOSED\n#42: branch cleanup skipped: worktree_dirty\n', stderr: '' });
    expect(git(f.root, 'branch', '--show-current')).toBe('42-example');
    expect(localBranchExists(f.root)).toBe(true);
    expect(remoteBranchExists(f.root)).toBe(true);
    expect(fs.readFileSync(path.join(f.root, 'helper.py'), 'utf8')).toContain('# preserved partial change');
  });

  it('preserves the branch when the local head moves after delivery was proven (AC3)', () => {
    const f = fixture();
    delivered(f);
    // completed() reads the issue last; a commit landing then moves HEAD past the proven head.
    const run = (command, args, options) => {
      const response = f.run(command, args, options);
      if (command === 'gh' && args.includes('number,state')) git(f.root, 'commit', '--allow-empty', '-m', 'chore: move after proof');
      return response;
    };
    expect(f.execute('', { run })).toEqual({ status: 0,
      stdout: '#42: MERGED and CLOSED\n#42: branch cleanup skipped: local_head_mismatch\n', stderr: '' });
    expect(git(f.root, 'branch', '--show-current')).toBe('42-example');
    expect(remoteBranchExists(f.root)).toBe(true);
  });

  it('preserves the branch when the default branch cannot fast-forward to origin (AC3)', () => {
    const f = fixture();
    delivered(f);
    // Local main and origin/main each gain a commit the other lacks, so the pull cannot fast-forward.
    git(f.root, 'checkout', 'main');
    fs.writeFileSync(path.join(f.root, 'local.txt'), 'local only\n');
    git(f.root, 'add', 'local.txt');
    git(f.root, 'commit', '-m', 'chore: local main');
    git(f.root, 'checkout', '42-example');
    advanceOrigin(f.root);
    expect(f.execute('')).toEqual({ status: 0,
      stdout: '#42: MERGED and CLOSED\n#42: branch cleanup skipped: pull_not_fast_forward\n', stderr: '' });
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
    expect(localBranchExists(f.root)).toBe(true);
  });

  it.each([
    ['default_branch_unreadable', (command, args) => command === 'gh' && args.includes('--jq'),
      '#42: branch cleanup skipped: default_branch_unreadable\n', { localKept: true, remoteKept: false }],
    ['default_checkout_failed', (command, args) => command === 'git' && args[0] === 'switch',
      '#42: branch cleanup skipped: default_checkout_failed\n', { localKept: true, remoteKept: false }],
    ['local_branch_delete_failed', (command, args) => command === 'git' && args[0] === 'branch' && args[1] === '-D',
      '#42: branch cleanup skipped: local_branch_delete_failed\n', { localKept: true, remoteKept: false }],
    ['remote_head_unreadable', (command, args) => command === 'git' && args[0] === 'ls-remote',
      `#42: remote branch cleanup skipped: remote_head_unreadable\n${cleaned}`, { localKept: false, remoteKept: true }],
    ['remote_delete_failed', (command, args) => command === 'git' && args[0] === 'push' && args.includes('--delete'),
      `#42: remote branch cleanup skipped: remote_delete_failed\n${cleaned}`, { localKept: false, remoteKept: true }],
  ])('reports %s and keeps only what the failed step leaves in place', (_reason, when, tail, kept) => {
    const f = fixture();
    delivered(f);
    expect(f.execute('', { run: failing(f, when) })).toEqual({ status: 0, stdout: `#42: MERGED and CLOSED\n${tail}`, stderr: '' });
    expect(localBranchExists(f.root)).toBe(kept.localKept);
    expect(remoteBranchExists(f.root)).toBe(kept.remoteKept);
  });

  it('reports remote_head_mismatch and still deletes the local branch when the remote moved (AC4)', () => {
    const f = fixture();
    delivered(f);
    git(f.root, 'push', '--force', 'origin', 'HEAD~1:refs/heads/42-example');
    expect(f.execute('')).toEqual({ status: 0,
      stdout: `#42: MERGED and CLOSED\n#42: remote branch cleanup skipped: remote_head_mismatch\n${cleaned}`, stderr: '' });
    expect(remoteBranchExists(f.root)).toBe(true);
    expect(localBranchExists(f.root)).toBe(false);
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
  });

  it('finishes the delivered branch before the next queued issue starts from the default branch (AC5)', () => {
    const f = fixture();
    delivered(f);
    const run = issueDeliveryRun(f, {
      issues: { 43: closedIssue(43, [closingRef(10)]) },
      prs: { 10: mergedPr(10, 43, '43-next') },
    });
    expect(f.execute('#42 #43', { run })).toEqual({ status: 0,
      stdout: `#42: MERGED and CLOSED\n${cleaned}#43: MERGED and CLOSED\n`, stderr: '' });
    expect(git(f.root, 'branch', '--show-current')).toBe('main');
    expect(f.state.starts).toEqual([]);
  });
});

describe('idle workers, prompt refusals, restart routing and background activity (#546)', () => {
  const steps = (f) => f.state.starts.map((entry) => entry.step);
  const deliver = ({ state }) => { state.merged = true; state.closed = true; return { status: 'passed', next: null }; };
  const intentFile = (f) => path.join(f.root, '.nmg-sdlc/execute/gate-intent/42.json');
  const gateFile = (f) => path.join(f.root, '.nmg-sdlc/verification/42.json');
  const writeGate = (f, { head, generatedAt, ceiling }) => {
    fs.mkdirSync(path.dirname(gateFile(f)), { recursive: true });
    fs.writeFileSync(gateFile(f), JSON.stringify({ schemaVersion: 1, issue: 42, generatedAt,
      identity: { headSha: head }, ceiling, coverage: { complete: true }, results: [] }));
  };
  const supervisor = (f, answer = () => null) => {
    const reports = [];
    const supervise = (report) => {
      reports.push({ ...report, stopsAtReport: [...f.state.stops], startsAtReport: f.state.starts.length });
      return answer(report, reports.length - 1) ?? { action: report.kind === 'stage' ? 'accept' : 'continue' };
    };
    return { reports, supervise };
  };
  // A verify worker that settles without a handoff until `silent` runs out, then passes the gate.
  const verifyWorkerSilentUntil = (f, silent) => {
    let verifications = 0;
    f.setWorker((context) => {
      if (context.step === 'verify' && verifications++ < silent) return { handoff: false };
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
  };

  it('resumes a worker that settles without a handoff through append, and reports the handoff its resumed turn wrote', () => {
    const f = fixture();
    f.setWorker((context) => {
      if (context.step === 'verify') return { handoff: false };
      if (context.step === 'deliver') return deliver(context);
      throw new Error(context.step);
    });
    f.setReminder(({ passGate }) => { passGate(); return { status: 'passed', next: 'deliver' }; });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(f.state.reminders).toHaveLength(1);
    expect(f.state.waits.some((wait) => wait.until === 'started')).toBe(true);
    const verify = reports.filter((report) => report.kind === 'stage' && report.stage === 'verify');
    expect(verify).toHaveLength(1);
    expect(verify[0]).toMatchObject({ handoffFresh: true, handoff: { status: 'passed' }, workerState: 'idle', promptRefusal: null });
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('holds the stage report until a tracked background command clears, and reports the commit it landed', () => {
    // A dirty worktree routes the branch to implement first.
    const f = fixture({ dirty: true });
    let landed = false;
    f.setWorker((context) => {
      if (context.step === 'implement') {
        Object.assign(context.record, {
          background: [{ taskId: 'task-1', command: 'npm test', startedAt: 0 }],
          // The commit lands while the settled worker's background command is still tracked.
          onWait: ({ until }) => {
            if (until !== 'started' || landed) return;
            landed = true;
            context.publish('fix: finish #42');
            context.record.background = [];
          },
        });
        return { status: 'passed', next: 'verify' };
      }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      return deliver(context);
    });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(landed).toBe(true);
    const implement = reports.find((report) => report.kind === 'stage' && report.stage === 'implement');
    expect(implement.commits.map((commit) => commit.subject)).toEqual(['fix: finish #42']);
    expect(implement.headAfter).not.toBe(implement.headBefore);
    expect(implement.commits[0].sha).toBe(implement.headAfter);
  });

  it('reports an undelivered prompt as stage_prompt_undelivered, and does not offer prompt on that report', () => {
    const f = fixture();
    verifyWorkerSilentUntil(f, 1);
    f.hooks.onAppend = ({ text }) => !text.includes('supervisor guidance');
    const { reports, supervise } = supervisor(f, (report, index) => {
      if (index === 0) return { action: 'prompt', text: 'rerun the gate' };
      if (index === 1) return { action: 'redispatch', text: 'start over' };
      return null;
    });
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(reports[0].decisions).toContain('prompt');
    expect(reports[1]).toMatchObject({ kind: 'stage', promptRefusal: { reasonCode: 'stage_prompt_undelivered' } });
    expect(reports[1].decisions).not.toContain('prompt');
    expect(steps(f)).toEqual(['verify', 'verify', 'deliver']);
  });

  it('reports a prompt the worker never starts a turn for as stage_prompt_not_resumed, within 60 seconds', () => {
    const f = fixture();
    const clock = { now: 0 };
    f.hooks.advance = (ms) => { clock.now += ms; };
    verifyWorkerSilentUntil(f, 1);
    // The guidance is accepted, but the worker stays settled.
    f.hooks.onAppend = ({ text, record }) => {
      if (text.includes('supervisor guidance')) record.status = 'completed';
      return true;
    };
    const { reports, supervise } = supervisor(f, (report, index) => {
      if (index === 0) return { action: 'prompt', text: 'rerun the gate' };
      if (index === 1) return { action: 'redispatch', text: 'start over' };
      return null;
    });
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 300_000 })).toMatchObject({ status: 0 });
    expect(f.state.appends.filter((entry) => entry.prompt.includes('supervisor guidance'))).toHaveLength(1);
    expect(reports[1]).toMatchObject({ kind: 'stage', promptRefusal: { reasonCode: 'stage_prompt_not_resumed' } });
    expect(reports[1].decisions).not.toContain('prompt');
    expect(steps(f)).toEqual(['verify', 'verify', 'deliver']);
  });

  it('dispatches verify, not implement, after a restart at an unchanged head with a verify intent and an older failed gate', () => {
    const f = fixture();
    const head = git(f.root, 'rev-parse', 'HEAD');
    const dispatchedAt = Date.now();
    fs.mkdirSync(path.dirname(intentFile(f)), { recursive: true });
    fs.writeFileSync(intentFile(f), JSON.stringify({ schemaVersion: 1, issue: 42, head, dispatchedAt }));
    writeGate(f, { head, generatedAt: new Date(dispatchedAt - 60_000).toISOString(), ceiling: 'Fail' });
    f.setWorker((context) => {
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'implement') { context.publish('fix: finish #42'); return { status: 'passed', next: 'verify' }; }
      return deliver(context);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(steps(f)).toEqual(['verify', 'deliver']);
  });

  it('routes a failed gate to implement once its verify report is accepted, after clearing the verify intent', () => {
    const f = fixture();
    let verifications = 0;
    let intentDuringVerify = null;
    let intentAfterVerify = null;
    f.setWorker((context) => {
      if (context.step === 'verify' && verifications++ === 0) {
        intentDuringVerify = fs.existsSync(intentFile(f));
        writeGate(f, { head: git(f.root, 'rev-parse', 'HEAD'), generatedAt: new Date().toISOString(), ceiling: 'Fail' });
        return { status: 'failed', next: 'implement', reasonCode: 'verification_not_green', summary: 'tests failed', artifacts: [] };
      }
      if (context.step === 'verify') { context.passGate(); return { status: 'passed', next: 'deliver' }; }
      if (context.step === 'implement') {
        intentAfterVerify = fs.existsSync(intentFile(f));
        context.publish('fix: finish #42');
        return { status: 'passed', next: 'verify' };
      }
      return deliver(context);
    });
    const { supervise } = supervisor(f);
    expect(f.execute('#42', { supervise })).toMatchObject({ status: 0 });
    expect(intentDuringVerify).toBe(true);
    expect(intentAfterVerify).toBe(false);
    expect(steps(f)).toEqual(['verify', 'implement', 'verify', 'deliver']);
  });

  it('names a running background command in check-ins, and does not report its unchanged activity as a stall', () => {
    const f = fixture();
    const clock = { now: 0 };
    f.hooks.advance = (ms) => { clock.now += ms; };
    f.setWorker((context) => {
      if (context.step !== 'verify') return deliver(context);
      Object.assign(context.record, {
        status: 'running', slices: 9,
        onSlice: (slice, record) => {
          if (slice !== 1) return;
          Object.assign(record, { lastActivityAt: clock.now,
            background: [{ taskId: 'task-1', command: 'npm run gate', startedAt: clock.now }] });
        },
        onFinish: () => {
          // The background command has finished by the time the worker's turn ends.
          context.record.background = [];
          f.passGate();
          f.writeHandoff('verify', { status: 'passed', next: 'deliver' });
        },
      });
      return { handoff: false };
    });
    const { reports, supervise } = supervisor(f);
    expect(f.execute('#42', { supervise, now: () => clock.now, checkInMs: 100_000 })).toMatchObject({ status: 0 });
    const checkIns = reports.filter((report) => report.kind === 'checkin');
    expect(checkIns.length).toBeGreaterThanOrEqual(1);
    expect(checkIns.map((report) => report.reason)).not.toContain('activity_unchanged');
    expect(checkIns[0].activity.background).toEqual({ command: 'npm run gate', elapsedSeconds: expect.any(Number) });
    expect(checkIns[0].activity.background.elapsedSeconds).toBeGreaterThan(0);
  });
});
