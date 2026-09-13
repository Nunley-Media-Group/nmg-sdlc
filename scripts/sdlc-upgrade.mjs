#!/usr/bin/env node
/**
 * sdlc-upgrade.mjs
 * v3 upgrade detectors and apply (testable, no live GitHub).
 *
 * Exports:
 *   detectUpgrade(root)
 *   applyUpgrade(root, approvedItemIds)
 *   detectPublicationUpgrade(root, { specDirs })
 *   applyPublicationUpgrade(root, approvedItemId, { specDirs })
 *
 * Detectors are read-only. Apply mutates only explicitly approved authority.
 * Never mutates the caller's specs/ unless the caller passes a temp root.
 * Legacy body relations are migration evidence only.
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyBlockedByEdges,
  createIssueDependencyClient,
  parseLegacyDependencyEvidence,
  preflightBlockedByEdges,
  readDependencyGraph,
} from './issue-dependencies.mjs';
import { isCliEntry } from './plugin-controller-path.mjs';
import { backfillSpecCreatedLabels } from './spec-created-label.mjs';
import { hasOmpSdlcIgnore, writeOmpSdlcIgnore } from './omp-sdlc-ignore.mjs';
import { canonicalSnippetRecord, createInitializePlan, steeringSourceDigest } from './sdlc-steering.mjs';
import { parseDeliveryTaskFileLines, publicationFileEntries } from './sdlc-safe-recoveries.mjs';

const LEGACY_DIR_PREFIX_RE = /^(feature|bug|epic)-/;
const NUM_SLUG_RE = /^(\d+)-(.*)$/;
const SPEC_DIR_RE = /^specs\/[^/]+$/;

const V2_CLEANUP_FILES = [
  'sdlc-config.json',
  '.codex/unattended-mode',
  '.codex/sdlc-state.json',
];
const V2_GITIGNORE_HEADERS = new Set([
  '# SDLC runner config',
  '# SDLC runner artifacts',
]);
const V2_GITIGNORE_ENTRIES = new Set(V2_CLEANUP_FILES);

function safeRead(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function safeReadBuffer(p) {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

function safeStat(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function isDir(p) {
  const s = safeStat(p);
  return !!s && s.isDirectory();
}

function isFile(p) {
  const s = safeStat(p);
  return !!s && s.isFile();
}

function listDir(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true });
  } catch {
    return [];
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonSafe(p) {
  const txt = safeRead(p);
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return { __invalid: true };
  }
}

function extractIssueNumbersFromContent(content) {
  const nums = [];
  const re = /^\*\*(Issues?)\*\*:\s*(.*?)\s*$/gm;
  let m;
  while ((m = re.exec(String(content || ''))) !== null) {
    const body = m[2] || '';
    for (const mm of body.matchAll(/#?([1-9]\d*)/g)) {
      nums.push(parseInt(mm[1], 10));
    }
  }
  return [...new Set(nums)];
}

function extractPrimaryN(content, dirName) {
  const fromContent = extractIssueNumbersFromContent(content);
  if (fromContent.length > 0) return fromContent[0];
  const m = String(dirName || '').match(/^(\d+)-/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function deriveSlug(dirName) {
  let s = String(dirName || '');
  s = s.replace(LEGACY_DIR_PREFIX_RE, '');
  s = s.replace(/^\d+-/, '');
  // normalize: lowercase, non alnum- to -, collapse
  s = s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!s) s = 'legacy';
  return s;
}

function hasOmpExtensions(root) {
  const pkgPath = path.join(root, 'package.json');
  const txt = safeRead(pkgPath);
  if (!txt) return false;
  try {
    const pkg = JSON.parse(txt);
    const exts = pkg?.omp?.extensions;
    return Array.isArray(exts) && exts.length > 0;
  } catch {
    return false;
  }
}

function hasLegacyCodexPlugin(root) {
  return isFile(path.join(root, '.codex-plugin', 'plugin.json'));
}

function hasLegacyLayout(root) {
  const codex = path.join(root, '.codex');
  return isDir(path.join(codex, 'steering')) || isDir(path.join(codex, 'specs'));
}

function listSpecDirs(root) {
  const specsDir = path.join(root, 'specs');
  if (!isDir(specsDir)) return [];
  return listDir(specsDir)
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name,
      full: path.join(specsDir, d.name),
      rel: `specs/${d.name}`,
    }));
}

const ISSUE_SPEC_DIR_RE = /^specs\/([1-9]\d*)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];

function publicationContractError(reasonCode, message) {
  const error = new Error(message);
  error.reasonCode = reasonCode;
  return error;
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch {
    return null;
  }
}

function rejectSymlinkedPath(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const stat = lstatOrNull(cursor);
    if (!stat) break;
    if (stat.isSymbolicLink()) {
      throw publicationContractError(
        'publication_root_symlink',
        `Repository root input traverses a symlink: ${cursor}`,
      );
    }
  }
}

function requirePlainDirectory(target, reasonCode, message) {
  const stat = lstatOrNull(target);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw publicationContractError(reasonCode, message);
  }
}

function publicationFileIdentity(stat) {
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    mode: stat.mode,
    size: stat.size,
  };
}

function samePublicationFileIdentity(stat, identity) {
  return Boolean(stat)
    && stat.isFile()
    && !stat.isSymbolicLink()
    && Boolean(identity)
    && String(stat.dev) === identity.device
    && String(stat.ino) === identity.inode
    && stat.mode === identity.mode
    && stat.size === identity.size;
}

function requireApprovedIssueFrontmatter(source, issue, relativePath) {
  const issueLines = [...source.matchAll(/^\*\*(Issues?)\*\*:\s*(.*?)\s*$/gm)];
  const statusLines = [...source.matchAll(/^\*\*Status\*\*:\s*(.*?)\s*$/gm)];
  if (
    issueLines.length !== 1
    || issueLines[0][1] !== 'Issue'
    || issueLines[0][2] !== `#${issue}`
  ) {
    throw publicationContractError(
      'publication_spec_issue_invalid',
      `${relativePath} must declare singular **Issue**: #${issue}`,
    );
  }
  if (statusLines.length !== 1 || statusLines[0][1] !== 'Approved') {
    throw publicationContractError(
      'publication_spec_not_approved',
      `${relativePath} must declare **Status**: Approved`,
    );
  }
}

function inventoryPublicationPackage(root, specDir) {
  const packageFull = path.join(root, ...specDir.split('/'));
  const files = [];
  const visit = (directory, relativeDirectory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw publicationContractError(
          'publication_spec_symlink',
          `Selected spec package contains a symlink: ${relativePath}`,
        );
      }
      if (entry.isDirectory()) {
        visit(full, relativePath);
      } else if (entry.isFile()) {
        const stat = fs.lstatSync(full);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw publicationContractError(
            'publication_spec_entry_invalid',
            `Selected spec package entry identity changed: ${relativePath}`,
          );
        }
        const bytes = fs.readFileSync(full);
        files.push({
          path: relativePath,
          sourceDigest: createHash('sha256').update(bytes).digest('hex'),
          identity: publicationFileIdentity(stat),
        });
      } else {
        throw publicationContractError(
          'publication_spec_entry_invalid',
          `Selected spec package contains an unsupported entry: ${relativePath}`,
        );
      }
    }
  };
  visit(packageFull, specDir);
  return files;
}

function validatePublicationSpecDirs(root, specDirs) {
  if (!Array.isArray(specDirs) || specDirs.length === 0) {
    throw publicationContractError(
      'publication_spec_selection_required',
      'Publication-only detection requires at least one explicit --spec selection',
    );
  }
  const rootInput = path.resolve(root);
  rejectSymlinkedPath(rootInput);
  requirePlainDirectory(rootInput, 'publication_root_invalid', `Repository root is not a plain directory: ${rootInput}`);
  const rootReal = fs.realpathSync.native(rootInput);
  const specsFull = path.join(rootReal, 'specs');
  requirePlainDirectory(specsFull, 'publication_specs_root_invalid', `Spec root is not a plain directory: ${specsFull}`);

  const selected = [];
  const seen = new Set();
  for (const value of specDirs) {
    if (typeof value !== 'string' || value.length === 0) {
      throw publicationContractError('publication_spec_selection_invalid', 'Selected spec directory must be a non-empty string');
    }
    const normalized = value.replaceAll('\\', '/');
    const match = ISSUE_SPEC_DIR_RE.exec(normalized);
    if (!match || path.isAbsolute(value) || normalized.includes('/../') || normalized.includes('/./')) {
      throw publicationContractError(
        'publication_spec_selection_invalid',
        `Selected spec directory must match specs/{N}-{slug}: ${value}`,
      );
    }
    if (seen.has(normalized)) {
      throw publicationContractError(
        'publication_spec_selection_duplicate',
        `Selected spec directory is duplicated: ${normalized}`,
      );
    }
    seen.add(normalized);
    const packageFull = path.join(rootReal, ...normalized.split('/'));
    const packageStat = lstatOrNull(packageFull);
    if (packageStat?.isSymbolicLink()) {
      throw publicationContractError(
        'publication_spec_symlink',
        `Selected spec package must not be a symlink: ${normalized}`,
      );
    }
    requirePlainDirectory(
      packageFull,
      'publication_spec_missing',
      `Selected spec package is missing or not a plain directory: ${normalized}`,
    );
    if (path.dirname(packageFull) !== specsFull || fs.realpathSync.native(packageFull) !== packageFull) {
      throw publicationContractError(
        'publication_spec_outside_root',
        `Selected spec package is outside the canonical specs root: ${normalized}`,
      );
    }
    for (const name of REQUIRED_SPEC_FILES) {
      const relativePath = `${normalized}/${name}`;
      const full = path.join(packageFull, name);
      const stat = lstatOrNull(full);
      if (!stat?.isFile() || stat.isSymbolicLink()) {
        throw publicationContractError(
          'publication_spec_incomplete',
          `Selected spec package requires a plain ${relativePath}`,
        );
      }
      requireApprovedIssueFrontmatter(fs.readFileSync(full, 'utf8'), Number(match[1]), relativePath);
    }
    selected.push({
      name: path.basename(normalized),
      full: packageFull,
      rel: normalized,
      files: inventoryPublicationPackage(rootReal, normalized),
    });
  }
  return {
    root: rootReal,
    selected: selected.sort((a, b) => a.rel.localeCompare(b.rel)),
  };
}

function hasEpicArtifacts(root) {
  const specsDir = path.join(root, 'specs');
  if (!isDir(specsDir)) return false;
  const entries = listDir(specsDir);
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith('epic-')) return true;
  }
  // also scan for epic-link anywhere under specs
  function scan(dir) {
    for (const ent of listDir(dir)) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (scan(p)) return true;
      } else if (ent.name === 'epic-link.json' || ent.name === 'epic-scope.json') {
        return true;
      }
    }
    return false;
  }
  return scan(specsDir);
}

function hasAnyIssueScope(root) {
  const specsDir = path.join(root, 'specs');
  if (!isDir(specsDir)) return false;
  function scan(dir) {
    for (const ent of listDir(dir)) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (scan(p)) return true;
      } else if (ent.name === 'issue-scope.json') {
        return true;
      }
    }
    return false;
  }
  return scan(specsDir);
}

function extractIssueFromAdr(content) {
  const text = String(content || '');
  const patterns = [
    /^\*\*Issue\*\*:\s*#?([1-9]\d*)\s*$/m,
    /^#\s*Issue:\s*#?([1-9]\d*)/m,
    /\bIssue:\s*#([1-9]\d*)/i,
    /\bissue\s+#([1-9]\d*)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function isSpikeAdr(content, filename) {
  const text = String(content || '');
  if (/^\*\*SDLC-Migrated\*\*:/m.test(text)) return false;
  const head = `${filename}\n${text.slice(0, 4000)}`;
  return /\bspike\b/i.test(head);
}
function slugFromAdrFilename(filename) {
  return deriveSlug(String(filename || '').replace(/\.md$/i, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
}

function listSpikeAdrs(root) {
  const dir = path.join(root, 'docs', 'decisions');
  if (!isDir(dir)) return [];
  const found = [];
  for (const ent of listDir(dir)) {
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
    const full = path.join(dir, ent.name);
    const txt = safeRead(full) || '';
    if (!isSpikeAdr(txt, ent.name)) continue;
    found.push({
      name: ent.name,
      full,
      rel: `docs/decisions/${ent.name}`,
      issue: extractIssueFromAdr(txt),
      slug: slugFromAdrFilename(ent.name),
      body: txt,
    });
  }
  return found;
}

function leftoverSpikeBundles(root) {
  const candidates = [
    'agents/spike-researcher.md',
    'workflows/draft-issue/references/spike-template.md',
    'workflows/write-spec/references/spike-variant.md',
  ];
  return candidates.filter((rel) => isFile(path.join(root, rel)));
}

function issueFormHasSpike(root) {
  const p = path.join(root, '.github', 'ISSUE_TEMPLATE', 'nmg-sdlc-ready-issue.yml');
  const txt = safeRead(p);
  return Boolean(txt && /^\s*-\s*Spike\s*$/m.test(txt));
}

function hasLeftoverSpikeArtifacts(root) {
  return leftoverSpikeBundles(root).length > 0
    || listSpikeAdrs(root).length > 0
    || issueFormHasSpike(root);
}

function seedConvertedSpikeSpec(issueN, slug, adrRel, adrBody) {
  const date = new Date().toISOString().slice(0, 10);
  const fm = [
    `**Issue**: #${issueN}`,
    `**Date**: ${date}`,
    '**Status**: Draft',
    '**Author**: Unknown',
    `**Related Spec**: ${adrRel}`,
    '',
  ].join('\n');
  const quote = String(adrBody || '').split(/\r?\n/).slice(0, 12).map((line) => `> ${line}`).join('\n');
  const history = [
    '',
    '## Historical spike',
    '',
    `Converted from leftover spike ADR \`${adrRel}\`. Research is not an executable type.`,
    '',
    quote,
    '',
  ].join('\n');
  return {
    'requirements.md': `# Requirements: Converted spike #${issueN}\n\n${fm}---\n\n## User Story\n\n**As a** maintainer\n**I want** this leftover spike converted to an ordinary spec\n**So that** execute can require an approved four-file package\n\n## Acceptance Criteria\n\n### AC1: Ordinary spec exists\n\n**Given** leftover spike research\n**When** upgrade converts it\n**Then** specs/${issueN}-${slug}/ exists with singular **Issue**: #${issueN}\n\n## Change History\n\n| Issue | Date | Summary |\n|-------|------|---------|\n| #${issueN} | ${date} | Converted leftover spike ADR |\n${history}`,
    'design.md': `# Design: Converted spike #${issueN}\n\n${fm}---\n\n## Overview\n\nSeeded from leftover spike ADR \`${adrRel}\`. Replace this design during \`/sdlc-write-spec #${issueN}\`.\n${history}`,
    'tasks.md': `# Tasks: Converted spike #${issueN}\n\n${fm}---\n\n### T001: Author the ordinary implementation spec\n\n**File(s)**: \`specs/${issueN}-${slug}/\`\n**Type**: Modify\n**Depends**: None\n**Acceptance**:\n- [ ] \`/sdlc-write-spec #${issueN}\` rewrites this package as an approved feature or bug spec\n`,
    'feature.gherkin': `${fm}Feature: Converted leftover spike #${issueN}\n  @SCN001\n  Scenario: Ordinary spec directory exists\n    Given leftover spike research for #${issueN}\n    When upgrade-project is approved for that spike\n    Then specs/${issueN}-${slug}/ exists\n`,
  };
}

function isCompleteIssueSpec(dirFull, issueN) {
  if (!isDir(dirFull) || !Number.isInteger(issueN)) return false;
  const required = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
  return required.every((name) => {
    const txt = safeRead(path.join(dirFull, name)) || '';
    return new RegExp(`^\\*\\*Issue\\*\\*:\\s*#${issueN}\\s*$`, 'm').test(txt);
  });
}



function readSpecFile(dirFull, name) {
  return safeRead(path.join(dirFull, name));
}

function hasVerificationReport(dirFull) {
  return isFile(path.join(dirFull, 'verification-report.md'));
}

function computeStatusAfter(dirFull, originalStatus) {
  if (hasVerificationReport(dirFull)) return 'Approved';
  if (originalStatus === 'Approved' || originalStatus === 'Draft') return originalStatus;
  return 'Draft';
}

function rewriteFrontmatter(content, targetN, targetStatus) {
  let c = String(content || '');
  c = c.replace(/^\*\*Issues?\*\*:\s*.*$/gm, `**Issue**: #${targetN}`);
  c = c.replace(/^\*\*Status\*\*:\s*.*$/gm, `**Status**: ${targetStatus}`);
  c = c.replace(/^#\s*Issue:\s*.*$/gm, `**Issue**: #${targetN}`);
  if (!/^\*\*Issue\*\*:/m.test(c)) {
    c = c.replace(/^(# .+)$/m, `$1\n\n**Issue**: #${targetN}\n**Date**: ${new Date().toISOString().slice(0, 10)}\n**Status**: ${targetStatus}\n**Author**: Unknown`);
  }
  if (!/^\*\*Date\*\*:/m.test(c)) {
    c = c.replace(/^(\*\*Issue\*\*:[^\n]*)/m, `$1\n**Date**: ${new Date().toISOString().slice(0, 10)}`);
  }
  if (!/^\*\*Status\*\*:/m.test(c)) {
    c = c.replace(/^(\*\*Date\*\*:[^\n]*)/m, `$1\n**Status**: ${targetStatus}`);
  }
  if (!/^\*\*Author\*\*:/m.test(c)) {
    c = c.replace(/^(\*\*Status\*\*:[^\n]*)/m, `$1\n**Author**: Unknown`);
  }
  return c;
}

function appendHistoricalCoordination(content, aggregateGoalQuote) {
  const c = String(content || '');
  const block = [
    '',
    '## Historical coordination',
    '',
    '> Previously part of an epic aggregate. Aggregate goal (quoted):',
    `> ${aggregateGoalQuote || 'See removed epic requirements.'}`,
    '',
  ].join('\n');
  // append before trailing blank or at end
  if (c.trim().endsWith('```') || /##\s+Validation/.test(c)) {
    return c.replace(/(\n+)(##\s+Validation|\s*$)/, `${block}$1$2`);
  }
  return c.trimEnd() + block + '\n';
}

function filterOwnedSections(content, owned, kind) {
  // kind: 'requirements' | 'tasks' | 'gherkin'
  const lines = String(content || '').split(/\r?\n/);
  const out = [];
  let section = null;
  let keepCurrent = true;

  const acOwned = new Set(owned?.acceptanceCriteria || []);
  const frOwned = new Set(owned?.functionalRequirements || []);
  const tOwned = new Set(owned?.tasks || []);
  const scnOwned = new Set(owned?.scenarios || []);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## Acceptance Criteria/i.test(line)) {
      section = 'ac';
      keepCurrent = true;
      out.push(line);
      continue;
    }
    if (/^## Functional Requirements/i.test(line)) {
      section = 'fr';
      keepCurrent = true;
      out.push(line);
      continue;
    }
    if (/^##? Tasks?:/i.test(line) || /^### T\d+/i.test(line)) {
      section = 'tasks';
      keepCurrent = true;
      out.push(line);
      continue;
    }
    if (/@SCN|Feature:/.test(line) && kind === 'gherkin') {
      section = 'gherkin';
      keepCurrent = true;
    }

    if (section === 'ac' && /^### (AC\d+):/i.test(line)) {
      const id = RegExp.$1.toUpperCase();
      keepCurrent = acOwned.has(id) || acOwned.has(id.replace('AC', 'AC'));
    }
    if (section === 'fr' && /^\|\s*(FR\d+)\s*\|/i.test(line)) {
      const id = RegExp.$1.toUpperCase();
      keepCurrent = frOwned.has(id);
    }
    if (section === 'tasks' && /^### (T\d+):/i.test(line)) {
      const id = RegExp.$1.toUpperCase();
      keepCurrent = tOwned.has(id);
    }
    if (section === 'gherkin') {
      const scnMatch = line.match(/@(SCN\d+)/i);
      if (scnMatch) {
        keepCurrent = scnOwned.has(scnMatch[1].toUpperCase());
      }
    }

    if (keepCurrent || /^# |^## |^\s*$/.test(line)) {
      out.push(line);
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function addRelatedSpecPointers(content, relatedPaths) {
  let c = String(content || '');
  const pointers = relatedPaths.map((p) => `**Related Spec**: ${p}`).join('\n');
  if (!pointers) return c;
  if (/^\*\*Related Spec\*\*:/m.test(c)) return c;
  if (/^\*\*Issue\*\*:/m.test(c)) {
    return c.replace(/^(\*\*Issue\*\*:[^\n]*)/m, `$1\n${pointers}`);
  }
  return `${pointers}\n\n${c}`;
}

function parseIssueScopeManifest(dirFull) {
  const j = readJsonSafe(path.join(dirFull, 'issue-scope.json'));
  if (!j || j.__invalid || j.schemaVersion !== 1 || !j.issues || typeof j.issues !== 'object') {
    return null;
  }
  return j;
}

function parseEpicLink(dirFull) {
  const j = readJsonSafe(path.join(dirFull, 'epic-link.json'));
  if (!j || j.__invalid || j.schemaVersion !== 1 || typeof j.childIssue !== 'number') {
    return null;
  }
  return j;
}

function readAggregateGoal(aggregateDir) {
  const req = readSpecFile(aggregateDir, 'requirements.md') || '';
  const first = req.split('\n').find((l) => l.trim().startsWith('#')) || 'Epic aggregate';
  return first.replace(/^#\s*/, '').trim();
}

