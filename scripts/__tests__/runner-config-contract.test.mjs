import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

describe('runner config public contract', () => {
  test('example config does not expose unsupported maxTurns fields', () => {
    const config = JSON.parse(read('scripts/sdlc-config.example.json'));
    for (const step of Object.values(config.steps)) {
      expect(step).not.toHaveProperty('maxTurns');
    }
  });

  test('README describes timeouts without promising turn-limit config', () => {
    const readme = read('README.md');
    expect(readme).toContain('per-step timeouts');
    expect(readme).not.toContain('turn limits');
  });
});
