# Design: Migrate v3 Oh My Pi references and move AGENTS.md to CLAUDE.md during /sdlc-upgrade-project

**Issue**: #469
**Date**: 2026-10-24
**Status**: Approved
**Author**: Rich Nunley

## Overview

Add three detector/apply groups to `scripts/sdlc-upgrade.mjs`, next to the existing v4 constants (`LEGACY_AGENTS_COMMENT_RE`, `V4_AGENTS_COMMENT`):

- `steering-v4-host-language` rewrites host tokens in registered snippets and in manifest validations, plus OMP prose in snippets. It writes only through the shared steering writer.
- `contributing-v4-host-language` replaces one exact v3 sentence anywhere in `CONTRIBUTING.md`.
- `agents-to-claude-md` moves root `AGENTS.md` to `CLAUDE.md`, renaming it or merging it into an existing `CLAUDE.md`.

The project instructions contract and onboarding switch to `CLAUDE.md`. The upgrade documentation describes the new groups. This repository moves its own `AGENTS.md` to `CLAUDE.md` and drops its legacy `.omp/sdlc/` ignore rule.

## Architecture

### Shared constants (`scripts/sdlc-upgrade.mjs`)

```js
// Longest-first, so `.omp/sdlc/` is consumed before `.omp/sdlc`.
const V3_STEERING_TOKEN_MAP = [
  ['herdr integration install omp', 'herdr integration install claude'],
  ['omp-sdlc-ignore.mjs', 'nmg-sdlc-ignore.mjs'],
  ['exercise-omp.mjs', 'exercise-claude.mjs'],
  ['omp --print', 'claude -p'],
  ['--kind omp', '--kind claude'],
  ['--kind pi', '--kind claude'],
  ['.omp/sdlc/', '.nmg-sdlc/'],
  ['.omp/sdlc', '.nmg-sdlc'],
];
const V3_STEERING_PROSE_RE = /Oh My Pi|\bOMP\b/g;   // case-sensitive; replaced with `Claude Code`
const V3_CONTRIBUTING_SENTENCE = 'drives Herdr omp worker panes through implementation, verification, and delivery';
const V4_CONTRIBUTING_SENTENCE = 'drives Herdr Claude worker panes through implementation, verification, and delivery';
```

A single helper `rewriteV3HostTokens(text)` applies the token map through one combined escaped alternation regex built in map order. That way a replacement is never rescanned, and lowercase `omp` is rewritten only inside a mapped token. Snippets then get the prose regex. Manifest strings get the token map only.

### `steering-v4-host-language`

`planSteeringHostLanguage(root)` is pure and read-only. It is used both by detect and, from live state, by apply:

1. If `steering/manifest.json` is missing, a symlink, or not parseable JSON, return `null` (no item).
2. For each registered `manifest.snippets[].path`:
   - If the path doesn't start with `steering/snippets/`, or `lstat` shows a symlink, a non-regular file, or an unreadable file, record `{ path, reasonCode: 'steering_host_language_unsafe_path' }` in `unverifiable` and skip it.
   - Otherwise split the text into lines, preserving line endings. For each line containing a token or prose match, record `{ file, line, before, after }`, where `after` is the token rewrite followed by the prose rewrite. The rewritten file content is the line join, so bytes outside the matches are unchanged.
3. For each `manifest.validations[]` with an object `config`:
   - If `config.program === 'omp'`, set it to `claude` and record `{ validationId, field: 'config.program', before: 'omp', after: 'claude' }`. In that same validation, every `config.args` element equal to `--print` becomes `-p`.
   - Any other string `config.program` or `config.args[i]` goes through `rewriteV3HostTokens`.
   - Each change records `{ validationId, field: 'config.args[i]', before, after }`.
4. If there are no occurrences, return `null`, even when `unverifiable` is non-empty. This keeps repeat runs idempotent.
5. Otherwise return `{ occurrences, unverifiable, plan }`. `plan` is `{ schemaVersion: 1, mode: 'update', sourceDigest: steeringSourceDigest(root), actions }`, with one `write` action per changed snippet (full rewritten content) and, when a validation changed, a `write` of `steering/manifest.json` as `JSON.stringify(manifest, null, 2) + '\n'` (the same serialization as `detectCurrentSteeringManifestRepair`).

Detect pushes `{ id: 'steering-v4-host-language', kind: 'steering-v4-host-language', description, occurrences, unverifiable, actionable: true }`. The description summarizes the counts. The workflow's category question shows every occurrence's before/after.

`applySteeringHostLanguage(root, item)` re-plans from live state. Earlier approved groups, such as a `steering-runtime` byteBound repair, then can't make the digest stale.
- If the plan is `null`, return `already-current`.
- If `unverifiable.length > 0`, return `{ status: 'skipped:unverifiable', reasonCode: 'steering_host_language_unsafe_path' }` without writing.
- Otherwise call the existing `applySteeringRuntime(root, { id, plan })`, which runs `sdlc-steering.mjs apply` and stages, validates, and commits through `applySteeringPlan`. Catch its error and return `{ status: 'failed:<message>', reasonCode: <steering JSON reasonCode or 'steering_apply_failed'> }`. `applySteeringPlan` writes nothing live before the staged `loadSteeringRuntime` succeeds.

### `contributing-v4-host-language`

