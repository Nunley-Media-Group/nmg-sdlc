# Design: Remove the Automated SDLC Loop and Unattended Mode

**Issues**: #151
**Date**: 2026-08-13
**Status**: Approved
**Author**: Rich Nunley

---

## Overview

Version 2 removes the automated SDLC subsystem at the plugin boundary rather than deprecating it in place. The public automation skills, runner/config assets, sentinel contract, automation-only label behavior, and cross-skill unattended branches are deleted. Every surviving skill follows one interactive contract, with `request_user_input` gates and decision-complete planning where its workflow requires human judgment.

Two useful repository-management capabilities move out of runner setup: `onboard-project` installs the managed contribution-check workflow and structured issue form for new projects, while `upgrade-project` reconciles them for existing projects. `upgrade-project` also owns a one-time, ownership-aware v2 cleanup of exact runner artifacts and recognized managed ignore blocks. The read-only `$nmg-sdlc:status` utility remains because its delivered implementation is already manual-only; the manual epic relationship semantics delivered by #149 also remain.

The existing plugin-surface validator becomes the enforcement boundary. It rejects removed skill directories, commands, aliases, loader-facing tokens, runtime assets, and active capability claims across source, staged-release, fresh-install, and upgraded active roots. Historical specs and released changelog entries are excluded explicitly, while negative regression fixtures may mention removed tokens without exposing runnable behavior.

---

## Architecture

### Component Diagram

```text
┌───────────────────────────────────────────────────────────────┐
│                   nmg-sdlc v2 Plugin                          │
├───────────────────────────────────────────────────────────────┤
│ Manual pipeline                                               │
│ draft-issue → start-issue → write-spec → write-code           │
│              → simplify → verify-code → open-pr               │
│              → address-pr-comments                            │
│                                                               │
│ Utilities                                                     │
│ onboard-project │ upgrade-project │ status │ run-retro        │
└───────────────┬───────────────────────┬───────────────────────┘
                │                       │
                │ new projects          │ existing projects
                ▼                       ▼
┌────────────────────────────┐  ┌───────────────────────────────┐
│ Onboarding managed assets  │  │ Upgrade reconciliation       │
│ - contribution gate        │  │ - managed assets             │
│ - structured issue form    │  │ - exact runner cleanup       │
└────────────────────────────┘  └───────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ Active-surface validator                                      │
│ source / staged release / fresh install / upgraded root       │
│                                                               │
│ scans active contracts ───────────┐                            │
│ excludes historical specs and    │ rejects removed paths,     │
│ released changelog entries        └─tokens, aliases, stubs     │
└───────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Fresh Installation

```text
1. Codex loads the manifest-declared `skills/` tree.
2. Removed skill directories and runner/config files are absent.
3. Surviving skills expose only interactive contracts.
4. Onboarding installs managed repository assets directly when requested.
5. The selected installed root passes active-surface validation.
```

#### Existing-Project Upgrade

```text
1. `upgrade-project` resolves the project and installed plugin roots.
2. Existing steering/spec/managed-asset analysis runs normally.
3. V2 cleanup classifies only these exact project-root artifacts:
   - sdlc-config.json
   - .codex/unattended-mode
   - .codex/sdlc-state.json
   - recognized nmg-sdlc runner-ignore blocks
