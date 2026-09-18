# Execute-Implementable Requirements

## Process

Apply this contract to every candidate statement and to every generated section. Retain only functional software behavior or directly necessary repository work that the delegated `/sdlc-execute` pipeline can realize and prove. Never publish an external obligation merely because project steering or source material mentions it.

### Capability model

`/sdlc-execute` is an orchestrator. Its main pane never edits product code or opens a pull request. “Execute can deliver it” means the delegated `start → implement → review1 → fix1 → review2 → fix2 → verify → deliver` sequence can realize the behavior through bounded repository changes, prove it using accepted evidence, publish the result, and reach exact-head merge plus issue closure without the requirement itself demanding intervention-only authority.

- **Start preconditions.** Each queued item is one ordinary issue with a singular Approved four-file spec, `spec-created`, an eligible official blocked-by graph, readable GitHub/default branch, and a preservable worktree. Labels, dependency edges, branch creation, Project status, and spec publication are lifecycle control-plane metadata, not Functional Requirements.
- **Implement/fix authority.** `write-code` executes every `### T<number>:` in `tasks.md` in dependency order without questions. Every task belongs to the current issue; never emit future-issue, regression-only, or cumulative foreign work. Acceptance is authoritative and `**File(s)**` is an optional hint. `Read-only`, `Acquire`, and `(delivery-owner only)` metadata do not grant implement mutation. Outcome mutation may touch any needed valid repository-relative source, test, documentation, configuration, migration, or infrastructure-as-code path except the four immutable current Approved spec inputs, other `specs/` paths, `.omp/`, and absolute, URL, scheme, backslash, NUL, pathspec-magic, `.`, or `..` paths. The current issue's `verification-report.md` is the sole `specs/` write exception. `.omp` run state, handoffs, locks, receipts, and recovery records are controller-owned evidence, never product acceptance. Broad path authority does not make standalone paperwork or manual operations functional requirements: retain documentation, configuration, migration, or infrastructure-as-code tasks only when directly required to implement or prove retained software behavior. Workers may resolve non-material private implementation details conservatively from approved outcomes, repository evidence, and steering; run narrow tests; simplify without behavior change; commit; and push. They may not amend Approved inputs, choose among unresolved public/product behaviors, or invent external authority.
- **Review/fix authority.** Execute runs two isolated read-only reviews against the default branch and two fix stages. Review workers cannot edit or run code. Each fix may apply only its current actionable review packet, publish permitted outcome paths, and no-op when no change is required. It cannot perform drive-by cleanup, new feature work, or override, dismiss, or resolve genuinely human-authored review authority.
- **Verification authority.** Verify maps every active AC, FR, task, and Gherkin scenario to code and evidence. It runs manifest-registered `builtin.command`, artifact, external-evidence, or extension-provider validations plus relevant tests and exercises; performs architecture, security, performance, testability, and error-handling review; may apply safe local fixes; and publishes only the current verification report. A prose-only command or provider is not registered evidence. Complete zero-validation coverage is valid runtime structure but proves no issue behavior. Required failed local commands may rewind to implementation. Missing, duplicate, unknown, or incomplete provider results; unavailable credentials; unsafe or stale evidence; applicable provider self-skip; or external-only failure remain non-passing intervention. PR-only evidence is supported only after all local obligations pass and only as exact `required_check`, `check_run` with `event: pull_request`, or `merge_blocking` identities mapped to current ACs and an exact head. Generic CI prose, push/unknown events, comments, deployment proof, and human approval do not qualify.
- **Delivery authority.** Deliver can synchronize `VERSION`, `CHANGELOG.md`, and safe steering-declared version mirrors; create or resume the exact pull request; remediate one eligible path-bearing bot/CI packet locally; observe exact checks, reviews, and mergeability; exact-head squash-merge with `--match-head-commit`; and prove same-repository closing linkage plus issue `CLOSED`. GitHub writes are conditional on already available credentials, permissions, rules, and checks. Deliver cannot satisfy human approval, legal judgment, credentials acquisition, external attestation, manual conflict resolution, force-push, live production/cloud/vendor operations, another repository's work, GitHub Release or tag creation, package/container publication, deployment, or infrastructure provisioning. Project-board In Progress is best effort and never acceptance evidence. A ready pull request or local Pass is not terminal delivery.
- **Repair boundary.** Workers repair code/test defects and infer conservative non-material details, but never ask questions. Simplification is behavior-preserving only and cannot become a requirement for unrelated cleanup. Repeated no-progress remediation is bounded and intervention remains terminal. Resolve every material product choice and acceptance oracle during draft/spec authoring. Do not emit Open Questions, `TBD`, unbounded retry, or success conditions requiring later human interpretation. A possible environmental failure does not make ordinary software behavior ineligible; an acceptance criterion that inherently requires intervention does.

### Eligibility algorithm

For every candidate sentence, apply these steps in order:

1. Normalize it to the software behavior or repository task it would require.
2. Identify the execute stage that owns both implementation and proof.
3. Require every mutation target to fit implement/fix outcome authority or the owning stage's narrow artifact authority.
4. Require an observable local, registered-provider, or allowlisted PR-only success oracle.
5. Reject it when success inherently depends on external human judgment, acquiring credentials or rights, a live production operation, another repository, or an unbounded elapsed-time or SLA claim.
6. Strip excluded motivation, citation, proof, sign-off, operation, or rationale text and rerun this gate on the retained sentence.

If no execute stage owns both realization and proof, omit the statement.

