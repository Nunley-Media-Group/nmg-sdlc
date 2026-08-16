# Contribution Gate Contract

**Consumed by**: `onboard-project` for new projects and `upgrade-project` when analyzing or applying managed project artifacts.

Use this reference to install or reconcile the nmg-sdlc-managed GitHub Actions contribution gate in consumer projects. The gate is project content, not plugin metadata: keep it additive, stack-agnostic, safe for public repositories, and non-destructive toward project-authored workflows.

## Constants

| Name | Value |
|------|-------|
| Approved workflow path | `.github/workflows/nmg-sdlc-contribution-gate.yml` |
| Managed marker | `# nmg-sdlc-managed: contribution-gate` |
| Managed version | `# nmg-sdlc-managed-version: 3` |
| Current numeric version | `3` |
| Maximum selected spec directories | `5` |
| Expected artifacts per selected spec | `requirements.md`, `design.md`, `tasks.md`, `feature.gherkin` |
| Allowed artifacts per epic aggregate | `requirements.md`, `design.md`, `epic-scope.json` |
| Maximum paths per diagnostic | `20` |

Only files containing the managed marker are nmg-sdlc-owned. A file at the approved path without that marker is a path collision and must never be overwritten.

## Inputs

| Input | Purpose |
|-------|---------|
| Pull request title and body | Current issue, spec, steering, verification, and exception evidence |
| Pull request changed files | Spec discovery, path classification, traceability, and exception validation |
| `CONTRIBUTING.md` | Contributor-facing remediation target |
| `steering/product.md`, `steering/tech.md`, `steering/structure.md` | Required steering context |
| Selected `specs/feature-*` and `specs/bug-*` artifacts | Issue correlation and task evidence |
| Selected `specs/epic-*` aggregate artifacts | Supporting cross-child outcomes/topology; never executable issue evidence |
| Committed `verification-report.md` or `verification.md` artifacts | Specific verification and path evidence |
| Correlated issue labels | Spike/ADR reduced-evidence validation |

Treat pull-request content, changed paths, issue metadata, and repository files as inert text. Never interpolate them into shell commands or evaluate them as JavaScript.

## Workflow Template

Write this exact workflow to the approved path when the gate is missing or when an older managed version is present:

```yaml
# nmg-sdlc-managed: contribution-gate
# nmg-sdlc-managed-version: 3
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
      - name: Check issue, spec, path, steering, and verification evidence
        uses: actions/github-script@v7
        with:
          script: |
            const owner = context.repo.owner;
            const repo = context.repo.repo;
            const pr = context.payload.pull_request;
            const ref = pr.head.sha;
            const prText = `${pr.title || ''}\n${pr.body || ''}`;
            const MAX_SPEC_DIRECTORIES = 5;
            const SPEC_ARTIFACTS = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
            const OPTIONAL_AUTHORITY_ARTIFACTS = ['issue-scope.json', 'epic-link.json'];
            const AGGREGATE_ARTIFACTS = ['requirements.md', 'design.md', 'epic-scope.json'];
            const MAX_VERIFICATION_REPORTS = 10;
            const MAX_DIAGNOSTIC_PATHS = 20;
            const failures = [];

            const files = await github.paginate(github.rest.pulls.listFiles, {
              owner,
              repo,
              pull_number: pr.number,
              per_page: 100,
            });
            const changedPaths = files.map((file) => normalizePath(file.filename)).filter(Boolean);

            function normalizePath(value) {
              return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
            }

            function escapeRegex(value) {
              return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }

            function stripQuotedHistory(value) {
              const kept = [];
              let inFence = false;
              let inHistoricalSection = false;
              const withoutComments = String(value || '').replace(/<!--[\s\S]*?(?:-->|$)/g, '');
              for (const line of withoutComments.split(/\r?\n/)) {
                if (/^\s*```/.test(line)) {
                  inFence = !inFence;
                  continue;
                }
                if (inFence || /^\s*>/.test(line)) continue;
                const heading = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
                if (heading) {
                  inHistoricalSection = /^(?:change\s+)?history|historical|prior\s+(?:work|context|failures?)$/i.test(heading[1].trim());
                  if (inHistoricalSection) continue;
                }
                if (!inHistoricalSection) kept.push(line);
              }
              return kept.join('\n');
            }

            function extractIssueNumbers(value) {
              const current = stripQuotedHistory(value);
              const numbers = new Set();
              const patterns = [
                /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi,
                /^\s*(?:\*\*)?Issues?(?:\*\*)?\s*:\s*([^\n]+)$/gim,
                /(^|[\s(])#(\d+)\b/g,
              ];
              for (const pattern of patterns) {
                for (const match of current.matchAll(pattern)) {
                  const source = match[1] && /^\d+$/.test(match[1]) ? match[1] : match[2] || match[1];
                  for (const number of String(source || '').matchAll(/#?(\d+)\b/g)) numbers.add(Number(number[1]));
                }
              }
              return numbers;
            }

            function resolveSpecDirectories(value, paths) {
              const directories = new Set();
              for (const path of paths) {
                const match = path.match(/^(specs\/(?:feature|bug)-[^/]+)\/(?:requirements|design|tasks)\.md$|^(specs\/(?:feature|bug)-[^/]+)\/(?:feature\.gherkin|issue-scope\.json|epic-link\.json)$/);
                if (match) directories.add(match[1] || match[2]);
              }
              for (const match of stripQuotedHistory(value).matchAll(/\bspecs\/(?:feature|bug)-[a-z0-9-]+\b/gi)) {
                directories.add(normalizePath(match[0]));
              }
              return [...directories].sort().slice(0, MAX_SPEC_DIRECTORIES);
            }

            function resolveAggregateDirectories(value, paths) {
              const directories = new Set();
              for (const path of paths) {
                const match = path.match(/^(specs\/epic-[^/]+)\/(?:requirements\.md|design\.md|epic-scope\.json)$/);
                if (match) directories.add(match[1]);
              }
              for (const match of stripQuotedHistory(value).matchAll(/\bspecs\/epic-[a-z0-9-]+\b/gi)) {
                directories.add(normalizePath(match[0]));
              }
              return [...directories].sort().slice(0, MAX_SPEC_DIRECTORIES);
            }

            function classifyChangedPath(path) {
              if (/^(?:skills|scripts|references|agents)\//.test(path)
                || /(^|\/)templates\//.test(path)
                || /^\.github\/workflows\//.test(path)) return 'relevant';
              if (/^specs\/(?:feature|bug)-[^/]+\//.test(path)) return 'spec';
              if (/^specs\/epic-[^/]+\//.test(path)) return 'aggregate';
              if (/^docs\/decisions\/.+\.md$/i.test(path)) return 'adr';
              if (/(^|\/)(?:verification-report|verification)\.md$/i.test(path)) return 'evidence';
              if (/^(?:README|CONTRIBUTING|CHANGELOG)\.md$/i.test(path)
                || /^docs\/.+\.md$/i.test(path)
                || /^steering\/.+\.md$/i.test(path)) return 'documentation';
              return 'relevant';
            }

            function extractVerificationSection(value) {
              const lines = stripQuotedHistory(value).split(/\r?\n/);
              const sections = [];
              let capturing = false;
              for (const line of lines) {
                const heading = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
                if (heading) {
                  capturing = /^(?:verification|test plan|validation)(?:\s+results?)?$/i.test(heading[1].trim());
                  continue;
                }
                if (capturing) sections.push(line);
                if (/^\s*(?:Verification|Test Plan|Validation)\s*:\s*\S/i.test(line)) sections.push(line);
              }
              return sections.join('\n').trim();
            }

            function pathMentioned(path, evidence) {
              const exact = new RegExp(`(^|[\\s\u0060'\"(])${escapeRegex(path)}(?=$|[\\s\u0060'\"),:;])`, 'm');
              if (exact.test(evidence)) return true;
              const parts = path.split('/');
              for (let index = parts.length - 1; index > 0; index -= 1) {
                const prefix = `${parts.slice(0, index).join('/')}/`;
                const directory = new RegExp(`(^|[\\s\u0060'\"(])${escapeRegex(prefix)}(?=$|[\\s\u0060'\"),:;])`, 'm');
                if (directory.test(evidence)) return true;
              }
              const behavior = new RegExp(`\\bBehavior\\s*(?:for|:|\\[|\\()\\s*${escapeRegex(path)}(?:\\]|\\))?\\s*[:—-]\\s*\\S`, 'i');
              return behavior.test(evidence);
            }

            function hasSpecificVerification(evidence, reportTexts, relevantPaths) {
              const normalizedEvidence = normalizePath(evidence);
              const commandOutcome = /(?:`[^`\n]+`|\b(?:command|run)\s*:\s*\S[^\n]*)[\s\S]{0,160}\b(?:pass(?:ed)?|fail(?:ed)?|succeed(?:ed)?|exit\s+(?:code\s+)?0|\d+\s+tests?\s+passed)\b/i.test(evidence);
              const acceptanceResult = /\bAC\d+\s*[:=-]\s*(?:pass(?:ed)?|fail(?:ed)?)\b/i.test(evidence);
              const pathResult = relevantPaths.some((path) => {
                const pathPattern = new RegExp(`${escapeRegex(path)}[\\s\\S]{0,160}\\b(?:pass(?:ed)?|fail(?:ed)?|verified|covered)\\b`, 'i');
                return pathPattern.test(normalizedEvidence);
              });
              const nonEmptyReport = reportTexts.some((text) => text.trim().length > 0);
              return commandOutcome || acceptanceResult || pathResult || nonEmptyReport;
            }

            function summarizePaths(paths) {
              const shown = paths.slice(0, MAX_DIAGNOSTIC_PATHS);
              const remaining = paths.length - shown.length;
              return `${shown.join(', ')}${remaining > 0 ? ` (+${remaining} more)` : ''}`;
            }

            function docsOnlyDeclaration(value) {
              const match = stripQuotedHistory(value).match(/\bSDLC-Exception\s*:\s*docs-only\s*(?:—|--?\s*|:)\s*(\S[^\n]*)/i);
              return match ? match[1].trim() : null;
            }

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

            const prIssueNumbers = extractIssueNumbers(prText);
            const specDirectories = resolveSpecDirectories(prText, changedPaths);
            const specRecords = await Promise.all(specDirectories.map(async (directory) => {
              const artifacts = await Promise.all([...SPEC_ARTIFACTS, ...OPTIONAL_AUTHORITY_ARTIFACTS].map((artifact) => readText(`${directory}/${artifact}`)));
              const text = artifacts.join('\n');
              return { directory, text, tasksText: artifacts[2], issueNumbers: extractIssueNumbers(text) };
            }));
            const specText = specRecords.map((record) => record.text).join('\n');
            const mismatchedSpecs = specRecords.filter((record) => ![...record.issueNumbers].some((number) => prIssueNumbers.has(number)));
            const correlatedIssueNumbers = new Set(specRecords.flatMap((record) => [...record.issueNumbers].filter((number) => prIssueNumbers.has(number))));
            const aggregateDirectories = resolveAggregateDirectories(prText, changedPaths);
            const aggregateTexts = await Promise.all(aggregateDirectories.map(async (directory) => (
              (await Promise.all(AGGREGATE_ARTIFACTS.map((artifact) => readText(`${directory}/${artifact}`)))).join('\n')
            )));
            const invalidAggregatePaths = changedPaths.filter((path) => /^specs\/epic-[^/]+\//.test(path)
              && !/^specs\/epic-[^/]+\/(?:requirements\.md|design\.md|epic-scope\.json)$/.test(path));

            const pathClasses = new Map(changedPaths.map((path) => [path, classifyChangedPath(path)]));
            const relevantPaths = changedPaths.filter((path) => pathClasses.get(path) === 'relevant');
            const verificationPaths = changedPaths
              .filter((path) => /(^|\/)(?:verification-report|verification)\.md$/i.test(path))
              .slice(0, MAX_VERIFICATION_REPORTS);
            const verificationReports = (await Promise.all(verificationPaths.map(readText))).map(stripQuotedHistory);
            const verificationEvidence = [extractVerificationSection(prText), ...verificationReports].filter(Boolean).join('\n');
            const taskEvidence = specRecords.map((record) => stripQuotedHistory(record.tasksText)).join('\n');
            const mappingEvidence = normalizePath(`${taskEvidence}\n${verificationEvidence}`);
            const unmatchedPaths = relevantPaths.filter((path) => !pathMentioned(path, mappingEvidence));

            const docsMarkerPresent = /\bSDLC-Exception\s*:\s*docs-only\b/i.test(stripQuotedHistory(prText));
            const docsReason = docsOnlyDeclaration(prText);
            const docsOnlyEligible = Boolean(docsReason)
              && changedPaths.length > 0
              && changedPaths.every((path) => pathClasses.get(path) === 'documentation');
            if (docsMarkerPresent && !docsReason) {
              failures.push('Invalid docs-only exception: provide a non-empty rationale after `SDLC-Exception: docs-only —`.');
            } else if (docsReason && !docsOnlyEligible) {
              const invalidating = changedPaths.filter((path) => pathClasses.get(path) !== 'documentation');
              failures.push(`Invalid docs-only exception: only documentation paths are allowed; invalidating paths: ${summarizePaths(invalidating) || 'none'}.`);
            }

            const spikePathEligible = changedPaths.length > 0
              && changedPaths.every((path) => ['documentation', 'spec', 'adr'].includes(pathClasses.get(path)));
            let spikeEligible = false;
            if (!docsOnlyEligible && spikePathEligible && correlatedIssueNumbers.size > 0) {
              const labelSets = await Promise.all([...correlatedIssueNumbers].slice(0, MAX_SPEC_DIRECTORIES).map(async (issueNumber) => {
                const response = await github.rest.issues.listLabelsOnIssue({ owner, repo, issue_number: issueNumber, per_page: 100 });
                return response.data.map((label) => typeof label === 'string' ? label : label.name);
              }));
              spikeEligible = labelSets.some((labels) => labels.some((label) => String(label).toLowerCase() === 'spike'));
            }

            const reducedMode = docsOnlyEligible ? 'docs-only' : spikeEligible ? 'spike/ADR' : null;

            if (prIssueNumbers.size === 0) {
              failures.push('Missing issue evidence: add a current issue reference such as `Closes #123` or `**Issue**: #123`.');
            }

            if (!docsOnlyEligible) {
              if (specDirectories.length === 0) {
                failures.push('Missing spec evidence: name or change the relevant `specs/feature-*` or `specs/bug-*` directory.');
              } else if (mismatchedSpecs.length > 0) {
                failures.push(`Issue/spec mismatch: PR issues ${[...prIssueNumbers].map((number) => `#${number}`).join(', ') || 'none'} do not match ${mismatchedSpecs.map((record) => record.directory).join(', ')}.`);
              }
              if (aggregateDirectories.length > 0 && specDirectories.length === 0) {
                failures.push('Epic aggregate evidence is coordination-only: include the active child `specs/feature-*` or `specs/bug-*` package; an aggregate cannot satisfy executable issue evidence.');
              }
              if (invalidAggregatePaths.length > 0) {
                failures.push(`Invalid epic aggregate artifacts: ${summarizePaths(invalidAggregatePaths)}. Aggregates may contain only requirements.md, design.md, and epic-scope.json.`);
              }
            }

            const steeringFiles = ['steering/product.md', 'steering/tech.md', 'steering/structure.md'];
            const steeringPresence = await Promise.all(steeringFiles.map(pathExists));
            const missingSteering = steeringFiles.filter((_, index) => !steeringPresence[index]);
            const currentEvidence = stripQuotedHistory(`${prText}\n${specText}\n${aggregateTexts.join('\n')}`);
            const steeringReferenced = /\bsteering\b|steering\/(?:product|tech|structure)\.md|product\.md|tech\.md|structure\.md/i.test(currentEvidence)
              || changedPaths.some((path) => /^steering\/(?:product|tech|structure)\.md$/.test(path));
            if (missingSteering.length > 0) {
              failures.push(`Missing steering artifacts: expected ${missingSteering.join(', ')}.`);
            } else if (!steeringReferenced) {
              failures.push('Missing steering evidence: explain alignment with `steering/product.md`, `steering/tech.md`, and `steering/structure.md`.');
            }

            if (!reducedMode && unmatchedPaths.length > 0) {
              failures.push(`Unmatched changed paths: ${summarizePaths(unmatchedPaths)}. Name each path, an explicit containing directory, or a path-specific behavior in tasks or verification evidence.`);
            }

            if (!reducedMode && !hasSpecificVerification(verificationEvidence, verificationReports, relevantPaths)) {
              failures.push('Missing specific verification: provide a command with its outcome, a non-empty report, an AC result, or a changed-path-specific result.');
            }

            if (!(await pathExists('CONTRIBUTING.md'))) {
              failures.push('Missing `CONTRIBUTING.md`: run `$nmg-sdlc:onboard-project` or `$nmg-sdlc:upgrade-project` so contributors can remediate this gate.');
            }

            if (failures.length > 0) {
              for (const failure of failures) core.error(`${failure} See CONTRIBUTING.md for the nmg-sdlc contribution checklist.`);
              core.setFailed(`nmg-sdlc contribution gate failed with ${failures.length} broken evidence edge(s).`);
            } else {
              core.info(`nmg-sdlc contribution evidence is consistent${reducedMode ? ` under the validated ${reducedMode} reduced-evidence contract` : ''}.`);
            }
```

## Evidence Graph

Evaluate evidence in this order:

1. Extract issue numbers only from current pull-request text. Ignore fenced examples, blockquotes, HTML comments, and explicitly historical sections.
2. Resolve executable spec directories from changed expected artifacts and explicit pull-request paths. Deduplicate, sort, cap at five directories, and read the four required artifacts plus optional `issue-scope.json` and `epic-link.json` authority files.
3. Require every selected executable spec directory to share at least one issue number with the pull request. An issue from another spec cannot satisfy the mismatched directory.
4. Resolve `specs/epic-*` separately. An aggregate is supporting coordination evidence only, requires an executable child package in the same non-docs contribution, and may contain only `requirements.md`, `design.md`, and `epic-scope.json`.
5. Classify each changed path. `skills/`, `scripts/`, `references/`, `agents/`, template directories, workflows, and otherwise non-documentation paths are relevant implementation paths; executable specs, epic aggregates, verification reports, documentation, and ADRs are separate evidence classes.
6. Require every relevant path to appear as an exact normalized path, an explicit containing-directory prefix ending in `/`, or a structured `Behavior for <path>: <description>` entry in selected task or verification evidence. Basename-only and similarly named paths do not match.
7. Accept verification only from the current Verification, Test Plan, or Validation section plus at most ten committed verification artifacts. A command paired with an outcome, a non-empty report, an `ACN: passed|failed` result, or a changed-path-specific result is concrete; generic keywords are not.
8. Validate reduced-evidence paths before applying them. The reduced contract never waives current issue linkage, required steering files/evidence, guide discoverability, or any non-exempt check.

Path diagnostics show at most 20 paths and append the remaining count so large pull requests stay actionable without producing unbounded annotations.

## Validated Exceptions

| Mode | Predicate | Reduced checks | Invalidating paths |
|------|-----------|----------------|--------------------|
| Documentation-only | Current PR text contains `SDLC-Exception: docs-only — <non-empty reason>` and every changed path is project documentation | Spec correlation, relevant-path mapping, and specific verification are not required | Any source, workflow, script, skill, template, shared reference, spec, ADR, or other non-documentation path |
| Spike/ADR | At least one PR/spec-correlated issue has the `spike` label and every changed path is documentation, a spec artifact, or `docs/decisions/*.md` | Relevant-path mapping and specific verification are not required | Any source, workflow, script, skill, template, shared reference, or other implementation path |

Use `issues.listLabelsOnIssue` for spike validation. GitHub documents that the endpoint accepts either read-only Issues or read-only Pull requests permission, so the workflow retains its existing minimal permission set.

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

## Lifecycle Behavior

- `onboard-project` applies the gate after steering exists because the workflow is a managed setup artifact.
- `upgrade-project` presents missing or outdated managed workflow findings in its normal non-destructive upgrade batch.
- Path collisions are reported as gaps and left for manual remediation.
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
- Never execute untrusted pull-request or repository content as code.
- Never run stack-specific build, test, package, or install commands from the default contribution gate.
