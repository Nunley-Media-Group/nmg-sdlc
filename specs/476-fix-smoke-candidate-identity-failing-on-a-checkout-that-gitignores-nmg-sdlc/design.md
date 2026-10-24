# Root Cause Analysis: Fix smoke candidate identity failing on a checkout that gitignores .nmg-sdlc

**Issue**: #476
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Root Cause

`candidateTree` in `steering/extensions/nmg-sdlc-smoke.mjs` stages the working tree into a temporary index with `git add -A -- . ':(exclude).nmg-sdlc' ':(exclude)specs/*/verification-report.md'`. git rejects a pathspec, an exclusion included, that names an ignored path, and exits 1. v4.0.0 (#466) added `.nmg-sdlc/` to the repository's `.gitignore` and also introduced this exclusion, so since then the candidate tree has never been computable in nmg-sdlc's own checkout. Smoke stops at `candidate identity unavailable` before any delivery.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `steering/extensions/nmg-sdlc-smoke.mjs` | `candidateTree` | Names an ignored path in an exclude pathspec |

## Fix Strategy

Run `git check-ignore -q .nmg-sdlc` first. On exit 0 (ignored), leave the exclusion out, because `add -A` already skips ignored files. On exit 1, keep the exclusion. On any other exit, return `null`. Export `candidateTree` so it can be tested against real git.
