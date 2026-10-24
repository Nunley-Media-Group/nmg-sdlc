# nmg-sdlc 4.0 Repository Rewrite Contract

**Release**: 4.0.0
**Runtime**: Claude Code
**Orchestration**: Herdr Claude workers
**Exception**: `repository-rewrite`

This is the owner-approved current capability contract for the breaking 4.0.0 cutover from Oh My Pi to Claude Code. It is not an executable issue spec and does not claim a synthetic GitHub issue. Ordinary feature and bug delivery continues to use singular `specs/{N}-{slug}/` packages. Superseded issue specs, and the 3.1.0 rewrite contract this one replaces, remain available in Git history and are intentionally absent from the working tree.

The 4.0.0 cutover follows the 3.1.0 repository-rewrite precedent instead of an approved `**Version bump**: major` spec line: the host change touches every public surface at once and has no single issue owner. Every capability below keeps its 3.x behavior; only the host mechanics change (Claude Code plugin, hooks module, `AskUserQuestion`, `ExitPlanMode`, Herdr Claude workers, `.nmg-sdlc/` state).

The machine-readable source is `references/rewrite-contract.json`. The numeric BDD archive retains only capabilities with genuine matching GitHub issue owners; new rewrite-only behavior is documented here until a future executable issue changes it.

## Address Pull Request Comments (`address-pr-comments`)

Resolve eligible automated review threads while preserving human ownership and exact-head safety.

- Surface: `automated review remediation stage`
- Sources: `workflows/address-pr-comments/`
- Verification: `scripts/__tests__/open-pr-delivery-contract.test.mjs`

Acceptance:

- Given an unresolved automated-review thread with an actionable finding, when remediation runs, then the source is fixed and verified before reply and resolution.
- Given an ambiguous or human-authored thread, when encountered, then it remains unresolved and delivery returns intervention.
- Given a fix changes the head, when review continues, then the updated exact head is pushed and rechecked.
- Given no eligible findings remain, when the stage completes, then control returns to open-pr.

## Contribution Evidence Gate (`contribution-gate`)

Validate a connected issue, spec, steering, changed-path, and verification evidence graph with narrow documented exceptions.

- Surface: `managed pull-request workflow`
- Sources: `.github/workflows/nmg-sdlc-contribution-gate.yml`, `references/contribution-gate.md`, `CONTRIBUTING.md`
- Verification: `scripts/__tests__/contribution-gate-contract.test.mjs`, `scripts/__tests__/exercise-contribution-gate.test.mjs`

Acceptance:

- Given normal feature or bug work, when the PR gate runs, then the current issue and singular matching spec are required.
- Given documentation-only work, when the documented marker and path predicate hold, then only the defined evidence is reduced.
- Given a full breaking repository rewrite, when the repository-rewrite marker, feat!: title, contract paths, current specs, path mapping, steering, and verification all hold, then historical issue identity alone is waived.
- Given quoted, hidden, unrelated, or incomplete evidence, when evaluated, then it remains inert and produces actionable failures.
- Given onboarding or upgrade, when the managed workflow is installed, then version 5 is reconciled without overwriting unmanaged or newer workflows.

## Draft Issue (`draft-issue`)

Interview for a feature or bug and create one executable GitHub issue with BDD acceptance criteria.

- Surface: `/sdlc-draft-issue`
- Sources: `workflows/draft-issue/`
- Verification: `scripts/__tests__/exercise-issue-form.test.mjs`

Acceptance:

- Given an initial need, when drafting begins, then the workflow gathers only material missing decisions through bounded interactive gates.
- Given approved issue text, when publishing, then exactly one feature or bug issue is created with testable BDD acceptance criteria.
- Given the issue is created, when the workflow completes, then /sdlc-write-spec #N is the next action.

## Execute SDLC with Herdr Claude Workers (`execute`)

Orchestrate approved issue delivery through isolated sibling Herdr Claude workers.

