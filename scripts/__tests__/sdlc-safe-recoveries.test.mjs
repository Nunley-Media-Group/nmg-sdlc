import { afterEach, describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertInitialStagePublication,
  publicationPathDenied,
  reconcileStagePublication,
  resolveRecoveryOwner,
} from '../sdlc-safe-recoveries.mjs';

const roots = [];
const report = 'specs/42-feature/verification-report.md';
const subject = 'docs: record verification for #42';

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-publication-'));
  roots.push(root);
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  fs.mkdirSync(work);
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(root, 'init', '--bare', remote);
  git(work, 'init', '-b', '42-feature');
  git(work, 'config', 'user.name', 'Fixture');
  git(work, 'config', 'user.email', 'fixture@example.test');
  const put = (file, content) => {
    const target = path.join(work, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  put('.gitignore', '.omp/\n');
  put(report, 'initial\n');
  git(work, 'add', '.');
  git(work, 'commit', '-m', 'chore: initialize');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'push', '-u', 'origin', '42-feature');
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, ...args]);
    return spawnSync(command, args, { encoding: 'utf8', ...options });
  };
  const publish = () => reconcileStagePublication({
    cwd: work, issue: 42, step: 'verify', expectedSubject: subject, allowedPaths: [report], run,
  });
  return { root, work, remote, git: (...args) => git(work, ...args), put, run, calls, publish };
}

describe('live publication evidence', () => {
  test('a malformed stale run and consumed ledger cannot veto an exact-head publication or acknowledgment', () => {
    const f = fixture();
    f.put('.omp/sdlc/run.json', '{bad');
    f.put('.omp/sdlc/safe-recoveries.json', '{bad');
    expect(resolveRecoveryOwner({ cwd: f.work, issue: 42, step: 'verify', run: f.run }))
      .toBe('42:42-feature:verify');
    expect(() => assertInitialStagePublication({ cwd: f.work, issue: 42, step: 'verify', run: f.run }))
      .not.toThrow();
    f.put(report, 'verified result\n');
    f.git('add', report);
    f.git('commit', '-m', subject);
    expect(f.publish()).toMatchObject({ passed: true, pushed: true });
    const head = f.git('rev-parse', 'HEAD');
    expect(f.git('rev-parse', 'origin/42-feature')).toBe(head);
    f.calls.length = 0;
    expect(f.publish()).toMatchObject({ passed: true, ack: true });
    expect(f.calls.some(([command, operation]) => command === 'git' && operation === 'push')).toBe(false);
  });

  test('failed push acknowledgment reconciles from remote without a second push', () => {
    const f = fixture();
    f.put(report, 'new report\n');
    f.git('add', report);
    f.git('commit', '-m', subject);
    f.git('push', 'origin', 'HEAD:refs/heads/42-feature');
    f.calls.length = 0;
    expect(f.publish()).toMatchObject({ passed: true, ack: true });
    expect(f.calls.some(([command, operation]) => command === 'git' && operation === 'push')).toBe(false);
  });

  test('rejects a commit that edits outside approved publication paths', () => {
    const f = fixture();
    f.put(report, 'new report\n');
    f.put('src/unapproved.js', 'export const value = 1;\n');
    f.git('add', report, 'src/unapproved.js');
    f.git('commit', '-m', subject);
    expect(f.publish()).toMatchObject({ passed: false });
    expect(f.git('rev-parse', 'origin/42-feature')).not.toBe(f.git('rev-parse', 'HEAD'));
  });

  test('approved spec input and runtime receipt paths remain denied', () => {
    expect(publicationPathDenied('specs/42-feature/requirements.md', {
      spec: 'specs/42-feature', readOnlyPaths: ['specs/42-feature/requirements.md'],
    })).toBe(true);
    expect(publicationPathDenied('.omp/sdlc/run.json', { spec: 'specs/42-feature' })).toBe(true);
  });
});
