# Greenfield — Steering, Milestones, Starter Issues

**Read this when** Step 1 detects `greenfield` (no code, no specs, no closed issues) or `greenfield-enhancement` (steering files exist, specs do not — re-run on a previously bootstrapped project). Both modes run the same seven sub-steps; behaviour diverges per the **Bootstrap vs Enhancement** notes embedded in each. The interview itself is in `references/interview.md`.

The greenfield branch sets up everything an empty project needs to enter the SDLC pipeline: an intent + tech interview, steering docs, a `VERSION` file plus stack-native manifest sync, the `v1` milestone, and 3–7 starter issues seeded via `$nmg-sdlc:draft-issue` with dependency-aware autolinking.

Read `../../references/steering-schema.md` when bootstrapping or enhancing the steering layer — the doc roster and read-timing referenced by 2G.2 live there.

Read `../../references/unattended-mode.md` when applying defaults without prompts — the sentinel and gate semantics referenced throughout the seven sub-steps below live there.

## Step 2G.1 Intent + Tech-Selection Interview

Read `references/interview.md` when conducting the interview — the round-by-round questions, default-sourcing priority chain, and unattended-mode default-application contract live there. Store answers as `interview_context` for 2G.2, 2G.4, and 2G.6.

## Step 2G.2 Steering Bootstrap or Enhancement

Read the three steering templates from `templates/`:

- `product.md`, `tech.md`, `structure.md`

Extract template content from the ` ```markdown ... ``` ` fenced block in each template (templates wrap the bootstrap content this way so they are also valid skill-relative documentation).

**Bootstrap mode** (no `steering/` files exist):

1. Populate the template content with `interview_context`:
   - `product.md` ← vision, personas, success criteria
   - `tech.md` ← language, framework, test tooling, deployment target
   - `structure.md` ← scaffold layout (use `git ls-files` and the discovered layout: top-level directories, source/test directories, monorepo structure if any)
2. Codex editing `steering/product.md`, `steering/tech.md`, `steering/structure.md`.
3. Create the `specs/` directory (empty — for future spec writes).

**Enhancement mode** (all three steering files already exist):

1. For each section that has a corresponding interview answer differing from the existing value:
   - In interactive mode, present the diff to the user (one section at a time) and ask whether to apply.
   - In unattended mode, auto-apply and log the diff for Step 5.
2. Use targeted edits so unrelated sections in the steering files are preserved.
3. Do not delete content the interview did not address.

After this sub-step, verify all three of `steering/product.md`, `steering/tech.md`, `steering/structure.md` exist. If any is missing, record as a gap and abort the greenfield flow.

Emit: `Steering: bootstrapped (3 files written) | enhanced (N sections updated)`.

## Step 2G.2a Version File Initialization

Seed `VERSION` at the project root and, if a stack-native manifest is detected, seed its version field in parallel. Idempotent in every mode — existing values are preserved.

### Detect Stack

Probe for a manifest at the project root via `git ls-files -- <candidate>`, in this order (first match wins):

```
package.json, pyproject.toml, Cargo.toml, go.mod, mix.exs, *.gemspec, build.gradle, pom.xml
```

Record the matched path (or `null` if none) for the Step 5 summary.

### Write VERSION

1. If `VERSION` exists at project root → `Read` it, record the current value, and emit `VERSION exists (value: <X>) — preserved`.
2. Else Codex editing `VERSION` containing the literal string `0.1.0\n` (one line, no leading `v`, trailing newline) and emit `VERSION created at 0.1.0`.

### Write Stack Manifest Version Field

If no stack manifest was detected, emit `No stack manifest detected — VERSION file seeded without manifest sync` and skip the rest of this section. Otherwise:

1. Read the matched manifest's version field per the format-specific rule in the table below.
2. If the field is already set to a non-empty value → preserve and emit `Manifest version exists (<path>: <X>) — preserved`.
3. If the field is empty or absent → set it to `0.1.0` via the per-format rule (targeted line Codex editing, never a full-file rewrite) and emit `Manifest version set to 0.1.0 in <path>`.

