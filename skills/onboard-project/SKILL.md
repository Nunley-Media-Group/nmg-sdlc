---
name: onboard-project
description: "Initialize a project for the SDLC — bootstrap greenfield projects with intent + tech-selection interview, VERSION + stack-manifest initialization, v1 milestone seeding, and 3–7 starter issues seeded via /draft-issue with dependency-aware autolinking; or reconcile specs for brownfield projects from closed GitHub issues, merged PR diffs, and the current source tree (including deterministic source-tree backfill when no closed issues exist). Optionally ingests a Claude Design URL as interview + seed context. Use when user says 'onboard project', 'bootstrap project', 'initialize project', 'adopt nmg-sdlc', 'set up nmg-sdlc', 'I need specs for an existing codebase', or 'reconcile specs from history'. Do NOT use for writing specs for new features (that is /write-spec), for updating existing specs to current templates (that is /upgrade-project), or for creating issues/PRs. Delegates to /init-config, /upgrade-project, and /draft-issue (in a loop) where appropriate. Pipeline position: runs once per project lifetime, before /draft-issue."
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Write, Edit, WebFetch, Bash(gh:*), Bash(git:*), Bash(ls:*), Bash(wc:*), Bash(node:*), AskUserQuestion
argument-hint: "[--dry-run] [--design-url <url>]"
model: opus
effort: high
---

# Onboard Project

Single entry point for adopting nmg-sdlc on a project that isn't already spec-driven. Detects whether the project is **greenfield** (no code, no specs), **greenfield-enhancement** (steering exists, specs do not — re-run on a previously bootstrapped project), **brownfield** (existing code and closed issues but no specs), or **already-initialized**, then routes work to the matching branch.

This skill **delegates rather than duplicates**:

- Runner config generation → `/init-config`
- Template drift on already-initialized projects → `/upgrade-project`
- Starter-issue authoring → `/draft-issue` (one invocation per seeded candidate)
- Spec template structure → read from `../write-spec/templates/`

Steering bootstrap and steering enhancement run **inside** this skill. Steering templates live at `templates/`. The skill owns mode detection, the Step 5 summary, and the per-mode routing; the variant-specific work lives in the references below so a typical run only loads the branch it actually takes.

## When to Use

- First-time adoption of nmg-sdlc in a brand-new project.
- First-time adoption in an existing codebase that already has shipped features and closed issues.
- When you need specs reverse-engineered from the historical record so the SDLC pipeline has something to consume.

## When NOT to Use

- To write a spec for a new feature (use `/write-spec`).
- To update existing specs to current templates (use `/upgrade-project`).
- To create GitHub issues or PRs (use `/draft-issue` or `/open-pr`).

## Prerequisites

- `gh` CLI authenticated (`gh auth status` passes) — required for brownfield reconciliation.
- Git-initialized repository.
- `nmg-sdlc` plugin installed at current version.

Read `../../references/steering-schema.md` when bootstrapping or enhancing the steering layer — the doc roster every branch reads or writes lives there.

Read `../../references/unattended-mode.md` when applying defaults without prompts — the sentinel semantics referenced throughout this skill live there.

## Mode Detection Matrix

| `steering/` exists | `specs/` has specs | Source files beyond scaffold | Closed issues exist | Mode |
|--------------------|--------------------|------------------------------|---------------------|------|
| Any | **Yes** | Any | Any | **Already initialized** |
| No | No | No | No | **Greenfield** (bootstrap mode) |
| Yes | No | No | No | **Greenfield-Enhancement** (steering pre-seeded) |
| Any | No | **Yes** | Yes | **Brownfield** |
| Any | No | Yes | **No** | **Brownfield-no-issues** (deterministic — backfill specs from source tree) |

**Scaffold allowlist** (files that do NOT count as source): `README.md`, `.gitignore`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `LICENSE`, `LICENSE.md`, `LICENSE.txt`.

**Exclude from file count**: `node_modules/`, `.git/`, and any hidden directory (names starting with `.`).

## Unattended Mode Summary

When `.claude/unattended-mode` exists, the unattended-mode contract from `../../references/unattended-mode.md` applies. Skill-specific defaults applied in unattended mode:

- All `AskUserQuestion` prompts skipped — defaults from the priority chain in `references/interview.md` apply.
- Consolidation groups (brownfield) auto-accepted as proposed.
- Inferred dependency DAG auto-accepted; the proposed graph is logged for the summary.
- Starter-issue candidate cut to ≤ 7 applied automatically when interview output exceeds the cap.
- `/init-config` invocation after greenfield bootstrap auto-yes.
- Already-initialized mode auto-delegates to `/upgrade-project`.
- Every auto-decision is logged in the final summary so the run can be audited.

---

## Workflow

### Step 0: Legacy-Layout Precondition

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before mode detection if the legacy `.claude/{steering,specs}/` layout is still in place. The gate fires in both interactive and unattended mode.

### Step 1: Detect Mode

Gather four signals:

