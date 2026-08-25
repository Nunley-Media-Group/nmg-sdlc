import { describe, expect, test } from '@jest/globals';
import { AUTOMATED_COMMANDS } from '../../src/sdlc-commands.mjs';
import { renderedPromptBytes, workflowBody } from '../../src/sdlc-workflows.mjs';
import { workerPrompt } from '../sdlc-execute.mjs';

const AUTOMATED_BODY_CEILINGS = {
  'sdlc-execute': 1040,
  'sdlc-status': 814,
  'sdlc-verify-code': 3435,
  'sdlc-open-pr': 2116,
};

const WORKER_PROMPT_CEILINGS = {
  start: 1445,
  implement: 6055,
  review1: 1388,
  fix1: 958,
  review2: 1388,
  fix2: 958,
  verify: 3734,
  deliver: 2671,
};

describe('rendered prompt byte ceilings', () => {
  test.each(AUTOMATED_COMMANDS)('%s automated body stays within its UTF-8 ceiling', (name, skill) => {
    const body = workflowBody(skill);
    expect(renderedPromptBytes(body)).toBeLessThanOrEqual(AUTOMATED_BODY_CEILINGS[name]);
    expect(body).not.toContain('## Integration with SDLC Workflow');
  });

  test.each(Object.entries(WORKER_PROMPT_CEILINGS))('%s worker prompt stays within its UTF-8 ceiling', (step, ceiling) => {
    const prompt = workerPrompt({ step, issue: 42 });
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
});
