# Improve nmg-sdlc steering and add smoke verify

## Context

`/sdlc-steering` inspect is valid. User asked what the current steers are and how to improve them, then required a live smoke against `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke` on every verify, plus the factual snippet fixes already identified.

Inspect digest to embed in the apply plan: `sha256:7c1c10ccd44d92bc8a0f98237ff122b60bfe98518265a24236509d77dfd2a6aa`.

Mode: `update`. Never edit live steering by hand. Apply only `local://steering-update.plan.json`.

## Current steers

Runtime is valid (`steeringHash` `sha256:b70cdad7bc95493afdf803f0653d55897cb81bf08e5ee7e11e33ba393056b2e4`, `registrationHash` `sha256:00421fbb5a8e582c86495081fac83efd4d61f9a156cff05fb7bede481aaa6c8f`).

Managed modules (do not rewrite): `steering/modules/{product,tech,structure,verification}.mjs`.

Registered snippets:

| id | path | consumers | slot | order |
|----|------|-----------|------|-------|
| `project.product` | `steering/snippets/project-product.md` | `sdlc-draft-issue`, `sdlc-write-spec` | `body` | 500 |
| `project.tech` | `steering/snippets/project-tech.md` | `sdlc-write-spec`, `worker:implement`, `worker:verify`, `worker:deliver` | `body` | 500 |
| `project.structure` | `steering/snippets/project-structure.md` | `sdlc-write-spec`, `worker:implement`, `worker:verify` | `body` | 500 |

Project snippets and plugin fragments are unbounded. Prompt provenance may record observed byte counts, but prompt length never rejects a structurally valid render.

Extensions: none.

Validations: one required always gate, `repository.tests` → `npm test -- --runInBand` in `scripts/`, no wall-clock deadline, `env` `["CI"]`.

Unknown project files to preserve (do not delete, do not register): `steering/retrospective.md`, `steering/retrospective-state.json`.

## Approach

1. Re-run inspect immediately before apply. If `sourceDigest` is not `sha256:7c1c10ccd44d92bc8a0f98237ff122b60bfe98518265a24236509d77dfd2a6aa`, stop and report `steering_plan_stale`. Do not rewrite the plan.

2. Apply the already-built writer plan. Do not assemble a new JSON.

```bash
node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-steering.mjs" apply --project . --plan "/Users/rnunley/.omp/agent/sessions/--Volumes-Fast Brick-source-repos-nmg-sdlc--/2026-08-26T03-12-08-677Z_01a03c0d-bde5-7227-af63-0036d755a751/local/steering-update.plan.json"
```

Cwd: `/Volumes/Fast Brick/source/repos/nmg-sdlc`.

That plan is `schemaVersion` 1, `mode` `update`, `sourceDigest` as above, five writes, no deletes:

- `steering/snippets/project-product.md` — drop empty future Should Have; promote shipped items (`/sdlc-run-retro`, digest-bound upgrade, contribution gate/issue form, historical spec reconciliation) into Must Have; add Must Have + success metric for live smoke against `Nunley-Media-Group/nmg-sdlc-smoke`. Consumers stay `sdlc-draft-issue`, `sdlc-write-spec`.
- `steering/snippets/project-tech.md` — delete the stale `3.1.0` pin; replace it with “Never pin a live version number in this snippet.” Remove the v3-landing skill-creator exemption. Add testing-layer + verification-gate + evidence-boundary rows for `repository.nmg-sdlc-smoke`. State that the smoke clone is read-only (no issues/branches/PRs/comments). Clone/`omp`/network failure is `Incomplete`; completed exercise without `/sdlc-` `nextAction.command` is `Fail`. Consumers stay `sdlc-write-spec`, `worker:implement`, `worker:verify`, `worker:deliver`.
- `steering/snippets/project-structure.md` — layout lists `src/sdlc-*.mjs`, `CONTRIBUTING.md`, and `steering/{manifest.json,modules,snippets,extensions}`. Note retro files are unregistered. Remove the v3-landing hand-edit exemption. Add runtime-library and `steering/extensions/*.mjs` rows. Consumers stay `sdlc-write-spec`, `worker:implement`, `worker:verify`.
- `steering/extensions/nmg-sdlc-smoke.mjs` — frozen export `extension` with `schemaVersion` 1, `id` `"project.nmg-sdlc-smoke"`, provider `project.nmg-sdlc-smoke`. Provider `runSmoke(request)`:
  - `git clone --depth 1 --single-branch https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git` into `mkdtempSync(join(tmpdir(), "nmg-sdlc-smoke-"))`.
  - On clone error/nonzero: `incomplete`, evidence kind `command`.
  - Spawn `process.execPath` with `[join(request.projectRoot, "scripts/exercise-omp.mjs"), "--cwd", work, "--", "/sdlc-status", "--json"]`, pass `request.signal`, and wait without a wall-clock deadline.
  - Launch error, explicit cancellation, or confirmed process loss: `incomplete`. Nonzero exit: `failed`. Unparseable JSON or `nextAction.command` not a string starting with `/sdlc-`: `failed`. Else `passed` with summary `nmg-sdlc-smoke status next ${command}`.
  - Always `rmSync(work, { recursive: true, force: true })`.
  - Return `request.identity` unchanged. `passed` always includes nonempty evidence.
