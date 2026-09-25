#!/usr/bin/env node

/**
 * Approved publication scope and exact-commit remote reconciliation.
 * Runtime checkpoint and historical recovery files never grant or veto work.
 */

import { spawnSync } from 'node:child_process';
import { isCliEntry } from './plugin-controller-path.mjs';
import { enterControllerLease, releaseControllerLease } from './sdlc-controller-lease.mjs';
import { inspectIssueSpecScope } from './issue-spec-scope.mjs';
import { parseIssueBranch } from './sdlc-status.mjs';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';


function commandSucceeded(result) {
  return result && !result.error && result.status === 0;
}

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function safeError(reasonCode, details = {}) {
  return Object.assign(new Error(reasonCode), { reasonCode, ...details });
}


function porcelainEntries(output) {
  const text = String(output ?? '');
  if (!text) return [];
  if (!text.endsWith('\0')) throw safeError('publication_state_unreadable');
  const records = text.slice(0, -1).split('\0');
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!/^(?:[ MADRCUT]{2}|\?\?|!!) /.test(record) || record.startsWith('   ')) {
      throw safeError('publication_state_unreadable');
    }
    const status = record.slice(0, 2);
    const paths = [record.slice(3)];
    if (!paths[0] || isAbsolute(paths[0]) || paths[0].split('/').includes('..')) {
      throw safeError('publication_state_unreadable');
    }
    if (status.includes('R') || status.includes('C')) {
      const source = records[++index];
      if (!source || isAbsolute(source) || source.split('/').includes('..')) {
        throw safeError('publication_state_unreadable');
      }
      paths.push(source);
    }
    entries.push({ status, paths });
  }
  return entries;
}

function nonRuntimePath(path) {
  return path !== '.omp' && !path.startsWith('.omp/');
}

function porcelainPaths(output) {
  return porcelainEntries(output).flatMap(({ paths }) => paths.filter(nonRuntimePath));
}

function hasStagedNonRuntimeEntry(output) {
  return porcelainEntries(output).some(({ status, paths }) =>
    /[MADRCUT]/.test(status[0]) && paths.some(nonRuntimePath));
}

function getExpectedSubject(step, issue) {
  if (step === 'verify') return `docs: record verification for #${issue}`;
  if (step === 'deliver') return `docs: record PR evidence for #${issue}`;
  // implement: caller supplies conventional subject
  return null;
}

function validImplementationSubject(subject, issue) {
  return typeof subject === 'string'
    && subject === subject.trim()
    && !/[\r\n]/.test(subject)
    && /^(feat|fix|docs|chore)(\([^)]+\))?!?: [^\r\n]+$/.test(subject)
    && new RegExp(`#${issue}(?!\\d)`).test(subject);
}


export function resolveRecoveryOwner({
  cwd = process.cwd(), issue, step, branch: expectedBranch, run = defaultRun,
} = {}) {
  if (!Number.isSafeInteger(Number(issue)) || Number(issue) <= 0
    || !['implement', 'verify', 'deliver'].includes(step)) {
    throw safeError('invalid_recovery_params');
  }
  const root = realpathSync(cwd);
  const observed = run('git', ['branch', '--show-current'], { cwd: root });
  const branch = String(observed?.stdout ?? '').trim();
  if (!commandSucceeded(observed) || parseIssueBranch(branch)?.issueNumber !== Number(issue)
    || (expectedBranch !== undefined && expectedBranch !== branch)) {
    throw safeError('publication_branch_mismatch');
  }
  return `${Number(issue)}:${branch}:${step}`;
}


export function assertInitialStagePublication({ cwd = process.cwd(), ownerId, issue, step, run = defaultRun } = {}) {
  const branch = run('git', ['branch', '--show-current'], { cwd });
  if (!commandSucceeded(branch) || parseIssueBranch(String(branch.stdout ?? '').trim())?.issueNumber !== Number(issue)) {
    throw safeError('publication_branch_mismatch');
  }
  const upstream = run('git', ['rev-parse', '--verify', '@{u}'], { cwd });
  if (commandSucceeded(upstream)) {
    const divergence = run('git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'], { cwd });
    if (!commandSucceeded(divergence) || !/^0\s+0$/.test(String(divergence.stdout ?? '').trim())) {
      throw safeError('publication_dirty_partial');
    }
  }
}

