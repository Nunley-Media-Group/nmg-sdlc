import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('extension sdlc- commands', () => {
  it('registers only sdlc-prefixed public commands', () => {
    const source = read('src/extension.ts');

    expect(source).toContain('["sdlc-draft-issue", "draft-issue"');
    expect(source).toContain('["sdlc-write-spec", "write-spec"');
    expect(source).toContain('["sdlc-onboard-project", "onboard-project"');
    expect(source).toContain('["sdlc-upgrade-project", "upgrade-project"');
    expect(source).toContain('["sdlc-run-retro", "run-retro"');
    expect(source).toContain('["sdlc-execute", "execute"');
    expect(source).toContain('["sdlc-status", "status"');
    expect(source).toContain('["sdlc-verify-code", "verify-code"');
    expect(source).toContain('["sdlc-open-pr", "open-pr"');
    expect(source).toContain('pi.registerCommand(name');
    expect(source).not.toMatch(/registerCommand\("(execute|draft-issue|write-spec)"/);
  });

  it('interactive commands enter /plan and automated commands invoke /skill:', () => {
    const source = read('src/extension.ts');

    expect(source).toContain('`/plan /skill:${skill}${suffix}`');
    expect(source).toContain('`/skill:${skill}${suffix}`');
  });
});
