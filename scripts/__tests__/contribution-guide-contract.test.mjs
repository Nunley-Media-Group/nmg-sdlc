import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('contribution guide contract (issues #109, #143, and #177)', () => {
  test('shared reference defines generation, preservation, README, steering, lifecycle, and status rules', () => {
    const contract = read('references/contribution-guide.md');

    expect(contract).toContain('CONTRIBUTING.md: created | updated | already present | skipped');
    expect(contract).toContain('README.md link: added | already present | skipped (README missing)');
    expect(contract).toContain('steering/product.md');
    expect(contract).toContain('steering/tech.md');
    expect(contract).toContain('steering/structure.md');
    expect(contract).toContain('Never overwrite an existing `CONTRIBUTING.md`');
    expect(contract).toContain('Never create a `README.md`');
    expect(contract).toContain('`onboard-project` applies this contract as part of lifecycle setup after steering exists.');
    expect(contract).toContain('`upgrade-project` presents missing-guide creation');
    expect(contract).toContain('## nmg-sdlc Contribution Workflow');
    expect(contract).toContain('PR readiness, evidence-consistency examples, validated exceptions, or managed contribution-gate remediation coverage');
    expect(contract).toContain('append a focused subsection under that existing section instead of duplicating the heading');
    expect(contract).toContain('Issue/spec identity');
    expect(contract).toContain('hidden HTML comments');
    expect(contract).toContain('SDLC-Exception: docs-only');
    expect(contract).toContain('epics cannot be started');
    expect(contract).toContain('children use normal dependency rules');
    expect(contract).toContain('aggregate lineage is informational');
    expect(contract).toContain('`open-pr` continues through exact-head merge and issue closure');
    expect(contract).toContain('eligible epics close automatically');
    expect(contract).toContain('repairs require exact approval');
    expect(contract).toContain('Never generate guidance that starts/specifies/implements an epic');
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

  test('upgrade-project applies only managed contribution-guide findings', () => {
    const skill = read('skills/upgrade-project/SKILL.md');
    const procedures = read('skills/upgrade-project/references/upgrade-procedures.md');

    expect(skill).toContain('`../../references/contribution-guide.md`');
    expect(skill).toContain('CONTRIBUTING.md and README.md');
    expect(skill).toContain('### Step 5: Analyze Managed Repository Assets');
    expect(procedures).toContain('Follow `../../references/contribution-guide.md`');
    expect(procedures).toContain('never create a README just for the link');
  });

  test('public docs and changelog describe onboarding and upgrade behavior', () => {
    const readme = read('README.md');
    const changelog = read('CHANGELOG.md');

    expect(readme).toContain('After steering exists, onboarding manages these repository artifacts directly');
    expect(readme).toContain('`CONTRIBUTING.md` plus an idempotent README link');
    expect(changelog).toContain('Added shared contribution-guide generation for issue #109');
  });
});
