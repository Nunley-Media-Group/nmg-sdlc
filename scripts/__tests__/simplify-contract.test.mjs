import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function walk(dir, predicate, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, predicate, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
    if (predicate(rel)) acc.push(rel);
  }
  return acc;
}

function amendmentSlice(relPath, marker) {
  const source = read(relPath);
  const index = source.indexOf(marker);
  if (index === -1) {
    throw new Error(`${relPath} is missing marker: ${marker}`);
  }
  return source.slice(index);
}

describe('bundled simplify contract', () => {
  test('live surfaces use bundled /skill:simplify wording', () => {
    const skillFiles = walk(path.join(REPO_ROOT, 'skills'), (rel) => (
      /^skills\/[^/]+\/SKILL\.md$/.test(rel)
      || /^skills\/[^/]+\/references\/.+\.md$/.test(rel)
    ));

    const surfaces = new Map([
      ['README.md', read('README.md')],
    ]);

    for (const rel of skillFiles) {
      surfaces.set(rel, read(rel));
    }

    const banned = [
      /\$simplify\b/,
      /optional external/i,
      /simplify skill not available/i,
      /Probe for the simplify skill/i,
      /marketplace skill/i,
      /legacy runtime simplify/i,
      /(^|[^a-z0-9])\$?-sdlc:simplify/i,
    ];

    const violations = [];
    for (const [rel, source] of surfaces) {
      for (const pattern of banned) {
        if (pattern.test(source)) {
          violations.push(`${rel}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);

    const requiredMentions = [
      'skills/simplify/SKILL.md',
      'skills/write-code/SKILL.md',
    ];

    for (const rel of requiredMentions) {
      expect(surfaces.get(rel)).toMatch(/\/skill:simplify|simplify/);
    }
  });
});