1. **`steering/` presence** — `Glob` for `steering/product.md`, `steering/tech.md`, `steering/structure.md`.
2. **`specs/` presence** — `Glob` for `specs/*/requirements.md`.
3. **Source-file count beyond scaffold** — list tracked files via `git ls-files`, exclude the scaffold allowlist and hidden/excluded directories, count the remainder.
4. **Closed-issue presence** — `gh issue list --state closed --limit 1 --json number` (one-item probe, just to detect whether any exist).

Classify per the Mode Detection Matrix. Print a one-line summary of the detected mode and the evidence used, e.g.:

```
Brownfield detected: 12 closed issues, 47 source files, no specs/.
```

Store the evidence for the Step 5 summary. Proceed to the branch matching the detected mode.

### Step 2G: Greenfield (or Greenfield-Enhancement)

Read `references/greenfield.md` when Step 1 detects greenfield or greenfield-enhancement — the eight sub-steps (design URL ingest, interview, steering bootstrap/enhance, VERSION + manifest init, v1 milestone seeding, candidate generation, DAG inference, seeding loop) and the optional `/init-config` delegation in § Step 3G live there. Both modes run the same sub-steps; behaviour diverges per the **Bootstrap vs Enhancement** notes embedded in each.

After Step 2G's seeding loop completes, the same reference covers Step 3G's prompt-vs-auto contract for delegating to `/init-config`. Then jump to Step 5 (Summary). Greenfield does not reconcile specs.

### Step 2I: Already-Initialized — Route to /upgrade-project

1. List the existing spec directories under `specs/` so the user can audit what is already present.
2. In interactive mode, `AskUserQuestion`: `[1] Delegate to /upgrade-project now`, `[2] Exit without changes`.
3. In unattended mode, auto-accept option 1. Log the auto-decision.
4. On accept, invoke `/upgrade-project` (delegated) and exit after it returns — jump to Step 5 summary.
5. On decline, exit cleanly — jump to Step 5 summary with no specs modified.
6. This branch MUST NOT read, modify, or overwrite any existing spec file.

### Step 2B: Brownfield — Preflight

Read `references/brownfield.md` when Step 1 detects brownfield — the preflight (Step 2B) handles `gh auth`, steering bootstrap if missing, the brownfield-no-issues empty state, and template loading; the same reference covers the reconciliation loop (Step 3B: fetch closed issues, per-issue evidence gathering, template variant selection, consolidation grouping, per-spec synthesis) and the post-reconciliation verification (Step 4: four-file existence + design-md path-extraction). On reference completion, jump to Step 5.

### Steps 3B and 4: Reconciliation Loop and Verification

Both live in `references/brownfield.md` as covered above (Step 3B is the per-issue loop; Step 4 verifies what was produced). Greenfield skips Step 4.

### Step 5: Summary Report

Emit a structured summary with these sections:

1. **Mode detected** — greenfield (bootstrap), greenfield-enhancement, brownfield, brownfield-no-issues (source-backfill), or already-initialized.
2. **Delegated skills invoked** — each of `/init-config`, `/upgrade-project`, and every `/draft-issue` invocation that ran, with success/failure status.
3. **Greenfield only — Design URL fetch result** — `success (N bytes, M entries)`, `skipped (no URL provided)`, or `failed (<reason>)`.
4. **Greenfield only — Interview defaults applied** — for each round, the value applied and its source (`from existing steering`, `from design context`, `from template default`, or `user input`).
5. **Versioning** (greenfield, greenfield-enhancement, and brownfield — emitted whenever Step 2G.3a or 2B.0a ran) — two-line outcome block emitted before milestones:
   - VERSION: `created @ 0.1.0` | `preserved @ <X>` | `backfilled from <path> @ <X>`
   - Manifest: `<path> set @ 0.1.0` (greenfield only) | `<path> preserved @ <X>` | `no-manifest`
6. **Greenfield only — Milestones** — single line for `v1`: marked `seeded`, `skipped (already exists)`, or `failed (<reason>)`. If a legacy `v1 (MVP)` milestone was detected during the dual-name idempotency probe, add a second line: `Legacy milestone "v1 (MVP)" detected — consider renaming to "v1"`.
7. **Greenfield only — Dependency DAG** — full ASCII rendering, OR `skipped due to cycle (<participants>)`, OR `skipped at user request`.
8. **Greenfield only — Starter issues seeded** — every issue created with its number, parent/child neighbors, and per-issue gap if any:

   ```
   #200 Set up basic API           (parents: —, blocks: #201, #202)
   #201 Add user profile           (parents: #200, blocks: —)
   #202 Add caching layer          (parents: #200, blocks: —)
   #203 FAILED — /draft-issue exited 1
   ```

9. **Brownfield only — Specs produced** — every spec directory written this run, with contributing issue numbers in parentheses, e.g.:

   ```
   specs/feature-dark-mode/        (#10, #14, #27)
   specs/bug-login-crash-on-timeout/ (#42)
   specs/feature-export-report/    (#61) — partial: ## Known Gaps noted
   ```

