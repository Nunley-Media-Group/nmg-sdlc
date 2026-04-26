---
name: run-retro
description: "Analyze defect specs to identify spec-writing gaps and produce actionable learnings. Use when user says 'run retrospective', 'analyze defects', 'review past bugs', 'what can we learn from bugs', 'update retrospective', 'how do I run a retrospective', or 'learn from our bugs'. Produces steering/retrospective.md that $nmg-sdlc:write-spec reads to avoid repeating past failures. Utility skill — run periodically, outside the main SDLC pipeline."
---

# Run Retro

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Batch-analyze defect specs to identify recurring spec-writing gaps and produce `steering/retrospective.md` — a steering document that `$nmg-sdlc:write-spec` reads during Phase 1 to avoid repeating past spec failures.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if the project still keeps SDLC artifacts under `.codex/steering/` or `.codex/specs/`.

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel pre-approves every `request_user_input` gate call site so the runner can drive a retro without stopping for user input.

Read `../../references/spec-frontmatter.md` when you need the defect-spec schema or the `**Related Spec**` field conventions — Step 2's chain resolution depends on `**Related Spec**` pointing at either a feature spec (terminating) or another defect spec (recursive).

Read `references/edge-cases.md` when any input file is missing, malformed, or unexpectedly shaped (no defects found, broken `**Related Spec**` chain, malformed state file, deleted spec) — the reference covers every graceful-degradation path so the retrospective never halts the runner.

---

## Workflow

### Step 1: Scan for Defect Specs

Use file discovery to find all spec files:

```
specs/*/requirements.md
```

Then `Read` the **first line** of each file and collect those whose heading starts with `# Defect Report:`. This reliably distinguishes defect specs from feature specs (which start with `# Requirements:`) without depending on text search glob parameter interpretation.

### Step 1.5: Load State and Compute Hashes

Read `steering/retrospective-state.json` if it exists. This state file tracks which defect specs have been previously analyzed and their content hashes, enabling incremental runs that skip unchanged specs.

State file schema:

```json
{
  "version": 1,
  "specs": {
    "specs/20-fix-example/requirements.md": {
      "hash": "a1b2c3d4e5f6...",
      "lastAnalyzed": "2026-02-22"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | integer | Schema version (must be `1`). |
| `specs` | object | Map of spec file paths to metadata. Keys are relative paths from project root. |
| `specs[path].hash` | string | SHA-256 hex digest of the spec file's content at time of last analysis. |
| `specs[path].lastAnalyzed` | string | ISO 8601 date (YYYY-MM-DD) when the spec was last analyzed. |

Loading rules:

- File does not exist → treat as empty state (first run — every spec is "new").
- File contains malformed JSON → warn `State file contains invalid JSON — falling back to full re-analysis` and treat as empty state.
- File exists but `version` is not `1` → warn `State file has unrecognized version [N] — falling back to full re-analysis` and treat as empty state.

Compute a SHA-256 hash of each defect spec's `requirements.md` using `shasum -a 256` (fall back to `sha256sum` when unavailable). Use the hex digest portion of the output.

Partition specs by comparing each computed hash against the loaded state file:

- **New** — spec path not in state file.
- **Modified** — spec path in state file but hash differs.
- **Unchanged** — spec path in state file and hash matches.
- **Deleted** — path in state file but spec no longer exists on disk.

Report the partition counts:

```
Found [N] defect specs: [new] new, [modified] modified, [unchanged] unchanged, [deleted] removed
```

### Step 1.6: Scan ADRs for Aging

Read `references/adr-aging.md` when `docs/decisions/` exists — the reference covers scanning ADR files, reading commit dates via `git log --follow --format=%aI -- {file}`, flagging ADRs older than 180 days, and emitting re-spike candidate rows in the retrospective output.

If `docs/decisions/` does not exist, skip this step entirely (no error, no warning — ADRs are optional, created on first spike via `$nmg-sdlc:write-spec` Phase 0).

Record the re-spike candidate list in session state for Step 7 to append to the retrospective output.

### Step 2: Filter to Eligible Defect Specs and Resolve Feature Spec Links

Apply eligibility filtering and chain resolution only to **new and modified** specs from Step 1.5. Unchanged specs are already known-eligible from their prior successful analysis; deleted specs are removed from consideration entirely.

Read each new / modified candidate defect spec and extract the `**Related Spec**:` field (bold-formatted in the defect template).

- **Skip** defect specs without a `**Related Spec**` field — there is no feature spec to correlate against.
- **Warn** if a `**Related Spec**` link points to a nonexistent spec directory — log the warning and skip that defect.

**Chain resolution**: after extracting the `**Related Spec**` path, `Read` the target's `requirements.md` first heading:

- Target starts with `# Requirements:` — it is a feature spec. Use it directly.
- Target starts with `# Defect Report:` — it is another defect spec. Follow **its** `**Related Spec**` link recursively.
- Maintain a **visited set** of paths to detect cycles. If a path is visited twice, the chain is circular.
- Chain is circular or reaches a dead end (missing `**Related Spec**`, nonexistent directory) → warn `Related Spec chain from [defect] is circular or broken — skipping` and exclude the defect from analysis.
- Replace the raw `**Related Spec**` value with the **resolved feature spec path** for use in Step 3.

