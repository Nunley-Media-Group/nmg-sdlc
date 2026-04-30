import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MANAGED_START = '<!-- nmg-sdlc-managed: spec-context -->';
const MANAGED_END = '<!-- /nmg-sdlc-managed -->';
const MANAGED_SECTION = [
  MANAGED_START,
  '## nmg-sdlc Spec Context',
  '',
  'For SDLC work, project-root `specs/` is the canonical BDD archive. Always identify the active spec first, then use bounded relevant-spec discovery to load only the neighboring specs that can affect the change. Do not load the full archive by default, and do not use legacy `.codex/specs/` as context.',
  MANAGED_END,
  '',
].join('\n');

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-spec-context-'));
  fs.mkdirSync(path.join(dir, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'steering'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'steering', 'product.md'), '# Product\n');
  fs.writeFileSync(path.join(dir, 'steering', 'tech.md'), '# Tech\n');
  fs.writeFileSync(path.join(dir, 'steering', 'structure.md'), '# Structure\n');
  return dir;
}

function writeSpec(project, slug, requirements, design = '', tasks = '') {
  const specDir = path.join(project, 'specs', slug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'requirements.md'), requirements);
  fs.writeFileSync(path.join(specDir, 'design.md'), design || `# Design: ${slug}\n`);
  fs.writeFileSync(path.join(specDir, 'tasks.md'), tasks || `# Tasks: ${slug}\n`);
  fs.writeFileSync(path.join(specDir, 'feature.gherkin'), `Feature: ${slug}\n`);
}

function listSpecs(project) {
  return fs.readdirSync(path.join(project, 'specs'))
    .filter((entry) => fs.existsSync(path.join(project, 'specs', entry, 'requirements.md')))
    .map((entry) => `specs/${entry}/`)
    .sort();
}

function readSpecFile(project, specPath, file) {
  return fs.readFileSync(path.join(project, specPath, file), 'utf8');
}

