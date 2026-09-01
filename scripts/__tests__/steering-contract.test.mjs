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

describe('repo steering contract (v3)', () => {
  test('uses the OMP extension identity and package manifest', () => {
    const product = read('steering/snippets/project-product.md');
    const tech = read('steering/snippets/project-tech.md');
    const structure = read('steering/snippets/project-structure.md');
    const manifest = JSON.parse(read('package.json'));

    expect(product).toMatch(/^# nmg-sdlc Product Steering$/m);
    expect(product).toContain('Oh My Pi extension and a Herdr workflow');
    expect(tech).toMatch(/^# nmg-sdlc Technical Steering$/m);
    expect(structure).toMatch(/^# nmg-sdlc Code Structure Steering$/m);
    expect(manifest.name).toBe('nmg-sdlc');
    expect(manifest.omp.extensions).toEqual(['./src/extension.ts']);
    expect(structure).toContain('package.json');
    expect(structure).toContain('src/extension.ts');
    expect(structure).not.toContain('.codex-plugin/');
    expect(structure).not.toContain('.claude-plugin/');
  });

  test('contains no unresolved repo-specific database or UI placeholders', () => {
    const tech = read('steering/snippets/project-tech.md');
    const structure = read('steering/snippets/project-structure.md');

    expect(tech).not.toMatch(/^## Database Standards$/m);
    expect(structure).not.toMatch(/^## Design Tokens \/ UI Standards/m);
    expect(`${tech}\n${structure}`).not.toMatch(/\[(?:convention|example|token)\]/);
  });

  test('documents private workflows and installable agents', () => {
    const tech = read('steering/snippets/project-tech.md');
    const skillFiles = markdownFiles('workflows', 'WORKFLOW.md');
    const agentDirectory = path.join(repoRoot, 'agents');
    const agentFiles = fs.readdirSync(agentDirectory)
      .filter((name) => name.endsWith('.md'))
      .map((name) => path.join(agentDirectory, name));

    expect(tech).toContain('WORKFLOW.md frontmatter declares only `name` and `description`');
    expect(tech).toContain('installable OMP task agents');
    expect(tech).not.toContain('allowedTools');
    expect(tech).not.toContain('disallowedTools');
    expect(tech).not.toContain('maxTurns');
    expect(tech).not.toContain('permissionMode');

    for (const filePath of skillFiles) {
      expect(frontmatterKeys(fs.readFileSync(filePath, 'utf8'))).toEqual(['name', 'description']);
    }
    for (const filePath of agentFiles) {
      const keys = frontmatterKeys(fs.readFileSync(filePath, 'utf8'));
      expect(keys).toEqual(expect.arrayContaining(['name', 'description']));
      expect(keys.every((key) => ['name', 'description', 'model', 'autoloadSkills', 'tools'].includes(key))).toBe(true);
    }

    expect(read('agents/architecture-reviewer.md')).toMatch(/^model: "@slow"$/m);
  });

  test('documents OMP plugin install rather than Codex marketplace add', () => {
    const readme = read('README.md');

    expect(readme).toContain('omp plugin install');
    expect(readme).not.toContain('codex plugin marketplace add');
  });

  test('requires project upgrade after every install or update', () => {
    const readme = read('README.md');

    expect(readme).toContain('After every install or update, run /sdlc-upgrade-project in each project.');
    expect(readme).toContain('Review and apply all relevant approved migrations before running any other SDLC workflow.');
  });
});
