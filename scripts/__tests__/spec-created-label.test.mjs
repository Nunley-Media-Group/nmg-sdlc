import { afterEach, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  SPEC_CREATED_LABEL,
  applySpecCreatedLabel,
  backfillSpecCreatedLabels,
  issueHasSpecCreatedLabel,
  listIssueOwnedSpecNumbers,
} from '../spec-created-label.mjs';

const roots = [];
const requiredFiles = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-created-label-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'specs'));
  return root;
}

function writePackage(root, issue, slug, options = {}) {
  const dir = path.join(root, 'specs', `${issue}-${slug}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of requiredFiles) {
    if (file === options.missing) continue;
    const declaredIssue = options.wrongIssue && file === 'design.md' ? issue + 1 : issue;
    fs.writeFileSync(path.join(dir, file), `**Issue**: #${declaredIssue}\n**Status**: Draft\n`);
  }
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('spec-created label detection', () => {
  test('accepts string and object labels with exact names', () => {
    expect(SPEC_CREATED_LABEL).toBe('spec-created');
    expect(issueHasSpecCreatedLabel({ labels: ['bug', 'spec-created'] })).toBe(true);
    expect(issueHasSpecCreatedLabel({ labels: [{ name: 'spec-created' }] })).toBe(true);
    expect(issueHasSpecCreatedLabel({ labels: [{ name: 'Spec-Created' }, { name: 'bug' }] })).toBe(false);
    expect(issueHasSpecCreatedLabel({})).toBe(false);
  });
});

describe('issue-owned spec discovery', () => {
  test('returns only unique complete packages with matching issue declarations', () => {
    const root = makeRoot();
    writePackage(root, 12, 'complete');
    writePackage(root, 13, 'missing', { missing: 'tasks.md' });
    writePackage(root, 14, 'wrong', { wrongIssue: true });
    writePackage(root, 15, 'first');
    writePackage(root, 15, 'second');

    expect(listIssueOwnedSpecNumbers(root)).toEqual([12]);
  });
});

describe('label mutation', () => {
  test('creates a missing repository label and adds without removing labels', () => {
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === 'label' && args[1] === 'list') return { status: 0, stdout: '[]', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    };

    applySpecCreatedLabel(42, run);

    expect(calls).toEqual([
      ['gh', 'label', 'list', '--limit', '100', '--json', 'name'],
      ['gh', 'label', 'create', 'spec-created', '--description', 'Has an nmg-sdlc spec package'],
      ['gh', 'issue', 'edit', '42', '--add-label', 'spec-created'],
    ]);
    expect(calls.flat()).not.toContain('--remove-label');
  });

  test('skips label creation when it already exists and repeated apply remains additive', () => {
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === 'label') return { status: 0, stdout: '[{"name":"spec-created"}]', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    };

    applySpecCreatedLabel(42, run);
    applySpecCreatedLabel(42, run);

    expect(calls.filter((call) => call[1] === 'label' && call[2] === 'create')).toEqual([]);
    expect(calls.filter((call) => call[1] === 'issue' && call[2] === 'edit')).toHaveLength(2);
    expect(calls.flat()).not.toContain('--remove-label');
  });

  test('rejects invalid issue numbers without invoking gh', () => {
    const run = () => { throw new Error('must not run'); };
    expect(() => applySpecCreatedLabel(0, run)).toThrow('positive safe integer');
  });
});

describe('backfill', () => {
  test('labels owned packages, records existing labels, and continues after failures', () => {
    const root = makeRoot();
    writePackage(root, 8, 'existing');
    writePackage(root, 12, 'new');
    writePackage(root, 15, 'failure');
    writePackage(root, 20, 'incomplete', { missing: 'feature.gherkin' });
    const edits = [];
    const run = (command, args) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        if (args[2] === '8') return { status: 0, stdout: '{"number":8,"labels":[{"name":"spec-created"}]}', stderr: '' };
        if (args[2] === '15') return { status: 1, stdout: '', stderr: 'unreadable' };
        return { status: 0, stdout: JSON.stringify({ number: Number(args[2]), labels: [] }), stderr: '' };
      }
      if (args[0] === 'label' && args[1] === 'list') {
        return { status: 0, stdout: '[{"name":"spec-created"}]', stderr: '' };
      }
      if (args[0] === 'issue' && args[1] === 'edit') edits.push(Number(args[2]));
      return { status: 0, stdout: '', stderr: '' };
    };

    const result = backfillSpecCreatedLabels(root, run);

    expect(result).toMatchObject({ ok: false, labeled: [12], already: [8], skipped: [] });
    expect(result.failed).toEqual([{ issue: 15, message: 'Unable to read issue #15' }]);
    expect(edits).toEqual([12]);
  });

  test('runs every GitHub operation from the requested repository root', () => {
    const root = makeRoot();
    writePackage(root, 12, 'new');
    const calls = [];
    const run = (command, args, options) => {
      calls.push([command, args, options]);
      if (args[0] === 'issue' && args[1] === 'view') {
        return { status: 0, stdout: '{"number":12,"labels":[]}', stderr: '' };
      }
      if (args[0] === 'label' && args[1] === 'list') {
        return { status: 0, stdout: '[{"name":"spec-created"}]', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };

    expect(path.resolve(root)).not.toBe(process.cwd());
    expect(backfillSpecCreatedLabels(root, run)).toMatchObject({ ok: true, labeled: [12] });
    expect(calls).toHaveLength(3);
    expect(calls.every(([, , options]) => options?.cwd === path.resolve(root))).toBe(true);
  });
});
