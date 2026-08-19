#!/usr/bin/env node
/**
 * sdlc-upgrade.mjs
 * v3 upgrade detectors and apply (testable, no live GitHub).
 *
 * Exports:
 *   detectUpgrade(root)
 *   applyUpgrade(root, approvedItemIds)
 *
 * Detectors are read-only. apply only mutates for approved ids.
 * Never mutates the caller's specs/ unless the caller passes a temp root.
 * Reuses parseBodyRelationships exactly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBodyRelationships } from './epic-relationships.mjs';

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

function readSpecFile(dirFull, name) {
  return safeRead(path.join(dirFull, name));
}

function hasVerificationReport(dirFull) {
  return isFile(path.join(dirFull, 'verification-report.md'));
}

function computeStatusAfter(dirFull, originalStatus) {
  if (hasVerificationReport(dirFull)) return 'Approved';
  if (originalStatus === 'Amended') return 'Draft';
  // preserve sane existing or default
  if (originalStatus === 'Approved' || originalStatus === 'Draft') return originalStatus;
  return 'Draft';
}

function rewriteFrontmatter(content, targetN, targetStatus) {
  let c = String(content || '');
  c = c.replace(/^\*\*Issues?\*\*:\s*.*$/gm, `**Issue**: #${targetN}`);
  c = c.replace(/^\*\*Status\*\*:\s*.*$/gm, `**Status**: ${targetStatus}`);
  if (!/^\*\*Issue\*\*:/m.test(c)) {
    c = c.replace(/^(# .+)$/m, `$1\n\n**Issue**: #${targetN}\n**Date**: ${new Date().toISOString().slice(0, 10)}\n**Status**: ${targetStatus}\n**Author**: Unknown`);
  }
  if (!/^\*\*Date\*\*:/m.test(c)) {
    c = c.replace(/^(\*\*Issue\*\*:[^\n]*)/m, `$1\n**Date**: ${new Date().toISOString().slice(0, 10)}`);
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
      // keep following indented scenario lines if keepCurrent
    }

    if (keepCurrent || /^# |^## |^\s*$/.test(line)) {
      out.push(line);
    }
    // reset keep on next marker for gherkin
    if (section === 'gherkin' && /^Feature:|^@|^\s*$/.test(line) && !keepCurrent) {
      keepCurrent = true;
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

function detectUpgrade(root) {
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

  // 7. Repeat-run already current
  const alreadyLinear = specDirs.every((d) => /^\d+-[a-z0-9-]/.test(d.name));
  const fmOk = specDirs.every((d) => {
    const req = readSpecFile(d.full, 'requirements.md') || '';
    const ns = extractIssueNumbersFromContent(req);
    return ns.length === 1 && d.name.startsWith(`${ns[0]}-`);
  });
  if (alreadyLinear && fmOk && !hasEpics && !hasScopes) {
    items.push({
      id: 'repeat-run-already-current',
      kind: 'already-current',
      description: 'All specs are linear specs/{N}-{slug}/ with singular **Issue** and no epic/scope artifacts.',
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
    // copy files then rename dir? use rename for dir
    safeDirRename(fromFull, toFull);
    // update frontmatter inside the moved dir
    for (const fname of ['requirements.md', 'design.md', 'tasks.md']) {
      const fp = path.join(toFull, fname);
      if (isFile(fp)) {
        let txt = safeRead(fp);
        txt = rewriteFrontmatter(txt, item.primaryN, item.newStatus || 'Draft');
        fs.writeFileSync(fp, txt);
      }
    }
    // cross ref update
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
  for (const fname of ['requirements.md', 'design.md', 'tasks.md']) {
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
    for (const fname of ['requirements.md', 'design.md', 'tasks.md']) {
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
    // Use the shared parser (do not fork regex) to normalize/emit Depends on: and Blocks: for real execution edges after epic removal.
    const reqFp = path.join(toFull, 'requirements.md');
    let reqTxt = safeRead(reqFp);
    if (reqTxt) {
      const rels = parseBodyRelationships(reqTxt);
      let injected = false;
      if (rels.dependsOn.length > 0) {
        const line = `Depends on: ${rels.dependsOn.map((n) => `#${n}`).join(', ')}`;
        if (!/^\s*Depends on:/im.test(reqTxt)) {
          reqTxt = reqTxt.trimEnd() + '\n\n' + line + '\n';
          injected = true;
        }
      }
      if (rels.blocks.length > 0) {
        const line = `Blocks: ${rels.blocks.map((n) => `#${n}`).join(', ')}`;
        if (!/^\s*Blocks:/im.test(reqTxt)) {
          reqTxt = reqTxt.trimEnd() + '\n\n' + line + '\n';
          injected = true;
        }
      }
      if (injected) fs.writeFileSync(reqFp, reqTxt);
    }


    // remove the aggregate dir and any leftover epic-*
    if (item.aggregateRel) {
      const aggFull = path.join(root, item.aggregateRel);
      removeDirSafe(aggFull);
    }
    // also sweep any remaining epic- under specs
    const specsDir = path.join(root, 'specs');
    for (const ent of listDir(specsDir)) {
      if (ent.isDirectory() && ent.name.startsWith('epic-')) {
        removeDirSafe(path.join(specsDir, ent.name));
      }
    }
    // delete any stray epic-link / scope under specs (defensive)
    function sweepDelete(p) {
      for (const ent of listDir(p)) {
        const fp = path.join(p, ent.name);
        if (ent.isDirectory()) sweepDelete(fp);
        else if (ent.name === 'epic-link.json' || ent.name === 'epic-scope.json' || ent.name === 'issue-scope.json') {
          removeFileSafe(fp);
        }
      }
    }
    sweepDelete(specsDir);

    updateCrossReferences(root, item.from, item.to);

    // Note: github label removal / native parent removal is proposal-only here.
    // If item had a github sub-id it would be handled separately; per contract apply only when id approved.
    return { id: item.id, status: 'applied' };
  } catch (e) {
    return { id: item.id, status: `failed:${e.message}` };
  }
}

function applyV2Cleanup(root, item) {
  if (item.rel === '.gitignore') {
    const r = editGitignoreForV2(root);
    return { id: item.id, status: r.status };
  }
  const p = path.join(root, item.rel);
  const kind = isDir(p) ? 'dir' : isFile(p) ? 'file' : 'absent';
  if (kind === 'absent') return { id: item.id, status: 'already clean' };
  if (kind !== 'file') return { id: item.id, status: 'preserved (unmanaged)' };
  try {
    fs.unlinkSync(p);
    return { id: item.id, status: isFile(p) ? 'failed:still-present' : 'removed' };
  } catch (e) {
    return { id: item.id, status: `failed:${e.message}` };
  }
}

function applyUpgrade(root, approvedItemIds = []) {
  const rootAbs = path.resolve(root);
  const report = detectUpgrade(rootAbs);
  const approvedSet = new Set(approvedItemIds);
  const results = [];

  // order: packaging/legacy first (non spec), then renames, splits, flattens, frontmatter, cleanup
  const order = (a, b) => {
    const pri = (k) => ({ packaging: 0, 'legacy-layout': 1, 'directory-rename': 2, 'cumulative-split': 3, 'epic-flatten': 4, 'frontmatter-fix': 5, 'v2-cleanup': 6, 'already-current': 99 }[k] ?? 50);
    return pri(a.kind) - pri(b.kind);
  };
  const toApply = [...report.items].filter((it) => approvedSet.has(it.id)).sort(order);

  for (const item of toApply) {
    let res;
    if (item.kind === 'directory-rename') {
      res = applyDirectoryRename(rootAbs, item);
    } else if (item.kind === 'frontmatter-fix') {
      res = applyFrontmatterFix(rootAbs, item);
    } else if (item.kind === 'cumulative-split') {
      res = applyCumulativeSplit(rootAbs, item);
    } else if (item.kind === 'epic-flatten') {
      res = applyEpicFlatten(rootAbs, item);
    } else if (item.kind === 'v2-cleanup') {
      res = applyV2Cleanup(rootAbs, item);
    } else if (item.kind === 'packaging' || item.kind === 'legacy-layout' || item.kind === 'already-current') {
      // packaging and legacy layout are detected only; actual relocate is still in the skill's legacy path or no-op here.
      // For v3 contract, report as applied when approved (skill may do the .codex move).
      res = { id: item.id, status: 'applied (detector-only; see upgrade skill for legacy layout)' };
    } else {
      res = { id: item.id, status: 'skipped:unknown-kind' };
    }
    results.push(res);
  }

  const remaining = detectUpgrade(rootAbs);
  return {
    root: rootAbs,
    applied: results.filter((r) => r.status.startsWith('applied')),
    results,
    postDetectItemCount: remaining.itemCount,
  };
}

// CLI
function parseArgv(argv) {
  const args = { cmd: null, root: process.cwd(), approve: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'detect' || a === 'apply') args.cmd = a;
    else if (a === '--root' || a === '-r') { args.root = argv[++i] || args.root; }
    else if (a.startsWith('--root=')) args.root = a.split('=')[1];
    else if (a === '--approve' || a === '-a') {
      const v = argv[++i] || '';
      args.approve = v.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--approve=')) {
      args.approve = a.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = parseArgv(process.argv);
  if (!args.cmd) {
    console.error('Usage: node scripts/sdlc-upgrade.mjs <detect|apply> [--root <dir>] [--approve id1,id2]');
    process.exit(2);
  }
  try {
    if (args.cmd === 'detect') {
      const out = detectUpgrade(args.root);
      console.log(JSON.stringify(out, null, 2));
    } else if (args.cmd === 'apply') {
      const out = applyUpgrade(args.root, args.approve);
      console.log(JSON.stringify(out, null, 2));
    }
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
}

export { detectUpgrade, applyUpgrade };