function updateCrossReferences(root, oldRel, newRel) {
  // update **Related Spec** in any other spec that pointed at oldRel
  const specs = listSpecDirs(root);
  for (const spec of specs) {
    if (spec.rel === oldRel) continue;
    for (const fname of ['requirements.md', 'design.md', 'tasks.md']) {
      const fp = path.join(spec.full, fname);
      let txt = safeRead(fp);
      if (!txt) continue;
      if (txt.includes(oldRel)) {
        const updated = txt.replaceAll(oldRel, newRel);
        if (updated !== txt) {
          fs.writeFileSync(fp, updated);
        }
      }
    }
  }
}

function removeDirSafe(p) {
  if (isDir(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function removeFileSafe(p) {
  if (isFile(p)) {
    fs.unlinkSync(p);
  }
}

function safeDirRename(from, to) {
  if (isDir(to) || isFile(to)) {
    throw new Error(`target exists: ${to}`);
  }
  ensureDir(path.dirname(to));
  fs.renameSync(from, to);
}

function editGitignoreForV2(root) {
  const gp = path.join(root, '.gitignore');
  if (!isFile(gp)) {
    return { changed: false, status: 'already clean' };
  }
  const before = safeRead(gp);
  const lines = before.split(/\r?\n/);
  const out = [];
  let removed = false;
  let preservedUnmanaged = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!V2_GITIGNORE_HEADERS.has(line.trim())) {
      if (V2_GITIGNORE_ENTRIES.has(line.trim())) preservedUnmanaged = true;
      out.push(line);
      i += 1;
      continue;
    }
    // consume block until blank or next header
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '' && !lines[j].trim().startsWith('#')) {
      j += 1;
    }
    const body = lines.slice(i + 1, j);
    const kept = body.filter((e) => !V2_GITIGNORE_ENTRIES.has(e.trim()));
    if (kept.length === body.length) {
      out.push(line, ...body);
    } else {
      removed = true;
      if (kept.length > 0) {
        preservedUnmanaged = true;
        out.push(line, ...kept);
      } else if (j < lines.length && lines[j] === '') {
        j += 1;
      }
    }
    i = j;
  }
  const after = out.join('\n');
  if (after !== before) {
    fs.writeFileSync(gp, after);
  }
  const status = removed ? 'removed' : preservedUnmanaged ? 'preserved (unmanaged)' : 'already clean';
  return { changed: after !== before, status };
}

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function dependencyGraphDigest(graph) {
  const payload = {
    repository: graph.repository,
    nodes: graph.nodes.map(({ id, number, state, repository }) => ({ id, number, state, repository })),
    edges: graph.edges,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function dependencyAdditionsDigest(additions) {
  const canonical = additions
    .map(({ issue, blockedBy }) => ({ issue, blockedBy }))
    .sort((left, right) => left.issue - right.issue || left.blockedBy - right.blockedBy);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function encodeDependencyEdges(edges) {
  const canonical = edges
    .map(({ issue, blockedBy }) => ({ issue, blockedBy }))
    .sort((left, right) => left.issue - right.issue || left.blockedBy - right.blockedBy);
  return Buffer.from(JSON.stringify(canonical)).toString('base64url');
}

function decodeDependencyEdges(itemId) {
  const encoded = String(itemId).split(':')[3];
  if (!encoded) return null;
  try {
    const edges = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!Array.isArray(edges) || edges.length === 0) return null;
    if (edges.some(({ issue, blockedBy } = {}) => (
      !Number.isSafeInteger(issue) || issue <= 0
      || !Number.isSafeInteger(blockedBy) || blockedBy <= 0
    ))) return null;
    return edges.map(({ issue, blockedBy }) => ({ issue, blockedBy }));
  } catch {
    return null;
  }
}

function parseRunJson(result, description) {
  if (!result || result.status !== 0) {
    const error = new Error(`${description} failed`);
    error.reasonCode = 'dependency_unreadable';
    throw error;
  }
  try {
    return JSON.parse(result.stdout || 'null');
  } catch {
    const error = new Error(`${description} returned malformed JSON`);
    error.reasonCode = 'dependency_unreadable';
    throw error;
  }
}

export function detectIssueDependencyUpgrade({ cwd = process.cwd(), run = defaultRun } = {}) {
  const client = createIssueDependencyClient({ cwd, run });
  const endpoint = `repos/${client.repository}/issues`;
  const rawPages = parseRunJson(run('gh', [
    'api', '--method', 'GET', '--paginate', '--slurp', endpoint, '-f', 'state=all', '-f', 'per_page=100',
  ], { cwd }), 'Repository issue listing');
  if (!Array.isArray(rawPages) || !rawPages.every(Array.isArray)) {
    const error = new Error('Repository issue pagination is malformed');
    error.reasonCode = 'dependency_unreadable';
    throw error;
  }
  const issues = rawPages.flat()
    .filter((issue) => !issue.pull_request)
    .sort((left, right) => left.number - right.number);
  const graph = readDependencyGraph(client, issues.map((issue) => issue.number), { allIssues: issues });
  const candidates = [];
  const findings = [];
  for (const source of issues) {
    const evidence = parseLegacyDependencyEvidence(source.body);
    findings.push(...evidence.findings.map((finding) => ({ issue: source.number, ...finding })));
    for (const item of evidence.edges) {
      candidates.push(item.relation === 'blocks'
        ? { issue: item.issue, blockedBy: source.number, source: item.source }
        : { issue: source.number, blockedBy: item.issue, source: item.source });
    }
  }
  const evidenceByEdge = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.issue}:${candidate.blockedBy}`;
    if (!evidenceByEdge.has(key)) evidenceByEdge.set(key, candidate.source);
  }
  const additions = preflightBlockedByEdges(graph, [...evidenceByEdge].map(([key]) => {
    const [issue, blockedBy] = key.split(':').map(Number);
    return { issue, blockedBy };
  }));
  const digest = dependencyGraphDigest(graph);
  const additionsDigest = dependencyAdditionsDigest(additions);
  return {
    id: `issue-dependencies:${digest}:${additionsDigest}:${encodeDependencyEdges(additions)}`,
    kind: 'issue-dependencies',
    actionable: additions.length > 0,
    description: 'Reconcile legacy dependency evidence to official GitHub blocked-by edges.',
    digest,
    additionsDigest,
    issueCount: issues.length,
    additions: additions.map((edge) => ({ ...edge, source: evidenceByEdge.get(`${edge.issue}:${edge.blockedBy}`) })),
    findings,
  };
}

export function applyIssueDependencyUpgrade(item, { cwd = process.cwd(), run = defaultRun } = {}) {
  const live = detectIssueDependencyUpgrade({ cwd, run });
  if (live.digest !== item.digest || live.additionsDigest !== item.additionsDigest) {
    const client = createIssueDependencyClient({ cwd, run });
    const graph = readDependencyGraph(client, item.additions.flatMap((edge) => [edge.issue, edge.blockedBy]));
    const remaining = preflightBlockedByEdges(graph, item.additions);
    if (remaining.length === 0) {
      return { id: item.id, status: 'applied', applied: [], alreadyPresent: item.additions };
    }
    const error = new Error('Official dependency graph changed after plan approval');
    error.reasonCode = 'dependency_plan_stale';
    throw error;
  }
  const client = createIssueDependencyClient({ cwd, run });
  const graph = readDependencyGraph(client, item.additions.flatMap((edge) => [edge.issue, edge.blockedBy]));
  const additions = preflightBlockedByEdges(graph, item.additions);
  const applied = applyBlockedByEdges(client, additions);
  return { id: item.id, status: 'applied', applied };
}

function detectCurrentSteeringManifestRepair(root, manifestPath) {
  const manifest = JSON.parse(safeRead(manifestPath));
  if (!Array.isArray(manifest?.snippets)
    || !manifest.snippets.some((snippet) => snippet && typeof snippet === 'object' && Object.hasOwn(snippet, 'byteBound'))) {
    return null;
  }
  const snippets = manifest.snippets.map((snippet) => {
    if (!snippet || typeof snippet !== 'object' || Array.isArray(snippet)) {
      return canonicalSnippetRecord(snippet);
    }
    const candidate = { ...snippet };
    delete candidate.byteBound;
    return canonicalSnippetRecord(candidate);
  });
  const sourceDigest = steeringSourceDigest(root);
  const repairedManifest = { ...manifest, snippets };
  const plan = {
    schemaVersion: 1,
    mode: 'update',
    sourceDigest,
    actions: [{
      op: 'write',
      path: 'steering/manifest.json',
      content: `${JSON.stringify(repairedManifest, null, 2)}\n`,
    }],
  };
  return {
    id: `steering-runtime:${sourceDigest}`,
    kind: 'steering-runtime',
    description: 'Remove obsolete byteBound fields from the current steering manifest.',
    actionable: true,
    plan,
  };
}

function detectSteeringRuntime(root) {
  const legacy = ['product', 'tech', 'structure']
    .map((role) => ({ role, path: path.join(root, 'steering', `${role}.md`) }))
    .filter(({ path: target }) => isFile(target));
  const manifest = path.join(root, 'steering', 'manifest.json');
  if (legacy.length === 0 && isFile(manifest)) {
    return detectCurrentSteeringManifestRepair(root, manifest);
  }
  if (legacy.length === 0) return null;
  const consumersByRole = {
    product: ['sdlc-draft-issue', 'sdlc-write-spec'],
    tech: ['sdlc-write-spec', 'worker:implement', 'worker:verify', 'worker:deliver'],
    structure: ['sdlc-write-spec', 'worker:implement', 'worker:verify'],
  };
  const snippets = legacy.map(({ role, path: source }) => ({
    id: `project.${role}`,
    path: `steering/snippets/project-${role}.md`,
    consumers: consumersByRole[role],
    slot: 'body',
    order: 500,
    content: safeRead(source) || '',
  }));
  const existingManifest = isFile(manifest) ? JSON.parse(safeRead(manifest)) : null;
  const existingSnippets = (existingManifest?.snippets ?? []).map(canonicalSnippetRecord);
  const migratedIds = new Set(snippets.map(({ id }) => id));
  const plan = createInitializePlan(root, {
    snippets,
    validations: existingManifest?.validations ?? [],
  });
  const manifestAction = plan.actions.find(({ path: target }) => target === 'steering/manifest.json');
  const nextManifest = JSON.parse(manifestAction.content);
  nextManifest.snippets = [
    ...existingSnippets.filter(({ id }) => !migratedIds.has(id)),
    ...nextManifest.snippets,
  ];
  nextManifest.extensions = existingManifest?.extensions ?? [];
  manifestAction.content = `${JSON.stringify(nextManifest, null, 2)}\n`;
  plan.mode = existingManifest ? 'update' : 'migrate';
  plan.actions.push(...legacy.map(({ role }) => ({ op: 'delete', path: `steering/${role}.md` })));
  return {
    id: `steering-runtime:${plan.sourceDigest}`,
    kind: 'steering-runtime',
    description: 'Migrate legacy steering Markdown into the managed runtime and registered project snippets.',
    actionable: true,
    plan,
  };
}

function applySteeringRuntime(root, item) {
  const temporary = path.join(root, '.omp', 'sdlc', `steering-plan-${process.pid}.json`);
  ensureDir(path.dirname(temporary));
  fs.writeFileSync(temporary, `${JSON.stringify(item.plan, null, 2)}\n`);
  try {
    const result = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'sdlc-steering.mjs'), 'apply', '--project', root, '--plan', temporary], {
      cwd: root,
      encoding: 'utf8',
      shell: false,
    });
    if (result.error || result.status !== 0) {
      const error = new Error(result.error?.message || result.stdout || result.stderr || 'steering apply failed');
      error.reasonCode = 'steering_apply_failed';
      throw error;
    }
    return { id: item.id, status: 'applied', result: JSON.parse(result.stdout) };
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function recoverPublicationFileDeclaration(value) {
  const tokens = [];
  const tokenPattern = /`([^`]*)`(?:\s*(\([^()`]*\)))?/g;
  let cursor = 0;
  let match;
  while ((match = tokenPattern.exec(value)) !== null) {
    const between = value.slice(cursor, match.index);
    if (tokens.length > 0) {
      if (!/^\s*[,;]\s*$/.test(between)) return null;
    } else if (
      /[`()]/.test(between)
      || /\b(?:and|or)\b/i.test(between)
      || /[A-Za-z0-9_-][/.][A-Za-z0-9_*?[/-]/.test(between)
    ) return null;
    const quoted = `\`${match[1]}\``;
    try {
      if (publicationFileEntries(quoted).length !== 1) return null;
      publicationFileEntries(`${quoted}${match[2] ? ` ${match[2]}` : ''}`);
    } catch {
      return null;
    }
    tokens.push(`${quoted}${match[2] ? ` ${match[2]}` : ''}`);
    cursor = tokenPattern.lastIndex;
  }
  const suffix = value.slice(cursor);
  if (!tokens.length || /[`()]/.test(suffix) || /\b(?:and|or)\b/i.test(suffix)
    || /[A-Za-z0-9_-][/.][A-Za-z0-9_*?[/-]/.test(suffix)) return null;
  return tokens.join(', ');
}

function recoverTaskPublicationDeclarations(sourceLines, relativePath, taskId) {
  const candidateLines = [...sourceLines];
  const rewrites = [];
  for (let attempt = 0; attempt < sourceLines.length; attempt += 1) {
    try {
      parseDeliveryTaskFileLines(candidateLines.join('\n'), {
        spec: relativePath,
        taskIds: [taskId],
      });
      return { rewrites, findings: [] };
    } catch (error) {
      if (error?.reasonCode !== 'publication_scope_unproven' || error.taskId !== taskId) throw error;
      const lineIndex = error.line - 1;
      const line = candidateLines[lineIndex];
      const nearMiss = /^(\*\*Files\*\*:\s*)(.*)$/.exec(line);
      const canonical = /^(\*\*File\(s\)\*\*:\s*)(.*)$/.exec(line);
      let recovered = null;
      let prefix = null;
      let labelOnlyForOpaqueBytes = false;
      const findings = error.entry == null ? [] : [{
        line: error.line,
        entry: error.entry,
        ...(error.entry !== line.trim() ? { rawEntry: line.trim() } : {}),
        taskId,
      }];
      if (nearMiss) {
        if (error.entry !== line.trim()) return { rewrites: [], findings };
        prefix = nearMiss[1].replace('Files', 'File(s)');
        if (/[^\x00-\x7f]/.test(nearMiss[2])) {
          const asciiPayload = nearMiss[2].replace(/[^\x00-\x7f]+/g, '');
          try {
            publicationFileEntries(asciiPayload);
            recovered = nearMiss[2];
            labelOnlyForOpaqueBytes = true;
          } catch {
            return { rewrites: [], findings };
          }
        } else {
          try {
            publicationFileEntries(nearMiss[2]);
            recovered = nearMiss[2];
          } catch {
            recovered = recoverPublicationFileDeclaration(nearMiss[2]);
          }
        }
      } else if (canonical && error.entry === canonical[2].trim()) {
        if (/[^\x00-\x7f]/.test(line)) return { rewrites: [], findings };
        prefix = canonical[1];
        recovered = recoverPublicationFileDeclaration(canonical[2]);
      }
      if (recovered === null) return { rewrites: [], findings };
      const after = `${prefix}${recovered}`;
      if (after === line) return { rewrites: [], findings };
      rewrites.push({
        line: error.line,
        entry: nearMiss?.[2] ?? canonical[2],
        before: line,
        after,
      });
      if (labelOnlyForOpaqueBytes) return { rewrites, findings };
      candidateLines[lineIndex] = after;
    }
  }
  return { rewrites: [], findings: [] };
}

function publicationFilesUpgrade(root, specDirs) {
  const packages = [];
  for (const specDir of specDirs) {
    if (!/^[1-9]\d*-[a-z0-9-]+$/.test(specDir.name)) continue;
    const relativePath = `${specDir.rel}/tasks.md`;
    const sourceBytes = safeReadBuffer(path.join(root, relativePath));
    if (sourceBytes == null) continue;
    // Latin-1 is a reversible byte view. The publication grammar is ASCII, so
    // parsing and rewriting this view cannot normalize unrelated invalid UTF-8.
    const source = sourceBytes.toString('latin1');
    const sourceLines = source.split(/\r?\n/);
    const taskIds = new Set();
    for (const line of sourceLines) {
      const taskId = /^#{2,3}[ \t]+(T0*[1-9]\d*):/.exec(line)?.[1];
      if (taskId) taskIds.add(taskId);
    }
    const rewrites = [];
    const findings = [];
    for (const taskId of taskIds) {
      const recovered = recoverTaskPublicationDeclarations(sourceLines, relativePath, taskId);
      rewrites.push(...recovered.rewrites);
      findings.push(...recovered.findings);
    }
    if (rewrites.length || findings.length) {
      const projectedPaths = [...new Set(
        (specDir.projectedRels ?? (specDir.projectedRel ? [specDir.projectedRel] : []))
          .filter((projectedRel) => projectedRel !== specDir.rel)
          .map((projectedRel) => `${projectedRel}/tasks.md`),
      )];
      packages.push({
        path: relativePath,
        ...(projectedPaths.length === 1 ? { projectedPath: projectedPaths[0] } : {}),
        ...(projectedPaths.length > 1 ? { projectedPaths } : {}),
        sourceDigest: createHash('sha256').update(sourceBytes).digest('hex'),
        rewrites,
        findings,
      });
    }
  }
  if (!packages.length) return null;
  const digest = createHash('sha256').update(JSON.stringify(packages)).digest('hex');
  return {
    id: `publication-files:${digest}`,
    kind: 'publication-files',
    description: 'Canonicalize recoverable delivery-task File(s) declarations; preserve unsafe declarations as findings.',
    actionable: packages.some(({ rewrites }) => rewrites.length > 0),
    packages,
  };
}

function publicationUpgradeSpecDirs(root, specDirs, upgradeItems) {
  const candidates = new Map(
    specDirs
      .filter(({ name }) => /^[1-9]\d*-[a-z0-9-]+$/.test(name))
      .map((specDir) => [specDir.rel, specDir]),
  );
  for (const item of upgradeItems) {
    if (!item.actionable || !item.from) continue;
    let projectedRels = [];
    if (['directory-rename', 'epic-flatten'].includes(item.kind) && item.to) {
      projectedRels = [item.to];
    } else if (item.kind === 'cumulative-split') {
      projectedRels = (item.issueNumbers ?? []).map((issue) => `specs/${issue}-${item.slug}`);
    }
    projectedRels = projectedRels.filter((projectedRel) => (
      /^specs\/[1-9]\d*-[a-z0-9-]+$/.test(projectedRel)
    ));
    if (!projectedRels.length) continue;
    const existing = candidates.get(item.from);
    candidates.set(item.from, {
      name: path.basename(projectedRels[0]),
      full: path.join(root, item.from),
      rel: item.from,
      projectedRels: [...new Set([...(existing?.projectedRels ?? []), ...projectedRels])],
    });
  }
  return [...candidates.values()];
}

function withPublicationMutationLock(root, action) {
  const lockPath = path.join(root, '.nmg-sdlc-publication.lock');
  const ownerPath = path.join(lockPath, 'owner.json');
  const token = randomUUID();
  let created = false;
  try {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw publicationContractError(
          'publication_mutation_locked',
          'Another publication mutation owns the project lock',
        );
      }
      throw error;
    }
    fs.writeFileSync(ownerPath, `${JSON.stringify({ token, pid: process.pid })}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    return action({ lockPath, token });
  } finally {
    if (created) {
      let ownsLock = false;
      try {
        const stat = fs.lstatSync(lockPath);
        const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
        ownsLock = stat.isDirectory() && !stat.isSymbolicLink() && owner.token === token;
      } catch {
        // A lock without this invocation's token is not ours to clean.
      }
      if (ownsLock) fs.rmSync(lockPath, { recursive: true, force: true });
    }
  }
}

function splitBufferLines(source) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === 0x0a) {
      lines.push(source.subarray(start, index + 1));
      start = index + 1;
    }
  }
  if (start < source.length || source.length === 0) lines.push(source.subarray(start));
  return lines;
}

function applyPublicationBufferRewrite(line, rewrite) {
  const newlineLength = line.length >= 2 && line.at(-2) === 0x0d && line.at(-1) === 0x0a
    ? 2
    : line.at(-1) === 0x0a ? 1 : 0;
  const content = line.subarray(0, line.length - newlineLength);
  const newline = line.subarray(line.length - newlineLength);
  const before = Buffer.from(rewrite.before, 'latin1');
  const after = Buffer.from(rewrite.after, 'latin1');
  if (!content.equals(before)) {
    throw publicationContractError(
      'publication_files_plan_stale',
      'Publication File(s) changed after plan approval',
    );
  }

  let prefixLength = 0;
  while (
    prefixLength < before.length
    && prefixLength < after.length
    && before[prefixLength] === after[prefixLength]
  ) prefixLength += 1;
  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength
    && suffixLength < after.length - prefixLength
    && before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) suffixLength += 1;
  const beforeSpan = before.subarray(prefixLength, before.length - suffixLength);
  const afterSpan = after.subarray(prefixLength, after.length - suffixLength);
  if ([...beforeSpan, ...afterSpan].some((byte) => byte > 0x7f)) {
    throw publicationContractError(
      'publication_files_span_ambiguous',
      'Publication rewrite cannot map an exact ASCII byte span',
    );
  }
  return Buffer.concat([
    content.subarray(0, prefixLength),
    afterSpan,
    content.subarray(content.length - suffixLength),
    newline,
  ]);
}

function publicationOutputSnapshot(root, plan) {
  const target = path.join(root, plan.path);
  const stat = lstatOrNull(target);
  const source = safeReadBuffer(target);
  if (
    !stat?.isFile()
    || stat.isSymbolicLink()
    || source == null
    || createHash('sha256').update(source).digest('hex') !== plan.sourceDigest
    || plan.targetIdentity && !samePublicationFileIdentity(stat, plan.targetIdentity)
  ) {
    throw publicationContractError(
      'publication_files_plan_stale',
      'Publication File(s) changed after plan approval',
    );
  }
  const lines = splitBufferLines(source);
  for (const rewrite of plan.rewrites) {
    const index = rewrite.line - 1;
    if (!lines[index]) {
      throw publicationContractError(
        'publication_files_plan_stale',
        'Publication File(s) changed after plan approval',
      );
    }
    lines[index] = applyPublicationBufferRewrite(lines[index], rewrite);
  }
  return {
    target,
    source,
    output: Buffer.concat(lines),
    mode: stat.mode,
    identity: publicationFileIdentity(stat),
  };
}

function applyPublicationFiles(root, item, { revalidate } = {}) {
  return withPublicationMutationLock(root, ({ lockPath }) => {
    const outputs = item.packages
      .filter(({ rewrites }) => rewrites.length > 0)
      .map((plan) => publicationOutputSnapshot(root, plan));
    for (const [index, output] of outputs.entries()) {
      output.snapshotPath = path.join(lockPath, `${index}.snapshot`);
      output.originalPath = path.join(lockPath, `${index}.original`);
      output.stagedPath = path.join(lockPath, `${index}.staged`);
      fs.writeFileSync(output.snapshotPath, output.source, { flag: 'wx', mode: output.mode });
      fs.chmodSync(output.snapshotPath, output.mode);
      fs.writeFileSync(output.stagedPath, output.output, { flag: 'wx', mode: output.mode });
      fs.chmodSync(output.stagedPath, output.mode);
    }

    // This is the last complete inventory and identity check before the
    // cooperative project lock's commit boundary.
    revalidate?.();
    for (const output of outputs) {
      const liveStat = lstatOrNull(output.target);
      const liveBytes = safeReadBuffer(output.target);
      if (!samePublicationFileIdentity(liveStat, output.identity) || !liveBytes?.equals(output.source)) {
        throw publicationContractError(
          'publication_files_plan_stale',
          'Publication target identity or bytes changed immediately before commit',
        );
      }
    }

    try {
      for (const output of outputs) {
        fs.renameSync(output.target, output.originalPath);
        fs.renameSync(output.stagedPath, output.target);
      }
    } catch (commitError) {
      const rollbackErrors = [];
      for (const output of outputs) {
        const currentStat = lstatOrNull(output.target);
        const current = safeReadBuffer(output.target);
        if (samePublicationFileIdentity(currentStat, output.identity) && current?.equals(output.source)) continue;
        const originalStat = lstatOrNull(output.originalPath);
        const original = safeReadBuffer(output.originalPath);
        try {
          if (!samePublicationFileIdentity(originalStat, output.identity) || !original?.equals(output.source)) {
            throw new Error('Original publication target identity is unavailable');
          }
          fs.renameSync(output.originalPath, output.target);
        } catch (rollbackError) {
          try {
            fs.writeFileSync(output.target, output.source);
            fs.chmodSync(output.target, output.mode);
          } catch (fallbackError) {
            rollbackErrors.push(fallbackError, rollbackError);
          }
        }
      }
      if (rollbackErrors.length > 0) {
        throw publicationContractError(
          'publication_files_rollback_failed',
          `Publication commit failed and original bytes could not be restored: ${commitError.message}`,
        );
      }
      throw publicationContractError(
        'publication_files_commit_failed',
        `Publication commit failed; every target was restored: ${commitError.message}`,
      );
    }
    return { id: item.id, status: 'applied', packages: item.packages.map(({ path: packagePath }) => packagePath) };
  });
}

function detectPublicationUpgrade(root, { specDirs } = {}) {
  const validated = validatePublicationSpecDirs(root, specDirs);
  const detected = publicationFilesUpgrade(validated.root, validated.selected);
  const selections = validated.selected.map(({ rel, files }) => ({
    path: rel,
    files,
  }));
  const selectedFiles = new Map(
    selections.flatMap(({ files }) => files.map((file) => [file.path, file])),
  );
  const packages = (detected?.packages ?? []).map((plan) => {
    const targetIdentity = selectedFiles.get(plan.path)?.identity;
    if (!targetIdentity) {
      throw publicationContractError(
        'publication_files_plan_stale',
        `Selected publication target identity is missing: ${plan.path}`,
      );
    }
    return { ...plan, targetIdentity };
  });
  const authority = {
    schemaVersion: 1,
    mode: 'publication-only',
    root: validated.root,
    specDirs: selections.map(({ path: specDir }) => specDir),
    selections,
    packages,
  };
  const digest = createHash('sha256').update(JSON.stringify(authority)).digest('hex');
  const item = {
    id: `publication-files:${digest}`,
    kind: 'publication-files',
    description: 'Canonicalize recoverable delivery-task File(s) declarations only in the explicitly selected spec packages.',
    actionable: packages.some(({ rewrites }) => rewrites.length > 0),
    packages,
  };
  return {
    schemaVersion: 1,
    mode: 'publication-only',
    root: validated.root,
    specDirs: authority.specDirs,
    selections,
    writeCount: packages.reduce((count, plan) => count + plan.rewrites.length, 0),
    findingCount: packages.reduce((count, plan) => count + plan.findings.length, 0),
    item,
    items: [item],
  };
}

function applyPublicationUpgrade(root, approvedItemId, { specDirs } = {}) {
  if (
    typeof approvedItemId !== 'string'
    || !/^publication-files:[0-9a-f]{64}$/.test(approvedItemId)
  ) {
    throw publicationContractError(
      'publication_files_approval_invalid',
      'Publication-only apply requires one publication-files:<sha256> approval id',
    );
  }
  const report = detectPublicationUpgrade(root, { specDirs });
  if (report.item.id !== approvedItemId) {
    throw publicationContractError(
      'publication_files_plan_stale',
      'Selected publication report changed after plan approval',
    );
  }
  const result = report.writeCount === 0
    ? { id: approvedItemId, status: 'already-current', packages: [] }
    : applyPublicationFiles(report.root, report.item, {
      revalidate: () => {
        let finalReport;
        try {
          finalReport = detectPublicationUpgrade(report.root, { specDirs: report.specDirs });
        } catch (error) {
          throw publicationContractError(
            'publication_files_plan_stale',
            `Selected publication target became invalid before commit: ${error.reasonCode ?? error.message}`,
          );
        }
        if (finalReport.item.id !== approvedItemId) {
          throw publicationContractError(
            'publication_files_plan_stale',
            'Selected publication package inventory or identity changed before commit',
          );
        }
      },
    });
  const postDetect = detectPublicationUpgrade(report.root, { specDirs: report.specDirs });
  return {
    schemaVersion: 1,
    mode: 'publication-only',
    root: report.root,
    specDirs: report.specDirs,
    applied: result.status === 'applied' ? [result] : [],
    results: [result],
    postDetect,
  };
}


function detectUpgrade(root, { run, includeIssueDependencies = run === defaultRun } = {}) {
  const items = [];
  const rootAbs = path.resolve(root);

  // 1. Packaging
  if (hasLegacyCodexPlugin(rootAbs) && !hasOmpExtensions(rootAbs)) {
    items.push({
      id: 'packaging-v3-omp-herdr',
      kind: 'packaging',
      description: 'Project still references .codex-plugin. v3 installs as OMP plugin (omp plugin install / marketplace / omp plugin link) and requires Herdr. nmg-pi optional. Do not write ~/.codex/config.toml.',
      actionable: true,
    });
  }

  // 2. Legacy layout
  if (hasLegacyLayout(rootAbs)) {
    items.push({
      id: 'legacy-layout-codex',
      kind: 'legacy-layout',
      description: 'Legacy .codex/steering/ and/or .codex/specs/ present. Relocate to root steering/ and specs/ (git mv).',
      actionable: true,
    });
  }
  const steeringRuntime = detectSteeringRuntime(rootAbs);
  if (steeringRuntime) items.push(steeringRuntime);

  // Collect current spec state
  const specDirs = listSpecDirs(rootAbs);
  const hasEpics = hasEpicArtifacts(rootAbs);
  const hasScopes = hasAnyIssueScope(rootAbs);

  // 3+6. Directory renames + frontmatter
  for (const d of specDirs) {
    const req = readSpecFile(d.full, 'requirements.md') || readSpecFile(d.full, 'design.md') || '';
    const primary = extractPrimaryN(req, d.name);
    const slug = deriveSlug(d.name);
    const targetName = primary ? `${primary}-${slug}` : null;
    const targetRel = targetName ? `specs/${targetName}` : null;
    const targetFull = targetName ? path.join(rootAbs, 'specs', targetName) : null;

    const isPrefixed = LEGACY_DIR_PREFIX_RE.test(d.name);
    const alreadyNumSlug = NUM_SLUG_RE.test(d.name);
    const numsInFm = extractIssueNumbersFromContent(req);
    const isPlural = /Issues/.test(req);
    const needsNameChange = isPrefixed || (alreadyNumSlug && primary && d.name !== `${primary}-${slug}`);

    if (needsNameChange && primary && targetFull) {
      const collision = isDir(targetFull);
      const originalStatus = (req.match(/^\*\*Status\*\*:\s*(\S+)/m) || [])[1] || 'Draft';
      const newStatus = computeStatusAfter(d.full, originalStatus);
      items.push({
        id: `directory-rename:${d.rel}`,
        kind: 'directory-rename',
        description: `Rename ${d.rel} → ${targetRel} (primaryN from frontmatter${isPlural ? ' plural' : ''}).`,
        from: d.rel,
        to: targetRel,
        primaryN: primary,
        slug,
        collision,
        needsFrontmatter: isPlural || originalStatus === 'Amended',
        newStatus,
        actionable: !collision,
      });
    } else if (alreadyNumSlug && primary && (isPlural || numsInFm.length > 1)) {
      // frontmatter only normalization for already N- dirs
      const originalStatus = (req.match(/^\*\*Status\*\*:\s*(\S+)/m) || [])[1] || 'Draft';
      const newStatus = computeStatusAfter(d.full, originalStatus);
      items.push({
        id: `frontmatter-fix:${d.rel}`,
        kind: 'frontmatter-fix',
        description: `Normalize frontmatter in ${d.rel} to singular **Issue** and current Status.`,
        rel: d.rel,
        primaryN: primary,
        newStatus,
        actionable: true,
      });
    }
  }

  // 4. Cumulative split
  for (const d of specDirs) {
    const req = readSpecFile(d.full, 'requirements.md') || '';
    const nums = extractIssueNumbersFromContent(req);
    const manifest = parseIssueScopeManifest(d.full);
    const isMulti = nums.length > 1 || (manifest && Object.keys(manifest.issues || {}).length > 1);
    if (!isMulti) continue;

    const slug = deriveSlug(d.name);
    const verifiable = !!manifest && !manifest.__invalid;
    const issueKeys = verifiable ? Object.keys(manifest.issues) : nums.map(String);

    const id = `cumulative-split:${d.rel}`;
    items.push({
      id,
      kind: 'cumulative-split',
      description: `Split ${d.rel} (plural ${nums.join(',') || 'via scope'}) into per-issue specs.`,
      from: d.rel,
      slug,
      issueNumbers: issueKeys.map((k) => parseInt(k, 10)),
      verifiable,
      hasManifest: !!manifest,
      actionable: verifiable,
    });
  }

  // 5. Epic flatten
  if (hasEpics || hasScopes) {
    // find children via epic-link or dirs under epic-
    const children = [];
    const specsDir = path.join(rootAbs, 'specs');
    function collectLinks(dir, prefix = '') {
      for (const ent of listDir(dir)) {
        const p = path.join(dir, ent.name);
        const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          if (ent.name.startsWith('epic-')) {
            // the aggregate itself not child
          }
          collectLinks(p, rel);
        } else if (ent.name === 'epic-link.json') {
          const link = parseEpicLink(path.join(specsDir, rel.replace(/\/epic-link\.json$/, '')));
          if (link && typeof link.childIssue === 'number') {
            const childDir = path.join(specsDir, rel.replace(/\/epic-link\.json$/, ''));
            const childName = path.basename(childDir);
            children.push({
              link,
              childDirFull: childDir,
              childRel: `specs/${path.relative(specsDir, childDir)}`,
              childName,
            });
          }
        }
      }
    }
    collectLinks(specsDir);

    // also direct epic- children that may not have written link yet? but per spec, use links
    for (const c of children) {
      const slug = deriveSlug(c.childName);
      const targetName = `${c.link.childIssue}-${slug}`;
      const targetRel = `specs/${targetName}`;
      const targetFull = path.join(rootAbs, 'specs', targetName);
      const collision = isDir(targetFull);
      const aggregateDir = path.dirname(c.childDirFull); // may be wrong if not sibling; use link
      // find aggregate from link
      const aggRel = c.link.epicSpecPath || '';
      const aggFull = aggRel ? path.join(rootAbs, aggRel) : null;
      const goal = aggFull && isDir(aggFull) ? readAggregateGoal(aggFull) : 'coordination aggregate';
      items.push({
        id: `epic-flatten:${c.childRel}`,
        kind: 'epic-flatten',
        description: `Flatten child ${c.childRel} (epic-link to #${c.link.childIssue}) → ${targetRel}. Remove epic artifacts.`,
        from: c.childRel,
        to: targetRel,
        childN: c.link.childIssue,
        slug,
        collision,
        aggregateRel: aggRel,
        historicalGoal: goal,
        actionable: !collision,
      });
    }

    // also top level epic- dirs that have no links? report as remove-only if no children
    const epicDirs = specDirs.filter((d) => d.name.startsWith('epic-'));
    for (const ed of epicDirs) {
      const hasChildLinkUnder = children.some((c) => c.childRel.startsWith(ed.rel));
      if (!hasChildLinkUnder) {
        items.push({
          id: `epic-remove:${ed.rel}`,
          kind: 'epic-flatten',
          description: `Remove orphan epic aggregate ${ed.rel} (no executable children with links).`,
          from: ed.rel,
          to: null,
          actionable: true,
        });
      }
    }
  }
  const publicationFiles = publicationFilesUpgrade(
    rootAbs,
    publicationUpgradeSpecDirs(rootAbs, specDirs, items),
  );
  if (publicationFiles) items.push(publicationFiles);


  // 9. Leftover spikes
  for (const adr of listSpikeAdrs(rootAbs)) {
    const targetName = adr.issue ? `${adr.issue}-${adr.slug}` : null;
    const targetRel = targetName ? `specs/${targetName}` : null;
    const collision = Boolean(targetRel && isDir(path.join(rootAbs, targetRel)));
    const existingValid = Boolean(targetRel && isCompleteIssueSpec(path.join(rootAbs, targetRel), adr.issue));
    items.push({
      id: `spike-flatten:${adr.rel}`,
      kind: 'spike-flatten',
      description: adr.issue
        ? `Convert leftover spike ADR ${adr.rel} into ordinary ${targetRel} (Draft) and mark the ADR migrated.`
        : `Leftover spike ADR ${adr.rel} has no parseable issue number; choose a target manually.`,
      from: adr.rel,
      to: targetRel,
      issue: adr.issue,
      slug: adr.slug,
      collision,
      existingValid,
      actionable: Boolean(adr.issue) && (!collision || existingValid),
    });
  }
  for (const rel of leftoverSpikeBundles(rootAbs)) {
    items.push({
      id: `spike-remove:${rel}`,
      kind: 'spike-remove',
      description: `Delete leftover spike bundle ${rel}.`,
      rel,
      actionable: true,
    });
  }
  if (issueFormHasSpike(rootAbs)) {
    items.push({
      id: 'spike-issue-form',
      kind: 'spike-issue-form',
      description: 'Remove Spike from the managed issue form options.',
      rel: '.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml',
      actionable: true,
    });
  }
  const agentsTxt = safeRead(path.join(rootAbs, 'AGENTS.md')) || '';
  if (/spike/i.test(agentsTxt)) {
    items.push({
      id: 'agents-spike-language',
      kind: 'agents-spike-language',
      description: 'Remove leftover spike language from AGENTS.md.',
      rel: 'AGENTS.md',
      actionable: true,
    });
  }

  const dependencyItem = includeIssueDependencies
    ? detectIssueDependencyUpgrade({ cwd: rootAbs, run })
    : null;

  // 7. Repeat-run already current
  const alreadyLinear = specDirs.every((d) => /^\d+-[a-z0-9-]/.test(d.name));
  const fmOk = specDirs.every((d) => {
    const req = readSpecFile(d.full, 'requirements.md') || '';
    const ns = extractIssueNumbersFromContent(req);
    return ns.length === 1 && d.name.startsWith(`${ns[0]}-`);
  });
  if (alreadyLinear && fmOk && !hasEpics && !hasScopes && !hasLeftoverSpikeArtifacts(rootAbs) && !/spike/i.test(agentsTxt) && !dependencyItem?.actionable) {
    items.push({
      id: 'repeat-run-already-current',
      kind: 'already-current',
      description: 'All specs are linear specs/{N}-{slug}/ with singular **Issue** and no epic/scope/spike artifacts.',
      actionable: false,
    });
  }

  // 8. v2 runner cleanup
  for (const rel of V2_CLEANUP_FILES) {
    const p = path.join(rootAbs, rel);
    if (isFile(p) || isDir(p)) {
      items.push({
        id: `v2-cleanup:${rel}`,
        kind: 'v2-cleanup',
        description: `Remove v2 automated runner artifact ${rel}.`,
        rel,
        actionable: true,
      });
    }
  }
  const gi = path.join(rootAbs, '.gitignore');
  if (isFile(gi)) {
    const txt = safeRead(gi) || '';
    const hasManaged = [...V2_GITIGNORE_HEADERS].some((h) => txt.includes(h)) ||
      [...V2_GITIGNORE_ENTRIES].some((e) => txt.includes(e));
    if (hasManaged) {
      items.push({
        id: 'v2-cleanup:gitignore',
        kind: 'v2-cleanup',
        description: 'Clean v2 automated runner entries from .gitignore managed blocks.',
        rel: '.gitignore',
        actionable: true,
      });
    }
  }
  const gitignoreText = isFile(gi) ? safeRead(gi) || '' : '';
  if (!hasOmpSdlcIgnore(gitignoreText)) {
    items.push({
      id: 'omp-sdlc-ignore',
      kind: 'omp-sdlc-ignore',
      description: 'Add .omp/sdlc/ to .gitignore so plugin runtime state is not committed.',
      actionable: true,
    });
  }

  if (dependencyItem) {
    items.push(dependencyItem);
  }

  // Dedup by id
  const seen = new Set();
  const uniqueItems = items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });

  return {
    root: rootAbs,
    itemCount: uniqueItems.length,
    items: uniqueItems,
    hasEpicArtifacts: hasEpics,
    hasScopeArtifacts: hasScopes,
  };
}

