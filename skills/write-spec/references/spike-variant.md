# Spike Variant

**Read this when** the issue carries the `spike` label. The spike variant replaces Phases 1–3 with a single **Phase 0: Research** that produces a committed gap-analysis ADR and ends with a Human Review Gate choosing one of three scope shapes.

## Detecting the variant

After reading the issue in Phase 1, check whether the issue has the `spike` label:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

If any label is `spike`, this is a **spike issue** and the variant below replaces the normal Phase 1 / Phase 2 / Phase 3 workflow.

**Precedence**: spike takes precedence over `bug`. A label-carrying issue is never both at the same time (Step 2 classification in `/draft-issue` forces one or the other), but if both labels appear the spike variant wins — research has not yet reached "minimal fix" certainty, so the defect variant is premature.

## Skipping Spec Discovery

Spike-labelled issues skip Spec Discovery entirely (same as bug-labelled issues) — no parent-link resolution, no keyword-based match, no amendment-mode dispatch. Spike issues always create a fresh ADR under `docs/decisions/`; they do not amend existing specs and they do not create `specs/{feature-name}/` directories.

## Phase 0 procedure

Execute in order — the commit-before-HRG rule (step 7) is not optional:

1. **Skip Spec Discovery** entirely.
2. **Collect research context**:
   - The full issue body (Research Questions, Candidate Set, Time-box, Expected Output Shape, Honest-Gap Protocol).
   - `steering/product.md`, `steering/tech.md`, `steering/structure.md`.
3. **Idempotency check**: `Glob` for `docs/decisions/*-<slug>-gap-analysis.md` where `<slug>` matches the slug that would be generated from the issue title (derive the slug the same way step 6 does before globbing).
   - Match found → load the existing ADR and skip to step 9 (HRG). The researcher is NOT re-invoked. Re-scoped spikes that trigger a later `/write-spec #N` see the existing ADR and present the HRG using the already-committed findings. To force fresh research, delete the existing ADR under `docs/decisions/` before re-running.
   - No match → proceed to step 4.
4. **Invoke the researcher**: spawn `agents/spike-researcher.md` via the `Task` tool with:
   - Input: issue body, the three steering docs, and any Candidate Set from the issue.
   - Output contract: the structured markdown block defined in `agents/spike-researcher.md` § Output.
5. **Receive the research output**.
6. **Write the ADR**: `docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md` where `<slug>` is derived from the issue title. Ensure `docs/decisions/` exists (`mkdir -p docs/decisions`) before writing. Use forward slashes for cross-platform compatibility.
7. **Commit the ADR** — **this must happen BEFORE the HRG**:
    ```bash
    git add docs/decisions/
    git commit -m "docs: add gap-analysis ADR for spike #{N}"
    ```
    The commit scope MUST be only `docs/decisions/`.
8. **Push** `HEAD` so the ADR is on the remote before the user is asked to choose a scope shape.
9. **Present the HRG** (interactive) OR apply the deterministic default (unattended — see below).
10. **Emit the next-step hint**: `Next step: /open-pr #{N} to ship the ADR`.

## Human Review Gate menu (interactive)

Call `request_user_input` with three options — the HRG decides how the research output flows into GitHub:

```
question: "Phase 0 research complete. Choose a scope shape:"
options:
  - "[1] Single-PR — append findings to the spike issue and ship the ADR alone"
  - "[2] Umbrella+Children — create an umbrella issue plus child implementation issues"
  - "[3] Re-scope+Redraft — edit the spike issue body with refined scope, then re-run /write-spec"
```

### [1] Single-PR

- `gh issue comment #{N} --body "{ADR summary — the Recommendation section verbatim}"`.
- Keep the ADR commit as the deliverable. `/open-pr` will ship it without a version bump.

### [2] Umbrella+Children

- Follow `references/umbrella-mode.md` to produce the umbrella issue and the child implementation issues. The umbrella body quotes the ADR's Recommendation and links the `docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md` file path.
- Children are created via `/draft-issue` batch mode seeded from the researcher's Decomposition section (one child per component).
- Each child carries `Depends on: #{umbrella-N}` in its body (machine-read by `skills/open-pr/references/version-bump.md` § 4a for the epic-child sibling-aware downgrade).
- Label children `epic-child-of-{U}` plus `enhancement` or `bug` based on the child's type.

### [3] Re-scope+Redraft

- `gh issue edit #{N} --body "{refined body}"` — use the researcher's Honest Gaps section to narrow the research questions.
- Print: `Re-scope complete. Re-run /write-spec #{N} to revisit with the refined scope.` and exit.
- The previously committed ADR remains in `docs/decisions/` as a record of the first research pass. Later spike runs append new dated ADRs rather than rewriting this one.

## Unattended deterministic default

Follow the deterministic-default gate pattern in `../../references/unattended-mode.md`. When `.codex/unattended-mode` exists, do NOT call `request_user_input` — apply the default below and emit a one-line divergence note.

| `component-count` (from researcher output) | Default scope shape |
|---|---|
| `>= 2` | **Umbrella+Children** |
| `< 2` (including parse failure — defaults to 1) | **Single-PR** |

**Never auto-select `Re-scope+Redraft`** — that option requires human judgment about whether the research is unsalvageable, and unattended mode must not make that call. If the researcher's honest gaps warrant a re-scope, the human selects it on the next interactive re-run.

**Divergence-note format** (exactly one of):

```
Unattended mode: Phase 0 HRG applied deterministic default (umbrella+children)
Unattended mode: Phase 0 HRG applied deterministic default (single-PR)
```

## No-code invariant

The spike variant must NEVER produce:

- `specs/{feature-name}/requirements.md`
- `specs/{feature-name}/design.md`
- `specs/{feature-name}/tasks.md`
- `specs/{feature-name}/feature.gherkin`

The ADR is the sole deliverable of `/write-spec` on a spike issue. Any child issues created under HRG [2] carry their own requirements in their body (authored via `/draft-issue`); they are not backed by a spec directory until `/start-issue` and `/write-spec` are run on each child independently.

## Cross-references

- `references/umbrella-mode.md` — umbrella and child issue conventions (triggered by HRG option [2]).
- `../../references/unattended-mode.md` — deterministic-default gate semantics (governs the HRG in headless runs).
- `agents/spike-researcher.md` — the Phase 0 research subagent, including the structured output contract this file consumes.
- `skills/open-pr/references/version-bump.md` § Spike handling — the label-driven version-bump skip that matches this variant.
- `steering/tech.md` § Version Bump Classification — the `spike → skip` row that declares the version policy.
