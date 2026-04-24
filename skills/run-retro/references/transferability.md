# Learning Transferability: Aggregate, Classify, Filter

**Consumed by**: `run-retro` Steps 4 (aggregate), 5 (classify), and 6 (filter).

These three steps take the combined set of fresh + carried-forward learnings from Step 3 / 3.5 and shape them into the `steering/retrospective.md` table that `$nmg-sdlc:write-spec` reads. The goal across all three steps: surface higher-order patterns, assign a single pattern type, and keep only learnings that a better-written spec could have prevented.

## Step 4: Aggregate cross-cutting patterns

The input is the **combined set** of:

- Fresh learnings from Step 3 (newly analysed new / modified specs).
- Carried-forward learnings from Step 3.5 (extracted from the existing `retrospective.md` for unchanged specs).

Review the full combined set:

1. **Group learnings** that share a root pattern type into a single cross-cutting learning — grouping requires a shared root *pattern type* (e.g., "missing ACs for protocol statefulness"), not just a shared category.
2. **Merge grouped learnings** into one consolidated learning that captures the common principle.
3. **List all contributing defect specs** as evidence for each aggregated learning (comma-separated paths).
4. **Preserve ungrouped learnings** as-is — not every learning will aggregate.

The goal is to surface higher-order patterns. If three defects all stem from missing ACs around session state, the output is one learning about session-state ACs with three evidence references, not three separate learnings. A carried-forward learning may be merged with a fresh learning if they share a root pattern type — the merged result replaces both.

## Step 5: Classify learnings

Classify each learning into exactly one of three pattern types:

| Pattern Type | Definition | Example |
|-------------|------------|---------|
| **Missing Acceptance Criteria** | The feature spec lacked ACs for the scenario that caused the bug — the gap was a completely absent test case | Feature spec for login had no AC for session timeout expiry |
| **Undertested Boundaries** | The feature spec had related ACs but didn't cover the specific boundary or edge condition | Feature spec tested valid inputs but not empty string or max-length |
| **Domain-Specific Gaps** | The feature spec missed domain knowledge that should have been captured as requirements | Financial feature spec didn't consider rounding rules for currency |

## Step 6: Filter learnings

**Include** only learnings that would improve `$nmg-sdlc:write-spec` effectiveness — gaps a better-written feature spec could have prevented.

**Exclude** learnings that fall outside spec-writing scope:

| Exclude Category | Rationale | Example |
|-----------------|-----------|---------|
| Implementation bugs | Code-level errors, not spec gaps | Off-by-one error, wrong variable name |
| Tooling issues | Build / CI / toolchain problems | Webpack config error, dependency conflict |
| Infrastructure failures | Environment / deployment issues | Server timeout, DNS misconfiguration |
| Process failures | Workflow / communication gaps | Missing code review, skipped testing |

**Heuristic**: if the defect could have been prevented by a better-written feature spec (more ACs, tighter boundary definitions, deeper domain analysis), it produces a learning. Otherwise, exclude it.

### Abstraction-level check

Each surviving learning must sit at the right level of generality:

| Level | Indicator | Action |
|-------|-----------|--------|
| **Too specific** | References project domain terms, specific file names, or implementation details | Generalise further — strip domain terms, describe the *category* of interaction |
| **Too generic** | Could apply to any software without narrowing (e.g., "write better ACs") | Add specificity — name the *category* of feature or interaction pattern |
| **Right level** | Describes the category of feature or interaction pattern without naming the specific technology | Keep as-is |

## Output

The surviving classified, filtered learnings form the table rows that Step 7 writes into `steering/retrospective.md` — one section per pattern type, one row per learning, with comma-separated evidence paths pointing back to the defect spec directories.