Before synthesis, create a transient `Execute Feasibility` table in each issue entry of `local://draft-*-plan.md` and in each `local://spec-{N}-plan.md`:

| Item | Behavior or task | Owning stage | Mutation/artifact | Evidence kind and identity | External prerequisite | Disposition |
|------|------------------|--------------|-------------------|----------------------------|-----------------------|-------------|

Cover every proposed AC, FR, task, and scenario. `Disposition` is exactly `retain`, `rewrite`, `omit`, or `control-plane`. Every retained row names an execute-owned implementation/proof stage, a permitted repository mutation or narrow stage artifact, and observable evidence. `Mutation/artifact` uses an exact path when known. Draft-stage rows may instead use the literal `outcome-authorized repository mutation; concrete path resolved by write-spec`. Write-spec rows may use `outcome-authorized repository mutation; concrete path derived from Acceptance` only when no denied or read-only path is required. Draft evidence may use `observable GWT; concrete test resolved by write-spec`. Write-spec evidence names an AC-linked local test task/command, exact manifest validation/provider id, exact allowlisted PR-check identity, or terminal control proof. `External prerequisite` is exactly `none`, `available:<identity>`, or `unresolved:<description>`; `retain` permits only `none` or a repository-proven `available:` identity. Reject a retained row with blank or unresolved ownership, mutation authority, evidence, or prerequisite. This table is proposal audit data only. Never copy it into a GitHub issue body or any of the four spec files.

After synthesis, audit the complete generated payload, not selected sections. Draft-issue audits every complete issue-body section and the exact `ghCreateArgs.body`. Write-spec audits the full planned contents of `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`. Only retained or rewritten content may enter generated artifacts. Omitted and control-plane rows remain only in the plan audit. Do not defer a material product choice to execute as an Open Question.

### Feasibility audit

The final audit must establish all of these facts:

- Every AC, FR, task, and scenario has exactly one feasibility row.
- Every retained or rewritten item names its owning realization/proof stage, permitted mutation or artifact, accepted evidence identity, and resolved prerequisite.
- Start and delivery actions such as labels, branches, Project status, spec publication, version synchronization, pull-request creation, exact-head merge, and issue closure are `control-plane`, not generated behavior or implementation-task acceptance.
- No excluded content appears in Background, Current State, Root Cause, Environment, Technical Notes, Out of Scope, requirements, design, tasks, scenarios, comments, or change descriptions.
- Steering may resolve actual paths, interfaces, validation identities, and project conventions. Steering process, release, ownership, or verification-policy prose is not generated content and cannot broaden execute authority.

### Transformations and examples

Retain concrete software behavior when repository implementation and observable proof exist:

- implement a 30-day deletion state transition and boundary tests;
- return `403` when stored authorization data denies access;
- add and test a schema migration and rollback;
- emit an audit-log record;
- meet a concrete latency threshold under a repository benchmark; and
- update checked-in repository configuration or infrastructure-as-code whose behavior is testable.

Narrow mixed input before retaining it:

- “Comply with privacy law by deleting data after 30 days and obtain counsel approval” becomes only the deletion behavior and observable boundary tests.
- “Deploy infrastructure” becomes checked-in, testable infrastructure configuration, never applying it to a live account.

Omit legal or regulatory compliance declarations; contract, license, intellectual-property ownership, provenance, authority, or ownership proof; counsel, product-owner, security, or other human sign-off; external approval, attestation, certification, or audit-evidence burdens; credential, certificate, or rights procurement; staffing, training, or organizational responsibility; release paperwork; live production deployment or manual data operations; a 30-day uptime/SLA observation; external ticket closure; another repository's changes; waiting for or overriding human review; and any obligation whose success depends on an actor or evidence outside execute implementation and verification authority.

For mixed statements, preserve the concrete software behavior and testable constraint but remove excluded motivation, citation, proof, sign-off, operation, or external obligation. Never relocate excluded content into contextual or boundary sections. Security, privacy, accessibility, performance, retention, audit logging, authorization, migration, configuration, and infrastructure-as-code remain eligible only as concrete behavior execute can implement and verify. A generic quality posture, SLA, checklist, or evidence burden does not qualify. Bare domain words such as `owner`, `audit`, `authorization`, and `latency` are not exclusions by themselves.

### Stop conditions

If draft-issue filtering leaves no eligible requirement, print exactly:

`No software requirements executable by /sdlc-execute remain after excluding non-software obligations.`

Stop before writing a plan, calling `xd://propose`, or mutating GitHub.

If write-spec filtering leaves no eligible requirement, substitute the selected issue number and print exactly:

`Issue #N has no software requirements executable by /sdlc-execute after excluding non-software obligations.`

Stop before writing a plan, preparing a branch, writing spec files, committing, publishing, labeling, or merging.

If a material choice remains after write-spec's three-ask budget, substitute the issue number and comma-separated decisions and print exactly:

`Issue #N has unresolved decisions required for /sdlc-execute: <comma-separated decisions>.`

Stop before plan creation, proposal, or mutation. Never emit Open Questions into the four-file package.

Source anchors that maintain this contract but are never generated content: `scripts/sdlc-execute.mjs` (`VALID_STEPS` and stage routing); `scripts/sdlc-safe-recoveries.mjs` (`validPublicationPath`, `publicationPathDenied`, and `inspectPublicationScope`); `workflows/write-code/WORKFLOW.md`; `workflows/verify-code/WORKFLOW.md`; and `scripts/sdlc-deliver.mjs`.
