# Deterministic Verification Gates

**Consumed by**: `verify-code` before report aggregation.

`steering/manifest.json` declares validation records. The workflow never parses executable commands or pass criteria from prose.

Run `scripts/sdlc-verify-steering.mjs` for the active issue and read `.omp/sdlc/verification/<issue>.json`. Core owns:

- the closed `always`, `changed_paths`, `path_exists`, and `glob_exists` applicability grammar;
- provider resolution and provider-specific configuration validation;
- explicit command program/argv execution with `shell: false`;
- schema validation for artifact and external-evidence providers;
- head, tree, spec, steering, and validation-config identity;
- exact declaration/result coverage, including missing, duplicate, and unknown validation ids;
- conversion of applicable provider `skipped` or `not_applicable` results to `incomplete`; and
- the required-result verification ceiling.

Coverage is complete only when every declared validation id has exactly one result and no undeclared id appears. Zero declarations plus zero results is complete; an empty result array alone is not an error. Missing, duplicate, or unknown declared-result coverage caps overall status at `Incomplete`.

When coverage is complete, only an effective `passed` result with non-empty evidence satisfies an applicable required validation. A required `failed` result caps overall status at `Fail`. A required `incomplete` result, invalid runtime, unresolved provider, crash, timeout, malformed output, or stale identity caps overall status at `Incomplete`. Optional results remain evidence but do not cap status.

The JSON artifact is authoritative. Prompt prose, project snippets, and report prose cannot suppress, mutate, or raise a core result. `Pass` and `PR Evidence Pending` remain forbidden until coverage is complete and every applicable required validation passed.
