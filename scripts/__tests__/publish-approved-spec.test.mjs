import { afterEach, describe, expect, it } from '@jest/globals';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../publish-approved-spec.mjs');
const temporaryRoots = [];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-publish-'));
  temporaryRoots.push(root);
  return root;
}

function git(cwd, args, env = process.env) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function writeApproved(dir, issueN) {
  fs.mkdirSync(dir, { recursive: true });
  const body = `**Issue**: #${issueN}\n**Status**: Approved\n\ncontent\n`;
  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    fs.writeFileSync(path.join(dir, name), body);
  }
}

function makeRepo() {
  const root = makeRoot();
  const remote = makeRoot();
  const bin = makeRoot();
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh
printf '%s\\n' "$*" >> .gh-log
if [ "$1" = "issue" ] && [ "$2" = "develop" ]; then
  name=""
  base=""
  while [ $# -gt 0 ]; do
    if [ "$1" = "--name" ]; then
      name="$2"
      shift 2
      continue
    fi
    if [ "$1" = "--base" ]; then
      base="$2"
      shift 2
      continue
    fi
    shift
  done
  if [ -z "$base" ]; then
    exit 1
  fi
  git checkout -b "$name"
  exit $?
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '%s\\n' main
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "list" ]; then
  printf '%s\n' '[]'
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "create" ]; then
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  printf '%s\n' '{"number":42,"labels":[]}'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ] && [ "$4" = "--add-label" ] && [ "$5" = "spec-created" ]; then
  if [ "$FAIL_SPEC_LABEL" = "1" ]; then
    printf '%s\n' 'label failed' >&2
    exit 1
  fi
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  printf '%s\\n' '[]'
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  printf '%s\\n' 'https://github.com/example/repo/pull/99'
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then
  echo "$*" | grep -q -- '--squash' || exit 1
  branch=$(git branch --show-current)
  git checkout main
  git merge --squash "$branch"
  git commit -m "docs: approve spec squash"
  git push origin main
  git checkout "$branch"
  exit 0
fi
exit 1
`);
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  execFileSync('git', ['init', '--bare'], { cwd: remote, encoding: 'utf8' });
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'user.email', 'test@example.com']);
  fs.writeFileSync(path.join(root, 'README.md'), 'root\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'init']);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '-u', 'origin', 'HEAD']);
  return {
    root,
    remote,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    },
  };
}

function run(cwd, args, env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env,
  });
}

function parse(result) {
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

describe('publish-approved-spec', () => {
  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('prepare fails dirty_tree on a dirty other branch', () => {
    const { root, env } = makeRepo();
    fs.writeFileSync(path.join(root, 'dirty.txt'), 'nope\n');
    const result = run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env);
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode: 'dirty_tree' });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
  });

  it('prepare checks out {N}-{slug} from a clean tree', () => {
    const { root, env } = makeRepo();
    const result = run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env);
    expect(result.status).toBe(0);
    expect(parse(result)).toEqual({ ok: true, branch: '42-add-x' });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('42-add-x');
  });

  it('commit-push stages only the spec dir with the exact subject and pushes HEAD', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    fs.writeFileSync(path.join(root, 'README.md'), 'changed\n');
    git(root, ['add', 'README.md']);
    const result = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).toBe(0);
    expect(parse(result)).toMatchObject({
      ok: true,
      branch: '42-add-x',
      pushed: true,
      skippedCommit: false,
    });
    expect(git(root, ['log', '-1', '--pretty=%s']).trim()).toBe('docs: approve spec for #42');
    const names = git(root, ['show', '--pretty=', '--name-only', 'HEAD']).trim().split('\n');
    expect(names.every((name) => name.startsWith('specs/42-add-x/'))).toBe(true);
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/42-add-x'])).toContain('specs/42-add-x/requirements.md');
    expect(git(root, ['diff', '--cached', '--name-only']).trim()).toBe('README.md');
  });

  it('commit-push rejects an unapproved package', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    fs.mkdirSync(path.join(root, 'specs', '42-add-x'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs', '42-add-x', 'requirements.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode: 'spec_not_approved' });
  });

  it('commit-push skips an identical tree and still pushes', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const first = git(root, ['rev-parse', 'HEAD']).trim();
    const second = run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(second.status).toBe(0);
    expect(parse(second)).toMatchObject({
      ok: true,
      skippedCommit: true,
      commit: null,
      pushed: true,
    });
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(first);
  });

  it('prepare cuts {N}-{slug} from origin/default without gh issue develop', () => {
    const { root, env } = makeRepo();
    const main = git(root, ['rev-parse', 'origin/main']).trim();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    expect(git(root, ['branch', '--show-current']).trim()).toBe('42-add-x');
    expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(main);
    expect(fs.readFileSync(path.join(root, '.gh-log'), 'utf8')).not.toContain('issue develop');
  });

  it('merge squash-merges a docs-only PR into the default branch without Closes', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).toBe(0);
    expect(parse(result)).toEqual({
      ok: true,
      branch: 'main',
      pr: 99,
      merged: true,
      squash: true,
      labeled: true,
    });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/main'])).toContain('specs/42-add-x/requirements.md');
    const log = fs.readFileSync(path.join(root, '.gh-log'), 'utf8');
    expect(log).toContain('pr create --base main --head 42-add-x --title docs: approve spec for #42');
    expect(log).not.toMatch(/Closes #42|Fixes #42|Resolves #42/i);
    expect(log).toMatch(/pr merge 99 --squash --delete-branch/);
    expect(log).toContain('issue edit 42 --add-label spec-created');
  });

  it('reports a post-merge label failure without undoing the merge', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    writeApproved(path.join(root, 'specs', '42-add-x'), 42);
    expect(run(root, ['commit-push', '--issue', '42', '--dir', 'specs/42-add-x'], env).status).toBe(0);

    const result = run(
      root,
      ['merge', '--issue', '42', '--dir', 'specs/42-add-x'],
      { ...env, FAIL_SPEC_LABEL: '1' },
    );

    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode: 'spec_created_label_failed' });
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main');
    expect(git(root, ['ls-tree', '-r', '--name-only', 'origin/main'])).toContain('specs/42-add-x/requirements.md');
  });


  it('merge rejects an unapproved package', () => {
    const { root, env } = makeRepo();
    expect(run(root, ['prepare', '--issue', '42', '--name', '42-add-x'], env).status).toBe(0);
    fs.mkdirSync(path.join(root, 'specs', '42-add-x'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs', '42-add-x', 'requirements.md'), '**Issue**: #42\n**Status**: Draft\n');
    const result = run(root, ['merge', '--issue', '42', '--dir', 'specs/42-add-x'], env);
    expect(result.status).not.toBe(0);
    expect(parse(result)).toMatchObject({ ok: false, reasonCode: 'spec_not_approved' });
  });
});
