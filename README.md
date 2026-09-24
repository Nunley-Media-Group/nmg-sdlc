# nmg-sdlc

Spec-driven delivery for Oh My Pi and Herdr: GitHub issue → approved BDD spec → implementation → review → verification → exact-head merge → issue closure.

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

For package-bounded publication repair, use `node "<plugin-root>/scripts/sdlc-upgrade.mjs" detect-publication --root PROJECT_ROOT --spec specs/N-slug`, then only the approved `apply-publication` with the same single spec. Zero, repeated, or multiple specs fail. Command resolution first uses the pre-#388 legacy command set and option-value consumption: if legacy `detect` or `apply` resolves, publication-command positional tokens remain ignored; strict publication parsing applies only when no legacy command resolves and the result is a publication command. The digest binds exact root/package, complete deterministic inventory, issue digits, bytes/identities, stable directory listings, and the rewrite/finding plan built from the descriptor-carried tasks Buffer. Apply uses one exclusive fsynced root lock and one fsynced root stage. Its uninterrupted final boundary completes descriptor-bound package authority and exact approval equality, then proves target, stage, and lock through descriptor identity/exact-byte checks before immediate atomic rename. Authorized nmg-sdlc invocations honor the lock, and every change observed before its final boundary fails closed. Node has no portable identity-conditional rename/unlink: non-target inventory mutation after authority completion, and non-cooperative same-credential mutation after a target, stage, or lock proof inside the immediately following pathname syscall gap, are undefined external interference outside the contract. A failed rename without that interference leaves the original untouched; post-rename cleanup failure reports `applied: true` and retains validated lock evidence. Publication-only apply runs no dependency, backfill, GitHub, or other upgrade phase.

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
The spec-only publication helper waits for configured required status contexts and all reported PR checks on the exact head, including checks not yet registered after PR creation. It requires a fresh successful `CLEAN` observation before squash-merging that head; terminal failed checks or proven non-CI blockers stop publication with an actionable reason.
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

Execute implement, fix1, and fix2 use outcome mutation policy. Workers may publish any repository-relative path required by Acceptance unless `validPublicationPath` rejects it, it is one of the current spec's four Approved inputs, or it is under `specs/`. The sole `specs/` exception is the current issue's `verification-report.md`. `.omp/`, URL-like, absolute, backslash, parent-traversal, and other invalid publication paths remain denied. Verify stays closed to the current verification report; deliver keeps its explicit version and PR-evidence artifact lists. Review isolation continues assigning git-diff path slices.

### Read-only implementation scope probe

An execute-owned implementation worker inspects its owner and mutation authority before editing:

```text
node "<plugin-root>/scripts/sdlc-safe-recoveries.mjs" probe --issue 42 --step implement --spec specs/42-add-user-auth --controller-run-id RUN_ID
```

`probe` accepts exactly those four options. It derives the attached Git branch, reads the active execute checkpoint and unique matching incomplete safe-recovery owner, and validates the exact singular Approved spec. It does not acquire the controller lock, create or consume recovery state, or write run, handoff, spec, product, or `.pi-glla` files. Missing or ambiguous issue, step, run, owner, or branch identity fails closed. A stale `run.json.branch` is reported in `binding.discrepancies`; the probe never repairs it or silently substitutes it for the actual/owner branch.

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

Explicit lists are deduplicated in the supplied order. Every selected issue must have an approved spec, the `spec-created` label, and eligible official dependencies. The bare command first discovers the exact current branch's incomplete checkpoint and resumes its persisted queue without a picker or extra flags. Conflicting or unreadable evidence blocks selection. Only clean absence or completed delivery opens the existing multi-select picker: selected chips come first in displayed order, then valid Other tokens. Empty Continue reopens the picker; it does not run an empty queue.

