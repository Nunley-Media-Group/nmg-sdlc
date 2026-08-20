import { describe, expect, it } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
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

describe('interactive input rewrite', () => {
  it('rewrites TUI /sdlc-write-spec to builtin /plan plus workflow', () => {
    const result = rewriteInteractiveInput('/sdlc-write-spec #42', {
      source: 'interactive',
      sessionMode: 'none',
      root: repoRoot,
    });
    expect(result.text.startsWith('/plan\n\n')).toBe(true);
    expect(result.text).toContain('# Write Spec');
    expect(result.text).toContain('$ARGUMENTS: #42');
    expect(result.text).not.toContain('/skill:');
  });

  it('does not prefix /plan when the session is already in plan mode', () => {
    const result = rewriteInteractiveInput('/sdlc-draft-issue auth', {
      source: 'interactive',
      sessionMode: 'plan',
      root: repoRoot,
    });
    expect(result.text.startsWith('/plan')).toBe(false);
    expect(result.text).toContain('$ARGUMENTS: auth');
  });

  it('ignores print/RPC input and automated commands', () => {
    expect(rewriteInteractiveInput('/sdlc-write-spec #1', { source: 'rpc' })).toBeUndefined();
    expect(rewriteInteractiveInput('/sdlc-status --json', { source: 'interactive' })).toBeUndefined();
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

  it('treats missing UI as headless and names the TUI command', () => {
    expect(isInteractiveHeadless(undefined)).toBe(true);
    expect(isInteractiveHeadless({})).toBe(true);
    expect(isInteractiveHeadless({ hasUI: false })).toBe(true);
    expect(isInteractiveHeadless({ hasUI: true })).toBe(false);
    expect(interactiveHeadlessMessage('sdlc-write-spec')).toBe(
      'Run /sdlc-write-spec in the TUI. Interactive commands enter native /plan there.\n',
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

  it('prints usage', () => {
    expect(exerciseUsage()).toContain('exercise-omp.mjs');
    expect(exerciseUsage()).toContain('/sdlc-');
  });
});
