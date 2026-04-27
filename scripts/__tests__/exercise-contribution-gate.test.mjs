import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW_RELATIVE_PATH = '.github/workflows/nmg-sdlc-contribution-gate.yml';
const MANAGED_MARKER = '# nmg-sdlc-managed: contribution-gate';
const VERSION_PATTERN = /^# nmg-sdlc-managed-version:\s*(\d+)\s*$/m;

function readContract() {
  return fs.readFileSync(path.join(repoRoot, 'references/contribution-gate.md'), 'utf8');
}

function workflowTemplate() {
  const match = readContract().match(/```yaml\n([\s\S]*?)\n```/);
  if (!match) throw new Error('workflow template not found');
  return match[1];
}

function scaffoldProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-contribution-gate-'));
  fs.mkdirSync(path.join(dir, 'steering'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'steering', 'product.md'), '# Product\n');
  fs.writeFileSync(path.join(dir, 'steering', 'tech.md'), '# Tech\n');
  fs.writeFileSync(path.join(dir, 'steering', 'structure.md'), '# Structure\n');
  fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# Contributing\n');
  return dir;
}

function workflowPath(projectDir) {
  return path.join(projectDir, WORKFLOW_RELATIVE_PATH);
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function ensureContributionGate(projectDir) {
  const target = workflowPath(projectDir);
  const existing = readIfExists(target);
  const status = {
    workflow: 'already present',
    path: WORKFLOW_RELATIVE_PATH,
    gaps: [],
  };

  if (existing === null) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, workflowTemplate());
    status.workflow = 'created';
    return status;
  }

  if (!existing.includes(MANAGED_MARKER)) {
    status.workflow = 'skipped (unmanaged file at path)';
    status.gaps.push('unmanaged workflow occupies .github/workflows/nmg-sdlc-contribution-gate.yml');
    return status;
  }

  const version = Number(existing.match(VERSION_PATTERN)?.[1] ?? 0);
  if (version < 1) {
    fs.writeFileSync(target, workflowTemplate());
    status.workflow = 'updated';
  } else if (version > 1) {
    status.workflow = 'skipped (newer managed version)';
    status.gaps.push('managed workflow version is newer than this plugin');
  }

  return status;
}