Start from a clean tree. Resume may preserve partial work already on the target issue branch; the controller never stashes, discards, resets, or force-pushes your changes. Use one execute controller per canonical project root and do not run unrelated branch-changing work concurrently.
An explicit different issue can proceed past one retained `merge_failed` deliver checkpoint only when the plugin reads its exact recorded PR/head as merged, its linked issue as closed, and the merge commit as an ancestor of the clean default checkout, with no live worker or competing controller. The original failed checkpoint, handoffs, verification and review evidence are copied under `.omp/sdlc/archive/delivered-failures/<runId>/` before the old checkpoint is released. Bare recovery and unproven or dirty cases remain blocked; never edit a failed handoff into a pass or delete `run.json` manually.

One narrow intervention state is recoverable after an operator repairs publication authority. For an `implementation_failed` implement handoff, bare `/sdlc-execute` requires the failed run, strict handoff, exact current HEAD, actual branch, run-bound unique incomplete owner, and current read-only owner-bound probe to agree. The handoff and each parent are no-follow validated as bounded regular files with stable pre/open/post identity. The only tracked difference from run HEAD must be one unstaged singular Approved `tasks.md`. One separator-preserving detector/projection must prove that every changed byte is a selected `**Files**:` to `**File(s)**:` label replacement, preserve every other byte across CR, LF and CRLF input, and report zero remaining selected rewrites or findings.

Ignored and untracked evidence is not broadly ignored. Every tracked-writable and explicitly untracked evidence path must remain neither dirty nor ignored. Every handoff under `.omp/sdlc/handoffs/` is scanned regardless of Git ignore reporting and must occupy a queue/completed/current/failed or owner-proven historical lifecycle slot with the matching bounded no-follow issue/step payload; unrelated, duplicate-attempt, future and symlinked handoffs block. Arbitrary ignored product, source, spec, controller, allowed, read-only or evidence paths block; only irrelevant dependency/cache/build ignored state is safe. Finder metadata is bounded to `.DS_Store`, `<scope-derived-manifest-workspace>/.DS_Store`, or `<scope-derived-manifest-workspace>/{android,ios}/.DS_Store`; `.omp`, `.pi-glla`, `specs`, and evidence-only roots are never workspace authority, and a manifest outside tracked-writable/read-only scope, missing/non-directory workspace, or nested basename match grants no authority. The current OMP goal ledger is preserved only when its exact bounded regular-file trio is unignored and proves one structurally related terminal session; partial, live, extra, symlinked, ignored, oversized, malformed or arbitrary entries block. Discovery performs no mutation. Bare run repeats the full classifier under its controller lease, archives the original failed handoff byte-identically, consumes one durable `repaired_publication_intervention` record, records the archive path and digest in safe-recovery and checkpoint evidence, and dispatches only the normal `sN-implement` path. It never creates `runState.remediation`, starts `rN-implement`, or dispatches another step. Explicit issue lists, optional flags, prose changes, new commits, and plugin upgrades cannot grant or replenish this allowance.

Before consuming repaired-publication recovery, execute reads geometry from the actual main controller pane named by `HERDR_PANE_ID` and allocates the standard `sN-implement` pane using the normal width-versus-height split direction. A split failure leaves the handoff, archive, safe-recovery record, checkpoint recovery, pending dispatch, task, product, and workflow evidence unchanged. Later cleanup closes only an unused pane proven to have been created by that controller attempt.

After split and revalidation, one checkpoint CAS reserves the original invocation as an exact prepared dispatch while leaving run recoveries unchanged. If the process exits before archive/consume, ordinary repaired-publication recovery re-proves and reuses that exact prepared pane/invocation once. Execute then creates the immutable archive and consumes safe recovery with that invocation. The next CAS creates exactly one matching run recovery and marks dispatch pending before agent start. Process loss between safe consumption and that CAS is validated from the prepared dispatch plus exact safe record/archive; resume creates only the absent run recovery in its next CAS, never a duplicate entry. Parameter-free discovery reports `consumed-dispatch-available` only for the same consumed repaired-publication invocation when either a stopped pre-fix `pane_split_failed` checkpoint or an exact pending/stopped dispatch matches the immutable archive/hash, run, HEAD, actual branch, incomplete owner, repaired handoff/task, clean product/worktree, empty workers, absent recorded dispatch pane and `sN-implement`/`rN-implement` identities, and lock-free state. Unrelated sibling/user panes do not block. The next bare command allocates a fresh standard pane and resumes that invocation without another `consumeSafeRecovery`, duplicate recovery entry, remediation, or allowance. Durable start ownership makes repeat discovery unavailable. Non-pane failures, explicit selectors, mismatches, duplicates, completed owners, matching workers/panes/agents, missing archives, and ambiguous start state remain blocked.

