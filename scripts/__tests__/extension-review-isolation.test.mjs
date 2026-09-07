import { afterEach, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installReviewIsolation, inspectReviewReceipts } from '../../src/sdlc-review-isolation.mjs';

const roots = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-review-'));
  roots.push(root);
  const snapshotDir = path.join(root, 'snapshot');
  fs.mkdirSync(snapshotDir);
  fs.writeFileSync(path.join(snapshotDir, 'allowed.txt'), 'control');
  const assignmentPath = path.join(root, 'assignment.json');
  const receiptPath = path.join(root, 'access.jsonl');
  fs.writeFileSync(assignmentPath, JSON.stringify({ issue: 42, step: 'review2', sliceId: 'reviewer-1', runId: 'owner', invocationId: 'invocation', baseSha: 'base', headSha: 'head', specDigest: 'digest', allowedPaths: ['allowed.txt'], snapshotDir }));
  const env = { NMG_SDLC_REVIEW_SLICE: '1', NMG_SDLC_REVIEW_ASSIGNMENT: assignmentPath, NMG_SDLC_REVIEW_RECEIPT: receiptPath };
  return { root, snapshotDir, assignmentPath, receiptPath, env };
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

test('ordinary sessions keep their existing tools and register no restriction hooks', () => {
  const calls = [];
  installReviewIsolation({ on: (...args) => calls.push(args), setActiveTools: () => calls.push('activation') }, { env: {} });
  expect(calls).toEqual([]);
});

test('deny-all handlers precede asynchronous activation, then allow only receipted snapshot reads', async () => {
  const { root, snapshotDir, env, assignmentPath, receiptPath } = fixture();
  const handlers = new Map();
  let release;
  let activeTools = ['bash'];
  let activationStarted = false;
  const pi = {
    on: (event, handler) => handlers.set(event, handler),
    setActiveTools: async (tools) => {
      activationStarted = true;
      expect(handlers.has('tool_call')).toBe(true);
      expect(handlers.has('user_bash')).toBe(true);
      expect(handlers.has('user_python')).toBe(true);
      await new Promise((resolve) => { release = resolve; });
      activeTools = tools;
    },
    getActiveTools: () => activeTools,
  };
  installReviewIsolation(pi, { env });
  expect(activationStarted).toBe(false);
  const arming = handlers.get('session_start')();
  expect(handlers.get('tool_call')({ toolName: 'read', input: { path: 'allowed.txt' } }).block).toBe(true);
  release();
  await arming;
  const before = fs.readFileSync(receiptPath, 'utf8');
  for (const toolName of ['bash', 'eval', 'python', 'task', 'write', 'edit', 'grep', 'glob', 'web_search']) {
    expect(handlers.get('tool_call')({ toolName, input: {} }).block).toBe(true);
  }
  for (const event of ['user_bash', 'user_python']) expect(handlers.get(event)({ command: 'false', code: 'raise Exception()' }).result.exitCode).toBe(1);
  expect(handlers.get('tool_call')({ toolName: 'read', input: { path: 'allowed.txt' } }, { cwd: root }).block).toBe(true);
  expect(handlers.get('tool_call')({ toolName: 'read', input: { path: 'allowed.txt' } }, { cwd: snapshotDir })).toBeUndefined();
  handlers.get('message_end')({ message: {
    role: 'toolResult', stopReason: 'stop', content: [{ type: 'text', text: 'No findings.' }],
  } });
  expect(inspectReviewReceipts(assignmentPath, receiptPath).resultText).toBeUndefined();
  handlers.get('message_end')({ message: {
    role: 'assistant', stopReason: 'toolUse', content: [{ type: 'text', text: 'Unfinished review' }],
  } });
  expect(inspectReviewReceipts(assignmentPath, receiptPath).resultText).toBeUndefined();
  handlers.get('message_end')({ message: {
    role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Completed review findings' }],
  } });
  expect(inspectReviewReceipts(assignmentPath, receiptPath).resultText).toBe('Completed review findings');
  expect(fs.readFileSync(receiptPath, 'utf8').startsWith(before)).toBe(true);
  expect(inspectReviewReceipts(assignmentPath, receiptPath)).toMatchObject({ valid: true, contaminated: false });
});

test('missing active-tool proof never arms and receipt loss blocks a formerly allowed read', async () => {
  const { snapshotDir, env, receiptPath } = fixture();
  const handlers = new Map();
  installReviewIsolation({ on: (event, handler) => handlers.set(event, handler), setActiveTools: async () => {} }, { env });
  await handlers.get('session_start')();
  expect(handlers.get('tool_call')({ toolName: 'read', input: { path: 'allowed.txt' } }).block).toBe(true);
  const second = new Map();
  installReviewIsolation({ on: (event, handler) => second.set(event, handler), setActiveTools: async () => {}, getActiveTools: () => ['read'] }, { env });
  await second.get('session_start')();
  fs.unlinkSync(receiptPath);
  fs.mkdirSync(receiptPath);
  let blocked = false;
  try { blocked = second.get('tool_call')({ toolName: 'read', input: { path: 'allowed.txt' } }, { cwd: snapshotDir })?.block === true; } catch { blocked = true; }
  expect(blocked).toBe(true);
});
