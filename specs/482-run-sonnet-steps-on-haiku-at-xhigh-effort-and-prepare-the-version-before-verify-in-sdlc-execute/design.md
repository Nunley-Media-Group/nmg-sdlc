# Design: Run Sonnet steps on Haiku at xhigh effort and prepare the version before verify in /sdlc-execute

**Issue**: #482
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley

## Overview

Models and efforts stay table-driven in `src/host-events.mjs`. The execute controller gains one deterministic step, version preparation before verify and deliver, and delivery gains a backstop that refuses an unprepared version.

## Architecture

### Model and effort tables (`src/host-events.mjs`)

```js
stages: Object.freeze({ start: "haiku", implement: "haiku", verify: "opus", deliver: "haiku" }),
"sdlc-open-pr": "haiku",

export const SDLC_EFFORTS = Object.freeze({
  stages: Object.freeze({ implement: "xhigh", deliver: "xhigh" }),
  commands: Object.freeze({ "sdlc-open-pr": "xhigh" }),
});
```

`src/host-events.d.mts` declares `SdlcEffort` and `SDLC_EFFORTS`.

### Workers (`scripts/sdlc-execute.mjs`)

- `stageEffort(step, failure)` uses the same repair test as `stageModel` (`repairDispatch`). A repair runs on opus at Claude Code's default effort.
- `workerAgentArgs({ model, effort })` appends `--effort <level>` after `--model`. `defaultHerdr().agentStart` threads `effort` through.

### Command files and agents

- `renderAutomatedCommandMarkdown` (`src/sdlc-commands.mjs`) writes `effort: <level>` after `model:` when `SDLC_EFFORTS.commands[name]` is set, and the command files are regenerated from it. `/sdlc-open-pr` is a command file, not a hooks-registered command, so its frontmatter carries the effort.
- `agents/spec-implementer.md` and `agents/deliverer.md` declare `model: haiku` and `effort: xhigh`.

### Version preparation (`scripts/sdlc-execute.mjs`)

Version preparation runs after the controller decides the next step, before it dispatches:

```js
if (['verify', 'deliver'].includes(step) && !dirty && !dirtyReport && published && !evidence.pullRequest
  && prepareVersion(cwd, run, issue, invocationId) !== current.head) continue;
```

`prepareVersion` runs `node <packageRoot>/scripts/sdlc-deliver.mjs prepare-version --issue N --controller-run-id <id>` and returns `headSha` from `NMG_SDLC_VERSION_PREPARED`. When the head changes, the loop re-observes the branch. The old gate no longer matches the new head, so the next dispatch is verify. `prepare-version` already returns the current head unchanged once `hasSynchronizedDeliveryState` holds, so repair loops never bump twice. On failure it throws `version_preparation_failed: <reason>`, taking the reason from the deliver handoff when the script wrote one and from stderr otherwise.

### Delivery backstop (`scripts/sdlc-deliver.mjs`)

Before it creates a pull request, delivery calls `hasSynchronizedDeliveryState` for the current `VERSION`. When that fails, delivery returns `fail(context, 'version_not_prepared', …, 'verify')`.

## Alternatives Considered

| Option | Decision |
|--------|----------|
| Ask the implement worker to run `prepare-version` | Rejected: a deterministic controller step cannot be skipped by a model |
| Bump during deliver | Rejected: a version commit after a passing gate is forbidden |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #482 | 2026-10-24 | Initial feature design |