function applyDirectoryRename(root, item) {
  const fromFull = path.join(root, item.from);
  const toFull = path.join(root, item.to);
  if (!isDir(fromFull)) return { id: item.id, status: 'skipped:missing' };
  if (item.collision) return { id: item.id, status: 'skipped:collision' };
  try {
    safeDirRename(fromFull, toFull);
    for (const fname of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
      const fp = path.join(toFull, fname);
      if (isFile(fp)) {
        const txt = rewriteFrontmatter(safeRead(fp), item.primaryN, item.newStatus || 'Draft');
        fs.writeFileSync(fp, txt);
      }
    }
    updateCrossReferences(root, item.from, item.to);
    return { id: item.id, status: 'applied' };
  } catch (e) {
    return { id: item.id, status: `failed:${e.message}` };
  }
}

function applyFrontmatterFix(root, item) {
  const dirFull = path.join(root, item.rel);
  if (!isDir(dirFull)) return { id: item.id, status: 'skipped:missing' };
  let changed = false;
  for (const fname of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
    const fp = path.join(dirFull, fname);
    const txt = safeRead(fp);
    if (!txt) continue;
    const updated = rewriteFrontmatter(txt, item.primaryN, item.newStatus || 'Draft');
    if (updated !== txt) {
      fs.writeFileSync(fp, updated);
      changed = true;
    }
  }
  return { id: item.id, status: changed ? 'applied' : 'already-current' };
}

