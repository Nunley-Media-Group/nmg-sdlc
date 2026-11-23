import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workflow = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..',
  'workflows', 'write-code', 'WORKFLOW.md'), 'utf8');

describe('@SCN001 write-code concludes a resolved integration merge with commit-merge', () => {
  test('names the commit-merge helper for the integration merge and never concludes it with raw git commit', () => {
    expect(workflow).toContain('sdlc-safe-recoveries.mjs commit-merge --issue N --step implement --spec specs/N-SLUG');
    expect(workflow).not.toContain('git commit --no-edit');
  });
});
