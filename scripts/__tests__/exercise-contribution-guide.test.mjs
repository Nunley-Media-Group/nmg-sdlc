import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function scaffoldProject({ readme = true, contributing = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-contribution-guide-'));
  fs.mkdirSync(path.join(dir, 'steering'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'steering', 'product.md'), '# Product\n\n## Vision\nBuild useful software.\n');
  fs.writeFileSync(path.join(dir, 'steering', 'tech.md'), '# Tech\n\n## Testing Standards\nRun project tests before PR.\n');
  fs.writeFileSync(path.join(dir, 'steering', 'structure.md'), '# Structure\n\n## Project Layout\nKeep source and tests organized.\n');
  if (readme) fs.writeFileSync(path.join(dir, 'README.md'), '# Test Project\n');
  if (contributing !== null) fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), contributing);
  return dir;
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function expectSingleContributionLink(projectDir) {
  const readme = fs.readFileSync(path.join(projectDir, 'README.md'), 'utf8');
  expect(readme.match(/\[CONTRIBUTING\.md\]\(CONTRIBUTING\.md\)/g)).toHaveLength(1);
}

function hasWorkflowCoverage(source) {
  return /## nmg-sdlc Contribution Workflow/.test(source)
    || (/GitHub issues?/i.test(source) && /specs?/i.test(source) && /steering/i.test(source));
}

function ensureContributionGuide(projectDir, { brownfield = false } = {}) {
  const contributingPath = path.join(projectDir, 'CONTRIBUTING.md');
  const readmePath = path.join(projectDir, 'README.md');
  const existing = readIfExists(contributingPath);
  const status = {
    contributing: 'already present',
    readme: 'already present',
    gaps: [],
  };

  const workflowSection = [
    '## nmg-sdlc Contribution Workflow',
    '',
    '- Start work from a clear GitHub issue with acceptance criteria.',
    '- Use specs in `specs/` for requirements, design, tasks, and BDD scenarios.',
    '- Consult `steering/product.md`, `steering/tech.md`, and `steering/structure.md` before implementation.',
    '- Follow the issue -> spec -> code -> simplify -> verify -> PR workflow.',
    brownfield ? '- Treat existing code and reconciled specs as contribution context.' : '- Keep new work aligned with project steering.',
    '',
  ].join('\n');

  if (existing === null) {
    fs.writeFileSync(contributingPath, [
      '# Contributing',
      '',
      '## Project Context',
      '',
      'Review project steering before proposing or implementing changes.',
      '',
      '## Issue and Spec Workflow',
      '',
      'Start with GitHub issues and nmg-sdlc specs.',
      '',
      '## Steering Expectations',
      '',
      'Consult product, tech, and structure steering.',
      '',
      '## Implementation and Verification',
      '',
      'Implement through code, simplify, verification, and PR review.',
      '',
    ].join('\n'));
    status.contributing = 'created';
  } else if (!hasWorkflowCoverage(existing)) {
    const prefix = existing.endsWith('\n') ? existing : `${existing}\n`;
    fs.writeFileSync(contributingPath, `${prefix}\n${workflowSection}`);
    status.contributing = 'updated';
  }

  const readme = readIfExists(readmePath);
  if (readme === null) {
    status.readme = 'skipped (README missing)';
    status.gaps.push('README missing');
  } else if (!/CONTRIBUTING\.md/.test(readme)) {
    fs.writeFileSync(readmePath, `${readme.trimEnd()}\n\n## Contributing\n\nSee [CONTRIBUTING.md](CONTRIBUTING.md) for issue, spec, and steering expectations.\n`);
    status.readme = 'added';
  }

  return status;
}

describe('contribution guide exercise coverage (issue #109)', () => {
  test('onboarding-style project gets CONTRIBUTING.md and an idempotent README link', () => {
    const project = scaffoldProject();

    const first = ensureContributionGuide(project);
    expect(first).toEqual({ contributing: 'created', readme: 'added', gaps: [] });
    expect(fs.readFileSync(path.join(project, 'CONTRIBUTING.md'), 'utf8')).toContain('## Issue and Spec Workflow');
    expectSingleContributionLink(project);

    const second = ensureContributionGuide(project);
    expect(second).toEqual({ contributing: 'already present', readme: 'already present', gaps: [] });
    expectSingleContributionLink(project);
  });

  test('upgrade-style project preserves existing guide and skips missing README creation', () => {
    const project = scaffoldProject({
      readme: false,
      contributing: '# Contributing\n\n## Local Policy\n\nUse the project review checklist.\n',
    });

    const status = ensureContributionGuide(project, { brownfield: true });
    const guide = fs.readFileSync(path.join(project, 'CONTRIBUTING.md'), 'utf8');

    expect(status).toEqual({
      contributing: 'updated',
      readme: 'skipped (README missing)',
      gaps: ['README missing'],
    });
    expect(guide).toContain('## Local Policy');
    expect(guide).toContain('## nmg-sdlc Contribution Workflow');
    expect(guide).toContain('existing code and reconciled specs');
    expect(fs.existsSync(path.join(project, 'README.md'))).toBe(false);
  });
});
