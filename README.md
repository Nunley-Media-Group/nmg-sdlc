# nmg-sdlc

Spec-driven delivery for Oh My Pi and Herdr: GitHub issue → approved BDD spec → implementation → verification → exact-head merge → issue closure.

The plugin is stack-agnostic. Your project's registered steering supplies its product constraints, engineering conventions, version files, and verification commands. The plugin does not replace CI or human review.

## Prerequisites

Run from the root of the GitHub repository you intend to change.

| Requirement | Purpose / check |
|---|---|
| Node.js 20 or newer | Runs the packaged controllers and validation scripts; `node --version` |
| Oh My Pi (`omp`) | Interactive TUI, native `/plan`, model/tool access, and plugin loading |
| Herdr with OMP integration | Owns automated worker panes; `herdr integration status` |
| Git and an `origin` remote | Linked issue branches, commits, non-force pushes, default-branch synchronization |
| Authenticated GitHub CLI (`gh`) | `gh auth status`; account needs the repository permissions required to create issues/PRs, push branches, read checks, and merge |
| Configured project toolchain | Install the dependencies and tools used by the project's steering validations |

Interactive commands need an OMP **TUI** session. They do not run in print/RPC mode. Automated `/sdlc-execute` additionally requires a Herdr-managed OMP pane with `HERDR_ENV=1`, `HERDR_SOCKET_PATH`, and `HERDR_PANE_ID`; Herdr supplies these. Do not invent these values to run outside Herdr.

Private-repository access must work for both Git transport and `gh`. A token with read-only access is not sufficient for delivery. Repository rules, required checks, and human-review permissions remain authoritative.

## Install and update

Install this repository through OMP's plugin manager. For SSH-authenticated GitHub access:

```bash
omp plugin install git@github.com:Nunley-Media-Group/nmg-sdlc
herdr integration install omp
omp plugin list --json
```

A local checkout is also a supported plugin target:

```bash
omp plugin install /absolute/path/to/nmg-sdlc
```

For an existing installation:

```bash
omp plugin upgrade nmg-sdlc
omp plugin doctor
```

If the installation is pinned to a commit, deliberately install the desired newer ref rather than assuming a pinned source moves. Open a **fresh OMP session** after changing the installed package so command registration and loaded prompts use the new version. Do not stop an active Herdr server to update this plugin.

Before verifying a development candidate against a consumer project, install that exact candidate and use fresh OMP workers. Running a controller from a source checkout alone is not enough: workers can still load the older installed extension and its controller paths. Check the installed path with `omp plugin list --json` and exercise the installed validator on the retained evidence before retrying a failed smoke run. When switching an existing package installation to a local link, remove the existing installation through OMP's plugin manager first; do not repeat a failed link unchanged.

Then, in every existing consumer project, run `/sdlc-upgrade-project` and approve the relevant migrations before further SDLC work. For a project not yet using nmg-sdlc, use `/sdlc-onboard-project` first.

## Quick start

In a Herdr OMP TUI, from your project root:

```text
/sdlc-onboard-project
/sdlc-draft-issue "add user authentication"
/sdlc-write-spec #42
/sdlc-execute #42
/sdlc-status
```

Replace `42` with the actual GitHub issue number. Review and approve the interactive plans; do not skip directly from a drafted issue to execute. After spec approval, execute owns the automated lifecycle. Opening a PR is intermediate, not completion.

## Set up or upgrade a project

### First-time onboarding

```text
/sdlc-onboard-project
```

- **Greenfield:** interviews for product/technology constraints, initializes steering and version artifacts, and seeds starter work.
- **Brownfield:** reconciles existing code, closed issues, and merged-PR evidence with current capability contracts.
- **Already initialized:** routes contract reconciliation through project upgrade.

Interactive commands enter native `/plan`, use built-in questions for decisions that repository evidence cannot answer, and propose a plan before mutation. Approve only the scope you intend to authorize.

### Existing projects

```text
/sdlc-upgrade-project
```

Upgrade audits and proposes migration groups. Each group requires approval. It handles obsolete steering runtimes, legacy spec layouts, official issue dependencies supported by migration evidence, managed repository assets, and obsolete plugin-owned artifacts. It preserves unrelated project content and ambiguous ownership rather than guessing.