function applyCumulativeSplit(root, item) {
  if (!item.verifiable || !item.actionable) return { id: item.id, status: 'skipped:unverifiable' };
  const fromFull = path.join(root, item.from);
  const manifest = parseIssueScopeManifest(fromFull);
  if (!manifest) return { id: item.id, status: 'skipped:unverifiable' };

  const slug = item.slug;
  const created = [];
  const issueNumbers = item.issueNumbers || [];

  try {
    for (const nStr of Object.keys(manifest.issues)) {
      const n = parseInt(nStr, 10);
      if (!issueNumbers.includes(n)) continue; // only listed
      const targetName = `${n}-${slug}`;
      const targetFull = path.join(root, 'specs', targetName);
      if (isDir(targetFull)) {
        // collision on one, abort this item
        return { id: item.id, status: 'skipped:collision' };
      }
      ensureDir(targetFull);

      const owned = manifest.issues[nStr]?.owned || { acceptanceCriteria: [], functionalRequirements: [], tasks: [], scenarios: [] };

      // copy + filter each file
      const filesToSplit = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];
      for (const fname of filesToSplit) {
        let src = readSpecFile(fromFull, fname);
        if (!src) continue;
        let out = src;
        if (fname === 'requirements.md' || fname === 'design.md') {
          out = filterOwnedSections(src, owned, 'requirements');
        } else if (fname === 'tasks.md') {
          out = filterOwnedSections(src, owned, 'tasks');
        } else if (fname === 'feature.gherkin') {
          out = filterOwnedSections(src, owned, 'gherkin');
        }
        out = rewriteFrontmatter(out, n, computeStatusAfter(fromFull, 'Amended'));
        // add related pointers to siblings
        const others = issueNumbers.filter((x) => x !== n).map((x) => `specs/${x}-${slug}/`);
        out = addRelatedSpecPointers(out, others);
        fs.writeFileSync(path.join(targetFull, fname), out);
      }

      // also copy any other? no
      created.push(targetName);
    }

    // delete the source cumulative dir and its issue-scope
    removeDirSafe(fromFull);
    // remove any stray issue-scope at root level? already in dir

    return { id: item.id, status: 'applied', created };
  } catch (e) {
    return { id: item.id, status: `failed:${e.message}` };
  }
}

