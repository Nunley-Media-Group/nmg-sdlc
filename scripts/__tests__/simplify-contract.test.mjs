import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { workerPrompt } from '../sdlc-execute.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('implement simplify workflow contract', () => {
  test('the live workflow is bundled only into implementation', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'workflows/simplify/WORKFLOW.md'))).toBe(true);
    expect(workerPrompt({ step: 'implement', issue: 42 })).toContain('Do not change generated artifacts.');
    expect(workerPrompt({ step: 'deliver', issue: 42 })).not.toContain('Do not change generated artifacts.');
  });
});
