import { afterEach, describe, expect, test } from '@jest/globals';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recoverVerification } from '../sdlc-recover-verification.mjs';
import { inspectIssueSpecScope } from '../issue-spec-scope.mjs';

const roots = [];
const spec = 'specs/42-feature';
const report = `${spec}/verification-report.md`;

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-recheck-'));
  roots.push(base);
  const root = path.join(base, 'work');
  fs.mkdirSync(root);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git('init', '-b', '42-feature');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  fs.writeFileSync(path.join(root, '.gitignore'), '.omp/\n');
  fs.mkdirSync(path.join(root, spec), { recursive: true });
  const header = '**Issue**: #42\n**Status**: Approved\n';
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    fs.writeFileSync(path.join(root, spec, name), header);
  }
  fs.mkdirSync(path.join(root, 'steering'));
  fs.writeFileSync(path.join(root, 'steering/manifest.json'), JSON.stringify({
    schemaVersion: 1, runtimeVersion: '1', modules: [], snippets: [], extensions: [],
    validations: [{ id: 'repository.tests', provider: 'builtin.command', required: true,
      when: { kind: 'always' }, config: { command: 'echo ok' } }],
  }));
  git('add', '.');
  git('commit', '-m', 'chore: approved fixture');
  const remote = path.join(base, 'remote.git');
  spawnSync('git', ['init', '--bare', remote], { cwd: base, encoding: 'utf8' });
  git('remote', 'add', 'origin', remote);
  git('push', '-u', 'origin', '42-feature');
  const head = git('rev-parse', 'HEAD');
  const hash = (names) => `sha256:${createHash('sha256').update(names.map(([name, file]) =>
    `${name}\0${fs.readFileSync(path.join(root, file))}`).join('\0')).digest('hex')}`;
  const steeringHash = hash([['steering/manifest.json', 'steering/manifest.json']]);
  const specHash = hash(['design.md', 'feature.gherkin', 'requirements.md', 'tasks.md']
    .map((name) => [name, `${spec}/${name}`]));
  const scope = inspectIssueSpecScope({ projectRoot: root, issueNumber: 42, specPath: spec });
  const marker = {
    issueNumber: scope.issueNumber, specPath: scope.specPath, status: scope.status,
    delivery: scope.delivery, regression: scope.regression,
  };
  const writeReport = (status, verificationHead = head) => {
    fs.writeFileSync(path.join(root, report),
      `# Verification\n\n## Implementation Status: **${status}**\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify(marker)} -->\n**Verification head**: ${verificationHead}\n\n## Remaining Issues\nsrc/fix.js\n`);
  };
  const writeArtifact = (sourceHead, effectiveStatus, ceiling) => {
    fs.mkdirSync(path.join(root, '.omp/sdlc/verification'), { recursive: true });
    fs.writeFileSync(path.join(root, '.omp/sdlc/verification/42.json'), JSON.stringify({
      schemaVersion: 1, issue: 42, identity: { headSha: sourceHead, steeringHash, specHash }, ceiling,
      coverage: { complete: true, declared: 1, recorded: 1, missing: [], duplicate: [], unknown: [] },
      results: [{ id: 'repository.tests', provider: 'builtin.command', required: true,
        applicable: true, effectiveStatus }],
    }));
  };
  const recover = (options = {}) => recoverVerification({ issue: 42, spec, cwd: root,
    loadRuntime: async () => ({ steeringHash, validations: [{ id: 'repository.tests',
      provider: 'builtin.command', required: true }] }), ...options });
  return { root, git, head, writeReport, writeArtifact, recover };
}

describe('verification recheck from live steering and branch evidence', () => {
  test('external Incomplete at the current head remains actionable without run.json or one-use ledger', async () => {
    const f = fixture();
    f.writeReport('Incomplete');
    f.writeArtifact(f.head, 'incomplete', 'Incomplete');
    expect(await f.recover()).toEqual({ recover: true });
    expect(await f.recover()).toEqual({ recover: true });
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/run.json'))).toBe(false);
    expect(fs.existsSync(path.join(f.root, '.omp/sdlc/safe-recoveries.json'))).toBe(false);
  });

  test('a published substantive repair produces a fresh-head recheck but not a false Pass', async () => {
    const f = fixture();
    f.writeReport('Fail');
    f.writeArtifact(f.head, 'failed', 'Fail');
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'not_applicable' });
    fs.mkdirSync(path.join(f.root, 'src'));
    fs.writeFileSync(path.join(f.root, 'src/fix.js'), 'export const fixed = true;\n');
    f.git('add', 'src/fix.js');
    f.git('commit', '-m', 'fix: repair behavior #42');
    f.git('push');
    const probe = await f.recover({ probe: true });
    expect(probe).toMatchObject({ recover: false, eligible: true, kind: 'changed_head_failed_report', oldHead: f.head });
    expect(await f.recover()).toEqual({ recover: true, kind: 'changed_head_failed_report' });
    expect(fs.existsSync(path.join(f.root, `.omp/sdlc/history/verification-rechecks/42-${f.head}-${f.git('rev-parse', 'HEAD')}/receipt.json`))).toBe(true);
  });

  test('rejects a symlinked report without reading its target', async () => {
    const f = fixture();
    f.writeArtifact(f.head, 'incomplete', 'Incomplete');
    const external = path.join(f.root, '..', 'untrusted-report.md');
    fs.writeFileSync(external, '# external\n');
    fs.symlinkSync(external, path.join(f.root, report));
    expect(await f.recover()).toEqual({ recover: false, reasonCode: 'verification_report_invalid' });
  });
});