- `steering/manifest.json` — keep the four `managedFiles`/`modules` hashes exactly as inspect returned. Keep `repository.tests` unchanged. Add:
  - `extensions`: `[{ "id": "project.nmg-sdlc-smoke", "path": "steering/extensions/nmg-sdlc-smoke.mjs", "providers": ["project.nmg-sdlc-smoke"] }]`
  - `validations` second row: `id` `repository.nmg-sdlc-smoke`, `provider` `project.nmg-sdlc-smoke`, `required` true, `when` `{ "kind": "always" }`, `config` `{}`.

3. Validate:

```bash
node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-steering.mjs" validate --project .
```

4. On `steering_plan_stale`, staged validation failure, or apply failure: print the stable `reasonCode` and stop. No unapproved retry. No second apply.

Do not rewrite managed modules. Do not touch `steering/retrospective.md` or `steering/retrospective-state.json`. Do not add skill-inventory or plugin-surface steering validations. Do not change snippet consumers. Do not run `/sdlc-execute` against the smoke repo.

## Critical files & anchors

- `local://steering-update.plan.json` — sole apply payload.
- `src/sdlc-verification-runtime.mjs` `runSteeringValidations` — verify-code already runs every required always validation; no workflow edit.
- `scripts/exercise-omp.mjs` `exerciseOmpArgs` — loads `src/extension.ts` from this checkout via `--plugin-dir` / `--extension`.
- `scripts/sdlc-status.mjs` `renderJson` / `nextAction.command` — pass predicate.

## Verification

Prereqs: cwd repo root; `gh` can read the public smoke repo; `omp` on PATH for the smoke provider; inspect digest still matches.

1. Apply JSON `ok: true`, `mode: "update"`, `paths` exactly the five writes above. Print returned `steeringHash` and `registrationHash`.
2. Validate JSON `ok: true` with the same hashes.
3. `steering/retrospective.md` and `steering/retrospective-state.json` unchanged (`cmp` against `HEAD` if committed, else confirm still present and unedited).
4. `node scripts/sdlc-steering.mjs inspect --project .` → `state: "valid"`, snippets/extensions/validations match the new manifest, no extra registrations.
5. Required new-behavior check: `node scripts/sdlc-verify-steering.mjs --project . --issue 1 --spec specs/<any-complete-package> --base HEAD` (use an existing complete `specs/{N}-{slug}/` directory). Expect `.omp/sdlc/verification/1.json` (or that issue number) to contain `repository.nmg-sdlc-smoke` with `applicable: true` and `effectiveStatus` `passed` or, if clone/`omp`/network is unavailable, `incomplete` — never omitted and never `skipped`. `repository.tests` still present.

If apply fails, report `reasonCode` only.

## Assumptions & contingencies

- If inspect digest changed before apply: stop (`steering_plan_stale`); do not regenerate the plan in this execution.
- If `omp` is missing during post-apply smoke proof: record `incomplete` as the observed gate result; do not weaken `required` or `when`.
- If GitHub clone is rate-limited: same `incomplete` path; do not switch the provider to a local fixture.
