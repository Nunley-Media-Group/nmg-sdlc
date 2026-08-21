import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('bounded spec context contract', () => {
  test('shared spec-context reference uses specs/{N}-{slug} and Related Spec neighbors', () => {
    const contract = read('references/spec-context.md');

    expect(contract).toContain('Project-root `specs/` is the canonical BDD archive');
    expect(contract).toContain('specs/{N}-{slug}/');
    expect(contract).toContain('**Related Spec**');
    expect(contract).toContain('Legacy `.codex/specs/`');
    expect(contract).toContain('There are no ownership manifests');
  });

  test('project-agents reference keeps managed markers', () => {
    const contract = read('references/project-agents.md');

    expect(contract).toContain('<!-- nmg-sdlc-managed: spec-context -->');
    expect(contract).toContain('<!-- /nmg-sdlc-managed -->');
    expect(contract).toContain('specs/{N}-{slug}');
  });
});
