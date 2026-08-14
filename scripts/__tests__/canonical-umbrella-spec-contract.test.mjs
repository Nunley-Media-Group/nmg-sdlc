import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('canonical umbrella-spec contracts', () => {
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
    expect(shared).toContain('--all --json');
    for (const status of ['canonical', 'canonical_marker_lost', 'stranded_recoverable', 'divergent', 'ambiguous', 'unverifiable']) {
      expect(shared).toContain(`\`${status}\``);
    }
    expect(shared).toContain('<!-- nmg-sdlc:umbrella-spec');
    expect(shared).toContain('tree: <full-git-tree-oid>');
    expect(shared).toContain('Default-branch content always wins');
  });

  test('seal flow enforces exact staging before publication and child transition', () => {
    const seal = writeSpec.indexOf('#### 3b.2 Seal Exact Scope');
    const publish = writeSpec.indexOf('#### 3b.3 Classify and Publish');
    const children = writeSpec.indexOf('#### 3b.4 Offer Child-Issue Creation After Canonical Proof');
    expect(seal).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(seal);
    expect(children).toBeGreaterThan(publish);
    expect(writeSpec).toContain('git diff --name-only <default-commit>...<full-seal-commit>');
    expect(writeSpec).toContain('`VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, marketplace files');
    expect(writeSpec).toContain('Refs #N');
    expect(writeSpec).toContain('nmg-sdlc/spec-publication-N-<first-12-characters-of-source-tree>');
    expect(writeSpec).toContain('git push origin <full-seal-commit>:refs/heads/{publicationHead}');
    expect(writeSpec).toContain('Never create or link this ref with `gh issue develop`');
    expect(writeSpec).toContain('umbrella-publication-status.mjs');
    expect(writeSpec).toContain('Only the exact reopen approval permits `gh issue reopen N`');
    expect(writeSpec).toContain('Never approve or merge it automatically');
    expect(writeSpec).toContain('`publication_pending`');
    expect(writeSpec).toContain('recorded no coordination parent for the current issue');
    expect(writeSpec).toContain('must not create a child-numbered seal commit or a second umbrella publication PR');
    expect(writeSpec).toContain('continue to its normal `$nmg-sdlc:write-code #N` handoff');
    expect(writeSpec).toContain('One open match on `publicationHead`');
    expect(writeSpec).toContain('One merged match on either the dedicated head or a historical issue-linked head');
    expect(writeSpec).toContain('a closed-unmerged match, or multiple exact matches → stop');
    expect(writeSpec).toContain('No match → create one PR');
    expect(shared).toContain('## Dedicated Publication Ref');
    expect(shared).toContain('## GitHub Closing-Semantic Gate');
    expect(shared).toContain('## Exact Reopen Recovery');
    expect(shared).toContain('`pending_safe`');
    expect(shared).toContain('`publication_closed_umbrella`');
    expect(publicationHelper).toContain('closingIssuesReferences(first: 100)');
    expect(publicationHelper).toContain('itemTypes: [CLOSED_EVENT]');
    expect(publicationHelper).toContain("result('closing_relationship'");
    expect(publicationHelper).toContain("result('publication_closed_umbrella'");
    expect(umbrellaMode).toContain('the freshly fetched remote default branch');
    expect(umbrellaMode).toContain('stop before Step 1');
  });

  test('ordinary delivery closure remains outside the Seal-Spec semantic contract', () => {
    expect(shared).toContain('Ordinary implementation PR closure remains owned by `$nmg-sdlc:open-pr`');
    expect(writeSpec).toContain('Ordinary implementation issue closure remains owned by `$nmg-sdlc:open-pr` and is unchanged');
    expect(publicationHelper).not.toContain('gh issue reopen');
    expect(publicationHelper).not.toContain("['issue', 'reopen'");
  });

  test('live GitHub exercise is explicit and verifies both linked and unlinked outcomes', () => {
    expect(livePublicationExercise).toContain("'acknowledge-live-writes'");
    expect(livePublicationExercise).toContain('--repository must be an explicit owner/name disposable repository');
    expect(livePublicationExercise).toContain("waitForStatus('publication_closed_umbrella'");
    expect(livePublicationExercise).toContain("waitForStatus('merged_safe'");
    expect(livePublicationExercise).toContain("safeBefore.status !== 'pending_safe'");
    expect(livePublicationExercise).toContain('publicationClosedEvents.length !== 0');
  });

  test('all child entry points gate before their first mutation', () => {
    expect(relationships).toContain('Canonical Parent-Spec Readiness');
    expect(relationships).toContain('Only `canonical` and `canonical_marker_lost`');

    const startGate = startIssue.indexOf('## Step 3.25: Canonical Parent-Spec Gate');
    const staleBranch = startIssue.indexOf('## Step 3.5: Reconcile Stale Remote Branch');
    expect(startGate).toBeGreaterThan(0);
    expect(staleBranch).toBeGreaterThan(startGate);
    expect(startIssue).toContain('before dirty-tree handling, branch creation/switching');

    const specGate = writeSpec.indexOf('## Canonical Parent-Spec Gate');
    const specDiscovery = writeSpec.indexOf('## Spec Discovery');
    expect(specGate).toBeGreaterThan(0);
    expect(specDiscovery).toBeGreaterThan(specGate);
    expect(writeSpec).toContain('Before Spec Discovery, bug/spike variant selection, or any Phase 1 write');
    expect(writeSpec).toContain('Bug- and spike-labelled child issues still follow their existing creation variants after this gate');
    expect(discovery).toContain('Consume the current gate result');
    expect(discovery).toContain('recorded canonical `specPath`');
    expect(discovery).not.toContain('gh issue view #N --json parent');

    const codeGate = writeCode.indexOf('### Step 1.75: Canonical Parent-Spec Gate');
    const readSpecs = writeCode.indexOf('### Step 2: Read Specs');
    expect(codeGate).toBeGreaterThan(0);
    expect(readSpecs).toBeGreaterThan(codeGate);
    expect(writeCode).toContain('before spec loading, plan review, delegation, or edits');
    expect(writeCode).toContain('The active child branch may contain approved child-scoped amendments to that same spec path');
    expect(shared).toContain('Parent readiness proves the canonical baseline path, not equality with a child branch');
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
