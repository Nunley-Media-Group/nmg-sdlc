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
  test('shared reference defines managed version 4, lifecycle status, and collision rules', () => {
    const contract = read('references/contribution-gate.md');

    expect(contract).toContain('.github/workflows/nmg-sdlc-contribution-gate.yml');
    expect(contract).toContain('# nmg-sdlc-managed: contribution-gate');
    expect(contract).toContain('# nmg-sdlc-managed-version: 4');
    expect(contract).toContain('| Current numeric version | `4` |');
    expect(contract).toContain('Workflow: created | updated | already present | skipped');
    expect(contract).toContain('skipped (unmanaged file at path)');
    expect(contract).toContain('skipped (newer managed version)');
    expect(contract).toContain('Preserve every unrelated workflow under `.github/workflows/` byte-for-byte');
  });

  test('version-4 template accepts specs/{N}-{slug} and rejects epic aggregates', () => {
    const template = workflowTemplate();
    const live = read('.github/workflows/nmg-sdlc-contribution-gate.yml');

    expect(template).toContain('const MAX_SPEC_DIRECTORIES = 5');
    expect(template).toContain('const MAX_DIAGNOSTIC_PATHS = 20');
    expect(template).toContain('const SPEC_ARTIFACTS =');
    expect(template).toContain("['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']");
    expect(template).toContain('resolveSpecDirectories');
    expect(template).toContain('specs/{N}-{slug}');
    expect(template).toContain('/plan /skill:onboard-project');
    expect(template).toContain('classifyChangedPath');
    expect(template).toContain('Unmatched changed paths');
    expect(template).toContain('hasSpecificVerification');
    expect(template).toContain('Missing specific verification');
    expect(template).toContain('SDLC-Exception');
    expect(template).not.toContain("label).toLowerCase() === 'spike'");
    expect(template).not.toContain('listLabelsOnIssue');
    expect(template).not.toContain('const AGGREGATE_ARTIFACTS');
    expect(template).not.toContain('resolveAggregateDirectories');
    expect(template).not.toContain('invalidAggregatePaths');
    expect(template).not.toContain('OPTIONAL_AUTHORITY_ARTIFACTS');
    expect(template).not.toMatch(/\$nmg-sdlc/);
    expect(live).not.toMatch(/specs\/(?:feature|bug|epic)-/);
    expect(live).not.toMatch(/\$nmg-sdlc/);
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

    expect(onboarding).toContain('/plan /skill:onboard-project');
    expect(upgradeProject).toContain('/plan /skill:upgrade-project');
    expect(upgradeProject).toContain('scripts/sdlc-upgrade.mjs');
  });

  test('public guidance describes correlation, path evidence, verification, and reduced modes', () => {
    const guide = read('references/contribution-guide.md');
    const changelog = read('CHANGELOG.md');

    expect(guide).toContain('specs/{N}-{slug}');
    expect(guide).toContain('SDLC-Exception: docs-only');
    expect(guide).not.toContain('Spike/ADR');
    expect(changelog).toContain('issue #143');
  });
});
