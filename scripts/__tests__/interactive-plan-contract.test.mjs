import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const AUTOMATED = [
  'start-issue',
  'write-code',
  'simplify',
  'verify-code',
  'open-pr',
  'address-pr-comments',
];

describe('interactive plan contract (SCN003, SCN008, SCN012)', () => {
  it('draft-issue prints the exact /plan line and has no Epic option', () => {
    const source = read('skills/draft-issue/SKILL.md');

    expect(source).toContain('Run /plan /skill:draft-issue');
    expect(source).toContain('Bug');
    expect(source).toContain('Enhancement');
    expect(source).toContain('Spike');
    expect(source).toContain('xd://propose');
    expect(source).not.toMatch(/classification[^\n]{0,80}Epic|Epic option|epicRecommended/i);
  });

  it('write-spec finishes at xd://propose', () => {
    const source = read('skills/write-spec/SKILL.md');

    expect(source).toContain('Run /plan /skill:write-spec');
    expect(source).toContain('xd://propose');
    expect(source).toContain('Usage: /plan /skill:write-spec #N');
  });

  it('automated skills do not call ask', () => {
    for (const name of AUTOMATED) {
      const source = read(`skills/${name}/SKILL.md`);
      expect(`${name}\n${source}`).not.toMatch(/\bask\b/);
      expect(source).not.toContain('request_user_input');
    }
  });
});
