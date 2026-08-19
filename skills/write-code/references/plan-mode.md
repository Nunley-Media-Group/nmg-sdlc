# Direct Task Execution (v3)

**Consumed by**: write-code.

In v3 there is no plan-mode approval, no request_user_input, and no <proposed_plan>. Load specs/{N}-{slug}/ only. Execute the tasks listed in tasks.md sequentially using the design and requirements as guidance. Skill-bundled paths must be routed through /skill:skill-creator when available in the loaded set, otherwise fail the handoff with skill_creator_missing.

See the SKILL.md for the exact flow.
