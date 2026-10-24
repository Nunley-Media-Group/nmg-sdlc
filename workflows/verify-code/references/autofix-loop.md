# Autofix Loop (v4)

**Consumed by**: verify-code after findings.

Safe local edits for clear findings only. Invoke the `skill-creator` skill with the `Skill` tool before editing any skill-bundled path, then follow its editing procedure.

Detector:
- paths under workflows/ (all subdirs), root references/, agents/*.md
- task/finding text mentions skill authoring

Resolution: load the installed `skill-creator` skill through the `Skill` tool. A repository-local `skills/` directory is not a prerequisite.

Apply minimal behavior preserving fix. Re-run tests + affected verification. Record "Fixes Applied" with routing note in report.

No user gates. All decisions by the automated review flow.

Fix rules:
- only findings that are local and unambiguous
- never broaden scope or change ACs
- after fix, the report must reflect the new state
