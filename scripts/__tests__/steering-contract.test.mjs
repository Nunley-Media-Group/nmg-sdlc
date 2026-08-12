import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function markdownFiles(relativeDirectory, fileNamePattern) {
  const directory = path.join(repoRoot, relativeDirectory);
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name, fileNamePattern))
    .filter((filePath) => fs.existsSync(filePath));
}

function frontmatterKeys(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  expect(match).not.toBeNull();
  return match[1]
    .split('\n')
    .filter((line) => /^[A-Za-z][A-Za-z0-9_-]*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(':')));
}

describe('repo steering contract (issue #142)', () => {
  test('uses the standalone nmg-sdlc identity and repository', () => {
    const product = read('steering/product.md');
    const tech = read('steering/tech.md');
    const structure = read('steering/structure.md');
    const manifest = JSON.parse(read('.codex-plugin/plugin.json'));

    expect(product).toMatch(/^# nmg-sdlc Product Steering$/m);
    expect(product).toContain('**nmg-sdlc provides a BDD spec-driven development toolkit');
    expect(tech).toMatch(/^# nmg-sdlc Technical Steering$/m);
    expect(structure).toMatch(/^# nmg-sdlc Code Structure Steering$/m);
    expect(manifest.repository).toBe('https://github.com/Nunley-Media-Group/nmg-sdlc');
    expect(structure).toContain(`"repository": "${manifest.repository}"`);
  });

  test('contains no unresolved repo-specific database or UI placeholders', () => {
    const tech = read('steering/tech.md');
    const structure = read('steering/structure.md');

    expect(tech).not.toMatch(/^## Database Standards$/m);
    expect(structure).not.toMatch(/^## Design Tokens \/ UI Standards/m);
    expect(`${tech}\n${structure}`).not.toMatch(/\[(?:convention|example|token)\]/);
  });

  test('documents the active skill and reusable agent prompt contracts', () => {
    const tech = read('steering/tech.md');
    const skillFiles = markdownFiles('skills', 'SKILL.md');
    const agentDirectory = path.join(repoRoot, 'agents');
    const agentFiles = fs.readdirSync(agentDirectory)
      .filter((name) => name.endsWith('.md'))
      .map((name) => path.join(agentDirectory, name));

    expect(tech).toContain('SKILL.md frontmatter declares only `name` and `description`');
    expect(tech).toContain('reusable prompt contracts included in built-in Codex subagent prompts');
    expect(tech).not.toContain('allowedTools');
    expect(tech).not.toContain('disallowedTools');
    expect(tech).not.toContain('maxTurns');
    expect(tech).not.toContain('permissionMode');

    for (const filePath of skillFiles) {
      expect(frontmatterKeys(fs.readFileSync(filePath, 'utf8'))).toEqual(['name', 'description']);
    }
    for (const filePath of agentFiles) {
      expect(frontmatterKeys(fs.readFileSync(filePath, 'utf8'))).toEqual(['name', 'description']);
    }
  });

  test('preserves intentional external marketplace guidance', () => {
    const readme = read('README.md');

    expect(readme).toContain('[nmg-plugins marketplace](https://github.com/Nunley-Media-Group/nmg-plugins)');
    expect(readme).toContain('codex plugin marketplace add Nunley-Media-Group/nmg-plugins');
  });
});