function evaluateContributionEvidence({
  title = '',
  body = '',
  changedPaths = [],
  specText = '',
  files = new Set(),
} = {}) {
  const combinedText = `${title}\n${body}\n${specText}`;
  const failures = [];

  const issueLinked = /(^|[\s(])#\d+\b/.test(combinedText)
    || /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+\b/i.test(combinedText)
    || /\*\*Issues?\*\*:\s*#?\d+/i.test(combinedText);
  if (!issueLinked) failures.push('Missing issue evidence: reference the GitHub issue.');

  const specLinked = changedPaths.some((item) => /^specs\/(?:feature|bug)-[^/]+\/(?:requirements|design|tasks)\.md$|^specs\/(?:feature|bug)-[^/]+\/feature\.gherkin$/.test(item))
    || /specs\/(?:feature|bug)-[a-z0-9-]+/i.test(combinedText)
    || /\b(requirements\.md|design\.md|tasks\.md|feature\.gherkin)\b/i.test(combinedText);
  if (!specLinked) failures.push('Missing spec evidence: update or link `specs/feature-*` or `specs/bug-*` artifacts.');

  const steeringFiles = ['steering/product.md', 'steering/tech.md', 'steering/structure.md'];
  const missingSteering = steeringFiles.filter((item) => !files.has(item));
  const steeringReferenced = /\bsteering\b|steering\/(?:product|tech|structure)\.md|product\.md|tech\.md|structure\.md/i.test(combinedText)
    || changedPaths.some((item) => /^steering\/(?:product|tech|structure)\.md$/.test(item));
  if (missingSteering.length > 0) {
    failures.push(`Missing steering artifacts: expected ${missingSteering.join(', ')}.`);
  } else if (!steeringReferenced) {
    failures.push('Missing steering evidence: explain steering alignment.');
  }

  const verificationLinked = /\b(test plan|verification|verified|verify-code|tests? run|validation)\b/i.test(combinedText)
    || changedPaths.some((item) => /(^|\/)verification-report\.md$|^docs\/decisions\/.+\.md$/.test(item));
  if (!verificationLinked) failures.push('Missing verification evidence: include test or verification results.');

  if (!files.has('CONTRIBUTING.md')) {
    failures.push('Missing `CONTRIBUTING.md`: run onboarding or upgrade.');
  }

  return failures;
}

describe('contribution gate exercise coverage (issue #125)', () => {
  test('init-style setup creates the workflow and rerun is idempotent', () => {
    const project = scaffoldProject();

    const first = ensureContributionGate(project);
    expect(first).toEqual({ workflow: 'created', path: WORKFLOW_RELATIVE_PATH, gaps: [] });
    expect(fs.readFileSync(workflowPath(project), 'utf8')).toContain(MANAGED_MARKER);

    const second = ensureContributionGate(project);
    expect(second).toEqual({ workflow: 'already present', path: WORKFLOW_RELATIVE_PATH, gaps: [] });
  });

  test('upgrade-style reconciliation updates outdated managed workflow and preserves unrelated workflows', () => {
    const project = scaffoldProject();
    const target = workflowPath(project);
    const unrelated = path.join(project, '.github/workflows/project-ci.yml');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${MANAGED_MARKER}\n# nmg-sdlc-managed-version: 0\nname: old gate\n`);
    fs.writeFileSync(unrelated, 'name: project ci\non: [push]\n');

    const status = ensureContributionGate(project);

    expect(status).toEqual({ workflow: 'updated', path: WORKFLOW_RELATIVE_PATH, gaps: [] });
    expect(fs.readFileSync(target, 'utf8')).toContain('# nmg-sdlc-managed-version: 1');
    expect(fs.readFileSync(unrelated, 'utf8')).toBe('name: project ci\non: [push]\n');
  });

  test('unmanaged file at approved path is not overwritten and records a gap', () => {
    const project = scaffoldProject();
    const target = workflowPath(project);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'name: user owned gate\n');

    const status = ensureContributionGate(project);

    expect(status.workflow).toBe('skipped (unmanaged file at path)');
    expect(status.gaps).toEqual(['unmanaged workflow occupies .github/workflows/nmg-sdlc-contribution-gate.yml']);
    expect(fs.readFileSync(target, 'utf8')).toBe('name: user owned gate\n');
  });

  test('PR evidence evaluation passes compliant metadata and reports actionable missing categories', () => {
    const files = new Set(['CONTRIBUTING.md', 'steering/product.md', 'steering/tech.md', 'steering/structure.md']);
    const compliant = evaluateContributionEvidence({
      title: 'feat: add gate',
      body: 'Closes #125\n\nSpecs: specs/feature-add-gate/\n\nSteering: aligns with steering/tech.md.\n\nTest Plan: npm test.',
      changedPaths: ['specs/feature-add-gate/requirements.md'],
      specText: '**Issues**: #125',
      files,
    });
    expect(compliant).toEqual([]);

    expect(evaluateContributionEvidence({
      body: 'Specs: specs/feature-add-gate/\n\nSteering: aligns with steering/tech.md.\n\nTest Plan: npm test.',
      changedPaths: ['specs/feature-add-gate/requirements.md'],
      files,
    })).toContain('Missing issue evidence: reference the GitHub issue.');

    expect(evaluateContributionEvidence({
      body: 'Closes #125\n\nSteering: aligns with steering/tech.md.\n\nTest Plan: npm test.',
      files,
    })).toContain('Missing spec evidence: update or link `specs/feature-*` or `specs/bug-*` artifacts.');

    expect(evaluateContributionEvidence({
      body: 'Closes #125\n\nSpecs: specs/feature-add-gate/\n\nSteering: aligns with steering/tech.md.',
      changedPaths: ['specs/feature-add-gate/requirements.md'],
      files,
    })).toContain('Missing verification evidence: include test or verification results.');
  });
});