export function reconcileStagePublication({
  cwd = process.cwd(), issue, step, spec, expectedSubject, allowedPaths = [], ownerId, run = defaultRun,
} = {}) {
  const issueNumber = Number(issue);
  const outcomePolicy = step === 'implement';
  const readOnlyPaths = outcomePolicy && new RegExp(`^specs/${issueNumber}-[^/\\\\]+$`).test(spec ?? '')
    ? SPEC_INPUT_FILES.map((file) => `${spec}/${file}`)
    : [];
  const observedAllowedPaths = Array.isArray(allowedPaths) ? [...new Set(allowedPaths)].sort() : [];
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0
    || !['implement', 'verify', 'deliver'].includes(step)
    || typeof expectedSubject !== 'string' || !expectedSubject.trim()
    || !Array.isArray(allowedPaths) || allowedPaths.length === 0
    || !allowedPaths.every(validPublicationPath)
    || (outcomePolicy && (!readOnlyPaths.length
      || allowedPaths.some((file) => publicationPathDenied(file, { spec, readOnlyPaths }))))) {
    throw safeError('invalid_reconcile_params');
  }
  const root = realpathSync(cwd);
  const reasonCode = step === 'verify' ? 'verification_publish_failed'
    : step === 'implement' ? 'implementation_failed' : 'delivery_publish_failed';
  const fail = (summary) => ({ passed: false, reasonCode, summary });
  const git = (args) => {
    const result = run('git', args, { cwd: root });
    if (!commandSucceeded(result)) throw safeError(reasonCode);
    return String(result.stdout ?? '');
  };
  try {
    const branch = git(['branch', '--show-current']).trim();
    if (parseIssueBranch(branch)?.issueNumber !== issueNumber) return fail(`Branch does not belong to #${issueNumber}`);
    if (porcelainPaths(git(['status', '--porcelain=v1', '-z'])).length) {
      return fail('Publication recovery requires a clean non-runtime worktree');
    }
    const remote = git(['config', '--get', `branch.${branch}.remote`]).trim();
    const mergeRef = git(['config', '--get', `branch.${branch}.merge`]).trim();
    if (!remote || remote === '.' || remote.startsWith('-') || mergeRef !== `refs/heads/${branch}`) {
      return fail('Publication upstream does not identify the issue branch');
    }
    const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim();
    if (upstream !== `${remote}/${branch}`) return fail('Publication upstream identity mismatch');
    git(['fetch', '--no-tags', remote, mergeRef]);
    const remoteHead = git(['rev-parse', 'FETCH_HEAD']).trim();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(remoteHead)
      || remoteHead !== git(['rev-parse', '@{u}']).trim()) return fail('Publication upstream observation is inconsistent');
    const head = git(['rev-parse', 'HEAD']).trim();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(head)) return fail('Publication HEAD is unreadable');
    const countText = git(['rev-list', '--left-right', '--count', '@{u}...HEAD']).trim();
    if (!/^\d+\s+\d+$/.test(countText)) return fail('Publication divergence is unreadable');
    const counts = countText.split(/\s+/).map(Number);
    if (counts.length !== 2 || counts.some((n) => !Number.isSafeInteger(n) || n < 0) || counts[0] !== 0) {
      return fail('Publication branch is divergent or behind');
    }
    if ((counts[1] === 0) !== (remoteHead === head)) return fail('Publication divergence contradicts exact upstream identity');
    // Live exact-head remote evidence, not an old allowance, decides whether to push.
    const commits = counts[1] === 0 ? [head] : git(['rev-list', '@{u}..HEAD']).trim().split('\n');
    if (commits.length !== (counts[1] || 1) || !commits.includes(head)) return fail('Publication commits are unreadable');
    const observedCommitPaths = new Set();
    for (const sha of commits) {
      if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha) || git(['log', '-1', '--format=%s', sha]).trim() !== expectedSubject) {
        return fail('Publication commit subject is not the expected stage subject');
      }
      // Reject merge commits: an empty default diff-tree is not scope proof.
      const parents = git(['rev-list', '--parents', '-n', '1', sha]).trim().split(/\s+/);
      if (parents.length !== 2 || parents[0] !== sha
        || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(parents[1]) || parents[1].length !== sha.length) {
        return fail('Publication commit is not a proven single-parent stage commit');
      }
      const names = git(['diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', sha]);
      if (!names.endsWith('\0')) return fail('Publication changed-path observation is incomplete');
      const paths = names.slice(0, -1).split('\0');
      if (!paths.length || paths.some((file) => !allowedPaths.includes(file)
        || (outcomePolicy && publicationPathDenied(file, { spec, readOnlyPaths })))) {
        return fail('Publication commit exceeds approved scope');
      }
      for (const file of paths) observedCommitPaths.add(file);
    }
    if (JSON.stringify([...observedCommitPaths].sort()) !== JSON.stringify(observedAllowedPaths)) {
      return fail('Publication commit exceeds approved scope');
    }
    if (counts[1] === 0 && remoteHead === head) return { passed: true, ack: true };
    git(['push', remote, `HEAD:${mergeRef}`]);
    git(['fetch', '--no-tags', remote, mergeRef]);
    if (git(['rev-parse', 'FETCH_HEAD']).trim() !== head
      || git(['rev-parse', '@{u}']).trim() !== head
      || git(['rev-parse', 'HEAD']).trim() !== head
      || porcelainPaths(git(['status', '--porcelain=v1', '-z'])).length) {
      return fail('Publication exact-head postcondition failed');
    }
    return { passed: true, pushed: true };
  } catch (error) {
    return fail(`Publication stopped for #${issueNumber}: ${error.reasonCode ?? error.message}`);
  }
}

