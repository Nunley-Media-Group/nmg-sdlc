# Design: Remove wall-clock timeboxing from SDLC execution

**Issue**: #286
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/214-replace-markdown-steering-with-a-managed-runtime-sdlc-steering-and-deterministic-verification/

---

## Overview

Replace elapsed-time termination with state-based supervision across steering validation, workflow exercises, Herdr/controller waits, and current workflow documentation. The runtime accepts canonical validation records with `id`, `provider`, `required`, `when`, and `config`; a legacy `timeoutMs` key is accepted but stripped and ignored. It no longer generates or forwards `timeoutMs`.

Commands run as owned process groups. The caller may supply an `AbortSignal`; abort initiates process-group cleanup and returns a stable cancelled result. Unexpected child closure or disappearance before a valid completion is process loss. Extension providers receive the same signal in their immutable request and must settle naturally or respond to cancellation; the runtime does not race them against a timer.

## State Model

```text
launching
  ├── launch error ───────────────> incomplete: launch_failed
  ├── explicit cancellation ──────> cleanup group ─> incomplete: cancelled
  └── running
        ├── exit 0 + valid result ─> passed
        ├── nonzero/signal exit ──> failed
        ├── malformed/stale result > incomplete
        ├── explicit cancellation > cleanup group ─> incomplete: cancelled
        └── confirmed process loss > cleanup group ─> incomplete: process_lost
```

Elapsed time is not an edge in this model.

## Steering Schema

A validation record has this exact current shape:

```json
{
  "id": "repository.tests",
  "provider": "builtin.command",
  "required": true,
  "when": { "kind": "always" },
  "config": {
    "program": "npm",
    "args": ["test", "--", "--runInBand"],
    "cwd": "scripts",
    "env": ["CI"]
  }
}
```

`timeoutMs` is not required and is not emitted by managed contracts. For compatibility with consumer-owned steering written against the preceding schema, a present legacy value is accepted, stripped from runtime registrations, and ignored; omission is canonical and means no deadline. Exact-key validation continues to reject every unrelated unknown key.

Provider requests expose immutable enumerable fields `schemaVersion`, `validationId`, `projectRoot`, `config`, and `identity`, plus a non-enumerable `signal` so persisted artifacts stay deterministic. The signal carries explicit cancellation only; no automatic timer aborts it.

## Process Supervision

### Owned process group

- POSIX: spawn with `detached: true`; cleanup signals `-child.pid`, targeting only the spawned process group.
- Windows: spawn normally; cleanup invokes `taskkill /pid <pid> /t /f` through an argument array to terminate the owned process tree.
- Treat `ESRCH` and an already-closed child as successful cleanup.
- Propagate other cleanup errors into incomplete evidence; never broaden the target.
- Remove abort and child listeners after one terminal settlement.

### Cancellation

Public in-process runners accept an optional `signal`. A pre-aborted signal prevents launch and returns/throws the stable cancelled outcome. An abort after launch performs cleanup once. CLI wrappers translate `SIGINT` and `SIGTERM` into explicit cancellation through an `AbortController` and restore listeners at completion.

### Process loss

A child `close` event with neither a numeric exit code nor a termination signal is classified as `process_lost`. RPC transport closure before `ready`, response completion, or `agent_end` is also process loss. Herdr controllers continue using unbounded `agentWait` calls and classify a confirmed missing pane/agent through their existing fail-closed observation paths.

### Extension providers

Extension handlers are awaited directly unless the explicit cancellation signal aborts the call. They receive that signal and remain responsible for cleaning up owned resources. A thrown/rejected provider remains a crash. A provider result remains subject to exact schema and identity checks. There is no timer race and no synthetic timeout result.

## Workflow and Verification Contracts

- Remove `--timeout-ms` and OMP `--max-time` from the canonical exercise harness and documentation.
- Wait for RPC readiness and completion using events/promises, not elapsed-time loops.
- Keep small polling intervals only as scheduling mechanisms; they do not impose a deadline or count ceiling.
- Remove review/check polling timeouts and elapsed-time exit text from current workflow references.
- Preserve unbounded Herdr `agentWait` calls with no timeout argument.
- Remove subprocess timeout options from current canonical verification providers and gates; completion is determined by exit/process state.
- Preserve deterministic result coverage and fail-closed behavior for cancellation, process loss, malformed evidence, and genuine failures.

## Generated and Managed Artifacts

Update both source templates and generated copies where the manifest records checksums. Recompute managed hashes only through the repository's deterministic steering writer or equivalent exact generator. Expected current surfaces include:

- `steering/manifest.json` and steering generation/upgrade fixtures;
- `steering/extensions/nmg-sdlc-smoke.mjs`;
- `steering/snippets/project-tech.md` and managed module/template mirrors where affected;
- `references/steering-schema.md`;
- `workflows/verify-code/` exercise and gate references;
- `workflows/address-pr-comments/` and `workflows/open-pr/` polling guidance;
- `scripts/exercise-omp.mjs` and verification runtime/controller helpers;
- `NMG_SDLC_STEERING_PLAN.md`, README, and changelog.

## Affected Runtime Paths

- `src/sdlc-steering-runtime.mjs`: current exact validation schema without finite deadline requirement.
- `src/sdlc-verification-runtime.mjs`: signal-aware command/provider execution and stable terminal outcomes.
- `scripts/exercise-omp.mjs`: unbounded RPC lifecycle, cancellation, process-loss detection, and process-group cleanup.
- `scripts/sdlc-execute.mjs`: preserve unbounded Herdr waits and strengthen confirmed-loss coverage if gaps exist.
- Other active script adapters that impose a wall-clock termination on canonical workflow or verification commands: remove those deadlines and retain genuine error handling.

## Testing Strategy

1. Steering runtime accepts omitted `timeoutMs`, strips and ignores a legacy value, and rejects unrelated unknown keys.
2. Command provider remains alive past a former short deadline and preserves eventual success.
3. Abort before and during command execution returns cancelled and invokes cleanup exactly once.
4. POSIX and Windows cleanup choose only the owned group/tree; already-exited cleanup is harmless.
5. Unexpected closure without exit code or signal returns process loss.
6. Extension provider runs without timer, observes the caller signal, and preserves crash/malformed-result behavior.
7. Exercise RPC waits have no deadline, cancel explicitly, and reject process loss without pending-promise leaks.
8. Herdr/controller tests assert wait calls omit timeout fields and missing panes fail closed.
9. Managed-artifact, workflow contract, README, changelog, skill inventory, plugin surface, full Jest, steering verification, and live smoke gates pass.
10. Published install reports the released version from a fresh OMP invocation.

## Security and Failure Boundaries

- Cancellation is explicit; no elapsed-time heuristic is cancellation.
- Process loss requires an observed child/pane disappearance, not delayed output.
- Cleanup uses child-owned identifiers captured from the launched process and never name matching.
- Shell interpolation remains disabled.
- Provider identities and evidence remain immutable and exact.
- Failed cleanup or ambiguous state is incomplete and intervention-worthy; it is never success.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #286 | 2026-08-27 | Remediation: replace delivery clock ceilings and execute attempt counts with state/content observation plus confirmed process-loss termination |
| #286 | 2026-08-27 | Initial approved state-based supervision design |