10. **Brownfield only — Skipped** — issues skipped as `duplicate`/`wontfix`/`not planned`, and spec dirs skipped because they already existed.
11. **Enhancement-mode skips** (greenfield-enhancement only) — milestones detected as already-seeded, candidates dropped because the title matched an existing `seeded-by-onboard` issue, and any sections in steering files left untouched because the interview answer matched the existing value.
12. **Gaps** — any missing artifact files (from Step 4), any referenced source files that no longer exist in the working tree, partial spec directories from Write failures, milestone-creation failures, design-fetch failures, per-issue seeding failures, VERSION/manifest read failures, and manifest parse failures.
13. **Auto-decisions** (unattended-mode runs only) — every consolidation auto-accept, every default applied without prompting (with source), DAG auto-accept, candidate top-7 cuts.
14. **Review reminder** — one line reminding the user that reconciled specs (brownfield) may contain internal URLs, reproduction data, or other content copied from closed issues and should be reviewed before committing.
15. **Next step** —
    - Greenfield: `Run /start-issue on a seeded starter (e.g., #<first-seeded-issue>), or /draft-issue to add more.`
    - Brownfield: `Review the reconciled specs, then run /draft-issue for new work or /upgrade-project to bring reconciled specs up to the latest templates.`
    - Already-initialized (after `/upgrade-project`): `Run /draft-issue for the next feature.`

If `.claude/unattended-mode` exists, replace the "Next step" with `Done. Awaiting orchestrator.`

---

## Error States

| Condition | Behavior |
|-----------|----------|
| Legacy `.claude/steering/` or `.claude/specs/` layout detected | Abort in Step 0 per `../../references/legacy-layout-gate.md` |
| `gh auth status` fails in brownfield mode | Abort in Step 2B with `gh auth login` pointer |
| Steering bootstrap leaves any of the three files missing | Abort the greenfield flow; gap recorded for summary |
| Claude Design URL fetch/decode fails (greenfield) | Logged with URL + reason; `design_context = {}`; greenfield flow continues; gap recorded |
| Non-HTTPS Claude Design URL | Rejected before fetch; gap recorded; greenfield flow continues |
| `VERSION` read failure (Step 2G.3a / 2B.0a) | Logged; VERSION outcome recorded as `read-failure`; init step skipped for VERSION; manifest probe still runs; gap recorded |
| Manifest version-field parse failure (malformed JSON/TOML) | Logged with the failing probe command output; manifest outcome recorded as `parse-failure`; VERSION-only path fires; gap recorded |
| Polyglot repo — wrong manifest detected | Detection is first-match-wins against the documented order; Step 5 summary names the detected manifest path so the choice is auditable; user can rename or remove the unintended manifest before re-running |
| Milestone creation fails (greenfield) | Per-milestone gap recorded; loop continues; run does not abort |
| Dependency DAG cycle detected (greenfield) | Wiring step skipped entirely; seeding loop proceeds without autolinks; recorded for summary |
| `/draft-issue` invocation fails for one candidate (greenfield) | Per-issue gap recorded; loop continues with remaining candidates |
| Single issue fails reconciliation (brownfield) | Recorded as gap; run continues |
| Spec dir already exists at target slug (brownfield) | Skipped, recorded in summary |
| Spec references removed source file (brownfield) | Spec still written; gap recorded in summary |

---

## Integration with SDLC Workflow

This is the one-time adoption step for projects that aren't yet spec-driven. It runs before `/draft-issue` and produces the artifacts the pipeline depends on (`steering/` docs and, for brownfield, a seed population of specs).

```
                       ┌─────────────────────────────────────────────────┐
                       │ /onboard-project (once per project)             │
                       │   ├── greenfield  → design URL ingest (opt)     │
                       │   │                 → interview (vision/tech)   │
                       │   │                 → steering bootstrap        │
                       │   │                 → VERSION + manifest init   │
                       │   │                   (Step 2G.3a)              │
                       │   │                 → seed v1 milestone         │
                       │   │                 → seed 3–7 starter issues   │
                       │   │                   via /draft-issue loop     │
                       │   │                 → /init-config              │
                       │   ├── greenfield-enhancement (re-run)           │
                       │   │                 → in-place steering Edit    │
                       │   │                 → skip already-seeded       │
                       │   ├── brownfield  → VERSION init (Step 2B.0a)   │
                       │   │                 → steering bootstrap (if)   │
                       │   │                 → reconcile specs (incl.    │
                       │   │                   source-tree backfill when │
                       │   │                   no closed issues exist)   │
                       │   └── initialized → /upgrade-project            │
                       └────────────────────┬────────────────────────────┘
                                            ▼
/draft-issue  →  /start-issue #N  →  /write-spec #N  →  /write-code #N  →  /simplify  →  /verify-code #N  →  /open-pr #N  →  /address-pr-comments #N
```