- Surface: `/sdlc-execute [#N ...]`
- Sources: `workflows/execute/`, `scripts/sdlc-execute.mjs`, `agents/`
- Verification: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`

Acceptance:

- Given issue numbers or a ready backlog, when execute starts in the main Herdr pane, then each issue runs through start, implement, verify, and deliver stages.
- Given a worker stage, when launched, then the orchestrator supplies explicit #N context and uses a sibling Herdr --kind claude session.
- Given a worker launch, when the controller starts the Herdr agent, then it passes --plugin-dir for the controller's own plugin root and --permission-mode from NMG_SDLC_WORKER_PERMISSION_MODE when that names a supported mode, else auto.
- Given a failed handoff, when a stage ends, then execution stops with intervention instead of silently continuing.
- Given one issue merges, when more work remains, then the default branch is synchronized before the next issue starts.
- Given the orchestrator is running, when product edits are needed, then those edits remain delegated to the owning worker.

## Claude Code Plugin Surface (`claude-code-plugin`)

Package nmg-sdlc as a Claude Code plugin whose hooks module enters native plan mode for interactive commands and whose command files expand automated commands in the TUI and under claude -p.

- Surface: `Claude Code plugin load`
- Sources: `.claude-plugin/plugin.json`, `hooks/`, `src/`, `commands/`
- Verification: `scripts/__tests__/extension-commands.test.mjs`, `scripts/__tests__/interactive-gates-contract.test.mjs`, `scripts/__tests__/plugin-surface-verification.test.mjs`

Acceptance:

- Given Claude Code loads the plugin, when a session starts, then hooks/register.ts registers the six interactive /sdlc-* commands.
- Given an interactive command runs in the TUI, when it starts, then the hooks module runs builtin /plan and submits the rendered workflow as the person's prompt; without a UI it prints Run /<command> in the TUI. and exits 2.
- Given the TUI or claude -p, when an automated /sdlc-* command runs, then its commands/ file expands the owning workflow with ${CLAUDE_PLUGIN_ROOT} in place of <plugin-root>.
- Given write-spec Finished is selected, when the reply ends with ExitPlanMode, then the hooks module approves that one call and plan mode ends without a dialog.
- Given NMG_SDLC_AUTOPILOT=1 in the session environment, when a plan or question gate is reached, then the hooks module approves ExitPlanMode and answers AskUserQuestion with each question's Recommended option.

## Onboard Project (`onboard-project`)

Initialize greenfield or reconcile brownfield projects with current steering, spec, contribution, and Claude Code plugin contracts.

- Surface: `/sdlc-onboard-project`
- Sources: `workflows/onboard-project/`
- Verification: `scripts/__tests__/exercise-contribution-gate.test.mjs`, `scripts/__tests__/steering-contract.test.mjs`

Acceptance:

- Given project contents, when onboarding starts, then it distinguishes initialized, greenfield, greenfield-enhancement, and brownfield modes.
- Given a greenfield project, when approved, then steering, specs, contribution guidance, and managed workflows are created from current templates.
- Given a brownfield project, when approved, then history informs reconciliation without inventing ambiguous ownership.
- Given an already initialized project, when detected, then /sdlc-upgrade-project is recommended instead of duplicating setup.

## Open and Merge Pull Request (`open-pr`)

Deliver one verified issue through exact-head pull-request merge and issue closure.

- Surface: `/sdlc-open-pr #N`
- Sources: `workflows/open-pr/`, `workflows/address-pr-comments/`
- Verification: `scripts/__tests__/open-pr-delivery-contract.test.mjs`, `scripts/__tests__/sdlc-commands.test.mjs`

Acceptance:

- Given a verified exact head, when delivery begins, then version metadata and changelog remain synchronized before the PR is opened.
- Given CI or eligible bot review findings, when the PR is open, then bounded remediation runs against the same head.
- Given human review or ambiguous findings, when encountered, then delivery fails with intervention instead of resolving them automatically.
- Given the exact head merges, when finalizing, then success requires the PR merged and the executable issue closed before branch deletion.

