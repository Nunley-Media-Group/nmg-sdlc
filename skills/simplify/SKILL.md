---
name: simplify
description: "Review changed files for behavior-preserving simplification opportunities, then apply worthwhile cleanup fixes across reuse, code quality, and efficiency without changing feature behavior."
---

# Simplify

Run a focused cleanup pass over changed code. Preserve behavior, avoid scope changes, and leave architecture, security, and spec verification to `$nmg-sdlc:verify-code`.

## Workflow

### Step 1: Identify Scope

Discover files to review in this order:

1. Run `git diff --name-only` to list unstaged changed files.
2. If staged changes exist, run `git diff HEAD --name-only` so staged and unstaged files are both included.
3. If the git diff is empty, review files the user explicitly mentioned or files edited in the current conversation.
4. Exclude generated artifacts, dependency directories, lockfile-only changes, and binary files unless the user explicitly asked to review them.

If no reviewable files can be identified, report that no changed or referenced files were available and stop successfully.

### Step 2: Review for Reuse

For each scoped file:

1. Search adjacent modules and shared utilities for existing helpers, patterns, constants, parsers, validators, and abstractions.
2. Flag duplicated functions, hand-rolled parsing, repeated conditionals, or inline logic that can be replaced safely with existing code.
3. Skip replacement suggestions that would broaden dependencies, obscure intent, or change behavior.

### Step 3: Review for Code Quality

Check the scoped diff for:

- Redundant state or derived values stored unnecessarily
- Parameter sprawl and avoidable argument threading
- Copy-paste variation between similar branches
- Leaky abstractions or helpers with unclear ownership
- Stringly typed code where a local constant, enum-like map, or structured value already exists
- Unnecessary JSX, markup, or conditional nesting
- Nested conditionals that can be flattened without losing clarity
- Comments that restate obvious code instead of explaining intent

### Step 4: Review for Efficiency

Check for behavior-preserving efficiency improvements:

- Unnecessary repeated work inside loops or hot paths
- Missed concurrency for independent operations
- Recurring no-op updates
- Existence pre-checks that duplicate later work
- Broad scans or file operations where a narrower scope is available
- Retained references, listeners, or timers that can leak memory

Skip any efficiency change that would require new dependencies, alter ordering guarantees, or make the code harder to reason about.

### Step 5: Optional Delegated Review

Run the review inline by default.

Use Codex `explorer` subagents only when the user or runner explicitly authorizes delegation. When authorized, spawn three bounded read-only explorers in parallel:

| Explorer | Scope | Output |
|----------|-------|--------|
| Reuse | Existing helpers, adjacent patterns, duplicated functions, and shared modules | Findings with file references and suggested replacements |
| Quality | State shape, abstraction boundaries, conditionals, comments, and duplicated branches | Behavior-preserving cleanup recommendations |
| Efficiency | Avoidable work, repeated no-ops, hot paths, concurrency, and broad operations | Risk-ranked optimization recommendations |

Explorer output is advisory. The parent skill decides what to change and applies only behavior-preserving fixes.

### Step 6: Aggregate and Fix

Aggregate findings from reuse, quality, and efficiency review.

For each finding:

1. Apply the smallest behavior-preserving cleanup that clearly improves the code.
2. Do not change feature behavior, public contracts, user-visible copy, persistence formats, permissions, or test expectations unless the user explicitly requested it.
3. Skip false positives, risky refactors, and changes whose value is not clear.
4. Use `apply_patch` for manual edits and follow the repository's existing style.

After edits, run the narrowest relevant validation command when one is obvious from the changed files or project steering. If validation cannot be run, state why.

### Step 7: Report Outcome

Report:

- Files reviewed
- Fixes applied
- Findings skipped and why
- Validation run

If no worthwhile cleanup is found, say the scoped files were already clean.

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #N  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N  →  $nmg-sdlc:address-pr-comments #N
                                                                                              ▲ You are here
```
