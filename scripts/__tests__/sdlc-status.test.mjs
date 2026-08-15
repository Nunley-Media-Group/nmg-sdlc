import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectEvidence,
  inferLifecycle,
  renderJson,
  renderText,
  runCli,
} from '../sdlc-status.mjs';
import {
  inspectIssueSpecScope,
  ISSUE_SPEC_MARKDOWN_LIMIT_BYTES,
} from '../issue-spec-scope.mjs';

const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
const SCOPE_MARKER = '<!-- nmg-sdlc-issue-scope: {"issueNumber":42,"specPath":"specs/feature-status-fixture","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1"],"functionalRequirements":["FR1"],"tasks":["T001"],"scenarios":["SCN001"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->';
const PENDING_MARKER = '<!-- nmg-sdlc-pr-readiness: {"schemaVersion":1,"state":"pr_evidence_pending","issueNumber":42,"specPath":"specs/feature-status-fixture","local":{"acceptanceCriteria":["AC1"],"functionalRequirements":["FR1"],"tasks":["T001"],"scenarios":["SCN001"],"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]},"tests":"pass","steeringGates":"pass"},"pendingEvidence":[{"kind":"required_check","name":"contract-tests","event":"pull_request","acceptanceCriteria":["AC1"]}]} -->';
const scriptsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function baseEvidence(overrides = {}) {
  const evidence = {
    project: {
      root: '/project',
      branch: 'main',
      dirty: false,
      changedPaths: [],
      implementationPaths: [],
      baseRelativeCommits: [],
    },
    issue: null,
    spec: null,
    verification: null,
    pullRequest: null,
    gaps: [],
  };
  return {
    ...evidence,
    ...overrides,
    project: { ...evidence.project, ...overrides.project },
  };
}

function localRun(command, args, options = {}) {
  if (command === 'gh') {
    return { ok: false, status: 1, stdout: '', stderr: 'GitHub unavailable in fixture' };
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.error?.message ?? result.stderr ?? '',
  };
}

function localRunWithHydratedIssue(command, args, options = {}) {
  if (command === 'gh' && args[0] === 'issue' && args[1] === 'view') {
    return {
      ok: true,
      status: 0,
      stdout: JSON.stringify({
        number: Number(args[2]),
        title: 'Status fixture',
        state: 'OPEN',
        body: '',
        labels: [],
      }),
      stderr: '',
    };
  }
  return localRun(command, args, options);
}

function makeRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Status Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'status@example.test'], { cwd: root });
  fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'chore: initialize fixture'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['checkout', '-b', '42-status-fixture'], { cwd: root, stdio: 'ignore' });

  const specDir = path.join(root, 'specs', 'feature-status-fixture');
  fs.mkdirSync(specDir, { recursive: true });
  const specContents = {
    'requirements.md': '# Requirements\n\n**Issues**: #42\n\n### AC1: Status\n\n| ID | Requirement | Priority |\n|---|---|---|\n| FR1 | Report status | Must |\n',
    'design.md': '# Design\n\n**Issues**: #42\n',
    'tasks.md': '# Tasks\n\n**Issues**: #42\n\n### T001: Implement status\n',
    'feature.gherkin': '@SCN001\nScenario: Report status\n',
  };
  for (const filename of REQUIRED_SPEC_FILES) {
    const content = specContents[filename];
    fs.writeFileSync(path.join(specDir, filename), content);
  }
  return root;
}

function worktreeSnapshot(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else {
        const relative = path.relative(root, absolute);
        const hash = createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
        files.push(`${relative}:${hash}`);
      }
    }
  }
  visit(root);
  return {
    files: files.sort(),
    refs: execFileSync('git', ['show-ref'], { cwd: root, encoding: 'utf8' }),
    status: execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
    }),
  };
}

