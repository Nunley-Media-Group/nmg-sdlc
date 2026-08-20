# Stale Remote Branch

Removed as an interactive gate in v3. `start-issue` never calls `ask` or `request_user_input`.

If `gh issue develop` cannot check out `{N}-{slug}`, write a failed handoff (`reasonCode: branch_checkout_failed`, `intervention: true`) and stop.
