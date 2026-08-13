import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW_RELATIVE_PATH = '.github/workflows/nmg-sdlc-contribution-gate.yml';
const MANAGED_MARKER = '# nmg-sdlc-managed: contribution-gate';
const VERSION_PATTERN = /^# nmg-sdlc-managed-version:\s*(\d+)\s*$/m;
const CURRENT_VERSION = 2;
const AsyncFunction = Object.getPrototypeOf(async function evaluator() {}).constructor;

function readContract() {
  return fs.readFileSync(path.join(repoRoot, 'references/contribution-gate.md'), 'utf8');
}

function workflowTemplate() {
  const match = readContract().match(/```yaml\n([\s\S]*?)\n```/);
  if (!match) throw new Error('workflow template not found');
  return match[1];
}

function evaluatorSource() {
  const template = workflowTemplate();
  const marker = '          script: |\n';
  const start = template.indexOf(marker);
  if (start < 0) throw new Error('embedded github-script evaluator not found');
  return template
    .slice(start + marker.length)
    .split('\n')
    .map((line) => line.startsWith('            ') ? line.slice(12) : line)
    .join('\n');
}

const executeEvaluator = new AsyncFunction('github', 'context', 'core', 'Buffer', evaluatorSource());

function scaffoldProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-contribution-gate-'));
  fs.mkdirSync(path.join(dir, 'steering'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'steering', 'product.md'), '# Product\n');
  fs.writeFileSync(path.join(dir, 'steering', 'tech.md'), '# Tech\n');
  fs.writeFileSync(path.join(dir, 'steering', 'structure.md'), '# Structure\n');
  fs.writeFileSync(path.join(dir, 'CONTRIBUTING.md'), '# Contributing\n');
  return dir;
}

function workflowPath(projectDir) {
  return path.join(projectDir, WORKFLOW_RELATIVE_PATH);
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function ensureContributionGate(projectDir) {
  const target = workflowPath(projectDir);
  const existing = readIfExists(target);
  const status = { workflow: 'already present', path: WORKFLOW_RELATIVE_PATH, gaps: [] };

  if (existing === null) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, workflowTemplate());
    status.workflow = 'created';
    return status;
  }

  if (!existing.includes(MANAGED_MARKER)) {
    status.workflow = 'skipped (unmanaged file at path)';
    status.gaps.push('unmanaged workflow occupies .github/workflows/nmg-sdlc-contribution-gate.yml');
    return status;
  }

  const version = Number(existing.match(VERSION_PATTERN)?.[1] ?? 0);
  if (version < CURRENT_VERSION) {
    fs.writeFileSync(target, workflowTemplate());
    status.workflow = 'updated';
  } else if (version > CURRENT_VERSION) {
    status.workflow = 'skipped (newer managed version)';
    status.gaps.push('managed workflow version is newer than this plugin');
  }

  return status;
}

function baseRepositoryFiles(overrides = {}) {
  return new Map(Object.entries({
    'CONTRIBUTING.md': '# Contributing\n',
    'steering/product.md': '# Product\n',
    'steering/tech.md': '# Tech\n',
    'steering/structure.md': '# Structure\n',
    ...overrides,
  }));
}

function addSpec(files, directory, { issue = 143, tasks = '', requirements = '' } = {}) {
  files.set(`${directory}/requirements.md`, requirements || `# Requirements\n\n**Issues**: #${issue}\n`);
  files.set(`${directory}/design.md`, '# Design\n');
  files.set(`${directory}/tasks.md`, `# Tasks\n\n**Issues**: #${issue}\n\n${tasks}\n`);
  files.set(`${directory}/feature.gherkin`, `# Issue: #${issue}\nFeature: Gate\n`);
  return files;
}