function extractMetadata(project, specPath) {
  const requirements = readSpecFile(project, specPath, 'requirements.md');
  const design = readSpecFile(project, specPath, 'design.md');
  const tasks = readSpecFile(project, specPath, 'tasks.md');
  const compact = `${requirements}\n${design}\n${tasks}`;
  return {
    specPath,
    title: requirements.match(/^#\s+(.+)$/m)?.[1] ?? '',
    issues: [...compact.matchAll(/#(\d+)/g)].map((match) => Number(match[1])),
    headings: [...compact.matchAll(/^#{1,4}\s+(.+)$/gm)].map((match) => match[1]),
    code: [...compact.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
    compact,
  };
}

function scoreSpec(meta, input) {
  const reasons = [];
  let score = 0;
  let strong = 0;
  let medium = 0;
  const haystack = meta.compact.toLowerCase();

  if (meta.specPath === input.activeSpec) {
    return { ...meta, score: Number.POSITIVE_INFINITY, reasons: ['active spec'], load: true, active: true };
  }

  for (const issue of input.relatedIssues) {
    if (meta.issues.includes(issue)) {
      score += 100;
      strong += 1;
      reasons.push(`matched issue #${issue}`);
    }
  }

  for (const affectedPath of input.affectedPaths) {
    if (haystack.includes(affectedPath.toLowerCase())) {
      score += 80;
      strong += 1;
      reasons.push(`matched affected path ${affectedPath}`);
    }
  }

  for (const symbol of input.symbols) {
    if (haystack.includes(symbol.toLowerCase())) {
      score += 80;
      strong += 1;
      reasons.push(`matched symbol ${symbol}`);
    }
  }

  for (const component of input.components) {
    if (haystack.includes(component.toLowerCase())) {
      score += 35;
      medium += 1;
      reasons.push(`matched component ${component}`);
    }
  }

  for (const keyword of input.keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 20;
      medium += 1;
      reasons.push(`matched keyword ${keyword}`);
    }
  }

  return {
    ...meta,
    score,
    reasons,
    load: strong >= 1 || medium >= 2,
    active: false,
  };
}

function discoverSpecContext(project, input, relatedCap = 3) {
  const scored = listSpecs(project)
    .map((specPath) => extractMetadata(project, specPath))
    .map((meta) => scoreSpec(meta, input))
    .sort((a, b) => b.score - a.score || a.specPath.localeCompare(b.specPath));

  const active = scored.find((candidate) => candidate.active) ?? null;
  const related = scored.filter((candidate) => !candidate.active && candidate.load).slice(0, relatedCap);

  return {
    activeSpec: active?.specPath ?? null,
    relatedSpecs: related.map(({ specPath, score, reasons }) => ({ specPath, score, reasons })),
    scannedSpecCount: scored.length,
    metadataOnlyCount: scored.length - (active ? 1 : 0) - related.length,
    loadedSpecCount: (active ? 1 : 0) + related.length,
  };
}

function hasEquivalentAgentsGuidance(source) {
  return /specs\//.test(source)
    && /active spec/i.test(source)
    && /bounded|capped/i.test(source)
    && /neighboring|related/i.test(source)
    && /\.codex\/specs/.test(source);
}

function ensureAgentsGuidance(project) {
  const target = path.join(project, 'AGENTS.md');
  const status = { agents: 'already present', gaps: [] };
  const steeringFiles = ['product.md', 'tech.md', 'structure.md'].map((file) => path.join(project, 'steering', file));
  const missing = steeringFiles.filter((file) => !fs.existsSync(file));

  if (missing.length > 0) {
    return { agents: 'skipped (missing steering)', gaps: missing.map((file) => path.relative(project, file)) };
  }

  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, `# AGENTS.md\n\n${MANAGED_SECTION}`);
    return { agents: 'created', gaps: [] };
  }

  const source = fs.readFileSync(target, 'utf8');
  const start = source.indexOf(MANAGED_START);
  const end = source.indexOf(MANAGED_END);

  if (start !== -1 && end !== -1 && end > start) {
    const existingSection = source.slice(start, end + MANAGED_END.length);
    if (hasEquivalentAgentsGuidance(existingSection)) {
      return status;
    }
    fs.writeFileSync(target, `${source.slice(0, start)}${MANAGED_SECTION.trimEnd()}${source.slice(end + MANAGED_END.length)}`);
    return { agents: 'updated', gaps: [] };
  }

  if (start !== -1 || end !== -1) {
    const prefix = source.endsWith('\n') ? source : `${source}\n`;
    fs.writeFileSync(target, `${prefix}\n${MANAGED_SECTION}`);
    return { agents: 'updated', gaps: ['malformed managed markers'] };
  }

  if (hasEquivalentAgentsGuidance(source)) {
    return status;
  }

  const prefix = source.endsWith('\n') ? source : `${source}\n`;
  fs.writeFileSync(target, `${prefix}\n${MANAGED_SECTION}`);
  return { agents: 'updated', gaps: [] };
}

describe('bounded spec context exercise coverage (issue #139)', () => {
  test('ranking loads active spec plus capped related specs and leaves unrelated specs metadata-only', () => {
    const project = makeProject();
    writeSpec(project, 'feature-active-change', '# Requirements: Active\n\n**Issues**: #139\n\n### AC1: Use bounded context\n');
    writeSpec(project, 'feature-write-spec-discovery', '# Requirements: Discovery\n\n**Issues**: #40\n\n### AC1: Parent links\n', 'Affected path: `skills/write-spec/references/discovery.md`\nSymbol: `rankSpecCandidates`\n');
    writeSpec(project, 'feature-upgrade-agents', '# Requirements: Agents\n\n### AC1: Managed AGENTS\n', 'Component: `upgrade-project`\nAffected path: `AGENTS.md`\n');
    writeSpec(project, 'feature-onboarding-agents', '# Requirements: Onboarding\n\n### AC1: Prompt guidance\n', 'Component: `onboard-project`\nAffected path: `AGENTS.md`\n');
    writeSpec(project, 'feature-generic-sdlc', '# Requirements: Generic\n\nThis mentions nmg-sdlc specs and workflow only.\n');
    writeSpec(project, 'feature-unrelated', '# Requirements: Unrelated\n\nNo matching terms.\n');

    const result = discoverSpecContext(project, {
      activeSpec: 'specs/feature-active-change/',
      relatedIssues: [],
      affectedPaths: ['skills/write-spec/references/discovery.md', 'AGENTS.md'],
      symbols: ['rankSpecCandidates'],
      components: ['upgrade-project', 'onboard-project'],
      keywords: ['managed AGENTS'],
    });

    expect(result.activeSpec).toBe('specs/feature-active-change/');
    expect(result.relatedSpecs.map((spec) => spec.specPath)).toEqual([
      'specs/feature-write-spec-discovery/',
      'specs/feature-upgrade-agents/',
      'specs/feature-onboarding-agents/',
    ]);
    expect(result.relatedSpecs).toHaveLength(3);
    expect(result.loadedSpecCount).toBe(4);
    expect(result.scannedSpecCount).toBe(6);
    expect(result.metadataOnlyCount).toBe(2);
    expect(result.relatedSpecs[0].reasons).toContain('matched affected path skills/write-spec/references/discovery.md');
  });

  test('strong path and symbol signals outrank generic project terms', () => {
    const project = makeProject();
    writeSpec(project, 'feature-active-change', '# Requirements: Active\n\n**Issues**: #139\n');
    writeSpec(project, 'feature-specific', '# Requirements: Specific\n', 'Affected path: `skills/write-code/SKILL.md`\nSymbol: `boundedSpecContext`\n');
    writeSpec(project, 'feature-generic', '# Requirements: Generic\n\nnmg-sdlc specs workflow issue implementation verification prompt context repeated many times.\n');

    const result = discoverSpecContext(project, {
      activeSpec: 'specs/feature-active-change/',
      relatedIssues: [],
      affectedPaths: ['skills/write-code/SKILL.md'],
      symbols: ['boundedSpecContext'],
      components: [],
      keywords: ['nmg-sdlc'],
    });

    expect(result.relatedSpecs[0].specPath).toBe('specs/feature-specific/');
    expect(result.relatedSpecs.map((spec) => spec.specPath)).not.toContain('specs/feature-generic/');
  });

  test('AGENTS guidance handles missing, incomplete, already-complete, and rerun states without duplicates', () => {
    const missingProject = makeProject();
    expect(ensureAgentsGuidance(missingProject)).toEqual({ agents: 'created', gaps: [] });
    expect(ensureAgentsGuidance(missingProject)).toEqual({ agents: 'already present', gaps: [] });
    const created = fs.readFileSync(path.join(missingProject, 'AGENTS.md'), 'utf8');
    expect(created.match(/nmg-sdlc-managed: spec-context/g)).toHaveLength(1);

    const incompleteProject = makeProject();
    fs.writeFileSync(path.join(incompleteProject, 'AGENTS.md'), '# AGENTS.md\n\n## Local Rules\n\nKeep local instructions.\n');
    expect(ensureAgentsGuidance(incompleteProject)).toEqual({ agents: 'updated', gaps: [] });
    const updated = fs.readFileSync(path.join(incompleteProject, 'AGENTS.md'), 'utf8');
    expect(updated).toContain('## Local Rules');
    expect(updated.match(/nmg-sdlc-managed: spec-context/g)).toHaveLength(1);
    expect(ensureAgentsGuidance(incompleteProject)).toEqual({ agents: 'already present', gaps: [] });

    const equivalentProject = makeProject();
    fs.writeFileSync(path.join(equivalentProject, 'AGENTS.md'), [
      '# AGENTS.md',
      '',
      'For SDLC work use `specs/` as the archive, identify the active spec first, use bounded neighboring related spec loading, and avoid legacy `.codex/specs` context.',
      '',
    ].join('\n'));
    expect(ensureAgentsGuidance(equivalentProject)).toEqual({ agents: 'already present', gaps: [] });
  });
});
