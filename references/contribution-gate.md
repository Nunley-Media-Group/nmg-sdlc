# Contribution Gate Contract

**Consumed by**: `init-config` during runner setup, and `upgrade-project` when analyzing or applying managed project artifacts.

Use this reference to install or reconcile the nmg-sdlc-managed GitHub Actions contribution gate in consumer projects. The gate is project content, not plugin metadata: it must be additive, stack-agnostic, safe for public repositories, and non-destructive toward project-authored workflows.

## Constants

| Name | Value |
|------|-------|
| Approved workflow path | `.github/workflows/nmg-sdlc-contribution-gate.yml` |
| Managed marker | `# nmg-sdlc-managed: contribution-gate` |
| Managed version | `# nmg-sdlc-managed-version: 1` |
| Current numeric version | `1` |

Only files containing the managed marker are nmg-sdlc-owned. A file at the approved path without that marker is a path collision and must never be overwritten.

## Inputs

| Input | Purpose |
|-------|---------|
| Pull request title and body | Issue, spec, steering, and verification evidence |
| Pull request changed files | Spec, steering, and verification artifact evidence |
| `CONTRIBUTING.md` | Contributor-facing remediation target |
| `steering/product.md`, `steering/tech.md`, `steering/structure.md` | Steering context evidence |
| `specs/feature-*` and `specs/bug-*` files | Spec linkage and issue frontmatter evidence |

Treat all pull-request content as untrusted data. Search it as text only. Do not pass PR text, branch names, changed paths, or file contents into a shell command.

## Workflow Template

Write this exact workflow to the approved path when the gate is missing or when an older managed version is present:

```yaml
# nmg-sdlc-managed: contribution-gate
# nmg-sdlc-managed-version: 1
name: nmg-sdlc contribution gate

on:
  pull_request:
    types: [opened, synchronize, reopened, edited, ready_for_review]

permissions:
  contents: read
  pull-requests: read

jobs:
  contribution-gate:
    name: Validate nmg-sdlc contribution evidence
    runs-on: ubuntu-latest
    steps:
      - name: Check issue, spec, steering, and verification evidence
        uses: actions/github-script@v7
        with:
          script: |
            const owner = context.repo.owner;
            const repo = context.repo.repo;
            const pr = context.payload.pull_request;
            const ref = pr.head.sha;
            const prText = `${pr.title || ''}\n${pr.body || ''}`;
            const files = await github.paginate(github.rest.pulls.listFiles, {
              owner,
              repo,
              pull_number: pr.number,
              per_page: 100,
            });
            const changedPaths = files.map((file) => file.filename);
            const failures = [];

            async function pathExists(path) {
              try {
                await github.rest.repos.getContent({ owner, repo, path, ref });
                return true;
              } catch (error) {
                if (error.status === 404) return false;
                throw error;
              }
            }

            async function readText(path) {
              try {
                const response = await github.rest.repos.getContent({ owner, repo, path, ref });
                if (Array.isArray(response.data) || response.data.type !== 'file') return '';
                return Buffer.from(response.data.content || '', response.data.encoding || 'base64').toString('utf8');
              } catch (error) {
                if (error.status === 404) return '';
                throw error;
              }
            }

            const specArtifactPattern = /^specs\/(?:feature|bug)-[^/]+\/(?:requirements|design|tasks)\.md$|^specs\/(?:feature|bug)-[^/]+\/feature\.gherkin$/;
            const verificationArtifactPattern = /(^|\/)verification-report\.md$|^docs\/decisions\/.+\.md$/;
            const specPaths = changedPaths.filter((path) => specArtifactPattern.test(path));
            const specText = (await Promise.all(specPaths.slice(0, 20).map(readText))).join('\n');
            const combinedText = `${prText}\n${specText}`;

            const issueLinked = /(^|[\s(])#\d+\b/.test(combinedText)
              || /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+\b/i.test(combinedText)
              || /\*\*Issues?\*\*:\s*#?\d+/i.test(combinedText);
            if (!issueLinked) {
              failures.push('Missing issue evidence: reference the GitHub issue in the PR body or spec frontmatter, for example `Closes #123` or `**Issues**: #123`.');
            }

            const specLinked = specPaths.length > 0
              || /specs\/(?:feature|bug)-[a-z0-9-]+/i.test(combinedText)
              || /\b(requirements\.md|design\.md|tasks\.md|feature\.gherkin)\b/i.test(combinedText);
            if (!specLinked) {
              failures.push('Missing spec evidence: update or link the relevant `specs/feature-*` or `specs/bug-*` artifacts.');
            }

            const steeringFiles = ['steering/product.md', 'steering/tech.md', 'steering/structure.md'];
            const steeringPresence = await Promise.all(steeringFiles.map(pathExists));
            const missingSteering = steeringFiles.filter((_, index) => !steeringPresence[index]);
            const steeringReferenced = /\bsteering\b|steering\/(?:product|tech|structure)\.md|product\.md|tech\.md|structure\.md/i.test(combinedText)
              || changedPaths.some((path) => /^steering\/(?:product|tech|structure)\.md$/.test(path));
            if (missingSteering.length > 0) {
              failures.push(`Missing steering artifacts: expected ${missingSteering.join(', ')} before nmg-sdlc contribution gating can pass.`);
            } else if (!steeringReferenced) {
              failures.push('Missing steering evidence: explain how the change aligns with `steering/product.md`, `steering/tech.md`, and `steering/structure.md`.');
            }

            const verificationLinked = /\b(test plan|verification|verified|verify-code|tests? run|validation)\b/i.test(combinedText)
              || changedPaths.some((path) => verificationArtifactPattern.test(path));
            if (!verificationLinked) {
              failures.push('Missing verification evidence: include test or verification results in the PR body or commit a `verification-report.md` artifact.');
            }

            if (!(await pathExists('CONTRIBUTING.md'))) {
              failures.push('Missing `CONTRIBUTING.md`: run `$nmg-sdlc:onboard-project` or `$nmg-sdlc:upgrade-project` so contributors can remediate this gate.');
            }

            if (failures.length > 0) {
              for (const failure of failures) {
                core.error(`${failure} See CONTRIBUTING.md for the nmg-sdlc contribution checklist.`);
              }
              core.setFailed(`nmg-sdlc contribution gate failed with ${failures.length} missing expectation(s).`);
            } else {
              core.info('nmg-sdlc contribution evidence found: issue, spec, steering, verification, and guide checks passed.');
            }
