#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fsDefault from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDeliveryPullRequestBody } from './contribution-evidence.mjs';
import { classifyPrDeliveryState } from './pr-delivery-state.mjs';
import { inspectIssueSpecScope } from './issue-spec-scope.mjs';
import {
  canonicalCheckName,
  evidenceIdentity,
  inspectDeliveryValidation,
  inspectVerificationArtifactRepair,
  MAX_VERIFICATION_REPORT_BYTES,
  inspectVerificationReadiness,
  resolveDeclaredCheck,
} from './verification-readiness.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { resolveSteeringPath } from '../src/sdlc-steering-runtime.mjs';
import {
  assertControllerLease,
  enterControllerLease,
  releaseControllerLease,
} from './sdlc-controller-lease.mjs';
import { matchesRegisteredResults } from './sdlc-finalize-verification.mjs';
import { parseIssueBranch } from './sdlc-status.mjs';
import {
  inspectPublicationScope,
  publicationPathDenied,
  reconcileStagePublication,
} from './sdlc-safe-recoveries.mjs';

const USAGE = 'Usage: node scripts/sdlc-deliver.mjs [prepare-version | prepare-pr-evidence] --issue N [--controller-run-id ID]';
const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
const ISSUE = /^#?([1-9]\d*)$/;
const SHA = /^[0-9a-f]{40}$/i;
const POLL_INTERVAL_MS = 30_000;
const CONTRIBUTION_EVIDENCE_SCRIPT = fileURLToPath(new URL('./contribution-evidence.mjs', import.meta.url));
const REVIEW_THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviews(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id
          state
          submittedAt
          author { login __typename }
        }
      }
      reviewThreads(first: 100) {
        pageInfo {
          hasNextPage
        }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 50) {
            pageInfo {
              hasNextPage
            }
            nodes {
              body
              path
              line
              url
              author {
                login
                __typename
              }
            }
          }
        }
      }
    }
  }
}`;

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function command(run, cwd, executable, args, { allowFailure = false } = {}) {
  const result = run(executable, args, { cwd });
  if (!result || typeof result.status !== 'number') throw new Error(`${executable} returned an invalid result`);
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${executable} ${args.join(' ')} failed: ${String(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function jsonCommand(run, cwd, executable, args, options) {
  const result = command(run, cwd, executable, args, options);
  try {
    return { result, value: JSON.parse(String(result.stdout || '').trim() || 'null') };
  } catch (error) {
    throw new Error(`${executable} returned invalid JSON: ${error.message}`);
  }
}

function positiveIssue(value) {
  const match = String(value ?? '').match(ISSUE);
  if (!match) return null;
  const issue = Number(match[1]);
  return Number.isSafeInteger(issue) ? issue : null;
}

export function parseDeliverCli(argv) {
  const action = ['prepare-version', 'prepare-pr-evidence'].includes(argv[0]) ? argv[0] : 'deliver';
  const args = action === 'deliver' ? argv : argv.slice(1);
  let issue = null;
  let controllerRunId = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--issue' && issue === null && index + 1 < args.length) {
      issue = positiveIssue(args[++index]);
      if (!issue) throw new Error(USAGE);
    } else if (arg === '--controller-run-id' && controllerRunId === null && index + 1 < args.length) {
      controllerRunId = args[++index];
      if (!controllerRunId) throw new Error(USAGE);
    } else {
      throw new Error(USAGE);
    }
  }
  if (!issue) throw new Error(USAGE);
  return { action, issue, ...(controllerRunId ? { controllerRunId } : {}) };
}


function ensureDirectoryChain(fs, cwd, segments) {
  let current = cwd;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('unsafe_session_path');
    } else {
      fs.mkdirSync(current);
    }
  }
  return current;
}



function abortDelivery(result) {
  const error = new Error('delivery_aborted');
  error.deliveryResult = result;
  throw error;
}


function handoffFor(issue, status, summary, artifacts, reasonCode, next = null) {
  return {
    schemaVersion: 1,
    issue,
    step: 'deliver',
    status,
    intervention: status !== 'passed' && next === null,
    summary,
    artifacts,
    next,
    reasonCode,
  };
}

function writeHandoff({
  cwd, fs, issue, status, summary, artifacts = [], reasonCode = null, next = null,
}) {
  const handoffPath = `.omp/sdlc/handoffs/${issue}-deliver.json`;
  const absolute = path.resolve(cwd, handoffPath);
  ensureDirectoryChain(fs, cwd, ['.omp', 'sdlc', 'handoffs']);
  if (fs.existsSync(absolute)) {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe_handoff_path');
  }
  const handoff = handoffFor(issue, status, summary, artifacts, reasonCode, next);
  fs.writeFileSync(absolute, `${JSON.stringify(handoff, null, 2)}\n`);
  return {
    status: status === 'passed' ? 0 : 1,
    stdout: `NMG_SDLC_HANDOFF: ${handoffPath}\n`,
    stderr: '',
    handoff,
    handoffPath,
  };
}

function writeSmokeDeliveryProof({ cwd, env, fs, issue, pullRequest, headSha }) {
  if (env.NMG_SDLC_SMOKE_OWNED !== '1') return;
  const invocationId = String(env.NMG_SDLC_SMOKE_RECOVERY ?? '').split('.')[0];
  if (!/^[a-f0-9]{64}$/i.test(invocationId)) throw new Error('smoke invocation identity is unavailable');
  const directory = ensureDirectoryChain(fs, cwd, ['.omp', 'sdlc', 'smoke-deliveries']);
  const receipt = path.join(directory, `${issue}.json`);
  if (fs.existsSync(receipt)) {
    const stat = fs.lstatSync(receipt);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe_smoke_receipt');
    const prior = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    if (prior.invocationId !== invocationId || prior.issue !== issue
      || prior.pullRequest !== pullRequest || prior.headSha !== headSha) {
      throw new Error('smoke receipt conflicts with exact delivery target');
    }
    return;
  }
  fs.writeFileSync(receipt, `${JSON.stringify({
    schemaVersion: 1, issue, invocationId, pullRequest, headSha, recordedBeforeMerge: true,
  }, null, 2)}\n`, { flag: 'wx' });
}

function fail(context, reasonCode, summary, next = null, artifacts = []) {
  return writeHandoff({ ...context, status: 'failed', reasonCode, summary, next, artifacts });
}

function approvedSpec(fs, cwd, issue, { requireReport = true } = {}) {
  const specsRoot = path.join(cwd, 'specs');
  const prefix = `${issue}-`;
  const matches = fs.readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort();
  if (matches.length !== 1) throw new Error('spec_not_approved');
  const relative = `specs/${matches[0]}`;
  const root = path.join(cwd, relative);
  const files = {};
  for (const name of REQUIRED_SPEC_FILES) {
    const content = fs.readFileSync(path.join(root, name), 'utf8');
    if (!new RegExp(`^\\*\\*Issue\\*\\*:\\s*#?${issue}$`, 'm').test(content)
      || !/^\*\*Status\*\*:\s*Approved$/m.test(content)) {
      throw new Error('spec_not_approved');
    }
    files[name] = content;
  }
  const scope = inspectIssueSpecScope({
    projectRoot: cwd,
    issueNumber: issue,
    specPath: relative,
  }, {
    lstat: (filePath) => fs.lstatSync(filePath),
    realpath: (filePath) => fs.realpathSync(filePath),
    readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
  });
  if (!['scoped', 'implicit_single_issue'].includes(scope.status)) {
    throw Object.assign(new Error(`Live spec scope is unavailable: ${scope.reasonCode}`), {
      reasonCode: 'spec_not_approved',
    });
  }
  const verificationPath = path.join(root, 'verification-report.md');
  if (requireReport && !fs.existsSync(verificationPath)) throw new Error('verification_not_ready');
  if (fs.existsSync(verificationPath)) {
    const reportStat = fs.lstatSync(verificationPath);
    if (!reportStat.isFile() || reportStat.isSymbolicLink() || reportStat.size > MAX_VERIFICATION_REPORT_BYTES) {
      throw Object.assign(new Error('Verification report must be a bounded regular non-symlink file'), { reasonCode: 'verification_not_ready' });
    }
  }
  return { root, relative, files, verificationPath, scope };
}

function issueLabels(issue) {
  return (Array.isArray(issue.labels) ? issue.labels : [])
    .map((label) => typeof label === 'string' ? label : label?.name)
    .filter(Boolean)
    .map((label) => label.toLowerCase());
}

function semver(value) {
  const match = String(value).trim().match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match) throw new Error('invalid VERSION');
  return match.slice(1).map(Number);
}

