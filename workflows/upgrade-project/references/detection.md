# Detectors (v3)

1. Packaging: presence of .codex-plugin/plugin.json without package.json omp.extensions → propose OMP + herdr note.

2. Legacy: .codex/steering or specs → relocate proposal.

3. Rename: old feature-/bug- or non N- prefix → {N}-slug using frontmatter num.

4. Split: plural Issues or leftover issue-scope multi → split per N, owned copy + Related pointers.

5. Epic flatten: epic and link artifacts → ordinary issue-owned packages; legacy relations become migration evidence, not runtime fields.

6. Issue dependencies: completely list all open and closed repository issues and each official blocked-by page. Derive candidate edges only from explicit legacy fields or clear sequencing clauses, subtract existing edges, validate the combined graph, and report exact evidence. Unreadable pages, dangling targets, and open cycles fail closed.

7. Frontmatter and status normalization.

8. v2 exact-file and managed-block cleanup.
9. Plugin runtime ignore: when `.gitignore` lacks a non-comment exact `.omp/sdlc/` or `.omp/sdlc` rule, emit actionable `id: omp-sdlc-ignore`, `kind: omp-sdlc-ignore`. Apply appends `.omp/sdlc/` after v2 cleanup.


All detectors are read-only until plan approval and helper apply. Dependency apply re-reads the graph digest before the first POST and preserves issue body text.
