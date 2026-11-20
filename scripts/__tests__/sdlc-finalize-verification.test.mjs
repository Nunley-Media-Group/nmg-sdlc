import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeVerification, matchesRegisteredResults, withScopeMarker } from '../sdlc-finalize-verification.mjs';
import { inspectIssueSpecScope, issueScopeMarker } from '../issue-spec-scope.mjs';
import { canonicalJson } from '../../src/sdlc-steering-runtime.mjs';
import { inspectVerificationReadiness } from '../verification-readiness.mjs';

const roots = [];
const SPEC = 'specs/42-feature';
const REPORT = `${SPEC}/verification-report.md`;

function makeRoot() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-fv-focused-'));
  roots.push(base);
  const root = path.join(base, 'work');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function writeSteering(root) {
  const steering = path.join(root, 'steering');
  fs.mkdirSync(steering, { recursive: true });
  fs.writeFileSync(path.join(steering, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    runtimeVersion: '1',
    validations: [
      { id: 'repository.tests', provider: 'builtin.command', required: true, when: { kind: 'always' }, config: { command: 'echo ok' } }
    ],
    modules: [], snippets: [], extensions: []
  }));
}

function writeSpec(root) {
  const specDir = path.join(root, SPEC);
  fs.mkdirSync(specDir, { recursive: true });
  const header = '**Issue**: #42\n**Status**: Approved\n\n';
  fs.writeFileSync(path.join(specDir, 'requirements.md'), header + 'AC1\n');
  fs.writeFileSync(path.join(specDir, 'design.md'), header);
  fs.writeFileSync(path.join(specDir, 'tasks.md'), header);
  fs.writeFileSync(path.join(specDir, 'feature.gherkin'), header);
}

function computeHash(files) {
  return 'sha256:' + createHash('sha256').update(files.map(f => `${f.name}\0${fs.readFileSync(f.path)}`).join('\0')).digest('hex');
}

