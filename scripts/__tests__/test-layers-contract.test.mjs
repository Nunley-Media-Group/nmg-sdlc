import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultPromptRegistry, renderPrompt } from '../../src/sdlc-prompt-snippets.mjs';
import { renderInteractiveWorkflow } from '../../src/sdlc-commands.mjs';
import { renderPromptCli } from '../sdlc-render-prompt.mjs';
import { validateHandoff } from '../sdlc-execute.mjs';

// Implements specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/feature.gherkin.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const RULE_CONSUMERS = ['sdlc-write-spec', 'worker:implement', 'worker:verify', 'sdlc-verify-code'];
const WORKER_VARS = { issue: '7', step: 'implement', handoffPath: '.nmg-sdlc/handoffs/7-implement.json', controllerRunId: '' };

function project(contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-test-layers-contract-'));
  if (contents !== undefined) {
    fs.mkdirSync(path.join(root, 'steering'));
    fs.writeFileSync(path.join(root, 'steering', 'test-layers.json'), contents);
  }
  return root;
}

function keptLine(text) {
  return text.split('\n').find((line) => line.startsWith('This project keeps these test types'));
}

describe('@SCN001 new specs task only scenarios and step definitions under the default', () => {
  const tasks = read('workflows/write-spec/templates/tasks.md');
  const gherkin = read('workflows/write-spec/templates/feature.gherkin');

  it('makes every AC-linked test task implement the feature.gherkin scenarios', () => {
    expect(tasks).toContain('### T002: Implement the `feature.gherkin` scenarios');
    expect(tasks).toContain('### T002: Implement the Regression Scenarios');
    expect(tasks).toContain('An AC-linked test task implements those scenarios by their `@SCN` tags');
    expect(tasks).toContain('plus any production seams the steps need');
    expect(tasks.match(/`@SCN001` \(AC1\)/g)).toHaveLength(2);
    expect(tasks).not.toContain('AC-linked behavioral verification');
    expect(tasks).not.toContain('Add Behavioral Regression Coverage');
  });

  it('never asks for a separate test that restates an AC', () => {
    expect(tasks).toContain('Never task a separate test that restates an AC');
  });

  it('expresses variations of one AC as a Scenario Outline under its single @SCN tag', () => {
    expect(gherkin).toContain('as a `Scenario Outline:` with an `Examples:` table that carries that AC\'s single `@SCN` tag');
    expect(gherkin).toContain('Make the `# File:` header name the scenario\'s implementing test');
  });

  it('keeps the changelog citation rule', () => {
    expect(tasks).toContain('[Unreleased]');
    expect(tasks).toContain('end with the exact citation `(#N)`');
  });
});