async function runEvaluator({
  title = 'feat: strengthen gate',
  body = '',
  changedPaths = [],
  repositoryFiles = baseRepositoryFiles(),
  issueLabels = {},
} = {}) {
  const errors = [];
  const infos = [];
  const failed = [];
  const contentCalls = [];
  const labelCalls = [];
  const notFound = () => Object.assign(new Error('not found'), { status: 404 });
  const github = {
    paginate: async () => changedPaths.map((filename) => ({ filename })),
    rest: {
      pulls: { listFiles: async () => ({ data: [] }) },
      repos: {
        getContent: async ({ path: requestedPath }) => {
          contentCalls.push(requestedPath);
          if (!repositoryFiles.has(requestedPath)) throw notFound();
          return {
            data: {
              type: 'file',
              encoding: 'base64',
              content: Buffer.from(repositoryFiles.get(requestedPath), 'utf8').toString('base64'),
            },
          };
        },
      },
      issues: {
        listLabelsOnIssue: async ({ issue_number: issueNumber }) => {
          labelCalls.push(issueNumber);
          return { data: (issueLabels[issueNumber] || []).map((name) => ({ name })) };
        },
      },
    },
  };
  const context = {
    repo: { owner: 'nmg', repo: 'project' },
    payload: { pull_request: { number: 9, title, body, head: { sha: 'abc123' } } },
  };
  const core = {
    error: (message) => errors.push(message),
    info: (message) => infos.push(message),
    setFailed: (message) => failed.push(message),
  };

  await executeEvaluator(github, context, core, Buffer);
  return { errors, infos, failed, contentCalls, labelCalls };
}

function normalScenario({
  issue = 143,
  directory = 'specs/feature-gate',
  sourcePath = 'scripts/check-gate.mjs',
  tasks = `**File(s)**: \`${sourcePath}\``,
  verification = `\`node ${sourcePath}\` — passed (12 tests)`,
  changedPaths,
  repositoryFiles,
} = {}) {
  const files = repositoryFiles || addSpec(baseRepositoryFiles(), directory, { issue, tasks });
  return {
    body: `Closes #${issue}\n\nSpec: ${directory}/\n\nSteering: aligns with steering/tech.md.\n\n## Verification\n${verification}`,
    changedPaths: changedPaths || [sourcePath, `${directory}/requirements.md`],
    repositoryFiles: files,
  };
}

describe('contribution gate lifecycle coverage (issues #125 and #143)', () => {
  test('onboarding-style setup creates version 2 and rerun is idempotent', () => {
    const project = scaffoldProject();

    expect(ensureContributionGate(project)).toEqual({ workflow: 'created', path: WORKFLOW_RELATIVE_PATH, gaps: [] });
    expect(fs.readFileSync(workflowPath(project), 'utf8')).toContain('# nmg-sdlc-managed-version: 2');
    expect(ensureContributionGate(project)).toEqual({ workflow: 'already present', path: WORKFLOW_RELATIVE_PATH, gaps: [] });
  });

  test('upgrade updates version 1 and preserves unrelated workflows', () => {
    const project = scaffoldProject();
    const target = workflowPath(project);
    const unrelated = path.join(project, '.github/workflows/project-ci.yml');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${MANAGED_MARKER}\n# nmg-sdlc-managed-version: 1\nname: old gate\n`);
    fs.writeFileSync(unrelated, 'name: project ci\non: [push]\n');

    expect(ensureContributionGate(project)).toEqual({ workflow: 'updated', path: WORKFLOW_RELATIVE_PATH, gaps: [] });
    expect(fs.readFileSync(target, 'utf8')).toContain('# nmg-sdlc-managed-version: 2');
    expect(fs.readFileSync(unrelated, 'utf8')).toBe('name: project ci\non: [push]\n');
  });

  test('unmanaged file at approved path is not overwritten and records a gap', () => {
    const project = scaffoldProject();
    const target = workflowPath(project);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'name: user owned gate\n');

    const status = ensureContributionGate(project);

    expect(status.workflow).toBe('skipped (unmanaged file at path)');
    expect(status.gaps).toEqual(['unmanaged workflow occupies .github/workflows/nmg-sdlc-contribution-gate.yml']);
    expect(fs.readFileSync(target, 'utf8')).toBe('name: user owned gate\n');
  });
});