#### Stack manifest read/write rules

Each rule uses a targeted command so formatting, key order, and comments in unrelated sections of the manifest are preserved. Never use a full-file `JSON.stringify` rewrite of `package.json` — lockfile hygiene and downstream tooling depend on byte-stable formatting.

| Manifest | Version field | Read | Write (only when empty/absent) |
|----------|---------------|------|--------------------------------|
| `package.json` | `"version"` JSON key | `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version||'')"` | Codex editing the `"version"` line only — do not reformat the rest of the JSON |
| `pyproject.toml` | `[project] version` or `[tool.poetry] version` | `grep -E '^version\s*=' pyproject.toml` (first match under `[project]` or `[tool.poetry]`) | Codex editing the matched line in place |
| `Cargo.toml` | `[package] version` | `grep -E '^version\s*=' Cargo.toml` (under `[package]`) | Codex editing the matched line in place |
| `go.mod` | no version field | N/A — `go.mod` is detected for stack identification only; no version to write | N/A |
| `mix.exs` | `@version` module attribute | `grep -E '@version\s+' mix.exs` | Codex editing the matched line in place |
| `*.gemspec` | `spec.version` assignment | `grep -E '\.version\s*=' *.gemspec` | Codex editing the matched line in place |
| `build.gradle` / `pom.xml` | `version =` (Gradle) / `<version>` (Maven) | `grep -E '^version\s*=' build.gradle` or `grep -m1 '<version>' pom.xml` | Codex editing the matched line in place |

### Contribute to the Step 5 Versioning Section

Emit a two-line outcome block for Step 5, covering both VERSION and manifest:

```
VERSION: created @ 0.1.0 | preserved @ <X>
Manifest: <path> set @ 0.1.0 | preserved @ <X> | no-manifest
```

This section appears **before** Milestone Seeding in the Step 5 summary — versioning is a scaffold concern that lands before issue-tracker concerns.

## Step 2G.3 Idempotent Milestone Seeding

Seed only the single `v1` milestone. Later version lines are created by the user or by a future skill.

1. List existing milestones: `gh api "repos/{owner}/{repo}/milestones?state=all&per_page=100" --jq '.[].title'`
2. **Dual-name idempotency probe** — if either `v1` OR the legacy `v1 (MVP)` title (from prior runs that pre-date this narrowing) is present, reuse the existing milestone without creating a new one. On legacy match, record `Legacy milestone "v1 (MVP)" detected — consider renaming to "v1"` in the Step 5 summary alongside the skipped entry.
3. If neither name is present, create:
   ```
   gh api --method POST "repos/{owner}/{repo}/milestones" \
     --field title="v1" \
     --field description="First version line — v1.x.y releases, seeded by $nmg-sdlc:onboard-project."
   ```
4. On HTTP error (403, 422 collision, network) → record `v1 = failed (<status>)` as a gap; **do not abort** the run.

Emit: `Milestone: v1 seeded | skipped | failed (<reason>)`.

## Step 2G.4 Starter-Issue Candidate Generation

Synthesize 3–7 starter-issue candidates from `interview_context`. Each candidate carries:

```
{
  title:           "Set up basic API",
  body_seed:       "<one-paragraph seed used by $nmg-sdlc:draft-issue>",
  component_refs:  ["api", "auth"],
  ordering_cue:    "first" | "before X" | null
}
```

All candidates seed into the `v1` milestone at `$nmg-sdlc:draft-issue` invocation time — there is no per-candidate milestone choice.

Generation rules:

- Mine `interview_context.success_criteria` for distinct functional concerns.
- Hard floor: 3 candidates. Hard ceiling: 7. If interview output yields more, present a top-7 cut via `request_user_input` gate (auto-cut in unattended mode, with the cut list logged for Step 5).

**Enhancement-mode filter**: query `gh issue list --label seeded-by-onboard --state all --json title --limit 200`. Drop any candidate whose title exactly matches an existing seeded issue.