Validated resumed implement success clears only the ephemeral pending-dispatch field before advancing. The consumed safe-recovery record, checkpoint recovery, immutable archive, and invocation identity remain durable through terminal queue persistence.

### Stage sequence

| Stage | What must finish before advancement |
|---|---|
| `start` | Resolve the executable issue, establish its linked branch, update applicable project status |
| `implement` | Establish clean owner/path scope, complete approved tasks, simplify without changing behavior, verify, machine-check a conventional commit subject containing the concrete requested identifier (for example, `#42`; `#N` denotes the issue-number form) on the dirty pre-publication bind, then commit and push; clean tree and upstream equality |
| `review1` | Review the branch against the resolved GitHub default ref and persist the review artifact |
| `fix1` | Address that review; publish changes when needed |
| `review2` | Repeat the review on the resulting implementation |
| `fix2` | Address the second review and publish changes when needed |
| `verify` | Run registered validations and acceptance/architecture review; publish a truthful verification report |
| `deliver` | Synchronize release artifacts, create/resume the exact PR, handle eligible automated feedback, prove required checks, merge the expected head, and prove issue closure |

Workers are sibling Herdr `--kind omp` panes. Execute owns orchestration, not product edits in the main pane. Worker success is determined by validated handoffs, not terminal prose or an exit code alone. Reviews use separate file-assigned snapshots outside the checkout, host-enforced read-only tools, and invocation-bound append-only receipts. Only host-captured final assistant output supplies findings; terminal or tool text cannot substitute for a review result. Missing isolation proof, missing output, and empty output remain non-passing.

Review collection waits for every sibling worker to settle before closing any review pane. A transiently incomplete host receipt gets one observation recheck; persistent missing, malformed, foreign, or empty evidence still fails without substituting terminal prose or replaying the review.

### Autonomous repair and progress limits

Workers resolve in-scope implementation details using approved requirements, repository evidence, and conservative engineering judgment. They repair and reverify ordinary code/test failures rather than asking for decisions a model can make within that authority.

A settled failed, non-intervention handoff can start a fresh `rN-step` remediation worker for `implement`, either review/fix stage, `verify`, or `deliver`. Only one repair runs at a time. After **two completed remediations for the same issue and step without advancement**, execute records `remediation_loop` and stops before a third. Commit churn, changing summaries, and elapsed time are not stage advancement. A passed remediation advances and clears that streak.

On the exact incomplete branch, bare `/sdlc-execute` can consume **one additional durable recovery allowance per run, issue and stopped stage**, including legacy checkpoints with 13 attempts. Consumption is persisted before dispatch and preserves the original history. A failed recovery, ambiguous dispatch, cancellation or process loss cannot authorize another repair. Repeated commands, commits, summary changes and plugin upgrades never replenish it. A genuinely validated passed handoff may still settle and advance through the normal remaining gates; later stages keep their ordinary bounded remediation policy.

The additional allowance belongs only to parameter-free execution. Neither an explicit issue queue nor either existing optional flag grants fresh exhausted repair work; `--recover-stale` alone still concerns ownership only.

Safe automatic recovery has a separate durable allowance for each class, logical owner, issue, and stage. Known committed publication is reconciled before another push; proven review contamination permits one whole-step replacement while preserving original evidence. Safe base reconciliation reruns every review/fix/verification gate on the new head. Bot review remains distinct from human authority, and post-merge observation never replays merge or closes an unrelated issue. New commits, leases, sessions, or plugin versions do not replenish these allowances or the existing remediation budgets.