function applyEpicFlatten(root, item) {
  if (item.to === null) {
    // orphan remove
    const fromFull = path.join(root, item.from);
    removeDirSafe(fromFull);
    return { id: item.id, status: 'applied' };
  }
  const fromFull = path.join(root, item.from);
  const toFull = path.join(root, item.to);
  if (!isDir(fromFull)) return { id: item.id, status: 'skipped:missing' };
  if (item.collision) return { id: item.id, status: 'skipped:collision' };

  try {
    safeDirRename(fromFull, toFull);

    // remove epic-link.json from the new location if present
    removeFileSafe(path.join(toFull, 'epic-link.json'));
    // also remove issue-scope if present? per flatten no, but keep if was child executable
    // update frontmatters
    const newStatus = hasVerificationReport(toFull) ? 'Approved' : 'Draft';
    for (const fname of ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin']) {
      const fp = path.join(toFull, fname);
      if (isFile(fp)) {
        let txt = safeRead(fp);
        txt = rewriteFrontmatter(txt, item.childN, newStatus);
        if (fname === 'requirements.md') {
          txt = appendHistoricalCoordination(txt, item.historicalGoal);
        }
        fs.writeFileSync(fp, txt);
      }
    }
    if (item.aggregateRel) {
      removeDirSafe(path.join(root, item.aggregateRel));
    }




    updateCrossReferences(root, item.from, item.to);

    // Note: github label removal / native parent removal is proposal-only here.
    // If item had a github sub-id it would be handled separately; per contract apply only when id approved.
    return { id: item.id, status: 'applied' };
  } catch (e) {
    return { id: item.id, status: `failed:${e.message}` };
  }
}

