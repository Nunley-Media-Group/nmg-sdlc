# Tasks: Distinguish zero steering validations from missing results

**Issue**: #280
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Runtime Contract

- [ ] T1 — Add a pure declaration/result coverage calculation with deterministic missing, duplicate, and unknown ids.
- [ ] T2 — Persist coverage in successful verification artifacts and impose `Incomplete` when coverage is incomplete.
- [ ] T3 — Preserve zero-declaration success and all existing applicability, provider, identity, and required-result semantics.
- [ ] T4 — Expose the artifact coverage summary from the steering verifier CLI.

## Regression Coverage

- [ ] T5 — Prove zero declarations plus zero results is complete with no ceiling.
- [ ] T6 — Prove missing, duplicate, and unknown results are incomplete.
- [ ] T7 — Prove complete declared results retain existing required and optional ceiling behavior.
- [ ] T8 — Prove runtime/config failures cannot claim complete coverage.

## Surfaces and Verification

- [ ] T9 — Synchronize verify-code workflow, generated command, schema reference, README, and changelog semantics.
- [ ] T10 — Run focused runtime and generated-surface tests.
- [ ] T11 — Run plugin-surface checks and the full scripts test suite.
- [ ] T12 — Install the verified local plugin into OMP and prove the installed runtime reports complete zero-declaration coverage.
- [ ] T13 — Resume PennyScan #103 verification in a fresh Herdr OMP pane and close superseded panes.

## Steering Alignment

- Product: prevents valid managed projects from deadlocking without weakening any configured validation.
- Technical: keeps fail-closed evaluation in deterministic Node ESM core and exposes machine-readable evidence.
- Structure: retains runtime behavior in `src/`, CLI adaptation in `scripts/`, workflow prose in `workflows/`, and public schema documentation in `references/`.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #280 | 2026-08-26 | Initial approved task plan |
