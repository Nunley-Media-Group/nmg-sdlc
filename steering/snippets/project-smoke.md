# nmg-sdlc Smoke Provisioning

This snippet is for nmg-sdlc's own verify worker. Provisioning and surface exercise are this project's steering, not plugin behavior. `tmux` is required only on machines that verify nmg-sdlc itself.

Run these steps before you run the registered gates, and only when `repository.nmg-sdlc-smoke` is registered. Smoke is scoped to the surfaces selected for the change: you exercise each selected interactive command surface live and prove it with a head-bound record, and the gate runs the `execute` surface itself as one full provisioned delivery.

The `repository.nmg-sdlc-smoke` gate never drafts an issue, writes a spec or drives an interactive command. When `execute` is selected, it delivers only the issue named by the provisioning record `.nmg-sdlc/smoke/provisioned.json`, which holds `{ "schemaVersion": 1, "repo": "Nunley-Media-Group/nmg-sdlc-smoke", "issue": N, "provisionedAt": "<ISO time>" }`. A missing, invalid or stale record fails the gate with `nmg-sdlc-smoke smoke issue not provisioned`. With an explicit `NMG_SDLC_SMOKE_ISSUES` queue, skip provisioning for `execute`: the gate delivers that queue.

Surface records are bound to `<head>`. Under `/sdlc-execute` the version commit prepared at the queue head moves the head, so the gate-phase verify at the queue head drives every selected interactive surface live again; that repeat is expected and costs one live exercise per selected surface.

Below, `<project root>` is this nmg-sdlc checkout, `<head>` is its full `HEAD` SHA, `<head8>` is the first eight characters of it, and `<need>` is `provision.need` from the `repository.nmg-sdlc-smoke` validation config in `steering/manifest.json`.

## 1. Select

Run the selection ahead of the gate:

```bash
node <plugin-root>/scripts/sdlc-verify-steering.mjs --project . --issue N --spec specs/N-SLUG --base main --mode select [--controller-run-id R]
```

When the worker header provides a non-empty controller run id, replace `[--controller-run-id R]` with `--controller-run-id R` using that exact value: under `/sdlc-execute` the controller lease is held by that run id, so the selection must run under it. Omit the option only for standalone verification.

It prints `{ ok: true, selection }`, and `selection.surfaces` names the selected surfaces. The smoke surfaces are the interactive `draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `steering` and `run-retro`, plus `execute`. Ignore any other selected surface id.

- When no smoke surface is selected, do nothing more here: the gate records `surface_not_selected`.
- Provision (steps 2–5) only when `execute`, `draft-issue` or `write-spec` is selected.
- When `draft-issue` or `write-spec` is selected, provision a fresh smoke issue: provisioning it is how those surfaces are exercised. When only `execute` is selected, the recorded issue may be reused (step 2).
- Exercise every other selected interactive surface in step 6.

## 2. Reuse

Only when `execute` is the only provisioning surface selected. Read `.nmg-sdlc/smoke/provisioned.json` when it exists. Check its issue with `gh issue view N -R Nunley-Media-Group/nmg-sdlc-smoke --json state,labels` and `gh pr list -R Nunley-Media-Group/nmg-sdlc-smoke --state merged --search "docs: approve spec for #N in:title"`.

- The issue is OPEN, carries `spec-created`, and its `docs: approve spec for #N` PR is merged: reuse it and go to step 6, or straight to the registered gates.
- The issue is OPEN with no published spec: reuse it and run only step 5 (and step 3 for its clone).
- Never draft a second issue while a recorded one is open.

Otherwise (no record, or the recorded issue is closed), provision a fresh issue with steps 3–5.

## 3. Clone

Clone `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git` with `--single-branch` into a fresh scratch directory. Confirm that `git remote get-url origin` names that repository and that `git status --porcelain` is empty. Every exercised surface runs against a fresh clone.

## 4. Draft

Start an interactive Claude session that loads this checkout's plugin, in a detached tmux session in the clone:

```bash
tmux new-session -d -s nmg-smoke-<head8> -x 220 -y 60 -c <clone> 'claude --plugin-dir <project root>'
```

Accept the workspace trust dialog. Then:

