import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensurePromptConfigFile,
  ensurePromptConfigText,
} from '../ensure-codex-prompt-config.mjs';

function tempConfigPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-prompt-config-')), 'config.toml');
}

describe('Codex prompt config updater', () => {
  it('creates a missing config file with required settings', () => {
    const configPath = tempConfigPath();

    const result = ensurePromptConfigFile(configPath);

    expect(result).toEqual({
      path: configPath,
      changed: true,
      keysChanged: [
        'features.default_mode_request_user_input',
        'features.ask_user_questions',
        'suppress_unstable_features_warning',
      ],
    });
    expect(fs.readFileSync(configPath, 'utf8')).toBe([
      'suppress_unstable_features_warning = true',
      '',
      '[features]',
      'default_mode_request_user_input = true',
      'ask_user_questions = true',
      '',
    ].join('\n'));
  });

  it('inserts required settings without disturbing unrelated tables', () => {
    const source = [
      '# user config',
      'model = "gpt-5.5"',
      '',
      '[projects."/tmp/demo"]',
      'trust_level = "trusted"',
      '',
    ].join('\n');

    const result = ensurePromptConfigText(source);

    expect(result.changed).toBe(true);
    expect(result.text).toContain('# user config\nmodel = "gpt-5.5"\nsuppress_unstable_features_warning = true\n\n[projects."/tmp/demo"]');
    expect(result.text).toContain('\n[features]\ndefault_mode_request_user_input = true\nask_user_questions = true\n');
    expect(result.text).toContain('trust_level = "trusted"');
  });

  it('updates false values to true and preserves trailing comments', () => {
    const source = [
      'suppress_unstable_features_warning = false # keep quiet',
      '',
      '[features]',
      'default_mode_request_user_input = false # prompt mode',
      'ask_user_questions = false',
      '',
    ].join('\n');

    const result = ensurePromptConfigText(source);

    expect(result.changed).toBe(true);
    expect(result.keysChanged).toEqual([
      'features.default_mode_request_user_input',
      'features.ask_user_questions',
      'suppress_unstable_features_warning',
    ]);
    expect(result.text).toContain('suppress_unstable_features_warning = true # keep quiet');
    expect(result.text).toContain('default_mode_request_user_input = true # prompt mode');
    expect(result.text).toContain('ask_user_questions = true');
  });

  it('leaves an already-correct config byte-stable', () => {
    const source = [
      '# comment',
      'suppress_unstable_features_warning = true',
      '',
      '[features]',
      'default_mode_request_user_input = true',
      'ask_user_questions = true',
      '',
      '[[plugins]]',
      'name = "nmg-sdlc"',
      '',
    ].join('\n');

    const result = ensurePromptConfigText(source);

    expect(result.changed).toBe(false);
    expect(result.keysChanged).toEqual([]);
    expect(result.text).toBe(source);
  });

  it('preserves comments, marketplace entries, plugin settings, and project settings', () => {
    const source = [
      '# keep this comment',
      'model = "gpt-5.5"',
      '',
      '[features]',
      'default_mode_request_user_input = true',
      '',
      '[[plugin_marketplaces]]',
      'name = "Nunley-Media-Group/nmg-plugins"',
      '',
      '[plugins.nmg-sdlc]',
      'enabled = true',
      '',
      '[projects."/Volumes/Fast Brick/source/repos/nmg-sdlc"]',
      'trust_level = "trusted"',
      '',
    ].join('\n');

    const result = ensurePromptConfigText(source);

    expect(result.changed).toBe(true);
    expect(result.text).toContain('# keep this comment');
    expect(result.text).toContain('model = "gpt-5.5"');
    expect(result.text).toContain('[[plugin_marketplaces]]\nname = "Nunley-Media-Group/nmg-plugins"');
    expect(result.text).toContain('[plugins.nmg-sdlc]\nenabled = true');
    expect(result.text).toContain('[projects."/Volumes/Fast Brick/source/repos/nmg-sdlc"]\ntrust_level = "trusted"');
    expect(result.text).toContain('suppress_unstable_features_warning = true');
    expect(result.text).toContain('ask_user_questions = true');
  });

  it('fails closed on ambiguous duplicate required keys', () => {
    const source = [
      'suppress_unstable_features_warning = true',
      'suppress_unstable_features_warning = false',
      '',
    ].join('\n');

    expect(() => ensurePromptConfigText(source)).toThrow('Multiple suppress_unstable_features_warning entries');
  });
});