function applyV2Cleanup(root, item) {
  const p = path.join(root, item.rel);
  let stat;
  try {
    stat = fs.lstatSync(p);
  } catch {
    return { id: item.id, status: 'already clean' };
  }
  if (stat.isSymbolicLink()) return { id: item.id, status: 'preserved (unmanaged)' };
  if (item.rel === '.gitignore') {
    const r = editGitignoreForV2(root);
    return { id: item.id, status: r.status };
  }
  if (!stat.isFile()) return { id: item.id, status: 'preserved (unmanaged)' };
  try {
    fs.unlinkSync(p);
    return { id: item.id, status: isFile(p) ? 'failed:still-present' : 'removed' };
  } catch (e) {
    return { id: item.id, status: `failed:${e.message}` };
  }
}

function stampMigratedSpikeAdr(adrFull, specRel) {
  const current = safeRead(adrFull) || '';
  if (/^\*\*SDLC-Migrated\*\*:/m.test(current)) return;
  const stamp = `**SDLC-Migrated**: ${specRel}\n`;
  fs.writeFileSync(adrFull, stamp + current);
}

function applySpikeFlatten(root, item) {
  if (!item.issue || !item.to) {
    return { id: item.id, status: 'skipped:unverifiable' };
  }
  const toFull = path.join(root, item.to);
  const adrFull = path.join(root, item.from);
  const adrBody = safeRead(adrFull) || '';
  try {
    if (isDir(toFull)) {
      if (!isCompleteIssueSpec(toFull, item.issue)) {
        return { id: item.id, status: 'skipped:collision' };
      }
    } else {
      ensureDir(toFull);
      const files = seedConvertedSpikeSpec(item.issue, item.slug, item.from, adrBody);
      for (const [name, body] of Object.entries(files)) {
        fs.writeFileSync(path.join(toFull, name), body);
      }
    }
    stampMigratedSpikeAdr(adrFull, item.to);
    return { id: item.id, status: 'applied', created: [item.to] };
  } catch (e) {
    return { id: item.id, status: `failed:${e.message}` };
  }
}

