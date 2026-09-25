import { afterEach, describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runExecute, parseArgs, validateHandoff, VALID_STEPS } from '../sdlc-execute.mjs';
import { inspectIssueSpecScope } from '../issue-spec-scope.mjs';
import { canonicalJson } from '../../src/sdlc-steering-runtime.mjs';

const roots = [];
const env = { HERDR_ENV: '1', HERDR_SOCKET_PATH: '/tmp/herdr-test', HERDR_PANE_ID: 'controller' };
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const result = (value, status = 0) => ({ status, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' });
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function fixture({ branch = '42-example', dirty = false, existingImplementation = true, withPrEvidence = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'execute-controller-'));
  roots.push(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Controller Test');
  git(root, 'config', 'user.email', 'controller@example.test');
  fs.writeFileSync(path.join(root, 'README.md'), 'baseline\n');
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
  const runtime = path.join(root, '.omp/sdlc');
  fs.mkdirSync(runtime, { recursive: true });
  fs.writeFileSync(path.join(runtime, 'run.json'), '{stale corrupted checkpoint');
  fs.writeFileSync(path.join(runtime, 'safe-recoveries.json'), '{stale corrupted ledger');
  const state = { merged: false, closed: false, starts: [], prompts: [], closedPanes: [], owned: [], released: [], sourcePushes: 0 };
  const run = (command, args, options = {}) => {
    if (command === 'git') {
      const response = spawnSync('git', args, { cwd: options.cwd ?? root, encoding: 'utf8' });
      return { status: response.status, stdout: response.stdout, stderr: response.stderr };
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
      if (!state.merged && !state.draft) return result('', 1);
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
  let onWorker = ({ step }) => {
    if (step === 'implement') publish('fix: finish #42');
    if (step === 'verify') passGate();
    if (step === 'deliver') { state.merged = true; state.closed = true; }
    return { status: 'passed', next: { start: 'implement', implement: 'verify', verify: 'deliver', deliver: null }[step] };
  };
  const herdr = {
    integrationStatus: () => result('omp: installed\n'),
    paneLayout: (pane) => result({ id: 'cli:pane:layout', result: { type: 'pane_layout', layout: {
      area: { width: 200, height: 10 },
      panes: [{ pane_id: 'other-pane', rect: { width: 200, height: 10 } }, { pane_id: pane, rect: { width: 40, height: 120 } }],
    } } }),
    paneSplit: ({ direction, environment }) => {
      state.directions = [...(state.directions ?? []), direction];
      state.environments = [...(state.environments ?? []), environment];
      return result({ result: { pane: { pane_id: `pane-${state.owned.length + 1}` } } });
    },
    paneClose: (pane) => { state.closedPanes.push(pane); return result(''); },
    listAgents: () => result([]),
    agentStart: ({ name, paneId }) => { state.starts.push({ name, paneId }); return result(''); },
    agentPrompt: ({ name, prompt }) => {
      state.prompts.push({ name, prompt });
      if (state.prompts.length > 10) throw new Error('fixture repeated dispatch without progress');
      const step = /-([a-z]+)-[0-9a-f]{8}$/.exec(name)?.[1];
      const outcome = onWorker({ step, prompt, state, root, publish, passGate });
      if (outcome?.handoff === false) return result('');
      fs.mkdirSync(path.join(runtime, 'handoffs'), { recursive: true });
      fs.writeFileSync(path.join(runtime, 'handoffs', `42-${step}.json`), JSON.stringify({ schemaVersion: 1,
        issue: 42, step, status: outcome.status, intervention: outcome.intervention ?? false,
        summary: outcome.summary ?? `${step} complete`, artifacts: outcome.artifacts ?? [],
        next: outcome.next ?? null, reasonCode: outcome.reasonCode ?? null,
        ...(step === 'start' ? { branch: '42-example', head: git(root, 'rev-parse', 'HEAD') } : {}) }));
      return result('');
    },
    agentWait: () => result(''),
    agentGet: () => result({ agent_status: 'done' }),
  };
  return { root, state, run, herdr, publish, passGate, setWorker: (fn) => { onWorker = fn; },
    execute: (args = '', options = {}) => runExecute({ args, cwd: root, env, run, herdr,
      onOwnedPane: (pane) => state.owned.push(pane), onPaneClosed: (pane) => state.released.push(pane), ...options }) };
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('branch-first execute', () => {
  it('accepts only the four active stages and no stale recovery flag', () => {
    expect(VALID_STEPS).toEqual(['start', 'implement', 'verify', 'deliver']);
    expect(parseArgs('')).toEqual({ issues: [], defaultBacklog: true });
    expect(parseArgs('#42 --retain-worker')).toMatchObject({ issues: [42], retainWorker: true });
    expect(() => parseArgs('--recover-stale')).toThrow();
    expect(() => validateHandoff({ schemaVersion: 1, issue: 42, step: 'review1', status: 'passed',
      intervention: false, summary: '', artifacts: [], next: null, reasonCode: null })).toThrow();
  });

  it('starts verification immediately from a clean implemented feature branch despite stale checkpoint', () => {
    const f = fixture();
    const response = f.execute('');
    expect(response).toEqual({ status: 0, stdout: '#42: verify passed\n#42: deliver passed\n#42: MERGED and CLOSED\n', stderr: '' });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['verify', 'deliver']);
    expect(f.state.merged && f.state.closed).toBe(true);
    expect(f.state.closedPanes).toEqual(f.state.owned);
    expect(f.state.directions).toEqual(['down', 'down']);
    expect(f.state.released).toEqual(f.state.owned);
    expect(fs.readFileSync(path.join(f.root, '.omp/sdlc/run.json'), 'utf8')).toContain('stale corrupted');
  });

  it('forwards the outer smoke invocation to verify and deliver workers', () => {
    const f = fixture();
    const smoke = { NMG_SDLC_SMOKE_OWNED: '1', NMG_SDLC_SMOKE_RECOVERY: `${'a'.repeat(64)}.${'b'.repeat(64)}` };
    expect(f.execute('', { env: { ...env, ...smoke } })).toMatchObject({ status: 0 });
    expect(f.state.environments).toEqual([
      expect.objectContaining(smoke),
      smoke,
    ]);
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
  });

  it('recognizes an exact-head merged PR and closed issue without a label or new worker', () => {
    const f = fixture();
    f.state.merged = true;
    f.state.closed = true;
    f.state.labels = [];
    expect(f.execute('')).toEqual({ status: 0, stdout: '#42: MERGED and CLOSED\n', stderr: '' });
    expect(f.state.starts).toEqual([]);
  });

  it('starts an explicit issue from a non-issue branch, then uses its new live branch', () => {
    const f = fixture({ branch: 'main' });
    f.setWorker(({ step, root, passGate, state }) => {
      if (step === 'start') {
        git(root, 'checkout', '-b', '42-example');
        git(root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }

      throw new Error(step);
    });
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['start', 'verify', 'deliver']);
  });
  it('does not deliver when the registered required smoke result is red despite a passed verifier handoff', () => {
    const f = fixture();
    let verifications = 0;
    f.setWorker(({ step, root, publish, passGate, state }) => {
      if (step === 'verify') {
        passGate();
        if (verifications++ === 0) {
          const artifactPath = path.join(root, '.omp/sdlc/verification/42.json');
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
        publish('fix: required smoke #42');
        return { status: 'passed', next: 'verify' };
      }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('#42')).toEqual({ status: 0,
      stdout: '#42: implement passed\n#42: verify passed\n#42: deliver passed\n#42: MERGED and CLOSED\n', stderr: '' });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual([
      'verify', 'implement', 'verify', 'deliver',
    ]);
  });

  it('diagnoses a previously failed exact-source gate instead of rerunning unchanged smoke', () => {
    const f = fixture();
    f.passGate();
    const artifactPath = path.join(f.root, '.omp/sdlc/verification/42.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    artifact.results[1].effectiveStatus = 'failed';
    artifact.results[1].result.status = 'failed';
    artifact.ceiling = 'Fail';
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    const oldHandoff = path.join(f.root, '.omp/sdlc/handoffs/42-verify.json');
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
    const picker = { ...f.herdr, pickIssue: (candidates) => {
      presented = candidates;
      return 42;
    } };
    f.setWorker(({ step, root, passGate, state }) => {
      if (step === 'start') {
        git(root, 'checkout', '-b', '42-example');
        git(root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('', { herdr: picker })).toMatchObject({ status: 0 });
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

  it('proves an already vanished owned pane absent before reconciling its push', () => {
    const f = fixture({ dirty: true });
    let first = true;
    const herdr = { ...f.herdr,
      paneClose: (pane) => {
        if (first) { first = false; return result('', 1); }
        return f.herdr.paneClose(pane);
      },
      listPanes: () => result([]),
    };
    f.setWorker(({ step, publish, passGate, state }) => {
      if (step === 'implement') {
        publish('fix: pane vanished after publication #42');
        return { handoff: false };
      }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    expect(f.execute('#42', { herdr })).toMatchObject({ status: 0 });
    expect(f.state.released).toEqual(f.state.owned);
    expect(f.state.closedPanes).toHaveLength(2);
    expect(f.state.sourcePushes).toBe(1);
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
    expect(f.state.prompts[2].prompt).toContain('gate-1.json');
    expect(f.state.prompts[4].prompt).toContain('gate-2.json');
    expect(fs.readFileSync(path.join(f.root, 'helper.py'), 'utf8')).toContain('preserved partial change');
  });

  it('rejects explicit different issue on active branch without starting a pane', () => {
    const f = fixture({ dirty: true });
    expect(f.execute('#43')).toMatchObject({ status: 1, stderr: expect.stringContaining('active_issue_conflict') });
    expect(f.state.starts).toEqual([]);
  });

  it('preserves a foreign live worker and refuses a competing dispatch', () => {
    const f = fixture();
    const herdr = { ...f.herdr,
      listAgents: () => result([{ name: 's42-verify-foreign', pane_id: 'foreign', agent_status: 'working' }]),
      agentGet: () => result({ agent_status: 'working' }),
    };
    expect(f.execute('#42', { herdr })).toMatchObject({
      status: 1, stderr: expect.stringContaining('foreign_worker_live'),
    });
    expect(f.state.starts).toEqual([]);
    expect(f.state.closedPanes).toEqual([]);
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
    expect(f.state.closedPanes).toEqual(f.state.owned);
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
    expect(f.execute('')).toMatchObject({ status: 0 });
    expect(deliveryCalls).toBe(1);
  });
});