For package-bounded publication repair, use `node <plugin-root>/scripts/sdlc-upgrade.mjs detect-publication --root PROJECT_ROOT --spec specs/N-slug`, then only the approved `apply-publication` with the same single spec. Zero, repeated, or multiple specs fail. Command resolution first uses the pre-#388 legacy command set and option-value consumption: if legacy `detect` or `apply` resolves, publication-command positional tokens remain ignored; strict publication parsing applies only when no legacy command resolves and the result is a publication command. The digest binds exact root/package, complete deterministic inventory, issue digits, bytes/identities, stable directory listings, and the rewrite/finding plan built from the descriptor-carried tasks Buffer. …

Onboarding/upgrade manage:

- `steering/manifest.json`, runtime descriptors, and registered project context.
- `CONTRIBUTING.md` and its README link.
- The bounded spec-context section in root `AGENTS.md`.
- `.github/workflows/nmg-sdlc-contribution-gate.yml`.
- `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`.
- The `.omp/sdlc/` ignore rule. Start/execute may untrack previously committed runtime files without deleting their working-tree contents.

Do not replace user-authored assets or delete `.omp/sdlc/` just to bypass a failed preflight.

## Configure steering and verification

```text
/sdlc-steering "update the supported runtime and deployment constraints"
/sdlc-steering "register a required integration-test validation"
```

`steering/manifest.json` is the registration authority:

| Surface | Ownership and purpose |
|---|---|
| `steering/modules/{product,tech,structure,verification}.mjs` | Four plugin-managed descriptors |
| `steering/snippets/*.md` | Project-owned guidance loaded only by registered consumers, slots, and order |
| `steering/extensions/*.mjs` | Explicitly trusted project validation providers |
| `validations[]` | Required/optional deterministic gates and applicability conditions |

Use steering to state supported runtimes, commands, product boundaries, review policy, and declared version mirrors. Register a command's actual program, argument array, working directory, and required environment names. Do not put secrets into steering or shell-compose verification commands. Canonical validations have no wall-clock deadline; cancellation and confirmed process loss are distinct outcomes, not passes.

The steering command stages and validates the candidate runtime before applying an approved plan. A stale source digest requires revisiting the proposed changes, not overwriting the intervening work. Unregistered files are not loaded implicitly. `/sdlc-run-retro` separately maintains `steering/retrospective.md`.

## Draft and approve executable work

### Draft an issue

```text
/sdlc-draft-issue "add user authentication"
```

The workflow investigates relevant code, gathers material preferences, and creates a bug or enhancement issue with Given/When/Then acceptance criteria and functional requirements after approval. Large requests can become several ordinary issues.

Both draft and spec generation apply the same `/sdlc-execute` feasibility boundary. They retain only functional software behavior and implementation-relevant technical detail that execute can realize through permitted repository artifacts and prove with local evidence, an available manifest-registered provider, or an allowlisted exact-head PR check. Mixed requests keep the executable behavior and omit legal, policy, ownership-proof, attestation, sign-off, and live-operation burdens rather than moving them into Notes, Out of Scope, design, tasks, or Gherkin. If no executable behavior remains, generation stops before proposal or mutation.

Within that boundary, execute can publish outcome-authorized source, tests, documentation, configuration, migrations, and testable infrastructure-as-code; consume registered or allowlisted evidence; synchronize declared version metadata; and complete exact-head PR merge plus issue closure. It cannot acquire authority, permissions, or credentials; satisfy human or legal approval; perform live deployment, production, cloud, vendor, or manual data operations; publish packages, releases, or tags; change another repository; or mutate the four Approved spec inputs. Lifecycle actions remain control-plane evidence, not generated Functional Requirements or implementation tasks.

GitHub's **official blocked-by relation** is the sole sequencing authority. Body text such as `Depends on:`, labels, milestones, epics, and sub-issues are not substitutes. Execute does not guess through unreadable dependencies or open blockers.

### Write and publish its specification

```text
/sdlc-write-spec #42
/sdlc-write-spec
```

The numbered form selects that issue. The bare form offers open issues missing the exact `spec-created` label. Every selected issue gets a distinct complete local plan and native-plan approval before any issue-specific mutation. Publication uses a spec-only PR, squash-merges it into the default branch, applies `spec-created` without closing the implementation issue, completes any post-merge remediation, then returns the same TUI session to native plan for Continue/Finished. A continuation issue repeats that approval boundary instead of inheriting the first issue's approval.