Emit: `Candidates: N generated, M dropped as already-seeded, K cut to top-7`.

## Step 2G.5 Dependency DAG Inference + Confirmation Gate

Build edges from the candidate set per these rules:

1. **Shared component refs** — if candidate A's `component_refs` is a strict subset of B's, A → B (A introduces the component; B builds on it).
2. **Ordering cues** — phrases like "first", "before X", "depends on" surfaced in the interview create explicit edges.

**Cycle detection** — DFS with white/gray/black marking. On any back edge:

- Log the cycle (list the participating candidates).
- **Skip the wiring step entirely** — proceed to 2G.6 with no autolinks. Do not partially wire.
- Record `DAG: skipped due to cycle` for Step 5.

Render the DAG as ASCII for the user, e.g.:

```
Set up basic API
   └─▶ Add user profile
Set up auth
   └─▶ Add user profile
```

`request_user_input` gate: `[1] Approve and proceed`, `[2] Adjust (return to candidate generation)`, `[3] Proceed without DAG (seed standalone)`.

In unattended mode: auto-accept option 1 and log the full DAG for Step 5.

Emit: `DAG: N edges inferred, cycle detected? = no | yes (skipped wiring)`.

## Step 2G.6 Starter-Issue Seeding Loop with Autolinking

Iterate candidates in **topological order** from 2G.5 (or arbitrary order if the DAG step was skipped).

Before the first iteration:

1. Ensure the `seeded-by-onboard` label exists:
   ```
   gh label create seeded-by-onboard --color 0E8A16 --description "Issue seeded by $nmg-sdlc:onboard-project" 2>/dev/null || true
   ```
2. **Autolinking availability check**: probe `$nmg-sdlc:draft-issue`'s autolinking primitive. If unavailable, log once — `Autolinking: not available; seeding will proceed without sub-issue wiring` — set `autolinking_available = false`, record the gap for Step 5. Do NOT repeat this failure per candidate.

For each candidate:

1. **Invoke `$nmg-sdlc:draft-issue`** (delegated) with the shared `interview_context` and this candidate's `{title, body_seed, component_refs}` as the seed payload, and the fixed milestone assignment `v1`. The delegated skill is responsible for full AC/FR synthesis — do not bypass it.
2. **Capture the created issue number** from `$nmg-sdlc:draft-issue`'s return.
3. **Apply the seeded-by-onboard label**: `gh issue edit <num> --add-label seeded-by-onboard`.
4. **Wire DAG parents already created** (skip if `autolinking_available = false`): for each parent of this candidate already created in this loop, invoke `addSubIssue(parent_number, child_number)` on `$nmg-sdlc:draft-issue`. Append a `Depends on: #<parent>` line to this issue's body via `gh issue edit <self> --body-file -`.
5. **Queue child back-references** (skip if `autolinking_available = false`): for each DAG child of this candidate not yet created, record a deferred `Blocks: #<self>` insertion to apply when that child is seeded.
6. **State isolation**: discard any per-candidate working state before iterating to the next candidate.

**Per-issue failure handling**: if any of `$nmg-sdlc:draft-issue` invocation, label apply, autolink call, or body edit fails — record the failure as a per-issue gap (with the candidate title, the failed step, and the error message) and **continue the loop**. A single failure must not abort the remaining seeds.

Emit per candidate: `Seeded: <title> = #<num> (parents: #X #Y, blocks: #Z) | failed (<reason>)`.

## Step 3G Greenfield — Optional Init-Config

1. In interactive mode, `request_user_input` gate whether to run `$nmg-sdlc:init-config` now for unattended-runner setup. Options: `[1] Yes — run $nmg-sdlc:init-config now`, `[2] No — skip, I'll run it later`.
2. In unattended mode, auto-yes without prompting. Log the auto-decision.
3. If yes, invoke `$nmg-sdlc:init-config` (delegated) and record its exit status.
4. Jump to Step 5 (Summary). Greenfield does not reconcile specs.
