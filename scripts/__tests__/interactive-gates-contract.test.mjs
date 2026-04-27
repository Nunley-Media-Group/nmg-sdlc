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

function walkMarkdown(relativeDir) {
  const absoluteDir = path.join(REPO_ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name).split(path.sep).join('/');

    if (entry.isDirectory()) {
      return walkMarkdown(relativePath);
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      return [relativePath];
    }
    return [];
  });
}

function activeInstructionFiles() {
  return [
    ...walkMarkdown('references'),
    ...skillFiles(),
    ...fs.readdirSync(path.join(REPO_ROOT, 'skills')).flatMap((name) => walkMarkdown(`skills/${name}/references`)),
  ].sort();
}

describe('Plan Mode input gate contract', () => {
  it('requires request_user_input and proposed_plan for manual gates', () => {
    const source = read('references/interactive-gates.md');

    expect(source).toContain('request_user_input');
    expect(source).toContain('<proposed_plan>');
    expect(source).toContain('Do not add a second "proceed?" confirmation gate');
    expect(source).toContain('prompt-config.md');
    expect(source).toContain('free-form `Other` affordance');
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
    for (const relativePath of activeInstructionFiles()) {
      const source = read(relativePath);
      expect(`${relativePath}\n${source}`).not.toContain('Codex interactive gate');
      expect(`${relativePath}\n${source}`).not.toContain('conversational prompt');
      expect(`${relativePath}\n${source}`).not.toContain('free-text prompt');
      expect(`${relativePath}\n${source}`).not.toContain('re-menu');
    }
  });

  it('pins the automatic prompt config and free-form fallback contract', () => {
    const promptConfig = read('references/prompt-config.md');
    const interactiveGates = read('references/interactive-gates.md');

    expect(interactiveGates).toContain('Run the prompt-config preflight');
    expect(promptConfig).toContain('node scripts/ensure-codex-prompt-config.mjs');
    expect(promptConfig).toContain('changed` is `true`, stop before the original gate');
    expect(interactiveGates).toContain('free-form `Other` affordance');
    expect(interactiveGates).toContain('free-form text is mapped back into the current decision');
  });
});