4. The interactive findings gate lists proposed deletions and preserved gaps.
5. On approval, exact owned artifacts are removed; unrelated content is untouched.
6. Managed contribution-gate and issue-form reconciliation runs independently.
7. A repeat run reports the cleanup category as already clean.
```

#### Active-Surface Verification

```text
1. Resolve the selected plugin root and manifest-declared skills directory safely.
2. Reject exact removed skill/runtime paths before token inspection.
3. Inspect loader-facing and current-contract text in declared active roots.
4. Inspect the canonical inventory baseline for removed destinations or commands.
5. Exclude specs/, released changelog sections, and bounded negative-test fixtures.
6. Return pass, violation, or invalid-input status with deterministic diagnostics.
```

---

## API / Interface Changes

### Public Skill Surface

| Interface | Change | Result |
|-----------|--------|--------|
| `$nmg-sdlc:run-loop` | Remove | No discovery entry, alias, redirect, or compatibility stub remains. |
| `$nmg-sdlc:end-loop` | Remove | Runner lifecycle cleanup is no longer a user command. |
| `$nmg-sdlc:init-config` | Remove | Runner configuration is no longer generated; retained managed assets move to onboarding. |
| `$nmg-sdlc:onboard-project` | Modify | Directly installs the managed contribution gate and issue form for new projects. |
| `$nmg-sdlc:upgrade-project` | Modify | Reconciles managed assets and offers exact v2 runner-artifact cleanup. |
| `$nmg-sdlc:status [--json]` | Retain | Continues as a manual, read-only lifecycle diagnostic with no runner probes. |
| Manual delivery pipeline | Retain | Preserves existing stage outputs, human gates, and downstream contracts. |

### Internal Validator Interface

`scripts/verify-plugin-surface.mjs` keeps its CLI contract:

```text
node scripts/verify-plugin-surface.mjs --root <plugin-root> --label <surface>
```

The validator adds declarative rule groups for removed automation paths and tokens. Exit codes remain stable: `0` for a clean selected surface, `1` for violations, and `2` for invalid inputs.

### Upgrade Cleanup Status

`upgrade-project` adds a stable summary category:

```text
Runner Artifact Cleanup:
- sdlc-config.json: removed | already clean | preserved (unmanaged) | failed (<reason>)
- .codex/unattended-mode: removed | already clean | failed (<reason>)
- .codex/sdlc-state.json: removed | already clean | failed (<reason>)
- .gitignore managed entries: removed | already clean | preserved (unmanaged) | failed (<reason>)
```

No new endpoint, network API, or public configuration schema is introduced.

---

## Database / Storage Changes

There are no database schema changes.

### Consumer-Project File Migration

| Path | Ownership Predicate | Migration |
|------|---------------------|-----------|
| `sdlc-config.json` | Exact project-root path created by the removed setup workflow | Propose deletion; do not parse or migrate values. |
| `.codex/unattended-mode` | Exact plugin-owned sentinel path | Propose deletion when present. |
| `.codex/sdlc-state.json` | Exact plugin-owned state path | Propose deletion when present. |
| `.gitignore` runner entries | Exact entries inside a recognized `# SDLC runner config` or `# SDLC runner artifacts` block | Remove only owned lines and an empty managed header; preserve matching entries outside recognized blocks. |
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | Existing managed marker/version contract | Preserve and reconcile independently. |
| `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` | Existing exact managed issue-form path contract | Preserve and reconcile independently. |

Migration does not inspect, kill, or signal a PID recorded in the obsolete state file. It treats the file as stale plugin-owned data and removes it only after normal interactive approval.

### GitHub Metadata

Existing `automatable` labels and label assignments are not storage migration targets. The plugin stops creating and consuming them but sends no label-delete or issue-edit command for cleanup.

---

## State Management

The v2 plugin introduces no automation state. Surviving skills derive state from their documented interactive inputs, repository evidence, specs, and GitHub metadata.

Upgrade cleanup is stateless and idempotent:

```text
Present + owned ──approval──▶ Removed
Absent ─────────────────────▶ Already clean
Ambiguous/unmanaged ─────────▶ Preserved + reported gap
Removal failure ─────────────▶ Preserved or partial result + exact diagnostic
```

The obsolete state file is never used to resume work, select an issue, suppress a prompt, or control completion output.

---

## UI Components

There is no graphical UI. User-visible behavior is skill discovery, interactive prompts, and plain-text status output.

| Component | Location | Purpose |
|-----------|----------|---------|
| Interactive gate contract | `references/interactive-gates.md` | Defines the only supported human-decision path. |
| Onboarding summary | `skills/onboard-project/SKILL.md` | Reports managed asset installation without runner setup. |
| Upgrade findings/summary | `skills/upgrade-project/SKILL.md` | Shows exact cleanup proposals and outcomes. |
| Manual lifecycle status | `skills/status/SKILL.md` | Reports current issue/spec/PR state without runner interpretation. |
| Surface diagnostics | `scripts/verify-plugin-surface.mjs` | Names each forbidden active path or token deterministically. |

---

## File Changes

