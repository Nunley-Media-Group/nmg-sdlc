---
name: open-pr
description: "Deliver a verified issue through one exact pull request until its exact head is merged and the issue is closed. Use when user says 'create PR', 'open pull request', 'submit for review', 'push for review', 'ready to merge', 'make a PR for issue #N', 'how do I create a PR', 'how do I open a pull request', or 'ship this'. Stages eligible work, applies the version bump, commits, reconciles safely, pushes, creates or resumes the PR, fixes actionable delivery findings, verifies, merges, and reconciles eligible epic ancestors. Seventh terminal step in the SDLC pipeline — follows $nmg-sdlc:verify-code."
---

# Open PR

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Deliver one verified executable issue through a spec-driven pull request. This
command is terminal: PR creation is an intermediate state, never successful
completion.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if the project still keeps SDLC artifacts under `.codex/steering/` or `.codex/specs/`.

Read `../../references/feature-naming.md` when locating the spec directory for the issue and no `{feature-name}` is already known — the reference covers the `feature-{slug}` / `bug-{slug}` convention and the `**Issues**` frontmatter fallback chain.

Read `../../references/versioning.md` when you need the versioning invariants — single-source-of-truth (`VERSION`), major-bumps-are-manual, `.codex-plugin/plugin.json` manifest update, CHANGELOG conventions, and the epic-child downgrade rule.

Read `../../references/steering-schema.md` when reading `steering/tech.md` for the `## Versioning` bump matrix or stack-specific versioned-files table — `tech.md` is the authoritative source for project-specific bump behaviour.

Read `../../references/pr-dependent-verification.md` when the verification report contains a PR-readiness marker.

Read `references/pr-dependent-delivery.md` when the shared validator returns qualified pending evidence or an exact controlled draft is being resumed.

Read `../../references/epic-relationships.md` when resolving epic role, lineage,
and fully paged native child evidence.

Read `../../references/epic-spec-authority.md` when relationship evidence
confirms an epic child and the active executable package must be resolved.

Read `references/epic-completion.md` when merged child closure has been proven
and eligible ancestors must be reconciled leaf-to-root.

## Prerequisites

1. Implementation is complete (all tasks from `tasks.md` done).
2. Verification has passed, or valid shared-contract `pr_evidence_pending` proves all local verification has passed (via `$nmg-sdlc:verify-code`).
3. `origin` is reachable for fetch, base reconciliation, push, PR observation, and merge.

---

## Workflow

### Step 0: Parse Arguments

Inspect the invocation arguments for a `--major` token (alongside the issue number, e.g., `$nmg-sdlc:open-pr #42 --major`).

- `--major` present → set a `major_requested` flag and remember it through Step 2. This is the only direct request path to a major version bump — the label-based classification matrix never produces one on its own.
- `--major` absent → `major_requested` is false and the rest of the workflow behaves normally.

### Step 1: Read Context

Read `references/preflight.md` when Steps 1–3 have collected issue context and prepared version artifacts — it stages the approved working-tree scope, classifies clean/no-op branches, fetches origin, merges the base when needed without rewriting history, pushes safely, and verifies that no unpushed commits remain before PR creation or resumption.

Gather all information needed for the PR:

1. **Read and classify the issue** — hydrate full native relationship evidence.
   `ordinary` continues. A confirmed `epic` stops without PR mutation because
   epics are coordination-only. A confirmed child must return `valid` from
   `epic-spec-authority.mjs --child N --native-children <complete-list>`; use
   only `requestedChild.specPath`, and retain aggregate outcomes/topology as
   bounded context. `planned`, `repair_required`, or `unverifiable` stops before
   version, commit, push, or PR mutation.
2. **Check for spec files** — for a validated child use its exact manifest path;
   otherwise discover the ordinary issue package through the existing naming
   fallback. Found match → set a **specs-found** flag. No match → set
   **specs-not-found** flag.
3. **Resolve active spec scope (specs-found only)** — read `../../references/issue-spec-scope.md` and run its read-only resolver for the active issue and matched spec. Continue only for `scoped` or `implicit_single_issue`. Use only `delivery` for current summary, acceptance criteria, and implementation test-plan content; add only declared `regression` evidence as a separate preservation section. On `repair_required`, stop and direct `$nmg-sdlc:write-spec #N` with exact gaps. On `unverifiable`, fail closed. Never build a cumulative whole-spec PR body for a multi-issue spec.
4. **Read spec files (specs-found only)**:
   - `specs/{feature-name}/requirements.md` for acceptance criteria.
   - `specs/{feature-name}/tasks.md` for the testing phase.
   - `specs/{feature-name}/issue-scope.json` when the resolver status is `scoped`.

   Skip this sub-step if specs-not-found — acceptance criteria will be extracted from the issue body already fetched in step 1.