- Detect: if root `CONTRIBUTING.md` is a regular, readable, non-symlink file containing `V3_CONTRIBUTING_SENTENCE`, push `{ id: 'contributing-v4-host-language', kind: 'contributing-v4-host-language', rel: 'CONTRIBUTING.md', occurrences: <count>, actionable: true }`.
- Apply: re-check `lstat`.
  - If the file is a symlink, non-regular, or unreadable, return `skipped:unverifiable` with `reasonCode: 'contributing_unsafe_path'`.
  - Replace every occurrence with `split(V3).join(V4)`. If the result is unchanged, return `already-current`. Otherwise write it and return `applied`.

### `agents-to-claude-md`

- Detect: if `lstat(root/AGENTS.md)` is non-null, push `{ id: 'agents-to-claude-md', kind: 'agents-to-claude-md', mode: 'rename' | 'merge', actionable: true }`. The mode is `merge` when `CLAUDE.md` exists.
- Apply checks:
  - If `AGENTS.md` is missing, return `skipped:missing`.
  - If either file is a symlink, non-regular, or unreadable, return `skipped:collision` and change nothing.
- Rename (no `CLAUDE.md`): if `git ls-files --error-unmatch -- AGENTS.md` succeeds in `root`, run `git mv -- AGENTS.md CLAUDE.md`. Otherwise use `fs.renameSync`. Bytes are identical.
- Merge:
  1. Read both files as Buffers.
  2. A file has a managed section when it contains both `<!-- nmg-sdlc-managed: spec-context -->` and a following `<!-- /nmg-sdlc-managed -->`.
  3. If both files have one, remove the bytes from the AGENTS opening marker through its closing marker, plus one following line ending, from the appended content.
  4. The separator is `''` when `CLAUDE.md` ends with `\n\n`, `'\n'` when it ends with `\n`, and `'\n\n'` otherwise.
  5. Write `CLAUDE + separator + appended`.
  6. Delete `AGENTS.md`: `git rm -q -- AGENTS.md` when it's tracked, otherwise `fs.unlinkSync`.
- Git calls use `spawnSync('git', [...], { cwd: root, shell: false })` directly, not the injectable network `run`.

### Apply order (`applyUpgrade` priority table)

`'agents-to-claude-md': 7.75`, after `agents-spike-language` (7) and `agents-host-language` (7.5), so those rewrite `AGENTS.md` before it moves. `'steering-v4-host-language': 10.5` and `'contributing-v4-host-language': 10.5` run after `runtime-state-v4` and `nmg-sdlc-ignore`. Add the three kinds to the dispatch chain.

### Documentation and contracts

- `references/project-agents.md`:
  - Retitle it "Project Instructions Contract". Every create, refresh, and coverage target becomes root `CLAUDE.md`, and the missing-file template heading becomes `# CLAUDE.md`.
  - The summary block becomes `Project Instructions:` / `- CLAUDE.md: …`.
  - Add a rule: when root `AGENTS.md` exists, upgrade proposes `agents-to-claude-md` instead of writing to `AGENTS.md`, and the managed section is never created in `AGENTS.md`.
- `references/contribution-guide.md`: the Coverage Detection table gains a "Stale v3 wording" state. A guide containing the exact v3 sentence is stale, not complete, and upgrade proposes `contributing-v4-host-language`.
- `workflows/onboard-project/WORKFLOW.md`: the managed assets line names `CLAUDE.md` instead of `AGENTS.md`.
- `workflows/upgrade-project/WORKFLOW.md`:
  - Add steps for the three groups after step 12.
  - Step 13 reads `CLAUDE.md`.
- `workflows/upgrade-project/references/v3-detectors.md` (v4 Detectors 14–16), `workflows/upgrade-project/references/detection.md` (items 12–14), and `workflows/upgrade-project/references/upgrade-procedures.md` (three table rows plus the fail-closed reason codes): document the signals, mapping, apply behavior, order, and reason codes.
- `README.md`: "Upgrading from 3.x" lists the three groups. The managed-assets bullet names root `CLAUDE.md`.

### This repository

- `git mv AGENTS.md CLAUDE.md` and change its H1 to `# CLAUDE.md`.
- Update root-instructions references to `CLAUDE.md` in `steering/snippets/project-structure.md` (the layout tree and the managed-artifact boundary line), `steering/snippets/project-tech.md` (the managed-assets table row and the References "Project instructions" line), and `README.md`.
- Remove the `.omp/sdlc/` line from `.gitignore`. `.nmg-sdlc/` stays.
- Released CHANGELOG entries and historical specs stay unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse a single steering plan computed at detect time | Rejected | An approved `steering-runtime` repair applied earlier in the same run changes `steeringSourceDigest`, so a detect-time plan would always fail `steering_plan_stale` |
| Write steering rewrites directly with `fs.writeFileSync` | Rejected | FR3 requires the digest-bound, staged-validation shared writer |
| Match the CONTRIBUTING sentence only inside `## nmg-sdlc Contribution Workflow` | Rejected | Guides v3 created from scratch place the bullet under other headings. The sentence is exact nmg-sdlc wording (interview decision) |
| Preserve manifest JSON bytes with string surgery | Rejected | Matches the existing manifest repair, which re-serializes with 2-space JSON; parse-and-serialize keeps the manifest valid |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #469 | 2026-10-24 | Initial feature design |
