import { describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectEvidence,
  collectVerification,
  findFeatureDir,
  inferLifecycle,
  renderJson,
  renderText,
  runCli,
} from '../sdlc-status.mjs';
import { inspectIssueSpecScope } from '../issue-spec-scope.mjs';

const GH_PR_VIEW_JSON_FIELDS = new Set(`additions assignees author autoMergeRequest baseRefName baseRefOid body
  changedFiles closed closedAt closingIssuesReferences comments commits createdAt deletions files fullDatabaseId
  headRefName headRefOid headRepository headRepositoryOwner id isCrossRepository isDraft labels latestReviews
  maintainerCanModify mergeCommit mergeStateStatus mergeable mergedAt mergedBy milestone number potentialMergeCommit
  projectCards projectItems reactionGroups reviewDecision reviewRequests reviews state statusCheckRollup title
  updatedAt url`.split(/\s+/));

function ghPrViewUnknownField(args) {
  const index = args.indexOf('--json');
  if (index === -1) return null;
  const unknown = String(args[index + 1] ?? '').split(',').find((field) => !GH_PR_VIEW_JSON_FIELDS.has(field));
  if (unknown === undefined) return null;
  return `Unknown JSON field: "${unknown}"\nAvailable fields:\n${[...GH_PR_VIEW_JSON_FIELDS].map((field) => `  ${field}`).join('\n')}\n`;
}

function baseEvidence(overrides = {}) {
  return {
    project: {
      branch: '42-example',
      dirty: false,
      implementationPaths: [],
      baseRelativeCommits: [],
      ...(overrides.project ?? {}),
    },
    issue: {
      number: 42,
      title: 'Example',
      state: 'OPEN',
      dependency: { status: 'eligible', reasonCode: null, openBlockers: [] },
      ...(overrides.issue ?? {}),
    },
    spec: overrides.spec === undefined
      ? { complete: true, path: 'specs/42-example', scope: { status: 'ok' } }
      : overrides.spec,
    verification: overrides.verification ?? null,
    pullRequest: overrides.pullRequest ?? null,
    gaps: overrides.gaps ?? [],
  };
}

