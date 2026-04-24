# Codex Tooling

Use this reference whenever a skill describes tool use. The skill text should describe Codex-native behavior, not legacy tool names.

## Tool Translation

| Legacy wording | Codex-native instruction |
|----------------|--------------------------|
| `Read` | Read files with normal file-inspection commands such as `sed`, `nl`, or `rg`, or use an available MCP resource when one is provided. |
| `Glob` | Discover files with `rg --files` first; use `find` or shell globs when `rg` is unavailable or a directory traversal is clearer. |
| `Grep` | Search with `rg` first; use another local search tool only when `rg` is unavailable. |
| `Write` / `Edit` / `MultiEdit` | Edit files with `apply_patch` for manual changes. Formatting commands and mechanical rewrites may run through the shell. |
| `Bash(...)` | Run shell commands through the Codex shell tool, respecting sandboxing and approval rules. |
| Legacy web fetch/search wording | Use Codex web browsing for internet sources and prefer primary sources. Use the in-app browser only for local browser targets or explicit browser inspection. |
| Legacy task-delegation wording | Do not name legacy task tools. If the user explicitly authorizes delegation, use Codex subagents (`explorer` for read-only exploration, `worker` for implementation); otherwise perform the work inline. |
| `plan approval` | Do not name a tool. Present a concise implementation plan and wait for the user's approval in interactive mode; in unattended mode, design internally and proceed. |
| `request_user_input` | Do not name a tool in skill instructions. Ask the user directly in interactive mode; in unattended mode, follow the skill's deterministic default or escalation rule. |
| `Skill` | Do not name a tool. Invoke another skill by telling Codex to use that skill, or let the SDLC runner inject the target skill's instructions. |

## Skill Authoring Rules

- Keep `SKILL.md` frontmatter to `name` and `description`; detailed UI metadata belongs in `agents/openai.yaml` when needed.
- Prefer imperative workflow instructions over low-level tool names unless the exact shell command is the contract.
- Make interactive gates tool-agnostic: say what choice the user must make and how unattended mode bypasses or escalates it.
- Use Codex subagents only when the user or runner prompt explicitly asks for delegation; every subagent task needs a bounded scope and clear output contract.
- Codex plugins can bundle skills, apps, MCP server configuration, and assets. Do not document `agents/*.md` as installable plugin components; use them as reusable prompt contracts that skills include when spawning built-in Codex subagents.
