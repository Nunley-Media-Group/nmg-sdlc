import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('bounded spec context contract (issue #139)', () => {
  test('shared spec-context reference defines canonical specs, metadata-first scan, caps, thresholds, reasons, and no index', () => {
    const contract = read('references/spec-context.md');

    expect(contract).toContain('Project-root `specs/` is the canonical BDD archive');
    expect(contract).toContain('Legacy `.codex/specs/`');
    expect(contract).toContain('Metadata-First Scan');
    expect(contract).toContain('Do not read every full spec body by default');
    expect(contract).toContain('Cap full related-spec loading at 3 spec directories');
    expect(contract).toContain('Cap interactive candidate presentation at 5 ranked directories');
    expect(contract).toContain('at least one strong signal or at least two medium signals');
    expect(contract).toContain('Ranking reasons must be human-readable');
    expect(contract).toContain('broken related-spec link');
    expect(contract).toContain('Do not create a persistent `specs/INDEX.md`');
  });

  test('affected skills reference the shared spec-context contract', () => {
    expect(read('skills/draft-issue/SKILL.md')).toContain('Read `../../references/spec-context.md` when Step 4 investigates a feature or enhancement');
    expect(read('skills/write-spec/SKILL.md')).toContain('Read `../../references/spec-context.md` when Spec Discovery needs related existing specs');
    expect(read('skills/write-spec/references/discovery.md')).toContain('bounded metadata ranking contract from `../../references/spec-context.md`');
    expect(read('skills/write-code/SKILL.md')).toContain('Read `../../references/spec-context.md` when Step 2 resolves the active spec');
    expect(read('skills/verify-code/SKILL.md')).toContain('Read `../../references/spec-context.md` when Step 1 loads the active spec');
  });

  test('project-agents reference defines managed markers, additive rules, statuses, and safety rules', () => {
    const contract = read('references/project-agents.md');

    expect(contract).toContain('<!-- nmg-sdlc-managed: spec-context -->');
    expect(contract).toContain('<!-- /nmg-sdlc-managed -->');
    expect(contract).toContain('AGENTS.md: created | updated | already present | skipped');
    expect(contract).toContain('Preserve project-authored content byte-for-byte outside the managed section');
    expect(contract).toContain('Equivalent project-authored guidance');
    expect(contract).toContain('Never delete, move, reorder, or reformat project-authored instructions');
    expect(contract).toContain('Never create or modify legacy `.codex/AGENTS.md`');
  });

  test('onboard-project and upgrade-project wire project AGENTS guidance', () => {
    const onboard = read('skills/onboard-project/SKILL.md');
    const greenfield = read('skills/onboard-project/references/greenfield.md');
    const brownfield = read('skills/onboard-project/references/brownfield.md');
    const upgrade = read('skills/upgrade-project/SKILL.md');
    const procedures = read('skills/upgrade-project/references/upgrade-procedures.md');

    expect(onboard).toContain('Read `../../references/project-agents.md` when steering bootstrap or verification succeeds');
    expect(onboard).toContain('**Project AGENTS**');
    expect(greenfield).toContain('Read `../../references/project-agents.md` when Step 2G.2 verifies');
    expect(greenfield).toContain('## Step 2G.2 Project AGENTS Postcondition');
    expect(brownfield).toContain('Read `../../references/project-agents.md` when Step 2B confirms');
    expect(brownfield).toContain('record AGENTS.md outcomes for Step 5');
    expect(upgrade).toContain('Read `../../references/project-agents.md` when analyzing or applying project-AGENTS findings');
    expect(upgrade).toContain('AGENTS.md                           — Managed non-destructive nmg-sdlc spec-context guidance');
    expect(procedures).toContain('Apply approved or unattended-managed findings from `../../references/project-agents.md`');
  });

  test('public docs and changelog describe bounded spec context and managed AGENTS behavior', () => {
    const readme = read('README.md');
    const changelog = read('CHANGELOG.md');

    expect(readme).toContain('## Spec Context');
    expect(readme).toContain('bounded relevant-spec discovery');
    expect(readme).toContain('Root `AGENTS.md` is another managed artifact');
    expect(changelog).toContain('bounded relevant-spec discovery for issue #139');
  });
});