describe('lifecycle inference', () => {
  test.each([
    ['idle', baseEvidence(), '$nmg-sdlc:start-issue'],
    ['started', baseEvidence({
      project: { branch: '42-feature' },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
    }), '$nmg-sdlc:write-spec #42'],
    ['specified', baseEvidence({
      project: { branch: '42-feature' },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
    }), '$nmg-sdlc:write-code #42'],
    ['implemented', baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
    }), '$nmg-sdlc:verify-code #42'],
    ['verified', baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
      verification: { path: 'specs/feature/verification-report.md', status: 'pass', current: true },
    }), '$nmg-sdlc:open-pr #42'],
    ['delivery-validation-pending', baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
      verification: {
        path: 'specs/feature/verification-report.md',
        status: 'pr_evidence_pending',
        readinessStatus: 'pr_evidence_pending',
        current: true,
      },
    }), '$nmg-sdlc:open-pr #42'],
    ['pull-request-open', baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      pullRequest: { number: 50, state: 'OPEN', url: null, checks: 'passing' },
    }), '$nmg-sdlc:address-pr-comments #42'],
    ['complete', baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'CLOSED', source: 'branch' },
      pullRequest: { number: 50, state: 'MERGED', url: null, checks: 'passing' },
    }), '$nmg-sdlc:start-issue'],
    ['unknown', baseEvidence({ project: { branch: 'feature/no-issue' } }), 'Manual repair'],
  ])('infers %s from the strongest consistent evidence', (stage, evidence, command) => {
    const status = inferLifecycle(evidence);
    expect(status.stage).toBe(stage);
    expect(status.nextAction.command).toContain(command);
  });

  test.each([
    ['failing', true, 'Manual repair'],
    ['pending', false, '$nmg-sdlc:address-pr-comments #42'],
    ['absent', false, '$nmg-sdlc:address-pr-comments #42'],
  ])('handles %s pull-request checks conservatively', (checks, manualRepair, command) => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: null, state: 'OPEN', source: 'branch' },
      pullRequest: { number: 50, state: 'OPEN', url: null, checks },
    }));
    expect(status.stage).toBe('pull-request-open');
    expect(status.nextAction.manualRepairRequired).toBe(manualRepair);
    expect(status.nextAction.command).toContain(command);
  });

  it('fails closed when pending verification is exposed by a ready pull request', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: null, state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
      verification: {
        path: 'specs/feature/verification-report.md',
        status: 'pr_evidence_pending',
        readinessStatus: 'pr_evidence_pending',
        current: true,
      },
      pullRequest: {
        number: 50,
        state: 'OPEN',
        isDraft: false,
        headRefOid: 'a'.repeat(40),
        mergeStateStatus: 'BLOCKED',
        checks: 'pending',
      },
    }));
    expect(status).toMatchObject({
      stage: 'unknown',
      nextAction: { manualRepairRequired: true },
    });
    expect(status.gaps).toContain('ready pull request conflicts with pending PR-dependent verification');
  });

  it('fails closed when draft state is unavailable for pending PR-dependent verification', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: null, state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
      verification: {
        path: 'specs/feature/verification-report.md',
        status: 'pr_evidence_pending',
        readinessStatus: 'pr_evidence_pending',
        current: true,
      },
      pullRequest: {
        number: 50,
        state: 'OPEN',
        isDraft: null,
        headRefOid: 'a'.repeat(40),
        mergeStateStatus: 'UNKNOWN',
        checks: 'pending',
      },
    }));
    expect(status).toMatchObject({
      stage: 'unknown',
      nextAction: {
        command: 'Manual repair: restore controlled draft validation on PR #50',
        manualRepairRequired: true,
      },
    });
    expect(status.gaps).toContain('pull-request draft state is unavailable for pending PR-dependent verification');
  });

  it('stops at the last consistent boundary when verification conflicts', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-feature' },
      issue: { number: 42, title: null, state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
      verification: { path: 'specs/feature/verification-report.md', status: 'pass', current: true },
    }));
    expect(status.stage).toBe('specified');
    expect(status.gaps).toContain('passing verification conflicts with absent implementation paths');
  });

  it('routes invalid cumulative scope to write-spec before later lifecycle evidence', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      spec: {
        path: 'specs/feature',
        complete: true,
        missingFiles: [],
        scope: {
          status: 'repair_required',
          reasonCode: 'cumulative_manifest_missing',
          gaps: ['specs/feature/issue-scope.json is required for a multi-issue spec'],
        },
      },
      verification: { path: 'specs/feature/verification-report.md', status: 'pass', current: true },
      pullRequest: { number: 50, state: 'OPEN', url: null, checks: 'passing' },
    }));

    expect(status.stage).toBe('started');
    expect(status.nextAction.command).toBe('$nmg-sdlc:write-spec #42');
    expect(status.completedArtifacts).not.toContain('spec package');
    expect(status.missingArtifacts).toContain('issue scope repair');
    expect(status.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('issue scope repair_required'),
    ]));
  });

  it('stops lifecycle progression for blocked and repair-required deliverables', () => {
    const blocked = inferLifecycle(baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: {
        number: 42,
        title: 'Feature',
        state: 'OPEN',
        source: 'branch',
        deliverableDependencies: {
          status: 'blocked',
          reasonCode: 'deliverable_not_merged',
          requirements: [{ ownerIssue: 10, available: false }],
          gaps: ['deliverable owner #10 has no merged closing pull request to main'],
        },
      },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
    }));
    expect(blocked).toMatchObject({
      stage: 'blocked',
      nextAction: { command: '$nmg-sdlc:status', manualRepairRequired: false },
    });
    expect(renderText(blocked)).toContain('Deliverables: blocked (#10:unavailable)');

    const repair = inferLifecycle(baseEvidence({
      project: { branch: '42-feature' },
      issue: {
        number: 42,
        title: 'Feature',
        state: 'OPEN',
        source: 'branch',
        deliverableDependencies: {
          status: 'repair_required',
          reasonCode: 'deliverable_execution_edge_missing',
          requirements: [{ ownerIssue: 10, available: false }],
          gaps: ['deliverable owner #10 lacks a whole-issue execution dependency'],
        },
      },
    }));
    expect(repair).toMatchObject({
      stage: 'blocked',
      nextAction: { command: '$nmg-sdlc:upgrade-project' },
    });
  });

  test.each([
    ['closed issue', { issue: { number: 42, title: null, state: 'CLOSED', source: 'branch' } }],
    ['closed unmerged pull request', { pullRequest: { number: 50, state: 'CLOSED', url: null, checks: 'absent' } }],
  ])('requires manual repair for %s evidence', (_name, override) => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: null, state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
      verification: { path: 'specs/feature/verification-report.md', status: 'pass', current: true },
      ...override,
    }));
    expect(status.stage).toBe('unknown');
    expect(status.nextAction).toMatchObject({ manualRepairRequired: true });
    expect(status.nextAction.command).toContain('Manual repair');
  });

});

