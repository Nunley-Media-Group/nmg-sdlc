# Status Skill Exercise Fixture

This fixture records deterministic, read-only evidence for the manual lifecycle-status scenarios. `artifacts/status-pass.json` captures the evaluated output contract; `states/` contains the minimal input facts for specified, conflicting-evidence, and GitHub-unavailable cases. The evaluated criteria are documented in `../rubrics/status.md`.

The fixture contains no credentials, remote repository, background execution state, or mutable process. Tests materialize disposable git repositories in the operating-system temporary directory and remove them after each run.
