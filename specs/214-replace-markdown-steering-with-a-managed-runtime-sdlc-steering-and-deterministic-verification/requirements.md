# Requirements: Managed steering runtime and deterministic verification

**Issue**: #214
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition/

---

## User Story

**As a** developer on a managed nmg-sdlc project
**I want** `/sdlc-steering` to manage a versioned steering runtime, project snippets, and deterministic validations
**So that** every required project check is enforced by core code and project guidance reaches prompts through one registry path

---

## Background

Current steering is free-form `steering/product.md`, `steering/tech.md`, and `steering/structure.md`. `verify-code` reads those documents but does not load its verification-gates reference, so Markdown gate rows are not a reliable executable contract and cannot deterministically cap verification. Onboarding hand-fills static templates; upgrade only relocates legacy files. There is no managed manifest, module set, project extension registry, or provider result schema.

Issue #213 supplies the plugin-owned prompt-snippet registry. This issue extends that registry only through validated manifest registrations; it must not add another prompt concatenation path. Implementation must not begin until #213 is merged and closed.

---

## Acceptance Criteria

### AC1: `/sdlc-steering` plans and applies a valid runtime

**Given** a managed repository and natural-language `$ARGUMENTS`
**When** `/sdlc-steering` runs in native plan mode and its exact plan is approved
**Then** it uses the shared steering writer to create or update `steering/manifest.json`, the fixed managed module set, and declared project snippets or extensions
**And** it validates the complete staged runtime before replacing live files
**And** headless or print invocation fails closed with `Run /sdlc-steering in the TUI.`

### AC2: approved upgrade removes legacy dual authority safely

**Given** legacy `steering/product.md`, `steering/tech.md`, and `steering/structure.md`
**When** the steering-runtime upgrade category is approved
**Then** the shared writer migrates project content into registered project snippets and installs the fixed managed modules
**And** it removes the three legacy documents only after staged validation succeeds
**And** later upgrades replace only manifest-marked managed files while preserving unknown files, snippets, extensions, and `steering/retrospective.md`

### AC3: onboard delegates to the same writer

**Given** greenfield or enhancement onboarding that needs steering
**When** the approved onboard plan applies
**Then** onboard invokes the same steering writer in initialize mode
**And** it does not create the old product, tech, or structure documents as live authorities

### AC4: every applicable required validation fails closed

**Given** schema-valid manifest validations with closed `when` conditions
**When** `/sdlc-verify-code` or the execute verify worker verifies an issue
**Then** core code evaluates every condition from the scoped diff and filesystem before provider launch
**And** it launches every applicable validation, validates every provider result, and records identity-bound evidence
**And** any applicable required failure, incomplete result, crash, timeout, missing result, stale identity, or unresolved provider forbids `Pass` and `PR Evidence Pending`

### AC5: providers cannot self-skip an applicable required validation

**Given** a required validation whose core-evaluated condition is true
**When** its provider returns `skipped` or `not_applicable`
**Then** core records the validation as `incomplete`
**And** a false condition is instead recorded as `skipped` by core without launching the provider

### AC6: duplicate and unresolved registrations are rejected

**Given** duplicate module, extension, provider, validation, or snippet ids, an unknown manifest key, an escaping path, or a provider id that resolves to zero or multiple providers
**When** steering validation or verify discovery runs
**Then** it fails with a stable named reason code
**And** no invalid runtime or partial validation set is accepted

### AC7: project snippets use the prompt registry and cannot override results

**Given** manifest-registered Markdown snippets with allowed consumers and slots
**When** a matching command or worker prompt renders
**Then** the prompt-snippet registry loads them in declared order and includes their provenance
**And** no project directory is scanned for undeclared snippets
**And** snippet prose cannot mutate, suppress, or raise a core validation result


---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Add interactive `/sdlc-steering [prompt]`; it must use native `/plan`, `xd://propose`, and the standard TUI-only fail-closed contract. | Must | No automated file command. |
| FR2 | `steering/manifest.json` is the only registration index for managed modules, project snippets, extensions, providers, and validations. | Must | Unknown keys fail. |
| FR3 | Plugin templates own exactly four replaceable modules: product, tech, structure, and verification. | Must | Installed under `steering/modules/`. |
| FR4 | Project guidance lives in manifest-registered Markdown under `steering/snippets/`; executable project providers live under `steering/extensions/`. | Must | Unknown project files are preserved, not loaded. |
| FR5 | One shared steering writer supports initialize, update, and migrate modes and is called by `/sdlc-steering`, onboard, and upgrade. | Must | Validate staged output before live mutation. |
| FR6 | Approved migration removes legacy product/tech/structure files only after their content is represented in snippets and the new runtime validates. | Must | No dual authority. |
| FR7 | Every registration id is globally unique in its identity class; every validation provider resolves exactly once. | Must | Duplicate or unresolved ids fail closed. |
| FR8 | Core evaluates a closed condition grammar before launching providers. | Must | Providers never decide applicability. |
| FR9 | Built-ins provide command, artifact, and external-evidence checks using explicit program/argv or schema-checked files; shell command strings are forbidden. | Must | Project extensions handle stack-specific flows. |
| FR10 | Required applicable validations accept only schema-valid `passed` results with non-empty evidence. | Must | All other outcomes cap verification below success. |
| FR11 | Results bind to head SHA, clean/dirty tree identity, spec hash, steering hash, and validation-config hash. | Must | Stale evidence is incomplete. |
| FR12 | Validated manifest snippets extend issue #213's registry through named slots and provenance; no direct concatenation or directory scan is allowed. | Must | Validation state remains outside prompt text. |
| FR13 | `references/steering-schema.md`, README, workflows, commands, tests, and generated surfaces must describe the managed runtime instead of legacy Markdown authority. | Must | Clean cutover. |
| FR14 | `steering/retrospective.md` remains project content owned by `/sdlc-run-retro`. | Should | It is never a managed runtime file. |

---

## Out of Scope

- Changing execute step order, review/fix panes, or handoff schema
- Sandboxing trusted project extension code
- Replacing `/sdlc-run-retro` or converting retrospective learnings to executable modules
- Allowing extensions to write handoffs, alter lifecycle steps, open or merge PRs, or override plugin safety fragments
- Treating model-improvised browser or simulator interaction as passing evidence
- Supporting a live compatibility mode where legacy product/tech/structure documents remain authoritative

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #214 | 2026-08-23 | Initial feature spec |
