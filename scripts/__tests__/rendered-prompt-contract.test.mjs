import { describe, expect, test } from '@jest/globals';
import { workerPrompt } from '../sdlc-execute.mjs';


describe('rendered prompt contracts', () => {

  test('worker prompts inline only their owned workflows', () => {
    expect(workerPrompt({ step: 'implement', issue: 42 })).toContain('# Simplify');
    expect(workerPrompt({ step: 'review1', issue: 42 })).toContain('# Review Main');
    expect(workerPrompt({ step: 'review2', issue: 42 })).toContain('# Review Main');
    expect(workerPrompt({ step: 'fix1', issue: 42 })).toContain('# Apply Review');
    expect(workerPrompt({ step: 'fix2', issue: 42 })).toContain('# Apply Review');
    expect(workerPrompt({ step: 'deliver', issue: 42 })).not.toContain('# Address PR Comments');
    expect(workerPrompt({ step: 'deliver', issue: 42 })).toContain('sdlc-deliver.mjs');
    expect(workerPrompt({ step: 'start', issue: 42 })).toContain('start-issue.mjs');
    expect(workerPrompt({ step: 'start', issue: 42 })).not.toContain('<plugin-root>');
  });

  test('implement prompt orders simplify before publication and protects generated artifacts', () => {
    const prompt = workerPrompt({ step: 'implement', issue: 42 });
    expect(prompt).toContain('execute that entire section now');
    expect(prompt).toContain('before any final verification, commit, push, or handoff write');
    expect(prompt).toContain('Do not change generated artifacts.');
  });

  test('deliver prompt routes every repeated controller result', () => {
    const prompt = workerPrompt({ step: 'deliver', issue: 42 });
    expect(prompt).toContain('Route every invocation, including every post-remediation rerun');
    expect(prompt).toContain('A new exit');
    expect(prompt).toContain('never terminal by itself and never bypasses repeat detection');
    expect(prompt).toContain('NMG_SDLC_PR_EVIDENCE');
  });
});