function validPublicationPath(file) {
  const firstGlob = typeof file === 'string' ? file.search(/[*?\[]/) : -1;
  return typeof file === 'string' && file.length > 0 && !isAbsolute(file)
    && !file.includes('\\') && !file.includes('\0') && !/^[!:^]/.test(file)
    && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(file)
    && !file.split('/').some((part) => part === '..' || part === '.')
    && file !== '.omp' && !file.startsWith('.omp/')
    && (firstGlob < 0 || (firstGlob > 0 && /[A-Za-z0-9_-]/.test(file.slice(0, firstGlob))));
}

export function publicationPathDenied(file, { spec, readOnlyPaths = [] } = {}) {
  const verificationReport = typeof spec === 'string' ? `${spec}/verification-report.md` : null;
  return !Array.isArray(readOnlyPaths)
    || !validPublicationPath(file)
    || readOnlyPaths.includes(file)
    || ((file === 'specs' || file.startsWith('specs/')) && file !== verificationReport);
}

export const PUBLICATION_FILE_SYNTAX = 'Each admitted task must contain exactly one canonical `**File(s)**:` declaration using repository-relative paths as `path`, comma/semicolon-separated lists, or bounded directory/glob entries; parenthetical notes must be an exact supported operation or documented non-operation note.';

function publicationFileDeclarations(value) {
  const declarations = [];
  let pathText = '';
  let notes = '';
  let parentheses = 0;
  let quoted = false;
  const finish = () => {
    // Parse the whole declaration, never mine paths from surrounding prose.
    const match = /^(?:plus new\s+)?(?:`([^`]+)`|([^\s`(),;]+))$/.exec(pathText.trim());
    const declared = match?.[1] ?? match?.[2];
    if (!declared || !validPublicationPath(declared)
      || (!match[1] && !/[/.]/.test(declared) && !/^[A-Z][A-Z0-9_-]*$/.test(declared))) {
      throw safeError('publication_scope_unproven');
    }
    declarations.push({ path: declared, note: notes.trim() });
    pathText = '';
    notes = '';
  };
  for (const character of value) {
    if (character === '`') quoted = !quoted;
    if (!quoted && character === '(') {
      parentheses += 1;
      pathText += parentheses === 1 ? ' ' : '';
    } else if (!quoted && character === ')') {
      if (--parentheses < 0) throw safeError('publication_scope_unproven');
    } else if (!quoted && parentheses === 0 && /[,;]/.test(character)) {
      finish();
    } else if (parentheses > 0) notes += character;
    else pathText += character;
  }
  if (quoted || parentheses !== 0) throw safeError('publication_scope_unproven');
  finish();
  return declarations;
}

function isDeliveryOwnerOnly(note) {
  return note.trim().toLowerCase().replace(/[\s-]+/g, ' ') === 'delivery owner only';
}

export function publicationFileEntries(value) {
  const entries = [];
  for (const { path, note } of publicationFileDeclarations(value)) {
    if (isDeliveryOwnerOnly(note)) continue;
    pathAnnotationOperation(note);
    entries.push(path);
  }
  return entries;
}

function markdownFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { marker: match[1][0], length: match[1].length };
}

function closesMarkdownFence(line, fence) {
  const match = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
  return !!match && match[1][0] === fence.marker && match[1].length >= fence.length;
}

