# Phase 1 Gap Detection & Interview

**Read this when** Phase 1 has read the issue and steering docs and is about to enter amendment or creation mode. The interview is the pre-draft step that resolves open questions and underspecified acceptance criteria *before* `requirements.md` is written, so the draft reflects the user's intent rather than the issue's gaps.

## When to skip the step entirely

### 1. Unattended mode

Follow the pre-approved-gate pattern in `../../references/unattended-mode.md`. When the `.claude/unattended-mode` sentinel exists, do not call `AskUserQuestion`; emit the one-line divergence note and proceed:

```
Unattended mode: skipping gap-detection interview — proceeding from issue body only
```

Everything below applies only when the sentinel is absent.

### 2. Adaptive skip (no gaps detected)

Run gap detection (below). If zero signals fire, skip the interview without calling `AskUserQuestion`. A well-specified issue should not introduce friction — the interview exists to fill gaps, not to ritualize them.

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

3. **Call `AskUserQuestion` once per gap** (up to the cap) with the gap-specific question and two options — an **Answer** option (free-text via the `Other` affordance) and a **Skip — leave unresolved** option that records the gap in `## Open Questions`.

4. **Thread each answer into the draft.** The goal is for the answer to shape the written spec, not just live in session memory.

   | Gap type | Where the answer goes |
   |----------|------------------------|
   | Unresolved Open Questions item | The item is resolved — it does *not* reappear in the spec's `## Open Questions` section. If it changes an AC or FR, incorporate the change in the draft. |
   | Missing / malformed AC | Convert the user's answer into a properly structured Given / When / Then AC and write it into the requirements draft. |
   | Missing reproduction steps | Populate the `## Reproduction Steps` / `## Steps to Reproduce` section of the defect requirements template. |
   | Missing expected-vs-actual | Populate the Expected vs Actual table in the defect template. |
   | Missing root-cause hypothesis | Populate the Root Cause section of the defect template. |

5. **Capture residual items.** Any gap the user skipped, plus every gap deferred past the cap, is recorded verbatim in the spec's `## Open Questions` section so reviewers and downstream phases can see it. Use the original issue text where available; otherwise use the gap-signal description.

## Amendment-mode rule

When Spec Discovery resolved an existing feature spec (amendment mode):

- Gap detection reads the **new issue's body only** — the issue whose number was passed to `/write-spec`.
- Never re-read the existing `requirements.md` for gaps. Its content is append-only per `references/amendment-mode.md`.
- Answers influence only the content being appended in this pass. Existing ACs, FRs, and sections are preserved verbatim.

## Decision summary

| Condition | Behavior |
|-----------|----------|
| `.claude/unattended-mode` exists | Emit bypass note; skip gap detection and every `AskUserQuestion` call |
| Sentinel absent, zero gaps detected | Skip interview; proceed directly to draft |
| Sentinel absent, 1–3 gaps detected | Ask one `AskUserQuestion` per gap; thread answers into the draft |
| Sentinel absent, more than 3 gaps | Ask the first 3 in probe order; record the rest in `## Open Questions` |
| User chooses "Skip" for a gap | Record the gap verbatim in `## Open Questions` |
| Amendment mode | Detect gaps in the new issue only; append answer-shaped content without touching approved sections |
