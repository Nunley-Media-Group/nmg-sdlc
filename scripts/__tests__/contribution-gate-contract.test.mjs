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

describe('contribution gate contract (issue #125)', () => {
  test('shared reference defines managed path, marker, version, status, and collision rules', () => {
    const contract = read('references/contribution-gate.md');

    expect(contract).toContain('.github/workflows/nmg-sdlc-contribution-gate.yml');
    expect(contract).toContain('# nmg-sdlc-managed: contribution-gate');
    expect(contract).toContain('# nmg-sdlc-managed-version: 1');
    expect(contract).toContain('Workflow: created | updated | already present | skipped');
    expect(contract).toContain('skipped (unmanaged file at path)');
    expect(contract).toContain('skipped (newer managed version)');
    expect(contract).toContain('Preserve every unrelated workflow under `.github/workflows/` byte-for-byte');
  });

  test('workflow template is safe, stack-agnostic, and uses minimal permissions', () => {
    const template = workflowTemplate();

    expect(template).toContain('on:\n  pull_request:');
    expect(template).toContain('permissions:\n  contents: read\n  pull-requests: read');
    expect(template).toContain('actions/github-script@v7');
    expect(template).toContain('Missing issue evidence');
    expect(template).toContain('Missing spec evidence');
    expect(template).toContain('Missing steering evidence');
    expect(template).toContain('Missing verification evidence');
    expect(template).toContain('CONTRIBUTING.md');
    expect(template).not.toContain('pull_request_target');
    expect(template).not.toMatch(/\bsecrets\./);
    expect(template).not.toContain('actions/checkout');
    expect(template).not.toMatch(/\bnpm\s+install\b|\bpip\s+install\b|\bcargo\s+test\b/);
  });

  test('init-config and upgrade-project reference the shared contribution-gate contract', () => {
    const initConfig = read('skills/init-config/SKILL.md');
    const upgradeProject = read('skills/upgrade-project/SKILL.md');
    const upgradeProcedures = read('skills/upgrade-project/references/upgrade-procedures.md');

    expect(initConfig).toContain('Read `../../references/contribution-gate.md` when runner config setup reaches managed project artifact creation');
    expect(initConfig).toContain('Contribution Gate status block');
    expect(upgradeProject).toContain('Read `../../references/contribution-gate.md` when analyzing or applying contribution-gate findings');
    expect(upgradeProject).toContain('.github/workflows/nmg-sdlc-contribution-gate.yml — Managed non-destructive GitHub Actions contribution gate');
    expect(upgradeProject).toContain('### Step 7b: Analyze Contribution Gate');
    expect(upgradeProcedures).toContain('Apply approved or unattended-managed findings from `../../references/contribution-gate.md`');
    expect(upgradeProcedures).toContain('Workflow: created | updated | already present | skipped');
  });

  test('public docs and contribution guide describe generated gate behavior', () => {
    const readme = read('README.md');
    const guide = read('references/contribution-guide.md');
    const changelog = read('CHANGELOG.md');

    expect(readme).toContain('installs `.github/workflows/nmg-sdlc-contribution-gate.yml`');
    expect(readme).toContain('uses read-only GitHub token permissions');
    expect(readme).toContain('does not replace project CI or human review');
    expect(guide).toContain('PR readiness checklist');
    expect(guide).toContain('Contribution-gate remediation');
    expect(changelog).toContain('managed GitHub Actions contribution gates for issue #125');
  });
});