- Capture the draft transcript as step 6 describes: empty `.nmg-sdlc/smoke/surfaces/draft-issue.log` with `: > .nmg-sdlc/smoke/surfaces/draft-issue.log`, type `/sdlc-draft-issue <need>` with `tmux send-keys -t nmg-smoke-<head8> '/sdlc-draft-issue <need>'` without `Enter`, append a capture with `tmux capture-pane -p -J -S - -t nmg-smoke-<head8> >> .nmg-sdlc/smoke/surfaces/draft-issue.log`, then send `Enter` with `tmux send-keys -t nmg-smoke-<head8> Enter`.
- Poll every 10–30 s by appending the pane to `.nmg-sdlc/smoke/surfaces/draft-issue.log` with the same capture, and answer each dialog with `tmux send-keys` as the person would.
- Approve a plan that delivers the need as one small issue in the smoke repository, and reject a plan that does anything else. Answer each question with the option that keeps the work one small issue in the smoke repository.
- Draft ends when the session is idle and `gh issue list -R Nunley-Media-Group/nmg-sdlc-smoke --author @me` shows exactly one new issue N. Write `.nmg-sdlc/smoke/provisioned.json` as soon as N exists, so a retry reuses N.
- When `draft-issue` is selected, write its surface record (step 6) with `"issue": N`.

## 5. Specify

In the same session, capture the specify transcript as step 6 describes for `write-spec`: empty `.nmg-sdlc/smoke/surfaces/write-spec.log`, type `/sdlc-write-spec #N` without `Enter`, append a capture, then send `Enter`. Answer its gates the same way, appending the pane to the log at every poll. Choose `Finished — stop writing specs` when it offers another issue. Specify ends when N carries `spec-created` and its `docs: approve spec for #N` PR is merged. When `write-spec` is selected, write its surface record (step 6) with `"issue": N`; the gate also checks that N's spec is published.

## 6. Exercise surfaces

For each selected interactive surface, drive its real command live in an interactive `claude --plugin-dir <project root>` session inside a detached tmux session against a fresh clone of `Nunley-Media-Group/nmg-sdlc-smoke`, as in step 4: `/sdlc-draft-issue` (`draft-issue`), `/sdlc-write-spec #N` (`write-spec`), `/sdlc-onboard-project` (`onboard-project`), `/sdlc-upgrade-project` (`upgrade-project`), `/sdlc-steering` (`steering`) and `/sdlc-run-retro` (`run-retro`). Answer each dialog and approve the plan yourself, keeping the work small and inside the smoke clone. Steps 4 and 5 exercise `draft-issue` and `write-spec`.

Save each surface's transcript over the whole session, not as one final screen: an interactive session redraws in place, so the pane history keeps only the last screen. Under `<project root>`, before the surface's command is sent, empty its log with `: > .nmg-sdlc/smoke/surfaces/<surface>.log`. Type the command with `tmux send-keys -t <session> '<text>'` without `Enter`. After the command is typed and before `Enter` is sent, append a capture of the pane with `tmux capture-pane -p -J -S - -t <session> >> .nmg-sdlc/smoke/surfaces/<surface>.log`, then send `Enter`. Append the same capture at every poll and once more when the command finishes. `-J` joins wrapped lines.

When the command finishes, write `.nmg-sdlc/smoke/surfaces/<surface>.json`:

```json
{ "schemaVersion": 1, "repo": "Nunley-Media-Group/nmg-sdlc-smoke", "surface": "<surface>", "headSha": "<head>", "status": "passed", "command": "<the command you sent>", "transcript": ".nmg-sdlc/smoke/surfaces/<surface>.log", "issue": N }
```

`issue` is required for `draft-issue` and `write-spec` and omitted otherwise. Write `"status": "passed"` only when the command completed its workflow; otherwise write `"failed"`. A missing, stale (another `headSha`), malformed or failed record fails the gate with `nmg-sdlc-smoke surface not exercised: <surface>`. The transcript must be a non-empty regular file under `.nmg-sdlc/smoke/surfaces/`, and it must contain the record's `command` with whitespace ignored, because a long command wraps over several pane lines. A transcript without the sent command fails the gate with `nmg-sdlc-smoke surface not exercised: <surface>`.

## 7. Clean up

Kill each tmux session (`tmux kill-session -t <session>`), remove each clone, and, when you provisioned, rewrite `.nmg-sdlc/smoke/provisioned.json` as `{ "schemaVersion": 1, "repo": "Nunley-Media-Group/nmg-sdlc-smoke", "issue": N, "provisionedAt": "<ISO time>" }`.

## 8. Classify failures

- **Environmental:** a missing `tmux` or `claude` binary, an unreadable pane, a dialog you cannot identify, or a GitHub or network failure. Report it as environmental and do not retry blindly.
- **nmg-sdlc defect:** an exercised command (`/sdlc-draft-issue`, `/sdlc-write-spec` or another selected surface) whose workflow errors, ignores its gates, or produces a malformed issue, spec or result. Record it as a finding in the verification report.

In either case, do not hand-edit the smoke repository to manufacture provisioning, do not write a passed surface record for a command that did not complete, and leave the smoke gate non-passing.

## 9. Bound the work

Make one attempt per selected surface per verification. A stalled session (no pane change for 10 minutes) is killed and reported, not restarted repeatedly.
