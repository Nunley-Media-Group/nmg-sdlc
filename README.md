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

GitHub's **official blocked-by relation** is the sole sequencing authority. Body text such as `Depends on:`, labels, milestones, epics, and sub-issues are not substitutes. Execute does not guess through unreadable dependencies or open blockers.

### Write and publish its specification

```text
/sdlc-write-spec #42
/sdlc-write-spec
```

The numbered form selects that issue. The bare form offers open issues missing the exact `spec-created` label. The workflow creates or amends one issue-owned package, then publishes the approved spec through a spec-only PR, squash-merges it into the default branch, and applies `spec-created` without closing the implementation issue. Follow its continue/finish prompt for additional issues.

```text
specs/42-add-user-auth/
├── requirements.md
├── design.md
├── tasks.md
└── feature.gherkin
```

Every file declares singular `**Issue**: #42` and `**Status**: Draft` or `**Status**: Approved`, plus date and author. The directory's leading number must match. Defects also identify their related capability spec. Commit specs with their feature branches.

`specs/` is the current working-tree BDD archive. Load the active package first and only relevant neighbors. Superseded contracts remain in Git history. Legacy `feature-*`, `bug-*`, `epic-*`, and `.codex/specs/` layouts are upgrade inputs, not new-write formats. There is no epic type, cumulative issue-ownership manifest, or synthetic issue number for unowned rewrite behavior.

## Execute the approved work

```text
/sdlc-execute #42
/sdlc-execute #42 #43
/sdlc-execute 42,43
/sdlc-execute
```

Explicit lists are deduplicated in the supplied order. Every selected issue must have an approved spec, the `spec-created` label, and eligible official dependencies. The bare command opens a multi-select picker: selected chips come first in displayed order, then valid Other tokens. Empty Continue reopens the picker; it does not run an empty queue.

Start from a clean tree. Resume may preserve partial work already on the target issue branch; the controller never stashes, discards, resets, or force-pushes your changes. Use one execute controller per canonical project root and do not run unrelated branch-changing work concurrently.

### Stage sequence

| Stage | What must finish before advancement |
|---|---|
| `start` | Resolve the executable issue, establish its linked branch, update applicable project status |
| `implement` | Complete approved tasks, simplify without changing behavior, verify, commit and push; clean tree and upstream equality |
| `review1` | Review the branch against the resolved GitHub default ref and persist the review artifact |
| `fix1` | Address that review; publish changes when needed |
| `review2` | Repeat the review on the resulting implementation |
| `fix2` | Address the second review and publish changes when needed |
| `verify` | Run registered validations and acceptance/architecture review; publish a truthful verification report |
| `deliver` | Synchronize release artifacts, create/resume the exact PR, handle eligible automated feedback, prove required checks, merge the expected head, and prove issue closure |

Workers are sibling Herdr `--kind omp` panes. Execute owns orchestration, not product edits in the main pane. Worker success is determined by validated handoffs, not terminal prose or an exit code alone. Review workers use a single controller-owned prompt and persist their findings before settlement.

### Autonomous repair and progress limits

Workers resolve in-scope implementation details using approved requirements, repository evidence, and conservative engineering judgment. They repair and reverify ordinary code/test failures rather than asking for decisions a model can make within that authority.

A settled failed, non-intervention handoff can start a fresh `rN-step` remediation worker for `implement`, either review/fix stage, `verify`, or `deliver`. Only one repair runs at a time. After **two completed remediations for the same issue and step without advancement**, execute records `remediation_loop` and stops before a third. Commit churn, changing summaries, and elapsed time are not stage advancement. A passed remediation advances and clears that streak.

Safe local verification-report format or scope-evidence errors remain unpassed, but can use the same bounded repair path. Regenerating that report does not waive its scope, gate, publication, or identity checks. Genuine `Incomplete` evidence and unsafe report paths still require intervention.

Blocked/intervention handoffs stop immediately. Missing approval, unavailable credentials or required external evidence, unsafe ownership, and human-review authority are not permission to improvise success. An unchanged blocked/intervention or loop stop remains stopped on reinvocation. A later validated passed handoff can advance; an authorized non-intervention earlier-step repair reruns downstream gates. Do not edit a handoff to say passed without satisfying its contract.

### Resume, cancellation, and debugging

```text
/sdlc-status --json
/sdlc-execute #42
/sdlc-execute --retain-worker #42
/sdlc-execute --recover-stale #42
```

Resume the **same issue queue**, in the same project. Completed stages are skipped and matching owned workers are reused instead of duplicated. Do not change the queue or remove the checkpoint to sidestep an unfinished run.

Cancel the owning execute job through the host's cancellation surface or send it SIGINT/SIGTERM. The invocation supervisor remains responsive while the controller is blocked in an external wait. Before work starts, a short-lived bootstrap exits and leaves the supervisor outside the invoking process tree; an authenticated local connection detects invoking-job loss. It terminates only the owned controller process group, closes its recorded worker panes, and persists `controller_cancelled`. Pending prompts are not an exemption from cancellation cleanup. Unrelated panes and the Herdr server remain untouched.

Unexpected controller death is also a failure, not completion. Remaining owned subprocesses must be terminated even if their parent has already exited; a surviving descendant or open output pipe is not proof that the controller is still healthy. Cleanup failures preserve diagnostic ownership instead of releasing it as successful cleanup.

The supervisor ends with its invocation; it is not a persistent plugin service. Whole-process-tree cancellation is covered for standard POSIX reparenting. Windows Job Object termination and custom child-subreaper topologies are not covered by that guarantee.

`--retain-worker` keeps the worker pane on stop/cancellation for inspection; it does not keep the controller running or turn failure into success. A retained worker must match its recorded name, pane, project, run, issue, step, branch, and head before reuse. Close or persistence failures retain ownership evidence for recovery.

`--recover-stale` is for a **proven-dead** controller lease, not an active-controller bypass. Recovery checks process and pane ownership; a live, unreadable, or conflicting lease still blocks. Never manually remove an active lock, start a second controller, or stop Herdr as a recovery shortcut.

## Verification and terminal delivery

```text
/sdlc-verify-code #42
/sdlc-open-pr #42
```

Normally execute runs these stages. Use standalone verification only on an already-implemented issue branch; use standalone delivery only when that branch has valid verification evidence. Neither command replaces the approved issue/spec or publication gates.

Verification records identity-bound deterministic results in `.omp/sdlc/verification/42.json` and a committed `verification-report.md` in the issue spec. Missing, duplicate, unknown, failed, incomplete, stale, or improperly skipped required results cannot pass. A project that deliberately declares zero validations has complete zero-result coverage, not an invented test pass. `PR Evidence Pending` is permitted only when local obligations pass and explicitly declared PR-only evidence remains.

Delivery rechecks immutable evidence at the exact head. It uses non-force pushes and retains both required and unfiltered checks. Unexpected PR/head identity is a reconciliation failure, not permission to open another PR or merge a different commit. Human review remains human-owned; actionable configured automated-reviewer feedback is handled within approved scope.

Execute-owned delivery uses the canonical run namespace. Standalone `/sdlc-open-pr` creates one UUID session under `.omp/sdlc/sessions/<token>/` and reuses it throughout remediation; another issue's canonical run is not overwritten.

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
| `.omp/sdlc/verification/<N>.json` | Deterministic gate results, coverage, and identity |
| `.omp/sdlc/prompt-provenance/` | Recorded prompt composition |
| `specs/<N>-<slug>/verification-report.md` | Durable acceptance and verification report |
| `.omp/sdlc/sessions/<token>/` | Standalone delivery namespace |

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