function writeArtifact(root, headSha, ceiling = null, status = 'passed', runId = 'controller-R') {
  const directory = path.join(root, '.nmg-sdlc/verification');
  fs.mkdirSync(directory, { recursive: true });
  const manifestPath = path.join(root, 'steering/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const declaration = manifest.validations[0];
  const steeringHash = computeHash([{ name: 'steering/manifest.json', path: manifestPath }]);
  const specHash = computeHash(['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md']
    .map((name) => ({ name, path: path.join(root, SPEC, name) })));
  const validationConfigHash = `sha256:${createHash('sha256').update(canonicalJson(declaration)).digest('hex')}`;
  const identity = { headSha, steeringHash, specHash, validationConfigHash };
  const result = {
    id: declaration.id,
    provider: declaration.provider,
    required: true,
    applicable: true,
    effectiveStatus: status,
    request: {
      schemaVersion: 1,
      validationId: declaration.id,
      projectRoot: fs.realpathSync(root),
      config: declaration.config,
      identity,
      verification: { runId, issue: 42, specPath: SPEC },
    },
    result: {
      schemaVersion: 1,
      status,
      summary: status === 'passed' ? 'registered command passed' : 'registered command failed',
      evidence: [{ kind: 'command', summary: 'registered command result' }],
      identity,
    },
  };
  fs.writeFileSync(path.join(directory, '42.json'), JSON.stringify({
    schemaVersion: 1,
    issue: 42,
    identity: { headSha, steeringHash, specHash },
    ceiling,
    coverage: { complete: true, declared: 1, recorded: 1, missing: [], duplicate: [], unknown: [] },
    results: [result],
    changedPaths: [],
  }));
}

function writeReport(root, impl, head = null) {
  const p = path.join(root, REPORT);
  let c = `# Verification\n\n## Implementation Status: **${impl}**\n\n`;
  const live = inspectIssueSpecScope({ projectRoot: root, issueNumber: 42, specPath: SPEC });
  const scope = {
    issueNumber: live.issueNumber, specPath: live.specPath, status: live.status,
    delivery: live.delivery, regression: live.regression,
  };
  c += `<!-- nmg-sdlc-issue-scope: ${JSON.stringify(scope)} -->\n`;
  if (head) c += `**Verification head**: ${head}\n`;
  fs.writeFileSync(p, c);
}

function gitInit(root) {
  const run = (c, a) => spawnSync(c, a, { cwd: root, encoding: 'utf8' });
  run('git', ['init', '-b', '42-feature']);
  run('git', ['config', 'user.name', 't']);
  run('git', ['config', 'user.email', 't@t']);
  fs.writeFileSync(path.join(root, '.gitignore'), '.nmg-sdlc/\n');
  run('git', ['add', '.']);
  run('git', ['commit', '-m', 'chore: approved fixture']);
  const bare = path.join(root, '..', 'r.git');
  run('git', ['init', '--bare', bare]);
  run('git', ['remote', 'add', 'origin', bare]);
  run('git', ['push', '-u', 'origin', '42-feature']);
  return run('git', ['rev-parse', 'HEAD']).stdout.trim();
}

afterEach(() => { roots.splice(0).forEach(r => { try { fs.rmSync(r, { recursive: true, force: true }); } catch {} }); });

describe('sdlc-finalize-verification focused fresh', () => {
  it('publishes a standalone exact-head registered Pass without run.json', () => {
    const root = makeRoot();
    writeSteering(root);
    writeSpec(root);
    const head = gitInit(root);
    writeReport(root, 'Pass', head);
    writeArtifact(root, head, null, 'passed', 'R123');
    const out = finalizeVerification({ issue: 42, spec: SPEC, cwd: root, controllerRunId: 'R123' });
    expect(out.status).toBe(0);
    expect(out.handoff).toMatchObject({ status: 'passed', next: 'deliver' });
    expect(fs.existsSync(path.join(root, '.nmg-sdlc/run.json'))).toBe(false);
    const publishedHead = spawnSync('git', ['rev-parse', 'origin/42-feature'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    expect(publishedHead).not.toBe(head);
    expect(publishedHead).toBe(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim());
  });

  it('routes a truthful Fail report back to implementation without publishing Pass', () => {
    const root = makeRoot();
    writeSteering(root);
    writeSpec(root);
    const head = gitInit(root);
    writeReport(root, 'Fail', head);
    writeArtifact(root, head, 'Fail', 'failed');
    const out = finalizeVerification({ issue: 42, spec: SPEC, cwd: root });
    expect(out.status).toBe(1);
    expect(out.handoff).toMatchObject({
      status: 'failed', reasonCode: 'verification_not_ready', intervention: false, next: 'implement',
      artifacts: [REPORT, '.nmg-sdlc/verification/42.json'],
    });
  });

  it('rejects prose Pass when a required registered steering result fails', () => {
    const root = makeRoot();
    writeSteering(root);
    writeSpec(root);
    const sourceHead = gitInit(root);
    writeReport(root, 'Pass', sourceHead);
    writeArtifact(root, sourceHead, 'Fail', 'failed');
    const out = finalizeVerification({ issue: 42, spec: SPEC, cwd: root });
    expect(out).toMatchObject({
      status: 1,
      handoff: { status: 'failed', reasonCode: 'verification_recheck_invalid', intervention: false, next: 'implement' },
    });
    expect(spawnSync('git', ['rev-parse', 'origin/42-feature'], { cwd: root, encoding: 'utf8' }).stdout.trim()).toBe(sourceHead);
  });

  it('pending does not publish passed', () => {
    const root = makeRoot();
    writeSteering(root);
    writeSpec(root);
    const head = gitInit(root);
    writeReport(root, 'PR Evidence Pending', head);
    writeArtifact(root, head, 'Incomplete', 'incomplete');
    const out = finalizeVerification({ issue: 42, spec: SPEC, cwd: root });
    expect(out.status).toBe(1);
    expect(out.handoff.status).toBe('failed');
  });

  it('reuses the source-parent passing gate after a report-only commit without another publication', () => {
    const root = makeRoot();
    writeSteering(root);
    writeSpec(root);
    const sourceHead = gitInit(root);
    writeReport(root, 'Pass', sourceHead);
    writeArtifact(root, sourceHead, null, 'passed', 'R-prior');
    expect(finalizeVerification({ issue: 42, spec: SPEC, cwd: root, controllerRunId: 'R-prior' }).status).toBe(0);
    const reportHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const outcome = finalizeVerification({ issue: 42, spec: SPEC, cwd: root, controllerRunId: 'R-new' });
    expect(outcome).toMatchObject({ status: 0, handoff: { status: 'passed', next: 'deliver' } });
    expect(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()).toBe(reportHead);
    expect(spawnSync('git', ['rev-parse', 'origin/42-feature'], { cwd: root, encoding: 'utf8' }).stdout.trim()).toBe(reportHead);
  });

  it('finalizes a passed gate whose hand-written issue-scope marker names scenario titles (#491)', () => {
    const root = makeRoot();
    writeSteering(root);
    writeSpec(root);
    fs.writeFileSync(path.join(root, SPEC, 'feature.gherkin'),
      '**Issue**: #42\n**Status**: Approved\n\nFeature: F\n\n  @SCN001\n  Scenario: Ship the feature\n    Given x\n');
    const head = gitInit(root);
    const live = inspectIssueSpecScope({ projectRoot: root, issueNumber: 42, specPath: SPEC });
    expect(live.delivery.scenarios).toEqual(['SCN001']);
    const handWritten = { issueNumber: 42, specPath: SPEC, status: live.status,
      delivery: { ...live.delivery, scenarios: ['Ship the feature'] }, regression: live.regression };
    fs.writeFileSync(path.join(root, REPORT), `# Verification\n\n## Implementation Status: **Pass**\n\n### Issue Scope\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(handWritten)} -->\n**Verification head**: ${head}\n`);
    writeArtifact(root, head, null, 'passed', 'R491');
    const out = finalizeVerification({ issue: 42, spec: SPEC, cwd: root, controllerRunId: 'R491' });
    expect(out).toMatchObject({ status: 0, handoff: { status: 'passed', next: 'deliver' } });
    const markers = fs.readFileSync(path.join(root, REPORT), 'utf8').split('\n').filter((line) => line.startsWith('<!-- nmg-sdlc-issue-scope:'));
    expect(markers).toEqual([issueScopeMarker(live)]);
  });
});

describe('queue-head gate finalization: --queue-gate (#551 AC5, FR11)', () => {
  const SCRIPT = fileURLToPath(new URL('../sdlc-finalize-verification.mjs', import.meta.url));
  const ARTIFACT = '.nmg-sdlc/verification/42.json';
  const HANDOFF = '.nmg-sdlc/handoffs/42-verify.json';
  const gitOut = (root, ...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim();

  /** A published issue branch whose report says `impl` and whose registered gate at HEAD has the given result. */
  function gateFixture(impl, { ceiling = 'Fail', status = 'failed' } = {}) {
    const root = makeRoot();
    writeSteering(root);
    writeSpec(root);
    const head = gitInit(root);
    writeReport(root, impl, head);
    writeArtifact(root, head, ceiling, status);
    return { root, head };
  }
  const storedHandoff = (root) => JSON.parse(fs.readFileSync(path.join(root, HANDOFF), 'utf8'));

  it.each(['Fail', 'Partial', 'Incomplete'])('hands a %s gate at the queue head back to implement as queue_gate_failed, with the report and the verification record', (impl) => {
    const { root, head } = gateFixture(impl);

    const out = finalizeVerification({ issue: 42, spec: SPEC, cwd: root, queueGate: true });

    expect(out).toMatchObject({ status: 1, stdout: `NMG_SDLC_HANDOFF: ${HANDOFF}\n`, handoffPath: HANDOFF });
    expect(out.handoff).toMatchObject({
      schemaVersion: 1, issue: 42, step: 'verify', status: 'failed', reasonCode: 'queue_gate_failed',
      intervention: false, next: 'implement', artifacts: [REPORT, ARTIFACT],
    });
    expect(out.handoff.summary).toContain('implementation_non_pass');
    expect(storedHandoff(root)).toEqual(out.handoff);
    // Both artifacts the handoff names exist, and nothing was committed or published for the failed gate.
    for (const artifact of out.handoff.artifacts) expect(fs.existsSync(path.join(root, artifact))).toBe(true);
    expect(gitOut(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(gitOut(root, 'rev-parse', 'origin/42-feature')).toBe(head);
    expect(fs.existsSync(path.join(root, '.nmg-sdlc/controller.lock'))).toBe(false);
  });

  it('reports the same state as verification_not_ready without --queue-gate, and only an explicit true selects the queue gate', () => {
    const { root } = gateFixture('Fail');
    const expected = { status: 'failed', intervention: false, next: 'implement', artifacts: [REPORT, ARTIFACT] };

    const standalone = finalizeVerification({ issue: 42, spec: SPEC, cwd: root });
    expect(standalone).toMatchObject({ status: 1, handoff: { ...expected, reasonCode: 'verification_not_ready' } });
    expect(storedHandoff(root).reasonCode).toBe('verification_not_ready');

    expect(finalizeVerification({ issue: 42, spec: SPEC, cwd: root, queueGate: false }).handoff.reasonCode).toBe('verification_not_ready');
    expect(finalizeVerification({ issue: 42, spec: SPEC, cwd: root, queueGate: 'true' }).handoff.reasonCode).toBe('verification_not_ready');

    const queued = finalizeVerification({ issue: 42, spec: SPEC, cwd: root, queueGate: true });
    expect(queued).toMatchObject({ status: 1, handoff: { ...expected, reasonCode: 'queue_gate_failed' } });
    // Apart from the reason code, the two handoffs are the same.
    expect({ ...queued.handoff, reasonCode: null }).toEqual({ ...standalone.handoff, reasonCode: null });
    expect(storedHandoff(root).reasonCode).toBe('queue_gate_failed');
  });

  it('writes the queue_gate_failed handoff through the command line, and verification_not_ready without the flag', () => {
    const { root, head } = gateFixture('Fail');
    const cli = (...args) => spawnSync(process.execPath, [SCRIPT, '--issue', '42', '--spec', SPEC, ...args], { cwd: root, encoding: 'utf8' });

    const queued = cli('--queue-gate');

    expect(queued).toMatchObject({ status: 1, stdout: `NMG_SDLC_HANDOFF: ${HANDOFF}\n`, stderr: '' });
    expect(storedHandoff(root)).toMatchObject({
      issue: 42, step: 'verify', status: 'failed', reasonCode: 'queue_gate_failed', intervention: false,
      next: 'implement', artifacts: [REPORT, ARTIFACT],
    });

    // The flag is position-independent and may be given once.
    const leading = spawnSync(process.execPath, [SCRIPT, '--queue-gate', '--spec', SPEC, '--issue', '#42'], { cwd: root, encoding: 'utf8' });
    expect(leading).toMatchObject({ status: 1, stdout: `NMG_SDLC_HANDOFF: ${HANDOFF}\n` });
    expect(storedHandoff(root).reasonCode).toBe('queue_gate_failed');
    const before = fs.readFileSync(path.join(root, HANDOFF), 'utf8');
    const twice = cli('--queue-gate', '--queue-gate');
    expect(twice.status).toBe(2);
    expect(twice.stderr).toContain('[--queue-gate]');
    expect(fs.readFileSync(path.join(root, HANDOFF), 'utf8')).toBe(before);

    const standalone = cli();
    expect(standalone).toMatchObject({ status: 1, stdout: `NMG_SDLC_HANDOFF: ${HANDOFF}\n`, stderr: '' });
    expect(storedHandoff(root)).toMatchObject({ status: 'failed', reasonCode: 'verification_not_ready', next: 'implement', artifacts: [REPORT, ARTIFACT] });
    expect(gitOut(root, 'rev-parse', 'origin/42-feature')).toBe(head);
    expect(fs.existsSync(path.join(root, '.nmg-sdlc/controller.lock'))).toBe(false);
  });

  it('keeps verification_not_ready and the return to verify for a PR-evidence-pending report, even with --queue-gate', () => {
    const root = makeRoot();
    writeSteering(root);
    writeSpec(root);
    fs.writeFileSync(path.join(root, SPEC, 'requirements.md'), '**Issue**: #42\n**Status**: Approved\n\n### AC1: Require PR-only checks\n');
    const head = gitInit(root);
    const scope = inspectIssueSpecScope({ projectRoot: root, issueNumber: 42, specPath: SPEC });
    const readiness = { schemaVersion: 1, state: 'pr_evidence_pending', issueNumber: 42, specPath: SPEC,
      local: { ...scope.delivery, regression: scope.regression, tests: 'pass', steeringGates: 'pass' },
      pendingEvidence: [{ kind: 'required_check', name: 'contract-tests', event: 'pull_request', acceptanceCriteria: ['AC1'] }] };
    const content = `# Verification\n\n## Implementation Status: **PR Evidence Pending**\n\n${issueScopeMarker(scope)}\n<!-- nmg-sdlc-pr-readiness: ${JSON.stringify(readiness)} -->\n**Verification head**: ${head}\n`;
    fs.writeFileSync(path.join(root, REPORT), content);
    writeArtifact(root, head, null, 'passed');
    // The fixture really is in the PR-evidence-pending state, not merely unverifiable.
    expect(inspectVerificationReadiness({ content, options: { expectedIssueNumber: 42, expectedSpecPath: SPEC, expectedScope: scope } }))
      .toMatchObject({ status: 'pr_evidence_pending', reasonCode: 'pr_evidence_pending' });
    const pending = { status: 'failed', reasonCode: 'verification_not_ready', intervention: false, next: 'verify', artifacts: [REPORT, ARTIFACT] };

    const standalone = finalizeVerification({ issue: 42, spec: SPEC, cwd: root });
    const queued = finalizeVerification({ issue: 42, spec: SPEC, cwd: root, queueGate: true });

    expect(standalone).toMatchObject({ status: 1, handoff: pending });
    expect(queued).toMatchObject({ status: 1, handoff: pending });
    expect(queued.handoff).toEqual(standalone.handoff);
    expect(queued.handoff.summary).toContain('pr_evidence_pending');
    expect(storedHandoff(root)).toEqual(queued.handoff);
    expect(gitOut(root, 'rev-parse', 'origin/42-feature')).toBe(head);
  });

  it('publishes a green gate at the queue head exactly as a standalone Pass', () => {
    const { root, head } = gateFixture('Pass', { ceiling: null, status: 'passed' });

    const out = finalizeVerification({ issue: 42, spec: SPEC, cwd: root, queueGate: true });

    expect(out).toMatchObject({ status: 0, handoff: { status: 'passed', next: 'deliver', reasonCode: null } });
    const published = gitOut(root, 'rev-parse', 'origin/42-feature');
    expect(published).not.toBe(head);
    expect(published).toBe(gitOut(root, 'rev-parse', 'HEAD'));
    expect(gitOut(root, 'log', '-1', '--format=%s')).toBe('docs: record verification for #42');
  });
});

describe('resolver-produced issue-scope marker (#491)', () => {
  const marker = '<!-- nmg-sdlc-issue-scope: {"issueNumber":42} -->';

  it('replaces the first marker, drops duplicates, and keeps everything else', () => {
    expect(withScopeMarker('# R\n<!-- nmg-sdlc-issue-scope: {"bad":1} -->\ntext\n<!-- nmg-sdlc-issue-scope: {} -->\n', marker))
      .toBe(`# R\n${marker}\ntext\n`);
    expect(withScopeMarker('a\r\n<!-- nmg-sdlc-issue-scope: x -->\r\nb', marker)).toBe(`a\r\n${marker}\r\nb`);
  });

  it('inserts a missing marker after the Issue Scope heading, or at the end', () => {
    expect(withScopeMarker('# R\n\n## Issue Scope\n\n- Active issue: #42\n', marker))
      .toBe(`# R\n\n## Issue Scope\n\n${marker}\n\n- Active issue: #42\n`);
    expect(withScopeMarker('# R\nbody\n', marker)).toBe(`# R\nbody\n\n${marker}\n`);
    expect(withScopeMarker('# R', marker)).toBe(`# R\n\n${marker}\n`);
  });

  it('renders only resolved scopes', () => {
    const scope = { issueNumber: 42, specPath: SPEC, status: 'scoped', reasonCode: 'x',
      delivery: { acceptanceCriteria: ['AC1'], functionalRequirements: [], tasks: [], scenarios: ['SCN001'] },
      regression: { acceptanceCriteria: [], functionalRequirements: [], scenarios: [] } };
    expect(issueScopeMarker(scope)).toBe(`<!-- nmg-sdlc-issue-scope: {"issueNumber":42,"specPath":"${SPEC}","status":"scoped","delivery":{"acceptanceCriteria":["AC1"],"functionalRequirements":[],"tasks":[],"scenarios":["SCN001"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->`);
    expect(issueScopeMarker({ ...scope, status: 'unverifiable' })).toBeNull();
    expect(issueScopeMarker(null)).toBeNull();
  });
});

describe('selection escalation (#584 AC7, FR7)', () => {
  const ARTIFACT = '.nmg-sdlc/verification/42.json';
  const rejection = { reasonCode: 'selection_unaccounted', uncovered: [], missingSurfaces: [], unaccounted: ['tools/build.sh'] };
  function rejectedFixture() {
    const root = makeRoot();
    writeSteering(root);
    writeSpec(root);
    const head = gitInit(root);
    writeReport(root, 'Fail', head);
    writeArtifact(root, head, 'Fail', 'failed');
    const file = path.join(root, ARTIFACT);
    const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...artifact, selection: { mode: 'selected', reason: 'selected', rejection } }));
    return root;
  }

  it.each([true, false])('finalizes a rejected selection as selection_escalation back to verify (queueGate %s)', (queueGate) => {
    const root = rejectedFixture();
    const out = finalizeVerification({ issue: 42, spec: SPEC, cwd: root, queueGate });
    expect(out.handoff).toMatchObject({ status: 'failed', reasonCode: 'selection_escalation', intervention: false, next: 'verify',
      artifacts: [REPORT, ARTIFACT], escalation: { kind: 'selection', ...rejection } });
    expect(out.handoff.summary).toContain('selection_unaccounted: tools/build.sh');
  });
});
