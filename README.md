# nmg-sdlc

Spec-driven delivery for Claude Code and Herdr: GitHub issue → approved BDD spec → implementation → verification → exact-head merge → issue closure.

The plugin is stack-agnostic. Your project's registered steering supplies its product constraints, engineering conventions, version files, and verification commands. The plugin does not replace CI or human review.

## Prerequisites

Run from the root of the GitHub repository you intend to change.

| Requirement | Purpose / check |
|---|---|
| Node.js 20 or newer | Runs the packaged controllers, prompt renderer, and validation scripts; `node --version` |
| Claude Code with plugin hooks-module support | Interactive TUI, native plan mode, `AskUserQuestion`, `ExitPlanMode`, model/tool access, and plugin loading; `claude --version` |
| Herdr with the Claude integration | Owns automated worker panes for `/sdlc-execute`; install once per machine with `herdr integration install claude`, check with `herdr integration status` (expects a `claude:` line that is not `not installed`) |
| Git and an `origin` remote | Linked issue branches, commits, non-force pushes, default-branch synchronization |
| Authenticated GitHub CLI (`gh`) | `gh auth status`; account needs the repository permissions required to create issues/PRs, push branches, read checks, and merge |
| Configured project toolchain | Install the dependencies and tools used by the project's steering validations |

Interactive commands need a Claude Code **TUI** session. Under `claude -p` or the Agent SDK they print `Run /<command> in the TUI.` and exit 2. `/sdlc-execute` additionally requires a Claude Code session in a Herdr-managed pane with `HERDR_ENV=1`, `HERDR_SOCKET_PATH`, and `HERDR_PANE_ID`; Herdr supplies these. Do not invent these values to run outside Herdr.

Private-repository access must work for both Git transport and `gh`. A token with read-only access is not sufficient for delivery. Repository rules, required checks, and human-review permissions remain authoritative.

## Install and update

nmg-sdlc is published through the `Nunley-Media-Group/nmg-plugins` marketplace. In Claude Code:

```text
/plugin marketplace add Nunley-Media-Group/nmg-plugins
/plugin install nmg-sdlc@nmg-plugins
```

Then, once per machine, in a shell:

```bash
herdr integration install claude
```

To update, refresh the marketplace with `/plugin marketplace update nmg-plugins` and update `nmg-sdlc` from the `/plugin` menu. Open a **fresh Claude Code session** after changing the installed plugin so the hooks module, command registration, and rendered workflows use the new version. Do not stop an active Herdr server to update this plugin.

For development, load a local checkout directly instead of the installed copy:

```bash
claude --plugin-dir /absolute/path/to/nmg-sdlc
```

Workers started by `/sdlc-execute` receive `--plugin-dir` for the controller's own plugin root, so a controller and its workers always run the same plugin version. Before verifying a development candidate against a consumer project, start the controller session from that exact candidate; check `/plugin` to see which installation is active and avoid having an older installed copy and the checkout enabled at once.

