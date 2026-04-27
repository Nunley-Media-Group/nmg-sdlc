import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FORM_RELATIVE_PATH = '.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml';

function canonicalForm() {
  return fs.readFileSync(path.join(repoRoot, FORM_RELATIVE_PATH), 'utf8');
}

function scaffoldProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-sdlc-issue-form-'));
  fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'steering'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'steering', 'product.md'), '# Product\n');
  fs.writeFileSync(path.join(dir, 'steering', 'tech.md'), '# Tech\n');
  fs.writeFileSync(path.join(dir, 'steering', 'structure.md'), '# Structure\n');
  return dir;
}

function issueFormPath(projectDir) {
  return path.join(projectDir, FORM_RELATIVE_PATH);
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function ensureIssueForm(projectDir) {
  const target = issueFormPath(projectDir);
  const template = canonicalForm();
  const existing = readIfExists(target);
  const status = {
    form: 'already present',
    path: FORM_RELATIVE_PATH,
    gaps: [],
  };

  if (existing === null) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, template);
    status.form = 'created';
    return status;
  }

  if (existing !== template) {
    fs.writeFileSync(target, template);
    status.form = 'overwritten';
  }

  return status;
}

describe('managed issue form exercise coverage (issue #135)', () => {
  test('init-style setup creates the form and rerun is idempotent', () => {
    const project = scaffoldProject();

    const first = ensureIssueForm(project);
    expect(first).toEqual({ form: 'created', path: FORM_RELATIVE_PATH, gaps: [] });
    expect(fs.readFileSync(issueFormPath(project), 'utf8')).toBe(canonicalForm());

    const second = ensureIssueForm(project);
    expect(second).toEqual({ form: 'already present', path: FORM_RELATIVE_PATH, gaps: [] });
  });

  test('init-style setup overwrites only the managed target path and preserves unrelated issue templates', () => {
    const project = scaffoldProject();
    const target = issueFormPath(project);
    const unrelated = path.join(project, '.github/ISSUE_TEMPLATE/bug-report.yml');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'name: Project owned placeholder\n');
    fs.writeFileSync(unrelated, 'name: Project bug report\n');

    const status = ensureIssueForm(project);

    expect(status).toEqual({ form: 'overwritten', path: FORM_RELATIVE_PATH, gaps: [] });
    expect(fs.readFileSync(target, 'utf8')).toBe(canonicalForm());
    expect(fs.readFileSync(unrelated, 'utf8')).toBe('name: Project bug report\n');
  });

  test('upgrade-style reconciliation creates missing, overwrites differing, and reports current forms', () => {
    const missing = scaffoldProject();
    expect(ensureIssueForm(missing)).toEqual({ form: 'created', path: FORM_RELATIVE_PATH, gaps: [] });

    const differing = scaffoldProject();
    fs.mkdirSync(path.dirname(issueFormPath(differing)), { recursive: true });
    fs.writeFileSync(issueFormPath(differing), 'name: stale managed path\n');
    expect(ensureIssueForm(differing)).toEqual({ form: 'overwritten', path: FORM_RELATIVE_PATH, gaps: [] });

    const current = scaffoldProject();
    fs.mkdirSync(path.dirname(issueFormPath(current)), { recursive: true });
    fs.writeFileSync(issueFormPath(current), canonicalForm());
    expect(ensureIssueForm(current)).toEqual({ form: 'already present', path: FORM_RELATIVE_PATH, gaps: [] });
  });

  test('upgrade-style reconciliation preserves unrelated issue templates and workflows', () => {
    const project = scaffoldProject();
    const target = issueFormPath(project);
    const unrelatedTemplate = path.join(project, '.github/ISSUE_TEMPLATE/question.yml');
    const unrelatedWorkflow = path.join(project, '.github/workflows/project-ci.yml');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.dirname(unrelatedWorkflow), { recursive: true });
    fs.writeFileSync(target, 'name: stale managed path\n');
    fs.writeFileSync(unrelatedTemplate, 'name: Project question\n');
    fs.writeFileSync(unrelatedWorkflow, 'name: project ci\non: [push]\n');

    const status = ensureIssueForm(project);

    expect(status.form).toBe('overwritten');
    expect(fs.readFileSync(target, 'utf8')).toBe(canonicalForm());
    expect(fs.readFileSync(unrelatedTemplate, 'utf8')).toBe('name: Project question\n');
    expect(fs.readFileSync(unrelatedWorkflow, 'utf8')).toBe('name: project ci\non: [push]\n');
  });
});
