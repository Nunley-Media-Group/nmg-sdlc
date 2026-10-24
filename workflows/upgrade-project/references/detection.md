# Detectors (v4)

1. Packaging: `.codex-plugin/plugin.json`, or a v3 root `package.json` `omp.extensions` manifest, without `.claude-plugin/plugin.json` → emit detector-only `id: packaging-v4-claude-code-herdr`: install nmg-sdlc as a Claude Code plugin, plus a Herdr note.

2. Legacy: .codex/steering or specs → relocate proposal.

3. Rename: old feature-/bug- or non N- prefix → {N}-slug using frontmatter num.

4. Split: plural Issues or leftover issue-scope multi → split per N, owned copy + Related pointers.

5. Epic flatten: epic and link artifacts → ordinary issue-owned packages; legacy relations become migration evidence, not runtime fields.

6. Issue dependencies: completely list all open and closed repository issues and each official blocked-by page. Derive candidate edges only from explicit legacy fields or clear sequencing clauses, subtract existing edges, validate the combined graph, and report exact evidence. Unreadable pages, dangling targets, and open cycles fail closed.

7. Frontmatter and status normalization.

8. v2 exact-file and managed-block cleanup.
9. v3 → v4 runtime state: when legacy `.omp/sdlc/` exists, emit `id: runtime-state-v4`, `kind: runtime-state-v4` with `moves`, `duplicates`, `obsolete`, and `conflicts`. It is actionable when anything can move, deduplicate, or be deleted; conflicts alone report `actionable: false`. See the v4 section of `v3-detectors.md`.
10. Plugin runtime ignore: when `.gitignore` lacks a non-comment exact `.nmg-sdlc/` or `.nmg-sdlc` rule, or keeps the legacy managed `.omp/sdlc/` / `.omp/sdlc` rule after `.omp/sdlc/` is gone, emit actionable `id: nmg-sdlc-ignore`, `kind: nmg-sdlc-ignore` (`swapLegacy: true` when the legacy rule will be replaced). Apply runs after v2 cleanup and the runtime-state move.
11. v4 host language: when root `AGENTS.md` has the managed `agents/ … # OMP task agents (…)` structure comment, emit `id: agents-v4-host-language`, `kind: agents-host-language`.


All detectors are read-only until plan approval and helper apply. Dependency apply re-reads the graph digest before the first POST and preserves issue body text.
