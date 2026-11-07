import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const ENSURE = 'sdlc-models.mjs ensure --root .';

describe('onboard creates steering/sdlc-models.json (AC1)', () => {
  it('runs the ensure command from the approved greenfield, enhancement, brownfield, and source-backfill plan', () => {
    for (const rel of [
      'workflows/onboard-project/WORKFLOW.md',
      'workflows/onboard-project/references/greenfield.md',
      'workflows/onboard-project/references/brownfield.md',
    ]) {
      expect({ rel, names: read(rel).includes(ENSURE) }).toEqual({ rel, names: true });
    }
  });

  it('does not run the command for already-initialized onboarding and still recommends upgrade', () => {
    const workflow = read('workflows/onboard-project/WORKFLOW.md');
    expect(workflow).toContain('Already-initialized onboarding skips this command too.');
    expect(workflow).toContain('steering/ + specs/ present → already-initialized → recommend /sdlc-upgrade-project');
  });
});
