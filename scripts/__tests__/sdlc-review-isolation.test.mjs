import { afterEach, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isAllowedSnapshotRead, loadReviewAssignment, inspectReviewReceipts, installReviewIsolation } from '../../src/sdlc-review-isolation.mjs';

const roots = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-isolation-'));
  roots.push(root);
  const snapshotDir = path.join(root, 'snapshot');
  fs.mkdirSync(snapshotDir);
  fs.writeFileSync(path.join(snapshotDir, 'allowed.txt'), 'snapshot\n');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'outside\n');
  const assignment = { issue: 42, step: 'review1', sliceId: 'reviewer-1', runId: 'owner', invocationId: 'invocation', baseSha: 'base', headSha: 'head', specDigest: 'digest', snapshotDir, allowedPaths: ['allowed.txt'] };
  const assignmentPath = path.join(root, 'assignment.json');
  const receiptPath = path.join(root, 'access.jsonl');
  fs.writeFileSync(assignmentPath, JSON.stringify(assignment));
  return { root, assignment, assignmentPath, receiptPath };
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

test('snapshot read allows exact files and supported selectors, never expanded authority', () => {
  const { root, assignment } = fixture();
  for (const selector of ['', ':raw', ':50', ':50-100', ':50-', ':50+10', ':5-16,20-30', ':raw:50-100', ':50-100:raw']) {
    expect(isAllowedSnapshotRead(path.join(assignment.snapshotDir, `allowed.txt${selector}`), assignment).allowed).toBe(true);
    expect(isAllowedSnapshotRead(`allowed.txt${selector}`, assignment).allowed).toBe(true);
  }
  fs.symlinkSync(path.join(root, 'secret.txt'), path.join(assignment.snapshotDir, 'escape'));
  const denied = [path.join(root, 'secret.txt'), '../secret.txt', './x/../allowed.txt', 'escape', 'unassigned.txt', 'https://example.com', 'skill://secret', 'artifact://secret', 'local://secret', 'ssh://host/secret', 'allowed.txt:member/file', 'archive.zip:member', 'allowed.txt!member', 'allowed.txt:q', 'allowed.txt:raw:50junk', 'allowed.txt:50junk:raw', 'allowed.txt?q=secret', 'allowed.txt#fragment'];
  for (const requested of denied) expect(isAllowedSnapshotRead(requested, assignment).allowed).toBe(false);
});

test('malformed assignment cannot establish authority', () => {
  const { assignmentPath, assignment } = fixture();
  for (const invalid of [{ ...assignment, issue: 1.5 }, { ...assignment, invocationId: '' }, { ...assignment, allowedPaths: ['../secret'] }]) {
    fs.writeFileSync(assignmentPath, JSON.stringify(invalid));
    expect(loadReviewAssignment(assignmentPath).assignment).toBeNull();
  }
});

test('receipts require complete invocation-bound host proof and preserve blocked attempts', async () => {
  const { assignmentPath, receiptPath } = fixture();
  const handlers = new Map();
  let tools = [];
  installReviewIsolation({ on: (event, fn) => handlers.set(event, fn), setActiveTools: async (names) => { tools = names; }, getActiveTools: () => tools }, { env: { NMG_SDLC_REVIEW_SLICE: '1', NMG_SDLC_REVIEW_ASSIGNMENT: assignmentPath, NMG_SDLC_REVIEW_RECEIPT: receiptPath } });
  await handlers.get('session_start')();
  expect(handlers.get('tool_call')({ toolName: 'bash', input: { command: 'false' } }).block).toBe(true);
  expect(inspectReviewReceipts(assignmentPath, receiptPath)).toMatchObject({ valid: true, contaminated: false });
  const bytes = fs.readFileSync(receiptPath, 'utf8');
  fs.appendFileSync(receiptPath, '{broken\n');
  expect(inspectReviewReceipts(assignmentPath, receiptPath).reasonCode).toBe('review_scope_unproven');
  expect(fs.readFileSync(receiptPath, 'utf8').startsWith(bytes)).toBe(true);
});
