import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  materializeRenderedPluginRoot,
  renderInteractiveWorkflow,
} from '../../src/sdlc-commands.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const pluginRoot = '/Volumes/Fast Brick/plugins/nmg-sdlc';

function provenanceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nmg-rendered-root-'));
}

describe('@SCN001 interactive prompts carry the absolute plugin root', () => {
  it.each([
    ['sdlc-draft-issue', 'draft-issue'],
    ['sdlc-write-spec', 'write-spec'],
    ['sdlc-onboard-project', 'onboard-project'],
    ['sdlc-upgrade-project', 'upgrade-project'],
    ['sdlc-steering', 'steering'],
    ['sdlc-run-retro', 'run-retro'],
    ['sdlc-execute', 'execute'],
  ])('renders %s with the absolute root and the %s workflow under it', (command, workflow) => {
    const text = renderInteractiveWorkflow(command, repoRoot, provenanceRoot());
    expect(text).not.toContain('<plugin-root>');
    expect(text).toContain(`\`${repoRoot}\` is the installed nmg-sdlc plugin root`);
    expect(text).toContain(`resolve under \`${repoRoot}/workflows/${workflow}/\``);
    expect(text).toContain(`resolves under \`${repoRoot}/references/\``);
  });
});

describe('@SCN002 shell operands stay one word under a root with spaces', () => {
  it.each([
    [
      'fenced single path',
      '```\ncat <plugin-root>/references/a.md\n```',
      '```\ncat "/Volumes/Fast Brick/plugins/nmg-sdlc/references/a.md"\n```',
    ],
    [
      'fenced glob',
      '```\nls <plugin-root>/workflows/draft-issue/references/*.md\n```',
      '```\nls "/Volumes/Fast Brick/plugins/nmg-sdlc"/workflows/draft-issue/references/*.md\n```',
    ],
    [
      'inline command',
      '`ls <plugin-root>/workflows/*.md`',
      '`ls "/Volumes/Fast Brick/plugins/nmg-sdlc"/workflows/*.md`',
    ],
    [
      'prose path',
      'under <plugin-root>/references/',
      'under /Volumes/Fast Brick/plugins/nmg-sdlc/references/',
    ],
  ])('substitutes the %s placeholder as a shell-safe path', (_label, text, substituted) => {
    expect(materializeRenderedPluginRoot(text, pluginRoot)).toBe(substituted);
  });
});

describe('@SCN003 controller paths render as before', () => {
  it('keeps the absolute controller command for sdlc-steering', () => {
    const text = renderInteractiveWorkflow('sdlc-steering', repoRoot, provenanceRoot());
    expect(text).toContain(`node "${path.join(repoRoot, 'scripts', 'sdlc-steering.mjs')}" inspect --project .`);
  });

  it('returns an already-absolute controller with no placeholder unchanged', () => {
    const command = 'node "/opt/x/scripts/sdlc-status.mjs" --json';
    expect(materializeRenderedPluginRoot(command, pluginRoot)).toBe(command);
  });
});

describe('@SCN004 the plugin-path note describes current hook behavior', () => {
  it('names Glob and Grep path rewriting and drops the stale Bash-and-Read wording', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'sdlc-prompt-snippets.mjs'), 'utf8');
    const doc = /\/\*\*(?:(?!\*\/)[\s\S])*?\*\/\s*export function pluginPathsNote/.exec(source)?.[0] ?? '';
    expect(doc).toContain('Glob');
    expect(doc).toContain('Grep');
    expect(source).not.toContain('(Bash commands and Read paths)');
  });
});
