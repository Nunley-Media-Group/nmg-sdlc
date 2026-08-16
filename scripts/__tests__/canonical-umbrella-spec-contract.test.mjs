import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('canonical epic and legacy umbrella-spec contracts', () => {
  const shared = read('references/canonical-umbrella-spec.md');
  const publicationHelper = read('scripts/umbrella-publication-status.mjs');
  const livePublicationExercise = read('scripts/exercise-github-umbrella-publication.mjs');
  const relationships = read('references/epic-relationships.md');
  const writeSpec = read('skills/write-spec/SKILL.md');
  const umbrellaMode = read('skills/write-spec/references/umbrella-mode.md');
  const discovery = read('skills/write-spec/references/discovery.md');
  const startIssue = read('skills/start-issue/SKILL.md');
  const writeCode = read('skills/write-code/SKILL.md');
  const openPrVersioning = read('skills/open-pr/references/version-bump.md');
  const upgrade = read('skills/upgrade-project/SKILL.md');
  const recovery = read('skills/upgrade-project/references/sealed-spec-recovery.md');
  const upgradeProcedures = read('skills/upgrade-project/references/upgrade-procedures.md');
  const gherkin = read('specs/bug-fix-sealed-umbrella-specs-stranded-outside-the-default-branch/feature.gherkin');
  const closingGherkin = read('specs/bug-prevent-spec-only-publication-from-closing-umbrella-issues/feature.gherkin');

  test('shared contract defines stable helper modes, statuses, and marker identity', () => {
    expect(shared).toContain('--parent-issue <N> --json');
    expect(shared).toContain('--spec <specs/slug> --source <commit-ish> --json');
    expect(shared).toContain('--aggregate <specs/epic-slug> --child-spec <specs/child-slug> --source <commit-ish> --json');
    expect(shared).toContain('--all --json');
    for (const status of ['canonical', 'canonical_marker_lost', 'stranded_recoverable', 'divergent', 'ambiguous', 'unverifiable']) {
      expect(shared).toContain(`\`${status}\``);
    }
    expect(shared).toContain('<!-- nmg-sdlc:umbrella-spec');
    expect(shared).toContain('<!-- nmg-sdlc:aggregate-child-spec');
    expect(shared).toContain('digest: <sha256-of-normalized-pair>');
    expect(shared).toContain('tree: <full-git-tree-oid>');
    expect(shared).toContain('Default-branch content always wins');
  });

  test('aggregate plus child publication is exact, non-closing, and release-neutral', () => {
    expect(writeSpec).toContain('### Aggregate + Active-Child Publication');
    expect(writeSpec).toContain('--aggregate specs/epic-<slug>');
    expect(writeSpec).toContain('--child-spec specs/<type>-<child-slug>');
    expect(writeSpec).toContain('Its body uses `Refs #E` and `Refs #C`');
    expect(writeSpec).toContain('it never starts or closes the epic or child');
    expect(writeSpec).toContain('Never auto-repair, force-push, touch release artifacts');
    expect(writeSpec).toContain('After merge, rerun both helpers');
    expect(writeSpec).toContain('`pending_safe` reports `publication_pending` and stops before code');
    expect(writeSpec).toContain('Legacy Cumulative Multi-PR Compatibility');
    expect(writeSpec).toMatch(/New\s+writes cannot create, seal, publish, extend, or append children to that format/);
    expect(writeSpec).toContain('Never offer the historical seal gate');
    expect(umbrellaMode).toContain('### First child');
    expect(umbrellaMode).toContain('### Later child');
    expect(umbrellaMode).toContain('### Existing child');
    expect(umbrellaMode).toMatch(/does\s+not contain a creation, seal, publication, child-generation, or body-fallback\s+recipe/);
    expect(shared).toContain('For a new aggregate/child pair, use the pair-derived ref documented above');
    expect(shared).toContain('references both issues and closes neither');
    expect(shared).toContain('## Dedicated Publication Ref');
    expect(shared).toContain('## GitHub Closing-Semantic Gate');
    expect(shared).toContain('## Exact Reopen Recovery');
    expect(shared).toContain('`pending_safe`');
    expect(shared).toContain('`publication_closed_umbrella`');
    expect(publicationHelper).toContain('closingIssuesReferences(first: 100)');
    expect(publicationHelper).toContain('itemTypes: [CLOSED_EVENT, REOPENED_EVENT]');
    expect(publicationHelper).toContain('evidence.activeClosure = null');
    expect(publicationHelper).toContain("evidence.activeClosure?.publicationCloser === true");
    expect(publicationHelper).toContain("result('closing_relationship'");
    expect(publicationHelper).toContain("result('publication_closed_umbrella'");
  });

  test('spec publication never owns executable issue or epic completion', () => {
    expect(shared).toContain('Ordinary implementation PR closure remains owned by `$nmg-sdlc:open-pr`');
    expect(writeSpec).toContain('it never starts or closes the epic or child');
    expect(writeSpec).toContain('$nmg-sdlc:open-pr #N (review + merge + closure)');
    expect(publicationHelper).not.toContain('gh issue reopen');
    expect(publicationHelper).not.toContain("['issue', 'reopen'");
  });

  test('live GitHub exercise is explicit and verifies linked, unlinked, and aggregate-child outcomes', () => {
    expect(livePublicationExercise).toContain("'acknowledge-live-writes'");
    expect(livePublicationExercise).toContain('--repository must be an explicit owner/name disposable repository');
    expect(livePublicationExercise).toContain("waitForStatus('publication_closed_umbrella'");
    expect(livePublicationExercise).toContain("waitForStatus('merged_safe'");
    expect(livePublicationExercise).toContain("safeBefore.status !== 'pending_safe'");
    expect(livePublicationExercise).toContain('publicationClosedEvents.length !== 0');
    expect(livePublicationExercise).toContain('aggregatePublicationBranchName(pairIdentity)');
    expect(livePublicationExercise).toContain('aggregatePublicationMarker({');
    expect(livePublicationExercise).toContain('`Refs #${epicIssueNumber} and #${childIssueNumber}`');
    expect(livePublicationExercise).toContain("pairBefore.status !== 'pending_safe'");
    expect(livePublicationExercise).toContain("const pairAfter = await waitForStatus('merged_safe'");
    expect(livePublicationExercise).toContain("pairAfter.evidence.childIssueState !== 'OPEN'");
    expect(livePublicationExercise).toContain('pairAfter.evidence.closingIssueNumbers.length !== 0');
  });

  test('all child entry points gate before their first mutation', () => {
    expect(relationships).toContain('Canonical Parent-Spec Readiness');
    expect(relationships).toContain('`start-issue` does not run it');
    expect(relationships).toContain('`planned/aggregate_not_authored` only for the first');
    expect(relationships).toContain('require `canonical` or');

    const startGate = startIssue.indexOf('## Step 3.25: Fresh Relationship and Readiness Gate');
    const staleBranch = startIssue.indexOf('## Step 3.5: Reconcile Stale Remote Branch');
    expect(startGate).toBeGreaterThan(0);
    expect(staleBranch).toBeGreaterThan(startGate);
    expect(startIssue).toContain('Do not require an aggregate or child spec here');
    expect(startIssue).toContain('before dirty-tree handling, branch creation/switching');

    const specGate = writeSpec.indexOf('## Epic Role and Authority Gate');
    const specDiscovery = writeSpec.indexOf('## Spec Discovery');
    expect(specGate).toBeGreaterThan(0);
    expect(specDiscovery).toBeGreaterThan(specGate);
    expect(writeSpec).toContain('Before Spec Discovery, bug/spike routing, interviews, or writes');
    expect(writeSpec).toContain('First-child mode reviews one aggregate plus one separate child package');
    expect(discovery).toContain('A confirmed epic child is routed by');
    expect(discovery).toContain('keyword similarity can never select an aggregate or sibling package');
    expect(discovery).not.toContain('gh issue view #N --json parent');

    const codeGate = writeCode.indexOf('### Step 1.75: Epic Spec Authority Gate');
    const readSpecs = writeCode.indexOf('### Step 2: Read Specs');
    expect(codeGate).toBeGreaterThan(0);
    expect(readSpecs).toBeGreaterThan(codeGate);
    expect(writeCode).toContain('before spec loading, plan review, delegation, or edits');
    expect(writeCode).toContain('Resolve the active spec from `requestedChild.specPath`');
    expect(shared).toMatch(/parent-mode legacy proof alone cannot\s+authorize a new epic child/);
  });

  test('every native-parent consumer uses GraphQL rather than unsupported gh JSON', () => {
    for (const source of [relationships, startIssue, writeSpec, discovery, writeCode, openPrVersioning]) {
      expect(source).not.toMatch(/gh issue view[^\n`]*--json parent/);
    }
    expect(relationships).toContain('Discover native parents and sub-issues through GitHub GraphQL');
    expect(openPrVersioning).toContain('query native parent/sub-issue data through GitHub GraphQL');
  });

  test('upgrade recovery requires exact approval, revalidation, and default preservation', () => {
    expect(upgrade).toContain('Sealed Umbrella Specs');
    expect(upgrade).toContain('Each `stranded_recoverable` sealed-spec finding');
    expect(upgrade).toContain('fresh reclassification and exact-source checks');
    expect(upgradeProcedures).toContain('Route each exact finding through `sealed-spec-recovery.md`');
    expect(recovery).toContain('Do not infer recovery approval');
    expect(recovery).toContain('git ls-files --stage -z');
    expect(recovery).toContain('git restore --source=<full-source-commit> --worktree');
    expect(recovery).toContain('Do not pass `--staged`');
    expect(recovery).toContain('prepared for publication');
    expect(recovery).toContain('No branch/ref, release artifact, or GitHub state changed');
  });

  test('issue #157 retains one regression scenario per acceptance criterion', () => {
    expect([...gherkin.matchAll(/^  Scenario:/gm)]).toHaveLength(7);
    expect([...gherkin.matchAll(/^  @regression$/gm)]).toHaveLength(7);
    expect(gherkin).toContain('Every child entry point fails closed on an uncanonical parent spec');
    expect(gherkin).toContain('A divergent default-branch spec is never overwritten');
  });

  test('issue #161 retains one regression scenario per acceptance criterion', () => {
    expect([...closingGherkin.matchAll(/^  Scenario:/gm)]).toHaveLength(7);
    expect([...closingGherkin.matchAll(/^  @regression$/gm)]).toHaveLength(7);
    expect(closingGherkin).toContain('Publish an umbrella specification without a closing relationship');
    expect(closingGherkin).toContain('Recover only an umbrella closed by its exact marked publication');
    expect(closingGherkin).toContain('Preserve intentional closure for ordinary implementation delivery');
  });
});
