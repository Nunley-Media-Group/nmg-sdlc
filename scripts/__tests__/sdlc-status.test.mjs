import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectEvidence,
  inferLifecycle,
  renderJson,
  renderText,
  runCli,
} from '../sdlc-status.mjs';

const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];

function baseEvidence(overrides = {}) {
  const evidence = {
    project: {
      root: '/project',
      branch: 'main',
      dirty: false,
      changedPaths: [],
      implementationPaths: [],
      baseRelativeCommits: [],
    },
    issue: null,
    spec: null,
    verification: null,
    pullRequest: null,
    gaps: [],
  };
  return {
    ...evidence,
    ...overrides,
    project: { ...evidence.project, ...overrides.project },
  };
}

function localRun(command, args, options = {}) {
  if (command === 'gh') {
    return { ok: false, status: 1, stdout: '', stderr: 'GitHub unavailable in fixture' };
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.error?.message ?? result.stderr ?? '',
  };
}

function makeRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Status Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'status@example.test'], { cwd: root });
  fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'chore: initialize fixture'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['checkout', '-b', '42-status-fixture'], { cwd: root, stdio: 'ignore' });

  const specDir = path.join(root, 'specs', 'feature-status-fixture');
  fs.mkdirSync(specDir, { recursive: true });
  for (const filename of REQUIRED_SPEC_FILES) {
    const content = filename === 'requirements.md'
      ? '# Requirements\n\n**Issues**: #42\n'
      : `# ${filename}\n`;
    fs.writeFileSync(path.join(specDir, filename), content);
  }
  return root;
}

function worktreeSnapshot(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else {
        const relative = path.relative(root, absolute);
        const hash = createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
        files.push(`${relative}:${hash}`);
      }
    }
  }
  visit(root);
  return {
    files: files.sort(),
    refs: execFileSync('git', ['show-ref'], { cwd: root, encoding: 'utf8' }),
    status: execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
    }),
  };
}

describe('lifecycle inference', () => {
  test.each([
    ['idle', baseEvidence(), '$nmg-sdlc:start-issue'],
    ['started', baseEvidence({
      project: { branch: '42-feature' },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
    }), '$nmg-sdlc:write-spec #42'],
    ['specified', baseEvidence({
      project: { branch: '42-feature' },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
    }), '$nmg-sdlc:write-code #42'],
    ['implemented', baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
    }), '$nmg-sdlc:verify-code #42'],
    ['verified', baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
      verification: { path: 'specs/feature/verification-report.md', status: 'pass', current: true },
    }), '$nmg-sdlc:open-pr #42'],
    ['pull-request-open', baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'OPEN', source: 'branch' },
      pullRequest: { number: 50, state: 'OPEN', url: null, checks: 'passing' },
    }), '$nmg-sdlc:address-pr-comments #42'],
    ['complete', baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: 'Feature', state: 'CLOSED', source: 'branch' },
      pullRequest: { number: 50, state: 'MERGED', url: null, checks: 'passing' },
    }), '$nmg-sdlc:start-issue'],
    ['unknown', baseEvidence({ project: { branch: 'feature/no-issue' } }), 'Manual repair'],
  ])('infers %s from the strongest consistent evidence', (stage, evidence, command) => {
    const status = inferLifecycle(evidence);
    expect(status.stage).toBe(stage);
    expect(status.nextAction.command).toContain(command);
  });

  test.each([
    ['failing', true, 'Manual repair'],
    ['pending', false, '$nmg-sdlc:address-pr-comments #42'],
    ['absent', false, '$nmg-sdlc:address-pr-comments #42'],
  ])('handles %s pull-request checks conservatively', (checks, manualRepair, command) => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-feature', implementationPaths: ['src/index.js'] },
      issue: { number: 42, title: null, state: 'OPEN', source: 'branch' },
      pullRequest: { number: 50, state: 'OPEN', url: null, checks },
    }));
    expect(status.stage).toBe('pull-request-open');
    expect(status.nextAction.manualRepairRequired).toBe(manualRepair);
    expect(status.nextAction.command).toContain(command);
  });

  it('stops at the last consistent boundary when verification conflicts', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-feature' },
      issue: { number: 42, title: null, state: 'OPEN', source: 'branch' },
      spec: { path: 'specs/feature', complete: true, missingFiles: [] },
      verification: { path: 'specs/feature/verification-report.md', status: 'pass', current: true },
    }));
    expect(status.stage).toBe('specified');
    expect(status.gaps).toContain('passing verification conflicts with absent implementation paths');
  });

});