function codeSpanSourceLines(lines) {
  const visibleLines = [];
  let fence = null;
  let inComment = false;
  for (const sourceLine of lines) {
    if (fence) {
      if (closesMarkdownFence(sourceLine, fence)) fence = null;
      visibleLines.push(' '.repeat(sourceLine.length));
      continue;
    }
    const chars = sourceLine.split('');
    let offset = 0;
    while (offset < sourceLine.length) {
      if (inComment) {
        const end = sourceLine.indexOf('-->', offset);
        const limit = end === -1 ? sourceLine.length : end + 3;
        chars.fill(' ', offset, limit);
        offset = limit;
        if (end === -1) break;
        inComment = false;
        continue;
      }
      const start = sourceLine.indexOf('<!--', offset);
      if (start === -1) break;
      chars.fill(' ', start, start + 4);
      inComment = true;
      offset = start + 4;
    }
    const visible = chars.join('');
    fence = markdownFence(visible);
    visibleLines.push(fence ? ' '.repeat(sourceLine.length) : visible);
  }
  return visibleLines;
}


function escapedBacktick(line, offset) {
  let backslashes = 0;
  for (let index = offset - 1; index >= 0 && line[index] === '\\'; index -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function codeSpanDelimiters(lines) {
  const roles = new Map();
  const remaining = [];
  const key = (line, offset) => `${line}:${offset}`;
  for (const [lineIndex, line] of lines.entries()) {
    const runs = [];
    for (let offset = 0; offset < line.length;) {
      if (line[offset] !== '`') {
        offset += 1;
        continue;
      }
      const delimiter = /^`+/.exec(line.slice(offset))[0];
      if (!escapedBacktick(line, offset)) runs.push({ line: lineIndex, offset, length: delimiter.length });
      offset += delimiter.length;
    }
    if (!/^\*\*[^*]+\*\*:/.test(line)) {
      remaining.push(...runs);
      continue;
    }
    for (let index = 0; index < runs.length;) {
      const opener = runs[index];
      let close = index + 1;
      while (close < runs.length && runs[close].length !== opener.length) close += 1;
      if (close === runs.length) {
        remaining.push(opener);
        index += 1;
        continue;
      }
      roles.set(key(opener.line, opener.offset), 'open');
      roles.set(key(runs[close].line, runs[close].offset), 'close');
      index = close + 1;
    }
  }
  for (let index = 0; index < remaining.length;) {
    const opener = remaining[index];
    let close = index + 1;
    while (close < remaining.length && remaining[close].length !== opener.length) close += 1;
    if (close === remaining.length) {
      index += 1;
      continue;
    }
    roles.set(key(opener.line, opener.offset), 'open');
    roles.set(key(remaining[close].line, remaining[close].offset), 'close');
    index = close + 1;
  }
  return roles;
}


function stripHtmlComments(line, inComment, codeSpan, delimiterRole) {
  let visible = '';
  let offset = 0;
  while (offset < line.length) {
    if (inComment) {
      const end = line.indexOf('-->', offset);
      if (end === -1) return { line: visible, inComment: true, codeSpan };
      inComment = false;
      offset = end + 3;
      continue;
    }
    if (line[offset] === '`') {
      const delimiter = /^`+/.exec(line.slice(offset))[0];
      visible += delimiter;
      const role = delimiterRole(offset);
      if (codeSpan === 0 && role === 'open') codeSpan = delimiter.length;
      else if (codeSpan === delimiter.length && role === 'close') codeSpan = 0;
      offset += delimiter.length;
      continue;
    }
    if (codeSpan > 0) {
      visible += line[offset++];
      continue;
    }
    if (line.startsWith('<!--', offset)) {
      inComment = true;
      offset += 4;
      continue;
    }
    visible += line[offset++];
  }
  return { line: visible, inComment, codeSpan };
}

const DELIVERY_TASK_HEADING = /^#{2,3}[ \t]+(T0*[1-9]\d*):/;

export function visitVisiblePublicationMarkdownLines(sourceLines, visit) {
  const codeSpanRoles = codeSpanDelimiters(codeSpanSourceLines(sourceLines));
  let fence = null;
  let inHtmlComment = false;
  let codeSpan = 0;
  for (const [index, sourceLine] of sourceLines.entries()) {
    if (fence) {
      if (closesMarkdownFence(sourceLine, fence)) fence = null;
      continue;
    }
    const startsInCodeSpan = codeSpan > 0;
    const stripped = stripHtmlComments(
      sourceLine,
      inHtmlComment,
      codeSpan,
      (offset) => codeSpanRoles.get(`${index}:${offset}`),
    );
    inHtmlComment = stripped.inComment;
    codeSpan = stripped.codeSpan;
    if (startsInCodeSpan) continue;
    fence = markdownFence(stripped.line);
    if (fence) {
      codeSpan = 0;
      continue;
    }
    visit(index, stripped.line);
  }
}

const WRITABLE_OPERATIONS = new Map([
  ['create', 'Create'],
  ['modify', 'Modify'],
  ['delete', 'Delete'],
  ['download untracked', 'Download untracked'],
  ['generate untracked', 'Generate untracked'],
]);

const NON_OPERATION_NOTES = new Set([
  'as needed',
  'existing shared helpers as needed for one authoritative classifier',
  'as applicable',
  'existing fixtures only as needed',
  'only if audit requires it',
  'see `notes.txt`; not authority',
  'existing affected command/surface tests',
  'after `skill://skill-creator`',
  'workflows after `skill://skill-creator`',
]);
const READ_ONLY_OPERATIONS = new Set(['Read-only', 'Acquire']);
const UNTRACKED_OPERATIONS = new Set(['Download untracked', 'Generate untracked']);
const SPEC_INPUT_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];

function pathAnnotationOperation(note) {
  const normalized = note.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized || NON_OPERATION_NOTES.has(normalized)) return null;
  const operation = WRITABLE_OPERATIONS.get(normalized);
  if (operation) return operation;
  throw safeError('publication_scope_unproven');
}

function declaredOperation(note, typeValue) {
  const pathOperation = pathAnnotationOperation(note);
  if (pathOperation) return pathOperation;
  const typeText = String(typeValue ?? '').trim();
  if (!typeText) return 'Modify';
  const operations = new Set();
  for (const match of typeText.matchAll(/\b(Create|Modify|Delete)\b/gi)) {
    operations.add(WRITABLE_OPERATIONS.get(match[1].toLowerCase()));
  }
  const residue = typeText
    .replace(/\b(?:Create|Modify|Delete|or)\b/gi, '')
    .replace(/[\/|,\s]+/g, '');
  if (residue || operations.size !== 1) throw safeError('publication_scope_unproven');
  return operations.values().next().value;
}

function readOnlyFileEntries(value) {
  const entries = [];
  for (const match of String(value).matchAll(/`([^`]+)`/g)) {
    if (validPublicationPath(match[1])) entries.push(match[1]);
  }
  if (entries.length) return entries;
  try {
    return publicationFileEntries(value);
  } catch {
    return [];
  }
}

function acquireInputEntries(value) {
  const command = String(value).replace(/^`|`$/g, '');
  if (!/\s--[a-z][a-z-]*\s/i.test(command)) return readOnlyFileEntries(value);
  const entries = [];
  for (const match of command.matchAll(/--([a-z][a-z-]*)\s+(?:"([^"]+)"|'([^']+)'|([^\s`]+))/gi)) {
    const [, rawFlag, doubleQuoted, singleQuoted, plain] = match;
    const flag = rawFlag.toLowerCase();
    if (/^(?:output|output-dir)$/.test(flag)
      || /^(?:branch|candidate|commit|format|issue|ref|repo|repository|sha)$/.test(flag)) continue;
    const candidate = doubleQuoted ?? singleQuoted ?? plain;
    const pathShaped = /[/.]/.test(candidate) || /^[A-Z][A-Z0-9_-]*$/.test(candidate);
    if (!candidate.includes('$') && pathShaped && validPublicationPath(candidate)) entries.push(candidate);
  }
  return entries;
}

