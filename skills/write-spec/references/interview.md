# Phase 1 Gap Detection & Interview

**Read this when** Phase 1 has read the issue and steering docs and is about to enter amendment or creation mode. The interview is the pre-draft step that resolves open questions and underspecified acceptance criteria *before* `requirements.md` is written, so the draft reflects the user's intent rather than the issue's gaps.

## When to skip the step entirely

### 1. Unattended mode

Follow the pre-approved-gate pattern in `../../references/unattended-mode.md`. When the `.codex/unattended-mode` sentinel exists, do not present a Codex interactive gate; emit the one-line divergence note and proceed:

```
Unattended mode: skipping gap-detection interview — proceeding from issue body only
```

Everything below applies only when the sentinel is absent.

### 2. Adaptive skip (no gaps detected)

Run gap detection (below). If zero signals fire, skip the interview without calling Codex interactive gate. A well-specified issue should not introduce friction — the interview exists to fill gaps, not to ritualize them.

## Gap signals

Inspect the issue body (already in context). One confirmed signal per category produces one interview question.

### Signals that apply to every issue

| Signal | What triggers it |
|--------|------------------|
| **Unresolved Open Questions** | A `## Open Questions` (or `### Open Questions`) section exists and contains at least one list item that is not struck through, not marked resolved, and not blank. |
| **Missing acceptance criteria** | No `## Acceptance Criteria` section, or the section exists but contains no items. |
| **Malformed acceptance criteria** | ACs exist but none is structured as Given / When / Then — e.g., each is a single plain assertion. One well-formed AC in the list is enough to clear this signal. |

### Signals that apply only to bug-labelled issues

The Phase 1 Defect Detection step already determined whether the issue carries the `bug` label. Reuse that result — do not re-query `gh`.

| Signal | What triggers it |
|--------|------------------|
| **Missing reproduction steps** | No `## Steps to Reproduce` / `## Reproduction Steps` section, or the section is empty or contains only a placeholder line. |
| **Missing expected-vs-actual** | No `## Expected vs Actual` section (or equivalent pair of Expected / Actual sub-sections). |
| **Missing root-cause hypothesis** | No `## Root Cause` / `## Root Cause Analysis` section, or the section exists but contains no specific code reference (file path, function name, or line). |

## Classification-tailored probes

Which questions fire — and in what order — depends on the issue's classification. The goal is to avoid asking feature-scope questions about a bug report, or repro-step questions about a feature request.

### Feature issues

Ask in this order, up to the per-run cap:

1. **Open Questions items** — for each unresolved item, ask: *"The issue has an open question: '{item}'. What is the answer?"*
2. **AC structure** — if ACs are missing or malformed: *"The issue's acceptance criteria are missing or don't follow Given / When / Then. Can you describe the expected behavior as: Given [precondition], When [action], Then [outcome]?"*

### Bug-labelled issues

Ask in this order, up to the per-run cap:

1. **Reproduction steps** — *"The issue is missing reproduction steps. What is the smallest sequence of actions that triggers the bug?"*
2. **Expected vs actual** — *"What is the expected behavior, and what actually happens instead?"*
3. **Root-cause hypothesis** — *"Do you have a hypothesis for the root cause? Which file, function, or line is involved?"*
4. **Open Questions items** — as above, for each unresolved item.
5. **AC structure** — only if ACs are completely absent; a bug spec often needs just one AC for the fix.

Feature-scope / user-story / success-metric questions never fire for bug-labelled issues, regardless of how many gaps exist.

## Interview procedure

1. **Enumerate gaps.** Walk the applicable signal set and record each firing gap as a `(signal, source-text)` pair.

2. **Apply the per-run cap of 3 questions.** If more than 3 gaps fire, take the first 3 in probe order and defer the rest to the residual-capture step below.

3. **Present a Codex interactive gate once per gap** (up to the cap). The menu shape depends on the gap type and the issue's classification:

   - **Feature issues with an "Unresolved Open Questions" gap**: offer three options — `[1] Answer — I'll type the resolution` / `[2] Defer to spike — create a spike issue for this question (blocks #N until the spike ships)` / `[3] Skip — leave unresolved`. The Defer-to-Spike procedure is documented below.
   - **All other gaps** (feature AC structure; every bug-issue gap): offer two options — an **Answer** option (free-text via the `Other` affordance) and a **Skip — leave unresolved** option that records the gap in `## Open Questions`. Bug-labelled issues never see the Defer-to-Spike option; repro-step, expected-vs-actual, and root-cause gaps are not spike-shaped questions.