When a remediable worker pane is positively absent and left no valid terminal handoff, execute first tries to continue automatically. Exact issue branch, checkpoint HEAD, clean state, absent ownership, and missing/invalid handoff proof permit one durable `closed_worker_resume` for that run, issue, and stage. Bare execute consumes it before redispatching the same standard worker. A genuine failure then enters ordinary bounded remediation, allowing fixes and reverification toward the approved spec. A second loss, unchanged failure, consumed recovery, changed head/branch, live ownership, or valid intervention cannot redispatch.

A distinct failed START case can resume once when a valid `issue_unreadable` handoff was written before checkout mutation and the exact issue becomes readable again. Bare execute requires the original run, clean non-issue branch and HEAD, exact failed handoff, no live worker or foreign lease, and a fresh read of that open issue; it archives the failed bytes and consumes one START invocation before dispatching the normal worker. A changed or malformed handoff, another failure, or a consumed retry stays blocked. This neither repairs credentials nor creates a passed handoff.

Mixed verification does not collapse a local failure into an external `Incomplete` blocker. An exact-head, coverage-complete canonical verification artifact with a required failed built-in command receives one durable `actionable_verification_resume`: verify finalization names local failed and external incomplete validations, rewinds to standard implement authority, and reruns both review/fix rounds plus verification. An existing Incomplete report with only required external incomplete validations can consume one owner-bound `external_verification_recheck` after exact issue/spec/HEAD and registered identity checks. The verify stage reruns its registered gate once; only fresh full-pass evidence permits a replacement report and normal finalization. A still-incomplete gate preserves the historical report and intervention, without another attempt. Stale, malformed, unsafe, required failed, or consumed evidence cannot trigger this recheck.

Safe local verification-report format or scope-evidence errors remain unpassed, but can use the same bounded repair path. Regenerating that report does not waive its scope, gate, publication, or identity checks. Genuine `Incomplete` evidence and unsafe report paths still require intervention.

Blocked/intervention handoffs remain non-passing. Missing approval, unavailable credentials or required external evidence, unsafe ownership, and human-review authority are not permission to improvise success. Only after safe automatic continuation is unavailable or consumed does discovery return a checkpoint-bound intervention prompt. The prompt may run the owning standalone `verify` or `deliver` workflow exactly once when that public stage exists, or preserve/inspect the stop; it then runs discovery exactly once and resumes only from a validated passed handoff. It never edits handoffs, grants another allowance, asks twice, or replays unchanged execution.

### Resume, cancellation, and debugging

```text
/sdlc-status --json
/sdlc-execute #42
/sdlc-execute --retain-worker #42
/sdlc-execute --recover-stale #42
```

On the exact incomplete issue branch, run bare `/sdlc-execute` to resume the **same persisted issue queue** in the same project, automatically reclaiming only proven stale ownership. No issue tokens, recovery flag, token or reason entry is required. Completed stages are skipped; matching passed handoffs settle without unnecessary repair work. Do not change the queue or remove the checkpoint to sidestep an unfinished run.

Cancel the owning execute job through the host's cancellation surface or send it SIGINT/SIGTERM. The invocation supervisor remains responsive while the controller is blocked in an external wait. Before work starts, a short-lived bootstrap exits and leaves the supervisor outside the invoking process tree; an authenticated local connection detects invoking-job loss. It terminates only the owned controller process group, closes its recorded worker panes, and persists `controller_cancelled`. Pending prompts are not an exemption from cancellation cleanup. Unrelated panes and the Herdr server remain untouched.

Unexpected controller death is also a failure, not completion. Remaining owned subprocesses must be terminated even if their parent has already exited; a surviving descendant or open output pipe is not proof that the controller is still healthy. For a consumed repaired-publication invocation, bare execute may resume the same `started` dispatch after `controller_cancelled` or `process_lost` only when workers are empty, the recorded pane and matching agents are absent, the live handoff is absent, and the immutable archive plus all original identity and clean-state proofs still match. It neither consumes nor appends recovery state again. Cleanup failures or ambiguous ownership preserve diagnostic ownership instead of authorizing replay.

