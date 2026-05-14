import { describe, expect, test } from '@jest/globals';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  evaluateDraftIssueArtifact,
  extractArtifactFromOutput,
  rubricChecks,
} from '../skill-exercise-runner.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runner = path.join(repoRoot, 'scripts', 'skill-exercise-runner.mjs');
const passArtifact = path.join(repoRoot, 'scripts', '__fixtures__', 'skill-exercise', 'draft-issue', 'artifacts', 'feature-pass.md');
const failArtifact = path.join(repoRoot, 'scripts', '__fixtures__', 'skill-exercise', 'draft-issue', 'artifacts', 'malformed-fail.md');

describe('skill exercise rubric evaluator', () => {
  test('passing draft-issue feature artifact passes all applicable criteria', () => {
    const artifact = `# Add audit-ready deployment summaries

## User Story

**As a** release maintainer
**I want** deployment summaries to include issue, spec, and verification evidence
**So that** reviewers can confirm release readiness without searching across tools.

## Acceptance Criteria

### AC1: Summary Links Issue Evidence

**Given** a deployment summary is generated
**When** the related issue exists
**Then** the summary includes the issue number, title, and URL.

### AC2: Summary Links Spec Evidence

**Given** a deployment summary is generated
**When** a spec package exists for the issue
**Then** the summary links requirements, design, tasks, and Gherkin files.

### AC3: Summary Links Verification Evidence

**Given** a deployment summary is generated
**When** verification has completed
**Then** the summary includes the verification report path and pass/fail status.

## Out of Scope

- Creating or mutating deployment infrastructure.
`;

    const results = evaluateDraftIssueArtifact(artifact);
    const applicable = results.filter((result) => result.detail !== 'criterion not applicable for feature classification');

    expect(applicable.every((result) => result.status === 'pass')).toBe(true);
    expect(results.find((result) => result.id === 'R5')).toMatchObject({
      status: 'skipped',
      detail: 'criterion not applicable for feature classification',
    });
  });

  test('malformed artifacts fail with details naming missing structure', () => {
    const results = evaluateDraftIssueArtifact(`# Deployment summaries

## Acceptance Criteria

### AC1: Missing structure

Given a summary exists
Then it has some content.

## Out of Scope
`);

    expect(results.find((result) => result.id === 'R1')).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('action verb'),
    });
    expect(results.find((result) => result.id === 'R2')).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('expected at least 3'),
    });
    expect(results.find((result) => result.id === 'R3')).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('missing Given/When/Then'),
    });
    expect(results.find((result) => result.id === 'R4')).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('## User Story'),
    });
    expect(results.find((result) => result.id === 'R6')).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('Out of Scope'),
    });
  });

  test('missing artifacts and missing evaluators produce specific skip reasons', () => {
    expect(rubricChecks('draft-issue', null, { missingReason: 'artifact missing' }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'R1', status: 'skipped', detail: 'artifact missing' }),
      ]));

    expect(rubricChecks('unknown-skill', '# Add a thing'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'R1', status: 'skipped', detail: 'missing evaluator for skill unknown-skill' }),
      ]));
  });

  test('artifact extraction ignores transcript text around the authored body', () => {
    const extracted = extractArtifactFromOutput(`Preparing draft...
--- BEGIN NMG-SDLC ARTIFACT ---
# Add release notes

## User Story

**As a** maintainer
**I want** release notes
**So that** users can upgrade safely.
--- END NMG-SDLC ARTIFACT ---
Done.`);

    expect(extracted).toMatchObject({
      reason: null,
      artifact: expect.stringContaining('# Add release notes'),
    });
    expect(extracted.artifact).not.toContain('Preparing draft');
  });

  test('artifact extraction preserves unsupported interactive gate skips', () => {
    expect(extractArtifactFromOutput('request_user_input is not supported in exec mode')).toEqual({
      artifact: null,
      reason: 'unsupported interactive gate',
    });
  });

  test('a failed evaluated rubric criterion makes the runner exit non-zero', () => {
    const proc = spawnSync(process.execPath, [runner, '--skill', 'draft-issue', '--artifact', failArtifact, '--base', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(proc.status).toBe(1);
    expect(proc.stdout).toContain('R1');
    expect(proc.stdout).toContain('[fail]');
  });

  test('missing artifact paths return argument/I/O exit code 2', () => {
    const proc = spawnSync(process.execPath, [runner, '--skill', 'draft-issue', '--artifact', 'missing-artifact.md', '--base', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(proc.status).toBe(2);
    expect(proc.stderr).toContain('Artifact read error:');
  });

  test('default deterministic fixture evaluates without live exercise mode', () => {
    const proc = spawnSync(process.execPath, [runner, '--skill', 'draft-issue', '--artifact', passArtifact, '--base', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(proc.stdout).toContain('R1');
    expect(proc.stdout).not.toContain('rubric evaluation not yet implemented');
  });
});
