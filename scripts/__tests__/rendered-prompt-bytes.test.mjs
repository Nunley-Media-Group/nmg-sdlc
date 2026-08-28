import { describe, expect, test } from '@jest/globals';
import { AUTOMATED_COMMANDS } from '../../src/sdlc-commands.mjs';
import { renderedPromptBytes, workflowBody } from '../../src/sdlc-workflows.mjs';
import { workerPrompt } from '../sdlc-execute.mjs';

const AUTOMATED_BODY_CEILINGS = {
  'sdlc-execute': 1160,
  'sdlc-status': 814,
  'sdlc-verify-code': 5000,
  'sdlc-open-pr': 4600,
};

const WORKER_PROMPT_CEILINGS = {
  start: 1475,
  implement: 6530,
  review1: 1460,
  fix1: 1030,
  review2: 1460,
  fix2: 1030,
  verify: 5700,
  deliver: 5150,
};

const PRODUCTION_WORKER_INPUT = {
  issue: 10000,
  controllerRunId: '123e4567-e89b-12d3-a456-426614174000',
};

describe('rendered prompt byte ceilings', () => {
  test.each(AUTOMATED_COMMANDS)('%s automated body stays within its UTF-8 ceiling', (name, skill) => {
    const body = workflowBody(skill);
    expect(renderedPromptBytes(body)).toBeLessThanOrEqual(AUTOMATED_BODY_CEILINGS[name]);
    expect(body).not.toContain('## Integration with SDLC Workflow');
  });

  test.each(Object.entries(WORKER_PROMPT_CEILINGS))('%s worker prompt stays within its UTF-8 ceiling', (step, ceiling) => {
    const prompt = workerPrompt({ step, ...PRODUCTION_WORKER_INPUT });
    expect(renderedPromptBytes(prompt)).toBeLessThanOrEqual(ceiling);
    expect(prompt).not.toContain('## Integration with SDLC Workflow');
  });

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
