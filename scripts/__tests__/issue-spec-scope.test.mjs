import { describe, expect, test } from '@jest/globals';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyIssueSpecScope,
  inspectIssueSpecScope,
  normalizeSpecPath,
  parsePositiveInteger,
} from '../issue-spec-scope.mjs';

const scriptsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(scriptsRoot, '__fixtures__', 'cumulative-issue-scope');
const specPath = 'specs/feature-cumulative-scope';
const specRoot = path.join(fixtureRoot, specPath);

function fixtureDocuments() {
  return {
    requirements: readFileSync(path.join(specRoot, 'requirements.md'), 'utf8'),
    design: readFileSync(path.join(specRoot, 'design.md'), 'utf8'),
    tasks: readFileSync(path.join(specRoot, 'tasks.md'), 'utf8'),
    gherkin: readFileSync(path.join(specRoot, 'feature.gherkin'), 'utf8'),
    manifest: readFileSync(path.join(specRoot, 'issue-scope.json'), 'utf8'),
  };
}

function classify(overrides = {}, issueNumber = 20) {
  return classifyIssueSpecScope(
    { issueNumber, specPath },
    { ...fixtureDocuments(), ...overrides },
  );
}

describe('issue spec scope classifier', () => {
  test('resolves owned, adopted, regression, earlier, and future elements for the active issue', () => {
    const result = inspectIssueSpecScope({ projectRoot: fixtureRoot, specPath, issueNumber: 20 });

    expect(result.status).toBe('scoped');
    expect(result.delivery).toEqual({
      acceptanceCriteria: ['AC1', 'AC2'],
      functionalRequirements: ['FR1', 'FR2'],
      tasks: ['T002', 'T003'],
      scenarios: ['SCN002', 'SCN003'],
    });
    expect(result.regression).toEqual({
      acceptanceCriteria: ['AC4'],
      functionalRequirements: ['FR4'],
      scenarios: ['SCN005'],
    });
    expect(result.delivery.tasks).not.toContain('T001');
    expect(result.delivery.tasks).not.toContain('T004');
    expect(result.ownership.tasks).toEqual({ T001: 10, T002: 10, T003: 20, T004: 30 });
  });

  test('uses whole-spec compatibility only for one unambiguous contributor', () => {
    const documents = fixtureDocuments();
    for (const key of ['requirements', 'design', 'tasks']) {
      documents[key] = documents[key].replace('**Issues**: #10, #20, #30', '**Issues**: #20');
    }
    documents.manifest = null;

    const result = classifyIssueSpecScope({ issueNumber: 20, specPath }, documents);

    expect(result.status).toBe('implicit_single_issue');
    expect(result.delivery.tasks).toEqual(['T001', 'T002', 'T003', 'T004']);
    expect(result.regression).toEqual({ acceptanceCriteria: [], functionalRequirements: [], scenarios: [] });
  });

  test('supports singular defect compatibility without a manifest', () => {
    const documents = fixtureDocuments();
    for (const key of ['requirements', 'design', 'tasks']) {
      documents[key] = documents[key].replace('**Issues**: #10, #20, #30', '**Issue**: #20');
    }
    documents.manifest = null;

    const result = classifyIssueSpecScope({ issueNumber: 20, specPath }, documents);

    expect(result.status).toBe('implicit_single_issue');
    expect(result.reasonCode).toBe('singular_defect_scope');
  });

  test('requires explicit repair for a cumulative spec without a manifest', () => {
    const result = classify({ manifest: null });

    expect(result.status).toBe('repair_required');
    expect(result.reasonCode).toBe('cumulative_manifest_missing');
    expect(result.gaps).toContain(`${specPath}/issue-scope.json is required for a multi-issue spec`);
  });

  test('requires repair for incomplete ownership and missing stable scenario tags', () => {
    const documents = fixtureDocuments();
    const manifest = JSON.parse(documents.manifest);
    manifest.issues['30'].owned.tasks = [];
    manifest.issues['30'].owned.scenarios = [];
    documents.manifest = JSON.stringify(manifest);
    documents.gherkin = documents.gherkin.replace('  @SCN004\n', '');

    const result = classifyIssueSpecScope({ issueNumber: 20, specPath }, documents);

    expect(result.status).toBe('repair_required');
    expect(result.gaps).toContain('tasks identifier T004 has no owner');
    expect(result.gaps.some((gap) => gap.includes('missing a stable @SCN tag'))).toBe(true);
  });

  test('rejects multiple stable scenario tags split across adjacent tag lines', () => {
    const documents = fixtureDocuments();
    documents.gherkin = documents.gherkin.replace(
      '  @SCN003\n',
      '  @SCN003\n  @SCN099\n',
    );

    const result = classifyIssueSpecScope({ issueNumber: 20, specPath }, documents);

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('spec_inventory_invalid');
    expect(result.gaps).toContain('scenario Active owned behavior has multiple stable SCN tags');
  });

  test('fails closed on duplicate ownership and unknown identifiers', () => {
    const manifest = JSON.parse(fixtureDocuments().manifest);
    manifest.issues['20'].owned.tasks.push('T001');
    manifest.issues['20'].adopted.tasks.push('T999');

    const result = classify({ manifest: JSON.stringify(manifest) });

    expect(result.status).toBe('unverifiable');
    expect(result.reasonCode).toBe('scope_mapping_invalid');
    expect(result.gaps.some((gap) => gap.includes('T001 has multiple owners'))).toBe(true);
    expect(result.gaps.some((gap) => gap.includes('unknown tasks identifier T999'))).toBe(true);
  });

  test('fails closed when an issue adopts its own element or overlaps delivery and regression', () => {
    const manifest = JSON.parse(fixtureDocuments().manifest);
    manifest.issues['20'].adopted.acceptanceCriteria.push('AC2');
    manifest.issues['20'].regression.acceptanceCriteria.push('AC1');

    const result = classify({ manifest: JSON.stringify(manifest) });

    expect(result.status).toBe('unverifiable');
    expect(result.gaps).toContain('issue #20 cannot adopt its own acceptanceCriteria identifier AC2');
    expect(result.gaps).toContain('issue #20 uses acceptanceCriteria identifier AC1 for both delivery and regression');
  });

  test('fails closed on malformed JSON and mismatched issue frontmatter', () => {
    const invalidJson = classify({ manifest: '{' });
    expect(invalidJson.status).toBe('unverifiable');
    expect(invalidJson.reasonCode).toBe('manifest_json_invalid');

    const mismatched = classify({
      design: fixtureDocuments().design.replace('**Issues**: #10, #20, #30', '**Issues**: #10, #20'),
    });
    expect(mismatched.status).toBe('unverifiable');
    expect(mismatched.reasonCode).toBe('spec_inventory_invalid');
  });

  test('rejects an active issue that is absent from the spec', () => {
    const result = classify({}, 40);

    expect(result.status).toBe('unverifiable');
    expect(result.gaps).toContain('active issue #40 is not listed in spec frontmatter');
  });

  test('validates CLI scalar inputs and normalized spec paths', () => {
    expect(parsePositiveInteger('20')).toBe(20);
    expect(parsePositiveInteger('0')).toBeNull();
    expect(parsePositiveInteger('02')).toBeNull();
    expect(normalizeSpecPath('specs/feature-cumulative-scope/')).toBe(specPath);
    expect(normalizeSpecPath('../specs/feature-cumulative-scope')).toBeNull();
    expect(normalizeSpecPath('specs/two/levels')).toBeNull();
  });

  test('rejects symbolic-link artifacts and oversized manifests without reading them', () => {
    let readCount = 0;
    const symlinkResult = inspectIssueSpecScope(
      { projectRoot: fixtureRoot, specPath, issueNumber: 20 },
      {
        lstat: (filePath) => {
          if (filePath.endsWith('tasks.md')) {
            return {
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => true,
              size: 10,
            };
          }
          return lstatSync(filePath);
        },
        realpath: (filePath) => realpathSync(filePath),
        readFile: (filePath) => {
          readCount += 1;
          return readFileSync(filePath, 'utf8');
        },
      },
    );
    expect(symlinkResult).toMatchObject({ status: 'unverifiable', reasonCode: 'spec_read_failed' });
    expect(symlinkResult.gaps[0]).toContain('not a symbolic link');
    expect(readCount).toBe(2);

    const oversizedResult = inspectIssueSpecScope(
      { projectRoot: fixtureRoot, specPath, issueNumber: 20 },
      {
        lstat: (filePath) => {
          const fileStat = lstatSync(filePath);
          if (filePath.endsWith('issue-scope.json')) {
            return {
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
              size: 128 * 1024 + 1,
            };
          }
          return fileStat;
        },
        realpath: (filePath) => realpathSync(filePath),
      },
    );
    expect(oversizedResult).toMatchObject({ status: 'unverifiable', reasonCode: 'manifest_read_failed' });
    expect(oversizedResult.gaps[0]).toContain('inspection limit');
  });
});
