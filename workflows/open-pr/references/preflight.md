# Delivery Preparation (v3)

Inspect dirty, stage only approved paths (never -A), apply version artifacts (now automatic), create delivery commit or chore bump, fetch+safe merge base, push (no force), verify no unpushed + ancestor.

Version prep now happens before commit decision per open-pr caller.

Conflicts on version files are hard errors.

No epic language.