```

## Process

Classify the approved workflow path before writing:

| State | Detection | Action | Status |
|-------|-----------|--------|--------|
| Missing workflow | Approved path absent | Create `.github/workflows/` and write the template | `created` |
| Current managed workflow | Marker present and version equals current | Leave unchanged | `already present` |
| Outdated managed workflow | Marker present and numeric version lower than current | Replace only the managed workflow with the template | `updated` |
| Future managed workflow | Marker present and numeric version higher than current | Leave unchanged and record a gap | `skipped (newer managed version)` |
| Unmanaged path collision | Approved path exists without marker | Leave unchanged and record manual remediation | `skipped (unmanaged file at path)` |

Preserve every unrelated workflow under `.github/workflows/` byte-for-byte. Do not move, delete, sort, or reformat project-authored workflows.

## Evidence Categories

The gate fails when any required category is missing:

| Category | Passing evidence |
|----------|------------------|
| Issue linkage | PR body/title or changed spec frontmatter references a local issue such as `#125`, `Closes #125`, or `**Issues**: #125` |
| Spec linkage | PR body links a `specs/feature-*` or `specs/bug-*` directory, or changed files include spec artifacts |
| Steering context | Required steering docs exist and the PR/spec evidence names steering alignment |
| Verification evidence | PR body includes a non-empty test/verification plan, or changed files include a verification report |
| Guide discoverability | `CONTRIBUTING.md` exists |

The workflow does not run project build, test, package, or install commands. Project-specific CI remains in project-authored workflows. Steering-level verification gates are represented as expected PR evidence, not arbitrary command execution inside the generated workflow.

## Mode Behavior

Interactive mode:

- `init-config` applies the gate during setup without a separate prompt because the workflow is a managed setup artifact.
- `upgrade-project` presents missing or outdated managed workflow findings in its normal non-destructive upgrade batch.
- Path collisions are reported as gaps and left for manual remediation.

Unattended mode:

- Do not call `request_user_input`.
- Auto-apply missing workflow creation and outdated managed workflow replacement.
- Leave future-version workflows and unmanaged path collisions unchanged.
- Record every created, updated, already-present, or skipped outcome in the final summary.

## Output

Return this stable result shape to the calling skill:

```text
Contribution Gate:
- Workflow: created | updated | already present | skipped (<reason>)
- Path: .github/workflows/nmg-sdlc-contribution-gate.yml
- Gaps: none | <comma-separated gaps>
```

Use these exact status words so summaries and tests can compare results consistently.

## Safety Rules

- Never overwrite an unmanaged file at `.github/workflows/nmg-sdlc-contribution-gate.yml`.
- Never modify unrelated workflows under `.github/workflows/`.
- Never create branch protection rules, repository settings, secrets, or required-check configuration.
- Never use `pull_request_target` in the default workflow.
- Never require repository secrets by default.
- Never execute untrusted PR content as code.
- Never run stack-specific build or test commands from the default contribution gate.