The supervisor ends with its invocation; it is not a persistent plugin service. Whole-process-tree cancellation is covered for standard POSIX reparenting. Windows Job Object termination and custom child-subreaper topologies are not covered by that guarantee.

`--retain-worker` keeps the worker pane on stop/cancellation for inspection; it does not keep the controller running or turn failure into success. A retained worker must match its recorded name, pane, project, run, issue, step, branch, and head before reuse. Close or persistence failures retain ownership evidence for recovery.

`--recover-stale` is for a **proven-dead** controller lease, not an active-controller bypass. Recovery checks process and pane ownership; a live, unreadable, or conflicting lease still blocks. Never manually remove an active lock, start a second controller, or stop Herdr as a recovery shortcut.

Status and stop output distinguish `resumable`, `loop-recovery-available`, `recovery-consumed` and `blocked`, including primary and cleanup failure reasons. `loop-recovery-available` runs once through bare execute and persists consumption before dispatch. A blocked response is reserved for unsafe, externally owned, ambiguous, or already-consumed progress and includes one structured intervention tied to the checkpoint issue and stage. Another unchanged invocation never replenishes either recovery or remediation budgets. Reused panes, active owners, intervention and unreadable ownership evidence remain blockers. Only positively absent recorded panes are reconciled as absent, never reported as successfully closed.

## Verification and terminal delivery

```text
/sdlc-verify-code #42
/sdlc-open-pr #42
```

Normally execute runs these stages. Use standalone verification only on an already-implemented issue branch; use standalone delivery only when that branch has valid verification evidence. Neither command replaces the approved issue/spec or publication gates.

Verification records identity-bound deterministic results in `.omp/sdlc/verification/42.json` and a committed `verification-report.md` in the issue spec. Missing, duplicate, unknown, failed, incomplete, stale, or improperly skipped required results cannot pass. A project that deliberately declares zero validations has complete zero-result coverage, not an invented test pass. `PR Evidence Pending` is permitted only when local obligations pass and explicitly declared PR-only evidence remains.

Delivery rechecks immutable evidence at the exact head. It uses non-force pushes and retains both required and unfiltered checks. Missing, registering, queued, or pending required/declared checks—including `BLOCKED` attributable to that incomplete CI evidence—remain in an unbounded 30-second observation loop. Explicit check failure and proven human-review, mergeability, or non-CI policy blockers take their existing remediation or failure routes. Merge occurs only after a fresh exact-head snapshot has terminal-successful checks and `CLEAN` merge readiness. Unexpected PR/head identity is a reconciliation failure, not permission to open another PR or merge a different commit.

Execute-owned delivery uses the canonical run namespace. Standalone `/sdlc-open-pr` creates a token-specific handoff directory and recovery-owner pointer under `.omp/sdlc/sessions/<token>/`; tokens for the same incomplete project/issue/branch/stage share logical-owner delivery state. Another issue's canonical run is not overwritten, and standalone helpers do not create root execute `run.json`.

**Done means:** the persisted PR is `MERGED` at the persisted expected head, the GitHub issue is `CLOSED`, the delivery handoff is passed, and local default-branch synchronization/cleanup completes. An open PR, green local tests, or a printed success sentence proves less than that.

### Live smoke when developing nmg-sdlc

This repository registers the required `repository.nmg-sdlc-smoke` provider against `Nunley-Media-Group/nmg-sdlc-smoke`. It is **not** a mandatory dependency of every consumer project; consumer gates come from their own manifests.