The spec-only publication helper waits for configured required status contexts and all reported PR checks on the exact head, including checks not yet registered after PR creation. It waits through stale `UNSTABLE` mergeability without treating it alone as a policy block, then requires two fresh passing `CLEAN` observations before squash-merging that head. Terminal failed checks and draft PRs stop publication; `BLOCKED` is a terminal policy block only once checks are complete, not while they are absent or pending. Missing or pending checks and `UNKNOWN` never permit a merge.

If GitHub merges the exact spec PR but its CLI exits nonzero while checking out the default branch, the helper independently verifies the same PR's merged state, head, and branch/base identity. A proven merge reports its PR and `merged: true`; labeling continues where safe, while a default branch owned by another worktree is reported as a checkout limitation without disturbing either worktree. Re-running publication from the spec branch recognizes the merged PR rather than creating or merging another. Unreadable or contradictory remote evidence never counts as publication.

```text
specs/42-add-user-auth/
├── requirements.md
├── design.md
├── tasks.md
└── feature.gherkin
```

Every file declares singular `**Issue**: #42` and `**Status**: Draft` or `**Status**: Approved`, plus date and author. The directory's leading number must match. Defects also identify their related capability spec. Commit specs with their feature branches.

`specs/` is the current working-tree BDD archive. Load the active package first and only relevant neighbors. Superseded contracts remain in Git history. Legacy `feature-*`, `bug-*`, `epic-*`, and `.codex/specs/` layouts are upgrade inputs, not new-write formats. There is no epic type, cumulative issue-ownership manifest, or synthetic issue number for unowned rewrite behavior.

`**File(s)**:` is optional outcome-planning metadata. When present, use canonical repository-relative paths as backtick-quoted entries (for example, `` `src/auth.ts` ``), separate multiple entries with commas or semicolons, and use only bounded repository-relative directory or glob entries. A glob must start with a non-magic prefix such as `` `tests/generated/**/*.mjs` ``; repository-wide patterns such as `` `*` ``, `` `**` ``, and `` `**/*` `` are invalid. An optional parenthetical operation note may follow an entry. Canonical declarations remain useful to contribution evidence and `/sdlc-upgrade-project` hint normalization, but missing, incomplete, near-miss, duplicate, or malformed File(s) never blocks implement/fix executability.

Execute implement uses outcome mutation policy. Workers may publish any repository-relative path required by Acceptance unless `validPublicationPath` rejects it, it is one of the current spec's four Approved inputs, or it is under `specs/`. The sole `specs/` exception is the current issue's `verification-report.md`. `.omp/`, URL-like, absolute, backslash, parent-traversal, and other invalid publication paths remain denied. Verify stays closed to the current verification report; deliver keeps its explicit version and PR-evidence artifact lists.

### Read-only implementation scope probe

An execute-owned implementation worker inspects its owner and mutation authority before editing:

```text
node <plugin-root>/scripts/sdlc-safe-recoveries.mjs probe --issue 42 --step implement --spec specs/42-add-user-auth --controller-run-id RUN_ID
```

`probe` accepts exactly those four options. It derives the attached Git branch, validates the exact singular Approved spec and current issue branch. It does not acquire the controller lock, create or consume recovery state, or write run, handoff, spec, product, or `.pi-glla` files. Missing or ambiguous issue, step, run, owner, or branch identity fails closed. A stale run branch is reported in `binding.discrepancies`.

Successful output uses `NMG_SDLC_PUBLICATION` with this shape:

```json
{
  "passed": true,
  "ownerId": "RUN_ID",
  "binding": {
    "actualBranch": "42-add-user-auth",
    "run": {},
    "recoveryOwner": {},
    "discrepancies": []
  },
  "scope": {
    "mutationPolicy": "outcome",
    "trackedWritablePaths": ["src/auth.ts"],
    "untrackedEvidencePaths": ["artifacts/42/result.json"],
    "taskOperations": [],
    "readOnlyPaths": [
      "specs/42-add-user-auth/design.md",
      "specs/42-add-user-auth/feature.gherkin",
      "specs/42-add-user-auth/requirements.md",
      "specs/42-add-user-auth/tasks.md"
    ],
    "allowedPaths": ["artifacts/42/result.json", "src/auth.ts"]
  }
}
```

`taskOperations`, `trackedWritablePaths`, `untrackedEvidencePaths`, and `allowedPaths` describe optional canonical task hints when parsing succeeds; malformed or absent hints yield empty arrays without failing outcome scope. Consumers must not treat `scope.allowedPaths` as a mutation ceiling. `readOnlyPaths` always contains the current spec's `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`. The probe's `mutationPolicy: "outcome"` plus the central denied-path classifier authorizes required product, test, and current verification-report paths. The later `bind` and `reconcile` actions remain state-changing and prove the actual observed publication path set.

