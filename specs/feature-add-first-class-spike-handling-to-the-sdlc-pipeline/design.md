# Design: First-Class Spike Handling for the SDLC Pipeline

**Issues**: #99
**Date**: 2026-04-23
**Status**: Draft
**Author**: Rich Nunley

---

## Overview

This change adds a **spike variant** to the SDLC pipeline that parallels the existing `bug` variant. The variant is activated by the pre-existing `spike` GitHub label (already seeded by `/onboard-project`) and flips the pipeline into a research-only shape: `/draft-issue` gains a Spike classification that emits a spike body template; `/write-spec` detects the label, skips Spec Discovery and Phases 1–3, and runs a single **Phase 0: Research** that invokes a new `agents/spike-researcher.md` subagent; the agent commits a gap-analysis ADR to `docs/decisions/` before presenting an HRG that offers three scope shapes (single-PR, umbrella+children, re-scope+redraft); `/open-pr` recognises the label and skips version bumping entirely; `/write-code` and `/verify-code` abort with a fixed message. Two new references — `skills/write-spec/references/spike-variant.md` and `skills/write-spec/references/umbrella-mode.md` — carry the variant-specific workflow so `SKILL.md` stays under 500 lines.

The decision to follow the **defect variant pattern** (a top-level Detection step plus a per-phase reference that swaps templates) is the core architectural choice. It reuses a grammar every SDLC skill already understands — `gh issue view #N --json labels | grep label-name → load references/{label}-variant.md` — and costs roughly the same LoC in each skill's `SKILL.md`. The alternative (a separate `/research-spike` slash command) was rejected because it splits the pipeline into two entry points the user has to remember, forks the Seal-Spec Flow, and prevents the Phase 1 interview's "Defer to spike" option from reusing the same downstream machinery.

Phase 0's HRG uses the **deterministic-default gate pattern** from `references/unattended-mode.md` so the runner can auto-pick umbrella+children (when ≥ 2 independent components surfaced) or single-PR (when only one). No escalation is required — spike research is bounded and the deterministic rule is fair enough that automation should not stop to ask.

---

## Architecture

### Pipeline Shape — Spike vs. Feature vs. Defect

```
Feature (current):
  /draft-issue → /start-issue → /write-spec {Discovery, Phase 1/2/3} → /write-code → /verify-code → /open-pr {bump minor}

Defect (current):
  /draft-issue → /start-issue → /write-spec {skip Discovery, Phase 1/2/3 defect variant} → /write-code → /verify-code → /open-pr {bump patch}

Spike (new):
  /draft-issue {spike option}
    → /start-issue
    → /write-spec {skip Discovery, Phase 0 Research → HRG} → /open-pr {skip bump}
        ↓
        (/write-code aborts, /verify-code aborts)
```

### Label Dispatch Pattern

Every SDLC skill already performs a single-shot `gh issue view #N --json labels --jq '.labels[].name'` at the top of its workflow. The spike variant extends that check with a second label branch:

```
labels = gh issue view #N --json labels ...
if "bug" in labels   → read references/defect-variant.md  (existing)
if "spike" in labels → read references/spike-variant.md   (new)
else                 → feature path                        (existing)
```

`bug` and `spike` are mutually exclusive by convention (Step 2 classification in `/draft-issue` forces one or the other). If both appear (future proofing), precedence is `spike > bug` — the research outcome might produce a bug fix as one child issue, but spiking takes priority because the research has not yet reached "minimal fix" certainty.

### New File Layout

```
nmg-sdlc/
├── agents/
│   └── spike-researcher.md                    (NEW — research subagent)
├── skills/
│   ├── draft-issue/
│   │   ├── SKILL.md                            (MOD — add Spike classification)
│   │   └── references/
│   │       └── spike-template.md               (NEW — spike body template)
│   ├── write-spec/
│   │   ├── SKILL.md                            (MOD — add Spike Detection + Phase 0 dispatch)
│   │   └── references/
│   │       ├── spike-variant.md                (NEW — Phase 0 research workflow)
│   │       ├── umbrella-mode.md                (NEW — umbrella/child conventions)
│   │       └── interview.md                    (MOD — "Defer to spike" option)
│   ├── write-code/
│   │   └── SKILL.md                            (MOD — abort on spike label)
│   ├── verify-code/
│   │   └── SKILL.md                            (MOD — abort on spike label)
│   ├── open-pr/
│   │   ├── SKILL.md                            (MOD — route to skip-bump on spike)
│   │   └── references/
│   │       └── version-bump.md                 (MOD — "skip" verdict for spike)
│   └── run-retro/
│       ├── SKILL.md                            (MOD — optional Step 1.6 ADR aging)
│       └── references/
│           └── adr-aging.md                    (NEW — ADR scan + age flag)
├── steering/
│   └── tech.md                                 (MOD — add `spike → skip` row to Version Bump table)
└── docs/
    └── decisions/                              (NEW convention — created on first spike)
        └── YYYY-MM-DD-<slug>-gap-analysis.md   (spike ADR artefact; created by Phase 0)
```

