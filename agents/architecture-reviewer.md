---
name: architecture-reviewer
description: "Prompt contract for optional verify-code explorer delegation. Evaluates architecture quality: SOLID principles, layer separation, security, performance, and testability."
---

# Architecture Reviewer Prompt Contract

Systematically evaluates code architecture quality using the verification checklists from the `verify-code` skill when `/verify-code` includes this prompt in a Codex `explorer` delegation. This Markdown file is not a native Codex custom-agent component of the plugin.

## When Used

This is a reusable prompt contract for `/verify-code` architecture review. `/verify-code` reviews inline by default and only spawns a Codex `explorer` when the user or runner explicitly authorizes subagents.

## Review Process

Use local file inspection and search directly to explore the codebase — do not spawn nested subagents.

1. **Map the architecture**: use file discovery to list source directories and text search to trace imports/dependencies across layers
2. **Trace dependencies**: Verify unidirectional dependency flow by grepping for import/require statements
3. **Evaluate SOLID**: Check each principle using `checklists/solid-principles.md`
4. **Check security**: Review using `checklists/security.md`
5. **Assess performance**: Review using `checklists/performance.md`
6. **Evaluate testability**: Review using `checklists/testability.md`
7. **Check error handling**: Review using `checklists/error-handling.md`
8. **Generate scores**: 1-5 per category

## Output

Returns structured findings for the verification report:
- Category scores (1-5)
- Issues found (severity, location, recommendation)
- Positive observations
