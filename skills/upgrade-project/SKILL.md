---
name: upgrade-project
description: "Upgrade an existing project to the latest nmg-sdlc contract: relocate legacy steering/spec directories, reconcile current templates and managed repository assets, and offer ownership-aware cleanup of obsolete v2 runner artifacts. Use when user says 'upgrade project', 'update templates', 'check for outdated docs', 'sync with latest plugin', 'relocate specs', 'how do I update my project', or 'bring my project up to date'. Preserves project-authored content and requires explicit approval before mutation. Utility skill — run after plugin updates, outside the main SDLC pipeline."
---

# Upgrade Project

Read `../../references/codex-tooling.md` when the workflow starts for Codex-native inspection and editing behavior.

Read `../../references/interactive-gates.md` before every user decision. Present complete findings through `request_user_input`, wait for an explicit response, and finalize a decision-complete `<proposed_plan>` before mutation.

Bring an existing project forward to the current nmg-sdlc contract while preserving project-authored content. This skill owns:

1. Legacy `.codex/steering/` and `.codex/specs/` relocation to project-root `steering/` and `specs/`.
2. Steering/spec template reconciliation and legacy spec-directory migration.
3. `CHANGELOG.md` and `VERSION` reconciliation.
4. Managed contribution guide, project `AGENTS.md`, contribution gate, and structured issue form reconciliation.
5. Interactive v2 cleanup of exact obsolete runner artifacts.
6. Read-only sealed umbrella-spec audit and explicitly approved recovery preparation.
7. Read-only umbrella-identity audit and explicitly approved GitHub metadata repair.

`$nmg-sdlc:upgrade-project` is the only skill that resolves the legacy-layout gate from `../../references/legacy-layout-gate.md`. It reads current templates at runtime so newly introduced sections can be proposed without rewriting existing content.

## Safety Boundary

- Inspect before proposing; list exact paths and exact `.gitignore` lines before any deletion.
- Never delete, move, or overwrite project-authored content merely because its name resembles an nmg-sdlc artifact.
- Never parse, display, execute, or signal content from `.codex/sdlc-state.json`.
- Never mutate repository settings, secrets, branch protection, issue state, or unrelated GitHub metadata. Umbrella label, parent-link, and checklist mutations are allowed only through the separately approved, freshly revalidated recovery contract.
- Preserve unrelated workflows and issue templates byte-for-byte.
- A repeated run must produce no additional diff and report the cleanup state as already clean.

## What Gets Analyzed

```text
.codex/steering/ and .codex/specs/       — legacy canonical-directory relocation
.codex/migration-exclusions.json         — legacy exclusions-file rename
steering/*.md                            — current steering sections
specs/*/{requirements,design,tasks}.md  — current spec sections and frontmatter
specs/*/                                 — legacy directory naming/consolidation
bounded refs/heads/* and refs/remotes/origin/* — sealed umbrella-spec evidence (Git trees only)
current-repository GitHub issue graph         — umbrella labels, native relationships, and supported body representations
.codex/upgrade-exclusions.json          — previously declined steering sections
CHANGELOG.md and VERSION                — release-document consistency
CONTRIBUTING.md and README.md           — managed contribution guidance
AGENTS.md                               — managed bounded spec-context section
.github/workflows/nmg-sdlc-contribution-gate.yml
.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml
sdlc-config.json                        — exact v2 cleanup candidate; contents are not read
.codex/unattended-mode                  — exact v2 cleanup candidate; contents are not read
.codex/sdlc-state.json                  — exact v2 cleanup candidate; contents are not read
.gitignore                              — exact owned entries inside recognized blocks only
```

`feature.gherkin` files are generated, not template-reconciled.

Read these shared contracts only when their category is reached:

- `../../references/spec-frontmatter.md`
- `../../references/contribution-guide.md`
- `../../references/project-agents.md`
- `../../references/contribution-gate.md`
- `../../references/issue-form.md`

## Workflow

### Step 1: Resolve Current Templates

Resolve the installed plugin root from this skill's own path and load:

- `../onboard-project/templates/{product,tech,structure}.md`
- `../run-retro/templates/retrospective.md`
- `../write-spec/templates/{requirements,design,tasks}.md`
- the canonical issue form at `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`

If a source template is unavailable, skip only that category and report the exact missing path.

### Step 2: Detect Legacy Layout

Read `references/detection.md`. Record exact relocation findings and include them in the findings gate. Do not relocate before approval.

### Step 3: Analyze Steering and Specs

For steering documents, compare `##` headings with the matching current template, apply the relevance heuristics and `.codex/upgrade-exclusions.json` rules from `references/upgrade-procedures.md`, and propose missing sections in template order.

For `requirements.md`, `design.md`, and `tasks.md`, detect feature versus defect variants and compare only with the matching template variant. Validate defect `**Related Spec**:` links. Skip generated Gherkin files.

Read `references/migration-steps.md` when legacy `{issue#}-{slug}` directories or singular `**Issue**` frontmatter are found. Consolidations and deletions always remain explicit findings.

### Step 3.5: Audit Sealed Umbrella Specs

Read `../../references/canonical-umbrella-spec.md` and `references/sealed-spec-recovery.md`. Run audit mode from the installed plugin root against the consumer project. Record each exact path as canonical, canonical with history marker lost, stranded but unambiguously recoverable, divergent, ambiguous/unrecoverable, or unverifiable.

This category is independent from template reconciliation, managed assets, release documents, and runner cleanup. Analysis reads only bounded Git tree metadata/content for multi-PR-triggered spec paths and never changes the worktree, index, refs, branches, or GitHub.

### Step 3.6: Audit Umbrella Identity

Read `../../references/epic-relationships.md` and `references/epic-identity-recovery.md`. Fetch the current repository's issue graph and classify every issue that has an `epic`, `epic-child-of-N`, native parent/sub-issue, or supported body relationship signal. Record durable, legacy, inconsistent, ambiguous, unverifiable, native-degraded, and checklist-drift findings with exact issue numbers and signals.

The audit is read-only. It must not add labels, change parent links, rewrite bodies, close/reopen issues, or infer repair approval. Only deterministic repairs meeting the recovery reference's evidence threshold become proposals; all other findings remain preserved for manual resolution.

### Step 4: Analyze Release Documents

Read `references/verification.md` for `CHANGELOG.md` and `VERSION` analysis. Preserve all manual release notes.

### Step 5: Analyze Managed Repository Assets

After all three steering documents exist or are approved for creation/reconciliation, analyze:

1. `../../references/contribution-guide.md`
2. `../../references/project-agents.md`
3. `../../references/contribution-gate.md`
4. `../../references/issue-form.md`

Managed markers and exact target-path ownership rules remain authoritative. Missing assets and stale managed assets are findings; unmanaged workflow collisions are preserved and reported.

### Step 6: Analyze V2 Runner Artifact Cleanup

Read the cleanup section in `references/verification.md`. Candidate discovery is limited to the three exact project-root-relative paths and recognized `.gitignore` blocks listed above. Do not read candidate-file contents.

### Step 7: Present Findings

Show a per-file summary grouped as:

- Legacy Layout Relocation
- Steering Documents
- Spec Documents and Directories
- Related Spec Links and Frontmatter
- Sealed Umbrella Specs
- Umbrella Identity
- CHANGELOG and VERSION
- Contribution Guide
- Project AGENTS
- Contribution Gate
- Issue Form
- Runner Artifact Cleanup

For Runner Artifact Cleanup, list every exact file and every exact managed ignore entry proposed for deletion. Also list preserved unmanaged matches and read failures. If no cleanup candidates exist, show `Runner Artifact Cleanup: already clean`.

Use `request_user_input` gates:

1. Steering sections: apply all, decline all, or provide a narrowed subset.
2. Each spec consolidation/deletion group: apply or preserve.
3. Each `stranded_recoverable` sealed-spec finding: approve that exact path/tree/source identity, preserve it, or narrow and re-present. No other sealed status is recoverable.
4. Each deterministic umbrella-identity mutation set: approve that exact parent/children/evidence/commands set, preserve it, or narrow and re-present. Ambiguous or unverifiable findings are never offered as executable repairs.
5. Other non-cleanup changes: apply all, cancel, or narrow and re-present.
6. Runner Artifact Cleanup: approve the exact deletion batch, decline it, or provide a narrowed subset and re-present the exact batch.

