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
    expect(shared).toContain('| `consistency` | `not-applicable`, `consistent`, `legacy`, `inconsistent`, `ambiguous`, `unverifiable` |');
    expect(shared).toContain('| `nativeAuthority` | `not-applicable`, `native`, `checklist-fallback`, `incomplete` |');
    expect(shared).toContain('| `degraded` | Boolean indicating incomplete, legacy, conflicting, or drifted evidence |');
    expect(shared).toContain('| Confirmed `epic` target, one matching `epic-child-of-P`');
    expect(shared).toContain('| Confirmed target lacks `epic` and is not claimed by a child label | `execution-dependency` |');
    expect(shared).toContain('| A claimed coordination target cannot be hydrated | `unverifiable` |');
    expect(shared).toContain('Could not confirm relationship metadata for child #C -> target #T');
    expect(shared).toContain('Checklist fallback never authorizes completion, version classification, delivery, or any consuming mutation');
    expect(shared).toContain('scripts/epic-relationships.mjs');
  });

  test('the issue producer persists identity and write-spec revalidates without creating epic work', () => {
    expect(draftIssue).toContain('Depends on: #{epic-number}');
    expect(draftIssue).toContain('gh issue edit <parent.issueNumber> --add-sub-issue <child.issueNumber>');
    expect(draftIssue).toContain('Do not enqueue `session.dag` or child-scoped `activeDag` prerequisite edges here');
    expect(draftIssue).toContain("This operation is the queue's sole append owner");
    expect(draftIssue).toContain('`childDagsByEpic[scopeId]`');
    expect(draftIssue).toContain('the created epic issue number as the separate `coordinationParentNumber`');
    expect(draftIssue).toContain('Step 10.4');
    expect(draftIssue).toContain('Re-Fetch and Verify the Complete Expected Edge Set');
    expect(draftIssue).toContain('native-degraded partial handoff');
    expect(draftIssue).toContain('never create a replacement child or a second native parent');
    expect(draftIssue).not.toContain('session.epicChildIssues');
    expect(draftIssue).toContain('Never resolve an `A1`-style token from the outer batch or a different epic scope');
    expect(draftIssue).toContain('Never replace or mutate the outer `session.proposedSplit` or `session.dag`');
    expect(draftIssue).toContain('classify the edge as planned/abandoned rather than missing concrete evidence');
    expect(draftIssue).toContain('epic-child-of-<epic>');
    expect(draftIssue).toContain('identity = durable');
    expect(draftIssue).toContain('nativeAuthority = native');

    expect(writeSpecSkill).toContain('Before Spec Discovery, bug/spike routing, interviews, or writes');
    expect(writeSpecSkill).toContain('`epic-child` requires consistent native authority');
    expect(writeSpecSkill).toContain('complete informational lineage and fully paged direct-child inventory');
    expect(writeSpecSkill).toContain('--project <project-root> --child C');
    expect(writeSpecSkill).toContain('Any legacy cumulative package, `repair_required`, or `unverifiable` result stops before file mutation');
    expect(writeSpecSkill).toContain('First-child mode reviews one aggregate plus one separate child package');
    expect(umbrellaMode).toContain('Resolve all paths and issue numbers through `epic-spec-authority.mjs`');
    expect(umbrellaMode).toContain('never starts an epic, creates an epic branch');
  });

  test('start-issue applies the shared result before filtering or mutation', () => {
    expect(startIssue).toContain('Read `../../references/epic-relationships.md` when Step 1a begins');
    expect(startIssue).toContain('`parentNumber`, `identity`, `consistency`, `nativeAuthority`, `degraded`, `coordinationPairs`, `executionDependencies`');
    expect(startIssue).toContain('Build `parentsOf: Map<issue_number, Set<parent_number>>` for readiness from `executionDependencies` only');
    expect(startIssue).toContain('Page every candidate and native-parent `subIssues` connection');
    expect(startIssue).toContain('Add `P` to `parentsOf[C]` only when the classified pair appears in `executionDependencies`');
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

  test('child package routing and native-authoritative sibling discovery remain aligned', () => {
    expect(writeSpecDiscovery).toContain('A confirmed epic child is routed by');
    expect(writeSpecDiscovery).toContain('keyword similarity can never select an aggregate or sibling package');
    expect(writeSpecDiscovery).toContain('Only `ordinary` reaches Step 1');

    expect(writeCode).toContain('Step 1.75: Epic Spec Authority Gate');
    expect(writeCode).toContain('--project <project-root> --child N');
    expect(verifyCode).toContain('Step 0.75: Coordination Identity Gate');
    expect(verifyCode).toContain('--project <project-root> --child N');

    expect(openPr).toContain("GraphQL `subIssues` to exhaustion as the authoritative set");
    expect(openPr).toContain('--parent-issue E --json');
    expect(openPr).toContain('before sibling classification, version artifacts, commits, pushes, or PR mutation');
    expect(openPr).toContain('`nativeOnly` and `checklistOnly`');
    expect(openPr).toContain("siblingClass = 'intermediate'");
  });

  test('upgrade recovery is exact, approval-gated, revalidated, and idempotent', () => {
    expect(upgrade).toContain('Step 3.6: Audit Umbrella Identity');
    expect(upgrade).toContain('marks the overall identity audit incomplete');
    expect(upgrade).toContain('never interpret an omitted page or inaccessible relationship as absence');
    expect(upgrade).toContain('Each deterministic umbrella-identity mutation set');
    expect(upgrade).toContain('including exact-evidence re-fetch, drift comparison');
    expect(recovery).toContain('Do not mutate GitHub during audit');
    expect(recovery).toContain('Silence, timeout');
    expect(recovery).toContain('Re-fetch the exact approved parent and children');
    expect(recovery).toContain('Abort on drift');
    expect(recovery).toContain('gh issue edit P --add-sub-issue C');
    expect(recovery).toContain('Body relationship missing');
    expect(recovery).toContain('Confirmed `epic` parent with one unambiguous approved coordination-child set');
    expect(recovery).toContain('persist that exact `OWNER/REPO` as `AUDITED_REPO`');
    expect(recovery).toContain('server-enforced compare-and-set');
    expect(recovery).toContain('require it to propose no further mutation for those records');
    expect(recovery).toContain('do not fail proof of the approved set');
  });

  test('historical issue #149 and current issue #160 regression specs remain intact', () => {
    expect([...issue149Gherkin.matchAll(/^  Scenario:/gm)]).toHaveLength(6);
    expect([...issue149Gherkin.matchAll(/^  @regression$/gm)]).toHaveLength(6);
    expect(issue149Gherkin).toContain('native-plus-body, body-only, native-only, non-epic, and metadata-failure cases');

    expect([...issue160Gherkin.matchAll(/^  Scenario:/gm)]).toHaveLength(11);
    expect([...issue160Gherkin.matchAll(/^  @regression$/gm)]).toHaveLength(11);
    expect(issue160Gherkin).toContain('separate planning, start, spec, code, verify, status, and PR-preparation evaluations');
    expect(issue160Gherkin).toContain('the identity is unverifiable and authority is checklist-fallback');
    expect(issue160Gherkin).toContain('no replacement child or second native parent is created');
  });
});
