# Root Cause Analysis: Pass GitHub CI on write-spec spec-only PRs

**Issue**: #199
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/125-add-github-actions-contribution-gates-to-project-setup/

---

## Root Cause

A write-spec PR is spec-only: title `docs: approve spec for #N`, body `Approved specification package for #N.` plus `This pull request publishes the spec only.`, and changed paths only under `specs/{N}-{slug}/`. Two independent checks fail that shape.

The managed contribution gate (version 5) classifies `specs/{N}-{slug}/` as `spec`, not `documentation`. `docsOnlyEligible` therefore cannot apply. The publish body does not mention steering files and has no Verification section, so the gate fails `Missing steering evidence` and `Missing specific verification`. Spec paths are not `relevant`, so unmatched-path mapping is not the failure; the missing steering/verification checks are.

Separately, this repository's `.github/workflows/nmg-sdlc-verify.yml` runs `node scripts/verify-current-specs.mjs` on every pull request. That script's `CURRENT_SPEC_DIRECTORIES` allowlist treats any extra `specs/{N}-*` directory as `Obsolete or mismatched spec directories remain`. A write-spec PR cannot update that allowlist because it must stay spec-only. `feature.gherkin` identity is also hardcoded to `# Issue: #N`, while write-spec packages use `**Issue**: #N`.

### Affected Code

| File | Role |
|------|------|
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | Live managed gate evaluator (must stay byte-identical to the embedded template plus trailing newline) |
| `references/contribution-gate.md` | Canonical template, managed version, exception table |
| `references/contribution-guide.md` | Consumer CONTRIBUTING fragment for reduced modes |
| `CONTRIBUTING.md` | Dogfooded reduced-mode table |
| `scripts/verify-current-specs.mjs` | `CURRENT_SPEC_DIRECTORIES` stale-dir error and gherkin identity |
| `scripts/__tests__/exercise-contribution-gate.test.mjs` | Executes the embedded evaluator (`CURRENT_VERSION = 5`) |
| `scripts/__tests__/contribution-gate-contract.test.mjs` | Asserts managed version 5 and live=template |
| `scripts/__tests__/current-specs.test.mjs` | Asserts allowlist length 16 and empty error list |

### Triggering Conditions

- PR title is `docs: approve spec for #N` and paths are only under one `specs/{N}-{slug}/`.
- Publish body names `#N` without steering or verification evidence.
- The new directory is not in `CURRENT_SPEC_DIRECTORIES`.
- These jobs are required or red, so `gh pr merge --squash` fails.

---

## Fix Strategy

### Approach

Add a third reduced-evidence mode, `spec-only`, detected from PR shape (no `SDLC-Exception` marker). Bump the managed gate from version `5` to `6` so onboard/upgrade refresh consumers. Keep `docs-only` unable to cover spec or source paths.

Change `verify-current-specs.mjs` so extra well-formed approved `specs/{N}-{slug}/` packages are not stale. Keep `CURRENT_SPEC_DIRECTORIES` as the required rewrite-era archive of 16 directories; do not add post-rewrite packages to that allowlist. Accept either `**Issue**: #N` or `# Issue: #N` in `feature.gherkin`.

Do not skip or delete GitHub Actions. Do not put `Closes`/`Fixes`/`Resolves` on the write-spec PR body.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `references/contribution-gate.md` | Set managed version and current numeric version to `6`. In the embedded yaml template, set `# nmg-sdlc-managed-version: 6`. After `prIssueNumbers` and `pathClasses` exist, add `writeSpecOnlyEligible()` and `reducedMode` including `spec-only`. Skip steering-alignment and specific-verification failures when `reducedMode === 'spec-only'`. Still fail missing steering artifact files and missing `CONTRIBUTING.md`. Add a Validated Exceptions row for spec-only. | Consumer and dogfood gates share this template. |
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | Replace with the version-6 template plus a trailing newline so it stays exactly equal to the fenced yaml in `references/contribution-gate.md` plus `\n`. | Contract test requires byte identity. |
| `references/contribution-guide.md` | Add the spec-only row to the reduced-evidence table using the same predicate and reduced checks as the gate contract. | AC3 consumers get the matrix via onboard/upgrade. |
| `CONTRIBUTING.md` | Add the same spec-only row under the existing reduced-evidence table. | Dogfood guide matches the gate. |
| `scripts/verify-current-specs.mjs` | Extract spec-directory validation into `export function verifySpecArchive(specsRoot, requiredDirectories = CURRENT_SPEC_DIRECTORIES)`. Do not emit `Obsolete or mismatched spec directories remain`. Keep missing required-archive errors. For `feature.gherkin`, treat identity as satisfied when the text includes `**Issue**: #${issue}` or `# Issue: #${issue}`. `verifyCurrentSpecs` calls `verifySpecArchive` then the existing rewrite-contract / workflow / command checks. Success log uses `actualDirectories.length` genuine issue specs and `${CURRENT_SPEC_DIRECTORIES.length} required archive`. | Write-spec PRs cannot update the allowlist. |
| `scripts/__tests__/exercise-contribution-gate.test.mjs` | Set `CURRENT_VERSION = 6`. Change version-5 string assertions to version `6`. Add evaluator tests named below. | Locks AC1/AC3/AC4. |
| `scripts/__tests__/contribution-gate-contract.test.mjs` | Expect managed version `6` and current numeric version `` `6` ``. | Version bump is observable. |
| `scripts/__tests__/current-specs.test.mjs` | Keep `CURRENT_SPEC_DIRECTORIES` length 16. Add `verifySpecArchive` fixture tests named below. | Locks FR2 without putting #199 on the rewrite allowlist. |