1. Identify the nmg-sdlc behavior being proved and the observable success/failure conditions.
2. Provision fresh smoke issues with approved specs through the smoke repository's normal issue/spec workflows. Do not reuse delivered issues or take over unrelated smoke work.
3. Set `NMG_SDLC_SMOKE_ISSUES` to those explicit numbers in the environment of the **nmg-sdlc controller/verification process** before launch. For example, `export NMG_SDLC_SMOKE_ISSUES="65,66"` after replacing those example numbers with the actual fresh fixture issues. Existing retained workers do not gain environment changes retroactively.
4. Run normal nmg-sdlc verification. The provider clones the allowlisted smoke repository, records linked-PR baselines, and invokes this candidate's execute controller for the configured queue. Only the enclosing provider sets its nested-execution ownership marker; do not set `NMG_SDLC_SMOKE_OWNED` to bypass verification.
5. Accept success only with this invocation's pre-merge delivery proof, an exact matching new merged PR outside the baseline, and closed issue evidence for each configured issue. Status output is not smoke proof.

Smoke is a **plugin experiment**, not a second repair backlog. Change smoke code only when it is a necessary fixture or means to prove a named nmg-sdlc change. Classify a failure before editing: repair confirmed plugin defects in nmg-sdlc; record unrelated smoke-project defects without fixing them. Stop unchanged/no-progress failures. A new attempt requires a concrete changed plugin fix or hypothesis and its expected observation—not the hope that rerunning will pass. Do not repeatedly create fresh issues, weaken assertions, recycle consumed evidence, or repair unrelated smoke code to manufacture a green gate.

## Status and troubleshooting

```text
/sdlc-status
/sdlc-status --json
```

Status is read-only: current branch/spec, verification, GitHub issue/PR state, and recommended next action. Inspect the exact evidence before repairing:

| Artifact | Purpose |
|---|---|
| `.omp/sdlc/run.json` | Queue, current issue/stage, completed stages, failure, remediation history, owned workers |
| `.omp/sdlc/controller.lock` | Exclusive controller identity |
| `.omp/sdlc/handoffs/<N>-<step>.json` | Validated stage outcome and referenced evidence |
| `.omp/sdlc/reviews/<N>-review{1,2}.md` | Findings consumed by the dedicated fix stage |
| `.omp/sdlc/reviews/*.assignment.json` and `*.access.jsonl` | Immutable slice identity, host restriction receipts, and captured final results |
| `.omp/sdlc/reviews/*.{current,invalidation}.json` | Current head-bound review selection and preserved invalidation history |
| `.omp/sdlc/safe-recoveries.json` | Stable logical owners and one-use recovery records, separate from execute remediation budgets |
| `.omp/sdlc/verification/<N>.json` | Deterministic gate results, coverage, and identity |
| `.omp/sdlc/prompt-provenance/` | Recorded prompt composition |
| `.omp/sdlc/archive/delivered-failures/<runId>/` | Immutable original failed-deliver checkpoint and issue evidence with independently observed merge proof |
| `specs/<N>-<slug>/verification-report.md` | Durable acceptance and verification report |
| `.omp/sdlc/sessions/<token>/` | Standalone handoffs and pointer to shared logical-owner delivery state |

- **Commands missing or controller paths unresolved:** inspect `omp plugin list --json` and `omp plugin doctor`; use a fresh session with the intended installed version, then apply project upgrades.
- **No eligible issue / unapproved spec:** finish issue/spec publication and inspect official blockers; do not manually apply labels as a substitute for approval.
- **Dirty tree / branch mismatch:** preserve the work and restore the correct issue context. Do not reset or stash unrelated changes automatically.
- **Controller lease held:** check whether its owner is still active. Use stale recovery only when its proof succeeds.
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
| `/sdlc-execute [--retain-worker] [--recover-stale] [#N …]` | Run/resume the complete automated delivery queue |
| `/sdlc-status [--json]` | Inspect lifecycle state without mutation |
| `/sdlc-verify-code #N` | Verify an already-implemented issue branch |
| `/sdlc-open-pr #N` | Deliver an already-verified issue branch through merge and closure |
| `/sdlc-run-retro` | Interactive retrospective from defect specs into project learnings |

`start-issue`, `write-code`, `simplify`, `review-main`, `apply-review`, and `address-pr-comments` are internal workflow stages/guidance, not additional public slash commands. Public commands are registered by `src/extension.ts`; workflow bundles are loaded from the package's `workflows/` directory.

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