export function parseDeliveryTaskFileLines(content, {
  spec = 'tasks.md',
  taskIds,
  structured = false,
} = {}) {
  const explicitTaskIds = taskIds != null;
  const acceptedTasks = new Set(taskIds ?? []);
  const sourceLines = String(content).split(/\r?\n/);
  const acceptedTaskLines = new Map();
  const expectedTaskCounts = new Map();
  for (const [index, line] of sourceLines.entries()) {
    const taskId = DELIVERY_TASK_HEADING.exec(line)?.[1];
    if (!taskId || (explicitTaskIds && !acceptedTasks.has(taskId))) continue;
    acceptedTasks.add(taskId);
    if (!acceptedTaskLines.has(taskId)) acceptedTaskLines.set(taskId, index + 1);
    expectedTaskCounts.set(taskId, (expectedTaskCounts.get(taskId) ?? 0) + 1);
  }
  const validatedTaskCounts = new Map();
  const entries = [];
  const taskOperations = [];
  let task = null;
  const locatedFailure = (taskValue, detail = {}) => safeError('publication_scope_unproven', {
    spec,
    taskId: taskValue.id,
    line: detail.line ?? taskValue.line,
    ...(detail.entry ? { entry: detail.entry } : {}),
    syntax: PUBLICATION_FILE_SYNTAX,
  });
  const finishTask = () => {
    if (!task || !acceptedTasks.has(task.id)) return;
    const nearMiss = task.nearMisses[0];
    if (nearMiss) throw locatedFailure(task, nearMiss);
    if (task.declarations.length !== 1) {
      const duplicate = task.declarations[1];
      throw locatedFailure(task, duplicate ?? {});
    }
    if (structured && task.types.length > 1) throw locatedFailure(task, task.types[1]);
    const [declaration] = task.declarations;
    let declared;
    try {
      declared = publicationFileDeclarations(declaration.value);
    } catch {
      throw locatedFailure(task, { line: declaration.line, entry: declaration.value });
    }
    const operations = [];
    try {
      for (const item of declared) {
        if (isDeliveryOwnerOnly(item.note)) continue;
        if (!structured) {
          pathAnnotationOperation(item.note);
          entries.push(item.path);
          continue;
        }
        const operation = declaredOperation(item.note, task.types[0]?.value);
        operations.push({
          path: item.path,
          operation,
          provenance: {
            label: 'File(s)',
            line: declaration.line,
            declaration: declaration.value,
          },
        });
      }
    } catch {
      throw locatedFailure(task, { line: declaration.line, entry: declaration.value });
    }
    for (const input of task.readOnly) {
      for (const path of readOnlyFileEntries(input.value)) {
        operations.push({
          path,
          operation: 'Read-only',
          provenance: { label: 'Read-only', line: input.line, declaration: input.value },
        });
      }
    }
    for (const input of task.acquire) {
      for (const path of acquireInputEntries(input.value)) {
        operations.push({
          path,
          operation: 'Acquire',
          provenance: { label: 'Acquire', line: input.line, declaration: input.value },
        });
      }
    }
    taskOperations.push({ taskId: task.id, operations });
    validatedTaskCounts.set(task.id, (validatedTaskCounts.get(task.id) ?? 0) + 1);
  };
  visitVisiblePublicationMarkdownLines(sourceLines, (index, line) => {
    const heading = DELIVERY_TASK_HEADING.exec(line);
    if (heading) {
      finishTask();
      task = {
        id: heading[1],
        line: index + 1,
        declarations: [],
        nearMisses: [],
        types: [],
        readOnly: [],
        acquire: [],
      };
      return;
    }
    if (/^#{1,3}(?:[ \t]+|$)/.test(line)) {
      finishTask();
      task = null;
      return;
    }
    if (!task || !acceptedTasks.has(task.id)) return;
    const metadata = /^\*\*([^*]+)\*\*:\s*(.*)$/.exec(line);
    if (!metadata) return;
    const [, label, value] = metadata;
    const detail = { line: index + 1, value: value.trim(), entry: line.trim() };
    if (label === 'File(s)') task.declarations.push(detail);
    else if (label === 'Type') task.types.push(detail);
    else if (label === 'Read-only') task.readOnly.push(detail);
    else if (label === 'Acquire') task.acquire.push(detail);
    else if (['file', 'files'].includes(label.replace(/[^A-Za-z]/g, '').toLowerCase())) {
      task.nearMisses.push(detail);
    }
  });
  finishTask();
  for (const taskId of acceptedTasks) {
    const expected = expectedTaskCounts.get(taskId) ?? 1;
    if (validatedTaskCounts.get(taskId) === expected) continue;
    throw safeError('publication_scope_unproven', {
      spec,
      taskId,
      line: acceptedTaskLines.get(taskId),
      syntax: PUBLICATION_FILE_SYNTAX,
    });
  }
  return structured ? taskOperations : entries;
}

