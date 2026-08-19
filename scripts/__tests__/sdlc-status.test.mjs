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
    expect(status.nextAction.command).toBe('/plan /skill:write-spec #42');
  });

  it('recommends execute when an approved spec exists and the issue is unblocked', () => {
    const status = inferLifecycle(baseEvidence());
    expect(status.stage).toBe('specified');
    expect(status.nextAction.command).toBe('/skill:execute #42');
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
    expect(status.nextAction.command).toBe('/skill:status');
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
    expect(stdout).toContain('Usage: /skill:status [--json]');
  });

  it('renders stage first and next action last', () => {
    const status = inferLifecycle(baseEvidence());
    const lines = renderText(status).trim().split('\n');
    expect(lines[0]).toBe('SDLC status: specified');
    expect(lines.at(-1)).toBe('Next: /skill:execute #42');
  });
});
