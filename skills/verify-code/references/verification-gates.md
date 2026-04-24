# Verification Gates (from `steering/tech.md`)

**Consumed by**: `verify-code` Step 1 (extract) and Step 5f (execute).

Steering-level verification gates let a project declare mandatory shell-command checks that run as part of every `/verify-code` pass — build-clean tests, security scanners, linters, skill-inventory audits, anything else the team wants enforced without baking it into the SKILL.md. The skill itself stays stack-agnostic: it only knows how to read gate rows from `steering/tech.md`, evaluate their conditions, run their Actions, and grade their Pass Criteria.

## Extracting gates (Step 1)

After loading `tech.md`, check whether it contains a `## Verification Gates` section.

- **If present**: parse each table row as a named gate with four fields:
  - **Gate** — human-readable name (used in the report).
  - **Condition** — when the gate applies (`Always`, `{path} directory exists`, `{glob} files exist in {path}`).
  - **Action** — shell command to execute.
  - **Pass Criteria** — how to determine success (`Exit code 0`, `{file} file generated`, compound `AND`).
- **If absent**: no gates are enforced. This is backward-compatible — projects without the section run through `/verify-code` unchanged.

Queue the extracted gates as mandatory steps for Step 5f execution.

## Executing gates (Step 5f)

For each extracted gate:

### 1. Evaluate Condition

| Condition | Evaluation |
|-----------|-----------|
| `Always` | Proceed to execution. |
| `{path} directory exists` | Check via `test -d {path}`. If the directory does not exist, **skip** this gate silently (do not report as Incomplete). |
| `{glob} files exist in {path}` | Check via file discovery or `ls {path}/{glob}`. If no matching files exist, **skip** this gate silently. |
| Uninterpretable | Record as **Incomplete** with reason `"Cannot evaluate condition: {reason}"`. |

### 2. Execute Action

- Run the Action command via `Bash`, capturing exit code, stdout, and stderr.
- Command not found / missing prerequisites → record as **Incomplete** with reason `"Tool unavailable: {details}"`.
- Command timed out → record as **Incomplete** with reason `"Command timed out"`.

### 3. Evaluate Pass Criteria

Parse the Pass Criteria string from the gate definition.

| Criterion | Check |
|-----------|-------|
| `Exit code 0` | The Action command exited with code 0. |
| `{file} file generated` | The named file exists on disk after the Action completes. |
| `output contains "{text}"` | Stdout or stderr contains the specified text. |
| Compound with `AND` | **All** sub-criteria must be satisfied. |

All sub-criteria pass → gate status is **Pass**. Any sub-criterion fails → gate status is **Fail**.

### 4. Record Result

Capture gate name, status (**Pass** / **Fail** / **Incomplete**), and evidence (output excerpt, artifact path, or blocker reason) for the verification report. The skill evaluates textual pass criteria against actual results; it contains no stack-specific logic — any shell command works as a gate action. Teams extend the set of gates by editing `steering/tech.md`, never by editing this skill.

## Gate-status aggregation

Gate results act as a **ceiling** on the overall verification status — they can lower it but never raise it:

| Gate Results | Overall Status Impact |
|-------------|----------------------|
| All gates Pass | No effect (status determined by other factors) |
| Any gate Fail | Overall status cannot exceed "Partial" |
| Any gate Incomplete | Overall status cannot exceed "Incomplete" |
| Mix of Fail and Incomplete | Overall status cannot exceed "Incomplete" |
| No `## Verification Gates` section | No effect (backward-compatible) |

Status hierarchy from best to worst: **Pass > Partial > Incomplete > Fail**.
