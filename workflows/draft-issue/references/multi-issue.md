# Multi-Issue Split

v3 supports proposing multiple executable issues (feature/bug) from one description. No Epic type, no spike type, no coordination aggregates, no child fan-out, no native sub-issue links, no coordinationParentNumber.

Relations use only GitHub's official blocked-by relation. Each plan entry has a stable `planId` and a `blockedBy` array containing `{ "planId": "..." }` for another planned issue or `{ "issue": N }` for an explicitly named existing repository issue.

Use ask with 2-4 options, recommended first:

question: "Create separate issues for this split?"

options:

- "Yes — create the listed issues in dependency order (recommended)"
- "Adjust the split"
- "Keep a single issue"

On adjust: take Other text, re-segment simply (one re-ask max), re-render, ask again or accept.

On single: collapse.

Only this one ask for the split decision. The split ask and final plan approval authorize the exact proposed graph. Do not add a dependency-specific confirmation.

## Official Edge Derivation

- Derive plan-local edges from the approved split topology.
- Add an existing issue only when the source need explicitly names it with blocked-by, depends-on, requires, after, or precursor sequencing.
- Do not infer edges from thematic similarity.
- Before the first edge POST, resolve created plan ids to issue numbers and numeric REST database ids, merge proposed edges with the live official graph, and reject dangling targets or open cycles.
- Apply idempotently through `scripts/issue-dependencies.mjs`; on failure, roll back only edges added by that invocation.

Feature/bug templates are used as payload for body synthesis regardless of single/multi.

## State for Plan Emission

- DAG or ordered list of ask entries.
- Per entry: `planId`, description, classification, milestone, investigation, interview, body, title, and `blockedBy`.
- A resolved execution map records each plan id's created issue number and numeric REST database id.

The final plan serializes the ordered array of fully populated issue specs and the exact official edge set.
