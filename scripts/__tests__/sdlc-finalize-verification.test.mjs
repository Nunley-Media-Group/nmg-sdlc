import { afterEach, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finalizeVerification, matchesRegisteredResults } from '../sdlc-finalize-verification.mjs';
import { inspectIssueSpecScope } from '../issue-spec-scope.mjs';
import { canonicalJson } from '../../src/sdlc-steering-runtime.mjs';

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
  const directory = path.join(root, '.omp/sdlc/verification');
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
  fs.writeFileSync(path.join(root, '.gitignore'), '.omp/\n');
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
    expect(fs.existsSync(path.join(root, '.omp/sdlc/run.json'))).toBe(false);
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
      artifacts: [REPORT, '.omp/sdlc/verification/42.json'],
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
});
