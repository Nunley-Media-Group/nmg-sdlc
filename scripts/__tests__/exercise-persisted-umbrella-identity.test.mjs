/**
 * Deterministic fresh-session lifecycle exercise for issue #160.
 *
 * Each phase receives a fresh JSON copy of the same GitHub-shaped records so
 * no result can depend on an in-memory parent number from an earlier phase.
 */

import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyEpicRelationships } from '../epic-relationships.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function labels(...names) {
  return { nodes: names.map((name) => ({ name })) };
}

function fixture() {
  const parent = {
    number: 108,
    state: 'OPEN',
    labels: labels('epic', 'enhancement'),
    body: '## Child Issues\n\n- [ ] #122\n- [ ] #123',
    subIssues: { nodes: [{ number: 122 }, { number: 123 }, { number: 124 }] },
  };
  return [
    parent,
    {
      number: 122,
      state: 'OPEN',
      labels: labels('enhancement', 'epic-child-of-108'),
      body: 'Depends on: #108',
      parent,
      subIssues: { nodes: [] },
    },
    {
      number: 123,
      state: 'OPEN',
      labels: labels('enhancement', 'epic-child-of-108'),
      body: 'Depends on: #108\nDepends on: #122',
      parent,
      subIssues: { nodes: [] },
    },
    {
      number: 124,
      state: 'OPEN',
      labels: labels('enhancement', 'epic-child-of-108'),
      body: 'Depends on: #108\nDepends on: #122',
      parent,
      subIssues: { nodes: [] },
    },
  ];
}

function freshClassify(activeIssueNumber, mutate = () => {}) {
  const records = structuredClone(fixture());
  mutate(records);
  return classifyEpicRelationships({ issues: records, activeIssueNumber });
}

describe('exercise: persisted umbrella identity across fresh lifecycle sessions', () => {
  test('planning through PR preparation reconstructs one durable parent independently', () => {
    const phases = ['planning', 'start', 'spec', 'code', 'verify', 'status', 'pr-preparation'];
    const results = phases.map(() => freshClassify(122));

    for (const result of results) {
      expect(result).toMatchObject({
        role: 'epic-child',
        parentNumber: 108,
        identity: 'durable',
        consistency: 'consistent',
        nativeAuthority: 'native',
        degraded: true,
        executionDependencies: [],
        siblingNumbers: [123, 124],
        siblingReconciliation: {
          authority: 'native',
          nativeOnly: [124],
          checklistOnly: [],
        },
      });
      expect(result.gaps).toContain('parent #108 checklist omits native children: #124');
    }
    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1);
  });

  test('a sibling dependency blocks until its deliverable closes while the epic never blocks', () => {
    const before = freshClassify(123);
    expect(before).toMatchObject({ role: 'epic-child', parentNumber: 108, identity: 'durable' });
    expect(before.executionDependencies).toEqual([expect.objectContaining({
      issueNumber: 122,
      state: 'OPEN',
      blocking: true,
    })]);

    const after = freshClassify(123, (records) => {
      records.find((record) => record.number === 122).state = 'CLOSED';
    });
    expect(after.executionDependencies).toEqual([expect.objectContaining({
      issueNumber: 122,
      state: 'CLOSED',
      blocking: false,
    })]);
    expect(after.executionDependencies.some((dependency) => dependency.issueNumber === 108)).toBe(false);
  });

  test('canonical child contract uses exact pair publication before executable handoff', () => {
    const writeSpec = fs.readFileSync(path.join(repoRoot, 'skills/write-spec/SKILL.md'), 'utf8');
    const result = freshClassify(122);
    expect(result).toMatchObject({ role: 'epic-child', identity: 'durable', parentNumber: 108 });
    expect(writeSpec).toContain('### Aggregate + Active-Child Publication');
    expect(writeSpec).toContain('it never starts or closes the epic or child');
    expect(writeSpec).toContain('The successful handoff names only the active child package');
    expect(writeSpec).toContain('`$nmg-sdlc:write-code #C`');
  });
});
