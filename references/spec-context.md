# Spec Context

**Consumed by**: `write-spec`, `write-code`, `verify-code`, `open-pr`, `execute`.

Project-root `specs/` is the canonical BDD archive.

1. Identify the active spec: `specs/{N}-{slug}/` whose leading number equals the issue.
2. Load only that directory's executable artifacts.
3. Discover neighbors from `**Related Spec**` pointers and bounded metadata only.
4. Do not load the full archive by default.
5. There are no ownership manifests. Do not use leftover `issue-scope.json` as current authority.
6. Legacy `.codex/specs/` is upgrade input only.