## Execute the approved work

```text
/sdlc-execute #42
/sdlc-execute #42 #43
/sdlc-execute 42,43
/sdlc-execute
```

Explicit lists are deduplicated in the supplied order. Every selected issue must have an approved spec, the `spec-created` label, and eligible official dependencies. Bare invocation on a branch recognized by parseIssueBranch selects that issue immediately without picker or extra flags. On non-issue branch, explicit numbers use start-issue worker; bare offers picker.

Start from a clean tree. Resume may preserve partial work already on the target issue branch; the controller never stashes, discards, resets, or force-pushes your changes. Use one execute controller per canonical project root and do not run unrelated branch-changing work concurrently.

An explicit different issue on dirty/other active feature branch reports conflict without discarding work. A live exact-head MERGED PR with issue CLOSED is complete.

### Branch-first resume and four-stage execution

Branch content and live verification/PR results are authoritative. Bare `/sdlc-execute` on recognized issue branch selects immediately and resumes from current state: verify existing impl if present (skip implement on clean passing); dirty/partial permitted branches implement/publish first.

On non-issue, explicit #N use start-issue then proceed; bare offers picker.

Four stages: start (when necessary), implement, verify, deliver. Implement maps every Approved Acceptance bullet to satisfied/remaining before editing (preserve partials; do not reset completed). Handoff from implement is verify.

Successful implement always hands off next=verify.

### Stage sequence

| Stage | What must finish before advancement |
|---|---|
| `start` | Resolve the executable issue (when necessary), establish its linked branch, safely reconcile an approved squash-merged spec branch with default, synchronize the exact head upstream, and bind that head in the controller before implement |
| `implement` | Map every Approved Acceptance bullet before editing (do not reset completed work); complete approved tasks, simplify without changing behavior, machine-check conventional commit subject with #N, commit/push; clean tree/upstream. Handoff next=verify |
| `verify` | Run registered gate at exact source HEAD (incl. required smoke); review every approved AC/scenario inline; truthful report. Full green (Pass) or PR Evidence Pending advances to deliver. Fail/Partial/Incomplete route back to implement for repair then re-verify |
| `deliver` | Synchronize release artifacts, create/resume the exact PR, handle eligible automated feedback, prove required checks at exact head, merge, prove issue closure |

Workers are sibling Herdr `--kind omp` panes. Execute owns orchestration, not product edits in the main pane. Worker success is determined by validated handoffs, not terminal prose or an exit code alone. Only host-captured final assistant output supplies findings.

### Branch-first resume, repair and full-green verification

Branch content and live verification/PR results are authoritative (no run.json or ledger checkpoint). Bare `/sdlc-execute` on recognized N-* branch selects the issue immediately and resumes from current state: verify existing impl if present (skip implement on clean passing); dirty/partial permitted branches implement first.

On non-issue branch, explicit #N queue uses start-issue then proceed; bare offers picker via list-specified.

Workers resolve in-scope implementation details using approved requirements, repository evidence, and conservative engineering judgment. They map every AC bullet before edits (skip satisfied, preserve partials, do not reset completed). Repair and reverify ordinary failures.

Continue repair while actual progress toward spec (ACs become satisfied, defect or failing check changes after substantive repair, external prerequisite advances). Changed impl HEAD after repair invalidates old report and triggers full registered gate at new head.

No fixed attempt count, no --recover-stale, no discover-recovery, no blocked-recovery ask/allowance for ordinary flow. User-visible blocking reserved for missing approved spec, ambiguous issue/branch, foreign live controller, unavailable credentials/provider, required human review/approval, unauthorized path, or explicit cancellation. Report the exact failed prerequisite and preserved work; once available, ordinary `/sdlc-execute` resumes from branch evidence.

Full-green (registered results including required smoke all Pass, complete coverage, no ceiling) at exact head is the only route to PR ready/merge. PR Evidence Pending is separate draft evidence step before final verify run and deliver.

For version prep pre-gate: if needed before final verification, run prepare-version, then verify the resulting source HEAD with the full registered gate. Never make a new version commit after a passing gate.

```text
/sdlc-status --json
/sdlc-execute #42
/sdlc-execute --retain-worker #42
```