describe('@SCN002 kept-test-types setting is read and validated', () => {
  it('renders BDD-only into every consumer when the file is missing, with no manifest', () => {
    const root = project();
    const registry = defaultPromptRegistry(repoRoot, { projectRoot: root });
    for (const consumer of RULE_CONSUMERS) {
      const { text, provenance } = renderPrompt(registry, { consumer, vars: WORKER_VARS });
      expect(keptLine(text)).toBe('This project keeps these test types (from `steering/test-layers.json`; a missing file means `bdd` only): `bdd`.');
      expect(provenance.fragments.map(({ id }) => id)).toContain('project.test-layers');
    }
    expect(renderInteractiveWorkflow('sdlc-write-spec', repoRoot, root)).toContain('# Kept Test Layers');
  });

  it('names exactly the kept types', () => {
    const registry = defaultPromptRegistry(repoRoot, { projectRoot: project('{"version":1,"kept":["unit","bdd"]}') });
    for (const consumer of RULE_CONSUMERS) {
      expect(keptLine(renderPrompt(registry, { consumer, vars: WORKER_VARS }).text))
        .toBe('This project keeps these test types (from `steering/test-layers.json`; a missing file means `bdd` only): `bdd`, `unit`.');
    }
  });

  it('gives plugin-only commands and other consumers no rule', () => {
    const root = project('{"version":1,"kept":["bdd","unit"]}');
    for (const command of ['sdlc-onboard-project', 'sdlc-upgrade-project', 'sdlc-steering']) {
      expect(renderInteractiveWorkflow(command, repoRoot, root)).not.toContain('# Kept Test Layers');
    }
    const registry = defaultPromptRegistry(repoRoot, { projectRoot: root });
    for (const consumer of ['sdlc-draft-issue', 'worker:start', 'worker:deliver']) {
      expect(renderPrompt(registry, { consumer, vars: WORKER_VARS }).text).not.toContain('# Kept Test Layers');
    }
  });

  it.each([
    ['{"version":2,"kept":["bdd"]}', 'steering/test-layers.json: version = 2: must be 1'],
    ['{"version":1,"kept":["bdd","smoke"]}', 'steering/test-layers.json: kept[1] = "smoke": unknown test type'],
    ['{"version":1,"kept":["unit"]}', 'steering/test-layers.json: kept = ["unit"]: must include bdd'],
  ])('fails the render of %s with test_layers_invalid naming the file and field', (contents, message) => {
    const root = project(contents);
    const result = renderPromptCli(['--consumer', 'sdlc-write-spec', '--project', root], { root: repoRoot });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    const error = JSON.parse(result.stderr);
    expect(error).toMatchObject({ ok: false, reasonCode: 'test_layers_invalid' });
    expect(error.message.startsWith(message)).toBe(true);
    expect(() => defaultPromptRegistry(repoRoot, { projectRoot: root })).toThrow(message);
  });

  it('blocks only the four rule consumers, never another command, on an invalid file', () => {
    const root = project('{"version":1,"kept":["bdd","smoke"]}');
    for (const consumer of ['sdlc-draft-issue', 'sdlc-run-retro', 'sdlc-execute']) {
      expect(renderPromptCli(['--consumer', consumer, '--project', root], { root: repoRoot }).status).toBe(0);
    }
    for (const consumer of ['worker:start', 'worker:deliver']) {
      expect(() => renderPrompt(defaultPromptRegistry(repoRoot, { projectRoot: root, consumer }),
        { consumer, vars: WORKER_VARS })).not.toThrow();
    }
    for (const consumer of RULE_CONSUMERS) {
      expect(() => defaultPromptRegistry(repoRoot, { projectRoot: root, consumer }))
        .toThrow('steering/test-layers.json: kept[1] = "smoke": unknown test type');
    }
  });
});

describe('@SCN003 implement workers justify any non-scenario test', () => {
  const handoff = (extra) => ({ schemaVersion: 1, issue: 7, step: 'implement', status: 'passed', intervention: false,
    summary: 'done', artifacts: [], next: 'verify', reasonCode: null, ...extra });

  it('limits write-code test work to scenarios and justified kept-type tests', () => {
    const workflow = read('workflows/write-code/WORKFLOW.md');
    expect(workflow).toContain('### Test Layers');
    expect(workflow).toContain('Test work is the implementation of the active `feature.gherkin` scenarios');
    expect(workflow).toContain('a test that restates a scenario\'s AC only duplicates evidence: never add one');
    expect(workflow).toContain('it is of a kept type other than `bdd`, it covers a behavior that no scenario covers, and it is listed in the handoff\'s `justifiedTests` with its type and justification');
    expect(workflow).toContain('"justifiedTests": []');
    expect(workflow).toContain('It is always empty in a project whose Kept Test Layers rule keeps only `bdd`.');
    expect(workflow).toContain('a `type` that the rendered Kept Test Layers rule keeps (never `bdd`)');
  });

  it('accepts a handoff with no justifiedTests or a well-formed list', () => {
    expect(validateHandoff(handoff())).toMatchObject({ issue: 7 });
    expect(validateHandoff(handoff({ justifiedTests: [] }))).toMatchObject({ justifiedTests: [] });
    const justifiedTests = [{ path: 'scripts/__tests__/clock.test.mjs', type: 'property', justification: 'clock wraparound no scenario covers' }];
    expect(validateHandoff(handoff({ justifiedTests })).justifiedTests).toEqual(justifiedTests);
  });

  it.each([
    [{ path: 'a.test.mjs', type: 'bdd', justification: 'scenario' }],
    [{ path: 'a.test.mjs', type: 'smoke', justification: 'why' }],
    [{ path: 'a.test.mjs', type: 'unit', justification: '' }],
    [{ path: '', type: 'unit', justification: 'why' }],
    [{ path: 'a.test.mjs', type: 'unit', justification: 'why', extra: 1 }],
    ['a.test.mjs'],
    [null],
  ])('rejects a malformed or bdd justifiedTests entry %j with handoff_invalid', (entry) => {
    expect(() => validateHandoff(handoff({ justifiedTests: [entry] }))).toThrow('handoff_invalid');
  });

  it('rejects a non-array justifiedTests with handoff_invalid', () => {
    expect(() => validateHandoff(handoff({ justifiedTests: {} }))).toThrow('handoff_invalid');
  });
});

