import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUTOMATED_COMMANDS, renderAutomatedCommandMarkdown } from '../../src/sdlc-commands.mjs';
import { runClaudePluginValidate } from '../verify-plugin-surface.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validator = path.join(repoRoot, 'scripts', 'verify-plugin-surface.mjs');
const temporaryRoots = [];

function makeTemporaryRoot(prefix = 'nmg-sdlc-plugin-surface-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function write(relativeRoot, relativePath, source) {
  const target = path.join(relativeRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  return target;
}

function writeJson(relativeRoot, relativePath, value) {
  return write(relativeRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function commandFrontmatter(name, skill, description) {
  return renderAutomatedCommandMarkdown(name, skill, description).match(/^---\n[\s\S]*?\n---\n/)[0];
}

function scaffoldSurface(root = makeTemporaryRoot()) {
  fs.mkdirSync(root, { recursive: true });
  writeJson(root, '.claude-plugin/plugin.json', { name: 'nmg-sdlc', version: '9.9.9' });
  writeJson(root, 'package.json', { name: 'nmg-sdlc', version: '9.9.9' });
  write(root, 'VERSION', '9.9.9\n');
  writeJson(root, 'hooks/hooks.json', { modules: ['./register.ts'] });
  write(root, 'hooks/register.ts', 'export default function register() {}\n');
  write(root, 'src/host-events.mjs', 'export const INTERACTIVE_COMMANDS = [];\n');
  for (const [name, skill, description] of AUTOMATED_COMMANDS) {
    write(root, `commands/${name}.md`, `${commandFrontmatter(name, skill, description)}\nRun node "\${CLAUDE_PLUGIN_ROOT}/scripts/${skill}.mjs".\n`);
  }
  write(root, 'agents/starter.md', [
    '---',
    'name: starter',
    'description: Start a linked branch.',
    'model: haiku',
    '---',
    '',
    '# Starter',
    '',
  ].join('\n'));
  write(root, 'workflows/open-pr/WORKFLOW.md', [
    '---',
    'name: open-pr',
    'description: "Deliver verified work through one pull-request workflow."',
    '---',
    '',
    '# Open PR',
    '',
  ].join('\n'));
  writeJson(root, 'scripts/skill-inventory.baseline.json', {
    generated_at: 'fixture',
    generator: 'fixture',
    items: [],
  });
  return root;
}

function runValidator(root, label = 'test-surface') {
  return spawnSync(process.execPath, [
    validator,
    '--root', root,
    '--label', label,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function combinedOutput(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('plugin surface verification (issues #148 and #151)', () => {
  it('maps exactly ten valid Gherkin scenarios one-to-one to AC1 through AC10', () => {
    const specRoot = path.join(repoRoot, 'specs', '151-remove-the-automated-sdlc-loop-and-unattended-mode');
    const requirements = fs.readFileSync(path.join(specRoot, 'requirements.md'), 'utf8');
    const gherkin = fs.readFileSync(path.join(specRoot, 'feature.gherkin'), 'utf8');
    const acceptanceCriteria = [...requirements.matchAll(/^### (AC\d+): (.+)$/gm)]
      .map((match) => ({ id: match[1], title: match[2] }));
    const scenarios = [...gherkin.matchAll(/^  Scenario: (.+)\n((?:    .+\n?)+)/gm)]
      .map((match) => ({ title: match[1], steps: match[2] }));
    const expectedScenarioTitles = [
      'Fresh install has no automated loop surface',
      'Skills use interactive contracts only',
      'Automation eligibility is absent from issue workflows',
      'Active product surfaces describe only the manual pipeline',
      'Managed repository assets remain available',
      'Upgrade removes only known obsolete runner artifacts',
      'Existing GitHub labels and issue history are not mutated',
      'Historical records remain truthful and intact',
      'Conflicting backlog is reconciled',
      'Manual pipeline and migration are verified',
    ];

    expect(acceptanceCriteria.map(({ id }) => id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `AC${index + 1}`),
    );
    expect(scenarios.map(({ title }) => title)).toEqual(expectedScenarioTitles);
    expect(scenarios).toHaveLength(acceptanceCriteria.length);
    for (const scenario of scenarios) {
      expect(scenario.steps).toMatch(/^    Given /m);
      expect(scenario.steps).toMatch(/^    When /m);
      expect(scenario.steps).toMatch(/^    Then /m);
    }
  });

  it('gates marketplace dispatch on release-source validation', () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'sync-marketplace-pointer.yml'),
      'utf8',
    );
    const validation = 'node scripts/verify-plugin-surface.mjs --root . --label release-source';

    expect(workflow).toContain(validation);
    expect(workflow.indexOf(validation)).toBeLessThan(workflow.indexOf('- name: Read plugin metadata'));
    expect(workflow.indexOf(validation)).toBeLessThan(workflow.indexOf('- name: Dispatch nmg-plugins update'));
  });

  it('accepts the clean repository surface', () => {
    const result = runValidator(repoRoot, 'repository');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Plugin surface validation passed: repository (${repoRoot})`);
  });

  it('dispatches the marketplace update with the version from .claude-plugin/plugin.json', () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'sync-marketplace-pointer.yml'),
      'utf8',
    );

    expect(workflow).toContain('event_type: \'nmg-sdlc-main-updated\'');
    expect(workflow).toContain('repos/Nunley-Media-Group/nmg-plugins/dispatches');
    expect(workflow).toContain('require("./.claude-plugin/plugin.json").version');
    expect(workflow).not.toContain('require("./package.json").version');
  });

  it('keeps the plugin manifest, package.json, and VERSION on one version', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const version = fs.readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();

    expect(manifest.name).toBe('nmg-sdlc');
    expect(pkg.name).toBe('nmg-sdlc');
    expect(manifest.version).toBe(version);
    expect(pkg.version).toBe(version);
    expect(pkg).not.toHaveProperty('omp');
    expect(pkg.keywords).not.toEqual(expect.arrayContaining(['omp-plugin', 'pi-extension']));
  });

  it('accepts a staged release copied from the manifest-declared plugin tree', () => {
    const stagedRoot = makeTemporaryRoot('nmg-sdlc-staged-release-');
    for (const entry of ['.claude-plugin', 'hooks', 'src', 'commands', 'agents', 'workflows', 'package.json', 'VERSION']) {
      fs.cpSync(path.join(repoRoot, entry), path.join(stagedRoot, entry), { recursive: true });
    }
    writeJson(stagedRoot, 'scripts/skill-inventory.baseline.json', {
      generated_at: 'staged-release',
      generator: 'fixture',
      items: [],
    });

    const result = runValidator(stagedRoot, 'staged-release');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`staged-release (${stagedRoot})`);
  });

  it.each(['fresh-install', 'upgraded-active-root'])(
    'accepts a clean %s fixture with open-pr as the delivery workflow',
    (label) => {
      const root = scaffoldSurface();
      const result = runValidator(root, label);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`Plugin surface validation passed: ${label} (${root})`);
    },
  );

  it.each([
    {
      name: 'stale directory',
      kind: 'skill-directory',
      relativePath: 'workflows/commit-push',
      mutate(root) {
        write(root, 'workflows/commit-push/WORKFLOW.md', '# Removed workflow\n');
      },
    },
    {
      name: 'frontmatter name',
      kind: 'frontmatter-name',
      relativePath: 'workflows/legacy-delivery/WORKFLOW.md',
      mutate(root) {
        write(root, 'workflows/legacy-delivery/WORKFLOW.md', [
          '---',
          'name: commit-push',
          'description: "Legacy delivery."',
          '---',
          '',
        ].join('\n'));
      },
    },
    {
      name: 'frontmatter description token',
      kind: 'frontmatter-token',
      relativePath: 'workflows/legacy-delivery/WORKFLOW.md',
      mutate(root) {
        write(root, 'workflows/legacy-delivery/WORKFLOW.md', [
          '---',
          'name: legacy-delivery',
          'description: "Use for commit-push delivery requests."',
          '---',
          '',
        ].join('\n'));
      },
    },
    {
      name: 'alias or redirect metadata',
      kind: 'alias-or-redirect',
      relativePath: 'workflows/legacy-delivery/WORKFLOW.md',
      mutate(root) {
        write(root, 'workflows/legacy-delivery/WORKFLOW.md', [
          '---',
          'name: legacy-delivery',
          'description: "Legacy delivery."',
          'aliases:',
          '  - commit-push',
          '---',
          '',
        ].join('\n'));
      },
    },
    {
      name: 'deprecation token',
      kind: 'deprecation-token',
      relativePath: 'workflows/legacy-delivery/WORKFLOW.md',
      mutate(root) {
        write(root, 'workflows/legacy-delivery/WORKFLOW.md', [
          '---',
          'name: legacy-delivery',
          'description: "Legacy delivery."',
          '---',
          '',
          'This deprecated compatibility stub previously handled commit-push requests.',
          '',
        ].join('\n'));
      },
    },
    {
      name: 'loader-facing token',
      kind: 'loader-workflow-token',
      relativePath: 'workflows/legacy-delivery/WORKFLOW.md',
      mutate(root) {
        write(root, 'workflows/legacy-delivery/WORKFLOW.md', [
          '---',
          'name: legacy-delivery',
          'description: "Legacy delivery."',
          '---',
          '',
          'Run $nmg-sdlc:commit-push to deliver.',
          '',
        ].join('\n'));
      },
    },
    {
      name: 'inventory entry',
      kind: 'inventory-entry',
      relativePath: 'scripts/skill-inventory.baseline.json',
      mutate(root) {
        writeJson(root, 'scripts/skill-inventory.baseline.json', {
          items: [{ destination: 'workflows/commit-push/WORKFLOW.md:1' }],
        });
      },
    },
    {
      name: 'removed automation workflow directory',
      kind: 'skill-directory',
      relativePath: 'workflows/run-loop',
      mutate(root) {
        write(root, 'workflows/run-loop/WORKFLOW.md', '# Removed workflow\n');
      },
    },
    {
      name: 'removed automation command',
      kind: 'loader-workflow-token',
      relativePath: 'workflows/manual-helper/WORKFLOW.md',
      mutate(root) {
        write(root, 'workflows/manual-helper/WORKFLOW.md', [
          '---',
          'name: manual-helper',
          'description: "Manual helper."',
          '---',
          '',
          'Run $nmg-sdlc:init-config to continue.',
          '',
        ].join('\n'));
      },
    },
    {
      name: 'leftover skills directory',
      kind: 'leftover-skills-directory',
      relativePath: 'skills',
      mutate(root) {
        write(root, 'skills/manual-helper/SKILL.md', '# Leftover skill\n');
      },
    },
    {
      name: 'sentinel contract',
      kind: 'automation-contract-token',
      relativePath: 'references/gates.md',
      mutate(root) {
        write(root, 'references/gates.md', 'When unattended mode is active, skip the prompt.\n');
      },
    },
    {
      name: 'automation eligibility metadata',
      kind: 'automation-contract-token',
      relativePath: '.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml',
      mutate(root) {
        write(root, '.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml', 'name: automatable\n');
      },
    },
    {
      name: 'runner runtime contract outside migration docs',
      kind: 'runtime-contract-token',
      relativePath: 'agents/manual.md',
      mutate(root) {
        write(root, 'agents/manual.md', 'Read .codex/sdlc-state.json before continuing.\n');
      },
    },
    {
      name: 'broken active-file symlink',
      kind: 'unsupported-symlink',
      relativePath: 'README.md',
      mutate(root) {
        fs.symlinkSync('missing-readme.md', path.join(root, 'README.md'));
      },
    },
    {
      name: 'broken removed-path symlink',
      kind: 'removed-path',
      relativePath: 'scripts/sdlc-runner.mjs',
      mutate(root) {
        fs.symlinkSync('missing-runner.mjs', path.join(root, 'scripts/sdlc-runner.mjs'));
      },
    },
    {
      name: 'removed OMP extension factory',
      kind: 'removed-path',
      relativePath: 'src/extension.ts',
      mutate(root) {
        write(root, 'src/extension.ts', 'export default function nmgSdlc() {}\n');
      },
    },
    {
      name: 'hand-edited command frontmatter',
      kind: 'command-frontmatter',
      relativePath: 'commands/sdlc-status.md',
      mutate(root) {
        write(root, 'commands/sdlc-status.md', '---\ndescription: "Status"\n---\n\nBody.\n');
      },
    },
    {
      name: 'unmaterialized plugin root in a command',
      kind: 'command-plugin-root',
      relativePath: 'commands/sdlc-status.md',
      mutate(root) {
        const [name, skill, description] = AUTOMATED_COMMANDS.find(([command]) => command === 'sdlc-status');
        write(root, 'commands/sdlc-status.md', `${commandFrontmatter(name, skill, description)}\nRun node <plugin-root>/scripts/sdlc-status.mjs.\n`);
      },
    },
    {
      name: 'unexpected command file',
      kind: 'unexpected-command',
      relativePath: 'commands/sdlc-draft-issue.md',
      mutate(root) {
        write(root, 'commands/sdlc-draft-issue.md', '---\ndescription: "Draft"\n---\n');
      },
    },
    {
      name: 'subagent name not matching its file',
      kind: 'agent-frontmatter',
      relativePath: 'agents/starter.md',
      mutate(root) {
        write(root, 'agents/starter.md', '---\nname: begin\ndescription: Start.\n---\n');
      },
    },
    {
      name: 'subagent with an OMP model role',
      kind: 'agent-model',
      relativePath: 'agents/starter.md',
      mutate(root) {
        write(root, 'agents/starter.md', '---\nname: starter\ndescription: Start.\nmodel: "@fast"\n---\n');
      },
    },
    {
      name: 'workflow directory without an entrypoint',
      kind: 'workflow-entrypoint',
      relativePath: 'workflows/status/WORKFLOW.md',
      mutate(root) {
        write(root, 'workflows/status/references/notes.md', 'Notes.\n');
      },
    },
    {
      name: 'workflow entrypoint name mismatch',
      kind: 'workflow-entrypoint',
      relativePath: 'workflows/status/WORKFLOW.md',
      mutate(root) {
        write(root, 'workflows/status/WORKFLOW.md', '---\nname: state\ndescription: "Status."\n---\n');
      },
    },
    {
      name: 'marketplace without this plugin at the root',
      kind: 'marketplace-entry',
      relativePath: '.claude-plugin/marketplace.json',
      mutate(root) {
        writeJson(root, '.claude-plugin/marketplace.json', { name: 'nmg', owner: { name: 'NMG' }, plugins: [{ name: 'nmg-sdlc', source: './plugins/nmg-sdlc' }] });
      },
    },
  ])('reports $name with the selected root, path, and metadata kind', ({ kind, relativePath, mutate }) => {
    const root = scaffoldSurface();
    mutate(root);

    const result = runValidator(root, 'stale-active');
    const output = combinedOutput(result);

    expect(result.status).toBe(1);
    expect(output).toContain(`Plugin surface validation failed: stale-active (${root})`);
    expect(output).toContain(`- ${kind}: ${relativePath}`);
  });

  it('does not scan an inactive historical sibling when a clean current root is selected', () => {
    const profileRoot = makeTemporaryRoot('nmg-sdlc-disposable-profile-');
    const currentRoot = scaffoldSurface(path.join(profileRoot, 'cache', 'nmg-sdlc', '9.9.9'));
    const historicalRoot = scaffoldSurface(path.join(profileRoot, 'cache', 'nmg-sdlc', '1.64.0'));
    write(historicalRoot, 'workflows/commit-push/WORKFLOW.md', [
      '---',
      'name: commit-push',
      'description: "Historical fixture."',
      '---',
      '',
    ].join('\n'));

    const result = runValidator(currentRoot, 'selected-current');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`selected-current (${currentRoot})`);
  });

  it('allows exact obsolete artifact names only in upgrade migration documentation', () => {
    const root = scaffoldSurface();
    write(root, 'workflows/upgrade-project/WORKFLOW.md', '---\nname: upgrade-project\ndescription: "Upgrade."\n---\n');
    write(root, 'workflows/upgrade-project/references/v2-cleanup.md', [
      'Propose deleting sdlc-config.json, .codex/unattended-mode, and .codex/sdlc-state.json.',
      '',
    ].join('\n'));

    const result = runValidator(root, 'upgrade-migration');

    expect(result.status).toBe(0);
  });

  it('does not treat historical specs, released changelog entries, or negative fixtures as active support', () => {
    const root = scaffoldSurface();
    write(root, 'specs/feature-historical/requirements.md', 'Run $nmg-sdlc:run-loop.\n');
    write(root, 'CHANGELOG.md', '## [1.0.0]\n\nAdded unattended mode.\n');
    write(root, 'scripts/__fixtures__/audit-canary/bad/SKILL.md', 'name: run-loop\n');

    const result = runValidator(root, 'historical-boundary');

    expect(result.status).toBe(0);
  });

  it('scans retrospective guidance while treating its evidence paths as historical', () => {
    const root = scaffoldSurface();
    write(root, 'steering/retrospective.md', [
      '| Learning | Recommendation | Evidence (defect specs) |',
      '|---|---|---|',
      '| Current gap | Check the safe branch \\| in unattended work. | specs/bug-old/ |',
      '| Malformed row | unattended work |',
      '',
    ].join('\n'));

    const stale = runValidator(root, 'retrospective-guidance');
    expect(stale.status).toBe(1);
    expect(combinedOutput(stale)).toContain('- automation-contract-token: steering/retrospective.md');

    write(root, 'steering/retrospective.md', [
      '| Learning | Recommendation | Evidence (defect specs) |',
      '|---|---|---|',
      '| Verify explicit decisions | Wait for the user before mutation. | specs/bug-unattended-run-loop/, .codex/unattended-mode |',
      '',
    ].join('\n'));

    const historical = runValidator(root, 'retrospective-evidence');
    expect(historical.status).toBe(0);
  });

  it('rejects a leftover OMP manifest block in package.json as stale content', () => {
    const root = scaffoldSurface();
    writeJson(root, 'package.json', {
      name: 'nmg-sdlc',
      version: '9.9.9',
      omp: {
        extensions: ['./src/extension.ts'],
        skills: ['./workflows'],
      },
    });

    const result = runValidator(root, 'declared-omp');
    const output = combinedOutput(result);

    expect(result.status).toBe(1);
    expect(output).toContain('Plugin surface validation failed: declared-omp');
    expect(output).toContain('- omp-manifest-declared: package.json');
  });

  it('accepts a surface with a valid optional marketplace manifest', () => {
    const root = scaffoldSurface();
    writeJson(root, '.claude-plugin/marketplace.json', {
      name: 'nmg-sdlc',
      owner: { name: 'Nunley Media Group' },
      plugins: [{ name: 'nmg-sdlc', source: './' }],
    });

    expect(runValidator(root, 'with-marketplace').status).toBe(0);
  });

  it('accepts a staged plugin tree without package.json', () => {
    const root = scaffoldSurface();
    fs.rmSync(path.join(root, 'package.json'));

    expect(runValidator(root, 'no-package').status).toBe(0);
  });

  it('skips claude plugin validate cleanly when the claude CLI is absent', () => {
    const root = scaffoldSurface();
    const result = spawnSync(process.execPath, [validator, '--root', root, '--label', 'no-claude', '--claude-validate'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, PATH: makeTemporaryRoot('nmg-sdlc-empty-path-') },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('claude plugin validate skipped: claude CLI not on PATH');
    expect(result.stdout).toContain('Plugin surface validation passed: no-claude');
  });

  it.each([
    [{ error: Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }) }, 'skipped'],
    [{ status: 0, stdout: '✔ Validation passed\n', stderr: '' }, 'pass'],
    [{ status: 1, stdout: '', stderr: '✘ Validation failed\n' }, 'fail'],
  ])('maps claude plugin validate result %j to %s', (spawned, status) => {
    const calls = [];
    const outcome = runClaudePluginValidate('/plugin', { spawn: (...args) => { calls.push(args); return spawned; } });

    expect(calls[0].slice(0, 2)).toEqual(['claude', ['plugin', 'validate', '/plugin']]);
    expect(outcome.status).toBe(status);
  });

  it.each([
    {
      name: 'missing manifest',
      prepare() {
        return makeTemporaryRoot();
      },
      expected: 'plugin manifest is not readable',
    },
    {
      name: 'malformed manifest',
      prepare() {
        const root = makeTemporaryRoot();
        write(root, '.claude-plugin/plugin.json', '{not-json}\n');
        return root;
      },
      expected: 'plugin manifest is malformed JSON',
    },
    {
      name: 'wrong plugin name',
      prepare() {
        const root = scaffoldSurface();
        writeJson(root, '.claude-plugin/plugin.json', { name: 'other', version: '9.9.9' });
        return root;
      },
      expected: 'plugin manifest name "other" must equal "nmg-sdlc"',
    },
    {
      name: 'manifest version drift from VERSION',
      prepare() {
        const root = scaffoldSurface();
        writeJson(root, '.claude-plugin/plugin.json', { name: 'nmg-sdlc', version: '9.9.8' });
        return root;
      },
      expected: 'plugin version "9.9.8" must equal VERSION "9.9.9"',
    },
    {
      name: 'package.json version drift from VERSION',
      prepare() {
        const root = scaffoldSurface();
        writeJson(root, 'package.json', { name: 'nmg-sdlc', version: '9.9.8' });
        return root;
      },
      expected: 'package.json version "9.9.8" must equal VERSION "9.9.9"',
    },
    {
      name: 'hooks manifest without the register module',
      prepare() {
        const root = scaffoldSurface();
        writeJson(root, 'hooks/hooks.json', { modules: ['./other.ts'] });
        return root;
      },
      expected: 'hooks/hooks.json modules must name "./register.ts"',
    },
    {
      name: 'missing hooks module',
      prepare() {
        const root = scaffoldSurface();
        fs.rmSync(path.join(root, 'hooks', 'register.ts'));
        return root;
      },
      expected: 'hooks module is not readable',
    },
    {
      name: 'missing host events module',
      prepare() {
        const root = scaffoldSurface();
        fs.rmSync(path.join(root, 'src', 'host-events.mjs'));
        return root;
      },
      expected: 'host events module is not readable',
    },
    {
      name: 'missing automated command',
      prepare() {
        const root = scaffoldSurface();
        fs.rmSync(path.join(root, 'commands', 'sdlc-open-pr.md'));
        return root;
      },
      expected: 'automated command file is missing: commands/sdlc-open-pr.md',
    },
    {
      name: 'missing agents',
      prepare() {
        const root = scaffoldSurface();
        fs.rmSync(path.join(root, 'agents'), { recursive: true });
        return root;
      },
      expected: 'agents directory is not readable',
    },
    {
      name: 'missing open-pr',
      prepare() {
        const root = scaffoldSurface();
        fs.rmSync(path.join(root, 'workflows', 'open-pr'), { recursive: true, force: true });
        return root;
      },
      expected: 'open-pr workflow is not readable',
    },
    {
      name: 'unreadable root',
      prepare() {
        return path.join(makeTemporaryRoot(), 'missing-root');
      },
      expected: 'plugin root is not readable',
    },
  ])('rejects an invalid surface: $name', ({ prepare, expected }) => {
    const root = prepare();
    const result = runValidator(root, 'invalid-surface');
    const output = combinedOutput(result);

    expect(result.status).toBe(2);
    expect(output).toContain(`Plugin surface validation error: invalid-surface (${path.resolve(root)})`);
    expect(output).toContain(expected);
  });

  it('rejects missing and unexpected CLI arguments without reading a plugin root', () => {
    const missingLabel = spawnSync(process.execPath, [validator, '--root', repoRoot], { encoding: 'utf8' });
    const unexpected = spawnSync(process.execPath, [validator, '--root', repoRoot, '--label', 'repo', 'extra'], {
      encoding: 'utf8',
    });

    expect(missingLabel.status).toBe(2);
    expect(combinedOutput(missingLabel)).toContain('--label <surface> is required');
    expect(unexpected.status).toBe(2);
    expect(combinedOutput(unexpected)).toContain('invalid arguments');
  });
});
