# Tasks: Remove the Automated SDLC Loop and Unattended Mode

**Issue**: #151
**Status**: Complete

- [x] Remove legacy runner and unattended-mode product surfaces.
  - **File(s)**: `package.json`, `src/`, `commands/`, `skills/`, `scripts/`
- [x] Preserve explicit Herdr OMP execution and native-plan interactive workflows.
  - **File(s)**: `skills/execute/`, `src/sdlc-commands.mjs`, `commands/`
- [x] Keep migration cleanup bounded and non-destructive.
  - **File(s)**: `skills/upgrade-project/`, `scripts/sdlc-upgrade.mjs`
- [x] Verify the current plugin surface and ten acceptance scenarios.
  - **File(s)**: `scripts/__tests__/plugin-surface-verification.test.mjs`, `scripts/verify-plugin-surface.mjs`