describe('exact embedded contribution evaluator (issue #143)', () => {
  test('passes a coherent issue, spec, path, steering, verification, and guide graph', async () => {
    const result = await runEvaluator(normalScenario());

    expect(result.errors).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.infos).toContain('nmg-sdlc contribution evidence is consistent.');
  });

  test('retains actionable missing spec, steering, and guide failures', async () => {
    const missingSpec = await runEvaluator({
      body: 'Closes #143\n\nSteering: steering/tech.md\n\n## Verification\n`node test` — passed',
      changedPaths: ['README.md'],
    });
    expect(missingSpec.errors.join('\n')).toContain('Missing spec evidence');

    const missingSteeringFiles = addSpec(baseRepositoryFiles(), 'specs/feature-gate', {
      issue: 143,
      tasks: '**File(s)**: `scripts/check-gate.mjs`',
    });
    missingSteeringFiles.delete('steering/tech.md');
    const missingSteering = await runEvaluator(normalScenario({ repositoryFiles: missingSteeringFiles }));
    expect(missingSteering.errors.join('\n')).toContain('Missing steering artifacts: expected steering/tech.md');

    const missingGuideFiles = addSpec(baseRepositoryFiles(), 'specs/feature-gate', {
      issue: 143,
      tasks: '**File(s)**: `scripts/check-gate.mjs`',
    });
    missingGuideFiles.delete('CONTRIBUTING.md');
    const missingGuide = await runEvaluator(normalScenario({ repositoryFiles: missingGuideFiles }));
    expect(missingGuide.errors.join('\n')).toContain('Missing `CONTRIBUTING.md`');
  });

  test('rejects a mismatched selected spec and ignores quoted historical issue text', async () => {
    const files = addSpec(baseRepositoryFiles(), 'specs/feature-current', {
      issue: 143,
      tasks: '**File(s)**: `scripts/check-gate.mjs`',
    });
    addSpec(files, 'specs/feature-unrelated', { issue: 999 });
    const result = await runEvaluator({
      body: 'Closes #143\n\n> Historical example: Closes #999\n\nSteering: steering/tech.md\n\n## Verification\n`node scripts/check-gate.mjs` — passed',
      changedPaths: [
        'scripts/check-gate.mjs',
        'specs/feature-current/requirements.md',
        'specs/feature-unrelated/requirements.md',
      ],
      repositoryFiles: files,
    });

    expect(result.errors.join('\n')).toContain('Issue/spec mismatch: PR issues #143 do not match specs/feature-unrelated.');
    expect(result.errors.join('\n')).toContain('See CONTRIBUTING.md');
  });

  test('deduplicates and caps selected spec reads at five directories', async () => {
    const files = baseRepositoryFiles();
    const changedPaths = ['scripts/check-gate.mjs'];
    for (let issue = 1; issue <= 7; issue += 1) {
      const directory = `specs/feature-gate-${issue}`;
      addSpec(files, directory, {
        issue,
        tasks: issue === 1 ? '**File(s)**: `scripts/check-gate.mjs`' : '',
      });
      changedPaths.push(`${directory}/requirements.md`);
    }
    const result = await runEvaluator({
      body: 'Issues: #1, #2, #3, #4, #5, #6, #7\n\nSteering: steering/tech.md\n\n## Verification\n`node scripts/check-gate.mjs` — passed',
      changedPaths,
      repositoryFiles: files,
    });

    expect(result.contentCalls.filter((item) => item.startsWith('specs/'))).toHaveLength(20);
    expect(new Set(result.contentCalls.filter((item) => item.startsWith('specs/'))).size).toBe(20);
    expect(result.errors).toEqual([]);
  });

  test.each([
    ['exact path', '**File(s)**: `scripts/check-gate.mjs`'],
    ['directory prefix', '**File(s)**: `scripts/`'],
    ['path-specific behavior', 'Behavior for scripts/check-gate.mjs: rejects mismatched issue/spec sets'],
  ])('accepts %s mapping evidence', async (_name, tasks) => {
    const result = await runEvaluator(normalScenario({ tasks }));
    expect(result.errors).toEqual([]);
  });

  test('rejects similarly named and evidence-only path stand-ins', async () => {
    const similar = await runEvaluator(normalScenario({
      tasks: '**File(s)**: `scripts/check-gate.mjs.bak`',
      verification: '`node test` — passed',
    }));
    expect(similar.errors.join('\n')).toContain('Unmatched changed paths: scripts/check-gate.mjs.');

    const evidenceOnly = await runEvaluator(normalScenario({
      sourcePath: 'scripts/real-gate.mjs',
      tasks: '**File(s)**: `specs/feature-gate/verification-report.md`',
      verification: '`node test` — passed',
    }));
    expect(evidenceOnly.errors.join('\n')).toContain('Unmatched changed paths: scripts/real-gate.mjs.');
  });

  test.each([
    ['command plus outcome', '`node scripts/check-gate.mjs` — passed (12 tests)'],
    ['acceptance result', 'AC9: passed'],
    ['changed-path result', 'scripts/check-gate.mjs — verified'],
  ])('accepts specific verification from a %s', async (_name, verification) => {
    const scenario = normalScenario({ verification });
    const result = await runEvaluator(scenario);
    expect(result.errors).toEqual([]);
  });

  test('accepts a non-empty committed verification report', async () => {
    const scenario = normalScenario({ verification: '' });
    scenario.repositoryFiles.set('verification-report.md', '# Verification\n\n12 cases passed.\n');
    scenario.changedPaths.push('verification-report.md');
    const result = await runEvaluator(scenario);
    expect(result.errors).toEqual([]);
  });

  test('rejects generic and quoted historical verification language', async () => {
    const generic = await runEvaluator(normalScenario({ verification: 'Tests run and verification complete.' }));
    expect(generic.errors.join('\n')).toContain('Missing specific verification');

    const quoted = await runEvaluator(normalScenario({ verification: '> `node scripts/check-gate.mjs` — passed' }));
    expect(quoted.errors.join('\n')).toContain('Missing specific verification');
  });

  test('ignores hidden HTML comments as issue and verification evidence', async () => {
    const directory = 'specs/feature-gate';
    const files = addSpec(baseRepositoryFiles(), directory, {
      issue: 143,
      tasks: '**File(s)**: `scripts/check-gate.mjs`',
    });
    const hiddenIssue = await runEvaluator({
      body: `<!-- Closes #143 -->\n\nSpec: ${directory}/\n\nSteering: steering/tech.md\n\n## Verification\n\`node scripts/check-gate.mjs\` — passed`,
      changedPaths: ['scripts/check-gate.mjs', `${directory}/requirements.md`],
      repositoryFiles: files,
    });
    expect(hiddenIssue.errors.join('\n')).toContain('Missing issue evidence');

    const hiddenVerification = await runEvaluator(normalScenario({
      verification: '<!-- `node scripts/check-gate.mjs` — passed -->',
    }));
    expect(hiddenVerification.errors.join('\n')).toContain('Missing specific verification');

    const hiddenTask = await runEvaluator(normalScenario({
      tasks: '<!-- **File(s)**: `scripts/check-gate.mjs` -->',
      verification: '`node test` — passed',
    }));
    expect(hiddenTask.errors.join('\n')).toContain('Unmatched changed paths: scripts/check-gate.mjs');

    const commentOnlyReport = normalScenario({ verification: '' });
    commentOnlyReport.repositoryFiles.set('verification-report.md', '<!-- `node test` — passed -->\n');
    commentOnlyReport.changedPaths.push('verification-report.md');
    const hiddenReport = await runEvaluator(commentOnlyReport);
    expect(hiddenReport.errors.join('\n')).toContain('Missing specific verification');
  });

  test('caps unmatched-path diagnostics and reports the remaining count', async () => {
    const directory = 'specs/feature-gate';
    const files = addSpec(baseRepositoryFiles(), directory, { issue: 143 });
    const unmatched = Array.from({ length: 25 }, (_, index) => `scripts/unmatched-${String(index + 1).padStart(2, '0')}.mjs`);
    const result = await runEvaluator({
      body: `Closes #143\n\nSpec: ${directory}/\n\nSteering: steering/tech.md\n\n## Verification\n\`node test\` — passed`,
      changedPaths: [...unmatched, `${directory}/requirements.md`],
      repositoryFiles: files,
    });
    const error = result.errors.find((message) => message.includes('Unmatched changed paths'));

    expect(error).toContain('scripts/unmatched-20.mjs');
    expect(error).not.toContain('scripts/unmatched-21.mjs');
    expect(error).toContain('(+5 more)');
  });

  test('passes the complete issue-143 dogfood change set with the committed verification report', async () => {
    const directory = 'specs/feature-add-github-actions-contribution-gates-to-project-setup';
    const files = baseRepositoryFiles();
    for (const artifact of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin', 'verification-report.md']) {
      files.set(`${directory}/${artifact}`, fs.readFileSync(path.join(repoRoot, directory, artifact), 'utf8'));
    }
    const changedPaths = [
      '.github/workflows/nmg-sdlc-contribution-gate.yml',
      'CHANGELOG.md',
      'README.md',
      'references/contribution-gate.md',
      'references/contribution-guide.md',
      'scripts/__tests__/contribution-gate-contract.test.mjs',
      'scripts/__tests__/contribution-guide-contract.test.mjs',
      'scripts/__tests__/exercise-contribution-gate.test.mjs',
      ...['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin', 'verification-report.md']
        .map((artifact) => `${directory}/${artifact}`),
    ];
    const result = await runEvaluator({
      body: `Closes #143\n\nSpec: ${directory}/\n\nSteering: aligns with steering/tech.md.\n\n## Verification\n\`npm test -- --runInBand --silent\` — passed (430 tests); report: ${directory}/verification-report.md`,
      changedPaths,
      repositoryFiles: files,
    });

    expect(result.errors).toEqual([]);
  });

  test('applies the validated docs-only reduced-evidence contract', async () => {
    const result = await runEvaluator({
      body: 'Closes #143\n\nSteering: aligns with steering/tech.md\n\nSDLC-Exception: docs-only — correct an emergency typo',
      changedPaths: ['README.md'],
    });

    expect(result.errors).toEqual([]);
    expect(result.infos.join('\n')).toContain('validated docs-only reduced-evidence contract');
  });

  test('rejects empty docs-only rationale and implementation-path invalidation', async () => {
    const emptyReason = await runEvaluator({
      body: 'Closes #143\n\nSteering: steering/tech.md\n\nSDLC-Exception: docs-only —',
      changedPaths: ['README.md'],
    });
    expect(emptyReason.errors.join('\n')).toContain('provide a non-empty rationale');

    const sourceChange = await runEvaluator({
      body: 'Closes #143\n\nSteering: steering/tech.md\n\nSDLC-Exception: docs-only — update the guide',
      changedPaths: ['README.md', 'scripts/check-gate.mjs'],
    });
    expect(sourceChange.errors.join('\n')).toContain('invalidating paths: scripts/check-gate.mjs');
  });

  test('applies spike/ADR reduction only for a correlated spike and allowed paths', async () => {
    const directory = 'specs/feature-research-gate';
    const files = addSpec(baseRepositoryFiles(), directory, { issue: 500 });
    const scenario = {
      body: `Closes #500\n\nSpec: ${directory}/\n\nSteering: steering/tech.md`,
      changedPaths: [`${directory}/requirements.md`, 'docs/decisions/2026-08-12-gate.md', 'README.md'],
      repositoryFiles: files,
    };

    const valid = await runEvaluator({ ...scenario, issueLabels: { 500: ['spike'] } });
    expect(valid.errors).toEqual([]);
    expect(valid.infos.join('\n')).toContain('validated spike/ADR reduced-evidence contract');
    expect(valid.labelCalls).toEqual([500]);

    const missingLabel = await runEvaluator(scenario);
    expect(missingLabel.errors.join('\n')).toContain('Missing specific verification');
    expect(missingLabel.infos.join('\n')).not.toContain('reduced-evidence contract');

    const sourceChange = await runEvaluator({
      ...scenario,
      changedPaths: [...scenario.changedPaths, 'scripts/research.mjs'],
      issueLabels: { 500: ['spike'] },
    });
    expect(sourceChange.errors.join('\n')).toContain('Unmatched changed paths: scripts/research.mjs');
    expect(sourceChange.labelCalls).toEqual([]);
  });
});
