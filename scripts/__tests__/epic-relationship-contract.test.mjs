/**
 * Cross-skill contract coverage for issue #149.
 *
 * The relationship graph is produced and consumed by the surviving manual
 * skill pipeline. These assertions keep identity signals and role semantics
 * aligned without executing prompt content.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('epic relationship contract', () => {
  const shared = read('references/epic-relationships.md');
  const startIssue = read('skills/start-issue/SKILL.md');
  const draftIssue = read('skills/draft-issue/references/multi-issue.md');
  const writeSpec = read('skills/write-spec/references/discovery.md');
  const openPr = read('skills/open-pr/references/version-bump.md');
  const writeCode = read('skills/write-code/SKILL.md');
  const gherkin = read('specs/bug-fix-epic-membership-deadlocking-issue-selection/feature.gherkin');

  test('canonical decision table is fail-safe and excludes only confirmed epics', () => {
    expect(shared).toContain('| Metadata confirms an `epic` label | `epic-membership` |');
    expect(shared).toContain('| Metadata succeeds without an `epic` label | `execution-dependency` |');
    expect(shared).toContain('| Metadata is missing, malformed, or the lookup fails | `execution-dependency` |');
    expect(shared).toContain('exclude it from blockers, blocked counts, and topological in-degree');
    expect(shared).toContain('Could not confirm relationship metadata for child #C -> target #T');
  });

  test('draft-issue preserves both epic identity signals', () => {
    expect(draftIssue).toContain('Depends on: #{epic-number}');
    expect(draftIssue).toContain('gh issue edit <child> --add-parent <epic>');
    expect(draftIssue).toContain('apply `enhancement` (NOT `epic`) to every child');
  });

  test('start-issue loads and applies the shared role contract before filtering', () => {
    expect(startIssue).toContain('Read `../../references/epic-relationships.md` when Step 1a begins');
    expect(startIssue).toContain('Classify each pair as `epic-membership` or `execution-dependency`');
    expect(startIssue).toContain('A confirmed epic-membership target never blocks');
    expect(startIssue).toContain('target lookup failure retains that relationship as blocking');
  });

  test('shared contract covers every surviving manual consumer', () => {
    expect(shared).toContain('start-issue');
    expect(shared).toContain('write-spec');
    expect(shared).toContain('write-code');
    expect(shared).toContain('open-pr');
    expect(shared).not.toMatch(/sdlc-(?:runner|state|config)/i);
    expect(shared).not.toMatch(/unattended[- ]mode/i);
  });

  test('write-spec and open-pr retain the same parent identity consumers', () => {
    expect(writeSpec).toContain('`Depends on:`');
    expect(writeSpec).toContain('`Blocks:`');
    expect(writeSpec).toContain('GitHub GraphQL');
    expect(writeSpec).not.toContain('gh issue view #N --json parent');
    expect(writeSpec).toContain('canonical `specPath`');

    expect(openPr).toContain('supported body signals');
    expect(openPr).toContain('native parent through GitHub GraphQL');
    expect(openPr).not.toContain('gh issue view #N --json parent');
    expect(openPr).toContain("siblingClass = 'intermediate'");

    expect(writeCode).toContain('Canonical Parent-Spec Gate');
    expect(writeCode).toContain('--parent-issue P --json');
  });

  test('the historical issue #149 regression spec remains intact', () => {
    const scenarios = [...gherkin.matchAll(/^  Scenario:/gm)];
    const regressionTags = [...gherkin.matchAll(/^  @regression$/gm)];
    expect(scenarios).toHaveLength(6);
    expect(regressionTags).toHaveLength(6);
    expect(gherkin).toContain('native-plus-body, body-only, native-only, non-epic, and metadata-failure cases');
  });
});
