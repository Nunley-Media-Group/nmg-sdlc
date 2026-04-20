# Greenfield — Steering, Milestones, Starter Issues

**Read this when** Step 1 detects `greenfield` (no code, no specs, no closed issues) or `greenfield-enhancement` (steering files exist, specs do not — re-run on a previously bootstrapped project). Both modes run the same seven sub-steps; behaviour diverges per the **Bootstrap vs Enhancement** notes embedded in each. The interview itself is in `references/interview.md`.

The greenfield branch sets up everything an empty project needs to enter the SDLC pipeline: optional design-context ingestion, an intent + tech interview, steering docs, `v1`/`v2` milestones, and 3–7 starter issues seeded via `/draft-issue` with dependency-aware autolinking.

Read `../../references/steering-schema.md` when bootstrapping or enhancing the steering layer — the doc roster and read-timing referenced by 2G.3 live there.

Read `../../references/unattended-mode.md` when applying defaults without prompts — the sentinel and gate semantics referenced throughout the seven sub-steps below live there.

## Step 2G.1 Optional Claude Design URL Ingestion

1. Resolve the design URL: if `--design-url <url>` was passed, use it. Else (interactive only) `AskUserQuestion`: `"Provide a Claude Design URL? (optional — press Enter to skip)"`. In unattended mode without `--design-url`, skip 2G.1 entirely.
2. **Validate URL is HTTPS.** If not, log `design URL rejected (non-HTTPS)`, record the rejection as a gap, and continue to 2G.2 with empty `design_context`.
3. Fetch via `WebFetch` with a 30s timeout.
4. **Decode**: if the response indicates gzip (content-type `application/gzip`/`application/x-gzip` OR magic bytes `1f 8b` at offset 0), decode via `Bash(node -e "process.stdout.write(require('node:zlib').gunzipSync(Buffer.from(process.argv[1],'base64')).toString())" "<base64>")` — pass the payload as a base64 argument; never interpolate raw payload bytes into a shell command.
5. **Parse**: locate `README.md` or `README` at the archive root. Read and summarize it for the user. List archive entries (filename, size) inside a fenced code block.
6. Store the parsed content as `design_context` (in-memory only — no file writes by this skill).
7. **Failure handling**: network error, HTTP non-2xx, gzip decode error, missing README — log the URL + failure mode + a single-sentence remediation hint (e.g., `Verify the URL is reachable and points to a valid Claude Design archive`), record the gap for Step 5, set `design_context = {}`, and **continue** the run. Fetch failures must NOT abort.
8. All payload content surfaced to the user goes inside fenced code blocks. Archive entry filenames are validated against `[A-Za-z0-9._/-]`; any `..` path component aborts the parse and records a gap.

Emit: `Design URL: fetched (N bytes, M entries) | skipped | failed (<reason>)`.

## Step 2G.2 Intent + Tech-Selection Interview

Read `references/interview.md` when conducting the interview — the round-by-round questions, default-sourcing priority chain, and unattended-mode default-application contract live there. Store answers as `interview_context` for 2G.3, 2G.5, and 2G.7.

## Step 2G.3 Steering Bootstrap or Enhancement

Read the three steering templates from `templates/`:

- `product.md`, `tech.md`, `structure.md`

Extract template content from the ` ```markdown ... ``` ` fenced block in each template (templates wrap the bootstrap content this way so they are also valid skill-relative documentation).

**Bootstrap mode** (no `steering/` files exist):

1. Populate the template content with `interview_context`:
   - `product.md` ← vision, personas, success criteria
   - `tech.md` ← language, framework, test tooling, deployment target
   - `structure.md` ← scaffold layout (use `git ls-files` and the discovered layout: top-level directories, source/test directories, monorepo structure if any)
2. `Write` `steering/product.md`, `steering/tech.md`, `steering/structure.md`.
3. Create the `specs/` directory (empty — for future spec writes).

**Enhancement mode** (all three steering files already exist):

1. For each section that has a corresponding interview answer differing from the existing value:
   - In interactive mode, present the diff to the user (one section at a time) and ask whether to apply.
   - In unattended mode, auto-apply and log the diff for Step 5.
2. Use `Edit` (not `Write`) so unrelated sections in the steering files are preserved.
3. Do not delete content the interview did not address.

After this sub-step, verify all three of `steering/product.md`, `steering/tech.md`, `steering/structure.md` exist. If any is missing, record as a gap and abort the greenfield flow.

Emit: `Steering: bootstrapped (3 files written) | enhanced (N sections updated)`.

## Step 2G.4 Idempotent Milestone Seeding

For each of `v1 (MVP)` and `v2`:

1. List existing milestones: `gh api "repos/{owner}/{repo}/milestones?state=all&per_page=100" --jq '.[].title'`
2. If the exact title is present → record `seeded vs skipped: <name> = skipped (already exists)` and continue.
3. Else create: `gh api --method POST "repos/{owner}/{repo}/milestones" --field title="<name>" --field description="<one-line description>"`
4. On HTTP error (403, 422 collision, network) → record `<name> = failed (<status>)` as a gap; **do not abort** the run.