describe('@SCN004 verify judges scenario coverage and flags duplicates', () => {
  const template = read('workflows/verify-code/checklists/report-template.md');
  const format = read('workflows/verify-code/references/report-format.md');

  it('shows each AC\'s scenario and its implementation status', () => {
    expect(template).toContain('| AC | Scenario | Implementation | Status |');
    expect(template).toContain('| AC1 | `@SCN001` | `path/to/step-definitions-or-scenario-test` | Implemented / Missing / Failing |');
    expect(format).toContain('| AC | Scenario | Implementation | Status |');
  });

  it('flags branch tests that duplicate a scenario or have a non-kept type', () => {
    expect(template).toContain('### Test-Layer Findings');
    expect(template).toContain('- Duplicate: `path/to/test` restates `@SCN00N`');
    expect(template).toContain('which the project does not keep');
    expect(template).toContain('`justifiedTests`');
    expect(format).toContain('Flag each test the branch added or changed that restates a scenario\'s AC, and each that is of a type the project does not keep');
  });

  it('has no per-layer test count', () => {
    for (const text of [template, format]) {
      expect(text).not.toMatch(/Unit tests: \[count\]|Integration tests: \[count\]|\[count\] tests/);
    }
    expect(format).toContain('Never report per-layer test counts');
  });
});

describe('@SCN005 testability checklist no longer rewards a second layer', () => {
  const checklist = read('workflows/verify-code/checklists/testability.md');

  it('applies the injectable-clock and DI checks to step definitions and production seams', () => {
    expect(checklist).toContain('These checks apply to step definitions and the production seams they drive.');
    expect(checklist).toContain('Production seams take their dependencies by injection');
    expect(checklist).toContain('Time-dependent logic uses an injectable clock/time source that step definitions control');
    expect(checklist).not.toContain('## Unit Test Readiness');
  });

  it('has no score level that rewards comprehensive unit tests or unit-test counts', () => {
    const scoring = checklist.slice(checklist.indexOf('## Scoring Guide'));
    expect(scoring).not.toMatch(/unit test|high coverage/i);
    expect(scoring).toContain('| 5 | Injectable seams and clock, every AC\'s scenario implemented and passing, no duplicate tests |');
  });
});

describe('@SCN006 setting is documented', () => {
  const readme = read('README.md');

  it('describes the file, the type vocabulary, the BDD-only default, and how stages honor it', () => {
    expect(readme).toContain('| `steering/test-layers.json` | Project-owned kept test types');
    expect(readme).toContain('### Kept test layers');
    for (const type of ['bdd', 'unit', 'integration', 'property', 'doc']) expect(readme).toContain(`| \`${type}\` |`);
    expect(readme).toContain('A missing file means BDD-only, `{ "version": 1, "kept": ["bdd"] }`.');
    expect(readme).toContain('an invalid file never falls back to the default');
    expect(readme).toContain('- **write-spec** tasks only the scenario implementations');
    expect(readme).toContain('- **implement** writes the scenario implementations.');
    expect(readme).toContain('- **verify** reports, per AC, the covering scenario and its implementation status');
  });
});