describe('bounded evidence collection and read-only safety', () => {
  let root;

  beforeEach(() => {
    root = makeRepository();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('collects a complete matching spec and blocks when active-issue GitHub evidence is unavailable', () => {
    const evidence = collectEvidence(root, { run: localRun });
    expect(evidence.project.branch).toBe('42-status-fixture');
    expect(evidence.project.dirty).toBe(true);
    expect(evidence.project.baseRelativeCommits).toEqual([]);
    expect(evidence.spec).toMatchObject({ complete: true, missingFiles: [] });
    expect(evidence.spec.scope).toMatchObject({
      status: 'implicit_single_issue',
      issueNumber: 42,
      delivery: {
        acceptanceCriteria: ['AC1'],
        functionalRequirements: ['FR1'],
        tasks: ['T001'],
        scenarios: ['SCN001'],
      },
    });
    expect(evidence.project.implementationPaths).toEqual([]);
    expect(evidence.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('GitHub issue unavailable'),
      expect.stringContaining('GitHub pull request unavailable'),
    ]));
    expect(evidence.issue.deliverableDependencies).toMatchObject({
      status: 'unverifiable',
      reasonCode: 'deliverable_evidence_unavailable',
      issueNumber: 42,
      requirements: [],
    });
    expect(inferLifecycle(evidence)).toMatchObject({
      stage: 'blocked',
      nextAction: {
        command: '$nmg-sdlc:status',
        manualRepairRequired: true,
      },
    });
  });

  it('exposes the cumulative fixture active slice in JSON and text evidence', () => {
    fs.rmSync(path.join(root, 'specs'), { recursive: true, force: true });
    fs.cpSync(
      path.join(scriptsRoot, '__fixtures__', 'cumulative-issue-scope', 'specs'),
      path.join(root, 'specs'),
      { recursive: true },
    );
    execFileSync('git', ['branch', '-m', '20-cumulative-scope'], { cwd: root });

    const evidence = collectEvidence(root, { run: localRunWithHydratedIssue });
    expect(evidence.spec.scope).toMatchObject({
      status: 'scoped',
      issueNumber: 20,
      delivery: {
        acceptanceCriteria: ['AC1', 'AC2'],
        functionalRequirements: ['FR1', 'FR2'],
        tasks: ['T002', 'T003'],
        scenarios: ['SCN002', 'SCN003'],
      },
      regression: {
        acceptanceCriteria: ['AC4'],
        functionalRequirements: ['FR4'],
        scenarios: ['SCN005'],
      },
    });
    const status = inferLifecycle(evidence);
    expect(status.stage).toBe('specified');
    expect(renderText(status)).toContain('Scope: scoped (delivery: AC AC1, AC2');
  });

  it('reads the complete resolver-valid cumulative scope and preserves the resolver size limit', () => {
    fs.rmSync(path.join(root, 'specs'), { recursive: true, force: true });
    fs.cpSync(
      path.join(scriptsRoot, '__fixtures__', 'cumulative-issue-scope', 'specs'),
      path.join(root, 'specs'),
      { recursive: true },
    );
    execFileSync('git', ['branch', '-m', '20-cumulative-scope'], { cwd: root });

    const specPath = 'specs/feature-cumulative-scope';
    const specDir = path.join(root, specPath);
    const tasksPath = path.join(specDir, 'tasks.md');
    const manifestPath = path.join(specDir, 'issue-scope.json');
    fs.appendFileSync(
      tasksPath,
      `\n${'x'.repeat(70 * 1024)}\n\n### T005: Active Task After The Aggregate Default Bound\n`,
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.issues['20'].owned.tasks.push('T005');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    expect(ISSUE_SPEC_MARKDOWN_LIMIT_BYTES).toBe(256 * 1024);
    expect(fs.statSync(tasksPath).size).toBeGreaterThan(64 * 1024);
    expect(fs.statSync(tasksPath).size).toBeLessThanOrEqual(ISSUE_SPEC_MARKDOWN_LIMIT_BYTES);
    const direct = inspectIssueSpecScope({ projectRoot: root, specPath, issueNumber: 20 });
    expect(direct).toMatchObject({
      status: 'scoped',
      reasonCode: 'active_issue_scope_resolved',
      gaps: [],
    });
    expect(direct.inventory.tasks).toContain('T005');
    expect(direct.delivery.tasks).toContain('T005');

    const aggregate = collectEvidence(root, { run: localRunWithHydratedIssue });
    expect(aggregate.spec.scope).toEqual(direct);
    expect(inferLifecycle(aggregate)).toMatchObject({
      stage: 'specified',
      nextAction: { command: '$nmg-sdlc:write-code #20' },
    });

    fs.writeFileSync(tasksPath, 'x'.repeat(ISSUE_SPEC_MARKDOWN_LIMIT_BYTES + 1));
    const oversized = collectEvidence(root, { run: localRunWithHydratedIssue });
    expect(oversized.spec.scope).toMatchObject({
      status: 'unverifiable',
      reasonCode: 'spec_read_failed',
      gaps: [expect.stringContaining(
        `exceeds the ${ISSUE_SPEC_MARKDOWN_LIMIT_BYTES}-byte inspection limit`,
      )],
    });
  });

  it('trusts a passing verification report only while its committed implementation snapshot is current', () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
    fs.writeFileSync(
      path.join(root, 'specs', 'feature-status-fixture', 'verification-report.md'),
      `# Verification Report\n\n**Implementation Status**: Pass\n\n${SCOPE_MARKER}\n`,
    );
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'feat: add verified fixture'], {
      cwd: root,
      stdio: 'ignore',
    });

    const current = collectEvidence(root, { run: localRunWithHydratedIssue });
    expect(current.verification).toMatchObject({
      status: 'pass',
      current: true,
      commit: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
    expect(inferLifecycle(current).stage).toBe('verified');

    fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n\nDocumentation update.\n');
    execFileSync('git', ['add', 'README.md'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'docs: update fixture'], {
      cwd: root,
      stdio: 'ignore',
    });

    const afterDocumentation = collectEvidence(root, { run: localRunWithHydratedIssue });
    expect(afterDocumentation.verification).toMatchObject({ status: 'pass', current: true });

    fs.writeFileSync(path.join(root, 'src', 'index.js'), 'export const value = 2;\n');

    const stale = collectEvidence(root, { run: localRunWithHydratedIssue });
    expect(stale.verification).toMatchObject({
      status: 'pass',
      current: false,
      commit: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
    expect(stale.gaps).toContain('verification report predates implementation changes: src/index.js');
    expect(inferLifecycle(stale).stage).toBe('implemented');
    expect(renderText(inferLifecycle(stale))).toContain('Verification: pass, not current');
  });

  it('reports committed qualified pending evidence as local verification complete', () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
    fs.writeFileSync(
      path.join(root, 'specs', 'feature-status-fixture', 'verification-report.md'),
      `# Verification Report\n\n**Implementation Status**: PR Evidence Pending\n\n${SCOPE_MARKER}\n${PENDING_MARKER}\n`,
    );
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'feat: add pending verification fixture'], {
      cwd: root,
      stdio: 'ignore',
    });

    const evidence = collectEvidence(root, { run: localRunWithHydratedIssue });
    expect(evidence.verification).toMatchObject({
      status: 'pr_evidence_pending',
      readinessStatus: 'pr_evidence_pending',
      current: true,
      scopeMatch: true,
    });
    const status = inferLifecycle(evidence);
    expect(status).toMatchObject({
      stage: 'delivery-validation-pending',
      completedArtifacts: expect.arrayContaining(['local verification']),
      missingArtifacts: expect.arrayContaining(['PR evidence']),
      nextAction: { command: '$nmg-sdlc:open-pr #42', manualRepairRequired: false },
    });
    expect(status.completedArtifacts).not.toContain('verification');
    expect(renderText(status)).toContain('SDLC status: delivery-validation-pending');
  });

  it('does not trust an uncommitted passing verification report', () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
    fs.writeFileSync(
      path.join(root, 'specs', 'feature-status-fixture', 'verification-report.md'),
      `# Verification Report\n\n**Implementation Status**: Pass\n\n${SCOPE_MARKER}\n`,
    );

    const evidence = collectEvidence(root, { run: localRunWithHydratedIssue });
    expect(evidence.verification).toMatchObject({ status: 'pass', current: false, commit: null });
    expect(evidence.gaps).toContain('verification report is not committed; freshness cannot be proven');
    expect(inferLifecycle(evidence).stage).toBe('implemented');
  });

  it('does not let another issue verification marker advance the active issue', () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
    const otherIssueMarker = SCOPE_MARKER.replace('"issueNumber":42', '"issueNumber":10');
    fs.writeFileSync(
      path.join(root, 'specs', 'feature-status-fixture', 'verification-report.md'),
      `# Verification Report\n\n**Implementation Status**: Pass\n\n${otherIssueMarker}\n`,
    );
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'feat: add mismatched verification fixture'], {
      cwd: root,
      stdio: 'ignore',
    });

    const evidence = collectEvidence(root, { run: localRunWithHydratedIssue });
    expect(evidence.verification).toMatchObject({ status: 'pass', current: false, scopeMatch: false });
    expect(evidence.gaps).toContain('verification report issue scope does not match the active issue');
    expect(inferLifecycle(evidence).stage).toBe('implemented');
  });

  it('recovers the issue and strict spec match from a pull-request-linked branch', () => {
    execFileSync('git', ['branch', '-m', 'feature/status-fixture'], { cwd: root });
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr' && args[1] === 'list') {
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify([{
            number: 50,
            state: 'OPEN',
            url: 'https://example.test/pull/50',
            headRefName: 'feature/status-fixture',
            headRefOid: 'a'.repeat(40),
            isDraft: true,
            mergeStateStatus: 'BLOCKED',
            closingIssuesReferences: [{ number: 42, title: 'Status fixture', state: 'OPEN' }],
          }]),
          stderr: '',
        };
      }
      if (args[0] === 'pr' && args[1] === 'checks') {
        return { ok: true, status: 0, stdout: '[]', stderr: '' };
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify({ number: 42, title: 'Status fixture', state: 'OPEN' }),
          stderr: '',
        };
      }
      throw new Error(`unexpected GitHub command: ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(evidence.issue).toMatchObject({ number: 42, source: 'pullRequest' });
    expect(evidence.spec).toMatchObject({ complete: true, missingFiles: [] });
    expect(evidence.pullRequest).toMatchObject({
      number: 50,
      state: 'OPEN',
      isDraft: true,
      headRefOid: 'a'.repeat(40),
      mergeStateStatus: 'BLOCKED',
      checks: 'absent',
    });
    expect(inferLifecycle(evidence).stage).toBe('pull-request-open');
  });

  it('emits nullable coordination and unverifiable deliverables when active issue lookup fails', () => {
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr') return { ok: true, status: 0, stdout: '[]', stderr: '' };
      if (args[0] === 'issue') return { ok: false, status: 1, stdout: '', stderr: 'offline' };
      throw new Error(`unexpected GitHub command: ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(evidence.issue).toMatchObject({ number: 42, coordination: null });
    expect(JSON.parse(JSON.stringify(evidence.issue))).toHaveProperty('coordination', null);
    expect(evidence.issue.deliverableDependencies).toMatchObject({
      status: 'unverifiable',
      reasonCode: 'deliverable_evidence_unavailable',
      issueNumber: 42,
    });
    expect(inferLifecycle(evidence)).toMatchObject({
      stage: 'blocked',
      nextAction: {
        command: '$nmg-sdlc:status',
        manualRepairRequired: true,
      },
    });
    expect(evidence.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('GitHub issue unavailable'),
    ]));
  });

  it('reports the active issue durable coordination identity from fresh GitHub evidence', () => {
    const parent = {
      number: 10,
      state: 'OPEN',
      body: '## Child Issues\n\n- [ ] #42\n- [ ] #43',
      labels: { nodes: [{ name: 'epic' }] },
      subIssues: { nodes: [{ number: 42, state: 'OPEN' }, { number: 43, state: 'OPEN' }] },
    };
    const active = {
      number: 42,
      title: 'Status fixture',
      state: 'OPEN',
      body: 'Depends on: #10',
      labels: { nodes: [{ name: 'epic-child-of-10' }] },
      parent,
      subIssues: { nodes: [] },
    };
    const issueViewActive = {
      number: 42,
      title: 'Status fixture',
      state: 'OPEN',
      body: 'Depends on: #10',
      labels: [{ name: 'epic-child-of-10' }],
    };
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr' && args[1] === 'list') {
        return { ok: true, status: 0, stdout: '[]', stderr: '' };
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        return { ok: true, status: 0, stdout: JSON.stringify(issueViewActive), stderr: '' };
      }
      if (args[0] === 'repo' && args[1] === 'view') {
        return { ok: true, status: 0, stdout: JSON.stringify({ nameWithOwner: 'example/project' }), stderr: '' };
      }
      if (args[0] === 'api' && args[1] === 'graphql') {
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify({ data: { repository: { active, target10: parent } } }),
          stderr: '',
        };
      }
      throw new Error(`unexpected GitHub command: ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(evidence.issue.coordination).toMatchObject({
      role: 'epic-child',
      identity: 'durable',
      consistency: 'consistent',
      nativeAuthority: 'native',
      degraded: false,
      parentNumber: 10,
      siblingNumbers: [43],
    });
    const status = inferLifecycle(evidence);
    expect(status.stage).toBe('specified');
    expect(renderText(status)).toContain('Coordination: epic-child (durable; consistency: consistent; authority: native; degraded: no) parent #10');
  });

  it('hydrates merged default-branch evidence for a structured deliverable requirement', () => {
    const active = {
      number: 42,
      title: 'Status fixture',
      state: 'OPEN',
      body: '- Requires deliverable from #122: schema baseline\n\nDepends on: #122',
      labels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      parent: null,
      subIssues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    };
    const relationshipTarget = {
      number: 122,
      state: 'CLOSED',
      body: '',
      labels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      subIssues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    };
    const deliverableTarget = {
      number: 122,
      state: 'CLOSED',
      closedByPullRequestsReferences: {
        nodes: [{
          number: 200,
          state: 'MERGED',
          mergedAt: '2026-08-14T10:00:00Z',
          baseRefName: 'main',
          mergeCommit: { oid: 'a'.repeat(40) },
        }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    };
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr') return { ok: true, status: 0, stdout: '[]', stderr: '' };
      if (args[0] === 'issue') {
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify({ ...active, labels: [] }),
          stderr: '',
        };
      }
      if (args[0] === 'repo') {
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify({
            nameWithOwner: 'example/project',
            defaultBranchRef: { name: 'main' },
          }),
          stderr: '',
        };
      }
      if (args[0] === 'api') {
        const query = args.find((argument) => argument.startsWith('query=')) ?? '';
        const repository = query.includes('closedByPullRequestsReferences')
          ? { target122: deliverableTarget }
          : { active, target122: relationshipTarget };
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify({ data: { repository } }),
          stderr: '',
        };
      }
      throw new Error(`unexpected GitHub command: ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(evidence.issue.deliverableDependencies).toMatchObject({
      status: 'ready',
      reasonCode: 'deliverables_available',
      defaultBranch: 'main',
      requirements: [{
        ownerIssue: 122,
        executionEdge: true,
        available: true,
        mergedPullRequest: { number: 200, baseRefName: 'main' },
      }],
    });
    expect(inferLifecycle(evidence).stage).toBe('specified');
  });

  it('fails coordination closed when native sibling pagination is incomplete', () => {
    const parent = {
      number: 10,
      state: 'OPEN',
      body: '- [ ] #42',
      labels: { nodes: [{ name: 'epic' }] },
      subIssues: {
        nodes: [{ number: 42, state: 'OPEN' }],
        pageInfo: { hasNextPage: true, endCursor: 'cursor' },
      },
    };
    const active = {
      number: 42,
      title: 'Status fixture',
      state: 'OPEN',
      body: 'Depends on: #10',
      labels: { nodes: [{ name: 'epic-child-of-10' }] },
      parent,
      subIssues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    };
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr') return { ok: true, status: 0, stdout: '[]', stderr: '' };
      if (args[0] === 'issue') return { ok: true, status: 0, stdout: JSON.stringify(active), stderr: '' };
      if (args[0] === 'repo') return { ok: true, status: 0, stdout: '{"nameWithOwner":"example/project"}', stderr: '' };
      if (args[0] === 'api') {
        return { ok: true, status: 0, stdout: JSON.stringify({ data: { repository: { active, target10: parent } } }), stderr: '' };
      }
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(evidence.issue.coordination).toMatchObject({ role: 'unverifiable', identity: 'unverifiable' });
    expect(evidence.issue.coordination.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('pagination is incomplete'),
    ]));
  });

  it('fails coordination closed when an alias-only target has incomplete pagination', () => {
    const active = {
      number: 42,
      title: 'Status fixture',
      state: 'OPEN',
      body: 'Depends on: #10',
      labels: { nodes: [{ name: 'epic-child-of-10' }], pageInfo: { hasNextPage: false, endCursor: null } },
      parent: null,
      subIssues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    };
    const target = {
      number: 10,
      state: 'OPEN',
      body: '- [ ] #42',
      labels: { nodes: [{ name: 'epic' }], pageInfo: { hasNextPage: false, endCursor: null } },
      subIssues: {
        nodes: [{ number: 42, state: 'OPEN' }],
        pageInfo: { hasNextPage: true, endCursor: 'target-cursor' },
      },
    };
    let paginationRequested = false;
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr') return { ok: true, status: 0, stdout: '[]', stderr: '' };
      if (args[0] === 'issue') return { ok: true, status: 0, stdout: JSON.stringify(active), stderr: '' };
      if (args[0] === 'repo') return { ok: true, status: 0, stdout: '{"nameWithOwner":"example/project"}', stderr: '' };
      if (args[0] === 'api') {
        if (args.includes('cursor=target-cursor')) {
          paginationRequested = true;
          return { ok: true, status: 0, stdout: '{"data":{"repository":{"issue":null}}}', stderr: '' };
        }
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify({ data: { repository: { active, target10: target } } }),
          stderr: '',
        };
      }
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(paginationRequested).toBe(true);
    expect(evidence.issue.coordination).toMatchObject({
      role: 'unverifiable',
      identity: 'unverifiable',
      consistency: 'unverifiable',
      nativeAuthority: 'incomplete',
      degraded: true,
    });
    expect(evidence.issue.coordination.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('issue #10 sub-issues'),
    ]));
  });

  it('bounds relationship hydration before constructing a GitHub graph query', () => {
    const active = {
      number: 42,
      title: 'Status fixture',
      state: 'OPEN',
      body: Array.from({ length: 101 }, (_, index) => `Depends on: #${index + 100}`).join('\n'),
      labels: [],
    };
    let repoQueried = false;
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr') return { ok: true, status: 0, stdout: '[]', stderr: '' };
      if (args[0] === 'issue') return { ok: true, status: 0, stdout: JSON.stringify(active), stderr: '' };
      if (args[0] === 'repo') repoQueried = true;
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(repoQueried).toBe(false);
    expect(evidence.issue.coordination).toMatchObject({ role: 'unverifiable', identity: 'unverifiable' });
    expect(evidence.issue.coordination.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('more than 100 relationship targets'),
    ]));
  });

  it('bounds per-target fallback when native coordination is unavailable', () => {
    const active = {
      number: 42,
      title: 'Status fixture',
      state: 'OPEN',
      body: Array.from({ length: 9 }, (_, index) => `Depends on: #${index + 100}`).join('\n'),
      labels: [],
    };
    let issueViews = 0;
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr') return { ok: true, status: 0, stdout: '[]', stderr: '' };
      if (args[0] === 'issue') {
        issueViews += 1;
        return { ok: true, status: 0, stdout: JSON.stringify(active), stderr: '' };
      }
      if (args[0] === 'repo') return { ok: false, status: 1, stdout: '', stderr: 'offline' };
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(issueViews).toBe(1);
    expect(evidence.issue.coordination).toMatchObject({ role: 'unverifiable', identity: 'unverifiable' });
    expect(evidence.issue.coordination.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('fallback limit of 8'),
    ]));
  });

  it('classifies a successful bounded fallback without incomplete authority', () => {
    const active = {
      number: 42,
      title: 'Status fixture',
      state: 'OPEN',
      body: 'Depends on: #10',
      labels: [],
    };
    const target = {
      number: 10,
      state: 'OPEN',
      body: '- [ ] #42',
      labels: [{ name: 'epic' }],
    };
    let issueViews = 0;
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr') return { ok: true, status: 0, stdout: '[]', stderr: '' };
      if (args[0] === 'issue') {
        issueViews += 1;
        const response = args[2] === '42' ? active : target;
        return { ok: true, status: 0, stdout: JSON.stringify(response), stderr: '' };
      }
      if (args[0] === 'repo') return { ok: false, status: 1, stdout: '', stderr: 'offline' };
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(issueViews).toBe(2);
    expect(evidence.issue.coordination).toMatchObject({
      role: 'unverifiable',
      parentNumber: 10,
      identity: 'unverifiable',
      nativeAuthority: 'checklist-fallback',
      degraded: true,
    });
    expect(evidence.issue.coordination.gaps).not.toEqual(expect.arrayContaining([
      expect.stringContaining('fallback limit'),
    ]));
    expect(evidence.issue.coordination.gaps).not.toEqual(expect.arrayContaining([
      expect.stringContaining('pagination is incomplete'),
    ]));
  });

  it('bounds aggregate relationship pagination requests', () => {
    const targetNumbers = Array.from({ length: 41 }, (_, index) => index + 100);
    const issueViewActive = {
      number: 42,
      title: 'Status fixture',
      state: 'OPEN',
      body: targetNumbers.map((number) => `Depends on: #${number}`).join('\n'),
      labels: [],
    };
    const active = {
      ...issueViewActive,
      labels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      parent: null,
      subIssues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    };
    const repository = { active };
    for (const number of targetNumbers) {
      repository[`target${number}`] = {
        number,
        state: 'OPEN',
        body: '',
        labels: { nodes: [], pageInfo: { hasNextPage: true, endCursor: `labels-${number}` } },
        subIssues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      };
    }
    let followUps = 0;
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr') return { ok: true, status: 0, stdout: '[]', stderr: '' };
      if (args[0] === 'issue') return { ok: true, status: 0, stdout: JSON.stringify(issueViewActive), stderr: '' };
      if (args[0] === 'repo') return { ok: true, status: 0, stdout: '{"nameWithOwner":"example/project"}', stderr: '' };
      if (args[0] === 'api') {
        const cursor = args.find((argument) => argument.startsWith('cursor='));
        if (cursor) {
          followUps += 1;
          return {
            ok: true,
            status: 0,
            stdout: JSON.stringify({
              data: {
                repository: {
                  issue: {
                    labels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
                  },
                },
              },
            }),
            stderr: '',
          };
        }
        return { ok: true, status: 0, stdout: JSON.stringify({ data: { repository } }), stderr: '' };
      }
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(followUps).toBe(40);
    expect(evidence.issue.coordination).toMatchObject({
      role: 'unverifiable',
      identity: 'unverifiable',
      nativeAuthority: 'incomplete',
    });
    expect(evidence.issue.coordination.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('pagination request budget exhausted'),
    ]));
  });

  it('uses only read-only git and GitHub command forms', () => {
    const calls = [];
    const run = (command, args, options) => {
      calls.push([command, ...args]);
      return localRun(command, args, options);
    };
    collectEvidence(root, { run });

    const mutating = /^(?:add|checkout|commit|merge|push|reset|restore|rm|switch|clean|create|edit|close|reopen|delete)$/;
    for (const [command, noun, verb] of calls) {
      if (command === 'git') expect(noun).not.toMatch(mutating);
      if (command === 'gh') expect(verb).not.toMatch(mutating);
    }
  });

  it('does not change files, refs, status, or lifecycle conclusions in text or JSON mode', () => {
    const before = worktreeSnapshot(root);
    let textOutput = '';
    let jsonOutput = '';
    const common = { adapters: { run: localRunWithHydratedIssue }, stderr: { write: () => {} } };

    expect(runCli(['--project', root], {
      ...common,
      stdout: { write: (chunk) => { textOutput += chunk; } },
    })).toBe(0);
    expect(runCli(['--project', root, '--json'], {
      ...common,
      stdout: { write: (chunk) => { jsonOutput += chunk; } },
    })).toBe(0);

    const after = worktreeSnapshot(root);
    expect(after).toEqual(before);
    expect(textOutput).toContain('SDLC status: specified');
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.stage).toBe('specified');
    expect(parsed.schemaVersion).toBe(1);
    expect(Object.keys(parsed)).toEqual(expect.arrayContaining([
      'project', 'issue', 'spec', 'verification', 'pullRequest', 'stage',
      'completedArtifacts', 'missingArtifacts', 'gaps', 'nextAction',
    ]));
    expect(parsed).not.toHaveProperty('runner');
  });

  it('does not probe runner source, state, sentinels, logs, configuration, or PIDs', () => {
    const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-status.mjs'), 'utf8');
    for (const forbidden of [
      'sdlc-runner.mjs', 'sdlc-state.json', 'unattended-mode', 'sdlc-config.json',
      'runnerPid', 'process.kill', 'sdlc-logs', '$nmg-sdlc:end-loop', '--resume',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe('rendering and invocation', () => {
  it('keeps stage first, next action last, and JSON valid', () => {
    const status = inferLifecycle(baseEvidence());
    const text = renderText(status).split('\n');
    expect(text[0]).toBe('SDLC status: idle');
    expect(text.at(-1)).toBe('Next: $nmg-sdlc:start-issue');
    expect(JSON.parse(renderJson(status))).toMatchObject({ schemaVersion: 1, stage: 'idle' });
  });

  it('rejects invalid invocation without writing stdout', () => {
    let stdout = '';
    let stderr = '';
    const code = runCli(['--unexpected'], {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    });
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('Argument error');
  });

  it('prints help without collecting project evidence', () => {
    let stdout = '';
    let stderr = '';
    const code = runCli(['--help'], {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
      adapters: { run: () => { throw new Error('must not collect evidence'); } },
    });
    expect(code).toBe(0);
    expect(stdout).toContain('Usage: node sdlc-status.mjs --project <repo-root> [--json]');
    expect(stderr).toBe('');
  });

  it('exits non-zero when the project is not a git repository', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-non-git-'));
    let stdout = '';
    let stderr = '';
    try {
      const code = runCli(['--project', root], {
        stdout: { write: (chunk) => { stdout += chunk; } },
        stderr: { write: (chunk) => { stderr += chunk; } },
      });
      expect(code).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toContain('not a git project');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