describe('sdlc-status v3 recommendations', () => {
  it('recommends write-spec when the first ready issue has no approved spec', () => {
    const status = inferLifecycle(baseEvidence({ spec: null }));
    expect(status.stage).toBe('ready');
    expect(status.nextAction.command).toBe('/sdlc-write-spec #42');
  });

  it('recommends draft-issue on the default branch with no active issue', () => {
    const evidence = baseEvidence({
      project: {
        branch: 'main',
        defaultBranch: 'main',
        dirty: false,
        implementationPaths: [],
        baseRelativeCommits: [],
      },
      spec: null,
    });
    evidence.issue = null;

    const status = inferLifecycle(evidence);

    expect(status.stage).toBe('unknown');
    expect(status.nextAction).toEqual({
      command: '/sdlc-draft-issue',
      reason: 'no active issue',
      manualRepairRequired: false,
    });
    expect(status.gaps).not.toContain('official blocked-by dependency: dependency_unreadable');
  });

  it('recommends execute when an approved spec exists and the issue is unblocked', () => {
    const status = inferLifecycle(baseEvidence());
    expect(status.stage).toBe('specified');
    expect(status.nextAction.command).toBe('/sdlc-execute #42');
  });

  it('treats completed implementation as ready for delivery even when no base-relative diff remains', () => {
    const status = inferLifecycle(baseEvidence({
      verification: { status: 'pass', current: true },
      pullRequest: { state: 'OPEN', isDraft: true },
    }));
    expect(status.stage).toBe('verified');
    expect(status.nextAction.command).toBe('/sdlc-open-pr #42');
    expect(status.gaps).not.toContain('passing verification conflicts with missing implementation evidence');
  });

  it('reports completion from merged PR and closed issue regardless of old runtime markers', () => {
    const evidence = baseEvidence({
      issue: { state: 'CLOSED' },
      verification: { status: 'pass', current: true },
      pullRequest: { state: 'MERGED' },
    });
    evidence.recovery = { state: 'blocked', reasonCode: 'old_checkpoint' };
    const status = inferLifecycle(evidence);
    expect(status.stage).toBe('complete');
    expect(status.nextAction.manualRepairRequired).toBe(false);
    expect(status.recovery).toBeUndefined();
  });

  it('recommends verify-code after implementation starts', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
    }));
    expect(status.stage).toBe('implementing');
    expect(status.nextAction.command).toBe('/sdlc-verify-code #42');
  });

  it('recommends open-pr when verification has passed', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
      verification: { status: 'pass', current: true },
    }));
    expect(status.stage).toBe('verified');
    expect(status.nextAction.command).toBe('/sdlc-open-pr #42');
  });

  it('recommends open-pr while an open PR awaits merge', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
      verification: { status: 'pass', current: true },
      pullRequest: { number: 9, state: 'OPEN', isDraft: false },
    }));
    expect(status.stage).toBe('review');
    expect(status.nextAction.command).toBe('/sdlc-open-pr #42');
  });

  it('recommends open-pr when PR evidence is still pending', () => {
    const status = inferLifecycle(baseEvidence({
      project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
      verification: { status: 'pass', current: true, readinessStatus: 'pr_evidence_pending' },
      pullRequest: { number: 9, state: 'OPEN', isDraft: false },
    }));
    expect(status.stage).toBe('delivery-validation-pending');
    expect(status.nextAction.command).toBe('/sdlc-open-pr #42');
  });

  it('fails closed for unavailable issue evidence and recognizes completed delivery', () => {
    const unavailable = baseEvidence();
    unavailable.issue = null;
    expect(inferLifecycle(unavailable)).toMatchObject({
      stage: 'unknown',
      nextAction: { reason: 'issue_evidence_unavailable', manualRepairRequired: true },
    });


    expect(inferLifecycle(baseEvidence({
      project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
      issue: { state: 'CLOSED' },
      verification: { status: 'pass', current: true },
      pullRequest: { number: 9, state: 'MERGED', isDraft: false },
    }))).toMatchObject({ stage: 'complete' });
  });

  it('never recommends worker /skill: commands', () => {
    const cases = [
      inferLifecycle(baseEvidence({
        project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
      })),
      inferLifecycle(baseEvidence({
        project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
        verification: { status: 'pass', current: true },
      })),
      inferLifecycle(baseEvidence({
        project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
        verification: { status: 'pass', current: true },
        pullRequest: { number: 9, state: 'OPEN', isDraft: false },
      })),
      inferLifecycle(baseEvidence({
        project: { branch: '42-example', dirty: false, implementationPaths: ['src/foo.ts'], baseRelativeCommits: [] },
        verification: { status: 'pass', current: true, readinessStatus: 'pr_evidence_pending' },
        pullRequest: { number: 9, state: 'OPEN', isDraft: false },
      })),
    ];
    for (const status of cases) {
      expect(status.nextAction.command.startsWith('/sdlc-')).toBe(true);
      expect(status.nextAction.command).not.toMatch(/\/skill:/);
    }
  });

  it('keeps official open blockers blocked', () => {
    const status = inferLifecycle(baseEvidence({
      issue: {
        number: 42,
        title: 'Example',
        state: 'OPEN',
        body: 'Depends on: #99',
        dependency: { status: 'blocked', reasonCode: 'dependency_blocked', openBlockers: [1] },
      },
    }));
    expect(status.stage).toBe('blocked');
    expect(status.nextAction.command).toBe('/sdlc-status');
    expect(status.gaps).toContain('official blocked-by dependency: dependency_blocked');
  });

  it.each(['dependency_cycle', 'dependency_dangling'])('keeps %s graph failures blocked', (reasonCode) => {
    const status = inferLifecycle(baseEvidence({
      issue: { dependency: { status: 'blocked', reasonCode } },
    }));
    expect(status.stage).toBe('blocked');
    expect(status.nextAction).toEqual({
      command: '/sdlc-status',
      reason: reasonCode,
      manualRepairRequired: false,
    });
  });

  it('ignores legacy body relationship text when official evidence is eligible', () => {
    const status = inferLifecycle(baseEvidence({
      issue: { body: 'Depends on: #1\\nBlocks: #2' },
    }));
    expect(status.stage).toBe('specified');
  });

  it('does not emit epicAuthority or coordination in JSON', () => {
    const status = inferLifecycle(baseEvidence());
    const parsed = JSON.parse(renderJson(status));
    expect(parsed).not.toHaveProperty('epicAuthority');
    expect(parsed).not.toHaveProperty('coordination');
    expect(JSON.stringify(parsed)).not.toContain('epicAuthority');
  });

  it('prints the skill usage line from the CLI', () => {
    let stdout = '';
    const code = runCli(['--help'], {
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write() {} },
    });
    expect(code).toBe(0);
    expect(stdout).toContain('Usage: /sdlc-status [--json]');
  });

  it('renders stage first and next action last', () => {
    const status = inferLifecycle(baseEvidence());
    const lines = renderText(status).trim().split('\n');
    expect(lines[0]).toBe('SDLC status: specified');
    expect(lines.at(-1)).toBe('Next: /sdlc-execute #42');
  });
  it('collects an approved spec using the discovered non-main default branch', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-'));
    try {
      const git = (args) => execFileSync('git', args, { cwd: project, encoding: 'utf8' });
      git(['init', '-b', 'master']);
      git(['config', 'user.name', 'Test']);
      git(['config', 'user.email', 'test@example.com']);
      fs.writeFileSync(path.join(project, 'README.md'), 'fixture\n');
      git(['add', 'README.md']);
      git(['commit', '-m', 'fixture']);
      git(['checkout', '-b', '42-example']);

      const specDir = path.join(project, 'specs', '42-example');
      fs.mkdirSync(specDir, { recursive: true });
      const approved = '**Issue**: #42\n**Status**: Approved\n';
      for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
        fs.writeFileSync(path.join(specDir, name), approved);
      }

      const observedGitArgs = [];
      const run = (command, args, options = {}) => {
        if (command === 'gh') {
          return { ok: false, status: 1, stdout: '', stderr: 'offline fixture' };
        }
        observedGitArgs.push(args);
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
      };

      const evidence = collectEvidence(project, { run });
      expect(evidence.project.defaultBranch).toBe('master');
      expect(evidence.spec).toMatchObject({
        path: 'specs/42-example',
        complete: true,
        missingFiles: [],
      });
      expect(observedGitArgs).toContainEqual(['diff', '--name-only', 'master...HEAD']);
      expect(observedGitArgs).not.toContainEqual(expect.arrayContaining(['main...HEAD']));

      fs.writeFileSync(path.join(specDir, 'design.md'), '**Issue**: #42\n**Status**: Draft\n');
      expect(collectEvidence(project, { run }).spec.complete).toBe(false);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it('selects an exact branch spec and rejects unresolved duplicate issue specs', () => {
    const specsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-specs-'));
    try {
      fs.mkdirSync(path.join(specsDir, '42-first'));
      fs.mkdirSync(path.join(specsDir, '42-second'));
      expect(findFeatureDir(specsDir, 42, 'second')).toBe('42-second');
      expect(() => findFeatureDir(specsDir, 42, null)).toThrow(
        'multiple spec directories found for #42: 42-first, 42-second',
      );
    } finally {
      fs.rmSync(specsDir, { recursive: true, force: true });
    }
  });
  it('validates nested readiness and delivery markers against the current PR head', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-verification-'));
    try {
      const specPath = 'specs/42-example';
      const specDir = path.join(project, specPath);
      fs.mkdirSync(specDir, { recursive: true });
      const reportPath = path.join(specDir, 'verification-report.md');
      const oldHead = '1'.repeat(40);
      const currentHead = '2'.repeat(40);
      const scope = {
        issueNumber: 42,
        specPath,
        status: 'scoped',
        delivery: {
          acceptanceCriteria: ['AC1'],
          functionalRequirements: ['FR1'],
          tasks: ['T001'],
          scenarios: ['SCN001'],
        },
        regression: {
          acceptanceCriteria: [],
          functionalRequirements: [],
          scenarios: [],
        },
      };
      const local = {
        ...scope.delivery,
        regression: scope.regression,
        tests: 'pass',
        steeringGates: 'pass',
      };
      const evidence = (headSha) => ({
        kind: 'required_check',
        name: 'contract-tests',
        event: 'pull_request',
        acceptanceCriteria: ['AC1'],
        headSha,
        conclusion: 'SUCCESS',
        url: 'https://github.example/check/1',
      });
      const readiness = (headSha) => ({
        schemaVersion: 1,
        state: 'pr_evidence_satisfied',
        issueNumber: 42,
        specPath,
        local,
        evidence: [evidence(headSha)],
      });
      const marker = (name, value) => `<!-- ${name}: ${JSON.stringify(value)} -->`;
      const report = (readinessValue, deliveryValue = null) => [
        '# Verification Report',
        '',
        '### Implementation Status: Pass',
        '',
        marker('nmg-sdlc-issue-scope', scope),
        marker('nmg-sdlc-pr-readiness', readinessValue),
        deliveryValue ? marker('nmg-sdlc-delivery-validation', deliveryValue) : '',
        '',
      ].join('\n');
      const spec = { path: specPath, scope };
      const pullRequest = { number: 9, headRefOid: currentHead };

      fs.writeFileSync(reportPath, report(readiness(oldHead)));
      const staleGaps = [];
      const stale = collectVerification(project, spec, pullRequest, [], { fs }, staleGaps);
      expect(stale).toMatchObject({
        status: 'pass',
        current: false,
        readinessStatus: null,
      });
      expect(stale.gaps).toContain('evidence item 1 does not match the expected head SHA');
      expect(staleGaps.join('\n')).toContain('verification evidence: evidence item 1 does not match');

      const delivery = {
        schemaVersion: 1,
        state: 'final_sha_validated',
        issueNumber: 42,
        specPath,
        pullRequestNumber: 9,
        headSha: oldHead,
        evidence: [evidence(oldHead)],
      };
      fs.writeFileSync(reportPath, report(readiness(currentHead), delivery));
      const invalidDelivery = collectVerification(project, spec, pullRequest, [], { fs }, []);
      expect(invalidDelivery).toMatchObject({
        status: 'pass',
        current: true,
        readinessStatus: 'pr_evidence_satisfied',
        deliveryValidationStatus: 'unverifiable',
      });
      expect(invalidDelivery.deliveryValidationGaps).toContain(
        'delivery-validation head does not match the final pull-request head',
      );

      fs.writeFileSync(reportPath, report(readiness(currentHead)));
      const untracked = collectVerification(project, spec, pullRequest, ['src/untracked.mjs'], { fs }, []);
      expect(untracked.current).toBe(false);
      expect(untracked.gaps).toContain(
        'untracked implementation paths invalidate verification: src/untracked.mjs',
      );

      const git = (...args) => {
        const outcome = spawnSync('git', args, { cwd: project, encoding: 'utf8' });
        expect(outcome.status).toBe(0);
        return outcome.stdout.trim();
      };
      git('init', '-b', '42-example');
      git('config', 'user.name', 'Status Test');
      git('config', 'user.email', 'status@example.test');
      fs.rmSync(reportPath);
      fs.writeFileSync(path.join(project, 'source.txt'), 'source implementation\n');
      git('add', 'source.txt');
      git('commit', '-m', 'feat: implement #42');
      const sourceHead = git('rev-parse', 'HEAD');
      fs.writeFileSync(reportPath, `${report(readiness(sourceHead))}\n**Verification head**: ${sourceHead}\n`);
      git('add', reportPath);
      git('commit', '-m', 'docs: record verification for #42');
      const reportHead = git('rev-parse', 'HEAD');
      const actual = collectVerification(project, spec, { number: 9, headRefOid: reportHead }, [], {
        fs,
        run: (binary, args, options) => {
          const result = spawnSync(binary, args, { encoding: 'utf8', ...options });
          return { ...result, ok: result.status === 0 };
        },
      }, []);
      expect(actual).toMatchObject({
        status: 'pass', current: true, readinessStatus: 'pr_evidence_satisfied',
      });
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
});

describe('sdlc-status branch pull-request evidence', () => {
  const ok = (value) => ({ ok: true, status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' });

  function statusFixture(prView) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-status-pr-'));
    const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    fs.writeFileSync(path.join(project, 'README.md'), 'fixture\n');
    git('add', 'README.md');
    git('commit', '-m', 'fixture');
    git('checkout', '-b', '42-example');
    const specPath = 'specs/42-example';
    const specDir = path.join(project, specPath);
    fs.mkdirSync(specDir, { recursive: true });
    const header = '**Issue**: #42\n**Status**: Approved\n\n';
    for (const name of ['requirements.md', 'design.md', 'feature.gherkin']) {
      fs.writeFileSync(path.join(specDir, name), header);
    }
    fs.writeFileSync(path.join(specDir, 'tasks.md'), `${header}### T001: Update helper\n`);
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.writeFileSync(path.join(project, 'src', 'helper.mjs'), 'export const helper = true;\n');
    const scope = inspectIssueSpecScope({ projectRoot: project, specPath, issueNumber: 42 });
    const marker = JSON.stringify({
      issueNumber: 42, specPath, status: scope.status, delivery: scope.delivery, regression: scope.regression,
    });
    fs.writeFileSync(path.join(specDir, 'verification-report.md'),
      `# Verification Report\n\n### Implementation Status: Pass\n\n<!-- nmg-sdlc-issue-scope: ${marker} -->\n`);
    git('add', '.');
    git('commit', '-m', 'feat: helper');
    const head = git('rev-parse', 'HEAD');
    const run = (command, args, options = {}) => {
      if (command !== 'gh') {
        const result = spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', stdio: 'pipe' });
        return {
          ok: !result.error && result.status === 0,
          status: result.status,
          stdout: result.stdout ?? '',
          stderr: result.error?.message ?? result.stderr ?? '',
        };
      }
      if (args[0] === 'repo') return args.includes('--jq') ? ok('main\n') : ok({ nameWithOwner: 'example/status' });
      if (args[0] === 'issue' && args[1] === 'view') {
        return ok({ number: 42, title: 'Example', state: 'OPEN', body: '', labels: [], projectItems: { nodes: [] } });
      }
      if (args[0] === 'api') {
        return args.some((arg) => String(arg).endsWith('/dependencies/blocked_by'))
          ? ok([])
          : ok({ id: 4242, number: 42, state: 'OPEN', repository: 'example/status' });
      }
      if (args[0] === 'pr' && args[1] === 'view') {
        const unknownField = ghPrViewUnknownField(args);
        return unknownField ? { ok: false, status: 1, stdout: '', stderr: unknownField } : prView(args, head);
      }
      throw new Error(`unexpected gh ${args.join(' ')}`);
    };
    return { project, head, run };
  }

  function statusJson(fixture) {
    let out = '';
    const code = runCli(['--project', fixture.project, '--json'], {
      adapters: { run: fixture.run },
      stdout: { write(chunk) { out += chunk; } },
      stderr: { write() {} },
    });
    expect(code).toBe(0);
    return JSON.parse(out);
  }

  const pullRequestGaps = (status) => status.gaps.filter((gap) => gap.startsWith('pull request '));

  it('reports the open draft pull request when gh rejects unsupported pr view fields', () => {
    let project;
    try {
      const fixture = statusFixture((args, head) => {
        const full = {
          number: 9, state: 'OPEN', isDraft: true, headRefName: '42-example', headRefOid: head,
          baseRefName: 'main', mergeStateStatus: 'CLEAN', closingIssuesReferences: [{ number: 42 }],
        };
        const requested = args[args.indexOf('--json') + 1].split(',');
        return ok(Object.fromEntries(requested.filter((key) => Object.hasOwn(full, key)).map((key) => [key, full[key]])));
      });
      project = fixture.project;
      const status = statusJson(fixture);
      expect(status.pullRequest).toEqual({
        number: 9, state: 'OPEN', isDraft: true, headRefOid: fixture.head, baseRefName: 'main',
        mergeStateStatus: 'CLEAN', checks: 'unknown', closing: [42],
      });
      expect(status.missingArtifacts).not.toContain('pull request');
      expect(pullRequestGaps(status)).toEqual([]);
    } finally {
      if (project) fs.rmSync(project, { recursive: true, force: true });
    }
  });

  const longFailure = `GraphQL: ${'x'.repeat(400)}`;
  it.each([
    ['fetch failure', { ok: false, status: 1, stdout: '', stderr: 'HTTP 502: Bad Gateway (https://api.github.com/graphql)\n' },
      'pull request fetch failed: HTTP 502: Bad Gateway (https://api.github.com/graphql)'],
    ['long fetch failure', { ok: false, status: 1, stdout: '', stderr: longFailure },
      `pull request fetch failed: ${longFailure.slice(0, 237)}...`],
    ['parse failure', { ok: true, status: 0, stdout: '{not json', stderr: '' },
      expect.stringMatching(/^pull request parse failed: \S.{0,239}$/)],
  ])('reports a pull-request %s as one bounded gap', (_label, response, expected) => {
    let project;
    try {
      const fixture = statusFixture(() => response);
      project = fixture.project;
      const status = statusJson(fixture);
      expect(status.pullRequest).toBeNull();
      expect(pullRequestGaps(status)).toEqual([expected]);
    } finally {
      if (project) fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it('keeps a branch without a pull request gap-free and verified', () => {
    let project;
    try {
      const fixture = statusFixture(() => ({
        ok: false, status: 1, stdout: '', stderr: 'no pull requests found for branch "42-example"\n',
      }));
      project = fixture.project;
      const status = statusJson(fixture);
      expect(status.pullRequest).toBeNull();
      expect(pullRequestGaps(status)).toEqual([]);
      expect(status.verification).toMatchObject({ status: 'pass', current: true });
      expect(status.stage).toBe('verified');
      expect(status.nextAction.command).toBe('/sdlc-open-pr #42');
    } finally {
      if (project) fs.rmSync(project, { recursive: true, force: true });
    }
  });
});
