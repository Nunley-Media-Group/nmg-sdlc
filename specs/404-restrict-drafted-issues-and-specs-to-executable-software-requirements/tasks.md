# Tasks: Restrict Drafted Issues and Specs to Executable Software Requirements

**Issue**: #404
**Date**: 2026-09-18
**Status**: Approved
**Author**: NMG

## Implementation Tasks

### T001: Add shared contract, prompt rendering, and workflow enforcement

**File(s)**: `references/execute-implementable-requirements.md`, `src/sdlc-prompt-snippets.mjs`, `workflows/draft-issue/WORKFLOW.md`, `workflows/draft-issue/references/interview-depth.md`, `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/interview.md`
**Type**: implementation
**Depends**: none
**Acceptance**: AC1, AC2, AC3, AC4, AC5, AC6; define the real `/sdlc-execute` capability and eligibility contract once, render it only into both intended consumers with closed path containment, enforce early extraction and final payload audits, create transient seven-column feasibility ledgers, preserve executable mixed-input behavior, and stop with exact diagnostics before proposal or mutation when no eligible behavior or resolved material choice remains.

### T002: Align issue and spec output templates

**File(s)**: `workflows/draft-issue/references/feature-template.md`, `workflows/draft-issue/references/bug-template.md`, `workflows/write-spec/templates/requirements.md`, `workflows/write-spec/templates/design.md`, `workflows/write-spec/templates/tasks.md`, `workflows/write-spec/templates/feature.gherkin`
**Type**: implementation
**Depends**: T001
**Acceptance**: AC2, AC3, AC6; generated artifacts contain only retained functional software context, observable criteria, behavior-implementing design, issue-specific repository tasks with AC-linked tests, observable AC-linked scenarios, and adjacent-software exclusions while preserving feature/bug variants, singular issue frontmatter, status grammar, canonical optional `**File(s)**:` syntax, and the four-artifact package.

### T003: Pin deterministic contracts, exercises, and public documentation

**File(s)**: `scripts/__tests__/interactive-plan-contract.test.mjs`, `scripts/__tests__/sdlc-prompt-snippets.test.mjs`, `scripts/skill-exercise-runner.mjs`, `scripts/__tests__/skill-exercise-runner.test.mjs`, `scripts/__fixtures__/skill-exercise/draft-issue/`, `scripts/__fixtures__/skill-exercise/write-spec/`, `scripts/__fixtures__/skill-exercise/rubrics/write-spec.md`, `scripts/skill-inventory.baseline.json`, `README.md`
**Type**: test and documentation
**Depends**: T001, T002
**Acceptance**: AC1, AC2, AC3, AC4, AC5, AC6; static tests pin composition and workflow boundaries, artifact-scoped evaluators accept executable domain behavior and reject exact forbidden clauses with distinct structural diagnostics and CLI exit codes, inventory remains current, and public documentation states the execute-feasibility boundary without relocating excluded burdens.

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2026-09-18 | Initial approved task plan | NMG |