function observePublicationPaths(run, cwd, pattern) {
  const paths = new Set();
  const current = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', pattern], { cwd });
  if (!commandSucceeded(current)) throw safeError('publication_scope_unproven');
  for (const file of String(current.stdout ?? '').split('\0').filter(Boolean)) paths.add(file);
  const upstream = run('git', ['rev-parse', '--verify', '@{u}'], { cwd });
  const revisions = commandSucceeded(upstream) ? ['@{u}..HEAD', 'HEAD'] : ['HEAD'];
  for (const revision of revisions) {
    const history = run('git', ['log', '--format=', '--name-only', '--no-renames', '-z', ...(revision === 'HEAD' ? ['-1'] : []), revision, '--', pattern], { cwd });
    if (!commandSucceeded(history)) throw safeError('publication_scope_unproven');
    for (const file of String(history.stdout ?? '').split('\0').filter(Boolean)) paths.add(file);
  }
  for (const file of paths) {
    if (!validPublicationPath(file)) throw safeError('publication_scope_unproven');
  }
  return paths;
}

// Approved task operations are optional implementation hints. Approved spec
// documents remain immutable inputs; outcome policy decides mutation authority.
export function inspectPublicationScope({ cwd = process.cwd(), issue, spec, step, run = defaultRun } = {}) {
  const issueNumber = Number(issue);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0
    || !['implement', 'verify'].includes(step)
    || !new RegExp(`^specs/${issueNumber}-[^/\\\\]+$`).test(spec ?? '')) throw safeError('spec_not_approved');
  const issueScope = inspectIssueSpecScope({ projectRoot: cwd, issueNumber, specPath: spec });
  if (!['scoped', 'implicit_single_issue'].includes(issueScope.status)) throw safeError('spec_not_approved');
  const documents = {};
  const specInputs = [];
  for (const file of SPEC_INPUT_FILES) {
    const path = `${spec}/${file}`;
    const content = readFileSync(join(cwd, path), 'utf8');
    if (!/^\*\*Status\*\*:\s*Approved\s*$/m.test(content)
      || !new RegExp(`^\\*\\*Issue\\*\\*:\\s*#${issueNumber}\\s*$`, 'm').test(content)) throw safeError('spec_not_approved');
    documents[file] = content;
    specInputs.push(path);
  }
  if (step === 'verify') {
    const report = `${spec}/verification-report.md`;
    return {
      trackedWritablePaths: [report],
      untrackedEvidencePaths: [],
      taskOperations: [],
      readOnlyPaths: specInputs.sort(),
      allowedPaths: [report],
    };
  }
  let taskOperations = [];
  const tracked = new Set();
  const untracked = new Set();
  try {
    taskOperations = parseDeliveryTaskFileLines(documents['tasks.md'], {
      spec: `${spec}/tasks.md`,
      taskIds: issueScope.delivery.tasks,
      structured: true,
    });
    const verificationReport = `${spec}/verification-report.md`;
    for (const task of taskOperations) {
      for (const operation of task.operations) {
        if (READ_ONLY_OPERATIONS.has(operation.operation)) continue;
        if ((operation.path === 'specs' || operation.path.startsWith('specs/'))
          && operation.path !== verificationReport) continue;
        const target = UNTRACKED_OPERATIONS.has(operation.operation) ? untracked : tracked;
        const expands = operation.path.endsWith('/') || /[*?\[]/.test(operation.path);
        if (!expands) target.add(operation.path);
        const matches = observePublicationPaths(run, cwd, operation.path);
        if (expands && matches.size === 0) throw safeError('publication_scope_unproven');
        for (const file of matches) {
          if (!publicationPathDenied(file, { spec, readOnlyPaths: specInputs })) target.add(file);
        }
      }
    }
    for (const path of tracked) {
      if (untracked.has(path)) throw safeError('publication_scope_unproven');
    }
  } catch (error) {
    if (error.reasonCode !== 'publication_scope_unproven') throw error;
    taskOperations = [];
    tracked.clear();
    untracked.clear();
  }
  const allowed = new Set(tracked);
  for (const path of untracked) allowed.add(path);
  return {
    mutationPolicy: 'outcome',
    trackedWritablePaths: [...tracked].sort(),
    untrackedEvidencePaths: [...untracked].sort(),
    taskOperations,
    readOnlyPaths: specInputs.sort(),
    allowedPaths: [...allowed].sort(),
  };
}