Then, in every existing consumer project, run `/sdlc-upgrade-project` and approve the relevant migrations before further SDLC work (see [Upgrading from 3.x](#upgrading-from-3x)). For a project not yet using nmg-sdlc, use `/sdlc-onboard-project` first.

## Quick start

In a Claude Code TUI running in a Herdr pane, from your project root:

```text
/sdlc-onboard-project
/sdlc-draft-issue "add user authentication"
/sdlc-write-spec #42
/sdlc-execute #42
/sdlc-status
```

Replace `42` with the actual GitHub issue number. Review and approve the interactive plans; do not skip directly from a drafted issue to execute. After spec approval, execute owns the automated lifecycle. Opening a PR is intermediate, not completion.

## How it runs in Claude Code

### Interactive commands and plan mode

`/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, `/sdlc-steering`, and `/sdlc-run-retro` are registered by the plugin's hooks module (`hooks/register.ts`). Running one renders its workflow, switches the session into native plan mode (builtin `/plan`; a session already in plan mode stays there), and submits the workflow as your prompt. The workflow investigates read-only, asks only the decisions repository evidence cannot answer through `AskUserQuestion` (recommended option first, labelled `(Recommended)`; a typed Other answer is always available), writes its plan to the plan-mode plan file, and calls `ExitPlanMode`. You approve, edit, or reject the plan in Claude Code's approval dialog; nothing is mutated before approval.

`/sdlc-write-spec` loops in plan mode. After each spec publication merges, the plugin waits for the turn to end and, when the prompt box is empty, re-enters plan mode with the Continue prompt so you can pick the next issue or finish. A draft in the prompt box keeps the Continue prompt pending. Choosing **Finished** ends the reply with an `ExitPlanMode` call that the plugin approves, so plan mode ends without a dialog. If the reply ends without that call, the plugin asks for it once, then warns that Shift+Tab exits plan mode.

### Automated commands and workers

`/sdlc-execute` is registered by the hooks module like the interactive commands, so it runs as plain `/sdlc-execute`. It renders its workflow and submits it as your prompt without entering plan mode, because its controller mutates the repository. Like the interactive commands it is TUI-only: under `claude -p` it prints `Run /sdlc-execute in the TUI.` and exits 2.

`/sdlc-execute` requires an Opus or Fable session, because that session supervises the workers. In a session on any other model, or one whose model cannot be read, it prints `/sdlc-execute requires an Opus session (current: <model>). Switch with /model opus and run /sdlc-execute again.` and stops before any Herdr, Git, or GitHub call.

`/sdlc-status`, `/sdlc-verify-code`, and `/sdlc-open-pr` are plugin command files (`commands/*.md`). They expand in the TUI and under `claude -p`, and they never call `AskUserQuestion` or `ExitPlanMode`.

`/sdlc-execute` runs its stages in sibling Herdr panes, each a Claude Code session started as:

```text
herdr agent start <name> --kind claude --pane <id> -- --plugin-dir <plugin-root> --permission-mode <mode> --model <model>
```

`<mode>` defaults to `auto`. Set `NMG_SDLC_WORKER_PERMISSION_MODE` in the controller's environment to `default`, `acceptEdits`, `auto`, `dontAsk`, or `bypassPermissions` to override it; any other value falls back to `auto`. Workers inherit your Claude Code settings and permission rules, so a stricter mode can stop a worker at a permission prompt.

### Models

Every step runs on the Claude Code model suited to its workload, and your session model is never changed. Execute stage workers start with `claude --model <model>`, plus `--effort <effort>` when the step sets one. The three command files declare `model`, and `effort` when set, in their frontmatter. For the six interactive commands, the hooks module rewrites the model of each main-loop request, including the turns the plugin submits for the command, such as the write-spec Continue prompt. `/sdlc-execute` is not rewritten: its supervisor runs on your Opus or Fable session model. Subagent requests and the effort setting of those commands are left alone.

| Step | Model | Effort |
|------|-------|--------|
| execute stage `start` | `haiku` | default |
| execute stage `implement` | `haiku` | `xhigh` |
| execute stage `verify` | `opus` | default |
| execute stage `deliver` | `haiku` | `xhigh` |
| execute repair re-dispatch (`implement`, `verify`, `deliver`) | `opus` | default |
| `/sdlc-status` | `haiku` | default |
| `/sdlc-execute` (supervisor session) | your Opus or Fable session model | your setting |
| `/sdlc-open-pr` | `haiku` | `xhigh` |
| `/sdlc-verify-code` | `opus` | default |
| `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, `/sdlc-steering`, `/sdlc-run-retro` | `opus` | default |

A repair re-dispatch is the next implement, verify, or deliver worker after a recorded failure, other than `pr_evidence_pending` and `mergeability_reverification_required`. Once a stage passes, the next dispatch uses its stage model again. A hooks-registered command's model holds until you submit your own prompt or slash command (from the composer or Remote Control) or change the session model. The aliases always resolve to the current model of each tier. The maps are `SDLC_MODELS` and `SDLC_EFFORTS` in `src/host-events.mjs`; "default" is your Claude Code effort setting.

### Autopilot for hands-off drivers

With `NMG_SDLC_AUTOPILOT=1` in a Claude session's environment, the plugin approves every `ExitPlanMode` plan and answers every `AskUserQuestion` with each question's `(Recommended)` option (else its first option). It exists for hands-off drivers such as the live smoke provider, which launches its provisioning pane with it. Never set it in a session you use yourself: it approves plans on your behalf.

### Runtime state

The plugin keeps runtime state in `.nmg-sdlc/` at the project root: `handoffs/`, `verification/`, `run.json`, `controller.lock`, `safe-recoveries.json`, `prompt-provenance/`, `plans/`, and `smoke-deliveries/`. Onboarding and upgrade add `.nmg-sdlc/` to `.gitignore`. These files are evidence and coordination state, never commit material.

## Set up or upgrade a project

### First-time onboarding

```text
/sdlc-onboard-project
```

- **Greenfield:** interviews for product/technology constraints, initializes steering and version artifacts, and seeds starter work.
- **Brownfield:** reconciles existing code, closed issues, and merged-PR evidence with current capability contracts.
- **Already initialized:** routes contract reconciliation through project upgrade.

Interactive commands enter native plan mode, use `AskUserQuestion` for decisions that repository evidence cannot answer, and finish with a plan in the `ExitPlanMode` approval dialog before mutation. Approve only the scope you intend to authorize.

### Existing projects

```text
/sdlc-upgrade-project
```

Upgrade audits and proposes migration groups. Each group requires approval. It handles obsolete steering runtimes, legacy spec layouts, official issue dependencies supported by migration evidence, managed repository assets, and obsolete plugin-owned artifacts. It preserves unrelated project content and ambiguous ownership rather than guessing.

For package-bounded publication repair, use `node <plugin-root>/scripts/sdlc-upgrade.mjs detect-publication --root PROJECT_ROOT --spec specs/N-slug`, then only the approved `apply-publication` with the same single spec. Zero, repeated, or multiple specs fail. Command resolution first uses the pre-#388 legacy command set and option-value consumption: if legacy `detect` or `apply` resolves, publication-command positional tokens remain ignored; strict publication parsing applies only when no legacy command resolves and the result is a publication command. The digest binds exact root/package, complete deterministic inventory, issue digits, bytes/identities, stable directory listings, and the rewrite/finding plan built from the descriptor-carried tasks Buffer. …

Onboarding/upgrade manage:

- `steering/manifest.json`, runtime descriptors, and registered project context.
- `CONTRIBUTING.md` and its README link.
- The bounded spec-context section in root `CLAUDE.md`.
- `.github/workflows/nmg-sdlc-contribution-gate.yml`.
- `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`.
- The `.nmg-sdlc/` ignore rule. Start/execute may untrack previously committed runtime files without deleting their working-tree contents.

Do not replace user-authored assets or delete `.nmg-sdlc/` just to bypass a failed preflight.

### Upgrading from 3.x

nmg-sdlc 4.0 replaces the Oh My Pi extension with a Claude Code plugin. Projects and specs carry over unchanged; the host and runtime-state location change.

1. Install the plugin in Claude Code (see [Install and update](#install-and-update)) and run `herdr integration install claude`. Remove the old Oh My Pi installation when you no longer need it.
2. In each consumer project, open a fresh Claude Code session and run `/sdlc-upgrade-project`. Its 4.0 migration groups, each approved separately, are:
   - `runtime-state-v4`: moves legacy `.omp/sdlc/` runtime state into `.nmg-sdlc/`. Byte-identical duplicates are dropped, the obsolete OMP-only `omp-controller.yml` paste configuration is deleted, and existing `.nmg-sdlc/` files are never overwritten; conflicts are preserved for you to resolve.
   - `nmg-sdlc-ignore`: adds the `.nmg-sdlc/` ignore rule.
   - `agents-v4-host-language`: rewrites the managed `AGENTS.md` structure comment from OMP task agents to Claude Code plugin subagents.
   - `steering-v4-host-language`: rewrites v3 host tokens in registered steering snippets and validations (`omp` to `claude`, `--print` to `-p`, `.omp/sdlc/` to `.nmg-sdlc/`) and `Oh My Pi` / `OMP` prose to `Claude Code`, through the shared steering writer.
   - `contributing-v4-host-language`: replaces the v3 `drives Herdr omp worker panes` sentence in `CONTRIBUTING.md` with its Claude form.
   - `agents-to-claude-md`: moves root `AGENTS.md` to `CLAUDE.md` (a rename, or an append after one blank line into an existing `CLAUDE.md`); a symlinked file is skipped with `skipped:collision`.
   - `packaging-v4-claude-code-herdr`: reports leftover v3 OMP packaging references and the Claude Code install steps.
3. Hands-off drivers that answered OMP prompts by reading the pane now launch their Claude session with `NMG_SDLC_AUTOPILOT=1` instead.

Interactive behavior maps one to one: OMP `ask` chips are `AskUserQuestion` questions, `xd://propose` is the plan-mode plan file plus `ExitPlanMode`, `omp --print` is `claude -p`, and `--kind omp` workers are `--kind claude` workers.

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

The numbered form selects that issue. The bare form offers open issues missing the exact `spec-created` label. Every selected issue gets a distinct complete local plan and native-plan approval before any issue-specific mutation. Publication uses a spec-only PR, squash-merges it into the default branch, applies `spec-created` without closing the implementation issue, completes any post-merge remediation, then returns the same TUI session to native plan mode for Continue/Finished. A continuation issue repeats that approval boundary instead of inheriting the first issue's approval. Selecting Finished in either picker ends the reply with an `ExitPlanMode` call that the plugin approves, leaving plan mode completely without a typed command or dialog; if the reply ends without that call, the plugin asks for it once, then warns that Shift+Tab exits plan mode.

The spec-only publication helper waits for configured required status contexts and all reported PR checks on the exact head, including checks not yet registered after PR creation. It waits through stale `UNSTABLE` mergeability without treating it alone as a policy block, then requires two fresh passing `CLEAN` observations before squash-merging that head. Terminal failed checks and draft PRs stop publication; `BLOCKED` is a terminal policy block only once checks are complete, not while they are absent or pending. Missing or pending checks and `UNKNOWN` never permit a merge.

If GitHub merges the exact spec PR but its CLI exits nonzero while checking out the default branch, the helper independently verifies the same PR's merged state, head, and branch/base identity. A proven merge reports its PR, `issue`, `dir`, and `merged: true`; labeling continues where safe, while a default branch owned by another worktree is reported as a checkout limitation without disturbing either worktree. Re-running publication from the spec branch recognizes the merged PR rather than creating or merging another. Unreadable or contradictory remote evidence never counts as publication.

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

Execute implement uses outcome mutation policy. Workers may publish any repository-relative path required by Acceptance unless `validPublicationPath` rejects it, it is one of the current spec's four Approved inputs, or it is under `specs/`. The sole `specs/` exception is the current issue's `verification-report.md`. `.nmg-sdlc/`, URL-like, absolute, backslash, parent-traversal, and other invalid publication paths remain denied. Verify stays closed to the current verification report; deliver keeps its explicit version and PR-evidence artifact lists.

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

Explicit lists are deduplicated in the supplied order. Every selected issue must have an approved spec, the `spec-created` label, and eligible official dependencies. Bare invocation on a branch recognized by parseIssueBranch selects that issue immediately without picker or extra flags. On non-issue branch, explicit numbers use start-issue worker; bare offers picker. Before that admission, an explicit issue that is already CLOSED by exactly one same-repository merged pull request from its own issue branch prints `#N: MERGED and CLOSED` and the queue continues without a worker. A CLOSED issue without that proof stops with `issue_closed_undelivered`, `merged_pr_ambiguous`, or `delivery_evidence_unavailable`.

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

Workers are sibling Herdr `--kind claude` panes running Claude Code with this plugin (see [Automated commands and workers](#automated-commands-and-workers)). Execute owns orchestration, not product edits in the main pane. Worker success is determined by validated handoffs, not terminal prose or an exit code alone. Only host-captured final assistant output supplies findings.

### Supervision

The `/sdlc-execute` session supervises every stage. Its controller runs detached and yields a report each time a worker settles and while a worker runs. Each `sdlc-execute.mjs supervise`, `decide`, or `wait` call returns within nine minutes, so no call outlasts the `Bash` tool timeout. The controller keeps its lease, owned panes, and failure history across those calls.

- **Stage report**: sent when a worker writes its handoff or settles without one, before its pane closes and before the next stage starts. It names the issue, stage, worker, and pane. It gives the handoff, source HEAD before and after, and the commits added, with any changed paths outside the spec's declared files. It also gives the registered gate status and recent failure history. After verify it adds the readiness `status`, `reasonCode`, and `gaps`, plus the report's critical and remaining issues. The supervisor answers `accept` (continue with the existing routing; the pane closes unless `--retain-worker`), `prompt` (send guidance to the live worker and await its fresh handoff), `redispatch` (start the stage again with guidance beside the failure evidence), or `halt` (stop non-zero with a diagnosis, close owned panes unless `--retain-worker`, release the lease).
- **Check-in report**: sent every check-in interval without a handoff (default 5 minutes; set `--check-in-seconds N`), and as soon as the worker's pane output or its `.waiting` marker has been unchanged for the interval. The worker keeps running. The report gives the time since dispatch, the end of the pane output and when it last changed, any waiting marker, commits since dispatch, and failure history. The supervisor answers `continue`, `prompt` (queued until the worker's current tool call finishes), `redispatch`, or `halt`.

A verify failure caused by the host environment can be re-run without an implement repair. The supervisor repairs the environment, then re-dispatches verify at the same source HEAD, and that run is held to the same full registered gate. No decision skips routing, publication checks, version preparation, or the full-green gate. Accepting a non-green verify routes to implement, never to deliver. The supervisor never edits product code, implements tasks, or opens PRs. If its pane closes, the controller halts and releases its lease.

Every execute worker is told never to switch the shared checkout's branch or move HEAD to read another ref. Workers use `git show <ref>:<path>`, `git diff <ref>...HEAD`, or a separate worktree instead. The headless `sdlc-execute.mjs run` path, which the smoke gate uses, runs unsupervised to completion.

A worker's turn can end while a background command it started is still running, such as the registered gate. In that case the worker first writes `.nmg-sdlc/handoffs/<N>-<step>.json.waiting`, and the controller keeps its pane open until the worker resumes. A worker that settles with neither a handoff nor that marker gets one reminder before it counts as stopped. A branch with no commits relative to the default branch is implemented before it is verified, and a verify worker that stops without a handoff is retried as verify.

### Branch-first resume, repair and full-green verification

Branch content and live verification/PR results are authoritative (no run.json or ledger checkpoint). Bare `/sdlc-execute` on recognized N-* branch selects the issue immediately and resumes from current state: verify existing impl if present (skip implement on clean passing); dirty/partial permitted branches implement first.

On non-issue branch, explicit #N queue uses start-issue then proceed; bare offers picker via list-specified.

Workers resolve in-scope implementation details using approved requirements, repository evidence, and conservative engineering judgment. They map every AC bullet before edits (skip satisfied, preserve partials, do not reset completed). Repair and reverify ordinary failures.

Continue repair while actual progress toward spec (ACs become satisfied, defect or failing check changes after substantive repair, external prerequisite advances). Changed impl HEAD after repair invalidates old report and triggers full registered gate at new head.

No fixed attempt count, no --recover-stale, no discover-recovery, no blocked-recovery ask/allowance for ordinary flow. User-visible blocking reserved for missing approved spec, ambiguous issue/branch, foreign live controller, unavailable credentials/provider, required human review/approval, unauthorized path, or explicit cancellation. Report the exact failed prerequisite and preserved work; once available, ordinary `/sdlc-execute` resumes from branch evidence.

Full-green (registered results including required smoke all Pass, complete coverage, no ceiling) at exact head is the only route to PR ready/merge. PR Evidence Pending is separate draft evidence step before final verify run and deliver.

Version preparation comes before the gate. `/sdlc-execute` runs `prepare-version` on the published issue branch before it dispatches verify or deliver, and verifies any head that the version commit changes. Standalone, run `prepare-version` before final verification, then verify the resulting source HEAD with the full registered gate. Delivery refuses an unprepared version (`version_not_prepared`), and a new version commit is never made after a passing gate.

```text
/sdlc-status --json
/sdlc-execute #42
/sdlc-execute --retain-worker #42
```

On the exact incomplete issue branch, run bare `/sdlc-execute` to resume ordinary from the branch and live evidence. No issue tokens or recovery flag required. Completed stages skipped when evidence passes; partial work preserved.

Cancel the owning execute job through the host's cancellation surface or send it SIGINT/SIGTERM. The supervisor terminates only this invocation's controller process group and closes worker panes reported as owned through authenticated IPC. It leaves foreign panes, the Herdr server, partial work, and historical runtime files untouched; the next invocation derives its stage from branch and live verification/PR evidence. Under supervision, stop a run with a `halt` decision; SIGINT or SIGTERM on a `supervise`, `decide`, or `wait` call also cancels it through the same supervisor.

`--retain-worker` keeps this invocation's worker pane on stop or cancellation for inspection; it does not keep the controller running or turn failure into success.

### Post-delivery branch cleanup

When the controller proves an issue delivered on its own issue branch (exact-head merged pull request and issue `CLOSED`), it prints `#N: MERGED and CLOSED` and then cleans up in this order:

1. Deletes the remote issue branch, only while its head still equals the merged head. An already absent remote branch is clean and prints nothing.
2. Switches to the repository default branch and runs `git pull --ff-only origin <default>`.
3. Deletes the local issue branch with `git branch -D`, only while its head still equals the merged head.

On success it prints `#N: branch cleanup: deleted <branch> and fast-forwarded <default>`, and the next queued issue starts from the synced default branch. Bare re-entry on an already delivered issue branch runs the same cleanup.

Cleanup never changes the delivery result or the exit status; a cleanup warning is not a delivery failure. A remote warning (`#N: remote branch cleanup skipped: <reason>`) does not stop the local steps. A local refusal or failure (`#N: branch cleanup skipped: <reason>`) stops the remaining steps and keeps the local branch and any uncommitted changes. The remote deletion runs first, so a later local refusal can leave a local branch whose remote copy is already gone; the merged pull request holds the same commits.

| Line | Reason code | Meaning |
|------|-------------|---------|
| remote | `remote_head_mismatch` | The remote branch no longer points at the merged head, so it is not deleted |
| remote | `remote_head_unreadable` | The remote head could not be read, so it is not deleted |
| remote | `remote_delete_failed` | Deleting the remote branch failed |
| local | `worktree_dirty` | Changes exist outside `.nmg-sdlc/`, or the worktree status is unreadable |
| local | `local_head_mismatch` | The checked-out branch or HEAD differs from the merged head, or cannot be read |
| local | `default_branch_unreadable` | The repository default branch name could not be read |
| local | `default_checkout_failed` | Switching to the default branch failed |
| local | `pull_not_fast_forward` | `git pull --ff-only origin <default>` could not fast-forward |
| local | `local_branch_delete_failed` | The local issue branch is not at the merged head, or its deletion failed |

## Verification and terminal delivery

```text
/sdlc-verify-code #42
/sdlc-open-pr #42
```

Normally execute runs these stages. Use standalone verification only on an already-implemented issue branch; use standalone delivery only when that branch has valid verification evidence. Neither command replaces the approved issue/spec or publication gates.

Verification records identity-bound deterministic results in `.nmg-sdlc/verification/42.json` and a committed `verification-report.md` in the issue spec. Missing, duplicate, unknown, failed, incomplete, stale, or improperly skipped required results cannot pass. A project that deliberately declares zero validations has complete zero-result coverage, not an invented test pass. `PR Evidence Pending` is permitted only when local obligations pass and explicitly declared PR-only evidence remains.

Delivery rechecks immutable evidence at the exact head. It uses non-force pushes and retains both required and unfiltered checks. Missing, registering, queued, or pending required/declared checks—including `BLOCKED` attributable to that incomplete CI evidence—remain in an unbounded 30-second observation loop. Explicit check failure and proven human-review, mergeability, or non-CI policy blockers take their existing remediation or failure routes. Merge occurs only after a fresh exact-head snapshot has terminal-successful checks and `CLEAN` merge readiness. Unexpected PR/head identity is a reconciliation failure, not permission to open another PR or merge a different commit.

**Done means:** the persisted PR is `MERGED` at the persisted expected head, the GitHub issue is `CLOSED`, the delivery handoff is passed, and local default-branch synchronization/cleanup completes. An open PR, green local tests, or a printed success sentence proves less than that.

### Live smoke when developing nmg-sdlc

This repository registers the required `repository.nmg-sdlc-smoke` provider against `Nunley-Media-Group/nmg-sdlc-smoke`. It is **not** a mandatory dependency of every consumer project; consumer gates come from their own manifests.

1. Identify the nmg-sdlc behavior being proved and the observable success/failure conditions.
2. Run normal nmg-sdlc verification; no operator setup or selection is needed. Without an explicit queue, the provider clones the allowlisted smoke repository and provisions one fresh issue itself. It runs the real `/sdlc-draft-issue` with the manifest's `config.provision.need`, then `/sdlc-write-spec <N>`, in a provider-owned Herdr Claude pane launched with `NMG_SDLC_AUTOPILOT=1`, so every `AskUserQuestion` takes its Recommended option and every plan is approved. It ends provisioning once issue N has `spec-created` and a merged `docs: approve spec for #N` PR, then closes the pane. It then records linked-PR baselines and invokes this candidate's execute controller for that issue. A failed provisioning retains its clone and screen/session evidence; a retry of the same verification identity reuses the recorded issue instead of drafting another.
3. To prove specific issues instead, set `NMG_SDLC_SMOKE_ISSUES` to fresh explicit numbers with approved specs in the environment of the **nmg-sdlc controller/verification process** before launch (for example `export NMG_SDLC_SMOKE_ISSUES="65,66"`). Existing retained workers do not gain environment changes retroactively. Only the enclosing provider sets its nested-execution ownership marker; do not set `NMG_SDLC_SMOKE_OWNED` to bypass verification.
4. Accept success only with this invocation's pre-merge delivery proof, an exact matching PR that was not already merged at baseline, and closed issue evidence for each queued issue. An open PR left by an earlier receipt-less attempt may be resumed. When execute stops after delivering a leading part of the queue, rerunning the same verification resumes only the undelivered remainder in the retained clone under the same invocation; delivered issues keep their original receipts and are never dispatched again. Status output is not smoke proof.

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
| `.nmg-sdlc/controller.lock` | Exclusive controller identity |
| `.nmg-sdlc/handoffs/<N>-<step>.json` | Validated stage outcome and referenced evidence |
| `.nmg-sdlc/handoffs/<N>-<step>.json.waiting` | Worker is waiting on its own background command; the controller keeps its pane open |
| `.nmg-sdlc/verification/<N>.json` | Deterministic gate results, coverage, and identity |
| `.nmg-sdlc/prompt-provenance/` | Recorded prompt composition |
| `specs/<N>-<slug>/verification-report.md` | Durable acceptance and verification report |

- **Commands missing or controller paths unresolved:** check in `/plugin` that `nmg-sdlc` is installed and enabled (or that the session was started with `claude --plugin-dir <checkout>`); use a fresh session with the intended version, then apply project upgrades.
- **`Run /sdlc-… in the TUI.`:** an interactive command was run under `claude -p` or the SDK; run it in a Claude Code TUI session.
- **Herdr integration missing:** run `herdr integration install claude` and confirm with `herdr integration status`.
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
| `/sdlc-execute [--retain-worker] [--check-in-seconds N] [#N …]` | Run/resume the complete automated delivery queue under Opus supervision (branch-first ordinary resume) |
| `/sdlc-status [--json]` | Inspect lifecycle state without mutation |
| `/sdlc-verify-code #N` | Verify an already-implemented issue branch |
| `/sdlc-open-pr #N` | Deliver an already-verified issue branch through merge and closure |
| `/sdlc-run-retro` | Interactive retrospective from defect specs into project learnings |

`start-issue`, `write-code`, `simplify`, and `address-pr-comments` are internal workflow stages/guidance, not additional public slash commands. Interactive commands and `/sdlc-execute` are registered by the hooks module `hooks/register.ts`; the other automated commands are the plugin command files in `commands/`. Workflow bundles are rendered from the plugin's `workflows/` directory.

## Versioning and contribution gates

`VERSION` is the source of truth. Delivery synchronizes the version mirrors declared by the project's registered technical steering, not an assumed language-specific manifest. JSON/TOML mirrors use declared field paths; text mirrors require an unambiguous locator. In this repository the mirrors are `package.json` and `.claude-plugin/plugin.json`.

| Issue label | Default bump |
|---|---|
| `bug` | Patch |
| `enhancement` | Minor |
| Unmatched | Minor |

A major bump requires `**Version bump**: major` in approved requirements/design. An issue declaring `BREAKING` without that authorization fails closed. `[Unreleased]` changelog entries roll into the release heading during delivery.

Delivery also requires `CHANGELOG.md` with a `## [Unreleased]` heading. Onboarding creates it when absent, and `/sdlc-upgrade-project` proposes creating it for an onboarded project that lacks it. If `VERSION`, `CHANGELOG.md`, or that heading is missing, `prepare-version` fails with `version_artifact_missing` before it changes any file, and `/sdlc-execute` prints the reason with a summary naming what is missing.

The managed contribution gate correlates the current issue, singular spec identity, affected paths, steering alignment, verification evidence, and guide discoverability. Its documented reduced-evidence exceptions have path-validated predicates; they do not waive project CI or human review. Superseded rewrite-only behavior may use the explicit repository-rewrite contract, never a fabricated issue owner.

This repository's CI runs the script suite, plugin-surface validation, current-spec validation, and applicable workflow inventory checks. Local tests prove the source checkout; a fresh installed session proves installed discovery; actual consumer delivery proves smoke behavior. Keep those evidence layers separate.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for issue/spec ownership, steering, implementation, verification, and exact-head contribution delivery.

## License

MIT. See [LICENSE](LICENSE).
