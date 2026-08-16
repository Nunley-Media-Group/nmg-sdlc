import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function workflowTemplate() {
  const match = read('references/contribution-gate.md').match(/```yaml\n([\s\S]*?)\n```/);
  expect(match).not.toBeNull();
  return match[1];
}

describe('contribution gate contract (issues #125, #143, and #177)', () => {
  test('shared reference defines managed version 3, lifecycle status, and collision rules', () => {
    const contract = read('references/contribution-gate.md');

    expect(contract).toContain('.github/workflows/nmg-sdlc-contribution-gate.yml');
    expect(contract).toContain('# nmg-sdlc-managed: contribution-gate');
    expect(contract).toContain('# nmg-sdlc-managed-version: 3');
    expect(contract).toContain('| Current numeric version | `3` |');
    expect(contract).toContain('Workflow: created | updated | already present | skipped');
    expect(contract).toContain('skipped (unmanaged file at path)');
    expect(contract).toContain('skipped (newer managed version)');
    expect(contract).toContain('Preserve every unrelated workflow under `.github/workflows/` byte-for-byte');
  });

  test('version-3 template separates executable child and coordination aggregate evidence', () => {
    const template = workflowTemplate();

    expect(template).toContain('const MAX_SPEC_DIRECTORIES = 5');
    expect(template).toContain('const MAX_DIAGNOSTIC_PATHS = 20');
    expect(template).toContain('const SPEC_ARTIFACTS =');
    expect(template).toContain('const AGGREGATE_ARTIFACTS =');
    expect(template).toContain("['requirements.md', 'design.md', 'epic-scope.json']");
    expect(template).toContain('new Set()');
    expect(template).toContain('resolveSpecDirectories');
    expect(template).toContain('(?:feature\\.gherkin|issue-scope\\.json|epic-link\\.json)');
    expect(template).toContain('resolveAggregateDirectories');
    expect(template).toContain("(?:requirements\\.md|design\\.md|epic-scope\\.json)");
    expect(template).not.toContain('epic-requirements\\.md|epic-design\\.md');
    expect(template).toContain('mismatchedSpecs');
    expect(template).toContain('invalidAggregatePaths');
    expect(template).toContain('Epic aggregate evidence is coordination-only');
    expect(template).toContain('Aggregates may contain only requirements.md, design.md, and epic-scope.json');
    expect(template).toContain('classifyChangedPath');
    expect(template).toContain('Unmatched changed paths');
    expect(template).toContain('hasSpecificVerification');
    expect(template).toContain('Missing specific verification');
    expect(template).toContain('SDLC-Exception');
    expect(template).toContain('listLabelsOnIssue');
    expect(template).toContain("label).toLowerCase() === 'spike'");
  });

  test('workflow keeps external text inert and retains minimal permissions', () => {
    const template = workflowTemplate();

    expect(template).toContain('on:\n  pull_request:');
    expect(template).toContain('permissions:\n  contents: read\n  pull-requests: read');
    expect(template).toContain('actions/github-script@v7');
    expect(template).toContain('stripQuotedHistory');
    expect(template).toContain('withoutComments');
    expect(template).toContain('summarizePaths');
    expect(template).toContain('See CONTRIBUTING.md');
    expect(template).not.toContain('pull_request_target');
    expect(template).not.toMatch(/\bsecrets\./);
    expect(template).not.toContain('actions/checkout');
    expect(template).not.toMatch(/\b(?:eval|Function)\s*\(/);
    expect(template).not.toMatch(/\bnpm\s+install\b|\bpip\s+install\b|\bcargo\s+test\b/);
  });

  test('dogfooded workflow exactly matches the canonical embedded template', () => {
    expect(read('.github/workflows/nmg-sdlc-contribution-gate.yml')).toBe(`${workflowTemplate()}\n`);
  });

  test('onboarding and upgrade distribute the versioned shared contract', () => {
    const onboarding = read('skills/onboard-project/SKILL.md');
    const upgradeProject = read('skills/upgrade-project/SKILL.md');
    const upgradeProcedures = read('skills/upgrade-project/references/upgrade-procedures.md');

    expect(onboarding).toContain('Read `../../references/contribution-gate.md` and `../../references/issue-form.md` after steering verification succeeds');
    expect(onboarding).toContain('**Contribution Gate**');
    expect(upgradeProject).toContain('`../../references/contribution-gate.md`');
    expect(upgradeProject).toContain('.github/workflows/nmg-sdlc-contribution-gate.yml');
    expect(upgradeProject).toContain('### Step 5: Analyze Managed Repository Assets');
    expect(upgradeProcedures).toContain('Follow `../../references/contribution-gate.md`');
    expect(upgradeProcedures).toContain('unmarked path collision');
  });

  test('public guidance describes correlation, path evidence, verification, and reduced modes', () => {
    const readme = read('README.md');
    const guide = read('references/contribution-guide.md');
    const changelog = read('CHANGELOG.md');

    expect(readme).toContain('checks issue/spec identity');
    expect(readme).toContain('documented exception predicates');
    expect(readme).toContain('does not replace project CI or human review');
    expect(guide).toContain('Issue/spec identity');
    expect(guide).toContain('Directory-prefix evidence');
    expect(guide).toContain('Command and outcome');
    expect(guide).toContain('SDLC-Exception: docs-only');
    expect(guide).toContain('Spike/ADR');
    expect(changelog).toContain('issue #143');
  });
});