On the exact incomplete issue branch, run bare `/sdlc-execute` to resume ordinary from the branch and live evidence. No issue tokens or recovery flag required. Completed stages skipped when evidence passes; partial work preserved.

Cancel the owning execute job through the host's cancellation surface or send it SIGINT/SIGTERM. The supervisor terminates only this invocation's controller process group and closes worker panes reported as owned through authenticated IPC. It leaves foreign panes, the Herdr server, partial work, and historical runtime files untouched; the next invocation derives its stage from branch and live verification/PR evidence.

`--retain-worker` keeps this invocation's worker pane on stop or cancellation for inspection; it does not keep the controller running or turn failure into success.

## Verification and terminal delivery

```text
/sdlc-verify-code #42
/sdlc-open-pr #42
```

Normally execute runs these stages. Use standalone verification only on an already-implemented issue branch; use standalone delivery only when that branch has valid verification evidence. Neither command replaces the approved issue/spec or publication gates.

Verification records identity-bound deterministic results in `.omp/sdlc/verification/42.json` and a committed `verification-report.md` in the issue spec. Missing, duplicate, unknown, failed, incomplete, stale, or improperly skipped required results cannot pass. A project that deliberately declares zero validations has complete zero-result coverage, not an invented test pass. `PR Evidence Pending` is permitted only when local obligations pass and explicitly declared PR-only evidence remains.

Delivery rechecks immutable evidence at the exact head. It uses non-force pushes and retains both required and unfiltered checks. Missing, registering, queued, or pending required/declared checks—including `BLOCKED` attributable to that incomplete CI evidence—remain in an unbounded 30-second observation loop. Explicit check failure and proven human-review, mergeability, or non-CI policy blockers take their existing remediation or failure routes. Merge occurs only after a fresh exact-head snapshot has terminal-successful checks and `CLEAN` merge readiness. Unexpected PR/head identity is a reconciliation failure, not permission to open another PR or merge a different commit.

**Done means:** the persisted PR is `MERGED` at the persisted expected head, the GitHub issue is `CLOSED`, the delivery handoff is passed, and local default-branch synchronization/cleanup completes. An open PR, green local tests, or a printed success sentence proves less than that.

### Live smoke when developing nmg-sdlc

This repository registers the required `repository.nmg-sdlc-smoke` provider against `Nunley-Media-Group/nmg-sdlc-smoke`. It is **not** a mandatory dependency of every consumer project; consumer gates come from their own manifests.

1. Identify the nmg-sdlc behavior being proved and the observable success/failure conditions.
2. Provision fresh smoke issues with approved specs through the smoke repository's normal issue/spec workflows. Do not reuse delivered issues or take over unrelated smoke work.
3. Set `NMG_SDLC_SMOKE_ISSUES` to those explicit numbers in the environment of the **nmg-sdlc controller/verification process** before launch. For example, `export NMG_SDLC_SMOKE_ISSUES="65,66"` after replacing those example numbers with the actual fresh fixture issues. Existing retained workers do not gain environment changes retroactively.
4. Run normal nmg-sdlc verification. The provider clones the allowlisted smoke repository, records linked-PR baselines, and invokes this candidate's execute controller for the configured queue. Only the enclosing provider sets its nested-execution ownership marker; do not set `NMG_SDLC_SMOKE_OWNED` to bypass verification.
5. Accept success only with this invocation's pre-merge delivery proof, an exact matching PR that was not already merged at baseline, and closed issue evidence for each configured issue. An open PR left by an earlier receipt-less attempt may be resumed; status output is not smoke proof.

The provider keys a retained clone to the current outer verification identity and explicit queue. It reuses that invocation's pre-merge receipt and remote proof after a lost or failed controller result; it never treats nested `run.json`, a recovery ledger, status output, or an old merged PR as delivery proof. A failed attempt with no pre-merge receipt is superseded only when the plugin candidate tree or registered steering identity changes, so an unchanged failure is not replayed.

Smoke is a **plugin experiment**, not a second repair backlog. Change smoke code only when it is a necessary fixture or means to prove a named nmg-sdlc change. Classify a failure before editing: repair confirmed plugin defects in nmg-sdlc; record unrelated smoke-project defects without fixing them. Stop unchanged/no-progress failures. A new attempt requires a concrete changed plugin fix or hypothesis and its expected observation—not the hope that rerunning will pass. Do not repeatedly create fresh issues, weaken assertions, recycle consumed evidence, or repair unrelated smoke code to manufacture a green gate.

