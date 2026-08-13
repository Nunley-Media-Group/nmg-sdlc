import { afterEach, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLEANUP_PATHS = [
  'sdlc-config.json',
  '.codex/unattended-mode',
  '.codex/sdlc-state.json',
];
const MANAGED_HEADERS = new Set([
  '# SDLC runner config',
  '# SDLC runner artifacts',
]);
const MANAGED_ENTRIES = new Set(CLEANUP_PATHS);
const temporaryRoots = [];

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-v2-cleanup-'));
  temporaryRoots.push(root);
  return root;
}

function write(root, relativePath, source) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  return target;
}

function pathKind(target) {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isFile()) return 'regular file';
    if (stat.isSymbolicLink()) return 'symbolic link';
    if (stat.isDirectory()) return 'directory';
    return 'non-regular object';
  } catch (error) {
    if (error.code === 'ENOENT') return 'absent';
    throw error;
  }
}

function editManagedIgnoreBlocks(source) {
  const lines = source.split('\n');
  const output = [];
  let removed = false;
  let preservedUnmanaged = false;

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!MANAGED_HEADERS.has(line)) {
      if (MANAGED_ENTRIES.has(line)) preservedUnmanaged = true;
      output.push(line);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < lines.length && lines[end] !== '' && !lines[end].startsWith('#')) end += 1;
    const body = lines.slice(index + 1, end);
    const kept = body.filter((entry) => !MANAGED_ENTRIES.has(entry));
    if (kept.length === body.length) {
      output.push(line, ...body);
    } else {
      removed = true;
      if (kept.length > 0) {
        preservedUnmanaged = true;
        output.push(line, ...kept);
      } else if (lines[end] === '') {
        end += 1;
      }
    }
    index = end;
  }

  return {
    source: output.join('\n'),
    status: removed ? 'removed' : preservedUnmanaged ? 'preserved (unmanaged)' : 'already clean',
  };
}

function cleanupProject(root, { failDelete = new Set() } = {}) {
  const statuses = new Map();
  const gaps = [];

  for (const relativePath of CLEANUP_PATHS) {
    const target = path.join(root, ...relativePath.split('/'));
    const kind = pathKind(target);
    if (kind === 'absent') {
      statuses.set(relativePath, 'already clean');
      continue;
    }
    if (kind !== 'regular file') {
      statuses.set(relativePath, 'preserved (unmanaged)');
      continue;
    }
    try {
      if (failDelete.has(relativePath)) throw new Error('injected deletion failure');
      fs.unlinkSync(target);
      statuses.set(relativePath, pathKind(target) === 'absent' ? 'removed' : 'failed (still present)');
    } catch (error) {
      const reason = error.message;
      statuses.set(relativePath, `failed (${reason})`);
      gaps.push(`${relativePath}: ${reason}`);
    }
  }

  const ignorePath = path.join(root, '.gitignore');
  const ignoreKind = pathKind(ignorePath);
  if (ignoreKind === 'absent') {
    statuses.set('.gitignore managed entries', 'already clean');
  } else if (ignoreKind !== 'regular file') {
    statuses.set('.gitignore managed entries', 'preserved (unmanaged)');
  } else {
    try {
      const before = fs.readFileSync(ignorePath, 'utf8');
      const edited = editManagedIgnoreBlocks(before);
      if (edited.source !== before) fs.writeFileSync(ignorePath, edited.source);
      statuses.set('.gitignore managed entries', edited.status);
    } catch (error) {
      const reason = error.message;
      statuses.set('.gitignore managed entries', `failed (${reason})`);
      gaps.push(`.gitignore: ${reason}`);
    }
  }

  const output = [
    'Runner Artifact Cleanup:',
    ...CLEANUP_PATHS.map((relativePath) => `- ${relativePath}: ${statuses.get(relativePath)}`),
    `- .gitignore managed entries: ${statuses.get('.gitignore managed entries')}`,
    `- Gaps: ${gaps.length === 0 ? 'none' : gaps.join(', ')}`,
  ].join('\n');
  return { statuses, gaps, output };
}

