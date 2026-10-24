# Direct Task Execution (v4)

**Consumed by**: write-code.

In v4 there is no plan-mode approval, no request_user_input, and no <proposed_plan>: the worker never calls `AskUserQuestion`, `EnterPlanMode`, or `ExitPlanMode`. Load specs/{N}-{slug}/ only. Execute the tasks listed in tasks.md sequentially using the design and requirements as guidance. Invoke the `skill-creator` skill with the `Skill` tool before editing any skill-bundled path, then follow its editing procedure.

See the WORKFLOW.md for the exact flow.
