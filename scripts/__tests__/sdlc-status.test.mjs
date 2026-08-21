import { describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectEvidence,
  collectVerification,
  findFeatureDir,
  inferLifecycle,
  renderJson,
  renderText,
  runCli,
} from '../sdlc-status.mjs';

function baseEvidence(overrides = {}) {
  return {
    project: {
      branch: '42-example',
      dirty: false,
      implementationPaths: [],
      baseRelativeCommits: [],
      ...(overrides.project ?? {}),
    },
    issue: {
      number: 42,
      title: 'Example',
      state: 'OPEN',
      dependsOn: [],
      deliverableDependencies: { status: 'none' },
      ...(overrides.issue ?? {}),
    },
    spec: overrides.spec === undefined
      ? { complete: true, path: 'specs/42-example', scope: { status: 'ok' } }
      : overrides.spec,
    verification: overrides.verification ?? null,
    pullRequest: overrides.pullRequest ?? null,
    gaps: overrides.gaps ?? [],
  };
}

describe('sdlc-status v3 recommendations', () => {
  it('recommends write-spec when the first ready issue has no approved spec', () => {
    const status = inferLifecycle(baseEvidence({ spec: null }));
    expect(status.stage).toBe('ready');
    expect(status.nextAction.command).toBe('/sdlc-write-spec #42');
  });

  it('recommends execute when an approved spec exists and the issue is unblocked', () => {
    const status = inferLifecycle(baseEvidence());
    expect(status.stage).toBe('specified');
    expect(status.nextAction.command).toBe('/sdlc-execute #42');
  });

  it('recommends verify-code after implementation starts', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
    }));
    expect(status.stage).toBe('implementing');
    expect(status.nextAction.command).toBe('/sdlc-verify-code #42');
  });

  it('recommends open-pr when verification has passed', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
      verification: { status: 'pass', current: true },
    }));
    expect(status.stage).toBe('verified');
    expect(status.nextAction.command).toBe('/sdlc-open-pr #42');
  });

  it('recommends open-pr while an open PR awaits merge', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
      verification: { status: 'pass', current: true },
      pullRequest: { number: 9, state: 'OPEN', isDraft: false },
    }));
    expect(status.stage).toBe('review');
    expect(status.nextAction.command).toBe('/sdlc-open-pr #42');
  });

  it('recommends open-pr when PR evidence is still pending', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
      verification: { status: 'pass', current: true, readinessStatus: 'pr_evidence_pending' },
      pullRequest: { number: 9, state: 'OPEN', isDraft: false },
    }));
    expect(status.stage).toBe('delivery-validation-pending');
    expect(status.nextAction.command).toBe('/sdlc-open-pr #42');
  });

  it('never recommends worker /skill: commands', () => {
    const cases = [
      inferLifecycle(baseEvidence({
        project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
      })),
      inferLifecycle(baseEvidence({
        project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
        verification: { status: 'pass', current: true },
      })),
      inferLifecycle(baseEvidence({
        project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
        verification: { status: 'pass', current: true },
        pullRequest: { number: 9, state: 'OPEN', isDraft: false },
      })),
      inferLifecycle(baseEvidence({
        project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
        verification: { status: 'pass', current: true, readinessStatus: 'pr_evidence_pending' },
        pullRequest: { number: 9, state: 'OPEN', isDraft: false },
      })),
    ];
    for (const status of cases) {
      expect(status.nextAction.command.startsWith('/sdlc-')).toBe(true);
      expect(status.nextAction.command).not.toMatch(/\/skill:/);
    }
  });

  it('keeps Depends on parents blocked', () => {
    const status = inferLifecycle(baseEvidence({
      issue: {
        number: 42,
        title: 'Example',
        state: 'OPEN',
        dependsOn: [1],
        deliverableDependencies: { status: 'none' },
      },
    }));
    expect(status.stage).toBe('blocked');
    expect(status.nextAction.command).toBe('/sdlc-status');
  });

  it('does not emit epicAuthority or coordination in JSON', () => {
    const status = inferLifecycle(baseEvidence());
    const parsed = JSON.parse(renderJson(status));
    expect(parsed).not.toHaveProperty('epicAuthority');
    expect(parsed).not.toHaveProperty('coordination');
    expect(JSON.stringify(parsed)).not.toContain('epicAuthority');
  });

  it('prints the skill usage line from the CLI', () => {
    let stdout = '';
    const code = runCli(['--help'], {
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write() {} },
    });
    expect(code).toBe(0);
    expect(stdout).toContain('Usage: /sdlc-status [--json]');
  });

  it('renders stage first and next action last', () => {
    const status = inferLifecycle(baseEvidence());
    const lines = renderText(status).trim().split('\n');
    expect(lines[0]).toBe('SDLC status: specified');
    expect(lines.at(-1)).toBe('Next: /sdlc-execute #42');
  });
  it('collects an approved spec using the discovered non-main default branch', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-'));
    try {
      const git = (args) => execFileSync('git', args, { cwd: project, encoding: 'utf8' });
      git(['init', '-b', 'master']);
      git(['config', 'user.name', 'Test']);
      git(['config', 'user.email', 'test@example.com']);
      fs.writeFileSync(path.join(project, 'README.md'), 'fixture\n');
      git(['add', 'README.md']);
      git(['commit', '-m', 'fixture']);
      git(['checkout', '-b', '42-example']);

      const specDir = path.join(project, 'specs', '42-example');
      fs.mkdirSync(specDir, { recursive: true });
      const approved = '**Issue**: #42\n**Status**: Approved\n';
      for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
        fs.writeFileSync(path.join(specDir, name), approved);
      }

      const observedGitArgs = [];
      const run = (command, args, options = {}) => {
        if (command === 'gh') {
          if (args[0] === 'repo') {
            return { ok: true, status: 0, stdout: 'master\n', stderr: '' };
          }
          return { ok: false, status: 1, stdout: '', stderr: 'offline fixture' };
        }
        observedGitArgs.push(args);
        const result = spawnSync(command, args, {
          cwd: options.cwd,
          encoding: 'utf8',
          stdio: 'pipe',
        });
        return {
          ok: !result.error && result.status === 0,
          status: result.status,
          stdout: result.stdout ?? '',
          stderr: result.error?.message ?? result.stderr ?? '',
        };
      };

      const evidence = collectEvidence(project, { run });
      expect(evidence.project.defaultBranch).toBe('master');
      expect(evidence.spec).toMatchObject({
        path: 'specs/42-example',
        complete: true,
        missingFiles: [],
      });
      expect(observedGitArgs).toContainEqual(['diff', '--name-only', 'master...HEAD']);
      expect(observedGitArgs).not.toContainEqual(expect.arrayContaining(['main...HEAD']));

      fs.writeFileSync(path.join(specDir, 'design.md'), '**Issue**: #42\n**Status**: Draft\n');
      expect(collectEvidence(project, { run }).spec.complete).toBe(false);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it('selects an exact branch spec and rejects unresolved duplicate issue specs', () => {
    const specsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-specs-'));
    try {
      fs.mkdirSync(path.join(specsDir, '42-first'));
      fs.mkdirSync(path.join(specsDir, '42-second'));
      expect(findFeatureDir(specsDir, 42, 'second')).toBe('42-second');
      expect(() => findFeatureDir(specsDir, 42, null)).toThrow(
        'multiple spec directories found for #42: 42-first, 42-second',
      );
    } finally {
      fs.rmSync(specsDir, { recursive: true, force: true });
    }
  });
  it('validates nested readiness and delivery markers against the current PR head', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-verification-'));
    try {
      const specPath = 'specs/42-example';
      const specDir = path.join(project, specPath);
      fs.mkdirSync(specDir, { recursive: true });
      const reportPath = path.join(specDir, 'verification-report.md');
      const oldHead = '1'.repeat(40);
      const currentHead = '2'.repeat(40);
      const scope = {
        issueNumber: 42,
        specPath,
        status: 'scoped',
        delivery: {
          acceptanceCriteria: ['AC1'],
          functionalRequirements: ['FR1'],
          tasks: ['T001'],
          scenarios: ['SCN001'],
        },
        regression: {
          acceptanceCriteria: [],
          functionalRequirements: [],
          scenarios: [],
        },
      };
      const local = {
        ...scope.delivery,
        regression: scope.regression,
        tests: 'pass',
        steeringGates: 'pass',
      };
      const evidence = (headSha) => ({
        kind: 'required_check',
        name: 'contract-tests',
        event: 'pull_request',
        acceptanceCriteria: ['AC1'],
        headSha,
        conclusion: 'SUCCESS',
        url: 'https://github.example/check/1',
      });
      const readiness = (headSha) => ({
        schemaVersion: 1,
        state: 'pr_evidence_satisfied',
        issueNumber: 42,
        specPath,
        local,
        evidence: [evidence(headSha)],
      });
      const marker = (name, value) => `<!-- ${name}: ${JSON.stringify(value)} -->`;
      const report = (readinessValue, deliveryValue = null) => [
        '# Verification Report',
        '',
        '### Implementation Status: Pass',
        '',
        marker('nmg-sdlc-issue-scope', scope),
        marker('nmg-sdlc-pr-readiness', readinessValue),
        deliveryValue ? marker('nmg-sdlc-delivery-validation', deliveryValue) : '',
        '',
      ].join('\n');
      const spec = { path: specPath, scope };
      const pullRequest = { number: 9, headRefOid: currentHead };

      fs.writeFileSync(reportPath, report(readiness(oldHead)));
      const staleGaps = [];
      const stale = collectVerification(project, spec, pullRequest, [], { fs }, staleGaps);
      expect(stale).toMatchObject({
        status: 'pass',
        current: false,
        readinessStatus: null,
      });
      expect(stale.gaps).toContain('evidence item 1 does not match the expected head SHA');
      expect(staleGaps.join('\n')).toContain('verification evidence: evidence item 1 does not match');

      const delivery = {
        schemaVersion: 1,
        state: 'final_sha_validated',
        issueNumber: 42,
        specPath,
        pullRequestNumber: 9,
        headSha: oldHead,
        evidence: [evidence(oldHead)],
      };
      fs.writeFileSync(reportPath, report(readiness(currentHead), delivery));
      const invalidDelivery = collectVerification(project, spec, pullRequest, [], { fs }, []);
      expect(invalidDelivery).toMatchObject({
        status: 'pass',
        current: true,
        readinessStatus: 'pr_evidence_satisfied',
        deliveryValidationStatus: 'unverifiable',
      });
      expect(invalidDelivery.deliveryValidationGaps).toContain(
        'delivery-validation head does not match the final pull-request head',
      );

      fs.writeFileSync(reportPath, report(readiness(currentHead)));
      const untracked = collectVerification(project, spec, pullRequest, ['src/untracked.mjs'], { fs }, []);
      expect(untracked.current).toBe(false);
      expect(untracked.gaps).toContain(
        'untracked implementation paths invalidate verification: src/untracked.mjs',
      );
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });


});