5. **Read verification evidence** — locate the verification report under the matched spec (when present), parse its one-line `nmg-sdlc-issue-scope` JSON marker, require that marker and the human-readable Issue Scope block to match the current normalized result, and extract **Implementation Status** plus any `## Steering Doc Verification Gates` summary produced by `$nmg-sdlc:verify-code`. Run the shared readiness validator with the active issue/spec identity and apply the existing report commit, ancestry, uncommitted-change, and implementation-freshness proof. Ordinary current `Pass` with no readiness marker follows the existing path unchanged. Current valid `pr_evidence_pending` may select the controlled draft path in `references/pr-dependent-delivery.md`; current valid `pr_evidence_satisfied` may enter only its exact preserved-draft H2 retry. Generic Partial, Incomplete, Fail, malformed/mismatched/stale evidence, failed/incomplete gates, prose exceptions, and satisfied evidence without the exact resumable draft fail closed. When specs-not-found, require equivalent passing verification evidence before delivery rather than treating the issue body as proof.
6. **Read git state**:
   - `git status` — eligible changes after delivery preparation.
   - `git log main..HEAD --oneline` — commits on this branch.
   - `git diff main...HEAD --stat` — files changed vs main.
7. **Read version artifacts for the PR body** — read `VERSION`, `CHANGELOG.md`, and the delivery-preparation results to populate the PR body's Version line.

### Step 2: Determine Version Bump

Read `references/version-bump.md` when a `VERSION` file exists at the project root and the issue does not carry the `spike` label. Classify the version bump from `steering/tech.md`, present the explicit version gate, apply the epic-child downgrade rule, and record `old_version`, `new_version`, `bump_type`, `siblingClass`, and `epicParentNumber`.

### Step 3: Apply Version Artifacts

Use `references/version-bump.md` to update `VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, and any stack-specific version files from `steering/tech.md`. Stage the version artifacts with the rest of the delivery changes so the delivery commit contains a coherent release state. If there are no implementation changes and only version artifacts changed, use the `chore: bump version to {new_version}` commit message.

### Step 4: Generate PR Content

Read `references/pr-body.md` when assembling the PR title and body — the reference covers the conventional-commit title format, the specs-found Template A (full spec-linked body), and the specs-not-found Template B (fallback to issue-body ACs). Both templates include the conditional Version and epic-child "Bump" lines. Generate this content after delivery preparation so the Version line reflects committed artifacts.

**Spike PRs**: the PR body template omits the `Version` line entirely and adds `Type: Spike research (no version bump)` in its place when the issue carries the `spike` label. The rest of the template (summary, specs reference, test plan) is unchanged.

### Step 5: Push and Create PR

Before `gh pr create`, confirm the delivery-preparation postconditions from `references/preflight.md`:

- local contains `origin/main`;
- `git log origin/{branch}..HEAD --oneline` is empty;
- the staged and pushed scope matches the approved delivery tree;
- `delivery_commit_created` accurately records whether this invocation created a commit.

Then create the PR:

For the ordinary Pass path, preserve the existing command:

```bash
gh pr create --title "[title]" --body "[body]"
```

For qualified pending readiness, do not run the ordinary create command. Follow `references/pr-dependent-delivery.md`: create or reuse only the exact draft, validate H1, reverify, safely push any report update, validate H2, record final evidence, and call `gh pr ready` only after the final marker is re-fetched and validated.

Add labels matching the issue when appropriate. Read `references/pr-body.md` for the output block.

### Step 6: Report Prepared PR

Render the prepared-PR block from `references/pr-body.md` as progress only, then
continue immediately to Step 7. Never call this completion.

### Step 7: Terminal Exact-Head Delivery Loop

Read `references/ci-monitoring.md` when Step 7 starts. Invoking this skill
authorizes the configured terminal delivery path; do not ask whether to monitor
or merge. Create or resume one exact PR, fingerprint every observed head/check/
review/thread/merge state, wait for pending evidence, repair safe actionable
findings, rerun `$nmg-sdlc:verify-code #N`, push normally, and invalidate all
evidence when the head changes. Merge only when success-equivalent checks,
review decisions, resolved non-outdated threads, final verification evidence,
and live `mergeStateStatus: CLEAN` all apply to the same head SHA.

Success requires a fresh PR read proving `state: MERGED` and a fresh issue read
proving child `state: CLOSED`. Then run `references/epic-completion.md` leaf to
root and clean up the local branch only after all required proof. Otherwise
return exactly one external-authority blocker naming the evidence, owner, and
recovery action; an open PR or pending handoff is never success.

---

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #<executable>  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N (review + merge + closure)
                                                                                                       ▲ You are here
```

`$nmg-sdlc:address-pr-comments` is a focused utility whose contract is used
inside terminal delivery; it is not a successful post-`open-pr` lifecycle stage.
