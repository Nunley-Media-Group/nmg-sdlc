import { describe, expect, test } from '@jest/globals';
import { AUTOMATED_COMMANDS } from '../../src/sdlc-commands.mjs';
import { renderedPromptBytes, workflowBody } from '../../src/sdlc-workflows.mjs';
import { workerPrompt } from '../sdlc-execute.mjs';

const AUTOMATED_BODY_CEILINGS = {
  'sdlc-execute': 11260,
  'sdlc-status': 814,
  'sdlc-verify-code': 3435,
  'sdlc-open-pr': 3644,
};

const WORKER_PROMPT_CEILINGS = {
  start: 6024,
  implement: 8748,
  verify: 3734,
  deliver: 5848,
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

  test('worker extras remain inlined', () => {
    expect(workerPrompt({ step: 'implement', issue: 42 })).toContain('# Simplify');
    expect(workerPrompt({ step: 'deliver', issue: 42 })).toContain('# Address PR Comments');
  });
});