function applySpikeRemove(root, item) {
  const p = path.join(root, item.rel);
  if (!isFile(p)) return { id: item.id, status: 'already-current' };
  try {
    fs.unlinkSync(p);
    return { id: item.id, status: isFile(p) ? 'failed:still-present' : 'applied' };
  } catch (e) {
    return { id: item.id, status: `failed:${e.message}` };
  }
}

function applySpikeIssueForm(root, item) {
  const p = path.join(root, item.rel || '.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml');
  const txt = safeRead(p);
  if (!txt) return { id: item.id, status: 'skipped:missing' };
  const updated = txt
    .replace(/\n\s*-\s*Spike\s*(?:\n|$)/g, '\n')
    .replace(/feature, bug, or spike/gi, 'feature or bug')
    .replace(/Bug\/Spike/g, 'Bug')
    .replace(/\n\s*For spikes:[^\n]*/g, '');
  if (updated === txt) return { id: item.id, status: 'already-current' };
  fs.writeFileSync(p, updated);
  return { id: item.id, status: 'applied' };
}

function applyAgentsSpikeLanguage(root, item) {
  const p = path.join(root, item.rel || 'AGENTS.md');
  const txt = safeRead(p);
  if (!txt) return { id: item.id, status: 'skipped:missing' };
  const updated = txt
    .replace('# OMP task agents (starter, spec-implementer, architecture-reviewer, deliverer, spike-researcher)', '# OMP task agents (starter, spec-implementer, architecture-reviewer, deliverer)')
    .replace('# ADR directory (populated by write-spec for spikes)', '# ADR directory');
  if (/spike/i.test(updated)) return { id: item.id, status: 'skipped:unverifiable' };
  if (updated === txt) return { id: item.id, status: 'already-current' };
  fs.writeFileSync(p, updated);
  return { id: item.id, status: 'applied' };
}

