import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('contribution guide contract', () => {
  test('shared reference uses v3 invocations and specs/{N}-{slug}', () => {
    const contract = read('references/contribution-guide.md');

    expect(contract).toContain('steering/product.md');
    expect(contract).toContain('steering/tech.md');
    expect(contract).toContain('steering/structure.md');
    expect(contract).toContain('specs/{N}-{slug}');
    expect(contract).toContain('/sdlc-draft-issue');
    expect(contract).toContain('/sdlc-write-spec #N');
    expect(contract).toContain('/sdlc-execute');
    expect(contract).toContain('SDLC-Exception: docs-only');
    expect(contract).not.toContain('epics cannot be started');
    expect(contract).not.toContain('$nmg-sdlc:');
  });
});
