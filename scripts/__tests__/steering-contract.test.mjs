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

describe('repo steering contract (v4)', () => {
  test('uses the Claude Code plugin identity and manifest', () => {
    const product = read('steering/snippets/project-product.md');
    const tech = read('steering/snippets/project-tech.md');
    const structure = read('steering/snippets/project-structure.md');
    const packageManifest = JSON.parse(read('package.json'));
    const pluginManifest = JSON.parse(read('.claude-plugin/plugin.json'));
    const hooks = JSON.parse(read('hooks/hooks.json'));

    expect(product).toMatch(/^# nmg-sdlc Product Steering$/m);
    expect(product).toContain('nmg-sdlc is a Claude Code plugin that turns GitHub issues into verified, production-ready implementations through a spec-driven SDLC.');
    expect(tech).toMatch(/^# nmg-sdlc Technical Steering$/m);
    expect(structure).toMatch(/^# nmg-sdlc Code Structure Steering$/m);
    expect(pluginManifest.name).toBe('nmg-sdlc');
    expect(packageManifest.name).toBe('nmg-sdlc');
    expect(packageManifest.omp).toBeUndefined();
    expect(hooks.modules).toEqual(['./register.ts']);
    expect(structure).toContain('.claude-plugin/');
    expect(structure).toContain('hooks/register.ts');
    expect(structure).toContain('src/host-events.mjs');
    expect(structure).not.toContain('src/extension.ts');
    expect(structure).not.toContain('.codex-plugin/');
  });

  test('declares every version mirror delivery synchronizes', () => {
    const tech = read('steering/snippets/project-tech.md');
    const versioning = tech.slice(tech.indexOf('## Versioning'), tech.indexOf('### Version Bump Classification'));

    expect(versioning).toContain('| `VERSION` | file text |');
    expect(versioning).toContain('| `package.json` | `version` |');
    expect(versioning).toContain('| `.claude-plugin/plugin.json` | `version` |');
  });

  test('describes Claude Code tools instead of Oh My Pi surfaces', () => {
    const steering = ['project-product.md', 'project-tech.md', 'project-structure.md']
      .map((name) => read(`steering/snippets/${name}`))
      .join('\n');

    for (const stale of ['xd://propose', 'local://', 'skill://skill-creator', 'omp --print', '--kind omp', '.omp/sdlc', 'OMP task agent', 'listOmpExtensionRoots', 'omp.extensions']) {
      expect(steering).not.toContain(stale);
    }
    expect(steering).not.toMatch(/`ask`/);
    expect(steering).toContain('AskUserQuestion');
    expect(steering).toContain('ExitPlanMode');
    expect(steering).toContain('invoke the `skill-creator` skill with the `Skill` tool');
    expect(steering).toContain('claude -p --plugin-dir <checkout>');
    expect(steering).toContain('The hooks module starts each stage as a background `nmg-sdlc:execute-<entry>` subagent');
    expect(steering).toContain('NMG_SDLC_WORKER_PERMISSION_MODE');
    expect(steering).toContain('NMG_SDLC_AUTOPILOT');
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
    expect(tech).toContain('installable Claude Code plugin subagents');
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
      expect(keys.every((key) => ['name', 'description', 'tools'].includes(key))).toBe(true);
    }
  });

  test('agent files declare no model or effort, and steering names the stage settings file', () => {
    const tech = read('steering/snippets/project-tech.md');
    for (const name of ['starter', 'spec-implementer', 'architecture-reviewer', 'deliverer']) {
      const source = read(`agents/${name}.md`);
      expect(frontmatterKeys(source)).toEqual(['name', 'description']);
      expect(source).not.toMatch(/^model:/m);
      expect(source).not.toMatch(/^effort:/m);
      expect(source).toContain('`/sdlc-execute` registers this body as the system prompt of its stage subagent, and the stage\'s model and effort come from `steering/sdlc-models.json`.');
    }
    const structure = read('steering/snippets/project-structure.md');
    expect(tech).toContain('`steering/sdlc-models.json`');
    expect(tech).not.toMatch(/Optional: `model`/);
    expect(structure).not.toMatch(/Optional: `model`/);
    expect(tech).not.toMatch(/^\| `agents\/[a-z-]+\.md` \| `[a-z-]+` \| `(haiku|sonnet|opus)` \|/m);
    expect(tech).not.toContain('SDLC_MODELS');
  });

});
