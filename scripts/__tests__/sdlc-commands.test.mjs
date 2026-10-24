import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  interactiveHeadlessMessage,
  isInteractiveCommand,
  parseInteractiveSlash,
  recommendedAnswers,
  renderInteractiveWorkflow,
  renderWriteSpecContinuation,
  withArguments,
  writeSpecFinishedSelection,
  writeSpecMergeIssue,
  writeSpecMergeResult,
  writeSpecPublication,
} from '../../src/sdlc-commands.mjs';
import {
  AUTOMATED_COMMANDS,
  INTERACTIVE_COMMANDS,
  SDLC_MODELS,
  materializePluginRootCommand,
  materializePluginRootPath,
  soleJsonObject,
} from '../../src/host-events.mjs';
import { renderPromptCli } from '../sdlc-render-prompt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function provenanceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-command-provenance-'));
}

describe('interactive command rendering', () => {
  it('renders /sdlc-write-spec with materialized controllers and arguments', () => {
    const text = withArguments(renderInteractiveWorkflow('sdlc-write-spec', repoRoot, provenanceRoot()), '#42');
    expect(text).toContain('# Write Spec');
    expect(text).toContain('$ARGUMENTS: #42');
    expect(text).not.toContain('/skill:');
    expect(text).toContain('publish-approved-spec.mjs');
    expect(text).not.toContain('node <plugin-root>/scripts/');
    expect(text).not.toContain('node scripts/');
  });

  it('recognizes only the interactive commands', () => {
    expect(parseInteractiveSlash('/sdlc-draft-issue auth')).toEqual({ command: 'sdlc-draft-issue', skill: 'draft-issue', args: 'auth' });
    expect(parseInteractiveSlash('/sdlc-execute #9')).toEqual({ command: 'sdlc-execute', skill: 'execute', args: '#9' });
    expect(parseInteractiveSlash('/sdlc-status --json')).toBeNull();
    expect(isInteractiveCommand('sdlc-write-spec')).toBe(true);
    expect(isInteractiveCommand('sdlc-open-pr')).toBe(false);
  });

  it('assigns one model alias to every interactive and automated command', () => {
    const names = [...INTERACTIVE_COMMANDS, ...AUTOMATED_COMMANDS].map(([name]) => name).sort();
    expect(Object.keys(SDLC_MODELS.commands).sort()).toEqual(names);
    for (const model of [...Object.values(SDLC_MODELS.commands), ...Object.values(SDLC_MODELS.stages), SDLC_MODELS.repair]) {
      expect(['haiku', 'sonnet', 'opus']).toContain(model);
    }
    expect(Object.isFrozen(SDLC_MODELS) && Object.isFrozen(SDLC_MODELS.stages) && Object.isFrozen(SDLC_MODELS.commands)).toBe(true);
  });

  it('keeps withArguments contract', () => {
    expect(withArguments('BODY', '  #7  ')).toBe('BODY\n\n$ARGUMENTS: #7');
    expect(withArguments('BODY', '   ')).toBe('BODY');
  });

  it('fails headless invocations closed with the TUI message', () => {
    expect(interactiveHeadlessMessage('sdlc-write-spec')).toBe('Run /sdlc-write-spec in the TUI.\n');
  });
});

describe('sdlc-render-prompt CLI', () => {
  it('renders an interactive workflow with arguments', () => {
    const result = renderPromptCli(['--consumer', 'sdlc-draft-issue', '--project', provenanceRoot(), '--args', 'auth'], { root: repoRoot });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('$ARGUMENTS: auth');
    expect(result.stderr).toBe('');
  });

  it('renders the write-spec continuation from a published list', () => {
    const result = renderPromptCli([
      '--consumer', 'sdlc-write-spec', '--project', provenanceRoot(),
      '--published', JSON.stringify([{ issue: 400, slug: 'first' }, { issue: 402, slug: 'second' }]),
    ], { root: repoRoot });
    expect(result.status).toBe(0);
    expect(result.stdout.startsWith('Post-publication continuation. published[] = [400, 402]')).toBe(true);
  });

  it.each([
    ['an automated command', ['--consumer', 'sdlc-status', '--project', '.']],
    ['a missing project', ['--consumer', 'sdlc-write-spec']],
    ['an unknown flag', ['--consumer', 'sdlc-write-spec', '--project', '.', '--bogus']],
  ])('rejects %s with a usage error', (_label, argv) => {
    const result = renderPromptCli(argv, { root: repoRoot });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, reasonCode: 'usage' });
  });

  it.each([
    ['an empty list', '[]'],
    ['a bad slug', '[{"issue":1,"slug":"Bad Slug"}]'],
    ['a non-positive issue', '[{"issue":0,"slug":"x"}]'],
  ])('rejects %s of published specs', (_label, published) => {
    const result = renderPromptCli(['--consumer', 'sdlc-write-spec', '--project', provenanceRoot(), '--published', published], { root: repoRoot });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, reasonCode: 'published_invalid' });
  });

  it('runs as a CLI entry', () => {
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/sdlc-render-prompt.mjs'), '--consumer', 'sdlc-run-retro', '--project', provenanceRoot()], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('# Run Retro');
  });
});

