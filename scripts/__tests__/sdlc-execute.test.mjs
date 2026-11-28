import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, validateHandoff, VALID_STEPS } from '../sdlc-execute.mjs';
import { packageRoot } from '../../src/sdlc-workflows.mjs';
import { inspectIssueSpecScope, specStatusOnRef } from '../issue-spec-scope.mjs';
import { recordInFlight } from '../sdlc-shared-state.mjs';
import { env, git, result, fixture, phasedWorker, issueDeliveryRun, closingRef, closedIssue, mergedPr } from '../__fixtures__/sdlc-execute-fixture.mjs';

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

  it('prepares the version at the queue head, after the review and before the gate, and delivers the version commit', () => {
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
    f.setWorker(phasedWorker(({ step, phase }) => heads.push({ step, phase, head: git(f.root, 'rev-parse', 'HEAD'),
      preparations: f.state.versionPreparations.length })));
    expect(f.execute('#42')).toMatchObject({ status: 0, stdout: expect.stringContaining('#42: review passed\n#42: verify passed') });
    expect(heads.map(({ step, phase }) => phase ?? step)).toEqual(['review', 'gate', 'deliver']);
    // The review ran before any version was claimed; the gate and delivery saw the version commit.
    expect(heads[0].preparations).toBe(0);
    expect(git(f.root, 'log', '-1', '--format=%s', heads[0].head)).not.toBe('feat: deliver issue #42');
    expect(git(f.root, 'log', '-1', '--format=%s', heads[1].head)).toBe('feat: deliver issue #42');
    expect(f.state.versionPreparations[0].args).toEqual([
      path.join(packageRoot, 'scripts', 'sdlc-deliver.mjs'), 'prepare-version', '--issue', '42',
      '--controller-run-id', expect.any(String),
    ]);
    // Every later preparation found the version synchronized and made no second commit.
    expect(f.state.versionPreparations.length).toBeGreaterThan(1);
    expect(git(f.root, 'log', '--format=%s', '--grep=deliver issue #42').split('\n')).toHaveLength(1);
  });

  it('prepares the version although a merged spec PR shares the issue branch name', () => {
    const f = fixture();
    f.state.specPr = true;
    const heads = [];
    f.setPrepareVersion(({ root, publish, state }) => {
      if (state.versionPreparations.length > 1) return null;
      fs.writeFileSync(path.join(root, 'VERSION'), '1.1.0\n');
      publish('feat: deliver issue #42');
      return null;
    });
    f.setWorker(phasedWorker(({ phase }) => heads.push({ phase, head: git(f.root, 'rev-parse', 'HEAD') })));
    expect(f.execute('#42')).toMatchObject({ status: 0 });
    expect(heads.map(({ phase }) => phase)).toEqual(['review', 'gate', null]);
    expect(git(f.root, 'log', '-1', '--format=%s', heads[1].head)).toBe('feat: deliver issue #42');
  });

  it('stops with the preparation reason after the review, starting no gate, when the version cannot be prepared', () => {
    const f = fixture();
    f.setWorker(phasedWorker());
    f.setPrepareVersion(({ root }) => {
      fs.mkdirSync(path.join(root, '.nmg-sdlc/handoffs'), { recursive: true });
      fs.writeFileSync(path.join(root, '.nmg-sdlc/handoffs/42-deliver.json'), JSON.stringify({ reasonCode: 'major_bump_required' }));
      return { status: 1, stdout: 'NMG_SDLC_HANDOFF: .nmg-sdlc/handoffs/42-deliver.json\n', stderr: '' };
    });
    expect(f.execute('#42')).toMatchObject({
      status: 1, stderr: expect.stringContaining('version_preparation_failed: major_bump_required'),
    });
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['verify']);
    expect(f.state.prompts[0].prompt).toContain('Verify phase: review');
  });

  it('prints the version_artifact_missing reason with the deliver handoff summary and starts no gate', () => {
    const f = fixture();
    f.setWorker(phasedWorker());
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
    expect(f.state.starts.map((entry) => entry.name.split('-')[1])).toEqual(['verify']);
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
    expect(f.state.starts.map((entry) => entry.effort)).toEqual([null, 'xhigh', 'medium', 'xhigh']);
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
  it('finds the approved spec on the fetched remote default branch when the checkout lacks it and cannot fast-forward (#556 AC1)', () => {
    const f = fixture({ branch: 'main' });
    // The primary checkout is on another branch without the spec, so it is neither holding nor able to fast-forward to it.
    git(f.root, 'checkout', '-q', '-b', 'elsewhere');
    git(f.root, 'rm', '-r', '-q', 'specs');
    git(f.root, 'commit', '-q', '-m', 'chore: work without the spec');
    f.setWorker(({ step, root, publish, passGate, state }) => {
      if (step === 'start') {
        git(root, 'checkout', '-q', '-b', '42-example', 'origin/main');
        git(root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (step === 'implement') { publish('fix: implement #42 on its new branch'); return { status: 'passed', next: 'verify' }; }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    const response = f.execute('#42');
    expect(response.stderr).not.toContain('approved_spec_missing');
    expect(response).toMatchObject({ status: 0 });
    expect(f.state.starts[0].step).toBe('start');
  });
  it('still fails approved_spec_missing when the remote default branch lacks the spec too (#556 AC1)', () => {
    const f = fixture({ branch: 'main' });
    git(f.root, 'checkout', '-q', '-b', 'elsewhere');
    git(f.root, 'rm', '-r', '-q', 'specs');
    git(f.root, 'commit', '-q', '-m', 'chore: drop the spec');
    git(f.root, 'push', '-q', '-f', 'origin', 'elsewhere:main');
    const response = f.execute('#42');
    expect(response).toMatchObject({ status: 1 });
    expect(response.stderr).toContain('approved_spec_missing: #42');
    expect(f.state.starts).toEqual([]);
  });
  it('fetches a spec merged after the checkout last fetched, and reads its declared files from that ref (#556 AC1)', () => {
    const f = fixture({ branch: 'main' });
    // The checkout's remote-tracking ref predates the spec, and the checkout itself is on a branch without it.
    git(f.root, 'update-ref', 'refs/remotes/origin/main', 'HEAD~1');
    git(f.root, 'checkout', '-q', '-b', 'elsewhere', 'HEAD~1');
    recordInFlight(f.root, { issue: 7, branch: '7-other', worktree: f.root, stage: 'implement', declaredFiles: ['helper.py'] }, { env });
    f.setWorker(({ step, root, publish, passGate, state }) => {
      if (step === 'start') {
        git(root, 'checkout', '-q', '-b', '42-example', 'origin/main');
        git(root, 'push', '-u', 'origin', '42-example');
        return { status: 'passed', next: 'implement' };
      }
      if (step === 'implement') { publish('fix: implement #42 on its new branch'); return { status: 'passed', next: 'verify' }; }
      if (step === 'verify') { passGate(); return { status: 'passed', next: 'deliver' }; }
      if (step === 'deliver') { state.merged = true; state.closed = true; return { status: 'passed', next: null }; }
      throw new Error(step);
    });
    const response = f.execute('#42');
    expect(response).toMatchObject({ status: 0 });
    expect(f.state.starts[0].step).toBe('start');
    expect(response.stdout).toContain('#42: overlaps in-flight #7 (7-other) on helper.py\n');
  });
  it('names an ambiguous spec on the remote default branch when the checkout has none (#556 AC1)', () => {
    const f = fixture({ branch: 'main' });
    fs.cpSync(path.join(f.root, 'specs/42-example'), path.join(f.root, 'specs/42-duplicate'), { recursive: true });
    git(f.root, 'add', 'specs');
    git(f.root, 'commit', '-q', '-m', 'docs: a second spec for #42');
    git(f.root, 'push', '-q', 'origin', 'main');
    git(f.root, 'checkout', '-q', '-b', 'elsewhere');
    git(f.root, 'rm', '-r', '-q', 'specs');
    git(f.root, 'commit', '-q', '-m', 'chore: work without the spec');
    const response = f.execute('#42');
    expect(response).toMatchObject({ status: 1 });
    expect(response.stderr).toContain('approved_spec_missing: #42 (spec_status_ambiguous)');
    expect(f.state.starts).toEqual([]);
  });
  it('reports a remote default branch without a specs directory as an absent spec, not an unreadable one (#560 AC4)', () => {
    const f = fixture({ branch: 'main' });
    git(f.root, 'checkout', '-q', '-b', 'elsewhere');
    git(f.root, 'rm', '-r', '-q', 'specs');
    git(f.root, 'commit', '-q', '-m', 'chore: drop the specs directory');
    git(f.root, 'push', '-q', '-f', 'origin', 'elsewhere:main');
    const response = f.execute('#42');
    expect(response).toMatchObject({ status: 1 });
    expect(response.stderr).toContain('approved_spec_missing: #42');
    expect(response.stderr).not.toContain('spec_status_unreadable');
    expect(f.state.starts).toEqual([]);
  });
  it('reports an unreadable ref as spec_status_unreadable and a readable ref without specs as absent (#560 AC4)', () => {
    const f = fixture({ branch: 'main' });
    expect(specStatusOnRef(42, f.root, 'refs/remotes/origin/no-such')).toEqual({ dir: null, approved: false, reasonCode: 'spec_status_unreadable' });
    git(f.root, 'checkout', '-q', '-b', 'elsewhere');
    git(f.root, 'rm', '-r', '-q', 'specs');
    git(f.root, 'commit', '-q', '-m', 'chore: drop the specs directory');
    expect(specStatusOnRef(42, f.root, 'HEAD')).toEqual({ dir: null, approved: false });
  });
  it('keeps approved_spec_missing when the remote default branch cannot be fetched (#556 AC1)', () => {
    const f = fixture({ branch: 'main' });
    git(f.root, 'checkout', '-q', '-b', 'elsewhere');
    git(f.root, 'rm', '-r', '-q', 'specs');
    git(f.root, 'commit', '-q', '-m', 'chore: work without the spec');
    // The stale remote-tracking ref still holds the spec, but it is read only after a fetch that succeeded.
    git(f.root, 'remote', 'set-url', 'origin', path.join(f.root, 'no-such-remote'));
    const response = f.execute('#42');
    expect(response).toMatchObject({ status: 1 });
    expect(response.stderr).toContain('approved_spec_missing: #42');
    expect(f.state.starts).toEqual([]);
  });
  it('keeps spec-created label admission for an open off-branch issue', () => {
    const f = fixture({ branch: 'main' });
    f.state.labels = [];
    const run = issueDeliveryRun(f, { issues: { 42: { number: 42, state: 'OPEN', closedByPullRequestsReferences: [] } } });
    expect(f.execute('#42', { run })).toEqual({ status: 1, stdout: '', stderr: '#42 has no spec-created label\n' });
    expect(f.state.starts).toEqual([]);
  });

  it('keeps a dirty delivered issue branch as it is and moves to the next issue without a conflict', () => {
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
    // The next issue runs in its own worktree, so the kept branch is no conflict; the fixture knows no issue #43.
    const response = f.execute('#42 #43');
    expect(response).toMatchObject({ status: 1, stderr: 'delivery_evidence_unavailable: #43\n' });
    expect(response.stderr).not.toContain('active_issue_conflict');
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
      'xhigh', 'medium', null, 'medium', null, 'medium', 'xhigh',
    ]);
    expect(f.state.prompts[2].prompt).toContain('gate-1.json');
    expect(f.state.prompts[4].prompt).toContain('gate-2.json');
    expect(fs.readFileSync(path.join(f.root, 'helper.py'), 'utf8')).toContain('preserved partial change');
  });

  it('leaves another issue\'s dirty branch untouched when a different issue is selected', () => {
    const f = fixture({ dirty: true });
    const before = git(f.root, 'status', '--porcelain');
    // No conflict: the selected issue would get its own worktree. The fixture knows no issue #43, so nothing starts.
    expect(f.execute('#43')).toEqual({ status: 1, stdout: '', stderr: 'delivery_evidence_unavailable: #43\n' });
    expect(f.state.starts).toEqual([]);
    expect(git(f.root, 'branch', '--show-current')).toBe('42-example');
    expect(git(f.root, 'status', '--porcelain')).toBe(before);
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
