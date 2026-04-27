import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('prompt config contract', () => {
  it('documents automatic config management and restart behavior in README', () => {
    const source = read('README.md');

    expect(source).toContain('automatically checks `~/.codex/config.toml`');
    expect(source).toContain('default_mode_request_user_input = true');
    expect(source).toContain('ask_user_questions = true');
    expect(source).toContain('suppress_unstable_features_warning = true');
    expect(source).toContain('close and reopen Codex');
    expect(source).toContain('separate from `.codex/unattended-mode`');
  });

  it('names every required prompt setting in the shared reference', () => {
    const source = read('references/prompt-config.md');

    expect(source).toContain('default_mode_request_user_input = true');
    expect(source).toContain('ask_user_questions = true');
    expect(source).toContain('suppress_unstable_features_warning = true');
    expect(source).toContain('top-level key');
    expect(source).toContain('under `[features]`');
  });

  it('makes changed-config behavior a hard stop before prompting', () => {
    const source = read('references/prompt-config.md');

    expect(source).toContain('stop before the original gate');
    expect(source).toContain('Do not present the original `request_user_input` gate');
    expect(source).toContain('close and reopen Codex');
  });

  it('keeps unattended mode as a separate bypass contract', () => {
    const promptConfig = read('references/prompt-config.md');
    const interactiveGates = read('references/interactive-gates.md');

    expect(promptConfig).toContain('`.codex/unattended-mode` remains separate');
    expect(promptConfig).toContain('unattended branches do not need prompt-config setup');
    expect(interactiveGates).toContain('Do not repair `~/.codex/config.toml` solely to skip a gate in an unattended run');
  });
});
