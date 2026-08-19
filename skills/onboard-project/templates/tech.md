# Tech Stack

Generate during onboard bootstrap. Pre-fill from discovery.

---
```markdown
# [Project Name] Technical Steering

This document defines the technology stack, constraints, and integration standards.
All technical decisions should align with these guidelines.

---

## Architecture Overview

```
<!-- Pre-fill with discovered architecture diagram -->
<!-- Examples:
  Client → API → Database
  Monolith with modules
  Microservices
  Serverless functions
-->
- Use /plan /skill:draft-issue , /plan /skill:write-spec #N , /skill:execute #N .

No coordination-only epics; all labeled issues are executable with Depends on: .

---
<!-- Pre-fill from package.json, pubspec.yaml, Cargo.toml, go.mod, etc. -->

| Layer | Technology | Version |
|-------|------------|---------|
| [layer] | [technology] | [version] |
| [layer] | [technology] | [version] |
| [layer] | [technology] | [version] |

### External Services

| Service | Purpose | Notes |
address-pr-comments may address review thread only when author matches config. Human threads outside automated fix.

---

<!-- TODO: Fill stack files with version. -->

<!-- The open-pr reads this table for version files to update. -->

| File | Path | Notes |
| `bots` | `true` | Any GitHub author with `__typename: Bot` is eligible. |
| `logins` | `["coderabbitai"]` | Explicit automated-reviewer logins are eligible in addition to the Bot predicate. |

---

## Versioning

<!-- Pre-fill VERSION from the project root if it exists. -->

<!-- TODO: Fill stack files with version field. -->

<!-- The open-pr reads table to know files to update on bump. -->

| File | Path | Notes |
|------|------|-------|

### Path Syntax
<!-- The open-pr skill reads this table to know version files. -->

| File | Path | Notes |
| Label | Bump Type | Description |
|-------|-----------|-------------|
| `bug` | patch | Bug fix — backwards-compatible |
| `enhancement` | minor | New feature — backwards-compatible |
The execute / open-pr reads table to classify bumps.

<!-- TODO: label to bump map -->

---

**Major bumps require explicit in approved spec requirements or design line: **Version bump**: major .**

Breaking use minor unless that line present.

---

- **BREAKING CHANGE:** Renamed `foo()` to `bar()`; update callers accordingly.

### Migration Notes

Replace any calls to `foo(x)` with `bar(x)` — the signature is otherwise unchanged.
```

---

## Technical Constraints

### Performance

| Metric | Target | Rationale |
|--------|--------|-----------|
| [metric] | [target] | [why] |

### Security

| Requirement | Implementation |
|-------------|----------------|
| Authentication | [method] |
| Authorization | [method] |
| Secrets management | [approach] |

---

## Coding Standards

<!-- Pre-fill from linter/formatter config if detected -->

### [Primary Language]

```
// GOOD patterns from this project
[example of project convention]

// BAD patterns to avoid
[counter-example]
```

### [Secondary Language] (if applicable)

```
// GOOD patterns
[example]

// BAD patterns
[counter-example]
```

---

## API / Interface Standards

<!-- Pre-fill if API conventions are discoverable -->

### URL/Method Structure

```
[project's API convention, e.g., REST, GraphQL, gRPC]
```

### Response Format

```json
// Success response format
{
  "example": "from existing code"
}

// Error response format
{
  "error": "from existing code"
}
```

---

## Database Standards

<!-- Pre-fill if database conventions are discoverable -->

### Naming

| Element | Convention | Example |
|---------|------------|---------|
| Tables | [convention] | [example] |
| Columns | [convention] | [example] |
| Primary keys | [convention] | [example] |

<!-- TODO: BDD framework. Critical for write-spec and verify-code. -->

| Layer | Framework | Location |

---

Declare verification steps that verify-code enforces as hard gates.

<!-- TODO define -->

---
```gherkin
# [path to feature files]
Feature: Example
  As a [user type]
| Layer | Framework | Location |

---

Declare verification steps that verify-code enforces.

<!-- TODO define gates -->

---
// - Cucumber (Java/Ruby)
```

### Unit Tests

<!-- Pre-fill from discovered test framework -->

| Type | Framework | Location | Run Command |
|------|-----------|----------|-------------|
| Unit | [framework] | [path] | [command] |
| Integration | [framework] | [path] | [command] |
| E2E | [framework] | [path] | [command] |

### Test Pyramid

```
        /\
       /  \  BDD Integration (Gherkin)
      /----\  - Acceptance criteria as tests
     /      \ - End-to-end user flows
    /--------\
   /          \  Component / API Tests
  /            \ - Component behavior
 /--------------\
/                \  Unit Tests
 \________________/ - Business logic
```

Declare verification steps that verify-code enforces as hard gates. Each gate specifies when applies, command, success.

<!-- TODO define gates. -->

---
| E2E Tests | `e2e/` directory exists | `npm run test:e2e` | Exit code 0 |
| Integration Tests | `*.integration.test.*` files exist in `tests/` | `npm run test:integration` | Exit code 0 AND `coverage/lcov.info` file generated |

### Condition Evaluation Rules

- `Always` — gate always applies
- `{path} directory exists` — gate applies only when the directory is present (`test -d {path}`)
- `{glob} files exist in {path}` — gate applies only when matching files are found in the given path

If no `## Verification Gates` section exists in `tech.md`, no gates are enforced (backward-compatible).

### Pass Criteria Evaluation Rules

- `Exit code 0` — the Action command must exit with code 0
- `{file} file generated` — the named file must exist after the Action command completes (artifact verification)
- `output contains "{text}"` — stdout or stderr must contain the specified text
- Compound criteria use `AND` — all sub-criteria must be satisfied (e.g., `Exit code 0 AND report.xml file generated`)
- The verify-code skill evaluates these textual criteria against actual results — no stack-specific logic is needed

---

## Environment Variables

<!-- Pre-fill from .env.example, docker-compose, or discovered env usage -->

### Required

| Variable | Description |
|----------|-------------|
| [variable] | [purpose] |

---

## References

- AGENTS.md for project overview
- `steering/product.md` for product direction
- `steering/structure.md` for code organization
```