describe('write-spec publication', () => {
  const helper = JSON.stringify(`${repoRoot}/scripts/publish-approved-spec.mjs`);
  const slug = 'restore-per-spec-plan-approval-and-ci-gated-merge-waiting';
  const command = `node ${helper} merge --issue 400 --dir specs/400-${slug}`;
  const merged = (fields = {}) => JSON.stringify({ ok: true, merged: true, pr: 401, issue: 400, dir: `specs/400-${slug}`, ...fields });
  const call = (overrides = {}) => ({ toolUseId: 'call-400', command, stdout: `${merged()}\n\nWall time: 1 second`, ...overrides });

  it.each([
    ['successful publication', call()],
    ['post-merge helper failure', call({ stdout: `Exit code 1\n${merged({ ok: false, reasonCode: 'default_checkout_failed' })}` })],
    ['a trailing-slash root', call({ command: `node "${repoRoot}//scripts/publish-approved-spec.mjs" merge --issue 400 --dir specs/400-${slug}` })],
    ['a single-quoted helper path', call({ command: `node '${repoRoot}/scripts/publish-approved-spec.mjs' merge --issue 400 --dir specs/400-${slug}` })],
    ['an unmaterialized plugin root', call({ command: `node <plugin-root>/scripts/publish-approved-spec.mjs merge --issue 400 --dir specs/400-${slug}` })],
    ['a chained command with a sole valid result', call({ command: `${command} && echo done` })],
  ])('records the merged publication for %s', (_label, input) => {
    expect(writeSpecPublication(input)).toEqual({ issue: 400, slug, pr: 401 });
  });

  it('renders the complete workflow entered at the Continue loop with every published issue', () => {
    const prompt = renderWriteSpecContinuation(repoRoot, provenanceRoot(), [
      { issue: 400, slug: 'first' },
      { issue: 402, slug: 'second' },
    ]);
    expect(prompt.startsWith(
      'Post-publication continuation. published[] = [400, 402] (N-slug names: 400-first, 402-second). Skip Initial issue selection and start ## Continue loop.\n\n',
    )).toBe(true);
    expect(prompt).toContain('# Write Spec');
    expect(prompt).toContain('## Continue loop');
    expect(prompt).not.toContain('$ARGUMENTS:');
    expect(prompt).not.toContain('node <plugin-root>/scripts/');
  });

  it.each([
    ['pre-merge failure', call({ stdout: '{"ok":false,"reasonCode":"pr_merge_failed"}' })],
    ['malformed output', call({ stdout: '{"merged":true' })],
    ['multiple JSON objects', call({ stdout: `${merged()}\n${merged({ pr: 402 })}` })],
    ['unrelated command', call({ command: 'printf done' })],
    ['a result without issue', call({ stdout: merged({ issue: undefined }) })],
    ['a result without merged true', call({ stdout: merged({ merged: false }) })],
    ['a directory issue that disagrees with the result issue', call({ stdout: merged({ dir: `specs/401-${slug}` }) })],
    ['a result issue that disagrees with the command', call({ stdout: merged({ issue: 401, dir: `specs/401-${slug}` }) })],
    ['a non-positive PR', call({ stdout: merged({ pr: 0 }) })],
    ['a missing tool_use_id', call({ toolUseId: '' })],
  ])('rejects %s', (_label, input) => {
    expect(writeSpecPublication(input)).toBeNull();
  });

  it('recognizes the merge command by its --issue, whatever its spelling', () => {
    expect(writeSpecMergeIssue(command)).toBe(400);
    expect(writeSpecMergeIssue(`node ${helper} merge --issue "400" --dir specs/400-${slug}`)).toBe(400);
    expect(writeSpecMergeIssue(`node ${helper} commit-push --issue 400 --dir specs/400-${slug}`)).toBeNull();
    expect(writeSpecMergeIssue(`node ${helper} merge --issues 400`)).toBeNull();
    expect(writeSpecMergeIssue(undefined)).toBeNull();
  });

  it('accepts only a sole merged JSON object whose dir leads with its issue', () => {
    expect(writeSpecMergeResult(merged())).toEqual({ issue: 400, slug, pr: 401 });
    expect(writeSpecMergeResult(merged({ dir: 'specs/400-Bad_Slug' }))).toBeNull();
    expect(soleJsonObject('text\n{"a":1}\nmore')).toEqual({ a: 1 });
    expect(soleJsonObject('{"a":1}\n{"b":2}')).toBeNull();
    expect(soleJsonObject('[1]')).toBeNull();
  });

  it('runs the merge step in the background and waits for its completion without a timeout', () => {
    const text = renderInteractiveWorkflow('sdlc-write-spec', repoRoot, provenanceRoot());
    const step = text.split('\n').find((line) => line.startsWith('4. ') && line.includes('merge --issue N'));
    expect(step).toBeDefined();
    expect(step).toContain('run_in_background: true');
    expect(step).toContain("task's completion notification");
    expect(step).toContain('no timeout, polling, or stall rule');
  });
});

