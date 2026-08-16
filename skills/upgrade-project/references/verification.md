# V2 Cleanup, CHANGELOG, and VERSION Analysis

**Read this when** `upgrade-project` analyzes obsolete runner artifacts or release documents. Every finding is informational until the normal findings gate approves an exact change.

Epic lifecycle verification is separately per-epic and digest protected. After
an approved repair, rerun graph/spec/completion/Project classification twice;
the second audit must be a no-op for every approved action.

## V2 Runner Artifact Cleanup Analysis

Candidate discovery is closed-world. Inspect only:

1. `sdlc-config.json`
2. `.codex/unattended-mode`
3. `.codex/sdlc-state.json`
4. exact owned entries inside a recognized `.gitignore` block

### Exact file candidates

For each of the three paths, inspect path metadata without reading file contents or following symlinks:

- Absent (`ENOENT`) → record `already clean`.
- Regular file at the exact project-root-relative path → record an exact deletion candidate.
- Symlink, directory, socket, device, or other non-regular object → record `preserved (unmanaged)` and a gap naming the exact path and object type.
- Metadata inspection failure other than absence → record `failed (<reason>)`; do not broaden the search.

Do not parse configuration values. For `.codex/sdlc-state.json`, never read, print, interpret, execute, kill, or signal any content. Its presence alone is sufficient for an exact deletion proposal.

### Recognized `.gitignore` blocks

Recognize only these exact header lines:

```text
# SDLC runner config
# SDLC runner artifacts
```

A recognized block begins at one of those headers and ends at the next blank line, the next comment header, or end of file. Within that bounded block, the only owned entries are these exact lines:

```text
sdlc-config.json
.codex/sdlc-state.json
.codex/unattended-mode
```

Record each exact owned line inside the block as a removal candidate. Matching lines outside a recognized block are user-owned: preserve them and report `.gitignore managed entries: preserved (unmanaged)`. Unknown lines inside a recognized block are also preserved. Remove a recognized header only when removing owned entries would otherwise leave its block empty; preserve the header when any unknown line remains.

If `.gitignore` is absent, record `already clean`. If it cannot be read, record the exact failure and do not edit it.

### Findings gate payload

Before mutation, render:

```text
Runner Artifact Cleanup proposal:
- Delete file: <exact path>
- Remove .gitignore line <line-number>: <exact text> (block: <exact header>)
- Preserve unmanaged: <exact path or line>
- Failures: none | <exact path and reason>
```

The user may approve the exact batch, decline it, or narrow it. Re-render the narrowed batch before acceptance. No remote metadata operation is part of cleanup.

## CHANGELOG Analysis

Check whether `CHANGELOG.md` follows Keep a Changelog while preserving all manual entries.

When absent, propose a new changelog derived from semver tags and conventional commit subjects. With no tags, place current history under `0.1.0` and retain an empty `[Unreleased]` section.

When present:

1. Propose an `[Unreleased]` section when missing.
2. Compare semver tags with version headings and report omissions.
3. Report non-standard category headings without rewriting their content automatically.
4. Propose a title/preamble only when missing.
5. Preserve existing entries byte-for-byte unless the user explicitly approves a scoped reconciliation.

## VERSION Analysis

Determine the expected version from the latest changelog version heading, then the latest semver tag, then `0.1.0`.

- Missing `VERSION` → propose creation with the expected version.
- Different valid value → propose updating it.
- Matching value → no finding.
- Read or parse failure → report the exact path and preserve it.

## Output Contract

Analysis returns exact proposed changes, already-current states, preserved unmanaged paths, and failures. None of these categories may abort unrelated managed-asset analysis, and none may be applied before the findings gate.