function bumpedVersion(current, bump) {
  let [major, minor, patch] = semver(current);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return `${major}.${minor + 1}.0`;
}

function approvedMajor(spec) {
  return /^\*\*Version bump\*\*:\s*major\s*$/im.test(spec.files['requirements.md'])
    || /^\*\*Version bump\*\*:\s*major\s*$/im.test(spec.files['design.md']);
}

function isBreakingDeclaration(issue) {
  return /^\s*BREAKING\s*:/i.test(String(issue.title ?? ''))
    || /^\s*BREAKING\s*:/im.test(String(issue.body ?? ''));
}

function configuredBotLogins(tech) {
  const logins = new Set(['coderabbitai']);
  const row = tech.match(/^\|\s*`logins`\s*\|\s*`(\[[^`]+\])`/m);
  if (row) {
    try {
      for (const login of JSON.parse(row[1])) logins.add(String(login).toLowerCase());
    } catch {
      // The mandatory coderabbit identity remains available when steering is malformed.
    }
  }
  return logins;
}

function registeredTechnicalSteering(fs, cwd) {
  const manifestPath = resolveSteeringPath(cwd, 'steering/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const snippet = manifest.snippets?.find((entry) =>
    entry?.id === 'project.tech'
    && Array.isArray(entry.consumers)
    && entry.consumers.includes('worker:deliver'));
  if (!snippet || typeof snippet.path !== 'string') {
    throw new Error('steering manifest lacks the worker:deliver technical snippet');
  }
  if (!snippet.path.startsWith('steering/snippets/')) {
    throw new Error('steering manifest technical snippet is outside steering/snippets');
  }
  const snippetPath = resolveSteeringPath(cwd, snippet.path);
  return fs.readFileSync(snippetPath, 'utf8');
}

function updateChangelog(content, version, date, title, breaking) {
  const marker = '## [Unreleased]';
  const index = content.indexOf(marker);
  if (index < 0) throw new Error('CHANGELOG.md lacks [Unreleased]');
  const nextHeading = content.indexOf('\n## [', index + marker.length);
  const end = nextHeading < 0 ? content.length : nextHeading;
  const prefix = content.slice(0, index);
  const unreleased = content.slice(index + marker.length, end).trim();
  const suffix = content.slice(end).replace(/^\n+/, '\n');
  const category = breaking ? 'Changed (BREAKING)' : 'Changed';
  const preserved = unreleased ? `${unreleased}\n\n` : '';
  return `${prefix}${marker}\n\n## [${version}] - ${date}\n\n${preserved}### ${category}\n\n- ${title}\n${suffix}`;
}

function synchronizedDeliveryVersion(changelog, version, issue, title) {
  const heading = `## [${version}]`;
  const start = changelog.indexOf(heading);
  if (start < 0) return false;
  const end = changelog.indexOf('\n## [', start + heading.length);
  const release = changelog.slice(start, end < 0 ? changelog.length : end);
  return release.includes(`- ${title} (#${issue})`);
}
function versionedArtifacts(tech) {
  const source = String(tech);
  const heading = source.match(/^## Versioning\s*$/m);
  if (!heading) return [];
  const body = source.slice(heading.index + heading[0].length);
  const nextHeading = body.search(/^#{2,3}\s/m);
  const section = nextHeading < 0 ? body : body.slice(0, nextHeading);
  const artifacts = [];
  const seen = new Map();
  for (const line of section.split('\n')) {
    const row = line.match(/^\|\s*`([^`]+)`\s*\|\s*(?:`([^`]+)`|([^|]+?))\s*\|/);
    if (!row) continue;
    const relative = row[1].trim();
    const field = (row[2] ?? row[3]).trim();
    if (!relative || !field) throw new Error('technical steering has an invalid version artifact declaration');
    if (seen.has(relative)) {
      if (seen.get(relative) !== field) {
        throw new Error(`technical steering declares conflicting fields for ${relative}`);
      }
      continue;
    }
    seen.set(relative, field);
    artifacts.push({ relative, field });
  }
  return artifacts;
}

function safeVersionArtifactPath(cwd, relative, fs = null) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
    throw new Error(`version artifact path escapes the repository: ${relative}`);
  }
  const absolute = path.resolve(cwd, relative);
  const root = path.resolve(cwd);
  if (absolute === root || !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`version artifact path escapes the repository: ${relative}`);
  }
  if (fs?.existsSync(absolute)) {
    const realRoot = fs.realpathSync(root);
    const realArtifact = fs.realpathSync(absolute);
    if (realArtifact === realRoot || !realArtifact.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error(`version artifact path escapes the repository: ${relative}`);
    }
  }
  return absolute;
}

function jsonVersionMirror(content, field, current, version, relative) {
  const document = JSON.parse(content);
  const keys = field.split('.').map((key) => key.trim()).filter(Boolean);
  if (keys.length === 0 || keys.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) {
    throw new Error(`invalid JSON version field for ${relative}: ${field}`);
  }
  let owner = document;
  for (const key of keys.slice(0, -1)) {
    if (!owner || typeof owner !== 'object' || !Object.hasOwn(owner, key)) {
      throw new Error(`declared version field is missing from ${relative}: ${field}`);
    }
    owner = owner[key];
  }
  const key = keys.at(-1);
  if (!owner || typeof owner !== 'object' || !Object.hasOwn(owner, key)) {
    throw new Error(`declared version field is missing from ${relative}: ${field}`);
  }
  if (owner[key] !== current) {
    throw new Error(`declared version field is not synchronized in ${relative}: ${field}`);
  }
  owner[key] = version;
  return `${JSON.stringify(document, null, 2)}\n`;
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tomlVersionMirror(content, field, current, version, relative) {
  const parts = field.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error(`invalid TOML version field for ${relative}: ${field}`);
  const table = parts.slice(0, -1).join('.');
  const key = parts.at(-1);
  const assignment = new RegExp(`^(\\s*${regexEscape(key)}\\s*=\\s*)(["'])([^"']*)(["'])(\\s*(?:#.*)?)$`);
  let activeTable = '';
  const matches = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (heading) {
      activeTable = heading[1].trim();
      continue;
    }
    if (activeTable !== table) continue;
    const match = lines[index].match(assignment);
    if (match && match[2] === match[4]) matches.push({ index, match });
  }
  if (matches.length !== 1) {
    throw new Error(`declared TOML version field is ${matches.length ? 'ambiguous' : 'missing'} in ${relative}: ${field}`);
  }
  const [{ index, match }] = matches;
  if (match[3] !== current) {
    throw new Error(`declared version field is not synchronized in ${relative}: ${field}`);
  }
  lines[index] = `${match[1]}${match[2]}${version}${match[4]}${match[5]}`;
  return lines.join('\n');
}

function textVersionMirror(content, field, current, version, relative) {
  if (field.toLowerCase() === 'file text') {
    if (content.trim() !== current) {
      throw new Error(`declared version field is not synchronized in ${relative}: ${field}`);
    }
    return content.replace(current, version);
  }
  const lines = content.split('\n');
  const matches = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes(field) && line.includes(current));
  if (matches.length !== 1 || matches[0].line.split(current).length !== 2) {
    throw new Error(`declared text version field is ${matches.length ? 'ambiguous' : 'missing'} in ${relative}: ${field}`);
  }
  lines[matches[0].index] = matches[0].line.replace(current, version);
  return lines.join('\n');
}

function updatedVersionMirror(content, artifact, current, version) {
  const extension = path.extname(artifact.relative).toLowerCase();
  if (extension === '.json') {
    return jsonVersionMirror(content, artifact.field, current, version, artifact.relative);
  }
  if (extension === '.toml') {
    return tomlVersionMirror(content, artifact.field, current, version, artifact.relative);
  }
  return textVersionMirror(content, artifact.field, current, version, artifact.relative);
}

function deliveryVersionArtifacts(tech, cwd, fs) {
  const declared = versionedArtifacts(tech);
  for (const { relative } of declared) safeVersionArtifactPath(cwd, relative, fs);
  return {
    declared,
    paths: [...new Set(['VERSION', 'CHANGELOG.md', ...declared.map(({ relative }) => relative)])],
  };
}