After filtering and chain resolution, if **zero eligible new / modified defect specs** remain **and** there are **no unchanged specs** with carried-forward learnings:

```
No defect specs with Related Spec links found. No retrospective generated.
```

Stop here — do not create or modify `retrospective.md`.

If zero new / modified specs are eligible but unchanged specs exist with carried-forward learnings, proceed to Step 3.5 to carry forward existing learnings (skip Step 3).

### Steps 3 and 3.5: Analyse Eligible Defects / Carry Forward

Read `references/learning-extraction.md` when Step 2 has produced at least one eligible new / modified spec or at least one carry-forward candidate — the reference covers per-defect comparison against the resolved feature spec, the transferable-principle framing for each learning, the carry-forward decision for unchanged specs, and the progress line emitted before analysis begins.

### Steps 4–6: Aggregate, Classify, Filter

Read `references/transferability.md` when the combined set of fresh + carried-forward learnings is ready — the reference covers cross-cutting pattern aggregation (Step 4), classification into one of three pattern types (Step 5), scope filtering with the abstraction-level check (Step 6), and the evidence-path format used in the final output table.

### Step 7: Write Retrospective Document

Write `steering/retrospective.md` using `templates/retrospective.md`.

Fill in:

- **Last Updated** — today's date.
- **Defect Specs Analyzed** — count of eligible defect specs processed.
- **Learnings Generated** — total count of learnings across all three pattern types.
- **Table rows** — one row per learning in the appropriate pattern-type section, with columns **Learning** (transferable spec-writing pattern), **Recommendation** (actionable guidance), and **Evidence (defect specs)** (comma-separated paths to contributing defect spec directories).

Remove placeholder rows from sections with no learnings — leave only the table header.

**Re-Spike Candidates section**: when Step 1.6 produced re-spike candidates (ADRs older than 180 days), append the `## Re-Spike Candidates` section defined in `references/adr-aging.md` § Output Section after the main retrospective content. Omit the section entirely when no candidates were found (see `references/adr-aging.md` for the omission rule).

### Step 8: Write State File

Write `steering/retrospective-state.json` to persist the current analysis state for the next run.

1. For each new or modified spec that was analysed: record the computed SHA-256 hash from Step 1.5 and today's date as `lastAnalyzed`.
2. For each unchanged spec: preserve the existing `hash` and `lastAnalyzed` date from the loaded state file.
3. **Omit deleted specs** — they are no longer in the current defect spec set.
4. Set `version` to `1`.

Write the state file as formatted JSON with 2-space indentation. Ensure the `steering/` directory exists before writing.

### Step 9: Output Summary

```
Retrospective complete.

Defect specs: [total] total ([new] new, [modified] modified, [unchanged] skipped, [deleted] removed)
Learnings generated: [total] ([new_count] new, [carried_count] carried forward)

  Missing Acceptance Criteria: [count]
  Undertested Boundaries: [count]
  Domain-Specific Gaps: [count]

Written to steering/retrospective.md
State saved to steering/retrospective-state.json

[If `.codex/unattended-mode` does NOT exist]: Next step: This document will be read automatically by `$nmg-sdlc:write-spec` during Phase 1 on the next spec-writing run — no action needed. Run `$nmg-sdlc:draft-issue` or `$nmg-sdlc:start-issue` to continue the SDLC workflow.
[If `.codex/unattended-mode` exists]: Done. Awaiting orchestrator.
```

---

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #N  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N  →  $nmg-sdlc:address-pr-comments #N
                                                   ▲                                                                         │
                                                   │                                                                         ▼
                                                   └──── reads retrospective.md ◄──── $nmg-sdlc:run-retro ◄──── defect specs
```

The retrospective skill sits outside the main linear pipeline. It is invoked periodically (not per-issue) and feeds learnings back into the spec-writing step.
