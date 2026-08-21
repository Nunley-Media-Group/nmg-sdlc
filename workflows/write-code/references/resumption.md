# Task Execution and Resumption (v3)

**Consumed by**: write-code.

Execute every task listed in tasks.md in order regardless of prior commits on the branch. The implementing agent observes existing code and git history to avoid unnecessary re-work but the contract is to ensure the Acceptance for each Txxx is satisfied.

No request_user_input gates. If prior work satisfies a task, the agent may skip the edit but must confirm the ACs. No separate resumption interview.

See main WORKFLOW.md.
