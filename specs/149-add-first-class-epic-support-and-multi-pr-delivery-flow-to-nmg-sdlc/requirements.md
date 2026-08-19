# Requirements: First-Class Epic Support and Multi-PR Delivery Flow

**Issue**: #149
**Related Spec**: specs/177-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/
**Date**: 2026-08-16
**Status**: Approved
**Author**: Rich Nunley

---

## User Story

**As an** nmg-sdlc plugin maintainer (interactive) and as the SDLC runner (automated)
**I want** the SDLC to natively handle features that span multiple PRs — with first-class epic planning, a seal-spec flow, and child-issue-aware pipeline steps
**So that** I never have to improvise coordination structures on top of the pipeline when a feature's scope exceeds what one PR can safely deliver

---

## Background

The current pipeline assumes a strict 1:1:1 relationship: one GitHub issue → one spec directory → one branch → one PR. This breaks down in two legitimate ways:

1. **Discovery during spec writing** — `/write-spec` produces a design that calls for multiple PRs (e.g., additive infrastructure first, then pilot, then bulk rollout). There is no pipeline step for committing the umbrella spec and transitioning to child-issue work without opening a code PR or bumping the version.

2. **Intentional up-front epic planning** — a developer knows before writing any spec that a feature is too large for a single PR and wants to plan it as a coordinated set of issues from the start.

Today's workaround (observed in issue #138): write a spec that describes 4 PRs, manually convert the parent issue's body into a tracking checklist, run `/draft-issue` in batch mode to create children, then manually guide `/write-spec` on each child to amend the correct parent spec. None of these steps are SDLC-native.

See [issue #149](https://github.com/Nunley-Media-Group/nmg-plugins/issues/149) for full context.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

## Issue #177 Contract Supersession

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|

## Non-Functional Requirements

## Dependencies

## Out of Scope

## Success Metrics

## Open Questions

## Change History

## Validation Checklist
