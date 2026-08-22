import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { workerPrompt } from '../sdlc-execute.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('removed simplify workflow contract', () => {
  test('the live workflow is absent and implement does not inline it', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'workflows/simplify'))).toBe(false);
    expect(workerPrompt({ step: 'implement', issue: 42 })).not.toContain('# Simplify');
  });
});
