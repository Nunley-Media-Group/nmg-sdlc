import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function scaffoldSurface(root = makeTemporaryRoot(), manifestSkills = './skills/') {
  fs.mkdirSync(root, { recursive: true });
  writeJson(root, '.codex-plugin/plugin.json', {
    name: 'nmg-sdlc',
    version: '9.9.9',
    skills: manifestSkills,
  });
  write(root, 'skills/open-pr/SKILL.md', [
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
    const specRoot = path.join(repoRoot, 'specs', 'feature-remove-the-automated-sdlc-loop-and-unattended-mode');
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

  it('accepts a staged release copied from the manifest-declared plugin tree', () => {
    const stagedRoot = makeTemporaryRoot('nmg-sdlc-staged-release-');
    fs.cpSync(path.join(repoRoot, '.codex-plugin'), path.join(stagedRoot, '.codex-plugin'), { recursive: true });
    fs.cpSync(path.join(repoRoot, 'skills'), path.join(stagedRoot, 'skills'), { recursive: true });
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
    'accepts a clean %s fixture with open-pr as the delivery skill',
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
      relativePath: 'skills/commit-push',
      mutate(root) {
        write(root, 'skills/commit-push/SKILL.md', '# Removed skill\n');
      },
    },
    {
      name: 'frontmatter name',
      kind: 'frontmatter-name',
      relativePath: 'skills/legacy-delivery/SKILL.md',
      mutate(root) {
        write(root, 'skills/legacy-delivery/SKILL.md', [
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
      relativePath: 'skills/legacy-delivery/SKILL.md',
      mutate(root) {
        write(root, 'skills/legacy-delivery/SKILL.md', [
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
      relativePath: 'skills/legacy-delivery/SKILL.md',
      mutate(root) {
        write(root, 'skills/legacy-delivery/SKILL.md', [
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
      relativePath: 'skills/legacy-delivery/SKILL.md',
      mutate(root) {
        write(root, 'skills/legacy-delivery/SKILL.md', [
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
      relativePath: 'skills/legacy-delivery/SKILL.md',
      mutate(root) {
        write(root, 'skills/legacy-delivery/SKILL.md', [
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
          items: [{ destination: 'skills/commit-push/SKILL.md:1' }],
        });
      },
    },
    {
      name: 'removed automation skill directory',
      kind: 'removed-path',
      relativePath: 'skills/run-loop',
      mutate(root) {
        write(root, 'skills/run-loop/SKILL.md', '# Removed skill\n');
      },
    },
    {
      name: 'removed automation command',
      kind: 'loader-workflow-token',
      relativePath: 'skills/manual-helper/SKILL.md',
      mutate(root) {
        write(root, 'skills/manual-helper/SKILL.md', [
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
    write(historicalRoot, 'skills/commit-push/SKILL.md', [
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
    write(root, 'skills/upgrade-project/references/v2-cleanup.md', [
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
        write(root, '.codex-plugin/plugin.json', '{not-json}\n');
        return root;
      },
      expected: 'plugin manifest is malformed JSON',
    },
    {
      name: 'absolute skills path',
      prepare() {
        return scaffoldSurface(makeTemporaryRoot(), path.resolve(os.tmpdir(), 'skills'));
      },
      expected: 'must start with "./"',
    },
    {
      name: 'traversing skills path',
      prepare() {
        return scaffoldSurface(makeTemporaryRoot(), './skills/../outside');
      },
      expected: 'must not traverse outside the plugin root',
    },
    {
      name: 'missing open-pr',
      prepare() {
        const root = scaffoldSurface();
        fs.rmSync(path.join(root, 'skills', 'open-pr'), { recursive: true, force: true });
        return root;
      },
      expected: 'open-pr skill definition is not readable',
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