describe('write-spec Finished selection', () => {
  it.each([
    ['Continue-loop Finished', { 'Next?': 'Finished — stop writing specs' }],
    ['initial-picker Finished', { 'Which issue?': 'Finished — stop without writing a spec' }],
    ['multi-question Finished', { 'Other?': 'Yes', 'Next?': 'Finished — stop writing specs' }],
    ['multi-select Finished', { 'Next?': '#445 — Next issue, Finished — stop writing specs' }],
  ])('detects %s', (_label, answers) => {
    expect(writeSpecFinishedSelection(answers)).toBe(true);
  });

  it.each([
    ['an issue row', { 'Next?': '#445 — Next issue' }],
    ['Continue', { 'Next?': 'Continue — enter another issue number' }],
    ['a near-miss label', { 'Next?': 'Finished - stop writing specs' }],
    ['typed text around the label', { 'Next?': 'I am Finished — stop writing specs now' }],
    ['no answers', {}],
    ['missing answers', undefined],
  ])('rejects %s', (_label, answers) => {
    expect(writeSpecFinishedSelection(answers)).toBe(false);
  });
});

describe('autopilot answers', () => {
  it('picks each question\'s Recommended option, else its first', () => {
    expect(recommendedAnswers([
      { question: 'Kind?', options: [{ label: 'Bug' }, { label: 'Feature (Recommended)' }] },
      { question: 'Milestone?', options: [{ label: 'v1' }, { label: 'v2' }] },
      { question: 'Empty?', options: [] },
      { options: [{ label: 'orphan' }] },
    ])).toEqual({ 'Kind?': 'Feature (Recommended)', 'Milestone?': 'v1' });
    expect(recommendedAnswers(undefined)).toEqual({});
    expect(recommendedAnswers(
      [{ question: 'Next?', options: [{ label: '#6 — Next (Recommended)' }, { label: 'Finished — stop writing specs' }] }],
      { prefer: ['Finished — stop writing specs'] },
    )).toEqual({ 'Next?': 'Finished — stop writing specs' });
  });
});

describe('plugin-root materialization', () => {
  const root = '/Volumes/Fast Brick/plugins/nmg-sdlc';

  it.each([
    ['a bare controller', 'node <plugin-root>/scripts/sdlc-status.mjs --json', `node "${root}/scripts/sdlc-status.mjs" --json`],
    ['a quoted controller', 'node "<plugin-root>/scripts/sdlc-status.mjs" --json', `node "${root}/scripts/sdlc-status.mjs" --json`],
    ['the env placeholder in quotes', 'node "${NMG_SDLC_PLUGIN_ROOT}/scripts/exercise-claude.mjs" --cwd .', `node "${root}/scripts/exercise-claude.mjs" --cwd .`],
    ['the bare env placeholder', 'ls $NMG_SDLC_PLUGIN_ROOT/workflows', `ls "${root}/workflows"`],
    ['a non-script path', 'cat <plugin-root>/references/claude-code-tooling.md', `cat "${root}/references/claude-code-tooling.md"`],
  ])('rewrites %s', (_label, command, expected) => {
    expect(materializePluginRootCommand(command, root)).toBe(expected);
  });

  it('leaves commands without a placeholder untouched', () => {
    for (const command of ['node scripts/check-gate.mjs', 'node "/opt/consumer/scripts/check-gate.mjs"', 'echo $HOME']) {
      expect(materializePluginRootCommand(command, root)).toBe(command);
    }
  });

  it('rewrites a leading placeholder in a file path only', () => {
    expect(materializePluginRootPath('<plugin-root>/references/a.md', root)).toBe(`${root}/references/a.md`);
    expect(materializePluginRootPath('/abs/<plugin-root>/a.md', root)).toBe('/abs/<plugin-root>/a.md');
    expect(materializePluginRootPath(undefined, root)).toBeUndefined();
  });
});
