# PR Body Templates (v3)

**Consumed by**: open-pr.

Title: feat: desc (#N) or fix: ...

Body templates drop all epic "Bump:" lines and intermediate/final notes.

## Template A (specs present)
## Summary
...
## Acceptance Criteria
(from requirements delivery slice)
## Test Plan
...
## Version
**{bump}** bump: {old} → {new}
## Specs
- requirements: specs/N-slug/...
Closes #N

## Template B (no specs)
Fallback to issue body ACs. Same version block if bump applied.

No epic-child language.
