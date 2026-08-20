# Autofix Loop (v3)

**Consumed by**: verify-code after findings.

Safe local edits for clear findings only. Route skill-bundled exclusively via the skill-creator file on disk (if `skills/skill-creator/SKILL.md` present) else fail caller handoff with skill_creator_missing.

Detector:
- paths under skills/ (all subdirs), root references/, agents/*.md
- task/finding text mentions skill authoring

Probe: presence of the skill-creator file on disk via glob or `test -f skills/skill-creator/SKILL.md`.

If bundled path and creator absent → caller produces failed handoff intervention true.

Apply minimal behavior preserving fix. Re-run tests + affected verification. Record "Fixes Applied" with routing note in report.

No user gates. All decisions by the automated review flow.

Fix rules:
- only findings that are local and unambiguous
- never broaden scope or change ACs
- after fix, the report must reflect the new state