function applyUpgrade(root, approvedItemIds = [], run, {
  includeIssueDependencies = run === defaultRun,
} = {}) {
  const rootAbs = path.resolve(root);
  const report = detectUpgrade(rootAbs, { run, includeIssueDependencies });
  const approvedSet = new Set(approvedItemIds);
  const results = [];
  const approvedDependencyId = [...approvedSet].find((id) => id.startsWith('issue-dependencies:'));
  const approvedPublicationId = [...approvedSet].find((id) => id.startsWith('publication-files:'));
  const livePublicationItem = report.items.find((item) => item.kind === 'publication-files');
  if (approvedPublicationId && livePublicationItem?.id !== approvedPublicationId) {
    const error = new Error('Publication File(s) changed after plan approval');
    error.reasonCode = 'publication_files_plan_stale';
    throw error;
  }
  const liveDependencyItem = report.items.find((item) => item.kind === 'issue-dependencies');
  if (approvedDependencyId && liveDependencyItem?.id !== approvedDependencyId) {
    const approvedEdges = decodeDependencyEdges(approvedDependencyId);
    if (approvedEdges) {
      const client = createIssueDependencyClient({ cwd: rootAbs, run });
      const graph = readDependencyGraph(client, approvedEdges.flatMap((edge) => [edge.issue, edge.blockedBy]));
      const remaining = preflightBlockedByEdges(graph, approvedEdges);
      if (remaining.length === 0) {
        results.push({
          id: approvedDependencyId,
          status: 'applied',
          applied: [],
          alreadyPresent: approvedEdges,
        });
      }
    }
    if (!results.some((result) => result.id === approvedDependencyId)) {
      const error = new Error('Official dependency graph changed after plan approval');
      error.reasonCode = 'dependency_plan_stale';
      throw error;
    }
  }

  // Split cumulative packages before renaming their shared legacy source.
  const order = (a, b) => {
    const pri = (k) => ({ packaging: 0, 'legacy-layout': 1, 'steering-runtime': 2, 'publication-files': 3, 'cumulative-split': 4, 'directory-rename': 5, 'epic-flatten': 6, 'spike-flatten': 7, 'spike-remove': 7, 'spike-issue-form': 7, 'agents-spike-language': 7, 'frontmatter-fix': 8, 'v2-cleanup': 9, 'omp-sdlc-ignore': 10, 'issue-dependencies': 11, 'already-current': 99 }[k] ?? 50);
    return pri(a.kind) - pri(b.kind);
  };
  const toApply = [...report.items].filter((it) => approvedSet.has(it.id)).sort(order);
  const invalidPublicationIssues = new Set();

  for (const item of toApply) {
    let res;
    if (item.kind === 'steering-runtime') {
      res = applySteeringRuntime(rootAbs, item);
    } else if (item.kind === 'publication-files') {
      res = applyPublicationFiles(rootAbs, item);
    } else
    if (item.kind === 'directory-rename') {
      res = applyDirectoryRename(rootAbs, item);
    } else if (item.kind === 'frontmatter-fix') {
      res = applyFrontmatterFix(rootAbs, item);
    } else if (item.kind === 'cumulative-split') {
      res = applyCumulativeSplit(rootAbs, item);
    } else if (item.kind === 'epic-flatten') {
      res = applyEpicFlatten(rootAbs, item);
    } else if (item.kind === 'spike-flatten') {
      res = applySpikeFlatten(rootAbs, item);
    } else if (item.kind === 'spike-remove') {
      res = applySpikeRemove(rootAbs, item);
    } else if (item.kind === 'spike-issue-form') {
      res = applySpikeIssueForm(rootAbs, item);
    } else if (item.kind === 'agents-spike-language') {
      res = applyAgentsSpikeLanguage(rootAbs, item);
    } else if (item.kind === 'v2-cleanup') {
      res = applyV2Cleanup(rootAbs, item);
    } else if (item.kind === 'omp-sdlc-ignore') {
      const ignored = writeOmpSdlcIgnore(rootAbs);
      res = { id: item.id, status: ignored.ok ? 'applied' : ignored.status };
    } else if (item.kind === 'issue-dependencies') {
      res = applyIssueDependencyUpgrade(item, { cwd: rootAbs, run });
    } else if (item.kind === 'packaging' || item.kind === 'legacy-layout' || item.kind === 'already-current') {
      res = { id: item.id, status: 'applied (detector-only; see upgrade skill for legacy layout)' };
    } else {
      res = { id: item.id, status: 'skipped:unknown-kind' };
    }
    results.push(res);
  }
  const postTransformPublication = publicationFilesUpgrade(rootAbs, listSpecDirs(rootAbs));
  for (const publicationPackage of postTransformPublication?.packages ?? []) {
    const issue = /^specs\/([1-9]\d*)-/.exec(publicationPackage.path)?.[1];
    if (issue) invalidPublicationIssues.add(Number(issue));
  }
  const backfill = backfillSpecCreatedLabels(rootAbs, run, {
    excludeIssues: invalidPublicationIssues,
  });
  results.push({
    id: 'spec-created-backfill',
    status: backfill.ok ? 'applied' : 'failed',
    ...backfill,
  });

  let postDetectItemCount = null;
  let postDetectError = null;
  try {
    postDetectItemCount = detectUpgrade(rootAbs, { run, includeIssueDependencies }).itemCount;
  } catch (error) {
    postDetectError = {
      reasonCode: error?.reasonCode || 'upgrade_detection_failed',
      message: String(error?.message || error),
    };
  }
  return {
    root: rootAbs,
    applied: results.filter((r) => r.status.startsWith('applied')),
    results,
    postDetectItemCount,
    ...(postDetectError ? { postDetectError } : {}),
  };
}

// CLI
const UPGRADE_COMMANDS = new Set(['detect', 'apply', 'detect-publication', 'apply-publication']);
const PUBLICATION_COMMANDS = new Set(['detect-publication', 'apply-publication']);

function validatePublicationCli(argv) {
  const tokens = argv.slice(2);
  const commands = [];
  const legacyValueOptions = new Set(['--root', '-r', '--approve', '-a', '--spec', '-s']);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (UPGRADE_COMMANDS.has(token)) {
      commands.push({ token, index });
    } else if (legacyValueOptions.has(token)) {
      index += 1;
    }
  }
  if (!commands.some(({ token }) => PUBLICATION_COMMANDS.has(token))) return;
  if (commands.length !== 1 || !PUBLICATION_COMMANDS.has(commands[0].token)) {
    throw publicationContractError(
      'publication_cli_invalid',
      'Publication commands require exactly one command token',
    );
  }

  const command = commands[0];
  const aliases = new Map([
    ['--root', 'root'],
    ['-r', 'root'],
    ['--spec', 'spec'],
    ['-s', 'spec'],
    ['--approve', 'approve'],
    ['-a', 'approve'],
  ]);
  const allowed = command.token === 'apply-publication'
    ? new Set(['root', 'spec', 'approve'])
    : new Set(['root', 'spec']);
  const counts = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    if (index === command.index) continue;
    const token = tokens[index];
    let option = aliases.get(token);
    let value;
    if (option) {
      value = tokens[++index];
    } else {
      const match = /^(--root|--spec|--approve)=(.*)$/.exec(token);
      option = match ? aliases.get(match[1]) : null;
      value = match?.[2];
    }
    if (
      !option
      || !allowed.has(option)
      || typeof value !== 'string'
      || value.length === 0
      || value.startsWith('-')
      || UPGRADE_COMMANDS.has(value)
    ) {
      throw publicationContractError(
        'publication_cli_invalid',
        `Unknown, unexpected, or malformed publication argument: ${token}`,
      );
    }
    counts.set(option, (counts.get(option) ?? 0) + 1);
    if (option !== 'spec' && counts.get(option) > 1) {
      throw publicationContractError(
        'publication_cli_invalid',
        `Publication option may occur only once: ${token}`,
      );
    }
  }
  if (command.token === 'apply-publication' && counts.get('approve') !== 1) {
    throw publicationContractError(
      'publication_files_approval_invalid',
      'apply-publication requires exactly one --approve publication-files:<sha256> id',
    );
  }
}

function parseArgv(argv) {
  const args = {
    cmd: null,
    root: process.cwd(),
    approve: [],
    approveOptionCount: 0,
    approveMalformed: false,
    specDirs: [],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (UPGRADE_COMMANDS.has(a)) args.cmd = a;
    else if (a === '--root' || a === '-r') { args.root = argv[++i] || args.root; }
    else if (a.startsWith('--root=')) args.root = a.split('=')[1];
    else if (a === '--approve' || a === '-a') {
      const value = argv[++i] ?? '';
      const entries = value.split(',').map((entry) => entry.trim());
      args.approveOptionCount += 1;
      args.approveMalformed ||= entries.some((entry) => entry.length === 0);
      args.approve = entries.filter(Boolean);
    } else if (a.startsWith('--approve=')) {
      const entries = a.slice('--approve='.length).split(',').map((entry) => entry.trim());
      args.approveOptionCount += 1;
      args.approveMalformed ||= entries.some((entry) => entry.length === 0);
      args.approve = entries.filter(Boolean);
    } else if (a === '--spec' || a === '-s') {
      args.specDirs.push(argv[++i] ?? '');
    } else if (a.startsWith('--spec=')) {
      args.specDirs.push(a.slice('--spec='.length));
    }
  }
  return args;
}

if (isCliEntry(import.meta.url)) {
  try {
    validatePublicationCli(process.argv);
    const args = parseArgv(process.argv);
    if (!args.cmd) {
      console.error('Usage: node scripts/sdlc-upgrade.mjs <detect|apply|detect-publication|apply-publication> [--root <dir>] [--spec specs/N-slug ...] [--approve id1,id2]');
      process.exit(2);
    }
    if (args.cmd === 'detect') {
      const out = detectUpgrade(args.root, { run: defaultRun });
      console.log(JSON.stringify(out, null, 2));
    } else if (args.cmd === 'apply') {
      const out = applyUpgrade(args.root, args.approve, defaultRun);
      console.log(JSON.stringify(out, null, 2));
    } else if (args.cmd === 'detect-publication') {
      const out = detectPublicationUpgrade(args.root, { specDirs: args.specDirs });
      console.log(JSON.stringify(out, null, 2));
    } else if (args.cmd === 'apply-publication') {
      if (args.approveOptionCount !== 1 || args.approveMalformed || args.approve.length !== 1) {
        throw publicationContractError(
          'publication_files_approval_invalid',
          'apply-publication requires exactly one --approve publication-files:<sha256> id',
        );
      }
      const out = applyPublicationUpgrade(args.root, args.approve[0], { specDirs: args.specDirs });
      console.log(JSON.stringify(out, null, 2));
    }
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
}

export {
  applyPublicationUpgrade,
  applyUpgrade,
  detectPublicationUpgrade,
  detectUpgrade,
};
