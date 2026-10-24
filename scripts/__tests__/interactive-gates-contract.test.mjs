import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WRITE_SPEC_FINISHED_LABELS } from '../../src/host-events.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function skillFiles() {
  return fs.readdirSync(path.join(REPO_ROOT, 'workflows'))
    .map((name) => `workflows/${name}/WORKFLOW.md`)
    .filter((relativePath) => fs.existsSync(path.join(REPO_ROOT, relativePath)));
}

describe('native plan-mode interactive contract', () => {
  it('documents hooks-module plan entry, AskUserQuestion, and ExitPlanMode', () => {
    const source = read('references/interactive-gates.md');

    expect(source).toContain('/sdlc-draft-issue');
    expect(source).toContain('/sdlc-write-spec #N');
    expect(source).toContain('/sdlc-execute');
    expect(source).toContain('hooks/register.ts');
    expect(source).toContain('runs builtin `/plan`');
    expect(source).toContain('`AskUserQuestion`');
    expect(source).toContain('`ExitPlanMode`');
    expect(source).toContain('Run /sdlc-<command> in the TUI.');
    expect(source).not.toMatch(/xd:\/\/|local:\/\/|built-in `ask`|src\/extension\.ts|nmg-pi/);
    expect(source).not.toContain('Run /plan /skill:<name>');
    expect(source).not.toContain('request_user_input');
    expect(source).not.toContain('<proposed_plan>');
    expect(source).not.toContain('prompt-config.md');
  });

  it('returns every merged write-spec publication to native plan', () => {
    const source = read('references/interactive-gates.md');
    expect(source).toContain('every selected continuation issue writes a distinct complete plan to the plan file and calls `ExitPlanMode` before mutation');
    expect(source).toContain('merge --issue N --dir specs/N-slug');
    expect(source).toContain('`published[]` survives because the hooks module holds it');
  });

  it('ends write-spec Finished with the approved ExitPlanMode call', () => {
    const gates = read('references/interactive-gates.md');
    const writeSpec = read('workflows/write-spec/WORKFLOW.md');
    for (const label of WRITE_SPEC_FINISHED_LABELS) {
      expect(gates).toContain(label);
      expect(writeSpec).toContain(label);
    }
    expect(gates).toContain('ends the reply by calling `ExitPlanMode` as its last action');
    expect(writeSpec).toContain('ExitPlanMode');
    expect(writeSpec).not.toMatch(/xd:\/\/|local:\/\//);
  });

  it('has no plugin bypass reference', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'references', 'unattended-mode.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, 'references', 'prompt-config.md'))).toBe(false);
    for (const relativePath of skillFiles()) {
      const source = read(relativePath);
      expect(`${relativePath}\n${source}`).not.toContain('Done. Awaiting orchestrator.');
      expect(`${relativePath}\n${source}`).not.toMatch(/xd:\/\/propose|built-in `ask`/);
    }
  });
});
