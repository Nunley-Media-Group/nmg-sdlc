import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  exerciseOmpArgs,
  parseExerciseArgs,
  usage as exerciseUsage,
} from '../exercise-omp.mjs';
import {
  interactiveHeadlessMessage,
  isInteractiveHeadless,
  parseInteractiveSlash,
  rewriteInteractiveInput,
  sessionModeFromEntries,
  withArguments,
} from '../../src/sdlc-commands.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function provenanceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-command-provenance-'));
}

describe('interactive input rewrite', () => {
  it('rewrites TUI /sdlc-write-spec to builtin /plan plus workflow', () => {
    const result = rewriteInteractiveInput('/sdlc-write-spec #42', {
      source: 'interactive',
      headless: false,
      sessionMode: 'none',
      root: repoRoot,
      provenanceRoot: provenanceRoot(),
    });
    expect(result.text.startsWith('/plan\n\n')).toBe(true);
    expect(result.text).toContain('# Write Spec');
    expect(result.text).toContain('$ARGUMENTS: #42');
    expect(result.text).not.toContain('/skill:');
    expect(result.text).toContain('publish-approved-spec.mjs');
    expect(result.text).not.toContain('node <plugin-root>/scripts/');
    expect(result.text).not.toContain('node scripts/');
  });

  it('does not prefix /plan when the session is already in plan mode', () => {
    const result = rewriteInteractiveInput('/sdlc-draft-issue auth', {
      source: 'interactive',
      headless: false,
      sessionMode: 'plan',
      root: repoRoot,
      provenanceRoot: provenanceRoot(),
    });
    expect(result.text.startsWith('/plan')).toBe(false);
    expect(result.text).toContain('$ARGUMENTS: auth');
  });

  it('ignores headless, print/RPC, and automated input', () => {
    expect(rewriteInteractiveInput('/sdlc-write-spec #1', {
      source: 'interactive',
      headless: true,
    })).toBeUndefined();
    expect(rewriteInteractiveInput('/sdlc-write-spec #1', { source: 'rpc' })).toBeUndefined();
    expect(rewriteInteractiveInput('/sdlc-status --json', {
      source: 'interactive',
      headless: false,
    })).toBeUndefined();
    expect(parseInteractiveSlash('/sdlc-execute #9')).toBeNull();
  });

  it('reads the last mode_change entry', () => {
    expect(sessionModeFromEntries([
      { type: 'mode_change', mode: 'plan' },
      { type: 'message' },
      { type: 'mode_change', mode: 'none' },
    ])).toBe('none');
    expect(sessionModeFromEntries([{ type: 'mode_change', mode: 'plan' }])).toBe('plan');
  });

  it('keeps withArguments contract', () => {
    expect(withArguments('BODY', '  #7  ')).toBe('BODY\n\n$ARGUMENTS: #7');
    expect(withArguments('BODY', '   ')).toBe('BODY');
  });

  it('treats missing UI and print/RPC modes as headless', () => {
    expect(isInteractiveHeadless(undefined, ['omp'])).toBe(true);
    expect(isInteractiveHeadless({}, ['omp'])).toBe(true);
    expect(isInteractiveHeadless({ hasUI: false }, ['omp'])).toBe(true);
    expect(isInteractiveHeadless({ hasUI: true }, ['omp'])).toBe(false);
    expect(isInteractiveHeadless({ hasUI: true }, ['omp', '--print'])).toBe(true);
    expect(isInteractiveHeadless({ hasUI: true }, ['omp', '--mode', 'rpc'])).toBe(true);
    expect(interactiveHeadlessMessage('sdlc-write-spec')).toBe(
      'Run /sdlc-write-spec in the TUI.\n',
    );
  });
});

describe('exercise-omp args', () => {
  it('parses cwd and command after --', () => {
    expect(parseExerciseArgs(['--cwd', '/tmp/proj', '--', '/sdlc-status', '--json'])).toEqual({
      cwd: '/tmp/proj',
      timeoutMs: 180_000,
      message: '/sdlc-status --json',
    });
  });

  it('loads the source extension explicitly when extension discovery is disabled', () => {
    expect(exerciseOmpArgs({ cwd: '/tmp/proj', timeoutMs: 300_000 })).toEqual([
      '--mode', 'rpc',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--extension', path.join(repoRoot, 'src/extension.ts'),
      '--plugin-dir', repoRoot,
      '--add-dir', repoRoot,
      '--cwd', path.resolve('/tmp/proj'),
      '--auto-approve',
      '--max-time', '300',
    ]);
  });

  it('prints usage', () => {
    expect(exerciseUsage()).toContain('exercise-omp.mjs');
    expect(exerciseUsage()).toContain('/sdlc-');
  });
});
