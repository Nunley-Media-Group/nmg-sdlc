/**
 * Cross-skill contract coverage for issues #149 and #160.
 *
 * The relationship graph is produced and consumed by the surviving manual
 * skill pipeline. These assertions keep durable identity, readiness, sibling
 * authority, status, and recovery semantics aligned.
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
  const writeSpecSkill = read('skills/write-spec/SKILL.md');
  const writeSpecDiscovery = read('skills/write-spec/references/discovery.md');
  const umbrellaMode = read('skills/write-spec/references/umbrella-mode.md');
  const openPr = read('skills/open-pr/references/version-bump.md');
  const writeCode = read('skills/write-code/SKILL.md');
  const verifyCode = read('skills/verify-code/SKILL.md');
  const status = read('skills/status/SKILL.md');
  const statusCli = read('scripts/sdlc-status.mjs');
  const upgrade = read('skills/upgrade-project/SKILL.md');
  const recovery = read('skills/upgrade-project/references/epic-identity-recovery.md');
  const issue149Gherkin = read('specs/bug-fix-epic-membership-deadlocking-issue-selection/feature.gherkin');
  const issue160Gherkin = read('specs/bug-persist-multi-pr-umbrella-identity-across-child-workflows/feature.gherkin');

  test('shared decision table is durable, explicit, and fail-safe', () => {
    expect(shared).toContain('| Parent label | `epic` |');
    expect(shared).toContain('| Child label | Exactly one `epic-child-of-P`');
    expect(shared).toContain('| `role` | `ordinary`, `epic`, `epic-child`, `inconsistent`, `ambiguous`, `unverifiable` |');
    expect(shared).toContain('| Confirmed `epic` target, one matching `epic-child-of-P`');
    expect(shared).toContain('| Confirmed target lacks `epic` and is not claimed by a child label | `execution-dependency` |');
    expect(shared).toContain('| A claimed coordination target cannot be hydrated | `unverifiable` |');
    expect(shared).toContain('Could not confirm relationship metadata for child #C -> target #T');
    expect(shared).toContain('scripts/epic-relationships.mjs');
  });

  test('both producers persist and revalidate the full identity tuple', () => {
    expect(draftIssue).toContain('Depends on: #{epic-number}');
    expect(draftIssue).toContain('gh issue edit <child> --add-parent <epic>');
    expect(draftIssue).toContain('epic-child-of-<epic>');
    expect(draftIssue).toContain('identity = durable');

    expect(writeSpecSkill).toContain('apply it to current issue `#N`');
    expect(writeSpecSkill).toContain('Require each child to receive `epic-child-of-N`');
    expect(writeSpecSkill).toContain('require each child to be `role = epic-child`');
    expect(umbrellaMode).toContain('every later command must re-resolve it from GitHub');
  });

  test('start-issue applies the shared result before filtering or mutation', () => {
    expect(startIssue).toContain('Read `../../references/epic-relationships.md` when Step 1a begins');
    expect(startIssue).toContain('`parentNumber`, `identity`, `coordinationPairs`, `executionDependencies`');
    expect(startIssue).toContain('Build `parentsOf: Map<issue_number, Set<parent_number>>` for readiness from `executionDependencies` only');
    expect(startIssue).toContain('A confirmed `role = epic-child` parent never blocks');
    expect(startIssue).toContain('For `inconsistent`, `ambiguous`, or `unverifiable`, stop');
    expect(startIssue).toContain('target lookup failure retains that relationship as blocking');
  });

  test('every surviving lifecycle consumer derives the shared coordination result', () => {
    for (const consumer of ['start-issue', 'write-spec', 'write-code', 'verify-code', 'status', 'open-pr']) {
      expect(shared).toContain(`\`${consumer}\``);
    }
    for (const source of [startIssue, writeSpecSkill, writeCode, verifyCode, status, openPr]) {
      expect(source).toContain('epic-relationships.md');
      expect(source).not.toMatch(/gh issue view[^\n`]*--json parent/);
    }
    expect(statusCli).toContain("from './epic-relationships.mjs'");
    expect(statusCli).toContain('coordination');
    expect(status).toContain("nullable `coordination` field");
  });

  test('canonical child routing and native-authoritative sibling discovery remain aligned', () => {
    expect(writeSpecDiscovery).toContain('`Depends on:`');
    expect(writeSpecDiscovery).toContain('`Blocks:`');
    expect(writeSpecDiscovery).toContain('GitHub GraphQL');
    expect(writeSpecDiscovery).toContain('canonical `specPath`');

    expect(writeCode).toContain('Canonical Parent-Spec Gate');
    expect(writeCode).toContain('--parent-issue P --json');
    expect(verifyCode).toContain('Step 0.75: Coordination Identity Gate');
    expect(verifyCode).toContain('--parent-issue P --json');

    expect(openPr).toContain("GraphQL `subIssues` to exhaustion as the authoritative set");
    expect(openPr).toContain('`nativeOnly` and `checklistOnly`');
    expect(openPr).toContain("siblingClass = 'intermediate'");
  });

  test('upgrade recovery is exact, approval-gated, revalidated, and idempotent', () => {
    expect(upgrade).toContain('Step 3.6: Audit Umbrella Identity');
    expect(upgrade).toContain('Each deterministic umbrella-identity mutation set');
    expect(upgrade).toContain('freshly revalidated recovery contract');
    expect(recovery).toContain('Do not mutate GitHub during audit');
    expect(recovery).toContain('Silence, timeout');
    expect(recovery).toContain('Re-fetch the exact parent and children');
    expect(recovery).toContain('Abort on drift');
    expect(recovery).toContain('it must propose no further mutation');
  });

  test('historical issue #149 and current issue #160 regression specs remain intact', () => {
    expect([...issue149Gherkin.matchAll(/^  Scenario:/gm)]).toHaveLength(6);
    expect([...issue149Gherkin.matchAll(/^  @regression$/gm)]).toHaveLength(6);
    expect(issue149Gherkin).toContain('native-plus-body, body-only, native-only, non-epic, and metadata-failure cases');

    expect([...issue160Gherkin.matchAll(/^  Scenario:/gm)]).toHaveLength(7);
    expect([...issue160Gherkin.matchAll(/^  @regression$/gm)]).toHaveLength(7);
    expect(issue160Gherkin).toContain('separate planning, start, spec, code, verify, status, and PR-preparation evaluations');
  });
});
