#!/usr/bin/env node

/**
 * Read-only canonical umbrella-spec classifier.
 *
 * The helper refreshes the remote default-branch objects without updating a
 * local branch or remote-tracking ref, then inspects Git trees directly.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { inspectEpicSpecAuthority, normalizeEpicScope } from './epic-spec-authority.mjs';

const MAX_REFS = 200;
const MAX_SPEC_PATHS_PER_REF = 200;
const MAX_GIT_OUTPUT = 8 * 1024 * 1024;
const SPEC_PATH_PATTERN = /^specs\/[a-z0-9][a-z0-9-]*\/?$/;
const AGGREGATE_PATH_PATTERN = /^specs\/epic-[a-z0-9][a-z0-9-]*$/;
const FEATURE_REQUIREMENTS_PATTERN = /^specs\/feature-[a-z0-9][a-z0-9-]*\/requirements\.md$/;
const REQUIRED_SPEC_FILES = new Set([
  'design.md',
  'feature.gherkin',
  'requirements.md',
  'tasks.md',
]);
const OPTIONAL_SPEC_FILES = new Set([
  'issue-scope.json',
  'verification-report.md',
]);
const ALLOWED_SPEC_FILES = new Set([
  ...REQUIRED_SPEC_FILES,
  ...OPTIONAL_SPEC_FILES,
]);

function boundedMessage(value) {
  const singleLine = String(value ?? '').replace(/\s+/g, ' ').trim();
  return singleLine.length > 300 ? `${singleLine.slice(0, 297)}...` : singleLine;
}

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: options.timeout ?? 30_000,
    maxBuffer: MAX_GIT_OUTPUT,
    env: process.env,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.error?.message ?? result.stderr ?? '',
  };
}

export function createAdapters(overrides = {}) {
  return {
    fs: overrides.fs ?? fs,
    run: overrides.run ?? defaultRun,
  };
}

function commandFailure(result) {
  return boundedMessage(result.stderr || result.stdout || `exit ${result.status ?? 'unknown'}`);
}

function normalizeGitPath(value) {
  return value.replaceAll('\\', '/').replace(/\/$/, '');
}

export function normalizeSpecPath(value) {
  if (typeof value !== 'string' || !SPEC_PATH_PATTERN.test(value)) return null;
  const normalized = normalizeGitPath(value);
  if (path.posix.normalize(normalized) !== normalized) return null;
  return normalized;
}

export function parsePositiveIssue(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function parseFrontmatterIssues(source) {
  const lines = source.split(/\r?\n/).filter((line) => /^\*\*Issues?\*\*:/.test(line));
  if (lines.length !== 1) return { ok: false, issues: [], reason: 'invalid_issue_frontmatter' };
  const values = [...lines[0].matchAll(/#(\d+)\b/g)].map((match) => Number(match[1]));
  if (values.length === 0 || values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    return { ok: false, issues: [], reason: 'invalid_issue_frontmatter' };
  }
  return { ok: true, issues: [...new Set(values)], reason: null };
}

function frontmatterClaimsIssue(source, issueNumber) {
  const issuePattern = new RegExp(`#${issueNumber}\\b`);
  return source.split(/\r?\n/).some((line) => (
    /^\*\*Issues?\*\*:/.test(line)
    && issuePattern.test(line)
  ));
}

function classifyIssueClaim(requirementsSource, designSource, issueNumber) {
  const requirementsIssues = parseFrontmatterIssues(requirementsSource);
  const requirementsClaim = frontmatterClaimsIssue(requirementsSource, issueNumber);
  const designClaim = frontmatterClaimsIssue(designSource, issueNumber);
  if (!requirementsIssues.ok) {
    return {
      ok: !(requirementsClaim || designClaim),
      relevant: requirementsClaim || designClaim,
      issues: [],
      reason: 'invalid_issue_frontmatter',
    };
  }
  if (requirementsIssues.issues.includes(issueNumber)) {
    return { ok: true, relevant: true, issues: requirementsIssues.issues, reason: null };
  }
  if (designClaim) {
    return { ok: false, relevant: true, issues: requirementsIssues.issues, reason: 'conflicting_issue_frontmatter' };
  }
  return { ok: true, relevant: false, issues: requirementsIssues.issues, reason: null };
}

function hasMultiPrTrigger(requirements, design) {
  if (/^## Multi-PR Rollout\s*$/im.test(design)) return true;
  return requirements.split(/\r?\n/).some((line) => (
    /^\s*\|\s*FR\d+\s*\|/i.test(line)
    && /\b(?:multiple\s+PRs|multi-PR)\b/i.test(line)
  ));
}

function git(projectRoot, args, adapters, options = {}) {
  return adapters.run('git', args, { cwd: projectRoot, timeout: options.timeout });
}

function resolveCommit(projectRoot, ref, adapters) {
  const result = git(projectRoot, ['rev-parse', '--verify', `${ref}^{commit}`], adapters);
  const commit = result.stdout.trim();
  if (!result.ok || !/^[0-9a-f]{40}$/i.test(commit)) {
    return { ok: false, reason: commandFailure(result) || `could not resolve ${ref}` };
  }
  return { ok: true, commit };
}

function readGitFile(projectRoot, commit, relativePath, adapters) {
  const result = git(projectRoot, ['show', `${commit}:${relativePath}`], adapters);
  if (!result.ok) return { ok: false, missing: result.status === 128, reason: commandFailure(result) };
  return { ok: true, source: result.stdout };
}

function resolveTree(projectRoot, commit, specPath, adapters) {
  const result = git(projectRoot, ['rev-parse', '--verify', `${commit}:${specPath}`], adapters);
  const objectId = result.stdout.trim();
  if (!result.ok || !/^[0-9a-f]{40}$/i.test(objectId)) {
    return { ok: false, missing: result.status === 128, reason: commandFailure(result) };
  }
  const type = git(projectRoot, ['cat-file', '-t', objectId], adapters);
  if (!type.ok || type.stdout.trim() !== 'tree') {
    return { ok: false, missing: false, reason: `expected tree object at ${specPath}` };
  }
  return { ok: true, tree: objectId };
}

function readJsonFile(projectRoot, commit, relativePath, adapters) {
  const file = readGitFile(projectRoot, commit, relativePath, adapters);
  if (!file.ok) return { ok: false, reason: file.reason };
  try {
    return { ok: true, value: JSON.parse(file.source) };
  } catch (error) {
    return { ok: false, reason: `${relativePath}: ${boundedMessage(error.message)}` };
  }
}

function changedPaths(projectRoot, baseCommit, sourceCommit, adapters) {
  const result = git(
    projectRoot,
    ['diff', '--name-only', '-z', `${baseCommit}...${sourceCommit}`, '--'],
    adapters,
  );
  if (!result.ok) return { ok: false, reason: commandFailure(result), paths: [] };
  return {
    ok: true,
    paths: result.stdout.split('\0').filter(Boolean).map(normalizeGitPath).sort(),
  };
}

function validateTreeEntries(projectRoot, commit, specPath, adapters) {
  const result = git(projectRoot, ['ls-tree', '-r', '-z', commit, '--', specPath], adapters);
  if (!result.ok) return { ok: false, fatal: true, reason: commandFailure(result) };
  const observedFiles = new Set();
  const prefix = `${specPath}/`;
  for (const entry of result.stdout.split('\0').filter(Boolean)) {
    const match = entry.match(/^(\d{6})\s+(\w+)\s+[0-9a-f]{40}\t(.+)$/i);
    if (!match) return { ok: false, fatal: false, reason: 'malformed_tree_entry' };
    if (match[1] === '120000') return { ok: false, fatal: false, reason: `symlink_not_allowed:${match[3]}` };
    const relativePath = match[3].startsWith(prefix) ? match[3].slice(prefix.length) : null;
    if (match[2] !== 'blob' || !relativePath || !ALLOWED_SPEC_FILES.has(relativePath)) {
      return { ok: false, fatal: false, reason: `unexpected_spec_entry:${match[3]}` };
    }
    observedFiles.add(relativePath);
  }
  for (const requiredFile of REQUIRED_SPEC_FILES) {
    if (!observedFiles.has(requiredFile)) {
      return { ok: false, fatal: false, reason: `missing_spec_entry:${specPath}/${requiredFile}` };
    }
  }
  return { ok: true };
}

function listRequirementPaths(projectRoot, commit, adapters) {
  const result = git(projectRoot, ['ls-tree', '-r', '--name-only', '-z', commit, '--', 'specs'], adapters);
  if (!result.ok) return { ok: false, reason: commandFailure(result), paths: [] };
  const paths = result.stdout.split('\0').filter((entry) => FEATURE_REQUIREMENTS_PATTERN.test(entry)).sort();
  if (paths.length > MAX_SPEC_PATHS_PER_REF) {
    return { ok: false, reason: `spec path limit exceeded (${paths.length} > ${MAX_SPEC_PATHS_PER_REF})`, paths: [] };
  }
  return { ok: true, paths };
}

function markerRetained(projectRoot, defaultCommit, issueNumber, specPath, adapters) {
  const subject = `^docs: seal umbrella spec for #${issueNumber}$`;
  const result = git(
    projectRoot,
    ['log', '--format=%H', `--grep=${subject}`, defaultCommit, '--', specPath],
    adapters,
  );
  return result.ok && /^[0-9a-f]{40}$/im.test(result.stdout);
}

function inspectSpecAtCommit(projectRoot, commit, specPath, adapters, options = {}) {
  const requirementsPath = `${specPath}/requirements.md`;
  const designPath = `${specPath}/design.md`;
  const requirements = readGitFile(projectRoot, commit, requirementsPath, adapters);
  if (!requirements.ok) return { ok: false, fatal: !requirements.missing, reason: requirements.reason };
  let issues = null;
  let design = null;
  if (options.issueFilter) {
    design = readGitFile(projectRoot, commit, designPath, adapters);
    if (!design.ok && !design.missing) {
      return { ok: false, fatal: true, reason: design.reason };
    }
    const claim = classifyIssueClaim(
      requirements.source,
      design.ok ? design.source : '',
      options.issueFilter,
    );
    if (!claim.ok) return { ok: false, fatal: false, reason: claim.reason };
    if (!claim.relevant) {
      return { ok: true, issues: claim.issues, tree: null, multiPr: null, filtered: true };
    }
    issues = { ok: true, issues: claim.issues };
  }
  design ??= readGitFile(projectRoot, commit, designPath, adapters);
  if (!design.ok) return { ok: false, fatal: !design.missing, reason: design.reason };
  const multiPr = hasMultiPrTrigger(requirements.source, design.source);
  if (!multiPr && options.ignoreNonMultiPr) {
    return { ok: true, issues: [], tree: null, multiPr: false, filtered: false };
  }
  issues ??= parseFrontmatterIssues(requirements.source);
  if (!issues.ok) return { ok: false, fatal: false, reason: issues.reason };
  const tree = resolveTree(projectRoot, commit, specPath, adapters);
  if (!tree.ok) return { ok: false, fatal: !tree.missing, reason: tree.reason };
  const entries = validateTreeEntries(projectRoot, commit, specPath, adapters);
  if (!entries.ok) return { ok: false, fatal: entries.fatal, reason: entries.reason };
  return {
    ok: true,
    issues: issues.issues,
    tree: tree.tree,
    multiPr,
    filtered: false,
  };
}

function discoverRemoteDefault(projectRoot, adapters) {
  const remote = git(projectRoot, ['remote', 'get-url', 'origin'], adapters);
  if (!remote.ok) return { ok: false, reasonCode: 'origin_unavailable', reason: commandFailure(remote) };

  const lsRemote = git(projectRoot, ['ls-remote', '--symref', 'origin', 'HEAD'], adapters, { timeout: 60_000 });
  if (!lsRemote.ok) return { ok: false, reasonCode: 'default_branch_discovery_failed', reason: commandFailure(lsRemote) };
  const lines = lsRemote.stdout.split(/\r?\n/).filter(Boolean);
  const symref = lines.find((line) => line.startsWith('ref: refs/heads/') && line.endsWith('\tHEAD'));
  const head = lines.find((line) => /^[0-9a-f]{40}\tHEAD$/i.test(line));
  const branch = symref?.match(/^ref: refs\/heads\/(.+)\tHEAD$/)?.[1];
  const commit = head?.split('\t')[0];
  if (!branch || !commit) {
    return { ok: false, reasonCode: 'default_branch_discovery_failed', reason: 'origin HEAD did not expose a symbolic default branch and commit' };
  }

  const fetch = git(
    projectRoot,
    ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', 'origin', commit],
    adapters,
    { timeout: 120_000 },
  );
  if (!fetch.ok) return { ok: false, reasonCode: 'default_branch_fetch_failed', reason: commandFailure(fetch) };
  const resolved = resolveCommit(projectRoot, commit, adapters);
  if (!resolved.ok) return { ok: false, reasonCode: 'default_commit_unavailable', reason: resolved.reason };
  return { ok: true, remote: 'origin', branch, commit: resolved.commit };
}

function listBoundedRefs(projectRoot, adapters) {
  const result = git(
    projectRoot,
    ['for-each-ref', '--format=%(refname)%09%(objectname)', 'refs/heads', 'refs/remotes/origin'],
    adapters,
  );
  if (!result.ok) return { ok: false, reason: commandFailure(result), refs: [] };
  const refs = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [ref, commit] = line.split('\t');
    return { ref, commit };
  }).filter(({ ref, commit }) => (
    ref !== 'refs/remotes/origin/HEAD'
    && /^[0-9a-f]{40}$/i.test(commit)
  )).sort((left, right) => left.ref.localeCompare(right.ref));
  if (refs.length > MAX_REFS) {
    return { ok: false, reason: `ref limit exceeded (${refs.length} > ${MAX_REFS})`, refs: [] };
  }
  return { ok: true, refs };
}

function collectCandidates(projectRoot, adapters, issueFilter = null, extraRefs = []) {
  const listed = listBoundedRefs(projectRoot, adapters);
  if (!listed.ok) return { ok: false, reason: listed.reason, candidates: [] };
  const refsByName = new Map(listed.refs.map((entry) => [entry.ref, entry]));
  for (const entry of extraRefs) refsByName.set(entry.ref, entry);
  if (refsByName.size > MAX_REFS) {
    return { ok: false, reason: `ref limit exceeded (${refsByName.size} > ${MAX_REFS})`, candidates: [] };
  }
  const refsByCommit = new Map();
  for (const { ref, commit } of [...refsByName.values()].sort((left, right) => left.ref.localeCompare(right.ref))) {
    const refs = refsByCommit.get(commit) ?? [];
    refs.push(ref);
    refsByCommit.set(commit, refs);
  }
  const byIdentity = new Map();
  const gaps = [];

  for (const [commit, refs] of refsByCommit) {
    const paths = listRequirementPaths(projectRoot, commit, adapters);
    if (!paths.ok) return { ok: false, reason: `${refs[0]}: ${paths.reason}`, candidates: [] };
    for (const requirementsPath of paths.paths) {
      const specPath = path.posix.dirname(requirementsPath);
      const inspected = inspectSpecAtCommit(projectRoot, commit, specPath, adapters, {
        ignoreNonMultiPr: true,
        issueFilter,
      });
      if (!inspected.ok) {
        const reason = `${refs[0]}:${specPath}: ${inspected.reason}`;
        if (inspected.fatal || issueFilter) {
          return { ok: false, reason, candidates: [], gaps: [] };
        }
        gaps.push(reason);
        continue;
      }
      if (!inspected.multiPr || inspected.filtered) continue;
      const key = `${specPath}\0${inspected.tree}`;
      const candidate = byIdentity.get(key) ?? {
        path: specPath,
        tree: inspected.tree,
        issues: inspected.issues,
        refs: [],
        sourceCommits: [],
      };
      candidate.refs.push(...refs);
      candidate.sourceCommits.push(commit);
      byIdentity.set(key, candidate);
    }
  }

  const candidates = [...byIdentity.values()].map((candidate) => ({
    ...candidate,
    refs: [...new Set(candidate.refs)].sort(),
    sourceCommits: [...new Set(candidate.sourceCommits)].sort(),
  })).sort((left, right) => left.path.localeCompare(right.path) || left.tree.localeCompare(right.tree));
  return { ok: true, candidates, gaps: gaps.sort() };
}

function baseResult(mode, projectRoot, remoteDefault) {
  return {
    schemaVersion: 1,
    mode,
    projectRoot,
    remote: remoteDefault.remote,
    defaultBranch: remoteDefault.branch,
    defaultCommit: remoteDefault.commit,
  };
}

function classifyCanonicalPath(projectRoot, remoteDefault, specPath, issueNumber, adapters) {
  const tree = resolveTree(projectRoot, remoteDefault.commit, specPath, adapters);
  if (!tree.ok) return { ok: false, missing: tree.missing, reason: tree.reason };
  const entries = validateTreeEntries(projectRoot, remoteDefault.commit, specPath, adapters);
  if (!entries.ok) return { ok: false, missing: false, reasonCode: 'default_spec_invalid', reason: entries.reason };
  const retained = markerRetained(projectRoot, remoteDefault.commit, issueNumber, specPath, adapters);
  return {
    ok: true,
    status: retained ? 'canonical' : 'canonical_marker_lost',
    reasonCode: retained ? 'default_tree_and_marker_present' : 'default_tree_present_marker_absent',
    defaultTree: tree.tree,
  };
}

function unverifiable(mode, projectRoot, details = {}) {
  return {
    schemaVersion: 1,
    mode,
    status: 'unverifiable',
    reasonCode: details.reasonCode ?? 'inspection_failed',
    projectRoot,
    remote: details.remote ?? 'origin',
    defaultBranch: details.defaultBranch ?? details.branch ?? null,
    defaultCommit: details.defaultCommit ?? details.commit ?? null,
    specPath: details.specPath ?? null,
    issueNumber: details.issueNumber ?? null,
    gaps: [boundedMessage(details.reason ?? 'inspection failed')],
  };
}

function classifyParentMode(projectRoot, issueNumber, remoteDefault, adapters) {
  const epicAuthority = inspectEpicSpecAuthority({
    project: projectRoot,
    source: remoteDefault.commit,
    mode: 'epic',
    issueNumber,
  });
  if (epicAuthority.aggregatePath && ['valid', 'planned'].includes(epicAuthority.status)) {
    const aggregateTree = resolveTree(
      projectRoot,
      remoteDefault.commit,
      epicAuthority.aggregatePath,
      adapters,
    );
    if (!aggregateTree.ok) {
      return unverifiable('parent', projectRoot, {
        ...remoteDefault,
        reasonCode: 'default_aggregate_tree_unavailable',
        reason: aggregateTree.reason,
        issueNumber,
        specPath: epicAuthority.aggregatePath,
      });
    }
    const retained = markerRetained(
      projectRoot,
      remoteDefault.commit,
      issueNumber,
      epicAuthority.aggregatePath,
      adapters,
    );
    return {
      ...baseResult('parent', projectRoot, remoteDefault),
      status: retained ? 'canonical' : 'canonical_marker_lost',
      reasonCode: retained ? 'default_aggregate_tree_and_marker_present' : 'default_aggregate_tree_present_marker_absent',
      issueNumber,
      specPath: epicAuthority.aggregatePath,
      specKind: 'epic-aggregate',
      authorityStatus: epicAuthority.status,
      authorityDigest: epicAuthority.evidenceDigest,
      defaultTree: aggregateTree.tree,
      candidates: [],
      gaps: [],
    };
  }
  if (!['aggregate_not_authored', 'legacy_cumulative_epic_spec'].includes(epicAuthority.reasonCode)) {
    return unverifiable('parent', projectRoot, {
      ...remoteDefault,
      reasonCode: epicAuthority.reasonCode,
      reason: epicAuthority.gaps?.join('; ') || `epic authority is ${epicAuthority.status}`,
      issueNumber,
      specPath: epicAuthority.aggregatePath,
    });
  }

  const paths = listRequirementPaths(projectRoot, remoteDefault.commit, adapters);
  if (!paths.ok) {
    return unverifiable('parent', projectRoot, {
      ...remoteDefault,
      reasonCode: 'default_spec_scan_failed',
      reason: paths.reason,
      issueNumber,
    });
  }
  const matches = [];
  for (const requirementsPath of paths.paths) {
    const specPath = path.posix.dirname(requirementsPath);
    const requirements = readGitFile(projectRoot, remoteDefault.commit, requirementsPath, adapters);
    if (!requirements.ok) {
      return unverifiable('parent', projectRoot, {
        ...remoteDefault,
        reasonCode: 'default_spec_scan_failed',
        reason: `${specPath}: ${requirements.reason}`,
        issueNumber,
        specPath,
      });
    }
    const parsed = parseFrontmatterIssues(requirements.source);
    if (parsed.ok && parsed.issues.includes(issueNumber)) {
      matches.push(specPath);
      continue;
    }
    const design = readGitFile(projectRoot, remoteDefault.commit, `${specPath}/design.md`, adapters);
    if (!design.ok && !design.missing) {
      return unverifiable('parent', projectRoot, {
        ...remoteDefault,
        reasonCode: 'default_spec_scan_failed',
        reason: `${specPath}: ${design.reason}`,
        issueNumber,
        specPath,
      });
    }
    const claim = classifyIssueClaim(
      requirements.source,
      design.ok ? design.source : '',
      issueNumber,
    );
    if (!claim.ok) {
      return unverifiable('parent', projectRoot, {
        ...remoteDefault,
        reasonCode: 'default_spec_invalid',
        reason: `${specPath}: ${claim.reason}`,
        issueNumber,
        specPath,
      });
    }
  }

  const base = { ...baseResult('parent', projectRoot, remoteDefault), issueNumber, gaps: [] };
  if (matches.length > 1) {
    return { ...base, status: 'ambiguous', reasonCode: 'multiple_default_paths_for_issue', specPath: null, candidates: matches.map((specPath) => ({ path: specPath })) };
  }
  if (matches.length === 1) {
    const canonical = classifyCanonicalPath(projectRoot, remoteDefault, matches[0], issueNumber, adapters);
    if (!canonical.ok) return unverifiable('parent', projectRoot, { ...remoteDefault, reasonCode: canonical.reasonCode, reason: canonical.reason, issueNumber, specPath: matches[0] });
    return {
      ...base,
      status: canonical.status,
      reasonCode: canonical.reasonCode,
      defaultTree: canonical.defaultTree,
      specPath: matches[0],
      candidates: [],
    };
  }

  const collected = collectCandidates(projectRoot, adapters, issueNumber);
  if (!collected.ok) return unverifiable('parent', projectRoot, { ...remoteDefault, reasonCode: 'candidate_scan_failed', reason: collected.reason, issueNumber });
  const pathsByName = new Set(collected.candidates.map((candidate) => candidate.path));
  const trees = new Set(collected.candidates.map((candidate) => candidate.tree));
  if (collected.candidates.length === 0) {
    return { ...base, status: 'unverifiable', reasonCode: 'parent_spec_not_found', specPath: null, candidates: [], gaps: [`No multi-PR spec for parent #${issueNumber} exists on the refreshed default branch or bounded refs.`] };
  }
  if (pathsByName.size === 1 && trees.size === 1) {
    return { ...base, status: 'stranded_recoverable', reasonCode: 'default_path_missing_single_tree', specPath: collected.candidates[0].path, candidates: collected.candidates };
  }
  return { ...base, status: 'ambiguous', reasonCode: pathsByName.size > 1 ? 'multiple_candidate_paths' : 'multiple_candidate_trees', specPath: null, candidates: collected.candidates };
}

function classifyPublicationMode(projectRoot, specPath, sourceRef, remoteDefault, adapters) {
  const source = resolveCommit(projectRoot, sourceRef, adapters);
  if (!source.ok) return unverifiable('publication', projectRoot, { ...remoteDefault, reasonCode: 'source_commit_unavailable', reason: source.reason, specPath });
  const inspected = inspectSpecAtCommit(projectRoot, source.commit, specPath, adapters);
  if (!inspected.ok) return unverifiable('publication', projectRoot, { ...remoteDefault, reasonCode: 'source_spec_invalid', reason: inspected.reason, specPath });
  const issueNumber = inspected.issues[0];
  const base = {
    ...baseResult('publication', projectRoot, remoteDefault),
    issueNumber,
    specPath,
    sourceCommit: source.commit,
    sourceTree: inspected.tree,
    gaps: [],
  };
  const defaultTree = resolveTree(projectRoot, remoteDefault.commit, specPath, adapters);
  if (!defaultTree.ok && !defaultTree.missing) return unverifiable('publication', projectRoot, { ...remoteDefault, reasonCode: 'default_tree_read_failed', reason: defaultTree.reason, specPath, issueNumber });
  if (!defaultTree.ok) {
    return {
      ...base,
      status: 'stranded_recoverable',
      reasonCode: 'default_path_missing_source_tree_available',
      defaultTree: null,
      candidates: [{ path: specPath, tree: inspected.tree, refs: [sourceRef], sourceCommits: [source.commit], issues: inspected.issues }],
    };
  }
  if (defaultTree.tree !== inspected.tree) {
    return { ...base, status: 'divergent', reasonCode: 'default_tree_differs_from_source', defaultTree: defaultTree.tree, candidates: [] };
  }
  const retained = markerRetained(projectRoot, remoteDefault.commit, issueNumber, specPath, adapters);
  return {
    ...base,
    status: retained ? 'canonical' : 'canonical_marker_lost',
    reasonCode: retained ? 'default_tree_and_marker_present' : 'default_tree_matches_marker_absent',
    defaultTree: defaultTree.tree,
    candidates: [],
  };
}

function classifyBundlePublicationMode(
  projectRoot,
  aggregatePath,
  childSpecPath,
  sourceRef,
  remoteDefault,
  adapters,
) {
  const source = resolveCommit(projectRoot, sourceRef, adapters);
  if (!source.ok) {
    return unverifiable('aggregate-child-publication', projectRoot, {
      ...remoteDefault,
      reasonCode: 'source_commit_unavailable',
      reason: source.reason,
      specPath: aggregatePath,
    });
  }
  const nestedEpicChild = AGGREGATE_PATH_PATTERN.test(childSpecPath);
  let epicIssue;
  let childIssue;
  let authority;
  if (nestedEpicChild) {
    const aggregateManifest = readJsonFile(projectRoot, source.commit, `${aggregatePath}/epic-scope.json`, adapters);
    const childManifest = readJsonFile(projectRoot, source.commit, `${childSpecPath}/epic-scope.json`, adapters);
    if (!aggregateManifest.ok || !childManifest.ok) {
      return unverifiable('aggregate-child-publication', projectRoot, {
        ...remoteDefault,
        reasonCode: 'source_nested_aggregate_link_invalid',
        reason: aggregateManifest.reason ?? childManifest.reason,
        specPath: !aggregateManifest.ok ? aggregatePath : childSpecPath,
      });
    }
    const normalizedAggregate = normalizeEpicScope(aggregateManifest.value, aggregatePath);
    const normalizedChild = normalizeEpicScope(childManifest.value, childSpecPath);
    epicIssue = normalizedAggregate.value.epicIssue;
    childIssue = normalizedChild.value.epicIssue;
    const nestedEntry = normalizedAggregate.value.children.find((child) => (
      child.issue === childIssue && child.specPath === childSpecPath
    ));
    const manifestGaps = [...normalizedAggregate.gaps, ...normalizedChild.gaps];
    if (!nestedEntry || nestedEntry.packageState !== 'canonical') {
      manifestGaps.push(`${aggregatePath}/epic-scope.json does not declare canonical nested epic #${childIssue ?? 'invalid'} at ${childSpecPath}`);
    }
    if (manifestGaps.length > 0) {
      return unverifiable('aggregate-child-publication', projectRoot, {
        ...remoteDefault,
        reasonCode: 'source_nested_aggregate_link_mismatch',
        reason: manifestGaps.join('; '),
        specPath: childSpecPath,
        issueNumber: childIssue,
      });
    }
    authority = inspectEpicSpecAuthority({
      project: projectRoot,
      source: source.commit,
      mode: 'epic',
      issueNumber: epicIssue,
      requestedChild: childIssue,
    });
  } else {
    const link = readJsonFile(projectRoot, source.commit, `${childSpecPath}/epic-link.json`, adapters);
    if (!link.ok) {
      return unverifiable('aggregate-child-publication', projectRoot, {
        ...remoteDefault,
        reasonCode: 'source_child_link_invalid',
        reason: link.reason,
        specPath: childSpecPath,
      });
    }
    epicIssue = Number(link.value?.epicIssue);
    childIssue = Number(link.value?.childIssue);
    if (!Number.isSafeInteger(epicIssue) || epicIssue <= 0
      || !Number.isSafeInteger(childIssue) || childIssue <= 0
      || link.value?.epicSpecPath !== aggregatePath
      || link.value?.childSpecPath !== childSpecPath) {
      return unverifiable('aggregate-child-publication', projectRoot, {
        ...remoteDefault,
        reasonCode: 'source_child_link_mismatch',
        reason: 'epic-link.json does not identify the requested aggregate and child paths',
        specPath: childSpecPath,
      });
    }
    authority = inspectEpicSpecAuthority({
      project: projectRoot,
      source: source.commit,
      mode: 'child',
      issueNumber: childIssue,
    });
  }
  if (authority.status !== 'valid') {
    return unverifiable('aggregate-child-publication', projectRoot, {
      ...remoteDefault,
      reasonCode: authority.reasonCode,
      reason: authority.gaps?.join('; ') || `child authority is ${authority.status}`,
      specPath: childSpecPath,
      issueNumber: childIssue,
    });
  }
  const aggregateSourceTree = resolveTree(projectRoot, source.commit, aggregatePath, adapters);
  const childSourceTree = resolveTree(projectRoot, source.commit, childSpecPath, adapters);
  if (!aggregateSourceTree.ok || !childSourceTree.ok) {
    return unverifiable('aggregate-child-publication', projectRoot, {
      ...remoteDefault,
      reasonCode: 'source_bundle_tree_unavailable',
      reason: aggregateSourceTree.reason ?? childSourceTree.reason,
      specPath: !aggregateSourceTree.ok ? aggregatePath : childSpecPath,
      issueNumber: childIssue,
    });
  }
  const aggregateDefaultTree = resolveTree(projectRoot, remoteDefault.commit, aggregatePath, adapters);
  const childDefaultTree = resolveTree(projectRoot, remoteDefault.commit, childSpecPath, adapters);
  if ((!aggregateDefaultTree.ok && !aggregateDefaultTree.missing)
    || (!childDefaultTree.ok && !childDefaultTree.missing)) {
    return unverifiable('aggregate-child-publication', projectRoot, {
      ...remoteDefault,
      reasonCode: 'default_bundle_tree_unavailable',
      reason: aggregateDefaultTree.reason ?? childDefaultTree.reason,
      specPath: !aggregateDefaultTree.ok && !aggregateDefaultTree.missing ? aggregatePath : childSpecPath,
      issueNumber: childIssue,
    });
  }
  const base = {
    ...baseResult('aggregate-child-publication', projectRoot, remoteDefault),
    issueNumber: childIssue,
    epicIssueNumber: epicIssue,
    specPath: childSpecPath,
    aggregatePath,
    childSpecPath,
    childSpecKind: nestedEpicChild ? 'epic-aggregate' : 'executable-child',
    sourceCommit: source.commit,
    authorityDigest: authority.evidenceDigest,
    sourceTrees: {
      aggregate: aggregateSourceTree.tree,
      child: childSourceTree.tree,
    },
    defaultTrees: {
      aggregate: aggregateDefaultTree.ok ? aggregateDefaultTree.tree : null,
      child: childDefaultTree.ok ? childDefaultTree.tree : null,
    },
    gaps: [],
  };
  if (aggregateDefaultTree.ok && childDefaultTree.ok
    && aggregateDefaultTree.tree === aggregateSourceTree.tree
    && childDefaultTree.tree === childSourceTree.tree) {
    return {
      ...base,
      status: 'canonical_marker_lost',
      reasonCode: 'default_aggregate_and_child_trees_match',
    };
  }
  if (childDefaultTree.ok && childDefaultTree.tree !== childSourceTree.tree) {
    return {
      ...base,
      status: 'divergent',
      reasonCode: 'default_bundle_partially_or_differently_present',
      gaps: ['default-branch child content differs from the approved aggregate/child source tree'],
    };
  }

  const changes = changedPaths(projectRoot, remoteDefault.commit, source.commit, adapters);
  if (!changes.ok) {
    return unverifiable('aggregate-child-publication', projectRoot, {
      ...remoteDefault,
      reasonCode: 'source_change_set_unavailable',
      reason: changes.reason,
      specPath: childSpecPath,
      issueNumber: childIssue,
    });
  }
  const aggregatePrefix = `${aggregatePath}/`;
  const childPrefix = `${childSpecPath}/`;
  const allowedAggregatePaths = aggregateDefaultTree.ok
    ? new Set([`${aggregatePath}/epic-scope.json`])
    : null;
  const unexpected = changes.paths.filter((changedPath) => {
    if (changedPath.startsWith(childPrefix)) return false;
    if (!changedPath.startsWith(aggregatePrefix)) return true;
    return allowedAggregatePaths ? !allowedAggregatePaths.has(changedPath) : false;
  });
  if (unexpected.length > 0) {
    return {
      ...base,
      status: 'divergent',
      reasonCode: 'publication_change_set_exceeds_bundle',
      changedPaths: changes.paths,
      gaps: unexpected.map((changedPath) => `unexpected publication path: ${changedPath}`),
    };
  }
  return {
    ...base,
    status: 'stranded_recoverable',
    reasonCode: aggregateDefaultTree.ok
      ? 'later_child_and_manifest_amendment_not_on_default'
      : 'first_child_aggregate_pair_not_on_default',
    changedPaths: changes.paths,
  };
}

function classifyAuditMode(projectRoot, remoteDefault, adapters) {
  const collected = collectCandidates(projectRoot, adapters, null, [{
    ref: `refs/remotes/origin/${remoteDefault.branch}`,
    commit: remoteDefault.commit,
  }]);
  if (!collected.ok) return unverifiable('audit', projectRoot, { ...remoteDefault, reasonCode: 'candidate_scan_failed', reason: collected.reason });
  const byPath = new Map();
  for (const candidate of collected.candidates) {
    const values = byPath.get(candidate.path) ?? [];
    values.push(candidate);
    byPath.set(candidate.path, values);
  }
  const issuePaths = new Map();
  for (const candidate of collected.candidates) {
    for (const issue of candidate.issues) {
      const paths = issuePaths.get(issue) ?? new Set();
      paths.add(candidate.path);
      issuePaths.set(issue, paths);
    }
  }

  const findings = [];
  for (const [specPath, candidates] of [...byPath.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const issues = [...new Set(candidates.flatMap((candidate) => candidate.issues))].sort((a, b) => a - b);
    const ambiguousIssue = issues.find((issue) => (issuePaths.get(issue)?.size ?? 0) > 1);
    const defaultTree = resolveTree(projectRoot, remoteDefault.commit, specPath, adapters);
    if (!defaultTree.ok && !defaultTree.missing) {
      findings.push({ status: 'unverifiable', reasonCode: 'default_tree_read_failed', path: specPath, issues, defaultTree: null, candidates, gaps: [defaultTree.reason] });
      continue;
    }
    if (ambiguousIssue) {
      findings.push({ status: 'ambiguous', reasonCode: 'issue_maps_to_multiple_paths', path: specPath, issues, defaultTree: defaultTree.ok ? defaultTree.tree : null, candidates, gaps: [] });
      continue;
    }
    const distinctTrees = new Set(candidates.map((candidate) => candidate.tree));
    if (!defaultTree.ok) {
      findings.push({
        status: distinctTrees.size === 1 ? 'stranded_recoverable' : 'ambiguous',
        reasonCode: distinctTrees.size === 1 ? 'default_path_missing_single_tree' : 'default_path_missing_multiple_trees',
        path: specPath,
        issues,
        defaultTree: null,
        candidates,
        gaps: [],
      });
      continue;
    }
    const noncanonical = candidates.filter((candidate) => candidate.tree !== defaultTree.tree);
    if (noncanonical.length > 0) {
      findings.push({ status: 'divergent', reasonCode: 'default_tree_has_noncanonical_candidates', path: specPath, issues, defaultTree: defaultTree.tree, candidates: noncanonical, gaps: [] });
      continue;
    }
    const issueNumber = issues[0];
    const retained = issueNumber ? markerRetained(projectRoot, remoteDefault.commit, issueNumber, specPath, adapters) : false;
    findings.push({
      status: retained ? 'canonical' : 'canonical_marker_lost',
      reasonCode: retained ? 'default_tree_and_marker_present' : 'default_tree_present_marker_absent',
      path: specPath,
      issues,
      defaultTree: defaultTree.tree,
      candidates: [],
      gaps: [],
    });
  }

  return {
    ...baseResult('audit', projectRoot, remoteDefault),
    status: collected.gaps.length > 0 || findings.some((finding) => finding.status !== 'canonical' && finding.status !== 'canonical_marker_lost') ? 'findings' : 'canonical',
    reasonCode: findings.length === 0 && collected.gaps.length === 0
      ? 'no_multi_pr_specs_found'
      : 'audit_complete',
    findings,
    gaps: collected.gaps,
  };
}

export function inspectUmbrellaSpec(options, adapters = createAdapters()) {
  let projectRoot;
  try {
    projectRoot = adapters.fs.realpathSync(options.project);
  } catch (error) {
    return unverifiable(options.mode, path.resolve(options.project), { reasonCode: 'project_root_unavailable', reason: error.message });
  }
  const topLevel = git(projectRoot, ['rev-parse', '--show-toplevel'], adapters);
  if (!topLevel.ok) return unverifiable(options.mode, projectRoot, { reasonCode: 'not_a_git_repository', reason: commandFailure(topLevel) });
  let gitRoot;
  try {
    gitRoot = adapters.fs.realpathSync(topLevel.stdout.trim());
  } catch (error) {
    return unverifiable(options.mode, projectRoot, { reasonCode: 'git_root_unavailable', reason: error.message });
  }
  if (gitRoot !== projectRoot) return unverifiable(options.mode, projectRoot, { reasonCode: 'project_root_mismatch', reason: `resolved project root is ${gitRoot}` });

  const remoteDefault = discoverRemoteDefault(projectRoot, adapters);
  if (!remoteDefault.ok) return unverifiable(options.mode, projectRoot, remoteDefault);
  if (options.mode === 'parent') return classifyParentMode(projectRoot, options.issueNumber, remoteDefault, adapters);
  if (options.mode === 'publication') return classifyPublicationMode(projectRoot, options.specPath, options.source, remoteDefault, adapters);
  if (options.mode === 'aggregate-child-publication') {
    return classifyBundlePublicationMode(
      projectRoot,
      options.aggregatePath,
      options.childSpecPath,
      options.source,
      remoteDefault,
      adapters,
    );
  }
  return classifyAuditMode(projectRoot, remoteDefault, adapters);
}

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string' },
      'parent-issue': { type: 'string' },
      spec: { type: 'string' },
      aggregate: { type: 'string' },
      'child-spec': { type: 'string' },
      source: { type: 'string' },
      all: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return { help: true };
  if (!values.project) throw new Error('--project is required');
  if (!values.json) throw new Error('--json is required');
  const bundleMode = Boolean(values.aggregate || values['child-spec']);
  const selectedModes = [Boolean(values['parent-issue']), Boolean(values.spec), bundleMode, values.all].filter(Boolean).length;
  if (selectedModes !== 1) throw new Error('choose exactly one mode: --parent-issue, --spec, --aggregate with --child-spec, or --all');
  if (values['parent-issue']) {
    const issueNumber = parsePositiveIssue(values['parent-issue']);
    if (!issueNumber) throw new Error('--parent-issue must be a positive integer');
    if (values.source) throw new Error('--source is valid only with --spec');
    return { project: values.project, mode: 'parent', issueNumber };
  }
  if (values.spec) {
    const specPath = normalizeSpecPath(values.spec);
    if (!specPath) throw new Error('--spec must be a normalized path below specs/');
    if (!values.source) throw new Error('--source is required with --spec');
    return { project: values.project, mode: 'publication', specPath, source: values.source };
  }
  if (bundleMode) {
    const aggregatePath = normalizeSpecPath(values.aggregate);
    const childSpecPath = normalizeSpecPath(values['child-spec']);
    if (!aggregatePath || !AGGREGATE_PATH_PATTERN.test(aggregatePath)) {
      throw new Error('--aggregate must be a normalized specs/epic-<slug> path');
    }
    if (!childSpecPath || childSpecPath === aggregatePath) {
      throw new Error('--child-spec must be a normalized executable child or distinct nested epic aggregate path below specs/');
    }
    if (!values.source) throw new Error('--source is required with --aggregate and --child-spec');
    return { project: values.project, mode: 'aggregate-child-publication', aggregatePath, childSpecPath, source: values.source };
  }
  if (values.source) throw new Error('--source is valid only with --spec or --aggregate/--child-spec');
  return { project: values.project, mode: 'audit' };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/umbrella-spec-status.mjs --project <path> --parent-issue <N> --json',
    '  node scripts/umbrella-spec-status.mjs --project <path> --spec <specs/path> --source <commit-ish> --json',
    '  node scripts/umbrella-spec-status.mjs --project <path> --aggregate <specs/epic-path> --child-spec <specs/child-path> --source <commit-ish> --json',
    '  node scripts/umbrella-spec-status.mjs --project <path> --all --json',
  ].join('\n');
}

function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Argument error: ${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = inspectUmbrellaSpec(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