---

## Data Flow

### Phase 0 (Research) Flow

```
1. /write-spec #N
2. gh issue view #N → labels include "spike"
3. Read skills/write-spec/references/spike-variant.md
4. Skip Spec Discovery entirely
5. Collect context: issue body + steering/{product,tech,structure}.md
6. Check idempotency: file discovery docs/decisions/*-#N-gap-analysis.md
     ├─ exists → load and skip to HRG
     └─ absent → proceed to step 7
7. Invoke agents/spike-researcher.md via Task tool with:
     - Input: issue body, steering docs, candidate set (if provided)
     - Output contract: gap-analysis markdown + component-count signal
8. Receive ADR body from agent
9. Write docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md
10. Commit: "docs: add gap-analysis ADR for spike #{N}"
      (commit BEFORE the HRG — per AC3; commit scope is only docs/decisions/)
11. Push HEAD
12. Present HRG (interactive) OR apply deterministic default (unattended)
     ├─ single-PR         → gh issue comment #N with ADR summary
     ├─ umbrella+children → create umbrella issue + child issues + Depends-on-parent lines
     └─ re-scope+redraft  → gh issue edit #N with refined body → exit with "re-run /write-spec #N"
13. Next step hint: "/open-pr #{N} to ship the ADR"
```

### Defer-to-Spike Flow (Phase 1 interview)

```
1. /write-spec #N enters Phase 1 interview (from issue #94)
2. Gap detected: unresolved Open Questions or missing AC
3. interactive user prompt now offers THREE options instead of two:
     [1] Answer — I'll type the resolution
     [2] Defer to spike — create a spike issue for this question
     [3] Skip — leave unresolved (existing behavior)
4. User selects [2] Defer to spike:
   a. Derive a title from the gap question (e.g., "Spike: evaluate OAuth vs session cookies")
   b. gh issue create --label spike --body "{spike template filled from gap question}"
      → captures issue number S
   c. gh issue edit #N --body "$(existing body)\n\nDepends on: #S"
   d. Record the gap as resolved-via-spike in the interview session state
   e. Thread a placeholder into requirements.md: "See spike #S for resolution"
5. Interview continues with next gap
```

### Abort-on-Spike Flow (/write-code, /verify-code)

```
1. /write-code #N  (or /verify-code #N)
2. gh issue view #N → labels include "spike"
3. Print:
     "Spikes don't produce code — run /open-pr to merge the research spec"
4. Exit 0 (not an error — a correctness guard)
```

### No-Bump Flow (/open-pr)

```
1. /open-pr #N
2. gh issue view #N → labels include "spike"
3. Skip Step 2 (Determine Version Bump) and Step 3 (Update Version Artifacts)
4. Set pr-body flag: spike = true
5. Step 4 generates PR body using the existing pr-body template
   but omits the "Version" line and adds "Type: Spike research (no version bump)"
6. Step 5 pushes and creates PR normally
```

---

## Key Component Specifications

### `agents/spike-researcher.md` (NEW)

```yaml
---
name: spike-researcher
description: "Execute Phase 0 research for spike-labelled issues: survey candidate set, identify gaps, produce a gap-analysis ADR. Auto-invoked by write-spec when the issue carries the spike label."
tools: Read, file discovery, text search, Codex web browsing, Codex web browsing
model: gpt-5.5
skills: write-spec
---
```

**Tool access rationale**: Read/file discovery and text search for codebase context; Codex web browsing/Codex web browsing for external research (API docs, library comparisons, benchmarks). Deliberately **omits Write and Edit** — the parent `/write-spec` skill owns the ADR file write because the commit must happen at a specific workflow step (before the HRG). Agents cannot coordinate commit ordering across a parent workflow.