### `writeSpecOnlyEligible` (exact predicate)

Insert in the embedded github-script (and therefore the live workflow) after `pathClasses` and `prIssueNumbers` are computed:

```javascript
function writeSpecOnlyEligible() {
  const titleMatch = String(pr.title || '').trim().match(/^docs: approve spec for #(\d+)$/);
  if (!titleMatch) return false;
  const issueN = Number(titleMatch[1]);
  if (!prIssueNumbers.has(issueN)) return false;
  if (changedPaths.length === 0) return false;
  if (!changedPaths.every((path) => pathClasses.get(path) === 'spec')) return false;
  const directories = new Set();
  for (const changedPath of changedPaths) {
    const match = changedPath.match(/^(specs\/(\d+)-[^/]+)\//);
    if (!match || Number(match[2]) !== issueN) return false;
    directories.add(match[1]);
  }
  return directories.size === 1;
}

const specOnlyEligible = writeSpecOnlyEligible();
const reducedMode = docsOnlyEligible ? 'docs-only' : rewriteEligible ? 'repository-rewrite' : specOnlyEligible ? 'spec-only' : null;
```

Steering block: keep `missingSteering` failures. Change the alignment failure to:

```javascript
} else if (!steeringReferenced && reducedMode !== 'spec-only') {
  failures.push('Missing steering evidence: explain alignment with `steering/product.md`, `steering/tech.md`, and `steering/structure.md`.');
}
```

Verification block:

```javascript
if (reducedMode !== 'docs-only' && reducedMode !== 'spec-only' && !hasSpecificVerification(verificationEvidence, verificationReports, relevantPaths)) {
  failures.push('Missing specific verification: provide a command with its outcome, a non-empty report, an AC result, or a changed-path-specific result.');
}
```

Do not treat spec paths as `documentation`. Do not let `SDLC-Exception: docs-only` succeed when any changed path is `spec` or `relevant` (existing invalidation stays). Spec-only does not require an `SDLC-Exception` marker. Invalid docs-only on a write-spec-shaped PR still fails (AC4).

Validated Exceptions row (add; do not rewrite docs-only or rewrite rows):

| Mode | Predicate | Reduced checks | Invalidating paths |
|------|-----------|----------------|--------------------|
| Spec-only write-spec | Title matches `^docs: approve spec for #(\d+)$`; that issue number appears in current PR text; every changed path is class `spec` under exactly one `specs/{N}-{slug}/` whose leading number is that issue | Steering alignment text and specific verification are not required | Any non-spec path; title mismatch; multiple spec directories; issue number mismatch |

### `verifySpecArchive` (exact behavior)

```javascript
export function verifySpecArchive(specsRoot, requiredDirectories = CURRENT_SPEC_DIRECTORIES) {
  const errors = [];
  const actualDirectories = listDirectories(specsRoot);
  const missingDirectories = requiredDirectories.filter((directory) => !actualDirectories.includes(directory));
  if (missingDirectories.length) errors.push(`Missing current spec directories: ${missingDirectories.join(', ')}`);

  for (const directory of actualDirectories) {
    const issue = issueFromDirectory(directory);
    if (issue === null) {
      errors.push(`Spec directory lacks leading issue number: ${directory}`);
      continue;
    }
    const directoryPath = path.join(specsRoot, directory);
    for (const artifact of REQUIRED_ARTIFACTS) {
      const artifactPath = path.join(directoryPath, artifact);
      if (!fs.existsSync(artifactPath)) {
        errors.push(`Missing ${directory}/${artifact}`);
        continue;
      }
      const text = fs.readFileSync(artifactPath, 'utf8');
      const hasIssue = artifact === 'feature.gherkin'
        ? (text.includes(`**Issue**: #${issue}`) || text.includes(`# Issue: #${issue}`))
        : text.includes(`**Issue**: #${issue}`);
      if (!hasIssue) errors.push(`${directory}/${artifact} lacks singular **Issue**: #${issue}`);
      if (artifact === 'requirements.md' && !text.includes('**Status**: Approved')) {
        errors.push(`${directory}/requirements.md is not Approved`);
      }
      for (const [pattern, label] of STALE_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(text) && !(issue === 151 && label === 'removed unattended mode')) {
          errors.push(`${directory}/${artifact} contains ${label}`);
        }
      }
    }
  }
  return errors;
}
```

`verifyCurrentSpecs` uses `verifySpecArchive(path.join(projectRoot, 'specs'))` for the archive portion. Do not push obsolete/mismatched extras. Extra directories still run the per-directory loop (malformed extras still fail). Do not require extra directories to appear in rewrite-capability maps.

### Blast Radius

- **Direct impact**: managed gate template/version, dogfood workflow, contribution guide tables, current-spec archive verifier.
- **Indirect impact**: onboard/upgrade will replace consumer gates still on version 5; write-spec merge; `exercise-contribution-gate` evaluator tests.
- **Risk level**: Medium — wrong predicate could waive evidence for implementation PRs.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Spec-only mode matches mixed source+spec PRs | Med | Predicate requires every path class `spec` and a single `specs/{N}-{slug}/` |
| Docs-only starts covering spec paths | Low | Keep spec classification; keep docs-only invalidation; AC4 tests |
| Required rewrite-era specs can disappear | Low | Keep `CURRENT_SPEC_DIRECTORIES` missing-dir errors |
| Write-spec gherkin identity fails verifier | Med | Accept both `**Issue**: #N` and `# Issue: #N` in gherkin |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
