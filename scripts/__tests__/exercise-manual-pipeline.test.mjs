import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('v3 SDLC pipeline surface', () => {
  test('interactive skills use public /sdlc-* commands', () => {
    expect(read('workflows/draft-issue/WORKFLOW.md')).toContain('/sdlc-draft-issue');
    expect(read('workflows/write-spec/WORKFLOW.md')).toContain('/sdlc-write-spec');
    expect(read('references/interactive-gates.md')).toContain('xd://propose');
  });

  test('automated skills never call ask', () => {
    for (const name of ['start-issue', 'write-code', 'verify-code', 'open-pr']) {
      const source = read(`workflows/${name}/WORKFLOW.md`);
      expect(source).not.toContain('request_user_input');
      expect(source).not.toMatch(/\bask\b/);
    }
  });

  test('execute exists as the automated orchestrator', () => {
    expect(read('workflows/execute/WORKFLOW.md')).toContain('name: execute');
    expect(fs.existsSync(path.join(repoRoot, 'scripts', 'sdlc-execute.mjs'))).toBe(true);
  });
});