**Input prompt shape** (built by `/write-spec` Phase 0):
- Issue number and body (with the spike template sections already filled in)
- Contents of `steering/product.md`, `steering/tech.md`, `steering/structure.md`
- Repo-relative paths the research may explore

**Output contract** (structured markdown the parent parses):

```markdown
# Spike Research: {issue title}

## Research Goal
{one-paragraph restatement of the research question}

## Candidate Set
{bulleted list of evaluated options, including "no-change" if relevant}

## Findings
{per-candidate analysis: strengths, weaknesses, evidence}

## Honest Gaps
{explicit admission of what the research did NOT determine}

## Recommendation
{chosen option + rationale OR "need follow-up spike on X"}

## Decomposition
- component-count: {N}
- components:
  - {component 1 — one line each}
  - {component 2}
  ...

## References
{URLs, file paths, commits examined}
```

The **component-count** field drives the Phase 0 HRG's deterministic default in unattended mode.

### `skills/write-spec/references/spike-variant.md` (NEW)

Mirrors `defect-variant.md`'s shape:

- **Detecting the variant** — `gh issue view #N --json labels | grep spike`
- **Skipping Spec Discovery** — no parent-link, no keyword match; bypass goes straight to Phase 0
- **Phase 0 procedure** — the 13-step flow above
- **HRG menu** (interactive):
  ```
  [1] Single-PR — append findings to spike issue and ship ADR alone
  [2] Umbrella+Children — create umbrella issue + child implementation issues
  [3] Re-scope+Redraft — edit spike issue body and re-run /write-spec
  ```
- **Unattended deterministic default**:
  - `component-count >= 2` → umbrella+children
  - `component-count < 2` → single-PR
  - Never auto-select re-scope+redraft (that requires human judgment)
  - Emit divergence note: `Unattended mode: Phase 0 HRG applied deterministic default (umbrella+children)` (or single-PR)
- **Idempotency** — re-running `/write-spec #N` detects the existing ADR and skips to HRG
- **No-code invariant** — the variant must never produce requirements.md / design.md / tasks.md / feature.gherkin; that is the whole point

### `skills/write-spec/references/umbrella-mode.md` (NEW)

Formalises conventions the Seal-Spec Flow already implies:

- **Trigger**: `## Multi-PR Rollout` heading OR FR cell text containing `multiple PRs` / `multi-PR`
- **Umbrella issue body** — summary, design rationale, Child Issues checklist
- **Child issue body template** — inherits umbrella context, has own ACs, body line `Depends on: #{umbrella-N}` (deterministic — epic-child-downgrade rule in `version-bump.md` already parses this)
- **Label**: children carry `epic-child-of-{N}` plus their type (`enhancement` or `bug`)
- **Creation procedure** — via `/draft-issue` batch mode fed from the design's Delivery Phases table

This reference consolidates knowledge currently spread across:
- `skills/write-spec/SKILL.md` § Seal-Spec Flow (3b.1–3b.4)
- `skills/draft-issue/references/multi-issue.md` (Epic Coordination template)
- `skills/open-pr/references/version-bump.md` § 4a (epic-child sibling-aware downgrade)

Those three locations stay authoritative for the *machinery* they own; `umbrella-mode.md` gives `/write-spec` (and spike Phase 0 HRG) a single pointer to read when it needs to *produce* that shape.

### `skills/draft-issue/references/spike-template.md` (NEW)

```markdown
## Spike Summary
{1-2 sentence research goal}

## Research Questions
- {Question 1}
- {Question 2}

## Candidate Set
{optional — known options at draft time}

## Time-box
{e.g., "8 hours of research before HRG"}

## Expected Output Shape
- [ ] ADR only (single-PR)
- [ ] ADR + umbrella + children
- [ ] ADR + re-drafted spike scope

## Honest-Gap Protocol
The researcher MUST explicitly enumerate what was NOT determined — silent gaps
are failure. If a candidate cannot be evaluated within the time-box, list it
under "Honest Gaps" and propose a follow-up spike.

## Out of Scope
{what this spike will NOT attempt}
```

### `skills/draft-issue/SKILL.md` — Step 2 modification

Extend the classification `interactive user prompt` from three options to four:

```
question: "What type of issue is this?"
options:
  - "Bug" — Something is broken or behaving incorrectly
  - "Enhancement / Feature" — New capability or improvement to existing behavior
  - "Epic" — A coordinated set of child issues delivering one logical feature across multiple PRs
  - "Spike" — A research/evaluation task producing a decision (ADR) not code
```

Step 6 template dispatch gains a fourth branch:

```
Read references/spike-template.md when classification === 'spike'.
```

Step 8 label application:

```
- Spike → spike (ensure label exists; color 0052CC; lazily create if missing)
```

`automatable` does NOT apply to spikes (research requires human HRG judgement in the default case).

### `skills/write-spec/SKILL.md` — modifications

Three changes, each small and additive:

1. **Spike Detection step** — insert after the existing Defect Detection section:

```markdown
## Spike Detection

After reading the issue in Phase 1, check whether it has the `spike` label:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

Read `references/spike-variant.md` when any label is `spike` — the spike variant replaces Phases 1–3 with a single Phase 0: Research that produces a committed ADR and ends with an HRG that chooses a scope shape.

Spike detection takes precedence over feature/defect dispatch — a spike-labelled issue never produces requirements/design/tasks artifacts.
```

2. **Spec Discovery bypass** — add a one-line sentence to the Spec Discovery section:

> Spike-labelled issues skip Spec Discovery entirely (same as bug-labelled issues) and proceed directly to Phase 0 per `references/spike-variant.md`.

3. **Phase 1/2/3 entry guards** — no change. The variant pointer in Spike Detection short-circuits the workflow before Phase 1 reads `interview.md`.

### `skills/write-spec/references/interview.md` — modification

The Phase 1 interview adds a third menu option on feature issues when the gap is an "Unresolved Open Question". Restricted to feature issues because bug repro-step gaps and AC-structure gaps are not spike-shaped questions.

Current two-option menu:
```
[1] Answer — I'll type the resolution
[2] Skip — leave unresolved
```

New three-option menu (feature issues + Unresolved Open Questions only):
```
[1] Answer — I'll type the resolution
[2] Defer to spike — create a spike issue for this question (blocks #N until spike ships)
[3] Skip — leave unresolved
```

Selecting [2] performs the Defer-to-Spike Flow described above.

### `skills/write-code/SKILL.md` — modification

Insert a new Step 1.5 between Step 1 and Step 2:

```markdown
### Step 1.5: Spike Abort

Check the issue's labels:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

If any label is `spike`, print exactly:

```
Spikes don't produce code — run /open-pr to merge the research spec
```

Exit 0 — this is a correctness guard, not a failure. Do NOT read specs, do NOT enter plan mode, do NOT touch any file.
```

### `skills/verify-code/SKILL.md` — modification

Insert parallel Step 1.5:

```markdown
### Step 1.5: Spike Abort

Check the issue's labels:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

If any label is `spike`, print exactly:

```
Spikes don't produce code — run /open-pr to merge the research spec
```

Exit 0 and do NOT post a verification report.
```

### `skills/open-pr/SKILL.md` + `references/version-bump.md` — modification

In `SKILL.md` Step 2, add an early-return above the `version-bump.md` pointer:

```markdown
Read `references/version-bump.md` when a `VERSION` file exists at the project root **AND the issue does not carry the `spike` label** — spike issues skip Steps 2 and 3 entirely. The spike-skip branch is documented in `references/version-bump.md` § Spike handling.
```

In `references/version-bump.md`, add a new section at the top:

```markdown
## Spike handling (no bump)

Before Step 2 begins, check the issue's labels:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

If any label is `spike`, skip Steps 2 and 3 entirely. Do NOT read `VERSION`, do NOT write `CHANGELOG.md`, do NOT write `plugin.json` / `marketplace.json`. Record `spike = true` so Step 4's PR body template omits the "Version" line and adds "Type: Spike research (no version bump)".

Rationale: spike PRs ship only the ADR and (if applicable) the committed spike research spec. They are not a release and must not roll the version. The skip is label-driven so the behaviour is editable via the `steering/tech.md` Version Bump Classification table without skill edits.
```

### `steering/tech.md` — Version Bump Classification

Add a row:

```markdown
| Label | Bump Type | Description |
|-------|-----------|-------------|
| `bug` | patch | Bug fix — backwards-compatible |
| `enhancement` | minor | New feature — backwards-compatible |
| `spike` | skip | Research-only PR — no release, no bump |   ← NEW
```