| File / Component | Type | Purpose |
|------------------|------|---------|
| `skills/run-loop/SKILL.md`, `skills/end-loop/SKILL.md`, `skills/init-config/SKILL.md` | Delete | Remove public automation commands without stubs. |
| `scripts/sdlc-runner.mjs`, `scripts/sdlc-config.example.json` | Delete | Remove runtime orchestration and configuration templates. |
| `scripts/__tests__/sdlc-runner.test.mjs`, `scripts/__tests__/runner-config-contract.test.mjs`, `scripts/__tests__/select-next-issue-from-milestone.test.mjs` | Delete | Remove runner-only coverage. |
| `references/unattended-mode.md` | Delete | Remove the sentinel/default/escalation contract. |
| `skills/onboard-project/SKILL.md`, `skills/onboard-project/references/*.md` | Modify | Own new-project managed assets and remove runner setup/delegation. |
| `skills/upgrade-project/SKILL.md`, `skills/upgrade-project/references/*.md` | Modify | Replace runner-config reconciliation and unattended branches with interactive v2 cleanup. |
| `skills/draft-issue/`, `skills/start-issue/` | Modify | Remove automation questions, labels, filters, and indicators. |
| `skills/write-spec/`, `skills/write-code/`, `skills/verify-code/`, `skills/open-pr/`, `skills/run-retro/`, `skills/address-pr-comments/` | Modify | Collapse surviving workflow branches to interactive behavior. |
| `agents/spec-implementer.md`, `agents/spike-researcher.md` | Modify | Remove runner-only execution and handoff language. |
| `references/codex-tooling.md`, `references/interactive-gates.md`, `references/prompt-config.md`, `references/legacy-layout-gate.md`, `references/spec-context.md`, `references/dirty-tree.md`, `references/versioning.md`, `references/project-agents.md`, `references/contribution-gate.md`, `references/issue-form.md` | Modify | Remove automation branches and update ownership language. |
| `references/epic-relationships.md`, `skills/status/SKILL.md` | Modify | Retain only manual epic and status contracts. |
| `scripts/verify-plugin-surface.mjs` | Modify | Enforce v2 removed-surface and historical-boundary rules. |
| `scripts/skill-inventory-audit.mjs`, `scripts/skill-inventory.baseline.json` | Modify | Remove unattended-specific extraction and refresh the manual-only inventory. |
| `scripts/package.json`, `scripts/package-lock.json` | Modify | Rename runner-specific test package metadata while retaining the scripts test suite. |
| `README.md`, `steering/product.md`, `steering/tech.md`, `steering/structure.md`, `.gitignore`, `CHANGELOG.md` | Modify | Publish the manual-only v2 contract and migration guidance. |
| Affected `scripts/__tests__/*.test.mjs` and exercise fixtures | Modify/Create | Rebase static contracts and prove managed-asset, cleanup, and manual-pipeline behavior. |

Every edit inside `skills/`, plugin-shared `references/`, or `agents/` is performed through `$skill-creator` during implementation, as required by `steering/tech.md`.

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Amend the historical automation spec | Append removal requirements to `feature-automation-mode-support` | Keeps one topic directory | Turns a truthful shipped-feature record into the active removal contract and obscures the clean break | Rejected — create a dedicated removal spec. |
| Keep deprecation stubs | Leave removed commands discoverable with migration text | Softer command transition | Preserves loader surface, maintenance cost, and accidental activation | Rejected — v2 hard-removes commands. |
| Keep runner setup as a generic setup skill | Rename `init-config` and strip config generation | Smaller ownership move | Adds a separate setup concept that the issue explicitly excludes | Rejected — onboarding and upgrade already own the lifecycle. |
| Delete existing `automatable` labels | Mutate repository label and issue history during upgrade | Removes visible historical metadata | Destructive remote mutation with no product value | Rejected — metadata becomes inert. |
| Remove `status` with the runner | Treat all lifecycle diagnostics as automation-adjacent | Smallest utility surface | Loses a useful manual, read-only command that is already runner-independent | Rejected — retain manual status. |
| Repository-wide forbidden-token grep | Fail on any automation term anywhere | Simple implementation | Falsely rejects historical specs, release notes, and negative tests | Rejected — use explicit active roots and historical boundaries. |
| Declarative active-surface validation | Enforce exact removed paths and loader-facing tokens only on active contracts | Auditable, reusable across release/install roots, preserves history | Requires carefully maintained scan boundaries | **Selected**. |

