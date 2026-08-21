# Escalation (v3)

Any ambiguous / disagreement / human thread → immediately failed handoff with intervention true, reasonCode human_review or ambiguous_thread.

No request_user_input, no menus, no "fix anyway".

Control returns to open-pr which will keep the worker pane and stop queue.
