import { describe, expect, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractClauses,
  extractAgentClauses,
  normalize,
  hashId,
  scan,
  findTrackedFiles,
  validateSkillMetadata,
  validateSkillStructure,
} from '../skill-inventory-audit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'skill-inventory-audit.mjs');
const GOOD_FIXTURE = path.join(REPO_ROOT, 'scripts', '__fixtures__', 'audit-canary', 'good');
const BAD_FIXTURE = path.join(REPO_ROOT, 'scripts', '__fixtures__', 'audit-canary', 'bad');

// ---------------------------------------------------------------------------
// Extraction rules
// ---------------------------------------------------------------------------

describe('extractClauses', () => {
  test('captures lines under tracked H2 sections', () => {
    const source = [
      '# Skill',
      '## Input',
      '- first input',
      '- second input',
      '',
      '## Output',
      '- a result',
    ].join('\n');
    const clauses = extractClauses(source);
    expect(clauses.map((c) => c.text)).toEqual([
      '- first input',
      '- second input',
      '- a result',
    ]);
  });

  test('H4 subsections under ### Step N inherit tracking', () => {
    const source = [
      '## Workflow',
      '### Step 1: Do the thing',
      '#### Input',
      '- an input clause',
      '#### Process',
      '1. A process step.',
      '#### Output',
      '- an output clause',
    ].join('\n');
    const clauses = extractClauses(source);
    expect(clauses.map((c) => c.text)).toEqual([
      '- an input clause',
      '1. A process step.',
      '- an output clause',
    ]);
  });

  test('H4 headings under non-tracked H2 do NOT track', () => {
    const source = [
      '## Background',
      '#### Input',
      '- should not be tracked',
    ].join('\n');
    const clauses = extractClauses(source);
    expect(clauses).toEqual([]);
  });

  test('captures lines under ### Step N sub-headings', () => {
    const source = [
      '## Workflow',
      '### Step 1: Do the thing',
      'Run the first operation.',
      '### Step 2: Do the next thing',
      'Run the second operation.',
    ].join('\n');
    const clauses = extractClauses(source);
    expect(clauses.map((c) => c.text)).toEqual([
      'Run the first operation.',
      'Run the second operation.',
    ]);
  });

  test('ignores lines outside tracked sections', () => {
    const source = [
      '## Background',
      'Prose nobody tracks.',
      '## Input',
      '- tracked',
      '## Guidelines',
      'Prose again.',
    ].join('\n');
    const clauses = extractClauses(source);
    expect(clauses.map((c) => c.text)).toEqual(['- tracked']);
  });

  test('does not capture arbitrary lines outside tracked sections', () => {
    const source = [
      '## Background',
      'This background line is not inventory-tracked.',
      '## Input',
      '- tracked',
    ].join('\n');
    const clauses = extractClauses(source);
    expect(clauses.map((c) => c.text)).toEqual(['- tracked']);
  });

  test('skips fenced code blocks', () => {
    const source = [
      '## Process',
      'Real clause.',
      '```',
      'code that should not be inventoried',
      '```',
      'Another real clause.',
    ].join('\n');
    const clauses = extractClauses(source);
    expect(clauses.map((c) => c.text)).toEqual([
      'Real clause.',
      'Another real clause.',
    ]);
  });

  test('skips table separator rows', () => {
    const source = [
      '## Input',
      '| Column A | Column B |',
      '|----------|----------|',
      '| value A  | value B  |',
    ].join('\n');
    const clauses = extractClauses(source);
    expect(clauses.map((c) => c.text)).toEqual([
      '| Column A | Column B |',
      '| value A  | value B  |',
    ]);
  });
});

describe('extractAgentClauses', () => {
  test('captures body lines and skips frontmatter and headings', () => {
    const source = [
      '---',
      'name: starter',
      'description: Start a branch.',
      '---',
      '',
      '# Starter',
      '',
      'Read skill://start-issue.',
      'Never call ask.',
    ].join('\n');
    expect(extractAgentClauses(source).map((clause) => clause.text)).toEqual([
      'Read skill://start-issue.',
      'Never call ask.',
    ]);
  });
});


// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe('normalize', () => {
  test('is idempotent', () => {
    const once = normalize('**Step 1**: Read the `issue`');
    const twice = normalize(once);
    expect(once).toBe(twice);
  });

  test('strips Markdown emphasis', () => {
    expect(normalize('**bold** and _italic_ words')).toBe('bold and italic words');
  });

  test('strips inline backticks', () => {
    expect(normalize('the `Read` tool fires')).toBe('the read tool fires');
  });

  test('collapses whitespace and lowercases', () => {
    expect(normalize('   MiXeD    Case     text   ')).toBe('mixed case text');
  });

  test('strips list-item markers', () => {
    expect(normalize('- first item')).toBe('first item');
    expect(normalize('  1. numbered')).toBe('numbered');
  });

  test('truncates to first 80 characters', () => {
    const long = 'x'.repeat(200);
    expect(normalize(long).length).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

describe('hashId', () => {
  test('is stable across runs for the same input', () => {
    expect(hashId('step 1: read the issue')).toBe(hashId('step 1: read the issue'));
  });

  test('is 12 hex characters', () => {
    const id = hashId('anything at all');
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  test('changes when normalized content changes', () => {
    expect(hashId('step 1: a')).not.toBe(hashId('step 1: b'));
  });
});

// ---------------------------------------------------------------------------
// Scan against the canary fixture
// ---------------------------------------------------------------------------

describe('scan', () => {
  test('finds both WORKFLOW.md and per-workflow references files', () => {
    const files = findTrackedFiles(GOOD_FIXTURE);
    expect(files).toEqual([
      'plugins/nmg-sdlc/workflows/canary/WORKFLOW.md',
      'plugins/nmg-sdlc/workflows/canary/references/notes.md',
    ]);
  });

  test('finds package-root OMP agent files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-agents-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'workflows', 'status'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'agents'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'workflows', 'status', 'WORKFLOW.md'), [
        '---',
        'name: status',
        'description: "Status."',
        '---',
        '',
        '# Status',
        '',
      ].join('\n'));
      fs.writeFileSync(path.join(tmpDir, 'agents', 'starter.md'), [
        '---',
        'name: starter',
        'description: Start a branch.',
        '---',
        '',
        '# Starter',
        '',
      ].join('\n'));
      expect(findTrackedFiles(tmpDir)).toEqual([
        'agents/starter.md',
        'workflows/status/WORKFLOW.md',
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });


  test('scan produces non-empty inventory over the good fixture', () => {
    const inventory = scan(GOOD_FIXTURE);
    expect(inventory.items.length).toBeGreaterThan(0);
    expect(inventory.generator).toBe('skill-inventory-audit@1');
    expect(inventory.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('every item has a stable 12-char id and a file:line destination', () => {
    const inventory = scan(GOOD_FIXTURE);
    for (const item of inventory.items) {
      expect(item.id).toMatch(/^[0-9a-f]{12}$/);
      expect(item.destination).toMatch(/^[^:]+:\d+$/);
      expect(item.source_before).toBe(item.destination);
    }
  });

  test('scan is deterministic apart from the generated_at timestamp', () => {
    const a = scan(GOOD_FIXTURE);
    const b = scan(GOOD_FIXTURE);
    expect(a.items).toEqual(b.items);
  });
});

// ---------------------------------------------------------------------------
// Loader-facing metadata validation
// ---------------------------------------------------------------------------

describe('validateSkillMetadata', () => {
  test('current workflow descriptions fit the loader limit', () => {
    expect(validateSkillMetadata(REPO_ROOT)).toEqual([]);
  });

  test('flags WORKFLOW.md descriptions longer than 1024 characters', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-'));
    const skillDir = path.join(tmpDir, 'workflows', 'too-long');
    try {
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'WORKFLOW.md'), [
        '---',
        'name: too-long',
        `description: "${'x'.repeat(1025)}"`,
        '---',
        '',
        '# Too Long',
      ].join('\n'));

      expect(validateSkillMetadata(tmpDir)).toEqual([
        expect.objectContaining({
          file: 'workflows/too-long/WORKFLOW.md',
          field: 'description',
          length: 1025,
          max: 1024,
        }),
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('validateSkillStructure', () => {
  test('current workflows include Integration with SDLC Workflow sections', () => {
    expect(validateSkillStructure(REPO_ROOT)).toEqual([]);
  });

  test('flags WORKFLOW.md files missing Integration with SDLC Workflow', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'structure-'));
    const skillDir = path.join(tmpDir, 'workflows', 'missing-section');
    try {
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'WORKFLOW.md'), [
        '---',
        'name: missing-section',
        'description: "Missing the required workflow integration section."',
        '---',
        '',
        '# Missing Section',
        '',
        '## Workflow',
        'Do work.',
      ].join('\n'));

      expect(validateSkillStructure(tmpDir)).toEqual([
        {
          file: 'workflows/missing-section/WORKFLOW.md',
          section: 'Integration with SDLC Workflow',
          message: 'missing required Integration with SDLC Workflow section',
        },
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Canary fixture viacodex exec (exit codes)
// ---------------------------------------------------------------------------

describe('CLI canary fixture', () => {
  let tmpDir;
  let tmpBaseline;
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canary-'));
    tmpBaseline = path.join(tmpDir, 'baseline.json');
    const baseline = spawnSync('node', [
      SCRIPT,
      '--baseline',
      '--repo-root', GOOD_FIXTURE,
      '--output', tmpBaseline,
    ], { encoding: 'utf8' });
    expect(baseline.status).toBe(0);
  });
  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('good fixture passes --check (exit 0)', () => {
    const result = spawnSync('node', [
      SCRIPT,
      '--check',
      '--repo-root', GOOD_FIXTURE,
      '--output', tmpBaseline,
    ], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/clean/);
  });

  test('bad fixture fails --check (exit 1) and names the dropped clause', () => {
    const result = spawnSync('node', [
      SCRIPT,
      '--check',
      '--repo-root', BAD_FIXTURE,
      '--output', tmpBaseline,
    ], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unmapped/);
    expect(result.stderr).toMatch(/each tracked clause is hashed/);
  });

  test('--baseline and --check are mutually exclusive', () => {
    const result = spawnSync('node', [
      SCRIPT,
      '--baseline',
      '--check',
    ], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/mutually exclusive/);
  });

  test('missing baseline produces an instructive error (exit 2)', () => {
    const result = spawnSync('node', [
      SCRIPT,
      '--check',
      '--repo-root', GOOD_FIXTURE,
      '--output', path.join(os.tmpdir(), 'does-not-exist.json'),
    ], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Baseline file not found/);
  });

  test('--diff runs cleanly against the good fixture', () => {
    const result = spawnSync('node', [
      SCRIPT,
      '--diff',
      '--repo-root', GOOD_FIXTURE,
      '--output', tmpBaseline,
    ], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Skill inventory diff/);
  });
});

// ---------------------------------------------------------------------------
// Baseline round-trip integration
// ---------------------------------------------------------------------------

describe('baseline round-trip', () => {
  test('a fresh baseline passes its own --check immediately', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roundtrip-'));
    const tmp = path.join(tmpDir, 'baseline.json');
    try {
      const write = spawnSync('node', [
        SCRIPT,
        '--baseline',
        '--repo-root', GOOD_FIXTURE,
        '--output', tmp,
      ], { encoding: 'utf8' });
      expect(write.status).toBe(0);

      const check = spawnSync('node', [
        SCRIPT,
        '--check',
        '--repo-root', GOOD_FIXTURE,
        '--output', tmp,
      ], { encoding: 'utf8' });
      expect(check.status).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