function hasSynchronizedDeliveryState({ run, fs, cwd, issue, issueData, tech, changelog, version }) {
  if (!synchronizedDeliveryVersion(changelog, version, issue, issueData.title)) return false;
  const prefix = issueLabels(issueData).includes('bug') ? 'fix' : 'feat';
  const subject = `${prefix}: deliver issue #${issue}`;
  const commitResult = command(run, cwd, 'git', [
    'log', '-1', '--format=%H', '--fixed-strings', `--grep=${subject}`,
  ], { allowFailure: true });
  const commit = String(commitResult.stdout || '').trim();
  if (commitResult.status !== 0 || !SHA.test(commit)) return false;
  const changedResult = command(run, cwd, 'git', [
    'show', '--format=', '--name-only', '-z', commit, '--',
  ]);
  const committedPaths = new Set(String(changedResult.stdout || '').split('\0').filter(Boolean));
  const { paths } = deliveryVersionArtifacts(tech, cwd, fs);
  if (!paths.every((relative) => committedPaths.has(relative))) return false;
  const diff = command(run, cwd, 'git', ['diff', '--quiet', commit, '--', ...paths], { allowFailure: true });
  if (diff.status > 1) throw new Error(`git could not verify delivery commit ${commit}`);
  return diff.status === 0;
}

function synchronizeVersion({ run, fs, cwd, issue, spec, issueData, tech, now }) {
  const versionPath = path.join(cwd, 'VERSION');
  const changelogPath = path.join(cwd, 'CHANGELOG.md');
  const current = fs.readFileSync(versionPath, 'utf8').trim();
  semver(current);
  const breaking = isBreakingDeclaration(issueData);
  if (breaking && !approvedMajor(spec)) {
    const error = new Error('major_bump_required');
    error.reasonCode = 'major_bump_required';
    throw error;
  }
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  if (hasSynchronizedDeliveryState({
    run, fs, cwd, issue, issueData, tech, changelog, version: current,
  })) return { version: current, changed: [] };
  const labels = issueLabels(issueData);
  const bump = breaking && approvedMajor(spec) ? 'major' : labels.includes('bug') ? 'patch' : 'minor';
  const version = bumpedVersion(current, bump);
  const { declared } = deliveryVersionArtifacts(tech, cwd, fs);
  const mirrors = declared.filter(({ relative }) => !['VERSION', 'CHANGELOG.md'].includes(relative));
  const updates = mirrors.map((artifact) => {
    const absolute = safeVersionArtifactPath(cwd, artifact.relative, fs);
    if (!fs.existsSync(absolute)) throw new Error(`declared version artifact is missing: ${artifact.relative}`);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`declared version artifact is not a regular file: ${artifact.relative}`);
    }
    const original = fs.readFileSync(absolute, 'utf8');
    return {
      ...artifact,
      absolute,
      content: updatedVersionMirror(original, artifact, current, version),
    };
  });
  const date = new Date(now()).toISOString().slice(0, 10);
  const nextChangelog = updateChangelog(
    changelog, version, date, `${issueData.title} (#${issue})`, breaking,
  );

  fs.writeFileSync(versionPath, `${version}\n`);
  for (const update of updates) fs.writeFileSync(update.absolute, update.content);
  fs.writeFileSync(changelogPath, nextChangelog);
  return {
    version,
    changed: [...new Set(['VERSION', 'CHANGELOG.md', ...mirrors.map(({ relative }) => relative)])],
  };
}

function parsePorcelain(output) {
  const entries = String(output || '').split('\0');
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2)) && entries[index + 1]) paths.push(entries[++index]);
  }
  return paths;
}

function publishVersionChanges({ run, cwd, issue, issueData, changed, allowedPaths }) {
  if (changed.length === 0) return;
  const subject = `${issueLabels(issueData).includes('bug') ? 'fix' : 'feat'}: deliver issue #${issue}`;
  const dirty = parsePorcelain(command(run, cwd, 'git', ['status', '--porcelain=v1', '-z']).stdout)
    .filter((entry) => !entry.startsWith('.omp/'));
  if (dirty.some((entry) => !changed.includes(entry) || !allowedPaths.includes(entry))) {
    throw new Error(`Unrelated delivery changes: ${dirty.join(', ')}`);
  }
  command(run, cwd, 'git', ['add', '--', ...changed]);
  const staged = command(run, cwd, 'git', ['diff', '--cached', '--quiet'], { allowFailure: true });
  if (staged.status !== 1) throw new Error('delivery version diff is empty or unreadable');
  command(run, cwd, 'git', ['commit', '-m', subject]);
  const upstream = command(run, cwd, 'git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { allowFailure: true });
  const push = upstream.status === 0
    ? command(run, cwd, 'git', ['push'], { allowFailure: true })
    : command(run, cwd, 'git', ['push', '-u', 'origin', 'HEAD'], { allowFailure: true });
  if (push.status !== 0) {
    if (upstream.status !== 0) throw new Error(`Version publication is unproven: ${push.stderr}`);
    const publication = reconcileStagePublication({
      run, cwd, issue, step: 'deliver', allowedPaths: changed, expectedSubject: subject,
    });
    if (!publication.passed) throw Object.assign(new Error(publication.summary), { reasonCode: publication.reasonCode });
  }
}

function changedPathsForDelivery({ run, cwd, base }) {
  return command(run, cwd, 'git', ['diff', '--name-only', '-z', `${base}...HEAD`]).stdout
    .split('\0')
    .filter(Boolean);
}


function evaluateContributionEvidenceAtRoot({ run, fs, cwd, issue, title, body, changedPaths }) {
  const inputPath = path.join(ensureDirectoryChain(fs, cwd, ['.omp', 'sdlc']), `contribution-evidence-${issue}.json`);
  fs.writeFileSync(inputPath, `${JSON.stringify({ title, body, changedPaths })}\n`, { flag: 'wx' });
  try {
    const { value } = jsonCommand(
      run,
      cwd,
      process.execPath,
      [CONTRIBUTION_EVIDENCE_SCRIPT, '--root', cwd, inputPath],
    );
    if (typeof value?.ok !== 'boolean' || !Array.isArray(value.errors)) {
      throw new Error('contribution evidence evaluator returned an invalid result');
    }
    return value;
  } finally {
    fs.rmSync(inputPath, { force: true });
  }
}

function requireContributionEvidence(options) {
  const result = evaluateContributionEvidenceAtRoot(options);
  if (result.ok) return;
  const error = new Error(result.errors.join('; '));
  error.reasonCode = 'contribution_evidence_incomplete';
  throw error;
}

function existingPullRequest({ run, cwd, branch, issue }) {
  const { value } = jsonCommand(run, cwd, 'gh', [
    'pr', 'list', '--head', branch, '--state', 'all', '--limit', '100',
    '--json', 'number,title,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,mergedAt,mergeCommit,body',
  ]);
  if (!Array.isArray(value)) throw new Error('PR list is not an array');
  const closingPattern = new RegExp(`(?:^|\\n)Closes #${issue}(?:\\n|$)`, 'i');
  const exact = value.filter((pr) => pr.headRefName === branch && closingPattern.test(String(pr.body ?? '')));
  const foreign = value.filter((pr) => pr.headRefName === branch && pr.state === 'OPEN' && !exact.includes(pr));
  if (foreign.length) throw Object.assign(new Error(`Issue branch ${branch} already has an unrelated open PR`), {
    reasonCode: 'delivery_reconciliation_required',
  });
  const open = exact.filter((pr) => pr.state === 'OPEN');
  if (open.length > 1) throw new Error('multiple open exact-branch PRs');
  if (open.length === 1) return open[0];
  const merged = exact.filter((pr) => pr.state === 'MERGED');
  if (merged.length > 1) throw new Error('multiple merged exact-branch PRs');
  return merged[0] ?? null;
}
function pullRequestByNumber({ run, cwd, prNumber }) {
  return jsonCommand(run, cwd, 'gh', [
    'pr', 'view', String(prNumber), '--json',
    'number,title,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,mergedAt,mergeCommit,body',
  ]).value;
}

function resolveDefaultBase({ run, cwd }) {
  const { value } = jsonCommand(run, cwd, 'gh', ['repo', 'view', '--json', 'defaultBranchRef']);
  const base = value?.defaultBranchRef?.name;
  if (typeof base !== 'string' || !base) throw new Error('repository default branch is unavailable');
  return base;
}
function assertDeliveryRepository({ run, cwd, issueData, issue, pr = null }) {
  const { value } = jsonCommand(run, cwd, 'gh', ['repo', 'view', '--json', 'url']);
  const repository = String(value?.url ?? '').replace(/\/$/, '');
  if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+$/.test(repository)
    || issueData.url !== `${repository}/issues/${issue}`
    || pr && pr.url !== `${repository}/pull/${pr.number}`) {
    throw Object.assign(new Error('Live repository, issue, or pull request identity disagrees with the delivery target'), {
      reasonCode: 'delivery_reconciliation_required',
    });
  }
}