No mutation occurs until the user has accepted a decision-complete plan.

### Step 8: Apply Approved Changes

Read `references/upgrade-procedures.md` and apply only the accepted findings. Re-read every changed text artifact and re-inspect every deleted path. Persist newly declined steering sections in `.codex/upgrade-exclusions.json` without removing prior decisions.

Route approved sealed-spec findings through `references/sealed-spec-recovery.md`, including its fresh reclassification and exact-source checks.

Route approved umbrella-identity findings through `references/epic-identity-recovery.md`, including exact-evidence re-fetch, drift comparison, narrowly scoped GitHub commands, and post-apply idempotence audit.

Managed contribution-gate and issue-form reconciliation is independent of cleanup approval. Declining cleanup must not suppress approved asset reconciliation; cleanup approval must not broaden asset ownership.

### Step 9: Report

Emit stable managed-asset status blocks from their shared contracts, followed by:

```text
Runner Artifact Cleanup:
- sdlc-config.json: removed | already clean | preserved (unmanaged) | failed (<reason>)
- .codex/unattended-mode: removed | already clean | preserved (unmanaged) | failed (<reason>)
- .codex/sdlc-state.json: removed | already clean | preserved (unmanaged) | failed (<reason>)
- .gitignore managed entries: removed | already clean | preserved (unmanaged) | failed (<reason>)
- Gaps: none | <comma-separated exact paths and failures>
```

Then summarize applied, declined, already-current, relevance-filtered, and failed findings. If every category was already current and cleanup was already clean, report `Everything is up to date — no upgrade needed.`

Before the runner block, emit:

```text
Sealed Umbrella Specs:
- specs/<slug>/: canonical | canonical (history marker lost) | prepared for publication | preserved (divergent) | preserved (ambiguous) | failed (<reason>)
- Gaps: none | <comma-separated exact paths and failures>
```

For a prepared recovery, direct the user to `$nmg-sdlc:write-spec #N` for normal reviewed spec-only publication. Do not claim default-branch publication until that later workflow proves it.

Before the sealed-spec block, emit:

```text
Umbrella Identity:
- parent #N / child #C: durable | legacy | repaired | preserved (inconsistent) | preserved (ambiguous) | failed (<reason>)
- Native/checklist reconciliation: clean | degraded | drift (<exact issue numbers>)
- Gaps: none | <comma-separated exact records and failures>
```

## Error States

| Condition | Behavior |
|-----------|----------|
| Template read failure | Skip that category; report the exact source path |
| Ambiguous legacy-layout collision | Preserve both trees; ask for user direction |
| Cleanup candidate is not a regular file | Preserve it as unmanaged; report the exact path |
| `.gitignore` read failure | Do not edit it; report the read failure |
| Cleanup deletion/edit failure | Stop that exact operation, preserve all other scope, and report the exact path |
| Managed workflow path collision | Preserve the unmarked workflow and report a gap |
| Canonical issue form unavailable | Preserve the target and report a gap |
| Sealed-spec default refresh or Git read failure | Preserve every candidate; report `unverifiable` with the exact reason code |
| Approved recovery evidence changed | Stop that exact recovery; preserve the worktree/index and report a stale-finding gap |
| Default/source spec trees diverge | Preserve default as canonical and never overwrite it |
| Approved umbrella issue evidence changed | Stop that exact metadata repair before mutation and report the changed labels, body digest, or relationship set |
| Umbrella repair target is ambiguous or unverifiable | Preserve every record and do not offer executable repair commands |

## Integration with SDLC Workflow

This utility runs after plugin updates or from already-initialized onboarding. It does not add a numbered delivery stage. After a successful upgrade, continue with `$nmg-sdlc:draft-issue` or `$nmg-sdlc:start-issue`.