The `skip` verdict is honoured by `references/version-bump.md` § Spike handling (above) before the table is even read. The row exists to make the classification discoverable in the canonical table.

### `skills/run-retro/SKILL.md` + `references/adr-aging.md` — modification

Insert a new Step 1.6 between Step 1.5 and Step 2:

```markdown
### Step 1.6: Scan ADRs for Aging

Read `references/adr-aging.md` when `docs/decisions/` exists — the reference covers scanning ADR files, reading commit dates via `git log --follow --format=%aI -- {file}`, flagging ADRs older than 6 months, and emitting re-spike candidate rows in the retrospective output.

If `docs/decisions/` does not exist, skip this step.
```

`references/adr-aging.md` (NEW) — self-contained:

```markdown
# ADR Aging Scan

**Consumed by**: `run-retro` Step 1.6.

## Scan procedure

1. `file discovery` for `docs/decisions/*.md`.
2. For each ADR, run `git log --follow --format=%aI -- {file}` and take the last line (the commit authorship date of the file's addition).
3. Compute age in days: `(today - commit_date)`. ADRs older than 180 days (6 months) are re-spike candidates.

## Output section

Append a section to `steering/retrospective.md`:

\`\`\`markdown
## Re-Spike Candidates

| ADR | Age (days) | Original decision summary |
|-----|------------|---------------------------|
| docs/decisions/2025-10-12-auth-gap-analysis.md | 194 | Chose session cookies over JWT |
\`\`\`

Omit the section entirely when no ADRs are older than 180 days.
```

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Separate `/research-spike` slash command** | Build a parallel skill with its own workflow | Zero touch on existing skills; clearer namespace | Two pipeline entry points to teach; "Defer to spike" cannot reuse machinery; splits Seal-Spec Flow | Rejected — grows the skill surface for marginal clarity |
| **B: Spike as an `epic` subtype** | Spikes are just epics with a research prefix | Reuses the epic child machinery | Spike is NOT multi-PR by default (single-PR is one of the three HRG shapes); overloads epic semantics | Rejected — conflates research with delivery coordination |
| **C: Spike label dispatches to a spike-variant reference** | Parallel the existing defect-variant pattern | Single entry point; reuses the label-dispatch grammar every skill uses; minimal SKILL.md churn; reuses Seal-Spec Flow for umbrella+children | Requires per-skill SKILL.md touch (6 files) | **Selected** |
| **D: Spike emits only an issue comment (no ADR file)** | Skip the `docs/decisions/` convention | Smallest change | No durable audit trail; `/run-retro` ADR aging becomes unfounded; loses the "committed artifact before HRG" AC | Rejected — the ADR file *is* the deliverable |

---

## Security Considerations

- [x] **Authentication**: No new auth — `gh` CLI token already in use
- [x] **Authorization**: `gh issue create` / `gh issue edit` permissions already granted in existing pipelines
- [x] **Input Validation**: Spike template placeholders are user-authored markdown; no code execution path. The only machine-parsed field is `component-count` from the spike-researcher output — parse as integer, default to 1 on parse failure
- [x] **Sensitive Data**: ADRs are committed to the repo under `docs/decisions/` — reviewers must treat this like any spec file (no secrets, no credentials). Document in `spike-variant.md`
- [x] **Supply chain**: `spike-researcher` uses `Codex web browsing` / `Codex web browsing` — same risk surface as existing agents that use these tools

---

## Performance Considerations

- **Phase 0 runtime**: spike research typically runs longer than standard spec writing (the agent surveys candidates, often with web fetches). The runner step timeout for `/write-spec` must accommodate this. Existing `sdlc-config.example.json` uses per-step timeouts (5–30 min); spike-labelled issues should target the upper end (30 min)
- **Idempotent re-run**: checking for an existing ADR (`file discovery docs/decisions/*-#N-gap-analysis.md`) is O(1) and runs before re-invoking the agent — a re-run after a successful ADR commit skips straight to the HRG in seconds
- **Token budget for spike-researcher**: the agent is invoked with full steering docs + issue body. For most issues, this is < 20K tokens — comfortably inside the model's input window

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Draft-issue Step 2 classification | Exercise testing | Create a spike-classified issue in a test repo; confirm `spike` label and spike-template body applied |
| Write-spec Phase 0 idempotency | Exercise testing | Run `/write-spec #N` twice on a spike issue; confirm the second run detects the existing ADR and skips to HRG |
| Write-spec Phase 0 HRG (interactive) | Exercise testing | Run in interactive mode; confirm all three options (single-PR, umbrella+children, re-scope+redraft) produce the expected GitHub artefacts |
| Write-spec Phase 0 HRG (unattended) | Exercise testing | Run with `.codex/unattended-mode` set; confirm deterministic default based on component-count |
| Defer-to-spike option | Exercise testing | Run `/write-spec` on a feature issue with an unresolved Open Question; confirm spike issue is created and the parent issue body is updated with `Depends on: #S` |
| /write-code abort | Exercise testing | Run on a spike-labelled issue; confirm exit 0 with the fixed message and no spec or code files read |
| /verify-code abort | Exercise testing | Same as above |
| /open-pr no-bump | Exercise testing | Run on a spike branch; confirm `VERSION`, `plugin.json`, `marketplace.json`, `CHANGELOG.md` unchanged after PR creation |
| /run-retro ADR aging | Exercise testing | Seed `docs/decisions/` with an ADR dated > 180 days ago; confirm retrospective output has the Re-Spike Candidates section |
| Cross-platform | Manual | Confirm `docs/decisions/YYYY-MM-DD-...md` filename generation works on macOS, Linux, Windows (forward slashes, no special chars) |

Per `steering/tech.md`'s testing standards, skill-bundled file edits must be driven through `/skill-creator`. All SKILL.md / references / agents / templates changes in this spec are skill-bundled, so Step 5a of `/verify-code` will enforce the routing contract.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Spike researcher produces verbose ADRs that bury the recommendation | Medium | Medium | Output contract enforces a "Recommendation" section; HRG summary renders only that section for review |
| Commit-before-HRG creates a stale ADR if user picks re-scope+redraft | Low | Low | The ADR's commit message makes it obvious (`docs: add gap-analysis ADR for spike #{N}`); re-scope+redraft flow edits the spike issue body, not the ADR — later spike runs append new ADRs dated differently |
| `spike` label silently dropped during issue drafting | Low | High | `/draft-issue` Step 8 verifies labels via `gh issue view --json labels`; same pattern already used for `automatable` — the spike label gets the same warning on failure |
| Users forget spikes don't bump versions and expect a release | Low | Low | `/open-pr` output block explicitly says "Type: Spike research (no version bump)" in the PR body |
| `/run-retro` ADR aging flags ADRs that were superseded but never removed | Medium | Low | Mitigation is documentation (ADR convention: supersede by adding `**Status**: Superseded by YYYY-MM-DD-...md` — out of scope for this feature; flagged in future-work notes) |
| Deterministic-default of umbrella+children creates child-issue spam if component-count is off | Medium | Medium | Unattended deterministic default threshold (≥ 2 components) is conservative — most spikes have 1 component; document the threshold in `spike-variant.md` as editable |
| Spike detection appears in six SKILL.md files — six chances to drift | Medium | Medium | Factor the common snippet into `references/spike-variant.md` § Detecting — each SKILL.md carries only a one-liner pointer. Same pattern already in use for `defect-variant.md`; `/verify-code`'s prompt-quality check catches drift |

---

## Open Questions

- None resolved during design; the Out-of-Scope list captures deferred decisions (ADR content quality analysis, ADR supersession machinery, migrating closed issues).

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #99 | 2026-04-23 | Initial feature spec |

---

## Validation Checklist

- [x] Architecture follows existing project patterns (per `structure.md`) — mirrors the defect-variant label-dispatch grammar
- [x] All API/interface changes documented with schemas — `spike-researcher` output contract specified
- [x] Database/storage changes planned — not applicable (no database)
- [x] State management approach is clear — no new state; session-scoped flags flow through existing skill workflows
- [x] UI components and hierarchy defined — not applicable (CLI plugin)
- [x] Security considerations addressed — no new auth surface; `Codex web browsing`/`Codex web browsing` risk surface matches existing agents
- [x] Performance impact analysed — Phase 0 runtime bounded by runner step timeout; re-run idempotency is O(1)
- [x] Testing strategy defined — exercise tests per skill change; `/skill-creator` routing enforced per `verify-code` Step 5a
- [x] Alternatives were considered and documented — four alternatives with selection rationale
- [x] Risks identified with mitigations — seven risks with mitigation strategies
