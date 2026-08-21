# Direct Task Execution (v3)

**Consumed by**: write-code.

In v3 there is no plan-mode approval, no request_user_input, and no <proposed_plan>. Load specs/{N}-{slug}/ only. Execute the tasks listed in tasks.md sequentially using the design and requirements as guidance. Skill-bundled paths must be routed through the skill-creator file on disk (if `skills/skill-creator/SKILL.md` is present) otherwise fail the handoff with skill_creator_missing.

See the SKILL.md for the exact flow.