function prEvidenceRequest({ issue, pr, spec, readiness }) {
  const packet = {
    schemaVersion: 1,
    kind: 'pr_evidence_verification_required',
    issue,
    pullRequest: pr.number,
    headSha: pr.headRefOid,
    specPath: spec.relative,
    evidence: (readiness.readiness?.pendingEvidence ?? []).map(evidenceIdentity),
    handoffPath: `.omp/sdlc/handoffs/${issue}-deliver.json`,
  };
  return {
    status: 3,
    stdout: `NMG_SDLC_PR_EVIDENCE: ${JSON.stringify(packet)}\n`,
    stderr: '',
    handoff: null,
    handoffPath: packet.handoffPath,
    prEvidence: packet,
  };
}

function evidenceForHead(readiness, observed, headSha) {
  const evidence = readiness.readiness?.evidence ?? [];
  const result = [];
  for (const item of evidence) {
    if (item.kind === 'merge_blocking') {
      const state = String(observed.pr.mergeStateStatus ?? '').toUpperCase();
      if (!state || state === 'UNKNOWN') return null;
      if (!['BLOCKED', 'UNSTABLE', 'DIRTY', 'BEHIND'].includes(state)) {
        throw new Error('verification_not_ready');
      }
      result.push({
        ...evidenceIdentity(item),
        headSha,
        conclusion: 'OBSERVED',
        url: observed.pr.url,
        observedStates: [state],
      });
      continue;
    }
    const resolved = resolveDeclaredCheck(item.name, observed.evidenceChecks);
    if (resolved.status === 'pending') return null;
    if (resolved.status !== 'matched') throw new Error('verification_not_ready');
    const check = resolved.check;
    if (check.event !== item.event) throw new Error('verification_not_ready');
    if (['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED'].includes(check.state)) return null;
    if (!['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(check.state) || !check.url) {
      throw new Error('verification_not_ready');
    }
    result.push({
      ...evidenceIdentity(item),
      headSha,
      conclusion: check.state,
      url: check.url,
    });
  }
  return result;
}


function editPullRequestBody({ run, fs, cwd, issue, prNumber, body, name = 'pr-body' }) {
  const bodyPath = path.join(ensureDirectoryChain(fs, cwd, ['.omp', 'sdlc']), `${name}-${issue}.md`);
  fs.writeFileSync(bodyPath, body, { flag: 'wx' });
  try {
    command(run, cwd, 'gh', ['pr', 'edit', String(prNumber), '--body-file', bodyPath]);
  } finally {
    fs.rmSync(bodyPath, { force: true });
  }
}

function writeDeliveryValidation({
  run,
  fs,
  cwd,
  issue,
  issueTitle,
  spec,
  pr,
  headSha,
  evidence,
  pullRequestBody,
  changedPaths,
}) {
  const marker = `<!-- nmg-sdlc-delivery-validation: ${JSON.stringify({
    schemaVersion: 1,
    state: 'final_sha_validated',
    issueNumber: issue,
    specPath: spec.relative,
    pullRequestNumber: pr.number,
    headSha,
    evidence,
  })} -->`;
  const body = `${pullRequestBody
    .replace(/^<!-- nmg-sdlc-delivery-validation:.*-->\r?\n?/gm, '')
    .replace(/\s+$/, '')}\n\n${marker}\n`;
  requireContributionEvidence({
    run, fs, cwd, issue, title: issueTitle, body, changedPaths,
  });
  editPullRequestBody({
    run, fs, cwd, issue, prNumber: pr.number, body, name: 'pr-final-body',
  });
}


function createPullRequest({ run, fs, cwd, issue, issueData, branch, base, draft, body }) {
  const bodyPath = path.join(ensureDirectoryChain(fs, cwd, ['.omp', 'sdlc']), `pr-body-${issue}.md`);
  fs.writeFileSync(bodyPath, body, { flag: 'wx' });
  const args = ['pr', 'create', '--base', base, '--head', branch, '--title', issueData.title, '--body-file', bodyPath];
  if (draft) args.push('--draft');
  try {
    const result = command(run, cwd, 'gh', args);
    const url = String(result.stdout).trim();
    const number = Number(url.match(/\/(\d+)\/?$/)?.[1]);
    if (!number) throw new Error('created PR URL lacks a number');
    return { number, url, headRefName: branch };
  } finally {
    fs.rmSync(bodyPath, { force: true });
  }
}

function normalizeCheck(check) {
  let state = String(check.state ?? check.conclusion ?? '').toUpperCase();
  const bucket = String(check.bucket ?? '').toLowerCase();
  if (!state && bucket === 'pass') state = 'SUCCESS';
  if (!state && bucket === 'fail') state = 'FAILURE';
  if (!state && bucket === 'pending') state = 'PENDING';
  const workflow = typeof check.workflow === 'string' && check.workflow.trim()
    ? check.workflow.trim()
    : null;
  return {
    name: check.name,
    workflow,
    event: check.event ?? null,
    state,
    required: check.required === true,
    url: check.link ?? check.url ?? null,
  };
}

function actionsRunId(url) {
  const match = String(url ?? '').match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/([1-9]\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

function enrichMissingCheckEvents(checks, { headSha, resolveRun, cache = new Map() }) {
  return checks.map((check) => {
    const observedEvent = String(check.event ?? '').trim();
    if (observedEvent && observedEvent !== 'pull_request_target') return check;
    const runId = actionsRunId(check.url);
    if (!runId) return check;
    if (!cache.has(runId)) {
      try {
        cache.set(runId, resolveRun(runId));
      } catch {
        cache.set(runId, null);
      }
    }
    const resolved = cache.get(runId);
    if (!resolved || typeof resolved.event !== 'string' || !resolved.event.trim()
      || typeof resolved.headSha !== 'string'
      || resolved.headSha.toLowerCase() !== String(headSha ?? '').toLowerCase()) return check;
    const resolvedEvent = resolved.event.trim();
    if (observedEvent === 'pull_request_target'
      && !['pull_request', 'pull_request_target'].includes(resolvedEvent)) return check;
    const event = ['pull_request', 'pull_request_target'].includes(resolvedEvent)
      ? 'pull_request'
      : resolvedEvent;
    return { ...check, event };
  });
}

function threadComments(thread) {
  if (Array.isArray(thread.comments)) return thread.comments;
  if (Array.isArray(thread.comments?.nodes)) return thread.comments.nodes;
  return [];
}

function threadAuthor(thread) {
  const comments = threadComments(thread);
  const latest = comments[comments.length - 1] ?? thread.comment ?? {};
  const origin = comments[0] ?? thread.comment ?? {};
  return {
    login: String(latest.author?.login ?? latest.authorLogin ?? thread.author?.login ?? thread.authorLogin ?? '').toLowerCase(),
    typename: latest.author?.__typename ?? thread.author?.__typename ?? thread.authorType ?? null,
    body: latest.body ?? thread.body ?? '',
    path: thread.path ?? origin.path ?? null,
    line: thread.line ?? origin.line ?? null,
    url: thread.url ?? latest.url ?? origin.url ?? null,
  };
}

function isBot(author, botLogins) {
  return author.typename === 'Bot' || botLogins.has(author.login);
}

function parseChecksResult(result, description) {
  if (![0, 1, 8].includes(result.status)) {
    throw new Error(`${description} failed: ${String(result.stderr || result.stdout).trim()}`);
  }
  const output = String(result.stdout || '').trim();
  if (!output && result.status === 1
    && /^no (?:required )?checks reported on the .+ branch$/i.test(String(result.stderr || '').trim())) {
    return [];
  }
  if (!output) throw new Error(`${description} returned no JSON`);
  let checks;
  try {
    checks = JSON.parse(output);
  } catch (error) {
    throw new Error(`${description} returned invalid JSON: ${error.message}`);
  }
  if (!Array.isArray(checks)) throw new Error(`${description} did not return a check array`);
  return checks.map(normalizeCheck);
}


function fetchSnapshot({ run, cwd, issue, prNumber, readiness }) {
  const { value: pr } = jsonCommand(run, cwd, 'gh', [
    'pr', 'view', String(prNumber), '--json',
    'number,title,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,mergedAt,mergeCommit,body',
  ]);
  const [, owner, name] = String(pr.url ?? '').match(/\/([^/]+)\/([^/]+)\/pull\/\d+\/?$/) ?? [];
  if (!owner || !name) throw new Error('pull request base repository is unavailable');
  const { value: threadData } = jsonCommand(run, cwd, 'gh', [
    'api', 'graphql',
    '-F', `owner=${owner}`,
    '-F', `name=${name}`,
    '-F', `number=${prNumber}`,
    '-f', `query=${REVIEW_THREADS_QUERY}`,
  ]);
  if (Array.isArray(threadData?.errors) && threadData.errors.length > 0) {
    const details = threadData.errors.map((error) => error?.message).filter(Boolean).join('; ');
    throw new Error(`GraphQL review thread query failed${details ? `: ${details}` : ''}`);
  }
  if (!threadData?.data?.repository?.pullRequest?.reviewThreads) {
    throw new Error('GraphQL review thread query returned no pull request');
  }
  const checksResult = command(run, cwd, 'gh', [
    'pr', 'checks', String(prNumber), '--required', '--json', 'name,state,bucket,link,event,workflow',
  ], { allowFailure: true });
  const runEvidenceCache = new Map();
  const resolveRun = (runId) => jsonCommand(run, cwd, 'gh', [
    'run', 'view', String(runId), '--json', 'event,headSha',
  ]).value;
  const checks = enrichMissingCheckEvents(
    parseChecksResult(checksResult, 'gh pr checks --required'),
    { headSha: pr.headRefOid, resolveRun, cache: runEvidenceCache },
  );
  const declaredEvidence = readiness.readiness?.evidence ?? readiness.readiness?.pendingEvidence ?? [];
  const allChecksResult = command(run, cwd, 'gh', [
    'pr', 'checks', String(prNumber), '--json', 'name,state,bucket,link,event,workflow',
  ], { allowFailure: true });
  const evidenceChecks = enrichMissingCheckEvents(
    parseChecksResult(allChecksResult, 'gh pr checks'),
    { headSha: pr.headRefOid, resolveRun, cache: runEvidenceCache },
  );
  const { value: issueData } = jsonCommand(run, cwd, 'gh', ['issue', 'view', String(issue), '--json', 'number,state,url']);
  const reviewConnection = threadData.data.repository.pullRequest.reviews;
  if (!reviewConnection || !Array.isArray(reviewConnection.nodes)) throw new Error('GraphQL review authors are unavailable');
  const reviews = reviewConnection.nodes.map((review, index) => ({
    id: review.id ?? `review-${index}`,
    authorLogin: review.author?.login ?? review.authorLogin,
    authorTypename: review.author?.__typename ?? review.authorTypename,
    state: review.state,
    submittedAt: review.submittedAt ?? '',
  }));
  const reviewThreads = threadData.data.repository.pullRequest.reviewThreads;
  const rawThreads = reviewThreads.nodes ?? [];
  const threads = rawThreads.map((thread) => {
    const author = threadAuthor(thread);
    return {
      id: thread.id,
      isResolved: thread.isResolved,
      isOutdated: thread.isOutdated,
      url: author.url,
      authorLogin: author.login,
      authorTypename: author.typename,
      path: author.path,
    };
  });
  const evidence = declaredEvidence;
  const declaredPrOnlyChecks = evidence
    .filter((item) => ['required_check', 'check_run'].includes(item.kind))
    .map((item) => item.name);
  const checkKeys = new Set(checks.map(
    (check) => `${canonicalCheckName(check.name, check.workflow)}\0${check.event}`,
  ));
  const snapshotChecks = [
    ...checks,
    ...evidenceChecks.filter((check) => {
      const key = `${canonicalCheckName(check.name, check.workflow)}\0${check.event}`;
      if (checkKeys.has(key)) return false;
      checkKeys.add(key);
      return true;
    }),
  ];
  const threadsComplete = reviewThreads.pageInfo?.hasNextPage === false
    && rawThreads.every((thread) => thread.comments?.pageInfo?.hasNextPage === false);
  const snapshot = {
    schemaVersion: 1,
    issue: { number: issueData.number, state: issueData.state },
    pullRequest: {
      ...pr,
      mergeCommitOid: pr.mergeCommit?.oid ?? pr.mergeCommitOid ?? null,
    },
    checks: snapshotChecks,
    reviews,
    threads,
    pagination: { checksComplete: true, reviewsComplete: reviewConnection.pageInfo?.hasNextPage === false, threadsComplete },
    requiredChecksConfigured: declaredPrOnlyChecks.length > 0,
    declaredPrOnlyChecks,
    verification: {
      status: readiness.implementationStatus === 'pass' ? 'pass' : readiness.status,
      headSha: pr.headRefOid,
    },
  };
  return { snapshot, rawThreads, pr, issueData, evidenceChecks };
}

function remediationPacket({
  issue,
  pr,
  classified,
  rawThreads,
  botLogins,
  handoffPath,
}) {
  const failingNames = new Set(classified.evidence.checks
    .filter((check) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(check.state))
    .map((check) => canonicalCheckName(check.name, check.workflow)));
  const failingChecks = classified.evidence.checks
    .filter((check) => failingNames.has(canonicalCheckName(check.name, check.workflow)))
    .map((check) => ({ name: canonicalCheckName(check.name, check.workflow), url: check.url }));
  const threads = rawThreads
    .filter((thread) => !thread.isResolved && !thread.isOutdated)
    .map((thread) => ({ thread, author: threadAuthor(thread) }))
    .filter(({ author }) => isBot(author, botLogins))
    .map(({ author }) => ({
      path: author.path, line: author.line, body: author.body, url: author.url,
      authorLogin: author.login, authorTypename: author.typename,
    }));
  return {
    schemaVersion: 1,
    kind: 'remediation_required',
    issue,
    pullRequest: pr.number,
    headSha: classified.headSha,
    reasonCode: classified.reasonCode,
    mergeStateStatus: classified.evidence.pullRequest?.mergeStateStatus ?? null,
    failingChecks,
    threads,
    handoffPath,
  };
}



function reconcileMergeability({ context, run, branch, observed, spec, publicationScope }) {
  const { cwd, issue } = context;
  const headBefore = command(run, cwd, 'git', ['rev-parse', 'HEAD']).stdout.trim();
  const dirty = parsePorcelain(command(run, cwd, 'git', ['status', '--porcelain=v1', '-z']).stdout)
    .filter((entry) => !entry.startsWith('.omp/'));
  if (dirty.length) return fail(context, 'dirty_tree', `Preserved local work: ${dirty.join(', ')}`);
  let conflicts = [];
  let inspection = '';
  let mergeStarted = false;
  try {
    const base = resolveDefaultBase({ run, cwd });
    if (observed.pr.baseRefName !== base || observed.pr.headRefName !== branch) throw new Error('PR base/head scope changed');
    command(run, cwd, 'git', ['fetch', '--no-tags', 'origin', `refs/heads/${base}`]);
    const baseSha = command(run, cwd, 'git', ['rev-parse', 'FETCH_HEAD']).stdout.trim();
    command(run, cwd, 'git', ['fetch', '--no-tags', 'origin', `refs/heads/${branch}`]);
    const remoteHead = command(run, cwd, 'git', ['rev-parse', 'FETCH_HEAD']).stdout.trim();
    if (!SHA.test(baseSha) || remoteHead !== headBefore || observed.pr.headRefOid !== remoteHead) {
      return reconciliationFailure(context, observed.pr, { ...observed.pr, headRefOid: remoteHead });
    }
    const mergeBase = command(run, cwd, 'git', ['merge-base', remoteHead, baseSha]).stdout.trim();
    const divergence = command(run, cwd, 'git', ['rev-list', '--left-right', '--count', `${baseSha}...${remoteHead}`]).stdout.trim();
    if (!SHA.test(mergeBase) || !/^\d+\s+\d+$/.test(divergence)) throw new Error('base/head inspection is unreadable');
    inspection = `base=${baseSha}, head=${remoteHead}, merge-base=${mergeBase}, divergence=${divergence}`;
    const trial = command(run, cwd, 'git', ['merge-tree', '--write-tree', '--name-only', '-z', remoteHead, baseSha], { allowFailure: true });
    const fields = String(trial.stdout).split('\0');
    const tree = fields.shift();
    for (const field of fields) {
      if (!field) break;
      conflicts.push(field);
    }
    if (![0, 1].includes(trial.status) || !SHA.test(tree ?? '')) throw new Error('isolated merge-tree inspection failed');
    const outside = conflicts.filter((file) => publicationPathDenied(file, {
      spec, readOnlyPaths: publicationScope.readOnlyPaths,
    }));
    if (outside.length) throw new Error(`conflicts outside approved delivery paths: ${outside.join(', ')}`);
    if (trial.status !== 0 || conflicts.length) throw new Error('isolated trial retains unresolved conflicts');
    const mergedPaths = command(run, cwd, 'git', ['diff', '--name-only', '-z', remoteHead, tree]).stdout.split('\0').filter(Boolean);
    if (mergedPaths.length) {
      const markers = command(run, cwd, 'git', [
        'grep', '-I', '-l', '-E', '^(<{7}|={7}|>{7})( |$)', tree, '--', ...mergedPaths,
      ], { allowFailure: true });
      if (markers.status !== 1) throw new Error(`merged tree has conflict markers or is unreadable: ${String(markers.stdout || markers.stderr).trim()}`);
    }
    const fresh = pullRequestByNumber({ run, cwd, prNumber: observed.pr.number });
    if (fresh.number !== observed.pr.number || fresh.headRefOid !== remoteHead || fresh.state !== 'OPEN') {
      return reconciliationFailure(context, observed.pr, fresh);
    }
    if (command(run, cwd, 'git', ['branch', '--show-current']).stdout.trim() !== branch
      || command(run, cwd, 'git', ['rev-parse', 'HEAD']).stdout.trim() !== remoteHead
      || parsePorcelain(command(run, cwd, 'git', ['status', '--porcelain=v1', '-z']).stdout)
        .some((entry) => !entry.startsWith('.omp/'))) throw new Error('local branch changed during inspection; preserved without merge');
    mergeStarted = true;
    command(run, cwd, 'git', ['merge', '--no-ff', '--no-edit', baseSha]);
    mergeStarted = false;
    const head = command(run, cwd, 'git', ['rev-parse', 'HEAD']).stdout.trim();
    if (head === remoteHead) throw new Error('fetched base is already included; GitHub mergeability remains unresolved');
    if (!SHA.test(head) || command(run, cwd, 'git', ['rev-parse', 'HEAD^{tree}']).stdout.trim() !== tree
      || command(run, cwd, 'git', ['rev-list', '--parents', '-n', '1', head]).stdout.trim() !== `${head} ${remoteHead} ${baseSha}`
      || parsePorcelain(command(run, cwd, 'git', ['status', '--porcelain=v1', '-z']).stdout)
        .some((entry) => !entry.startsWith('.omp/'))) throw new Error('actual merge differs from the isolated clean trial; preserved without push');
    const pushed = command(run, cwd, 'git', ['push', 'origin', `HEAD:refs/heads/${branch}`], { allowFailure: true });
    const remote = command(run, cwd, 'git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`]).stdout.trim().split(/\s+/);
    if (remote.length !== 2 || remote[0] !== head || remote[1] !== `refs/heads/${branch}`) {
      throw new Error(`reconciled head publication is unproven: ${String(pushed.stderr).trim()}`);
    }
    return fail(context, 'mergeability_reverification_required',
      `Base reconciliation changed #${issue} to ${head}; rerun full registered verification at the new source HEAD`, 'verify');
  } catch (error) {
    if (mergeStarted) {
      const aborted = command(run, cwd, 'git', ['merge', '--abort'], { allowFailure: true });
      if (aborted.status !== 0) inspection += '; merge abort failed; inspect the preserved worktree';
    }
    return fail(context, 'mergeability_defect', `${error.message}; ${inspection}; conflicted paths: ${conflicts.join(', ') || '(none)'}`);
  }
}

function reconcilePostMerge({ context, run, sleep, expected }) {
  const { cwd, issue } = context;
  let closeIssued = false;
  while (true) {
    const pr = jsonCommand(run, cwd, 'gh', [
      'pr', 'view', String(expected.number), '--json',
      'number,url,state,headRefOid,headRefName,baseRefName,mergedAt,mergeCommit,closingIssuesReferences,body',
    ]).value;
    if (pr.number !== expected.number || pr.headRefOid !== expected.headRefOid) {
      abortDelivery(reconciliationFailure(context, expected, pr));
    }
    const issueData = jsonCommand(run, cwd, 'gh', ['issue', 'view', String(issue), '--json', 'number,state,url']).value;
    const repositoryUrl = String(pr.url ?? '').replace(/\/pull\/[1-9]\d*\/?$/, '');
    if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+$/.test(repositoryUrl)
      || pr.url !== `${repositoryUrl}/pull/${expected.number}`
      || issueData.number !== issue || issueData.url !== `${repositoryUrl}/issues/${issue}`) {
      abortDelivery(fail(context, 'delivery_reconciliation_required', 'Observed issue/repository identity does not match the exact delivery target'));
    }
    const merged = pr.state === 'MERGED' && Boolean(pr.mergedAt) && SHA.test(pr.mergeCommit?.oid ?? '');
    const linked = Array.isArray(pr.closingIssuesReferences)
      && pr.closingIssuesReferences.some((item) => item.number === issue && item.url === issueData.url);
    if (merged && linked && issueData.state === 'CLOSED') return { pr, issueData };
    if (merged && !linked) abortDelivery(fail(context, 'delivery_linkage_unproven', `Merged PR #${pr.number} does not link issue #${issue}`));
    if (pr.state === 'CLOSED') abortDelivery(fail(context, 'merge_failed', `PR #${pr.number} closed without an exact-head merge`));
    if (merged && issueData.state === 'OPEN' && !closeIssued) {
      command(run, cwd, 'gh', ['issue', 'close', issueData.url], { allowFailure: true });
      closeIssued = true;
    } else if (merged && issueData.state === 'OPEN' && closeIssued) {
      abortDelivery(fail(context, 'merged_pr_child_still_open', `Issue #${issue} remains OPEN after exact linked PR #${pr.number} merged and close was attempted`));
    }
    sleep(POLL_INTERVAL_MS);
  }
}

function registeredGate({ fs, cwd, run, issue, spec, head, report }) {
  let directory = cwd;
  for (const segment of ['.omp', 'sdlc', 'verification']) {
    directory = path.join(directory, segment);
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw Object.assign(new Error('Verification artifact directory is unsafe'), { reasonCode: 'verification_recheck_invalid' });
    }
  }
  const artifactPath = path.join(cwd, '.omp', 'sdlc', 'verification', `${issue}.json`);
  const stat = fs.lstatSync(artifactPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) {
    throw Object.assign(new Error('Verification artifact must be a bounded regular file'), { reasonCode: 'verification_recheck_invalid' });
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const reportPath = path.relative(cwd, spec.verificationPath);
  let sourceHead = head;
  if (artifact.identity?.headSha !== head) {
    const parents = command(run, cwd, 'git', ['rev-list', '--parents', '-n', '1', 'HEAD']).stdout.trim().split(/\s+/);
    const changed = command(run, cwd, 'git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).stdout.trim().split(/\r?\n/);
    if (parents.length !== 2 || parents[0] !== head || changed.length !== 1 || changed[0] !== reportPath
      || artifact.identity?.headSha !== parents[1]) {
      throw Object.assign(new Error('Verification artifact is not from the current source HEAD'), { reasonCode: 'verification_recheck_invalid' });
    }
    sourceHead = parents[1];
  }
  const marker = [...report.matchAll(/^\*\*Verification head\*\*:\s*([0-9a-f]{40})\s*$/gm)];
  const repair = inspectVerificationArtifactRepair(artifact, { expectedIssueNumber: issue, expectedHeadSha: sourceHead });
  if (marker.length !== 1 || marker[0][1] !== sourceHead || repair.status === 'unverifiable'
    || artifact.ceiling !== null
    || !matchesRegisteredResults(cwd, artifact, {
      issue, specPath: spec.relative, gateHead: sourceHead, reportPath, run: (binary, args, options) => run(binary, args, options),
    })
    || artifact.results.some((result) => result.required && result.applicable && result.effectiveStatus !== 'passed')) {
    throw Object.assign(new Error('Registered steering validation is not complete and passing at this source HEAD'), {
      reasonCode: 'verification_recheck_invalid',
    });
  }
  return sourceHead;
}

function exactRemoteHead({ run, cwd, branch, head }) {
  const remote = command(run, cwd, 'git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`]);
  const [sha, ref, ...extra] = remote.stdout.trim().split(/\s+/);
  if (sha !== head || ref !== `refs/heads/${branch}` || extra.length) {
    throw Object.assign(new Error(`Remote issue branch ${branch} is not at local HEAD ${head}`), { reasonCode: 'delivery_reconciliation_required' });
  }
}

function cleanDeliveryTree({ run, cwd, allowedPaths = [] }) {
  const dirty = parsePorcelain(command(run, cwd, 'git', ['status', '--porcelain=v1', '-z']).stdout)
    .filter((entry) => !entry.startsWith('.omp/'));
  const unexpected = dirty.filter((entry) => !allowedPaths.includes(entry));
  if (unexpected.length) throw Object.assign(new Error(`Preserved local work: ${unexpected.join(', ')}`), { reasonCode: 'dirty_tree' });
  return dirty;
}
function publishPendingReport({ run, cwd, issue, reportPath, branch }) {
  command(run, cwd, 'git', ['add', '--', reportPath]);
  const staged = command(run, cwd, 'git', ['diff', '--cached', '--name-only', '-z']).stdout
    .split('\0').filter(Boolean);
  if (staged.length !== 1 || staged[0] !== reportPath) {
    throw Object.assign(new Error('Pending report publication includes unexpected staged paths'), { reasonCode: 'verification_publish_failed' });
  }
  const subject = `docs: record PR evidence for #${issue}`;
  command(run, cwd, 'git', ['commit', '-m', subject]);
  const push = command(run, cwd, 'git', ['push', 'origin', `HEAD:refs/heads/${branch}`], { allowFailure: true });
  if (push.status !== 0) {
    const publication = reconcileStagePublication({
      run, cwd, issue, step: 'deliver', expectedSubject: subject, allowedPaths: [reportPath],
    });
    if (!publication.passed) throw Object.assign(new Error(publication.summary), { reasonCode: publication.reasonCode });
  }
  const head = command(run, cwd, 'git', ['rev-parse', 'HEAD']).stdout.trim();
  exactRemoteHead({ run, cwd, branch, head });
  return head;
}

function remediationResult({ context, packet }) {
  const { cwd, fs, issue } = context;
  const directory = ensureDirectoryChain(fs, cwd, ['.omp', 'sdlc', 'remediation']);
  const relative = `.omp/sdlc/remediation/${issue}-deliver.json`;
  const absolute = path.join(directory, `${issue}-deliver.json`);
  if (fs.existsSync(absolute) && (fs.lstatSync(absolute).isSymbolicLink() || !fs.lstatSync(absolute).isFile())) {
    throw new Error('unsafe_remediation_path');
  }
  fs.writeFileSync(absolute, `${JSON.stringify(packet, null, 2)}\n`);
  const result = fail(context, packet.reasonCode, `PR #${packet.pullRequest} at ${packet.headSha} requires repair: ${packet.reasonCode}`, 'implement', [relative]);
  return { ...result, stdout: `${result.stdout}NMG_SDLC_REMEDIATION: ${JSON.stringify(packet)}\n`, remediation: packet };
}

function runDeliverUnlocked({
  issue,
  action = 'deliver',
  cwd = process.cwd(),
  run = defaultRun,
  fs = fsDefault,
  env = process.env,
  now = Date.now,
  sleep = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds),
} = {}) {
  const issueNumber = positiveIssue(issue);
  if (!issueNumber) throw new Error('issue must be a positive integer');
  const context = { cwd, fs, issue: issueNumber };
  try {
    const branch = command(run, cwd, 'git', ['branch', '--show-current']).stdout.trim();
    if (parseIssueBranch(branch)?.issueNumber !== issueNumber) {
      return fail(context, 'delivery_scope_mismatch', `Current branch ${branch || '(detached)'} does not belong to #${issueNumber}`);
    }
    let head = command(run, cwd, 'git', ['rev-parse', 'HEAD']).stdout.trim();
    if (!SHA.test(head)) return fail(context, 'delivery_scope_mismatch', 'Issue branch HEAD is unreadable');
    const spec = approvedSpec(fs, cwd, issueNumber, { requireReport: action !== 'prepare-version' });
    const { value: issueData } = jsonCommand(run, cwd, 'gh', [
      'issue', 'view', String(issueNumber), '--json', 'number,title,body,labels,state,url',
    ]);
    if (issueData.number !== issueNumber) return fail(context, 'issue_unreadable', `Issue #${issueNumber} identity is invalid`);
    let pr = existingPullRequest({ run, cwd, branch, issue: issueNumber });
    assertDeliveryRepository({ run, cwd, issueData, issue: issueNumber, pr });
    if (action === 'deliver' && pr?.state === 'MERGED') {
      if (pr.headRefOid !== head || pr.headRefName !== branch) return reconciliationFailure(context, { ...pr, headRefOid: head }, pr);
      const proof = reconcilePostMerge({ context, run, sleep, expected: pr });
      return writeHandoff({ ...context, status: 'passed',
        summary: `PR #${pr.number} merged at ${head}, issue #${issueNumber} closed`,
        artifacts: [proof.pr.url] });
    }
    if (issueData.state !== 'OPEN') return fail(context, 'delivery_reconciliation_required', `Issue #${issueNumber} is ${issueData.state} without a linked exact-head merged PR`);
    const reportPath = path.relative(cwd, spec.verificationPath);
    const dirty = cleanDeliveryTree({
      run, cwd, allowedPaths: action === 'prepare-pr-evidence' ? [reportPath] : [],
    });
    if (action === 'prepare-version') {
      if (pr) return fail(context, 'delivery_reconciliation_required', `Version preparation must precede PR #${pr.number}`);
      let versionChange;
      try {
        versionChange = synchronizeVersion({
          run, fs, cwd, issue: issueNumber, spec, issueData,
          tech: registeredTechnicalSteering(fs, cwd), now,
        });
      } catch (error) {
        if (error.reasonCode === 'major_bump_required') return fail(context, error.reasonCode, error.message);
        throw error;
      }
      const tech = registeredTechnicalSteering(fs, cwd);
      publishVersionChanges({
        run, cwd, issue: issueNumber, issueData,
        changed: versionChange.changed, allowedPaths: deliveryVersionArtifacts(tech, cwd, fs).paths,
      });
      const preparedHead = command(run, cwd, 'git', ['rev-parse', 'HEAD']).stdout.trim();
      exactRemoteHead({ run, cwd, branch, head: preparedHead });
      const prepared = {
        issue: issueNumber, version: versionChange.version,
        headSha: preparedHead, changedPaths: versionChange.changed,
      };
      return {
        status: 0,
        stdout: `NMG_SDLC_VERSION_PREPARED: ${JSON.stringify(prepared)}\n`,
        stderr: '',
        prepared,
        handoff: null,
      };
    }
    exactRemoteHead({ run, cwd, branch, head });
    const report = fs.readFileSync(spec.verificationPath, 'utf8');
    const readiness = inspectVerificationReadiness({
      content: report,
      options: { expectedIssueNumber: issueNumber, expectedSpecPath: spec.relative, expectedScope: spec.scope },
    });
    const acceptable = action === 'prepare-pr-evidence'
      ? readiness.status === 'pr_evidence_pending'
      : ['pass', 'pr_evidence_satisfied'].includes(readiness.status) && readiness.implementationStatus === 'pass';
    if (!acceptable) return fail(context, 'verification_not_ready', `Verification is not ready for ${action}: ${readiness.reasonCode}`);
    registeredGate({ fs, cwd, run, issue: issueNumber, spec, head, report });
    if (action === 'prepare-pr-evidence' && dirty.includes(reportPath)) {
      head = publishPendingReport({ run, cwd, issue: issueNumber, reportPath, branch });
      registeredGate({ fs, cwd, run, issue: issueNumber, spec, head, report });
      if (pr) pr = pullRequestByNumber({ run, cwd, prNumber: pr.number });
    }
    const base = resolveDefaultBase({ run, cwd });
    const tech = registeredTechnicalSteering(fs, cwd);
    const botLogins = configuredBotLogins(tech);
    const changedPaths = changedPathsForDelivery({ run, cwd, base: pr?.baseRefName ?? base });
    const pullRequestBody = buildDeliveryPullRequestBody({
      issue: issueNumber, specRelative: spec.relative, changedPaths, verificationReport: report,
    });
    requireContributionEvidence({
      run, fs, cwd, issue: issueNumber, title: pr?.title ?? issueData.title,
      body: pullRequestBody, changedPaths,
    });
    let current = pr;
    if (!current) {
      let created;
      try {
        created = createPullRequest({
          run, fs, cwd, issue: issueNumber, issueData, branch, base,
          draft: action === 'prepare-pr-evidence', body: pullRequestBody,
        });
      } catch (error) {
        current = existingPullRequest({ run, cwd, branch, issue: issueNumber });
        if (!current) throw error;
      }
      if (created) current = pullRequestByNumber({ run, cwd, prNumber: created.number });
    }
    assertDeliveryRepository({ run, cwd, issueData, issue: issueNumber, pr: current });
    if (current.number !== pr?.number && pr && current.url !== pr.url) {
      return reconciliationFailure(context, pr, current);
    }
    if (current.headRefName !== branch || current.baseRefName !== base || current.headRefOid !== head
      || !['OPEN', 'MERGED'].includes(current.state)) {
      return reconciliationFailure(context, { ...current, headRefOid: head }, current);
    }
    if (current.state === 'MERGED') {
      const proof = reconcilePostMerge({ context, run, sleep, expected: current });
      return writeHandoff({ ...context, status: 'passed', summary: `PR #${current.number} merged at ${head}, issue #${issueNumber} closed`, artifacts: [proof.pr.url] });
    }
    const contribution = evaluateContributionEvidenceAtRoot({
      run, fs, cwd, issue: issueNumber, title: current.title ?? issueData.title,
      body: current.body ?? '', changedPaths,
    });
    if (!contribution.ok) {
      const markers = String(current.body ?? '').match(/^<!-- nmg-sdlc-delivery-validation:.*-->$/gm) ?? [];
      const repairedBody = `${pullRequestBody.trimEnd()}${markers.length ? `\n\n${markers.join('\n')}` : ''}\n`;
      requireContributionEvidence({
        run, fs, cwd, issue: issueNumber, title: current.title ?? issueData.title,
        body: repairedBody, changedPaths,
      });
      editPullRequestBody({
        run, fs, cwd, issue: issueNumber, prNumber: current.number,
        body: repairedBody, name: 'pr-repair-body',
      });
      current = pullRequestByNumber({ run, cwd, prNumber: current.number });
    }
    if (action === 'prepare-pr-evidence') {
      if (!current.isDraft) return fail(context, 'verification_not_ready', `PR #${current.number} is not a controlled draft`);
      const observed = fetchSnapshot({ run, cwd, issue: issueNumber, prNumber: current.number, readiness });
      if (observed.pr.headRefOid !== head || observed.pr.state !== 'OPEN' || !observed.pr.isDraft) {
        return reconciliationFailure(context, current, observed.pr);
      }
      return prEvidenceRequest({ issue: issueNumber, pr: observed.pr, spec, readiness });
    }
    if (current.isDraft) {
      if (readiness.status !== 'pr_evidence_satisfied') {
        return fail(context, 'verification_not_ready', `Draft PR #${current.number} requires satisfied PR-only evidence`);
      }
      const observed = fetchSnapshot({ run, cwd, issue: issueNumber, prNumber: current.number, readiness });
      if (observed.pr.headRefOid !== head) return reconciliationFailure(context, current, observed.pr);
      const evidence = evidenceForHead(readiness, observed, head);
      if (!evidence) return fail(context, 'verification_not_ready', `Draft PR #${current.number} PR-only checks remain pending`);
      writeDeliveryValidation({
        run, fs, cwd, issue: issueNumber, issueTitle: observed.pr.title ?? issueData.title,
        spec, pr: observed.pr, headSha: head, evidence, pullRequestBody, changedPaths,
      });
      const validated = pullRequestByNumber({ run, cwd, prNumber: current.number });
      const validation = inspectDeliveryValidation({
        content: validated.body ?? '',
        options: {
          expectedIssueNumber: issueNumber, expectedSpecPath: spec.relative,
          expectedPullRequestNumber: current.number, expectedHeadSha: head,
          deliveryAcceptanceCriteria: readiness.issueScope.delivery.acceptanceCriteria,
          expectedEvidenceIdentities: readiness.readiness.evidence.map(evidenceIdentity),
        },
      });
      if (validation.status !== 'final_sha_validated' || validated.headRefOid !== head || !validated.isDraft) {
        return fail(context, 'verification_not_ready', `PR #${current.number} final-head evidence is invalid`);
      }
      command(run, cwd, 'gh', ['pr', 'ready', String(current.number)]);
    }
    while (true) {
      const observed = fetchSnapshot({ run, cwd, issue: issueNumber, prNumber: current.number, readiness });
      if (observed.pr.number !== current.number || observed.pr.headRefOid !== head
        || observed.pr.headRefName !== branch || observed.pr.baseRefName !== base) {
        return reconciliationFailure(context, { ...current, headRefOid: head }, observed.pr);
      }
      if (observed.pr.state === 'MERGED') {
        const proof = reconcilePostMerge({ context, run, sleep, expected: observed.pr });
        return writeHandoff({ ...context, status: 'passed',
          summary: `PR #${current.number} merged at ${head}, issue #${issueNumber} closed`,
          artifacts: [proof.pr.url] });
      }
      const classified = classifyPrDeliveryState(observed.snapshot, { issueNumber, botLogins });
      if (classified.reasonCode === 'human_review') return fail(context, 'human_review', `PR #${current.number} requires human review`);
      if (classified.reasonCode === 'mergeability_defect') {
        const publicationScope = inspectPublicationScope({
          cwd, issue: issueNumber, step: 'implement', spec: spec.relative, run,
        });
        return reconcileMergeability({
          context, run, branch, observed, spec: spec.relative, publicationScope,
        });
      }
      if (classified.status === 'remediate'
        && ['checks_failed', 'changes_requested', 'review_threads_unresolved'].includes(classified.reasonCode)) {
        const packet = remediationPacket({
          issue: issueNumber, pr: observed.pr, classified, rawThreads: observed.rawThreads,
          botLogins, handoffPath: `.omp/sdlc/handoffs/${issueNumber}-deliver.json`,
        });
        if (packet.threads.some((thread) => !thread.path)) {
          return fail(context, 'automatic_review_unactionable', `PR #${current.number} has an automated review thread without an actionable path`);
        }
        return remediationResult({ context, packet });
      }
      if (classified.status === 'pending') {
        sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (classified.status !== 'merge_ready') {
        return fail(context, classified.reasonCode ?? 'merge_failed', `PR #${current.number} is not mergeable: ${classified.reasonCode}`);
      }
      const refreshed = fetchSnapshot({ run, cwd, issue: issueNumber, prNumber: current.number, readiness });
      if (refreshed.pr.headRefOid !== head || refreshed.pr.number !== current.number) {
        return reconciliationFailure(context, { ...current, headRefOid: head }, refreshed.pr);
      }
      if (classifyPrDeliveryState(refreshed.snapshot, { issueNumber, botLogins }).status !== 'merge_ready') continue;
      cleanDeliveryTree({ run, cwd });
      if (command(run, cwd, 'git', ['branch', '--show-current']).stdout.trim() !== branch
        || command(run, cwd, 'git', ['rev-parse', 'HEAD']).stdout.trim() !== head) {
        return fail(context, 'delivery_reconciliation_required', 'Local issue branch changed before exact-head merge');
      }
      exactRemoteHead({ run, cwd, branch, head });
      registeredGate({ fs, cwd, run, issue: issueNumber, spec, head, report });
      writeSmokeDeliveryProof({ cwd, env, fs, issue: issueNumber, pullRequest: current.number, headSha: head });
      try {
        command(run, cwd, 'gh', ['pr', 'merge', String(current.number), '--squash', '--match-head-commit', head], { allowFailure: true });
      } catch {
        // A transport failure is not evidence that GitHub did not merge this exact head.
      }
      const proof = reconcilePostMerge({ context, run, sleep, expected: { ...current, headRefOid: head } });
      return writeHandoff({ ...context, status: 'passed',
        summary: `PR #${current.number} merged at ${head}, issue #${issueNumber} closed`,
        artifacts: [proof.pr.url] });
    }
  } catch (error) {
    if (error.deliveryResult) return error.deliveryResult;
    const reasonCode = error.reasonCode
      ?? (error.message === 'spec_not_approved' ? 'spec_not_approved'
        : error.message === 'verification_not_ready' ? 'verification_not_ready' : 'delivery_failed');
    return fail(context, reasonCode, `Delivery failed for #${issueNumber}: ${error.message}`);
  }
}

export function runDeliver(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  let leaseContext;
  const processApi = options.processApi ?? process;
  const signalHandlers = [];
  try {
    if (options.controllerRunId) {
      if (!assertControllerLease({ projectRoot: cwd, runId: options.controllerRunId })) {
        throw new Error('delivery_scope_mismatch');
      }
    } else {
      leaseContext = enterControllerLease({ projectRoot: cwd });
    }
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: `${error?.reasonCode || error?.message || 'delivery_scope_mismatch'}\n`,
      handoff: null,
      handoffPath: `.omp/sdlc/handoffs/${options.issue}-deliver.json`,
    };
  }
  if (leaseContext?.owned) {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => {
        releaseControllerLease(leaseContext.lease);
        leaseContext = null;
        processApi.exit(signal === 'SIGINT' ? 130 : 143);
      };
      processApi.once(signal, handler);
      signalHandlers.push([signal, handler]);
    }
  }
  try {
    return runDeliverUnlocked({ ...options, cwd });
  } finally {
    for (const [signal, handler] of signalHandlers) processApi.removeListener(signal, handler);
    if (leaseContext?.owned) releaseControllerLease(leaseContext.lease);
  }
}

function main() {
  let options;
  try {
    options = parseDeliverCli(process.argv.slice(2));
  } catch {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const result = runDeliver({ ...options, cwd: process.cwd() });
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status;
}

if (isCliEntry(import.meta.url, process.argv[1])) main();
