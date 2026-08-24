# Verification Report: Installed controller dispatch

**Issue**: #252
**Date**: 2026-08-24
**Status**: Pass

## Packaged topology

- Built `nmg-sdlc-3.10.4.tgz` with `npm pack` from the issue branch.
- Extracted the tarball into a disposable copied-package directory.
- Installed that copied candidate with the supported `omp plugin install <candidate-directory>` command.
- OMP reported the enabled plugin as `nmg-sdlc` at `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc`.
- Exercised from disposable consumer `/private/var/folders/46/dqllytqs0sg2xdfglxddcf500000gn/T/tmp.uX1Iwy2a6P/consumer`.
- The consumer contained no `scripts/` directory and no project-local `.omp` command override.
- The proof did not use `--plugin-dir` or `--add-dir`.

The actual OMP-dispatched controllers were observed with:

```text
NODE_OPTIONS=--import=<disposable>/controller-cwd-preload.mjs \
NMG_SDLC_CWD_PROBE=<disposable>/controller-cwd.log \
omp --model openai-codex/gpt-5.6-sol --print --no-session --max-time 120 "/sdlc-status --json"
```

The same preload environment was used for empty `/sdlc-execute` and explicit `/sdlc-execute #1`. The preload only appended `process.argv[1]` and `process.cwd()` when argv[1] ended in `scripts/sdlc-status.mjs` or `scripts/sdlc-execute.mjs`.

## Observations

| Invocation | Observed result |
|---|---|
| `/sdlc-status --json` | Reached the installed `sdlc-status.mjs` controller without `MODULE_NOT_FOUND`; JSON reported `project.root` as the disposable consumer real path. |
| `/sdlc-execute` | Reached the installed execute controller and returned its structured `{"ok":false,"reasonCode":"issues_unreadable"}` result because the disposable repository has no GitHub remote. |
| `/sdlc-execute #1` | Reached the same installed execute controller and returned the same non-mutating `issues_unreadable` boundary in the remote-free fixture. |

The status preload captured `argv1` as `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-status.mjs` and `cwd` as the disposable consumer real path. The two execute invocations each captured the identical installed argv1, `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-execute.mjs`, and the same consumer cwd. The copied-install and Unix-symlink topology probes also appended one consumer-cwd line each, proving one CLI execution for those topologies. Neither execute invocation reached worker startup, so main-pane mutation and sibling-worker ownership remained unchanged.

## Automated evidence

- Focused controller, extension-command, start-issue, and prompt-byte tests: 27 passed, one platform skip.
- Full Jest suite: 470 passed, two platform/fixture skips.
- `node scripts/verify-plugin-surface.mjs --root . --label repository`: passed.
- After the disposable proof, the ambient `nmg-sdlc` 3.10.4 plugin was restored from its repository origin; `omp plugin list --json` reported it enabled at `/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc`.
