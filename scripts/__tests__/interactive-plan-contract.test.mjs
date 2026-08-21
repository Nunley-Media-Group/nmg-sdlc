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
  it('draft-issue has no Epic or Spike option and does not bounce to /skill:', () => {
    const source = read('workflows/draft-issue/WORKFLOW.md');

    expect(source).toContain('/sdlc-draft-issue');
    expect(source).toContain('Bug');
    expect(source).toContain('Enhancement');
    expect(source).not.toMatch(/\bSpike\b/);
    expect(source).toContain('xd://propose');
    expect(source).not.toContain('/skill:');
    expect(source).not.toMatch(/classification[^\n]{0,80}Epic|Epic option|epicRecommended/i);
  });

  it('write-spec finishes at xd://propose then publishes', () => {
    const source = read('workflows/write-spec/WORKFLOW.md');

    expect(source).toContain('/sdlc-write-spec');
    expect(source).toContain('xd://propose');
    expect(source).toContain('Usage: /sdlc-write-spec #N');
    expect(source).toContain('publish-approved-spec.mjs');
    expect(source).toContain('Finished — stop writing specs');
    expect(source).toContain('docs: approve spec for #N');
    expect(source).toContain('publish-approved-spec.mjs merge');
    expect(source).toContain('Closes #N');
    expect(source).not.toContain('/skill:');
  });

  it('automated skills do not call ask', () => {
    for (const name of AUTOMATED) {
      const source = read(`workflows/${name}/WORKFLOW.md`);
      expect(`${name}\n${source}`).not.toMatch(/\bask\b/);
      expect(source).not.toContain('request_user_input');
    }
  });
});