4. **Thread each answer into the draft.** The goal is for the answer to shape the written spec, not just live in session memory.

   | Gap type | Where the answer goes |
   |----------|------------------------|
   | Unresolved Open Questions item | The item is resolved — it does *not* reappear in the spec's `## Open Questions` section. If it changes an AC or FR, incorporate the change in the draft. |
   | Missing / malformed AC | Convert the user's answer into a properly structured Given / When / Then AC and write it into the requirements draft. |
   | Missing reproduction steps | Populate the `## Reproduction Steps` / `## Steps to Reproduce` section of the defect requirements template. |
   | Missing expected-vs-actual | Populate the Expected vs Actual table in the defect template. |
   | Missing root-cause hypothesis | Populate the Root Cause section of the defect template. |

5. **Capture residual items.** Any gap the user skipped, plus every gap deferred past the cap, is recorded verbatim in the spec's `## Open Questions` section so reviewers and downstream phases can see it. Use the original issue text where available; otherwise use the gap-signal description.

## Defer-to-Spike procedure (feature issues only)

When the user selects `[2] Defer to spike` on a feature issue's Unresolved Open Questions gap, perform the following sequence:

1. **Derive a spike title** from the gap question. Prefix with `Spike:` and start with a research verb — e.g., the gap `"Should we use OAuth or session cookies?"` becomes `"Spike: evaluate OAuth vs session cookies"`.
2. **Create the spike issue** via the `$nmg-sdlc:draft-issue` spike-template shape (or directly `gh issue create --label spike --body "..."` using the template at `skills/draft-issue/references/spike-template.md`). Seed the Research Questions section with the gap text verbatim. Capture the new issue number as `S`.
3. **Mark the parent blocked**: `gh issue edit #{N} --body "$(existing body)\n\nDepends on: #{S}"`. The `Depends on:` line is the machine-read convention used by `skills/open-pr/references/version-bump.md` § 4a, but here it signals a human dependency — the current feature cannot ship until the spike ADR is merged.
4. **Thread a placeholder into the draft**: in the requirements-draft's `## Open Questions` section (or an AC if the gap was AC-shaped), insert `See spike #{S} for resolution`. This preserves traceability without blocking the draft.
5. **Record the gap as resolved-via-spike** in the interview session state so the residual-capture step in procedure step 5 does NOT re-record it in `## Open Questions` (the placeholder line already captures it).
6. **Continue the interview** with the next gap. Creating a spike does not abort the current interview run.

## Unattended-mode behavior for Defer-to-Spike

The `Defer to spike` option is **never auto-selected** in unattended mode. The top-of-file unattended-mode rule already skips the interview entirely when `.codex/unattended-mode` exists (every gap becomes a residual item in `## Open Questions`). Spike creation requires explicit human selection.

## Amendment-mode rule

When Spec Discovery resolved an existing feature spec (amendment mode):

- Gap detection reads the **new issue's body only** — the issue whose number was passed to `$nmg-sdlc:write-spec`.
- Never re-read the existing `requirements.md` for gaps. Its content is append-only per `references/amendment-mode.md`.
- Answers influence only the content being appended in this pass. Existing ACs, FRs, and sections are preserved verbatim.

## Decision summary

| Condition | Behavior |
|-----------|----------|
| `.codex/unattended-mode` exists | Emit bypass note; skip gap detection and every Codex interactive gate call |
| Sentinel absent, zero gaps detected | Skip interview; proceed directly to draft |
| Sentinel absent, 1–3 gaps detected | Ask one Codex interactive gate per gap; thread answers into the draft |
| Sentinel absent, more than 3 gaps | Ask the first 3 in probe order; record the rest in `## Open Questions` |
| User chooses "Skip" for a gap | Record the gap verbatim in `## Open Questions` |
| User chooses "Defer to spike" (feature + Unresolved OQ only) | Create spike issue, add `Depends on: #S` to parent body, thread `See spike #S for resolution` into the draft |
| Amendment mode | Detect gaps in the new issue only; append answer-shaped content without touching approved sections |
