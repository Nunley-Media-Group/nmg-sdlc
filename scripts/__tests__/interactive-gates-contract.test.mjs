import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('native /plan interactive contract', () => {
  it('documents native /plan, ask, and xd://propose', () => {
    const source = read('references/interactive-gates.md');

    expect(source).toContain('/sdlc-draft-issue');
    expect(source).toContain('/sdlc-write-spec #N');
    expect(source).toContain('/sdlc-execute');
    expect(source).toContain('xd://propose');
    expect(source).toContain('built-in `ask`');
    expect(source).toContain('src/extension.ts');
    expect(source).not.toContain('Run /plan /skill:<name>');
    expect(source).not.toContain('request_user_input');
    expect(source).not.toContain('<proposed_plan>');
    expect(source).not.toContain('prompt-config.md');
  });

  it('returns every merged write-spec publication to native plan', () => {
    const source = read('references/interactive-gates.md');
    expect(source).toContain('every merged publication queues exactly one `tool_result`-driven follow-up `/plan` turn');
    expect(source).toContain('every selected continuation issue writes a distinct complete local plan');
    expect(source).toContain('calls `xd://propose` before mutation');
    expect(source).not.toContain('After write-spec approval, execution publishes then `ask` Continue/Finished');
  });

  it('has no plugin bypass reference', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'references', 'unattended-mode.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, 'references', 'prompt-config.md'))).toBe(false);
    for (const relativePath of skillFiles()) {
      const source = read(relativePath);
      expect(`${relativePath}\n${source}`).not.toContain('Done. Awaiting orchestrator.');
    }
  });
});
