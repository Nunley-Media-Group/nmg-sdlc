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
  return fs.readdirSync(path.join(REPO_ROOT, 'skills'))
    .map((name) => `skills/${name}/SKILL.md`)
    .filter((relativePath) => fs.existsSync(path.join(REPO_ROOT, relativePath)));
}

describe('Plan Mode input gate contract', () => {
  it('requires request_user_input and proposed_plan for manual gates', () => {
    const source = read('references/interactive-gates.md');

    expect(source).toContain('request_user_input');
    expect(source).toContain('<proposed_plan>');
    expect(source).toContain('Do not add a second "proceed?" confirmation gate');
  });

  it('forbids request_user_input in unattended mode', () => {
    const source = read('references/unattended-mode.md');

    expect(source).toContain('Do NOT call `request_user_input`');
    expect(source).toContain('skip the call entirely');
  });

  it('points every skill entrypoint at the Plan Mode input gate contract', () => {
    for (const relativePath of skillFiles()) {
      const source = read(relativePath);
      if (!source.includes('references/interactive-gates.md')) continue;

      expect(`${relativePath}\n${source}`).toContain('`request_user_input`');
      expect(`${relativePath}\n${source}`).toContain('<proposed_plan>');
    }
  });

  it('does not reintroduce legacy Codex interactive gate wording in active instructions', () => {
    const activeDocs = [
      'references/codex-tooling.md',
      'references/interactive-gates.md',
      'references/unattended-mode.md',
      ...skillFiles(),
    ];

    for (const relativePath of activeDocs) {
      const source = read(relativePath);
      expect(`${relativePath}\n${source}`).not.toContain('Codex interactive gate');
      expect(`${relativePath}\n${source}`).not.toContain('conversational prompt');
    }
  });
});
