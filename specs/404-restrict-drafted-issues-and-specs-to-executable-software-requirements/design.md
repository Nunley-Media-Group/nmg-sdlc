# Design: Restrict Drafted Issues and Specs to Executable Software Requirements

**Issue**: #404
**Date**: 2026-09-18
**Status**: Approved
**Author**: NMG

## Architecture

Add one plugin-owned root reference, `references/execute-implementable-requirements.md`, and render it into only the `/sdlc-draft-issue` and `/sdlc-write-spec` prompts. Prompt composition places this reference after each workflow body and before project steering. File-backed prompt fragments remain realpath-contained within the existing `workflows/` root or the exact package-root `references/` subtree.

Both workflows perform two enforcement passes:

1. Early extraction applies the eligibility algorithm before issue splitting or interview synthesis.
2. A final whole-payload audit covers the complete issue body or all four complete spec files before plan creation and `xd://propose`.

A transient `Execute Feasibility` ledger is stored only in each local proposal plan. It covers every proposed AC, FR, task, and scenario and never enters GitHub issue bodies or spec artifacts.

## Execute Capability Model

The shared reference models `/sdlc-execute` as the delegated `start → implement → review1 → fix1 → review2 → fix2 → verify → deliver` sequence rather than as a generic agent. It defines:

- lifecycle preconditions and control-plane metadata;
- implement/fix outcome mutation, immutable Approved spec inputs, controller-owned evidence, and denied paths;
- isolated review and bounded fix authority;
- local, manifest-registered provider, and exact allowlisted PR-only verification evidence;
- exact-head delivery, version synchronization, PR linkage, merge, and issue closure;
- intervention-only limits including external judgment, unavailable credentials, live operations, another repository, human approval, release/tag/package publication, and infrastructure provisioning; and
- the repair boundary for non-material implementation details, bounded remediation, and material product decisions.

A candidate is retained only when an execute-owned stage can both realize it through permitted repository mutation or a narrow stage artifact and prove it through accepted observable evidence. Lifecycle metadata remains control-plane data, not generated Functional Requirements or task acceptance.

## Eligibility and Transformation

The shared ordered algorithm normalizes each candidate to the required behavior or task, identifies the owning realization and proof stage, checks mutation authority, requires an accepted evidence identity, rejects intervention-owned success conditions, strips excluded rationale or proof text, and reruns the gate. If no stage owns both realization and proof, the statement is omitted.

Mixed input preserves concrete behavior and testable constraints while deleting legal, policy, ownership, provenance, attestation, sign-off, live-operation, and other external burdens. Excluded material is not relocated into Background, Technical Notes, Out of Scope, design, tasks, Gherkin, or Open Questions. Concrete security, privacy, accessibility, performance, retention, audit-log, authorization, migration, configuration, and infrastructure-as-code behavior remains eligible when repository implementation and observable proof exist.

## Workflow Integration

`draft-issue` applies the gate after need gathering and before multi-issue detection, asks only for missing observable software behavior, builds the feasibility ledger, and audits each full issue body plus exact `ghCreateArgs.body` before proposal.

`write-spec` applies the gate before Interview, uses its existing three-ask budget to resolve material product choices, builds the ledger across every AC, FR, task, and scenario, and audits `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin` before proposal. A remaining material choice stops with the issue-numbered unresolved-decisions diagnostic rather than generating Open Questions.

Issue selection, publication, per-issue approval, execute orchestration, and Continue/Finished sequencing remain unchanged.

## Template Alignment

Issue templates admit only implementation-relevant software context, observable criteria, bounded technical constraints, and adjacent-software exclusions. Spec templates produce only retained functional requirements, behavior-implementing design, issue-specific repository tasks with AC-linked tests, and observable AC-linked Gherkin scenarios. Generic process, delivery, approval, risk, checklist, and instructional sections are removed from generated content.

## Deterministic Verification

Static contract tests pin prompt catalog membership, ordering, provenance, containment, capability boundaries, eligibility order, exact stop diagnostics, feasibility-ledger grammar, whole-payload audits, and template structure.

Artifact-scoped exercise evaluators inspect requirement-bearing headings and clauses instead of applying a repository-wide word blacklist. Draft rubric `R7` and write-spec rubrics `W1`–`W6` distinguish executable domain behavior from external obligations. Passing fixtures retain deletion, authorization, audit-log, benchmark, migration, configuration, and testable infrastructure-as-code behavior; failing fixtures identify the exact artifact section or clause retaining forbidden burdens.

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2026-09-18 | Initial approved design | NMG |
