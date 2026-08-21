import { describe, expect, it } from '@jest/globals';
import { inferLifecycle, renderJson, renderText, runCli } from '../sdlc-status.mjs';

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
});
