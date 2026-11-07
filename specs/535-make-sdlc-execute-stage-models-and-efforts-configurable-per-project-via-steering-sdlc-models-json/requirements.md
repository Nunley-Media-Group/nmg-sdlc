# Requirements: Make /sdlc-execute stage models and efforts configurable per project via steering/sdlc-models.json

**Issue**: #535
**Date**: 2026-11-07
**Status**: Approved
**Author**: Rich Nunley

## User Story

**As a** developer delivering issues with `/sdlc-execute`
**I want** the model and effort of each execute stage session to be defined in a committed project file
**So that** I can tune cost and quality per stage, including with `provider/model` ids added by nmg-router, without changing the plugin

## Background

`/sdlc-execute` starts each stage worker as a Herdr Claude session with `--model <model>` and, for some stages, `--effort <effort>`. Today the values are fixed in `src/host-events.mjs` (`SDLC_MODELS.stages`, `SDLC_MODELS.repair`, `SDLC_EFFORTS.stages`) and read by `stageModel`, `stageEffort`, and `workerAgentArgs` in `scripts/sdlc-execute.mjs`: start haiku, implement haiku/xhigh, verify opus, deliver haiku/xhigh, and repair re-dispatch opus with no effort. `/sdlc-onboard-project` and `/sdlc-upgrade-project` manage `steering/` but create no model/effort file.

The new project file is `steering/sdlc-models.json`:

```json
{
  "version": 1,
  "start": { "model": "haiku", "effort": "default" },
  "implement": { "model": "haiku", "effort": "xhigh" },
  "verify": { "model": "opus", "effort": "high" },
  "deliver": { "model": "haiku", "effort": "xhigh" },
  "repair": { "model": "opus", "effort": "default" }
}
```

Effort `default` means no `--effort` flag is passed, so the worker keeps the user's Claude Code effort setting.

## Acceptance Criteria

### AC1: Onboard creates the file with defaults

**Given** a project without `steering/sdlc-models.json`
**When** `/sdlc-onboard-project` applies its approved plan
**Then** `steering/sdlc-models.json` exists with `version` 1 and a `model` and `effort` entry for `start`, `implement`, `verify`, `deliver`, and `repair`, populated with the plugin defaults

### AC2: Defaults match today except verify effort

**Given** the plugin default table
**When** the defaults are read
**Then** they are start haiku/default, implement haiku/xhigh, verify opus/high, deliver haiku/xhigh, repair opus/default, where `default` means no `--effort` flag is passed

### AC3: Upgrade creates or completes the file without changing project values

**Given** a project whose `steering/sdlc-models.json` is absent, or present and valid but missing some keys
**When** `/sdlc-upgrade-project` applies its approved plan
**Then** an absent file is created with defaults, a partial file gains only the missing keys with default values, every value the project already set is preserved, and a re-run on a complete file reports no `sdlc-models` item and produces no diff

### AC4: Stage workers use project values

**Given** `steering/sdlc-models.json` sets verify to model `sonnet` and effort `max`
**When** `/sdlc-execute` dispatches the verify worker
**Then** the worker argv contains `--model sonnet --effort max`, and a stage whose effort is `default` gets no `--effort` flag

### AC5: Repair re-dispatch uses the project repair entry

**Given** `steering/sdlc-models.json` sets repair to model `opus` and effort `high`
**When** a repairable failure triggers the next implement, verify, or deliver dispatch
**Then** that worker argv contains `--model opus --effort high`, and the next dispatch after the stage passes uses the stage entry again

### AC6: Missing file falls back to plugin defaults

**Given** a project without `steering/sdlc-models.json`
**When** `/sdlc-execute` dispatches any stage
**Then** the worker argv uses the AC2 defaults, and the execute controller output contains exactly one warning per invocation that `steering/sdlc-models.json` is missing, plugin defaults are in use, and `/sdlc-upgrade-project` creates it

### AC7: nmg-router models are accepted and passed through verbatim

**Given** `steering/sdlc-models.json` sets implement to model `opencode-go/kimi-k3.1-pro` with effort `xhigh`
**When** the implement worker is dispatched
**Then** validation accepts the id without consulting any provider list, and the worker argv contains `--model opencode-go/kimi-k3.1-pro --effort xhigh` unchanged

### AC8: Invalid configuration fails closed

**Given** `steering/sdlc-models.json` is not valid JSON, has an unknown top-level key, names a model that is neither a Claude alias, a `claude-*` id, nor a well-formed `provider/model` id, or names an effort outside `low`, `medium`, `high`, `xhigh`, `max`, `default`
**When** `/sdlc-execute` starts
**Then** it exits with status 2 before any Herdr, Git, or GitHub call and prints a diagnostic naming `steering/sdlc-models.json` and the offending key and value

### AC9: Supervisor model check is unaffected

**Given** a project file that configures any stage models
**When** `/sdlc-execute` starts
**Then** the Opus/Fable supervisor session check in `executeModelRefusal` behaves exactly as today and reads no project model file

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Define a versioned JSON schema for `steering/sdlc-models.json`: `version` 1 plus `start`, `implement`, `verify`, `deliver`, and `repair` entries, each holding string `model` and `effort` | Must |
| FR2 | Change the plugin default effort for the verify stage to `high`; all other defaults unchanged | Must |
| FR3 | Onboard writes the defaults file when absent; upgrade creates it when absent and adds only missing keys when present and valid, preserving every project value | Must |
| FR4 | Execute stage and repair dispatch resolve model/effort from the project file, falling back to plugin defaults for an absent file or absent keys and warning once per invocation to run `/sdlc-upgrade-project` | Must |
| FR5 | Model validation accepts Claude aliases, `claude-*` ids, and syntactically valid `provider/model` ids (non-empty provider without `/` or whitespace that does not start with `-`, non-empty model without whitespace); model availability is not checked | Must |
| FR6 | Configured model and effort strings pass to `herdr agent start … -- --model … --effort …` verbatim; effort `default` omits the flag | Must |
| FR7 | Validate the file before any Herdr, Git, or GitHub call and fail closed with exit status 2 and a diagnostic naming file, key, and value | Must |
| FR8 | Update README to document the feature: the Models section (file, schema example, defaults, `default` effort, accepted model forms including `provider/model`, fail-closed validation, missing-file warning), the onboarding/upgrade managed-asset list, the steering configuration section, and a troubleshooting entry for an invalid or missing file | Must |

## Out of Scope

- Models or efforts of `/sdlc-*` slash commands, including `/sdlc-execute`'s supervisor session
- Plugin subagent frontmatter in `agents/*.md`
- Per-issue or per-invocation overrides (CLI flags, environment variables)
- Checking whether a `provider/model` id is logged in or available
- Changes to nmg-router

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #535 | 2026-11-07 | Initial feature spec |
