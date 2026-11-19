# nmg-sdlc

Spec-driven delivery for Claude Code: GitHub issue → approved BDD spec → implementation → verification → exact-head merge → issue closure.

The plugin is stack-agnostic. Your project's registered steering supplies its product constraints, engineering conventions, version files, and verification commands. The plugin does not replace CI or human review.

## Prerequisites

Run from the root of the GitHub repository you intend to change.

| Requirement | Purpose / check |
|---|---|
| Node.js 20 or newer | Runs the packaged controllers, prompt renderer, and validation scripts; `node --version` |
| Claude Code with plugin hooks-module support | Interactive TUI, native plan mode, `AskUserQuestion`, `ExitPlanMode`, model/tool access, and plugin loading; `claude --version` |
| Git and an `origin` remote | Linked issue branches, commits, non-force pushes, default-branch synchronization |
| Authenticated GitHub CLI (`gh`) | `gh auth status`; account needs the repository permissions required to create issues/PRs, push branches, read checks, and merge |
| Configured project toolchain | Install the dependencies and tools used by the project's steering validations |

Interactive commands need a Claude Code **TUI** session. Under `claude -p` or the Agent SDK they print `Run /<command> in the TUI.` and exit 2, because headless sessions have no plan-mode or question tools (see [Headless runs](#headless-runs)). `/sdlc-execute` runs in a TUI session or headless under `claude -p` and needs no environment variables of its own.

Private-repository access must work for both Git transport and `gh`. A token with read-only access is not sufficient for delivery. Repository rules, required checks, and human-review permissions remain authoritative.

## Install and update

nmg-sdlc is published through the `Nunley-Media-Group/nmg-plugins` marketplace. In Claude Code:

```text
/plugin marketplace add Nunley-Media-Group/nmg-plugins
/plugin install nmg-sdlc@nmg-plugins
```

To update, refresh the marketplace with `/plugin marketplace update nmg-plugins` and update `nmg-sdlc` from the `/plugin` menu. Open a **fresh Claude Code session** after changing the installed plugin so the hooks module, command registration, and rendered workflows use the new version.
For development, load a local checkout directly instead of the installed copy:

```bash
claude --plugin-dir /absolute/path/to/nmg-sdlc
```

Stage subagents started by `/sdlc-execute` run with the supervising session's own plugins, so a controller and its stages always run the same plugin version. Before verifying a development candidate against a consumer project, start the controller session from that exact candidate; check `/plugin` to see which installation is active and avoid having an older installed copy and the checkout enabled at once.

Then, in every existing consumer project, run `/sdlc-upgrade-project` and approve the relevant migrations before further SDLC work (see [Upgrading from 3.x](#upgrading-from-3x)). For a project not yet using nmg-sdlc, use `/sdlc-onboard-project` first.

## Quick start

In a Claude Code TUI, from your project root:

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

### Automated commands and stage subagents

`/sdlc-execute` is registered by the hooks module like the interactive commands, so it runs as plain `/sdlc-execute`. It renders its workflow and submits it as your prompt without entering plan mode, because its controller mutates the repository. It also runs headless under `claude -p`, which delivers the queue to completion (see [Headless runs](#headless-runs)).

`/sdlc-execute` requires an Opus or Fable session, because that session supervises the workers. In a session on any other model, or one whose model cannot be read, it prints `/sdlc-execute requires an Opus session (current: <model>). Switch with /model opus and run /sdlc-execute again.` and stops before any Git or GitHub call.

`/sdlc-status`, `/sdlc-verify-code`, `/sdlc-open-pr`, and `/sdlc-verify-full` are plugin command files (`commands/*.md`). They expand in the TUI and under `claude -p`, and they never call `AskUserQuestion` or `ExitPlanMode`.

`/sdlc-execute` runs each delivery stage as a background subagent named `nmg-sdlc:execute-<entry>`. The hooks module starts it inside the supervising session, so it uses that session's plugins and gets its model and effort from `steering/sdlc-models.json` (see [Per-project stage models](#per-project-stage-models)).

The stage permission mode defaults to `auto`. Set `NMG_SDLC_WORKER_PERMISSION_MODE` in the controller's environment to `default`, `acceptEdits`, `auto`, `dontAsk`, or `bypassPermissions` to override it; any other value falls back to `auto`. Stage subagents inherit your Claude Code settings and permission rules, so a stricter mode can stop a stage at a permission prompt.

### Models

Every step runs on the Claude Code model suited to its workload, and your session model is never changed. Execute stage subagents run on the model and effort that `steering/sdlc-models.json` sets for their stage. The four command files declare `model`, and `effort` when set, in their frontmatter. For the six interactive commands, the hooks module rewrites the model of each main-loop request, including the turns the plugin submits for the command, such as the write-spec Continue prompt. `/sdlc-execute` is not rewritten: its supervisor runs on your Opus or Fable session model. Subagent requests and the effort setting of those commands are left alone.

| Step | Model | Effort |
|------|-------|--------|
| execute stage `start` | `start.model` in `steering/sdlc-models.json` (default `haiku`) | `start.effort` (default `default`, no flag) |
| execute stage `implement` | `implement.model` in `steering/sdlc-models.json` (default `opus`) | `implement.effort` (default `medium`) |
| execute stage `verify` | `verify.model` in `steering/sdlc-models.json` (default `opus`) | `verify.effort` (default `high`) |
| execute stage `deliver` | `deliver.model` in `steering/sdlc-models.json` (default `haiku`) | `deliver.effort` (default `xhigh`) |
| execute repair re-dispatch (`implement`, `verify`, `deliver`) | `repair.model` in `steering/sdlc-models.json` (default `opus`) | `repair.effort` (default `default`, no flag) |
| `/sdlc-status` | `haiku` | default |
| `/sdlc-verify-full` | `haiku` | default |
| `/sdlc-execute` (supervisor session) | your Opus or Fable session model | your setting |
| `/sdlc-open-pr` | `haiku` | `xhigh` |
| `/sdlc-verify-code` | `opus` | default |
| `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-onboard-project`, `/sdlc-upgrade-project`, `/sdlc-steering`, `/sdlc-run-retro` | `opus` | default |

A repair re-dispatch is the next implement, verify, or deliver worker after a recorded failure, other than `pr_evidence_pending` and `mergeability_reverification_required`. Once a stage passes, the next dispatch uses its stage model again. A hooks-registered command's model holds until you submit your own prompt or slash command (from the composer or Remote Control) or change the session model. The aliases always resolve to the current model of each tier. Execute stage and repair values come from the project file described in [Per-project stage models](#per-project-stage-models). The command models and efforts are fixed by the plugin, and "default" effort is your Claude Code effort setting.

### Per-project stage models

The model and effort of each execute stage and of the repair re-dispatch come from the committed project file `steering/sdlc-models.json`. `/sdlc-onboard-project` creates it with the plugin defaults. `/sdlc-upgrade-project` creates it when it is absent, or adds only the missing keys to a valid file. It also offers to move an entry that still holds an earlier plugin default (such as `implement` `haiku`/`xhigh`) to the current default, and changes it only when you approve. It never changes a value the project chose itself. The file is project-owned and is not registered in `steering/manifest.json`.

```json
{
  "version": 1,
  "start": { "model": "haiku", "effort": "default" },
  "implement": { "model": "opus", "effort": "medium" },
  "verify": { "model": "opus", "effort": "high" },
  "deliver": { "model": "haiku", "effort": "xhigh" },
  "repair": { "model": "opus", "effort": "default" }
}
```

Effort `default` passes no `--effort` flag, so the worker keeps your Claude Code effort setting. The other efforts are `low`, `medium`, `high`, `xhigh`, and `max`.

A model may be a Claude alias (`haiku`, `sonnet`, `opus`, `fable`, `opusplan`, `best`, or `sonnet[1m]`, `opus[1m]`, `fable[1m]`), a `claude-*` id, or a `provider/model` id such as nmg-router's `opencode-go/kimi-k3.1-pro`. A `provider/model` id is passed to `claude --model` verbatim. nmg-sdlc never checks whether it is logged in or available.

`/sdlc-execute` validates the file before any Git or GitHub call. Invalid JSON, an unknown top-level or entry key, a model in none of the accepted forms, or an effort outside the list above stops the run with exit status 2. The diagnostic names `steering/sdlc-models.json`, the key, and the value. An absent file, or a valid file that lacks some keys, uses the plugin default for each missing key. The controller then prints one warning per invocation that the file is missing or incomplete and that `/sdlc-upgrade-project` creates or completes it. The file never changes the models of slash commands or of the `/sdlc-execute` supervisor session.

### Runtime state

The plugin keeps runtime state in `.nmg-sdlc/` at the project root: `handoffs/`, `verification/`, `run.json`, `controller.lock`, `safe-recoveries.json`, `prompt-provenance/`, `plans/`, `execute/` (its `results/<uuid>.json` records hold headless run results; see [Headless runs](#headless-runs)), and `smoke-deliveries/`. Onboarding and upgrade add `.nmg-sdlc/` to `.gitignore`. These files are evidence and coordination state, never commit material.

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
- `steering/sdlc-models.json`: execute stage and repair models and efforts (see [Per-project stage models](#per-project-stage-models)). Onboarding creates it with plugin defaults when it is absent. Upgrade creates it when absent, adds only missing keys to a valid file, offers to move entries that still hold an earlier plugin default to the current defaults, and never changes a project-chosen value or rewrites an invalid file.
- `CONTRIBUTING.md` and its README link.
- The bounded spec-context section in root `CLAUDE.md`.
- `.github/workflows/nmg-sdlc-contribution-gate.yml`.
- `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`.
- The `.nmg-sdlc/` ignore rule. Start/execute may untrack previously committed runtime files without deleting their working-tree contents.

Do not replace user-authored assets or delete `.nmg-sdlc/` just to bypass a failed preflight.

### Upgrading from 3.x

nmg-sdlc 4.0 replaces the Oh My Pi extension with a Claude Code plugin. Projects and specs carry over unchanged; the host and runtime-state location change.

1. Install the plugin in Claude Code (see [Install and update](#install-and-update)). Remove the old Oh My Pi installation when you no longer need it.
2. In each consumer project, open a fresh Claude Code session and run `/sdlc-upgrade-project`. Its 4.0 migration groups, each approved separately, are:
   - `runtime-state-v4`: moves legacy `.omp/sdlc/` runtime state into `.nmg-sdlc/`. Byte-identical duplicates are dropped, the obsolete OMP-only `omp-controller.yml` paste configuration is deleted, and existing `.nmg-sdlc/` files are never overwritten; conflicts are preserved for you to resolve.
   - `nmg-sdlc-ignore`: adds the `.nmg-sdlc/` ignore rule.
   - `agents-v4-host-language`: rewrites the managed `AGENTS.md` structure comment from OMP task agents to Claude Code plugin subagents.
   - `steering-v4-host-language`: rewrites v3 host tokens in registered steering snippets and validations (`omp` to `claude`, `--print` to `-p`, `.omp/sdlc/` to `.nmg-sdlc/`) and `Oh My Pi` / `OMP` prose to `Claude Code`, through the shared steering writer.
   - `contributing-v4-host-language`: replaces the v3 sentence about driving `omp` worker panes in `CONTRIBUTING.md` with its Claude form.
   - `agents-to-claude-md`: moves root `AGENTS.md` to `CLAUDE.md` (a rename, or an append after one blank line into an existing `CLAUDE.md`); a symlinked file is skipped with `skipped:collision`.
   - `packaging-v4-claude-code-herdr`: reports leftover v3 OMP packaging references and the Claude Code install steps.
3. Hands-off drivers that answered OMP prompts by reading the pane drive an interactive Claude Code session the same way, for example in a detached tmux session; interactive commands do not run headless.

Interactive behavior maps one to one: OMP `ask` chips are `AskUserQuestion` questions, `xd://propose` is the plan-mode plan file plus `ExitPlanMode`, `omp --print` is `claude -p`, and `--kind omp` worker panes became `/sdlc-execute` stage subagents.

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
| `validations[]` | Required/optional deterministic gates and applicability conditions, with an optional `tier`, `heavy` marker, `concurrent` marker, test `selection` command and `fallbackPaths` (see [Validation tiers](#validation-tiers)) |
| `worktree` (optional) | A `setup` command run once in each new issue worktree, for example to create a virtual environment and install dependencies, and a `teardown` command run before a delivered issue worktree is removed; spec worktrees run neither |
| `changelog.fragments.dir` (optional) | Opts the project into changelog fragments: one file per issue (`<dir>/<N>.md`), assembled into `CHANGELOG.md` when that issue's version is prepared |
| `fullGreen.actions` (optional) | Downstream actions, such as `deploy`, that require a green full-tier record at or after the commit they act on |
| `steering/sdlc-models.json` | Project-owned execute stage models and efforts (see [Per-project stage models](#per-project-stage-models)); not registered in `steering/manifest.json` |
| `steering/test-layers.json` | Project-owned kept test types (see [Kept test layers](#kept-test-layers)); not registered in `steering/manifest.json` |

Use steering to state supported runtimes, commands, product boundaries, review policy, and declared version mirrors. Register a command's actual program, argument array, working directory, and required environment names. Do not put secrets into steering or shell-compose verification commands. Canonical validations have no wall-clock deadline; cancellation and confirmed process loss are distinct outcomes, not passes.

Every optional key is validated, and a manifest that declares none of them behaves as it did before they existed. `references/steering-schema.md` holds the exact shapes.

### Kept test layers

A spec's `feature.gherkin` scenarios are the single acceptance test layer: each acceptance criterion is tested once, by the implementation of its scenario. That implementation is either the scenario's step definitions or the test that the scenario's `# File:` header names and that cites the scenario's `@SCN` tag. The project-owned file `steering/test-layers.json` lists the test types the project keeps:

```json
{ "version": 1, "kept": ["bdd", "unit"] }
```

| Type | Meaning |
|------|---------|
| `bdd` | Scenario implementations: the acceptance layer, always kept |
| `unit` | Isolated tests of one module or function |
| `integration` | Tests of several modules or a real external boundary together |
| `property` | Property-based tests over generated inputs |
| `doc` | Documentation examples executed as tests |

A missing file means BDD-only, `{ "version": 1, "kept": ["bdd"] }`. A file whose `version` is not `1`, that has an unknown key, an unknown or duplicate type, an empty `kept`, or a `kept` without `bdd` is rejected, as are invalid JSON and a symlinked or non-regular file. The rejection names `steering/test-layers.json` and the offending field (for example `kept[1]`); an invalid file never falls back to the default. `/sdlc-write-spec` shows the `test_layers_invalid` diagnostic instead of rendering, and `/sdlc-execute` exits with status 2 and that diagnostic before any Git or GitHub call. When the file is valid at the invoking checkout but invalid in an issue's worktree, the run stops before that stage starts with `test_layers_invalid: steering/test-layers.json: …`. Only the four prompts below read the file, so other commands are not blocked by it. Standalone `/sdlc-verify-code` is a generated command file with no project rule rendered into it; its report reads `steering/test-layers.json` directly. The prompt-fragment id `project.test-layers` is reserved for this rule: a project snippet registered with that id fails every render that reads the rule with `duplicate_fragment_id`.

The plugin renders one Kept Test Layers rule, naming exactly the kept types, into the `/sdlc-write-spec`, implement worker, verify worker and `/sdlc-verify-code` prompts:

- **write-spec** tasks only the scenario implementations (plus the production seams their steps need), never a separate test that restates an AC. Variations of one AC are a `Scenario Outline` with `Examples` under that AC's single `@SCN` tag.
- **implement** writes the scenario implementations. Any other test must be of a kept type, cover a behavior no scenario covers, and be listed in the handoff's `justifiedTests` with its type and justification.
- **verify** reports, per AC, the covering scenario and its implementation status, and flags each branch test that duplicates a scenario or has a type the project does not keep. It reports no per-layer test counts, and its testability score rewards injectable seams and scenario coverage, not unit-test volume.

### Validation tiers

By default every required validation runs before merge. A project whose full suite is too slow for every verify cycle can split its validations:

| Key | Meaning |
|---|---|
| `"tier": "change"` | Required before merge. Runs in the verify gate |
| `"tier": "full"` | Not required before merge. Recorded as skipped by the gate, and run on demand by `/sdlc-verify-full` |
| `"heavy": true` | The validation takes a slot from the machine-wide heavy-job pool before it runs |
| `"concurrent": true` | Once the required `builtin.command` validations have run (always one at a time), every applicable flagged validation starts together, so the batch takes about as long as its slowest member. Unflagged validations run one at a time. A failure does not cancel the others, a heavy one still waits for a pool slot, and results stay in manifest order |
| `"selection"` | On a `change`-tier `builtin.command` validation: a project command (`{ program, args, cwd?, env? }`) that receives the changed paths and base ref and returns the tests to run |
| `"fallbackPaths"` | On the same kind of validation: globs that force the full command when a changed path matches one |

```json
{
  "id": "repository.tests", "provider": "builtin.command", "required": true, "tier": "change", "heavy": true,
  "when": { "kind": "always" },
  "config": { "program": "pytest", "args": [], "cwd": ".", "env": [] },
  "selection": { "program": "python", "args": ["tools/select_tests.py"] },
  "fallbackPaths": ["pyproject.toml", "conftest.py", "tools/**"]
}
```

The selection command is yours: the plugin implements no language-specific selection. It reads `{ "schemaVersion": 1, "validationId", "baseRef", "changedPaths" }` on stdin and prints `{ "schemaVersion": 1, "mode": "selected" | "all", "tests": [...], "dataStatus": "fresh" | "stale" | "missing", "dataAgeSeconds": <number or null> }`. The selected tests are appended to the validation's `args`. The validation runs its full command when the change touches a fallback path (`fallback_path`), when the command answers `all` (`selection_all`), fails or prints something malformed (`selection_failed`), or reports its data stale or missing (`selection_data_stale`, `selection_data_missing`); an empty selection passes without running anything (`selection_empty`). Each result in `.nmg-sdlc/verification/<N>.json` records `tier`, `selection` (`{ provider, reason, fallbackPath, selectedCount, dataAgeSeconds }`) and, for a heavy validation, `heavy` (`{ slot, waitedMs }`).

The heavy-job pool is shared by every project and session on the machine. Its size is `heavyJobSlots` in `~/.nmg-sdlc/config.json` (default 1); there is no environment variable for it. A slot whose holder process is dead is reclaimed, including when its process id now belongs to a later, unrelated process. Workers put their own heavy commands through the same pool with `node scripts/sdlc-heavy-pool.mjs run --label <label> -- <program> [args...]`, and `node scripts/sdlc-heavy-pool.mjs list` prints the holders.

Full-tier validations run through `/sdlc-verify-full`, which is suitable for a schedule:

```text
/sdlc-verify-full main
/sdlc-verify-full check --action deploy --commit <sha>
```

A run checks the ref (the remote default branch when none is given) out in a temporary worktree, runs the `full` validations there and records the result (`passed`, `failed` or `incomplete`) for that commit under the repository's git common directory. A run that did not pass lists `sinceLastGreen`, the first-parent commits since the last green full run, or `reason: "no_green_record"` when there is none. `check` answers `green: true` only when a passed full record exists at or after the commit, and requires both `--action` and `--commit`; an action that steering does not list in `fullGreen.actions` fails with `full_green_action_unknown`. A deploy script can call `node scripts/sdlc-verify-full.mjs check --action deploy --commit <sha>` and act on its exit status: 0 green, 1 not green, 2 unknown action.

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

Spec work has its own branch namespace and its own worktree. The spec for issue `{N}` is written and published on `spec/{N}-{slug}`, in a worktree created from the remote default branch, so it can never share a branch or a pull request with the code branch `{N}-{slug}`: a spec PR and a code PR for the same issue can be open together, and spec publication never looks at, or merges, the code PR. `merge` refuses with `pr_scope_invalid` when the spec PR changes a file outside `specs/{N}-{slug}/`. The checkout you ran the command in is never switched and need not be clean.

If GitHub merges the exact spec PR but its CLI exits nonzero, the helper independently verifies the same PR's merged state, head, and branch/base identity. A proven merge reports its PR, `issue`, `dir`, and `merged: true`, and labeling continues. After the merge the helper deletes the remote spec branch, removes the spec worktree and its local branch, and fast-forwards the primary checkout when it is on the default branch and has no local changes; each of these is best-effort and none can fail the publication. Re-running publication recognizes the merged PR rather than creating or merging another. Unreadable or contradictory remote evidence never counts as publication.

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

Each issue is worked in its own git worktree, so the checkout you run the command in is never switched to an issue branch and does not have to be clean. Only a checkout that is already on the issue's branch is used in place. The controller never stashes, discards, resets, or force-pushes your changes. Several `/sdlc-execute` and `/sdlc-write-spec` sessions can run at once in one repository; see [Parallel delivery](#parallel-delivery).

An explicit different issue on a dirty or other active feature branch is not a conflict: that branch is left exactly as it is and the selected issue runs in its own worktree. A live exact-head MERGED PR with issue CLOSED is complete.

### Branch-first resume and four-stage execution

Branch content and live verification/PR results are authoritative. Bare `/sdlc-execute` on recognized issue branch selects immediately and resumes from current state: verify existing impl if present (skip implement on clean passing); dirty/partial permitted branches implement/publish first.

On non-issue, explicit #N use start-issue then proceed; bare offers picker.

Four stages: start (when necessary), implement, verify, deliver. Implement maps every Approved Acceptance bullet to satisfied/remaining before editing (preserve partials; do not reset completed). Handoff from implement is verify.

Successful implement always hands off next=verify.

### Stage sequence

| Stage | What must finish before advancement |
|---|---|
| `start` | Resolve the executable issue (when necessary), establish its linked branch in its own worktree (created from the remote default branch, or reused), safely reconcile an approved squash-merged spec branch with default, synchronize the exact head upstream, and bind that head in the controller before implement |
| `implement` | Map every Approved Acceptance bullet before editing (do not reset completed work); complete approved tasks, simplify without changing behavior, machine-check conventional commit subject with #N, commit/push; clean tree/upstream. Handoff next=verify |
| `verify` | Two dispatches. **Review**: complete the review checklist (every AC, FR, design error/state path, and consumer of anything the change adds) through three lenses, with no validation run; every finding goes back to implement in one handoff. **Gate**: at the head of the merge queue, with the default branch integrated and the version prepared, run the registered pre-merge validations once at the exact source HEAD (incl. required smoke); truthful report. Full green (Pass) or PR Evidence Pending advances to deliver. Fail/Partial/Incomplete leave the queue and route back to implement for repair, then re-verify |
| `deliver` | Synchronize release artifacts, create/resume the exact PR, handle eligible automated feedback, prove required checks at exact head, merge, prove issue closure |

Each stage runs as a background stage subagent (`nmg-sdlc:execute-<entry>`) that the hooks module starts inside the supervising session (see [Automated commands and stage subagents](#automated-commands-and-stage-subagents)). Execute owns orchestration, not product edits in the supervising session. Worker success is determined by validated handoffs, not terminal prose or an exit code alone. Only host-captured final assistant output supplies findings.

### Completion goal

Before its first `supervise` call, `/sdlc-execute` sets a Claude Code `/goal` that names every queued issue in run order. The goal is met when the session's replies show `#N: MERGED and CLOSED` for each issue, or a `/sdlc-execute stopped: <diagnosis>` line for a halt or a non-remediable controller exit. A run whose goal cannot be set prints `/sdlc-execute stopped: goal_unavailable: <reason>`, and the hooks module refuses every `supervise` call for that run. A run that selects no issues sets no goal. Use `/goal` to see the goal's status and `/goal clear` to stop it.

### Supervision

The `/sdlc-execute` session supervises every stage. `sdlc-execute.mjs supervise` prints `NMG_SDLC_EXECUTE_SESSION: <uuid>` first. The controller runs detached and reports when each stage settles and while a stage runs. It prints `NMG_SDLC_EXECUTE_WORKER` while a stage subagent is running; that line means the supervising session ends its turn, and reports then arrive as prompts to that session. The controller keeps its lease and failure history across those turns.

- **Stage report**: sent when a worker writes its handoff or settles without one, before the next stage starts. It names the issue, stage, and subagent. It gives the handoff, source HEAD before and after, and the commits added, with any changed paths outside the spec's declared files. It also gives the registered gate status and recent failure history. After verify it adds the readiness `status`, `reasonCode`, and `gaps`, plus the report's critical and remaining issues. The supervisor answers `accept` (continue with the existing routing), `prompt` (send guidance to the live stage subagent and await its fresh handoff), `redispatch` (start the stage again with guidance beside the failure evidence), or `halt` (stop non-zero with a diagnosis and release the lease). The controller holds the report until the worker tracks no background command and the git index is unlocked, so `headAfter` and `commits` include commits the worker landed in the background. A `prompt` the worker cannot take, or that does not start a new turn within 60 seconds, is reported on the next stage report as `promptRefusal` with reason code `stage_prompt_undelivered` or `stage_prompt_not_resumed`; that report does not offer `prompt`.
- **Check-in report**: sent as a prompt every check-in interval without a handoff (default 300 seconds, that is 5 minutes; set `--check-in-seconds N`). The prompt carries an `activity` object with the stage subagent's status, its recent tool calls, its latest transcript text, and the seconds since its last activity; the stage keeps running. A stage whose activity stays unchanged for the interval is reported as `activity_unchanged`, except while a background command it started is still running; the report then names that command and its elapsed seconds in `activity.background`. The report also gives the time since dispatch, commits since dispatch, and failure history. The supervisor answers `continue`, `prompt` (queued until the stage subagent's current tool call finishes), `redispatch`, or `halt`.

At any stage, on a stage report, a check-in report, or after a non-report controller exit, the supervisor takes any action that is safe, reversible, and moves the issue toward delivery, without asking you, even when it is not on the examples list. Safe and reversible means it changes no tracked repository file, loses no work or data that cannot be regenerated, and touches no shared or production system. Examples include restarting the container runtime or a stopped host service, stopping a hung test or build process the run started, excluding untracked `.nmg-sdlc/` runtime in `.git/info/exclude`, waiting for a transient GitHub failure to clear and then rerunning `supervise`, and freeing regenerable caches when the disk is full. After such an action the supervisor continues with `prompt`, `redispatch`, or a rerun of `supervise`. It halts only when you must act: a login or credential you must enter interactively, a product or spec decision, a destructive or shared-system action, or a blocker that remains after a different remediation. A hung process is diagnosed rather than answered with another `continue`. Any re-dispatched stage is held to the same full registered gate at the exact source head. No decision skips routing, publication checks, version preparation, or the full-green gate. Accepting a non-green verify routes to implement, never to deliver. The supervisor never edits product code, specs, or other tracked files, implements tasks, commits, pushes, opens PRs, or bypasses branch protection or required checks. If the supervising session ends, the controller halts and releases its lease.

Every execute stage subagent is told never to switch the shared checkout's branch or move HEAD to read another ref. Stage subagents use `git show <ref>:<path>`, `git diff <ref>...HEAD`, or a separate worktree instead. The headless path in [Headless runs](#headless-runs), which the smoke gate uses, runs delivery to completion in one call.

A worker's turn can end while a background command it started is still running, such as the registered gate. In that case the worker first writes `.nmg-sdlc/handoffs/<N>-<step>.json.waiting`, and the controller keeps the stage open until the subagent resumes. A worker that settles with neither a handoff nor that marker gets one reminder, and the controller waits up to 60 seconds for its resumed turn to start and settle before it counts as stopped. Each verify dispatch is recorded in `.nmg-sdlc/execute/gate-intent/<N>.json` until its report is answered, so a controller restarted during a verify rerun at an unchanged head resumes verify instead of repairing from the older failed result. A branch with no commits relative to the default branch is implemented before it is verified, and a verify worker that stops without a handoff is retried as verify.

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
/sdlc-execute --check-in-seconds 600 #42
```

On the exact incomplete issue branch, run bare `/sdlc-execute` to resume ordinary from the branch and live evidence. No issue tokens or recovery flag required. Completed stages skipped when evidence passes; partial work preserved.

Cancel the owning execute job through the host's cancellation surface or send it SIGINT/SIGTERM. The supervisor terminates only this invocation's controller process group and its stage subagents. It leaves other sessions and processes, partial work, and historical runtime files untouched; the next invocation derives its stage from branch and live verification/PR evidence. Under supervision, stop a run with a `halt` decision; SIGINT or SIGTERM on the supervising `supervise` call also cancels it through the same supervisor.

`--retain-worker` is removed and rejected by `/sdlc-execute`. `--check-in-seconds N` remains and sets the check-in interval.

### Headless runs

`/sdlc-execute` also runs under `claude -p`, so a script or CI job can deliver issues without a TUI:

```bash
claude -p --session-id <uuid> --plugin-dir <nmg-sdlc checkout> --model opus "/sdlc-execute #42"
```

Choose the UUID yourself and keep it. The run delivers the queue to completion, and its last output lines are the final result: `#42: MERGED and CLOSED` for each delivered issue, or `/sdlc-execute stopped: <diagnosis>`. Like the TUI command, it runs on an Opus or Fable session model, so keep `--model opus`. It runs unsupervised to completion and applies the same full-green gate and merge rules as the TUI.

To print the recorded lines again and get the controller's exit status, resume the same session:

```bash
claude -p --resume <uuid> "/sdlc-execute --result"
```

The result record is `.nmg-sdlc/execute/results/<uuid>.json`.

### Post-delivery branch cleanup

When the controller proves an issue delivered on its own issue branch (exact-head merged pull request and issue `CLOSED`), it prints `#N: MERGED and CLOSED` and then cleans up in this order:

1. Deletes the remote issue branch, only while its head still equals the merged head. An already absent remote branch is clean and prints nothing.
2. Switches to the repository default branch and runs `git pull --ff-only origin <default>`. This applies to an issue branch that was worked in place in the primary checkout; an issue worked in its own worktree has that worktree removed instead (see [Parallel delivery](#parallel-delivery)).
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

### Parallel delivery

Sessions for different issues do not share a checkout, do not revalidate against a default branch that is about to move, and do not compete for a version.

**Worktrees.** `/sdlc-execute #N` and `/sdlc-write-spec #N` each create, or reuse, a dedicated worktree beside the primary checkout (`<primary-parent>/<repo-name>-wt/<N>` for code and `spec-<N>` for specs, or under `NMG_SDLC_WORKTREES_DIR`). The issue's handoffs, verification records and controller lease live in that worktree's `.nmg-sdlc/`. Repository-wide state lives under the git common directory (`<git-common-dir>/nmg-sdlc/`), where every worktree and session sees it: the merge queue, the in-flight issues and the full-verification records. When steering declares a worktree `setup` command it runs once in a new issue worktree (spec worktrees run neither `setup` nor `teardown`); a failed setup stops the start with `worktree_setup_failed` and runs again on the next attempt. After delivery the controller deletes the remote branch, removes the worktree and its local branch, and fast-forwards the primary checkout when it can; that fast-forward is best-effort and never a failure. No step checks out the default branch in a worktree. A crashed or abandoned run leaves its worktree in place: rerun `/sdlc-execute #N` to resume it, and `/sdlc-status` lists it.

**Review first.** Verify reviews before it validates. The review must give a verdict to every row of a checklist built from the spec: each acceptance criterion, each functional requirement, each error and state path the design names, and each consumer of any identifier, job name or contract the change introduces or extends. Its finalizer refuses to write a handoff while any row is blank (`review_checklist_incomplete`), and names the blank rows. All findings go back to implement in one handoff (`review_findings`) when any of them is `blocking`, `major` or `minor`, or any row is `fail` or `partial`; only `info` notes leave a review passed, and no validation runs for a change whose review handed back. After a repair, verify re-checks the listed findings and the repair diff, and repeats the full review only when the repair touched files outside the findings' scope (`node scripts/sdlc-review-scope.mjs --issue N` prints which). The review record (`.nmg-sdlc/verification/<N>-review.json` and `.md`) and the handoff name, in `mockedEntryPoints`, any criterion whose tests mock the path the criterion is about.

**Merge queue.** A branch whose review passed enters the repository's merge queue. Only the queue head integrates: the controller merges the current default branch into the branch, prepares the version, runs the pre-merge validations on that result, and merges. Every other entry waits (`#N: queued at position 2 behind #41`) and runs no validation until the head has merged or left, so each branch runs its pre-merge validations once, against the default branch it merges into. Waiting entries poll every 5 seconds. A merge conflict confined to `VERSION` and `CHANGELOG.md` is resolved to the default branch's content, and the branch's own `[Unreleased]` changelog bullets that the default branch lacks are added back under their category (`#N: integration took origin/<base> for <files>[ and kept K branch changelog entries]`). A head whose validations fail (`queue_gate_failed`), or whose integration conflicts anywhere else (`queue_integration_conflict`), leaves the queue, reverts the version commit it prepared, and returns to implement with that evidence; the next entry proceeds. An entry whose controller process has died is dropped. `node scripts/sdlc-merge-queue.mjs list | position --issue N | enqueue --issue N --branch B | dequeue --issue N` reads and repairs the queue by hand. This is the plugin's own queue, not GitHub's hosted merge queue.

**Versions and the changelog.** The version is prepared at the queue head, not when implement is accepted, so two branches never claim the same version. A project that opts into changelog fragments (`changelog.fragments.dir` in `steering/manifest.json`) has each issue write one file there, `<dir>/<N>.md`, instead of editing `CHANGELOG.md`; preparing issue N's version assembles only that file into the changelog, and deletes it, in the version commit, so in-flight branches never conflict on it.

**Overlaps.** When the controller starts an issue it compares the files that issue's spec declares with those of the repository's in-flight issues and reports each overlap (`#N: overlaps in-flight #M (<branch>) on <files>`), in its output and in every supervised report, so the supervisor can sequence them.

**Heavy jobs.** Validations marked `heavy`, and worker commands run through `sdlc-heavy-pool.mjs`, share one machine-wide pool across all projects and sessions (see [Validation tiers](#validation-tiers)).

After delivery from a worktree the cleanup lines read `#N: worktree cleanup: removed <branch> and fast-forwarded <default>`, or `#N: worktree cleanup skipped: <reason>` (`worktree_dirty` keeps a worktree that has uncommitted changes; `run_inside_worktree` keeps a worktree the run itself was started in).

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
2. Run normal nmg-sdlc verification; no operator setup or selection is needed. Without an explicit queue, the **verify worker** provisions the smoke issue before it runs the registered gates, as this repository's `project.smoke` steering snippet (`steering/snippets/project-smoke.md`, routed only to `worker:verify`) directs. It reuses the issue recorded in `.nmg-sdlc/smoke/provisioned.json` while that issue is open and undelivered. Otherwise it clones the smoke repository, starts an interactive `claude --plugin-dir <checkout>` session in a detached tmux session, runs the real `/sdlc-draft-issue` with the manifest's `config.provision.need` and then `/sdlc-write-spec #N`, and answers each question and plan dialog itself by reading the pane. Once N has `spec-created` and a merged `docs: approve spec for #N` PR, it ends the tmux session, removes the clone, and writes the record. The provider itself never drafts an issue or writes a spec: it delivers the recorded issue, and a missing, invalid or stale record fails with `nmg-sdlc-smoke smoke issue not provisioned`. It records linked-PR baselines and runs `/sdlc-execute` for that issue in a headless `claude -p --session-id <uuid> --plugin-dir <candidate>` session, reading the controller status from that session's result record. `tmux` is required only on machines that verify nmg-sdlc itself.
3. To prove specific issues instead, set `NMG_SDLC_SMOKE_ISSUES` to fresh explicit numbers with approved specs in the environment of the **nmg-sdlc controller/verification process** before launch (for example `export NMG_SDLC_SMOKE_ISSUES="65,66"`). A session that is already running does not gain environment changes retroactively. Only the enclosing provider sets its nested-execution ownership marker; do not set `NMG_SDLC_SMOKE_OWNED` to bypass verification.
4. Accept success only with this invocation's pre-merge delivery proof, an exact matching PR that was not already merged at baseline, and closed issue evidence for each queued issue. An open PR left by an earlier receipt-less attempt may be resumed. When execute stops after delivering a leading part of the queue, rerunning the same verification resumes only the undelivered remainder in the retained clone under the same invocation; delivered issues keep their original receipts and are never dispatched again. Status output is not smoke proof.

The provider keys a retained clone to the current outer verification identity and explicit queue. It reuses that invocation's pre-merge receipt and remote proof after a lost or failed controller result; it never treats nested `run.json`, a recovery ledger, status output, or an old merged PR as delivery proof. A failed attempt with no pre-merge receipt is superseded only when the plugin candidate tree or registered steering identity changes, so an unchanged failure is not replayed.

Smoke is a **plugin experiment**, not a second repair backlog. Change smoke code only when it is a necessary fixture or means to prove a named nmg-sdlc change. Classify a failure before editing: repair confirmed plugin defects in nmg-sdlc; record unrelated smoke-project defects without fixing them. Stop unchanged/no-progress failures. A new attempt requires a concrete changed plugin fix or hypothesis and its expected observation—not the hope that rerunning will pass. Do not repeatedly create fresh issues, weaken assertions, recycle consumed evidence, or repair unrelated smoke code to manufacture a green gate.

## Status and troubleshooting

```text
/sdlc-status
/sdlc-status --json
```

Status is read-only: current branch/spec, verification, GitHub issue/PR state, and recommended next action. It also lists, for the repository, each in-flight issue with its stage and merge-queue position, the queue itself, and worktrees under the worktree root left by crashed or abandoned runs; and for the machine, the in-flight issues of other repositories and the heavy-job slot holders. The text output shows this in a `Parallel:` block, and `--json` carries it under `parallel` (`repository.worktreeRoot`, `repository.inFlight[]`, `repository.queue[]`, `repository.leftoverWorktrees[]`, `host.heavyJobSlots`, `host.holders[]`, `host.inFlight[]`). Inspect the exact evidence before repairing:

| Artifact | Purpose |
|---|---|
| `.nmg-sdlc/controller.lock` | Exclusive controller identity for that checkout (each issue worktree has its own) |
| `.nmg-sdlc/verification/<N>-review.json`, `<N>-review.md` | The verify review checklist: every row's verdict, the lenses, and every finding |
| `<git-common-dir>/nmg-sdlc/merge-queue.json`, `in-flight/` | The repository's merge queue and in-flight issues, shared by all worktrees |
| `<git-common-dir>/nmg-sdlc/full-verification/<sha>.json` | Full-tier verification result per commit |
| `~/.nmg-sdlc/heavy-jobs/slot-<k>.lock`, `~/.nmg-sdlc/config.json` | The machine-wide heavy-job slots and pool size, `heavyJobSlots` (`NMG_SDLC_HOST_STATE_DIR` relocates the directory) |
| `.nmg-sdlc/handoffs/<N>-<step>.json` | Validated stage outcome and referenced evidence |
| `.nmg-sdlc/handoffs/<N>-<step>.json.waiting` | Worker is waiting on its own background command; the controller keeps the stage open until the subagent resumes |
| `.nmg-sdlc/verification/<N>.json` | Deterministic gate results, coverage, and identity |
| `.nmg-sdlc/prompt-provenance/` | Recorded prompt composition |
| `specs/<N>-<slug>/verification-report.md` | Durable acceptance and verification report |

- **Commands missing or controller paths unresolved:** check in `/plugin` that `nmg-sdlc` is installed and enabled (or that the session was started with `claude --plugin-dir <checkout>`); use a fresh session with the intended version, then apply project upgrades.
- **`Run /sdlc-… in the TUI.`:** an interactive command was run under `claude -p` or the SDK; run it in a Claude Code TUI session.
- **`steering/sdlc-models.json:` diagnostic:** `/sdlc-execute` stopped before any Git or GitHub call because the stage configuration is invalid. Fix the key and value the diagnostic names (see [Per-project stage models](#per-project-stage-models)), then rerun.
- **`steering/test-layers.json:` diagnostic or `test_layers_invalid`:** the kept-test-types file is invalid. Fix the field the diagnostic names (see [Kept test layers](#kept-test-layers)), then rerun.
- **`Warning: steering/sdlc-models.json is missing …`:** plugin default stage models are in use. Run `/sdlc-upgrade-project` to create the file or add its missing keys.
- **No eligible issue / unapproved spec:** finish issue/spec publication and inspect official blockers; do not manually apply labels as a substitute for approval.
- **Dirty tree / branch mismatch:** a dirty primary checkout is not an obstacle, because each issue runs in its own worktree. Inside an issue worktree, preserve the work and restore the correct issue context. Do not reset or stash unrelated changes automatically.
- **`NMG_SDLC_REVIEW_REFUSED`:** the verify review left a checklist row, lens or finding unevaluated (`review_checklist_incomplete`). The output names each one; evaluate them and finalize again.
- **Queued and not moving:** `/sdlc-status` shows the queue head. The head must merge or leave before the next entry validates; an entry whose controller has died is dropped the next time another branch enters or polls.
- **Leftover worktree:** rerun `/sdlc-execute #N` to resume it, or remove it with `node scripts/sdlc-worktree.mjs remove --branch <branch>` once its work is no longer needed.
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
| `/sdlc-execute [--check-in-seconds N] [#N …]`, `/sdlc-execute --result` | Run/resume the complete automated delivery queue under Opus supervision, in the TUI or headless under `claude -p` (branch-first ordinary resume); `--result` prints a headless run's recorded result |
| `/sdlc-status [--json]` | Inspect lifecycle state without mutation |
| `/sdlc-verify-code #N` | Verify an already-implemented issue branch |
| `/sdlc-open-pr #N` | Deliver an already-verified issue branch through merge and closure |
| `/sdlc-verify-full [REF]`, `/sdlc-verify-full check --action NAME --commit REF` | Run the full-tier validations against a ref (the remote default branch when omitted) and record the result per commit, or answer whether a commit is full-green for a steering-named action |
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