export function probePublicationScope({
  cwd = process.cwd(), issue, spec, step, run = defaultRun,
} = {}) {
  const issueNumber = Number(issue);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0 || step !== 'implement') {
    throw safeError('invalid_recovery_params');
  }
  const root = realpathSync(cwd);
  const ownerId = resolveRecoveryOwner({ cwd: root, issue: issueNumber, step, run });
  const branch = run('git', ['branch', '--show-current'], { cwd: root }).stdout.trim();
  return {
    passed: true,
    ownerId,
    binding: { actualBranch: branch },
    scope: inspectPublicationScope({ cwd: root, issue: issueNumber, spec, step, run }),
  };
}

function runCli(argv = process.argv.slice(2)) {
  const action = argv[0];
  const options = {};
  const keys = { '--issue': 'issue', '--step': 'step', '--spec': 'spec', '--subject': 'expectedSubject', '--controller-run-id': 'controllerRunId' };
  for (let index = 1; index < argv.length; index += 2) {
    const key = keys[argv[index]];
    if (!key || Object.hasOwn(options, key) || !argv[index + 1]) return 2;
    options[key] = argv[index + 1];
  }
  if (!['probe', 'bind', 'reconcile'].includes(action) || !/^[1-9]\d*$/.test(options.issue ?? '')
    || !['implement', 'verify'].includes(options.step)) return 2;
  if (action === 'probe') {
    const suppliedKeys = Object.keys(options).sort().join(',');
    if (options.step !== 'implement'
      || !['issue,spec,step', 'controllerRunId,issue,spec,step'].includes(suppliedKeys)) return 2;
    try {
      const outcome = probePublicationScope({ ...options, cwd: process.cwd() });
      process.stdout.write(`NMG_SDLC_PUBLICATION: ${JSON.stringify(outcome)}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`${error.reasonCode ?? error.message}\n`);
      if (error.reasonCode === 'publication_scope_unproven') {
        for (const key of ['spec', 'taskId', 'line', 'entry', 'syntax']) {
          if (error[key] != null) process.stderr.write(`${key}: ${error[key]}\n`);
        }
      }
      return 1;
    }
  }
  let lease;
  try {
    const cwd = process.cwd();
    const suppliedSubject = Object.hasOwn(options, 'expectedSubject');
    if (options.step === 'implement' && !validImplementationSubject(options.expectedSubject, options.issue)) {
      throw safeError('publication_subject_unproven');
    }
    lease = enterControllerLease({ projectRoot: cwd, runId: options.controllerRunId });
    const branch = defaultRun('git', ['branch', '--show-current'], { cwd });
    if (!commandSucceeded(branch) || parseIssueBranch(String(branch.stdout ?? '').trim())?.issueNumber !== Number(options.issue)) throw safeError('publication_branch_mismatch');
    const scope = inspectPublicationScope({ ...options, cwd });
    const status = defaultRun('git', ['status', '--porcelain=v1', '-z'], { cwd });
    if (!commandSucceeded(status)) throw safeError('publication_scope_unproven');
    const observedPaths = porcelainPaths(status.stdout);
    const deniedPath = observedPaths.find((file) => publicationPathDenied(file, {
      spec: options.spec,
      readOnlyPaths: scope.readOnlyPaths,
    }));
    if (deniedPath) throw safeError('publication_scope_unproven', { entry: deniedPath });
    if (options.step === 'implement' && action === 'bind'
      && ((!suppliedSubject && porcelainPaths(status.stdout).length)
        || (suppliedSubject && hasStagedNonRuntimeEntry(status.stdout)))) {
      throw safeError('publication_subject_unproven');
    }
    const controllerRunId = lease.owned ? lease.lease.record.runId : lease.lease.runId;
    const ownerId = resolveRecoveryOwner({
      ...options,
      cwd,
      controllerRunId,
      bindSubject: options.step === 'implement' && action === 'bind' && suppliedSubject,
    });
    if (observedPaths.length && action === 'reconcile') assertInitialStagePublication({ ...options, cwd, ownerId });
    let outcome = { passed: true, ownerId, scope };
    if (action === 'reconcile') {
      const expectedSubject = options.step === 'implement' ? options.expectedSubject : getExpectedSubject(options.step, options.issue);
      let allowedPaths = observedPaths;
      if (!allowedPaths.length) {
        const names = defaultRun('git', [
          'diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', 'HEAD',
        ], { cwd });
        if (!commandSucceeded(names) || !String(names.stdout ?? '').endsWith('\0')) {
          throw safeError('publication_scope_unproven');
        }
        allowedPaths = String(names.stdout).slice(0, -1).split('\0');
        const deniedHeadPath = allowedPaths.find((file) => publicationPathDenied(file, {
          spec: options.spec,
          readOnlyPaths: scope.readOnlyPaths,
        }));
        if (deniedHeadPath) throw safeError('publication_scope_unproven', { entry: deniedHeadPath });
      }
      outcome = {
        ...reconcileStagePublication({
          ...options, cwd, ownerId, allowedPaths, expectedSubject,
        }),
        ownerId,
        scope,
      };
    }
    process.stdout.write(`NMG_SDLC_PUBLICATION: ${JSON.stringify(outcome)}\n`);
    return outcome.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.reasonCode ?? error.message}\n`);
    if (error.reasonCode === 'publication_scope_unproven') {
      for (const key of ['spec', 'taskId', 'line', 'entry', 'syntax']) {
        if (error[key] != null) process.stderr.write(`${key}: ${error[key]}\n`);
      }
    }
    return 1;
  } finally {
    if (lease?.owned) releaseControllerLease(lease.lease);
  }
}

if (isCliEntry(import.meta.url)) process.exitCode = runCli();