---

## Security Considerations

- [x] **Authorization**: v2 cleanup uses the invoking user's existing filesystem permissions and never escalates.
- [x] **Scope validation**: only exact project-root-relative runner artifacts and recognized managed ignore blocks are deletion candidates.
- [x] **Input safety**: repository-derived paths and issue text are treated as data, not interpolated shell source.
- [x] **Remote safety**: migration performs no GitHub label or issue mutation.
- [x] **History safety**: specs and released changelog sections are outside active-surface deletion and rewrite scope.
- [x] **Prompt safety**: surviving manual gates cannot be bypassed by a plugin-created sentinel.

---

## Performance Considerations

- [x] Validation walks deterministic declared roots and avoids loading the historical spec archive.
- [x] Migration probes four exact artifact classes rather than recursively scanning the project.
- [x] Managed asset reconciliation reuses existing marker/version and exact-path contracts.
- [x] No background process, polling loop, nested Codex subprocess, PID monitoring, or runner log scan remains.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Removal validator | Unit/fixture | Exact removed directories, frontmatter, aliases, stubs, runtime paths, inventory entries, active prose, invalid roots, and historical exclusions |
| Shared contracts | Static contract tests | Interactive gates, prompt config, inventory extraction, dirty-tree behavior, and current documentation |
| Issue workflows | Exercise/static | No automation question, label creation/application, filtering, or display; manual selection remains correct |
| Managed assets | Exercise | Onboarding creation; upgrade create/update/collision/preservation behavior for contribution gate and issue form |
| V2 cleanup | Exercise | Exact-file deletion, managed-ignore deletion, ambiguous preservation, partial failure, and repeat-run idempotence |
| Manual status/epics | Unit/exercise | Status remains runner-independent; manual epic membership remains non-blocking while genuine dependencies block |
| Manual pipeline | Disposable-project exercise | Issue drafting through review-comment handling, with dry-run evidence for external mutations |
| Local distribution | Integration | Full scripts suite, inventory audit, compatibility, source/staged/fresh/upgraded surface fixtures, syntax/YAML, and whitespace |
| Published distribution | Post-release integration | Actual v2 fresh install and actual upgrade in fresh Codex sessions, tied to version, SHA, and active installed root |

All ten acceptance criteria have one corresponding scenario in `feature.gherkin`.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Broad text cleanup rewrites truthful history | Medium | High | Exclude `specs/` and released changelog entries from rewrite and active-surface scanning; assert unchanged historical fixtures. |
| Cleanup deletes user-owned content | Low | High | Require exact paths or recognized managed block ownership; preserve ambiguous matches and report gaps before approval. |
| Moving setup assets causes new projects to miss them | Medium | High | Make both assets onboarding postconditions and exercise missing/current/stale/collision cases. |
| Removing unattended branches accidentally removes required interactive gates | Medium | High | Rebase interactive-gate tests and exercise each surviving decision path with `request_user_input`. |
| Status or epic logic keeps hidden runner coupling | Low | Medium | Retain only manual evidence sources; tests reject state, sentinel, config, PID, and runner probes. |
| Validator self-matches its negative rules or fixtures | Medium | Medium | Separate rule declarations, active roots, and bounded negative-test exceptions; test each boundary. |
| Local fixtures are mistaken for released-install closure | Medium | High | Keep published fresh-install/upgrade proof as a distinct task and report it incomplete until version/SHA/active-root/fresh-session evidence exists. |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #151 | 2026-08-13 | Initial feature spec |

---

## Validation Checklist

- [x] Architecture follows the plugin's skills/references/scripts structure.
- [x] Public interface removals and retained interfaces are explicit.
- [x] Consumer storage cleanup uses exact ownership predicates and an idempotent migration.
- [x] No new runtime state, network API, or graphical UI is introduced.
- [x] Security and cross-platform boundaries are addressed.
- [x] Performance impact is bounded by declared active roots and exact paths.
- [x] Testing covers source, migration, manual workflow, and published-install boundaries.
- [x] Alternatives and the status-retention decision are documented.
- [x] Risks include historical preservation and release-proof honesty.
