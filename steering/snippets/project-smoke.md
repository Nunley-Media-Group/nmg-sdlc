# nmg-sdlc Smoke Provisioning

This snippet is for nmg-sdlc's own verify worker. Provisioning is this project's steering, not plugin behavior. `tmux` is required only on machines that verify nmg-sdlc itself.

Run these steps before you run the registered gates, and only when `repository.nmg-sdlc-smoke` is registered and `NMG_SDLC_SMOKE_ISSUES` is unset or empty. With an explicit queue, skip provisioning: the gate delivers that queue.

The `repository.nmg-sdlc-smoke` gate never drafts an issue or writes a spec. It delivers only the issue named by the provisioning record `.nmg-sdlc/smoke/provisioned.json`, which holds `{ "schemaVersion": 1, "repo": "Nunley-Media-Group/nmg-sdlc-smoke", "issue": N, "provisionedAt": "<ISO time>" }`. A missing, invalid or stale record fails the gate with `nmg-sdlc-smoke smoke issue not provisioned`.

Below, `<project root>` is this nmg-sdlc checkout, `<head8>` is the first eight characters of its `HEAD` SHA, and `<need>` is `provision.need` from the `repository.nmg-sdlc-smoke` validation config in `steering/manifest.json`.

## 1. Reuse

Read `.nmg-sdlc/smoke/provisioned.json` when it exists. Check its issue with `gh issue view N -R Nunley-Media-Group/nmg-sdlc-smoke --json state,labels` and `gh pr list -R Nunley-Media-Group/nmg-sdlc-smoke --state merged --search "docs: approve spec for #N in:title"`.

- The issue is OPEN, carries `spec-created`, and its `docs: approve spec for #N` PR is merged: reuse it and go straight to the registered gates.
- The issue is OPEN with no published spec: reuse it and run only step 4 (and step 2 for its clone).
- Never draft a second issue while a recorded one is open.

Otherwise (no record, or the recorded issue is closed), provision a fresh issue with steps 2–5.

## 2. Clone

Clone `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git` with `--single-branch` into a fresh scratch directory. Confirm that `git remote get-url origin` names that repository and that `git status --porcelain` is empty.

## 3. Draft

Start an interactive Claude session that loads this checkout's plugin, in a detached tmux session in the clone:

```bash
tmux new-session -d -s nmg-smoke-<head8> -x 220 -y 60 -c <clone> 'claude --plugin-dir <project root>'
```

Accept the workspace trust dialog. Then:

- Send `/sdlc-draft-issue <need>` with `tmux send-keys -t nmg-smoke-<head8> '<text>' Enter`.
- Poll `tmux capture-pane -p -t nmg-smoke-<head8>` every 10–30 s, and answer each dialog with `tmux send-keys` as the person would.
- Approve a plan that delivers the need as one small issue in the smoke repository, and reject a plan that does anything else. Answer each question with the option that keeps the work one small issue in the smoke repository.
- Draft ends when the session is idle and `gh issue list -R Nunley-Media-Group/nmg-sdlc-smoke --author @me` shows exactly one new issue N. Write `.nmg-sdlc/smoke/provisioned.json` as soon as N exists, so a retry reuses N.

## 4. Specify

In the same session, send `/sdlc-write-spec #N` and answer its gates the same way. Choose `Finished — stop writing specs` when it offers another issue. Specify ends when N carries `spec-created` and its `docs: approve spec for #N` PR is merged.

## 5. Clean up

Kill the tmux session (`tmux kill-session -t nmg-smoke-<head8>`), remove the clone, and rewrite `.nmg-sdlc/smoke/provisioned.json` as `{ "schemaVersion": 1, "repo": "Nunley-Media-Group/nmg-sdlc-smoke", "issue": N, "provisionedAt": "<ISO time>" }`.

## 6. Classify failures

- **Environmental:** a missing `tmux` or `claude` binary, an unreadable pane, a dialog you cannot identify, or a GitHub or network failure. Report it as environmental and do not retry blindly.
- **nmg-sdlc defect:** a `/sdlc-draft-issue` or `/sdlc-write-spec` workflow that errors, ignores its gates, or produces a malformed issue or spec. Record it as a finding in the verification report.

In either case, do not hand-edit the smoke repository to manufacture provisioning, and leave the smoke gate non-passing.

## 7. Bound the work

Make one draft attempt per verification. A stalled session (no pane change for 10 minutes) is killed and reported, not restarted repeatedly.
