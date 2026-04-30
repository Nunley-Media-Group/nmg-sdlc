import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FORM_RELATIVE_PATH = '.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml';
const SUPPORTED_TYPES = new Set(['checkboxes', 'dropdown', 'input', 'markdown', 'textarea']);

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function fieldBlocks(source) {
  const bodyIndex = source.indexOf('body:\n');
  expect(bodyIndex).toBeGreaterThanOrEqual(0);
  return source
    .slice(bodyIndex + 'body:\n'.length)
    .split(/\n(?=  - type: )/)
    .filter((block) => block.startsWith('  - type: '))
    .map((block) => ({
      type: block.match(/^  - type: ([^\n]+)$/m)?.[1]?.trim() ?? null,
      id: block.match(/^    id: ([^\n]+)$/m)?.[1]?.trim() ?? null,
      label: block.match(/^      label: ([^\n]+)$/m)?.[1]?.trim() ?? null,
      required: /^      required: true$/m.test(block),
      block,
    }));
}

function optionLines(block) {
  const optionsIndex = block.indexOf('\n      options:\n');
  if (optionsIndex === -1) return [];
  const tail = block.slice(optionsIndex + '\n      options:\n'.length);
  const section = tail.split(/\n    validations:|\n      [a-zA-Z-]+: /)[0];
  return section.split('\n').filter((line) => /^\s{8}- /.test(line));
}

describe('managed GitHub issue form contract (issue #135)', () => {
  test('canonical issue form exists with required top-level keys and body fields', () => {
    const source = read(FORM_RELATIVE_PATH);
    expect(source).toMatch(/^name: .+/m);
    expect(source).toMatch(/^description: .+/m);
    expect(source).toMatch(/^body:\n/m);

    const fields = fieldBlocks(source);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((field) => field.type !== 'markdown')).toBe(true);
    for (const field of fields) {
      expect(SUPPORTED_TYPES.has(field.type)).toBe(true);
    }
  });

  test('required draft-issue fields are present and marked required', () => {
    const fields = fieldBlocks(read(FORM_RELATIVE_PATH));
    const byLabel = new Map(fields.map((field) => [field.label, field]));

    for (const label of [
      'Issue Type',
      'User Story or Bug/Spike Context',
      'Current State / Background',
      'Acceptance Criteria',
      'Functional Requirements',
      'Scope Boundaries',
      'Priority',
      'Automation Suitability',
    ]) {
      expect(byLabel.get(label)?.required).toBe(true);
    }

    expect(byLabel.get('Additional Notes')?.required).toBe(false);
    expect(byLabel.get('Acceptance Criteria')?.block).toContain('Given');
    expect(byLabel.get('Acceptance Criteria')?.block).toContain('When');
    expect(byLabel.get('Acceptance Criteria')?.block).toContain('Then');
  });

  test('ids, labels, and dropdown options are unique and schema-safe', () => {
    const fields = fieldBlocks(read(FORM_RELATIVE_PATH));
    const ids = fields.filter((field) => field.id !== null).map((field) => field.id);
    const labels = fields.filter((field) => field.label !== null).map((field) => field.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }

    for (const field of fields.filter((item) => item.type === 'dropdown')) {
      const options = optionLines(field.block).map((line) => line.trim().replace(/^- /, ''));
      expect(options.length).toBeGreaterThan(0);
      expect(new Set(options).size).toBe(options.length);
      expect(options).not.toContain('None');
    }
  });

  test('boolean-like dropdown options are quoted in source text', () => {
    const source = read(FORM_RELATIVE_PATH);
    expect(source).toContain('- "Yes"');
    expect(source).toContain('- "No"');
    expect(source).not.toMatch(/^\s+- (?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/m);
  });

  test('shared issue-form contract defines lifecycle behavior and status output', () => {
    const contract = read('references/issue-form.md');

    expect(contract).toContain(FORM_RELATIVE_PATH);
    expect(contract).toContain('created');
    expect(contract).toContain('overwritten');
    expect(contract).toContain('already present');
    expect(contract).toContain('skipped (<reason>)');
    expect(contract).toContain('Issue Form:');
    expect(contract).toContain('Preserve every unrelated file under `.github/ISSUE_TEMPLATE/` byte-for-byte');
    expect(contract).toContain('Do not call `request_user_input`');
  });

  test('init-config, upgrade-project, README, and CHANGELOG reference the managed form', () => {
    const initConfig = read('skills/init-config/SKILL.md');
    const upgradeProject = read('skills/upgrade-project/SKILL.md');
    const upgradeProcedures = read('skills/upgrade-project/references/upgrade-procedures.md');
    const readme = read('README.md');
    const changelog = read('CHANGELOG.md');

    expect(initConfig).toContain('Read `../../references/issue-form.md` when runner config setup reaches managed issue-form installation');
    expect(initConfig).toContain('Issue Form status block');
    expect(upgradeProject).toContain('Read `../../references/issue-form.md` when analyzing or applying issue-form findings');
    expect(upgradeProject).toContain(`${FORM_RELATIVE_PATH} — Managed GitHub Issue Form for SDLC-ready issues`);
    expect(upgradeProject).toContain('### Step 7d: Analyze Issue Form');
    expect(upgradeProcedures).toContain('Apply approved or unattended-managed findings from `../../references/issue-form.md`');
    expect(upgradeProcedures).toContain('Form: created | overwritten | already present | skipped');
    expect(readme).toContain(`installs \`${FORM_RELATIVE_PATH}\``);
    expect(readme).toContain('overwrites any existing file at that managed issue-form path');
    expect(changelog).toContain('managed GitHub Issue Form for issue #135');
  });
});
