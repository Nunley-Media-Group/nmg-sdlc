import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('contribution guide contract (issue #109)', () => {
  test('shared reference defines generation, preservation, README, steering, mode, and status rules', () => {
    const contract = read('references/contribution-guide.md');

    expect(contract).toContain('CONTRIBUTING.md: created | updated | already present | skipped');
    expect(contract).toContain('README.md link: added | already present | skipped (README missing)');
    expect(contract).toContain('steering/product.md');
    expect(contract).toContain('steering/tech.md');
    expect(contract).toContain('steering/structure.md');
    expect(contract).toContain('Never overwrite an existing `CONTRIBUTING.md`');
    expect(contract).toContain('Never create a `README.md`');
    expect(contract).toContain('Do not call `request_user_input`');
    expect(contract).toContain('## nmg-sdlc Contribution Workflow');
  });

  test('onboard-project references the shared contract and reports contribution-guide status', () => {
    const skill = read('skills/onboard-project/SKILL.md');
    const greenfield = read('skills/onboard-project/references/greenfield.md');
    const brownfield = read('skills/onboard-project/references/brownfield.md');

    expect(skill).toContain('Read `../../references/contribution-guide.md` when steering bootstrap or verification succeeds');
    expect(skill).toContain('**Contribution Guide**');
    expect(greenfield).toContain('Read `../../references/contribution-guide.md` when Step 2G.2 verifies');
    expect(greenfield).toContain('preserves existing contribution content in enhancement mode');
    expect(brownfield).toContain('Read `../../references/contribution-guide.md` when Step 2B confirms');
    expect(brownfield).toContain('existing code and reconciled or source-backfilled specs are part of contribution context');
  });

  test('upgrade-project allows only managed non-destructive file creation for CONTRIBUTING.md', () => {
    const skill = read('skills/upgrade-project/SKILL.md');
    const procedures = read('skills/upgrade-project/references/upgrade-procedures.md');

    expect(skill).toContain('Read `../../references/contribution-guide.md` when analyzing or applying contribution-guide findings');
    expect(skill).toContain('CONTRIBUTING.md                     — Managed non-destructive contribution guide');
    expect(skill).toContain('Create only managed non-destructive files');
    expect(skill).not.toContain('Never create files');
    expect(skill).toContain('never create a missing `README.md`');
    expect(skill).toContain('Contribution Guide (Step 7a)');
    expect(procedures).toContain('Apply approved or unattended-managed findings from `../../references/contribution-guide.md`');
    expect(procedures).toContain('CONTRIBUTING.md: created | updated | already present | skipped');
  });

  test('public docs and changelog describe onboarding and upgrade behavior', () => {
    const readme = read('README.md');
    const changelog = read('CHANGELOG.md');

    expect(readme).toContain('After steering exists, onboarding also ensures a root `CONTRIBUTING.md`');
    expect(readme).toContain('`CONTRIBUTING.md` is one of those artifacts');
    expect(changelog).toContain('Added shared contribution-guide generation for issue #109');
  });
});