## Project Upgrade Compatibility (`project-upgrade`)

Preserve a strict migration alias while upgrades detect and propose current Claude Code contract repairs, including legacy Oh My Pi runtime state.

- Surface: `/sdlc-migrate-project and /sdlc-upgrade-project`
- Sources: `workflows/migrate-project/`, `workflows/upgrade-project/`, `scripts/sdlc-upgrade.mjs`
- Verification: `scripts/__tests__/sdlc-upgrade.test.mjs`

Acceptance:

- Given /sdlc-migrate-project, when invoked, then it prints exactly Run /sdlc-upgrade-project and performs no work.
- Given /sdlc-upgrade-project, when invoked, then detection is read-only and proposed mutations require approved plan execution.
- Given legacy packaging or layouts, when an approved upgrade runs, then deterministic script mutations converge on the current Claude Code plugin structure.
- Given legacy .omp/sdlc/ runtime state, when the approved migration runs, then it moves under .nmg-sdlc/ and the managed ignore line becomes .nmg-sdlc/.
- Given ambiguous ownership, when detected, then the workflow preserves it for explicit user resolution.

## Managed Steering Runtime (`steering`)

Plan and apply versioned steering registrations and deterministic validation contracts.

- Surface: `/sdlc-steering [prompt]`
- Sources: `workflows/steering/`, `src/sdlc-steering-runtime.mjs`, `scripts/sdlc-steering.mjs`
- Verification: `scripts/__tests__/sdlc-steering-runtime.test.mjs`, `scripts/__tests__/sdlc-verification-runtime.test.mjs`

Acceptance:

- Given natural-language steering intent, when the interactive command runs, then it proposes exact initialize, update, or migrate actions before mutation.
- Given an approved plan, when apply runs, then the complete candidate runtime validates before live managed files change.
- Given registered project snippets, when prompts render, then only manifest-declared files enter the shared registry with provenance.
- Given required deterministic validations, when verification runs, then identity-bound non-pass outcomes forbid successful status.

## Run Retrospective (`run-retro`)

Analyze new or changed defect specs incrementally and update steering/retrospective.md without changing delivery state.

- Surface: `/sdlc-run-retro`
- Sources: `workflows/run-retro/`
- Verification: `scripts/__tests__/`

Acceptance:

- Given defect specs changed, when the command runs, then it follows related-spec chains and records transferable patterns.
- Given unchanged defect inputs, when rerun, then the persisted hash state prevents duplicate analysis.
- Given an interactive invocation, when review is required, then native plan mode and bounded AskUserQuestion gates are used before writes.

## Simplify Changed Code (`simplify`)

Apply worthwhile behavior-preserving cleanup to the changed implementation surface.

- Surface: `automated simplify stage`
- Sources: `workflows/simplify/`
- Verification: `scripts/__tests__/simplify-contract.test.mjs`

Acceptance:

- Given changed files, when simplify runs, then it reviews only the bounded diff and directly related context.
- Given duplicated, indirect, or inefficient code, when cleanup is safe, then it is simplified without altering specified behavior.
- Given a proposed change alters architecture, security, or acceptance behavior, when considered, then it is left to the owning implementation or verification stage.
- Given no worthwhile cleanup exists, when review completes, then no weightless refactor is introduced.

## Start Issue (`start-issue`)

Start one explicit executable issue on a clean linked branch after proving dependencies.

- Surface: `automated start stage`
- Sources: `workflows/start-issue/`
- Verification: `scripts/__tests__/start-issue-selection-contract.test.mjs`

Acceptance:

- Given no explicit #N argument, when invoked, then the stage fails closed without a picker or prompt.
- Given an issue with unresolved Depends on parents, when starting, then no branch or project mutation occurs.
- Given clean state and satisfied dependencies, when starting, then the issue branch is linked and the issue moves to In Progress.
- Given leftover unsupported labels, when starting, then they do not create alternate issue types or bypass normal delivery.

## Lifecycle Status (`status`)

Report current SDLC lifecycle evidence and the exact next action without mutation.

- Surface: `/sdlc-status [--json]`
- Sources: `workflows/status/`, `scripts/sdlc-status.mjs`
- Verification: `scripts/__tests__/sdlc-status.test.mjs`, `scripts/__tests__/status-skill-contract.test.mjs`

Acceptance:

- Given empty arguments or --json, when status runs, then it reports bounded local and GitHub lifecycle evidence in human or stable machine-readable form.
- Given any other argument, when invoked, then usage is printed and the command exits non-zero.
- Given unavailable evidence, when status infers state, then unknowns and gaps are explicit and progress is not overstated.
- Given any repository state, when status runs, then files, refs, issues, pull requests, and processes remain unchanged.

## Verify Code (`verify-code`)

Verify the current implementation against its approved spec and emit durable delivery evidence.

- Surface: `/sdlc-verify-code #N`
- Sources: `workflows/verify-code/`, `agents/architecture-reviewer.md`
- Verification: `scripts/__tests__/plugin-surface-verification.test.mjs`

Acceptance:

- Given an approved spec, when verification runs, then architecture, acceptance behavior, tests, and changed-surface evidence are reviewed inline.
- Given verification completes, when evidence is durable, then verification-report.md and the issue handoff record the exact head and outcomes.
- Given only PR-dependent evidence remains, when local evidence passes, then PR Evidence Pending may advance to delivery.
- Given a substantive failure, when verification ends, then delivery is blocked with intervention details.

## Write Code (`write-code`)

Implement an approved issue spec in task order, then conventionally commit and push before review.

- Surface: `automated implementation stage`
- Sources: `workflows/write-code/`, `agents/spec-implementer.md`
- Verification: `scripts/__tests__/sdlc-execute.test.mjs`

Acceptance:

- Given an explicit issue or issue branch, when implementation begins, then only the matching approved spec package is authoritative.
- Given ordered tasks, when work proceeds, then tasks are completed in declared order with observable verification.
- Given a skill-bundled edit, when the worker edits it, then the skill-creator skill is first invoked with the Skill tool and its authoring contract is followed.
- Given implementation completes, when the passed handoff is written, then every non-runtime change is committed and published for review.

## Write Specification (`write-spec`)

Create, approve, and publish one issue-owned BDD spec package from the default branch.

- Surface: `/sdlc-write-spec #N`
- Sources: `workflows/write-spec/`, `scripts/publish-approved-spec.mjs`
- Verification: `scripts/__tests__/publish-approved-spec.test.mjs`, `scripts/__tests__/interactive-gates-contract.test.mjs`

Acceptance:

- Given an executable issue number, when specification runs, then one specs/{N}-{slug}/ package with singular Issue frontmatter is produced.
- Given the user approves the plan, when publication runs, then requirements.md, design.md, tasks.md, and feature.gherkin are committed and pushed.
- Given the spec PR is ready, when published, then it is squash-merged into the default branch without development-linking or closing the implementation issue.
- Given publication succeeds, when the loop continues, then the user may explicitly continue to implementation or finish.
- Given Finished is selected, when the Finished reply ends, then it calls ExitPlanMode and plan mode ends without a typed command.

## Deprecated compatibility surface

- `migrate-project` is not an active capability. It prints exactly `Run /sdlc-upgrade-project` and stops.

## Verification invariant

`node scripts/verify-current-specs.mjs` proves that only genuinely owned current issue specs remain, every active workflow and public command maps to the historical rewrite contract, deprecated stubs retain their exact redirect, and the contract keeps its repository-rewrite identity independently of later ordinary package releases.
