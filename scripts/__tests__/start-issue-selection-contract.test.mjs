import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('start-issue explicit issue contract', () => {
  const skill = read('workflows/start-issue/WORKFLOW.md');

  test('requires an explicit issue number and has no picker', () => {
    expect(skill).toMatch(/#N|#\{?N\}?|issue number/i);
    expect(skill).not.toContain('PRESENTATION_TARGET');
    expect(skill).not.toContain('ready to start?');
    expect(skill).not.toMatch(/\bask\b/);
    expect(skill).not.toContain('request_user_input');
  });

  test('treats an epic label as an ordinary issue', () => {
    expect(skill).not.toContain('### Explicit Epic Guard');
    expect(skill).not.toContain('### Coordination-Only Epic Filter');
    expect(skill).not.toContain('deriveEpicLineage');
  });

  test('keeps the compact controller invocation', () => {
    expect(skill).toContain('# Start Issue');
    expect(skill).toContain('node <plugin-root>/scripts/start-issue.mjs --issue N');
  });
});
