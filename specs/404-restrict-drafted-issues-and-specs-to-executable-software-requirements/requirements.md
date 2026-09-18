# Requirements: Restrict Drafted Issues and Specs to Executable Software Requirements

**Issue**: #404
**Date**: 2026-09-18
**Status**: Approved
**Author**: NMG

## Need

`/sdlc-draft-issue` and `/sdlc-write-spec` must retain only functional software behavior and implementation-relevant technical detail that `/sdlc-execute` can realize through repository changes and prove through observable software evidence. Mixed input must preserve that executable slice while removing externally owned legal, policy, ownership-proof, attestation, sign-off, live-operation, and similar obligations from every generated section.

## Acceptance Criteria

### AC1: Classify content against actual execute authority

**Given** a candidate issue or spec statement
**When** draft-issue or write-spec evaluates whether to retain it
**Then** it retains the statement only when `/sdlc-execute` implement/fix workers can realize it through permitted repository changes
**And** verify can prove it through observable local evidence, an already registered and available provider, or qualified bounded PR-only evidence
**And** start/delivery lifecycle work remains control-plane metadata rather than a Functional Requirement

### AC2: Preserve only the executable slice of mixed input

**Given** source material contains eligible software behavior together with legal, policy, ownership-proof, attestation, live-operation, or other externally owned obligations
**When** draft-issue or write-spec synthesizes its generated artifacts
**Then** it retains the software behavior and testable technical constraints
**And** it omits the external obligation, rationale, citation, proof, sign-off, operation, or attestation from every generated section
**And** concrete software behavior remains eligible after its legal, policy, or ownership rationale is stripped

### AC3: Do not hide excluded material in contextual sections

**Given** source material contains an obligation that `/sdlc-execute` cannot implement and verify
**When** either workflow filters the source
**Then** it does not relocate that material into Background, Technical Notes, Out of Scope, design, tasks, Gherkin, or an Open Questions section
**And** Out of Scope contains only adjacent software behavior

### AC4: Stop when no executable requirement remains

**Given** filtering leaves no software behavior that `/sdlc-execute` can implement and verify
**When** draft-issue or write-spec reaches synthesis
**Then** it emits the workflow's exact diagnostic
**And** it stops before plan creation, proposal, repository mutation, or GitHub mutation

### AC5: Apply one contract to both rendered prompts

**Given** the extension renders either interactive command
**When** prompt fragments are composed
**Then** the same plugin-owned `/sdlc-execute` capability contract is present after the workflow body
**And** project steering cannot be mistaken for permission to publish obligations outside execute authority

### AC6: Audit the complete generated payload

**Given** eligible source material remains
**When** synthesis is complete
**Then** draft-issue audits the complete issue body and write-spec audits all four complete spec files before local plan creation and `xd://propose`
**And** the local plan records an execute-feasibility row for every proposed AC, FR, task, and scenario without copying that audit into the issue or spec
**And** no material product choice is deferred to execute as an Open Question

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Define one shared `/sdlc-execute` implementability, exclusion, transformation, empty-result, and final-audit contract for both interactive commands. | Must |
| FR2 | Model actual start, implement/fix, review, verify, delivery, mutation-path, evidence, and intervention boundaries. | Must |
| FR3 | Record a transient per-item feasibility ledger in each proposal plan and keep it out of generated issue/spec content. | Must |
| FR4 | Render the shared contract into only the draft-issue and write-spec prompts from a contained plugin reference path. | Must |
| FR5 | Filter every issue-body and spec-file section, not only Functional Requirements tables. | Must |
| FR6 | Preserve concrete security, privacy, accessibility, performance, retention, audit-log, authorization, migration, and repository-configuration behavior only when execute can implement and verify it. | Must |
| FR7 | Stop without mutation when no `/sdlc-execute`-implementable software behavior remains. | Must |
| FR8 | Keep issue selection, spec publication, execute orchestration, per-issue approval, and Continue/Finished sequencing unchanged. | Must |

## Out of Scope

- Changing issue selection, dependency publication, spec publication, execute, verification, or delivery sequencing
- Adding a plural `/sdlc-write-specs` command
- Adding a keyword blacklist that rejects valid software-domain fields

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2026-09-18 | Initial approved specification | NMG |
