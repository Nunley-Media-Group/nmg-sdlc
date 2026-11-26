import { describe, expect, it } from '@jest/globals';

import {
  materializePluginRootCommand,
  materializePluginRootToolInput,
} from '../../src/host-events.mjs';

const root = '/Fast Brick/p';

describe('@SCN001 an escaped variable inside double quotes is left unchanged', () => {
  it.each([
    ['echo "\\$NMG_SDLC_PLUGIN_ROOT/x"'],
    ['echo "\\${NMG_SDLC_PLUGIN_ROOT}/x"'],
  ])('returns %s unchanged', (command) => {
    expect(materializePluginRootCommand(command, root)).toBe(command);
  });

  it('keeps an escaped backslash and still rewrites the variable after it', () => {
    expect(materializePluginRootCommand('echo "\\\\$NMG_SDLC_PLUGIN_ROOT/x"', root)).toBe('echo "\\\\/Fast Brick/p/x"');
  });
});

describe('@SCN002 inner double quotes inside a substitution stay one word', () => {
  it.each([
    ['echo "$(cat "<plugin-root>/x")"', 'echo "$(cat "/Fast Brick/p/x")"'],
    ['echo "$(echo "$(cat <plugin-root>/x)")"', 'echo "$(echo "$(cat "/Fast Brick/p/x")")"'],
  ])('rewrites %s inside the substitution', (command, expected) => {
    expect(materializePluginRootCommand(command, root)).toBe(expected);
  });
});

describe('@SCN003 inner single quotes inside a substitution keep balanced quoting', () => {
  it('escapes each single quote of the root inside the inner single quotes', () => {
    expect(materializePluginRootCommand("echo \"$(cat '<plugin-root>/x')\"", "/u/o'n/p")).toBe("echo \"$(cat '/u/o'\\''n/p/x')\"");
  });
});

describe('@SCN004 unquoted operands inside a substitution follow the unquoted rules', () => {
  it.each([
    ['echo "$(cat <plugin-root>/x)"', 'echo "$(cat "/Fast Brick/p/x")"'],
    ['echo "$(ls <plugin-root>/a/*.md)"', 'echo "$(ls "/Fast Brick/p"/a/*.md)"'],
    ['echo "$(cat <plugin-root>/x) <plugin-root>/y"', 'echo "$(cat "/Fast Brick/p/x") /Fast Brick/p/y"'],
    ['echo "$( (cat <plugin-root>/x) )"', 'echo "$( (cat "/Fast Brick/p/x") )"'],
  ])('rewrites %s by the unquoted rules', (command, expected) => {
    expect(materializePluginRootCommand(command, root)).toBe(expected);
  });
});

describe('@SCN005 existing rewrites are preserved', () => {
  it.each([
    ["ls '<plugin-root>/a'", "ls '/Fast Brick/p/a'"],
    ['ls <plugin-root>/a/*.md', 'ls "/Fast Brick/p"/a/*.md'],
    ['node "<plugin-root>/scripts/a.mjs" x', 'node "/Fast Brick/p/scripts/a.mjs" x'],
    ['node <plugin-root>/scripts/a.mjs x', 'node "/Fast Brick/p/scripts/a.mjs" x'],
    ['cat "${NMG_SDLC_PLUGIN_ROOT}/x"', 'cat "/Fast Brick/p/x"'],
    ['echo \\"<plugin-root>/x\\"', 'echo \\""/Fast Brick/p/x"\\"'],
    ['echo "a \\" <plugin-root>/x"', 'echo "a \\" /Fast Brick/p/x"'],
    ['echo "<plugin-root>/x', 'echo ""/Fast Brick/p/x"'],
    ['echo "$(cat <plugin-root>/x"', 'echo "$(cat /Fast Brick/p/x"'],
  ])('rewrites the command %s as before', (command, expected) => {
    expect(materializePluginRootCommand(command, root)).toBe(expected);
  });

  it.each([
    ['Glob', { tool: 'Glob', path: '<plugin-root>/a', pattern: '**/*.md' }],
    ['Grep', { tool: 'Grep', path: '<plugin-root>/a', pattern: 'x' }],
  ])('gives a %s call the installed plugin path', (_tool, input) => {
    expect(materializePluginRootToolInput(input, root)).toEqual({ ...input, path: '/Fast Brick/p/a' });
  });
});