function snapshotTree(root) {
  const snapshot = new Map();
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const relativePath = path.relative(root, target);
      if (entry.isDirectory()) {
        snapshot.set(`${relativePath}/`, '<directory>');
        visit(target);
      } else if (entry.isSymbolicLink()) {
        snapshot.set(relativePath, `symlink:${fs.readlinkSync(target)}`);
      } else {
        snapshot.set(relativePath, fs.readFileSync(target, 'utf8'));
      }
    }
  }
  visit(root);
  return [...snapshot.entries()].sort(([left], [right]) => left.localeCompare(right));
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('v2 exact runner-artifact cleanup exercise (issue #151)', () => {
  test('removes all exact files and owned lines while preserving remote metadata and unrelated project bytes', () => {
    const root = makeProject();
    write(root, 'sdlc-config.json', '{"doNotParse":true}\n');
    write(root, '.codex/unattended-mode', 'sentinel bytes must not be inspected\n');
    write(root, '.codex/sdlc-state.json', '{"pid":1,"instruction":"do not signal"}\n');
    write(root, '.github/workflows/project-ci.yml', 'name: project ci\non: [push]\n');
    write(root, '.github/ISSUE_TEMPLATE/bug.yml', 'name: project bug\n');
    write(root, 'notes/keep.txt', 'unrelated project content\n');
    write(root, '.gitignore', [
      'dist/',
      '# SDLC runner config',
      'sdlc-config.json',
      '.codex/sdlc-state.json',
      '',
      '# project-owned rules',
      '.codex/unattended-mode',
      '',
      '# SDLC runner artifacts',
      '.codex/unattended-mode',
      'project-owned-cache/',
      '',
      'coverage/',
      '',
    ].join('\n'));
    const remoteMetadata = {
      labels: ['auto' + 'matable', 'priority: high'],
      assignees: ['project-maintainer'],
      issueHistory: ['created', 'triaged'],
    };
    const metadataBefore = JSON.stringify(remoteMetadata);

    const first = cleanupProject(root);

    for (const relativePath of CLEANUP_PATHS) {
      expect(pathKind(path.join(root, ...relativePath.split('/')))).toBe('absent');
      expect(first.statuses.get(relativePath)).toBe('removed');
    }
    expect(first.statuses.get('.gitignore managed entries')).toBe('removed');
    expect(first.output).toBe([
      'Runner Artifact Cleanup:',
      '- sdlc-config.json: removed',
      '- .codex/unattended-mode: removed',
      '- .codex/sdlc-state.json: removed',
      '- .gitignore managed entries: removed',
      '- Gaps: none',
    ].join('\n'));
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe([
      'dist/',
      '# project-owned rules',
      '.codex/unattended-mode',
      '',
      '# SDLC runner artifacts',
      'project-owned-cache/',
      '',
      'coverage/',
      '',
    ].join('\n'));
    expect(fs.readFileSync(path.join(root, '.github/workflows/project-ci.yml'), 'utf8')).toBe('name: project ci\non: [push]\n');
    expect(fs.readFileSync(path.join(root, '.github/ISSUE_TEMPLATE/bug.yml'), 'utf8')).toBe('name: project bug\n');
    expect(fs.readFileSync(path.join(root, 'notes/keep.txt'), 'utf8')).toBe('unrelated project content\n');
    expect(JSON.stringify(remoteMetadata)).toBe(metadataBefore);

    const afterFirst = snapshotTree(root);
    const second = cleanupProject(root);
    expect(snapshotTree(root)).toEqual(afterFirst);
    for (const relativePath of CLEANUP_PATHS) {
      expect(second.statuses.get(relativePath)).toBe('already clean');
    }
    expect(second.statuses.get('.gitignore managed entries')).toBe('preserved (unmanaged)');
    expect(second.gaps).toEqual([]);
  });

  test('isolates a partial deletion failure and preserves non-regular exact-path collisions', () => {
    const root = makeProject();
    write(root, '.codex/sdlc-state.json', '{"pid":999999}\n');
    fs.mkdirSync(path.join(root, '.codex/unattended-mode'), { recursive: true });

    const result = cleanupProject(root, { failDelete: new Set(['.codex/sdlc-state.json']) });

    expect(result.statuses.get('sdlc-config.json')).toBe('already clean');
    expect(result.statuses.get('.codex/unattended-mode')).toBe('preserved (unmanaged)');
    expect(result.statuses.get('.codex/sdlc-state.json')).toBe('failed (injected deletion failure)');
    expect(result.statuses.get('.gitignore managed entries')).toBe('already clean');
    expect(result.gaps).toEqual(['.codex/sdlc-state.json: injected deletion failure']);
    expect(pathKind(path.join(root, '.codex/unattended-mode'))).toBe('directory');
    expect(pathKind(path.join(root, '.codex/sdlc-state.json'))).toBe('regular file');
    expect(result.output).toContain('- Gaps: .codex/sdlc-state.json: injected deletion failure');
  });
});