## Status and troubleshooting

```text
/sdlc-status
/sdlc-status --json
```

Status is read-only: current branch/spec, verification, GitHub issue/PR state, and recommended next action. Inspect the exact evidence before repairing:

| Artifact | Purpose |
|---|---|
| `.omp/sdlc/controller.lock` | Exclusive controller identity |
| `.omp/sdlc/handoffs/<N>-<step>.json` | Validated stage outcome and referenced evidence |
| `.omp/sdlc/verification/<N>.json` | Deterministic gate results, coverage, and identity |
| `.omp/sdlc/prompt-provenance/` | Recorded prompt composition |
| `specs/<N>-<slug>/verification-report.md` | Durable acceptance and verification report |

- **Commands missing or controller paths unresolved:** inspect `omp plugin list --json` and `omp plugin doctor`; use a fresh session with the intended installed version, then apply project upgrades.
- **No eligible issue / unapproved spec:** finish issue/spec publication and inspect official blockers; do not manually apply labels as a substitute for approval.
- **Dirty tree / branch mismatch:** preserve the work and restore the correct issue context. Do not reset or stash unrelated changes automatically.
- **Controller lease held:** check whether its owner is still active.
- **Missing handoff or stopped remediation:** inspect the worker/evidence and finish the actual failed contract. Repeating an unchanged invocation is not a repair.
- **Failed verification or smoke:** inspect the named gate and exact evidence; correct authorized plugin/project configuration or the in-scope defect, then rerun the affected proof. Respect the smoke-only boundary above.
- **Contribution gate failure:** supply the missing correlated issue/spec, exact changed-path, steering, verification-command/outcome, or guide evidence. Do not bypass the gate.
- **Human review, credentials, or external evidence unavailable:** record the exact missing prerequisite; automation cannot grant that authority.

## All public commands

| Command | Use |
|---|---|
| `/sdlc-onboard-project` | Initialize a new consumer or reconcile a brownfield project |
| `/sdlc-upgrade-project` | Audit and propose approved migrations in an existing consumer |
| `/sdlc-steering [prompt]` | Plan and apply registered context and verification policy |
| `/sdlc-draft-issue [need]` | Investigate and create a groomed issue |
| `/sdlc-write-spec [#N]` | Select an issue or publish its approved four-file specification |
| `/sdlc-execute [--retain-worker] [#N …]` | Run/resume the complete automated delivery queue (branch-first ordinary resume) |
| `/sdlc-status [--json]` | Inspect lifecycle state without mutation |
| `/sdlc-verify-code #N` | Verify an already-implemented issue branch |
| `/sdlc-open-pr #N` | Deliver an already-verified issue branch through merge and closure |
| `/sdlc-run-retro` | Interactive retrospective from defect specs into project learnings |

`start-issue`, `write-code`, `simplify`, and `address-pr-comments` are internal workflow stages/guidance, not additional public slash commands. Public commands are registered by `src/extension.ts`; workflow bundles are loaded from the package's `workflows/` directory.

## Versioning and contribution gates

`VERSION` is the source of truth. Delivery synchronizes the version mirrors declared by the project's registered technical steering, not an assumed language-specific manifest. JSON/TOML mirrors use declared field paths; text mirrors require an unambiguous locator. In this repository the mirror is `package.json`.

| Issue label | Default bump |
|---|---|
| `bug` | Patch |
| `enhancement` | Minor |
| Unmatched | Minor |

A major bump requires `**Version bump**: major` in approved requirements/design. An issue declaring `BREAKING` without that authorization fails closed. `[Unreleased]` changelog entries roll into the release heading during delivery.

The managed contribution gate correlates the current issue, singular spec identity, affected paths, steering alignment, verification evidence, and guide discoverability. Its documented reduced-evidence exceptions have path-validated predicates; they do not waive project CI or human review. Superseded rewrite-only behavior may use the explicit repository-rewrite contract, never a fabricated issue owner.

This repository's CI runs the script suite, plugin-surface validation, current-spec validation, and applicable workflow inventory checks. Local tests prove the source checkout; a fresh installed session proves installed discovery; actual consumer delivery proves smoke behavior. Keep those evidence layers separate.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for issue/spec ownership, steering, implementation, verification, and exact-head contribution delivery.

## License

MIT. See [LICENSE](LICENSE).
