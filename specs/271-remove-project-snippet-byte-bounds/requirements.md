# Requirements: Remove project snippet byte bounds

**Issue**: #271
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition/

---

## User Story

**As a** maintainer using project steering with nmg-sdlc
**I want** project prompt snippets to load without manifest size caps
**So that** growing project guidance cannot block unrelated worker prompt construction

## Background

Project steering `byteBound` values cap snippet UTF-8 size. `defaultPromptRegistry` registers every project snippet before rendering a consumer, so an over-bound project snippet throws `byte_bound_exceeded` even when that snippet is not consumed by the requested prompt. Execute then stops with `worker_prompt_failed`.

Plugin and builtin catalog fragments remain bounded. Only project steering snippets become unbounded, and leftover project-manifest `byteBound` fields are ignored for compatibility.

---

## Acceptance Criteria

### AC1: Worker start prompt loads unbounded project snippets

**Given** this repository's `steering/manifest.json` and snippet files
**When** `workerPrompt({ step: 'start', issue: 102, cwd: <repo root> })` runs
**Then** it returns a prompt string and does not throw `byte_bound_exceeded` or `worker_prompt_failed`

### AC2: Manifest snippets omit byteBound

**Given** a valid `steering/manifest.json`
**When** `loadSteeringRuntime` reads `snippets[]`
**Then** each record is exactly `{ id, path, consumers, slot, order }`
**And** this repository's `steering/manifest.json` has no `byteBound` keys

### AC3: Leftover byteBound is ignored

**Given** a consumer manifest snippet that still has `byteBound: 1` and a larger body
**When** the runtime loads and `defaultPromptRegistry` registers project fragments
**Then** load and registration succeed
**And** `projectPromptFragments` objects have no `byteBound` property

### AC4: Plugin catalog bounds remain

**Given** a plugin/builtin fragment with `byteBound: 1` and a larger body
**When** `registerPromptSnippet` runs
**Then** it still throws `Error('byte_bound_exceeded')`

### AC5: New initialize/migrate plans omit byteBound

**Given** `createInitializePlan` or upgrade `detectSteeringRuntime` snippet records
**When** the written `steering/manifest.json` is parsed
**Then** no snippet object has `byteBound`

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Do not enforce UTF-8 size against project steering snippets. | Must |
| FR2 | Drop `byteBound` from this repo's snippet registrations and from new initialize/migrate writes. | Must |
| FR3 | Ignore leftover `byteBound` on existing consumer manifests instead of failing unknown-key or enforcing the old cap. | Must |
| FR4 | Keep plugin catalog `byteBound` required and enforced. | Must |

## Out of Scope

- Removing plugin catalog or worker-header byte bounds.
- Unmasking `worker_prompt_failed` to `byte_bound_exceeded`.
- Closing or prompting the retained idle `s102-start` pane.
- Changing `workflows/draft-issue/WORKFLOW.md` paths.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #271 | 2026-08-26 | Initial bug-fix spec |