`v1 (MVP)` description: `Minimum Viable Product — first shippable milestone seeded by /onboard-project.`
`v2` description: `Post-MVP enhancements seeded by /onboard-project.`

Emit per milestone: `Milestone: v1 (MVP) seeded | skipped | failed (<reason>)`.

## Step 2G.5 Starter-Issue Candidate Generation

Synthesize 3–7 starter-issue candidates from `interview_context` and `design_context`. Each candidate carries:

```
{
  title:           "Set up basic API",
  milestone:       "v1 (MVP)" | "v2",
  body_seed:       "<one-paragraph seed used by /draft-issue>",
  component_refs:  ["api", "auth"],
  ordering_cue:    "first" | "before X" | null
}
```

Generation rules:

- Mine `interview_context.success_criteria` and (if present) `design_context` filenames/READMEs for distinct functional concerns.
- Allocate the foundational/setup concerns to `v1 (MVP)`; allocate enhancements to `v2`.
- Hard floor: 3 candidates. Hard ceiling: 7. If interview output yields more, present a top-7 cut via `AskUserQuestion` (auto-cut in unattended mode, with the cut list logged for Step 5).

**Enhancement-mode filter**: query `gh issue list --label seeded-by-onboard --state all --json title --limit 200`. Drop any candidate whose title exactly matches an existing seeded issue.

Emit: `Candidates: N generated, M dropped as already-seeded, K cut to top-7`.

## Step 2G.6 Dependency DAG Inference + Confirmation Gate

Build edges from the candidate set per these rules:

1. **Shared component refs** — if candidate A's `component_refs` is a strict subset of B's, A → B (A introduces the component; B builds on it).
2. **Ordering cues** — phrases like "first", "before X", "depends on" surfaced in the interview create explicit edges.
3. **Milestone gate** — drop any edge with a `v2` candidate as parent of a `v1` candidate.

**Cycle detection** — DFS with white/gray/black marking. On any back edge:

- Log the cycle (list the participating candidates).
- **Skip the wiring step entirely** — proceed to 2G.7 with no autolinks. Do not partially wire.
- Record `DAG: skipped due to cycle` for Step 5.

Render the DAG as ASCII for the user, e.g.:

```
[v1] Set up basic API
   └─▶ [v1] Add user profile
          └─▶ [v2] Add caching layer
[v1] Set up auth
   └─▶ [v1] Add user profile
```

`AskUserQuestion`: `[1] Approve and proceed`, `[2] Adjust (return to candidate generation)`, `[3] Proceed without DAG (seed standalone)`.

In unattended mode: auto-accept option 1 and log the full DAG for Step 5.

Emit: `DAG: N edges inferred, cycle detected? = no | yes (skipped wiring)`.

## Step 2G.7 Starter-Issue Seeding Loop with Autolinking

Iterate candidates in **topological order** from 2G.6 (or arbitrary order if the DAG step was skipped).

Before the first iteration:

1. Ensure the `seeded-by-onboard` label exists:
   ```
   gh label create seeded-by-onboard --color 0E8A16 --description "Issue seeded by /onboard-project" 2>/dev/null || true
   ```
2. **Autolinking availability check**: probe `/draft-issue`'s autolinking primitive. If unavailable, log once — `Autolinking: not available; seeding will proceed without sub-issue wiring` — set `autolinking_available = false`, record the gap for Step 5. Do NOT repeat this failure per candidate.

For each candidate:

1. **Invoke `/draft-issue`** (delegated) with the shared `interview_context`, `design_context`, and this candidate's `{title, milestone, body_seed, component_refs}` as the seed payload. The delegated skill is responsible for full AC/FR synthesis — do not bypass it.
2. **Capture the created issue number** from `/draft-issue`'s return.
3. **Apply the seeded-by-onboard label**: `gh issue edit <num> --add-label seeded-by-onboard`.
4. **Wire DAG parents already created** (skip if `autolinking_available = false`): for each parent of this candidate already created in this loop, invoke `addSubIssue(parent_number, child_number)` on `/draft-issue`. Append a `Depends on: #<parent>` line to this issue's body via `gh issue edit <self> --body-file -`.
5. **Queue child back-references** (skip if `autolinking_available = false`): for each DAG child of this candidate not yet created, record a deferred `Blocks: #<self>` insertion to apply when that child is seeded.
6. **State isolation**: discard any per-candidate working state before iterating to the next candidate.

**Per-issue failure handling**: if any of `/draft-issue` invocation, label apply, autolink call, or body edit fails — record the failure as a per-issue gap (with the candidate title, the failed step, and the error message) and **continue the loop**. A single failure must not abort the remaining seeds.

Emit per candidate: `Seeded: <title> = #<num> (parents: #X #Y, blocks: #Z) | failed (<reason>)`.

## Step 3G Greenfield — Optional Init-Config

1. In interactive mode, `AskUserQuestion` whether to run `/init-config` now for unattended-runner setup. Options: `[1] Yes — run /init-config now`, `[2] No — skip, I'll run it later`.
2. In unattended mode, auto-yes without prompting. Log the auto-decision.
3. If yes, invoke `/init-config` (delegated) and record its exit status.
4. Jump to Step 5 (Summary). Greenfield does not reconcile specs.
