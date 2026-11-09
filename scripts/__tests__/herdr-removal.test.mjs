import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from this file, not the working directory, so the test reads the same checkout wherever jest runs.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const HERDR = /herdr/i;
const HERDR_VARIABLE = /\bHERDR_[A-Z_]+/;
const HERDR_COMMAND = /\bherdr\s+(pane|agent|integration)\b/i;

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

// The files in one directory (not recursive) whose names match `pattern`, as repo-relative paths.
function filesIn(relativeDirectory, pattern) {
  return fs.readdirSync(path.join(repoRoot, relativeDirectory))
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => path.posix.join(relativeDirectory, name));
}

// `file:line: text` for each line of `relativePath` that `matches`, so a failure names the exact spot.
function findingsIn(relativePath, matches) {
  return read(relativePath).split('\n').flatMap((line, index) => (
    matches(line) ? [`${relativePath}:${index + 1}: ${line.trim()}`] : []
  ));
}

// Runtime code, the agent definitions and the execute workflow: none may name Herdr.
// Exempt: scripts/sdlc-upgrade.mjs. It holds the v3 and v4 detector text that the upgrade migration matches
// (the herdr integration commands, the Herdr worker-pane sentence it rewrites, and the migration group id
// `packaging-v4-claude-code-herdr`), so it must name Herdr to find what it removes.
// Not scanned: scripts/__tests__/** (test code), CHANGELOG.md (released entries are history), specs/ (history),
// and .worktrees/, node_modules/ and .nmg-sdlc/ (not part of the checkout's source).
const RUNTIME_EXEMPT = new Set(['scripts/sdlc-upgrade.mjs']);
const RUNTIME_FILES = [
  ...filesIn('scripts', /\.mjs$/).filter((file) => !RUNTIME_EXEMPT.has(file)),
  ...filesIn('src', /\.(mjs|d\.mts)$/),
  'hooks/register.ts',
  ...filesIn('steering/extensions', /\.mjs$/),
  'workflows/execute/WORKFLOW.md',
  ...filesIn('agents', /\.md$/),
];

// The public and steering documents: they may say "Herdr" in prose history, but no HERDR_ variable and no
// `herdr pane|agent|integration` command may remain.
const DOCUMENTS = [
  'README.md',
  'CONTRIBUTING.md',
  'CLAUDE.md',
  'references/claude-code-tooling.md',
  'references/contribution-guide.md',
  ...filesIn('steering/snippets', /\.md$/),
];

describe('Herdr removal (T013, FR5, FR10)', () => {
  it('scans a real runtime set, so the no-Herdr checks cannot pass vacuously', () => {
    expect(RUNTIME_FILES.length).toBeGreaterThan(20);
    expect(RUNTIME_FILES).toEqual(expect.arrayContaining([
      'scripts/sdlc-execute.mjs', 'scripts/sdlc-execute-host.mjs', 'src/execute-host.mjs', 'hooks/register.ts',
      'agents/spec-implementer.md', 'workflows/execute/WORKFLOW.md',
    ]));
    expect(fs.existsSync(path.join(repoRoot, 'scripts/sdlc-upgrade.mjs'))).toBe(true);
  });

  it('runtime code, the stage agents and the execute workflow name no Herdr', () => {
    expect(RUNTIME_FILES.flatMap((file) => findingsIn(file, (line) => HERDR.test(line)))).toEqual([]);
  });

  it('the public and steering documents name no HERDR_ variable and no herdr pane, agent or integration command', () => {
    const findings = DOCUMENTS.flatMap((file) => findingsIn(file, (line) => HERDR_VARIABLE.test(line) || HERDR_COMMAND.test(line)));
    expect(findings).toEqual([]);
  });

  it('README documents the session id option and the execute result command', () => {
    const readme = read('README.md');
    expect(readme).toContain('--session-id');
    expect(readme).toContain('/sdlc-execute --result');
  });
});

// AC9 (#538): autopilot is removed. No runtime file, workflow, interactive-gates reference or public
// document may read or document NMG_SDLC_AUTOPILOT. History (specs/, CHANGELOG.md, ADRs and the
// references/rewrite-* records of its removal) is not scanned.
describe('NMG_SDLC_AUTOPILOT removal (#538)', () => {
  const workflowFiles = fs.readdirSync(path.join(repoRoot, 'workflows'), { recursive: true })
    .map((name) => path.posix.join('workflows', String(name).split(path.sep).join('/')))
    .filter((file) => file.endsWith('.md') || file.endsWith('.mjs'))
    .sort();
  const AUTOPILOT_FILES = [
    'hooks/register.ts',
    ...filesIn('src', /\.(mjs|d\.mts)$/),
    ...filesIn('scripts', /\.mjs$/),
    ...filesIn('steering/extensions', /\.mjs$/),
    ...filesIn('steering/snippets', /\.md$/),
    ...workflowFiles,
    'references/interactive-gates.md',
    'README.md',
    'CLAUDE.md',
    'CONTRIBUTING.md',
  ];

  it('scans the workflows and the runtime, so the check cannot pass vacuously', () => {
    expect(AUTOPILOT_FILES).toEqual(expect.arrayContaining([
      'workflows/execute/WORKFLOW.md', 'workflows/verify-code/references/exercise-testing.md', 'src/host-events.mjs',
    ]));
  });

  it('no runtime file, workflow or public document names NMG_SDLC_AUTOPILOT', () => {
    expect(AUTOPILOT_FILES.flatMap((file) => findingsIn(file, (line) => line.includes('NMG_SDLC_AUTOPILOT')))).toEqual([]);
  });
});
