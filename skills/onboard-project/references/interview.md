# Greenfield Interview

**Read this when** Step 2G.1 of `references/greenfield.md` runs. The interview captures the seven inputs steering bootstrap (2G.2) and starter-issue generation (2G.4) consume. The same structure runs in interactive and unattended modes — the only difference is where each round's value comes from.

## Rounds (in order)

Conduct via `request_user_input` gate, one question per round. Open-ended rounds use the free-form `Other` answer as the stored value; predefined rounds map `Other` to a custom value before the workflow continues.

1. **Vision** — what is the product? *(open-ended)*
2. **Target users / personas** — who is it for? *(open-ended)*
3. **Success criteria** — how will you know it works? *(open-ended)*
4. **Language** — primary language (e.g., TypeScript, Python, Go)
5. **Framework** — primary framework if any (e.g., Next.js, FastAPI)
6. **Test tooling** — test framework + BDD tooling
7. **Deployment target** — where does this run? (e.g., Vercel, AWS Lambda, Cloudflare Workers, on-prem)

## Default-sourcing priority chain

For each round, the default presented to the user is sourced in this priority order:

1. (Enhancement mode) the existing value parsed from the relevant steering file (e.g., `# Mission` heading in `product.md` for vision).
2. The default in the steering template.

This ordering preserves prior decisions: an existing steering file always wins over a generic template default. Surfacing the chain explicitly lets a returning user re-confirm without re-typing what they already wrote.

## Unattended-mode branch

Skip all prompts. For each round, apply the default from the priority chain above. Log every applied default with its source label — `from existing steering` or `from template default` — into a list that Step 5's Summary Report emits under "Interview defaults applied". This gives the run an audit trail for any auto-applied value.

## Output

Store the answers as `interview_context` for use by 2G.2 (steering bootstrap), 2G.4 (starter-issue candidate generation), and 2G.6 (the seeding loop's per-issue body seeds).

## Why these seven rounds

The trio (vision/personas/success criteria) populates `product.md` and provides the framing every starter issue needs. The trio (language/framework/test tooling) is the minimum signal `tech.md` needs to drive `$nmg-sdlc:write-spec`'s technical-design phase. Deployment target rounds out `tech.md`'s constraints (e.g., serverless cold-start considerations vs. long-running server semantics). Skipping any round leaves a `tech.md` field unanswered and forces a follow-up edit later — better to ask once now.

Emit at the end: `Interview: complete (N rounds, K defaults applied unattended)`.
