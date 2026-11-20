# nmg-sdlc Test Selection Conventions

These conventions apply to this repository's `gate:selection` answer.

- Each test id is a repository-relative Jest test file of the form `scripts/__tests__/<name>.test.mjs`, exactly as it appears in the changed paths and the diff. Never give a runner-relative id such as `__tests__/<name>.test.mjs`, a test name, a pattern, a directory, an absolute path or anything beginning with `-`: `scripts/jest-per-test-coverage.mjs` rejects them and the gate fails as `coverage_failed`.
- A test file is named for the module it covers: `src/sdlc-<name>.mjs` and `scripts/<name>.mjs` are exercised by `scripts/__tests__/<name>.test.mjs` or by a test whose name shares that module's subject. Select every test file whose subject the change can affect, including tests of modules that import a changed module.
- A changed test file must itself be selected.
- Surfaces follow the plugin's shape: one surface per interactive command workflow (`draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `steering`, `run-retro`), `execute` for the delivery stages, their agents and controller scripts, `status` and `verify-full` for those commands, `plugin-host` for `hooks/` and `.claude-plugin/`, `shared-references` for root `references/`, `project-steering` for `steering/`, `script-assets` for script fixtures and data files, and `ci` for `.github/`. Select a surface whenever the change touches its sources or a shared file it consumes.
