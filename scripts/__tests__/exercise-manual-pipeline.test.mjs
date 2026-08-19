import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('v3 SDLC pipeline surface', () => {
  test('interactive skills print the native /plan line', () => {
    expect(read('skills/draft-issue/SKILL.md')).toContain('Run /plan /skill:draft-issue');
    expect(read('skills/write-spec/SKILL.md')).toContain('Run /plan /skill:write-spec');
    expect(read('references/interactive-gates.md')).toContain('xd://propose');
  });

  test('automated skills never call ask', () => {
    for (const name of ['start-issue', 'write-code', 'verify-code', 'open-pr']) {
      const source = read(`skills/${name}/SKILL.md`);
      expect(source).not.toContain('request_user_input');
      expect(source).not.toMatch(/\bask\b/);
    }
  });

  test('execute exists as the automated orchestrator', () => {
    expect(read('skills/execute/SKILL.md')).toContain('name: execute');
    expect(fs.existsSync(path.join(repoRoot, 'scripts', 'sdlc-execute.mjs'))).toBe(true);
  });
});