describe('bounded evidence collection and read-only safety', () => {
  let root;

  beforeEach(() => {
    root = makeRepository();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('collects a complete matching spec and degrades when GitHub is unavailable', () => {
    const evidence = collectEvidence(root, { run: localRun });
    expect(evidence.project.branch).toBe('42-status-fixture');
    expect(evidence.project.dirty).toBe(true);
    expect(evidence.project.baseRelativeCommits).toEqual([]);
    expect(evidence.spec).toMatchObject({ complete: true, missingFiles: [] });
    expect(evidence.project.implementationPaths).toEqual([]);
    expect(evidence.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('GitHub issue unavailable'),
      expect.stringContaining('GitHub pull request unavailable'),
    ]));
    expect(inferLifecycle(evidence).stage).toBe('specified');
  });

  it('recovers the issue and strict spec match from a pull-request-linked branch', () => {
    execFileSync('git', ['branch', '-m', 'feature/status-fixture'], { cwd: root });
    const run = (command, args, options) => {
      if (command !== 'gh') return localRun(command, args, options);
      if (args[0] === 'pr' && args[1] === 'list') {
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify([{
            number: 50,
            state: 'OPEN',
            url: 'https://example.test/pull/50',
            headRefName: 'feature/status-fixture',
            closingIssuesReferences: [{ number: 42, title: 'Status fixture', state: 'OPEN' }],
          }]),
          stderr: '',
        };
      }
      if (args[0] === 'pr' && args[1] === 'checks') {
        return { ok: true, status: 0, stdout: '[]', stderr: '' };
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        return {
          ok: true,
          status: 0,
          stdout: JSON.stringify({ number: 42, title: 'Status fixture', state: 'OPEN' }),
          stderr: '',
        };
      }
      throw new Error(`unexpected GitHub command: ${args.join(' ')}`);
    };

    const evidence = collectEvidence(root, { run });
    expect(evidence.issue).toMatchObject({ number: 42, source: 'pullRequest' });
    expect(evidence.spec).toMatchObject({ complete: true, missingFiles: [] });
    expect(evidence.pullRequest).toMatchObject({ number: 50, state: 'OPEN', checks: 'absent' });
    expect(inferLifecycle(evidence).stage).toBe('pull-request-open');
  });

  it('uses only read-only git and GitHub command forms', () => {
    const calls = [];
    const run = (command, args, options) => {
      calls.push([command, ...args]);
      return localRun(command, args, options);
    };
    collectEvidence(root, { run });

    const mutating = /^(?:add|checkout|commit|merge|push|reset|restore|rm|switch|clean|create|edit|close|reopen|delete)$/;
    for (const [command, noun, verb] of calls) {
      if (command === 'git') expect(noun).not.toMatch(mutating);
      if (command === 'gh') expect(verb).not.toMatch(mutating);
    }
  });

  it('does not change files, refs, status, or lifecycle conclusions in text or JSON mode', () => {
    const before = worktreeSnapshot(root);
    let textOutput = '';
    let jsonOutput = '';
    const common = { adapters: { run: localRun }, stderr: { write: () => {} } };

    expect(runCli(['--project', root], {
      ...common,
      stdout: { write: (chunk) => { textOutput += chunk; } },
    })).toBe(0);
    expect(runCli(['--project', root, '--json'], {
      ...common,
      stdout: { write: (chunk) => { jsonOutput += chunk; } },
    })).toBe(0);

    const after = worktreeSnapshot(root);
    expect(after).toEqual(before);
    expect(textOutput).toContain('SDLC status: specified');
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.stage).toBe('specified');
    expect(parsed.schemaVersion).toBe(1);
    expect(Object.keys(parsed)).toEqual(expect.arrayContaining([
      'project', 'issue', 'spec', 'verification', 'pullRequest', 'stage',
      'completedArtifacts', 'missingArtifacts', 'gaps', 'nextAction',
    ]));
    expect(parsed).not.toHaveProperty('runner');
  });

  it('does not probe runner source, state, sentinels, logs, configuration, or PIDs', () => {
    const source = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sdlc-status.mjs'), 'utf8');
    for (const forbidden of [
      'sdlc-runner.mjs', 'sdlc-state.json', 'unattended-mode', 'sdlc-config.json',
      'runnerPid', 'process.kill', 'sdlc-logs', '$nmg-sdlc:end-loop', '--resume',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe('rendering and invocation', () => {
  it('keeps stage first, next action last, and JSON valid', () => {
    const status = inferLifecycle(baseEvidence());
    const text = renderText(status).split('\n');
    expect(text[0]).toBe('SDLC status: idle');
    expect(text.at(-1)).toBe('Next: $nmg-sdlc:start-issue');
    expect(JSON.parse(renderJson(status))).toMatchObject({ schemaVersion: 1, stage: 'idle' });
  });

  it('rejects invalid invocation without writing stdout', () => {
    let stdout = '';
    let stderr = '';
    const code = runCli(['--unexpected'], {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
    });
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('Argument error');
  });

  it('prints help without collecting project evidence', () => {
    let stdout = '';
    let stderr = '';
    const code = runCli(['--help'], {
      stdout: { write: (chunk) => { stdout += chunk; } },
      stderr: { write: (chunk) => { stderr += chunk; } },
      adapters: { run: () => { throw new Error('must not collect evidence'); } },
    });
    expect(code).toBe(0);
    expect(stdout).toContain('Usage: node sdlc-status.mjs --project <repo-root> [--json]');
    expect(stderr).toBe('');
  });

  it('exits non-zero when the project is not a git repository', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-non-git-'));
    let stdout = '';
    let stderr = '';
    try {
      const code = runCli(['--project', root], {
        stdout: { write: (chunk) => { stdout += chunk; } },
        stderr: { write: (chunk) => { stderr += chunk; } },
      });
      expect(code).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toContain('not a git project');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
