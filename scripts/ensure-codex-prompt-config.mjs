#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const REQUIRED_ORDER = [
  'features.default_mode_request_user_input',
  'features.ask_user_questions',
  'suppress_unstable_features_warning',
];

const REQUIRED_FEATURE_KEYS = [
  'default_mode_request_user_input',
  'ask_user_questions',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTableName(line) {
  const arrayTable = line.match(/^\s*\[\[(.+)]]\s*(?:#.*)?$/);
  if (arrayTable) return arrayTable[1];

  const table = line.match(/^\s*\[(.+)]\s*(?:#.*)?$/);
  if (table) return table[1];

  return null;
}

function findFirstTableIndex(lines) {
  const index = lines.findIndex((line) => parseTableName(line) !== null);
  return index === -1 ? lines.length : index;
}

function findTableSpan(lines, tableName) {
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (parseTableName(lines[index]) === tableName) {
      start = index;
      break;
    }
  }

  if (start === -1) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (parseTableName(lines[index]) !== null) {
      end = index;
      break;
    }
  }

  return { start, end };
}

function keyMatch(line, key) {
  const expression = new RegExp(`^(\\s*)${escapeRegExp(key)}\\s*=\\s*([^#]*?)(\\s*(#.*)?)?$`);
  return line.match(expression);
}

function findKeyMatches(lines, start, end, key) {
  const matches = [];

  for (let index = start; index < end; index += 1) {
    const match = keyMatch(lines[index], key);
    if (match) {
      matches.push({ index, match });
    }
  }

  return matches;
}

function normalizeChangedKeys(keysChanged) {
  return REQUIRED_ORDER.filter((key) => keysChanged.has(key));
}

function markTrue(lines, start, end, key, keyName, keysChanged) {
  const matches = findKeyMatches(lines, start, end, key);
  if (matches.length > 1) {
    throw new Error(`Multiple ${keyName} entries found; refusing to edit ambiguous config`);
  }
  if (matches.length === 0) return false;

  const { index, match } = matches[0];
  const value = match[2].trim();
  if (value === 'true') return true;
  if (value !== 'false') {
    throw new Error(`${keyName} exists but is not a boolean; refusing to overwrite it`);
  }

  lines[index] = `${match[1]}${key} = true${match[3] || ''}`;
  keysChanged.add(keyName);
  return true;
}

function insertTopLevelKey(lines, key, keyName, keysChanged) {
  const firstTableIndex = findFirstTableIndex(lines);
  let insertAt = firstTableIndex;
  while (insertAt > 0 && lines[insertAt - 1].trim() === '') {
    insertAt -= 1;
  }
  const addition = [`${key} = true`];

  if (firstTableIndex < lines.length) {
    addition.push('');
  } else if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
    addition.unshift('');
  }

  lines.splice(insertAt, firstTableIndex - insertAt, ...addition);
  keysChanged.add(keyName);
}

function insertFeatureKeys(lines, keys, keysChanged) {
  const span = findTableSpan(lines, 'features');

  if (!span) {
    const addition = [];
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      addition.push('');
    }
    addition.push('[features]');
    for (const key of keys) {
      addition.push(`${key} = true`);
      keysChanged.add(`features.${key}`);
    }
    lines.push(...addition);
    return;
  }

  const addition = keys.map((key) => `${key} = true`);
  if (span.end < lines.length) {
    addition.push('');
  }
  lines.splice(span.end, 0, ...addition);
  for (const key of keys) {
    keysChanged.add(`features.${key}`);
  }
}

export function ensurePromptConfigText(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const normalized = source.replace(/\r\n/g, '\n');
  const hadFinalNewline = normalized.endsWith('\n');
  const lines = normalized === '' ? [] : normalized.split('\n');
  if (hadFinalNewline) lines.pop();

  const keysChanged = new Set();

  const topEnd = findFirstTableIndex(lines);
  const topKey = 'suppress_unstable_features_warning';
  const hasTopKey = markTrue(
    lines,
    0,
    topEnd,
    topKey,
    topKey,
    keysChanged,
  );
  if (!hasTopKey) {
    insertTopLevelKey(lines, topKey, topKey, keysChanged);
  }

  let featureSpan = findTableSpan(lines, 'features');
  const missingFeatureKeys = [];

  if (featureSpan) {
    for (const key of REQUIRED_FEATURE_KEYS) {
      const keyName = `features.${key}`;
      const present = markTrue(lines, featureSpan.start + 1, featureSpan.end, key, keyName, keysChanged);
      if (!present) {
        missingFeatureKeys.push(key);
      }
    }
  } else {
    missingFeatureKeys.push(...REQUIRED_FEATURE_KEYS);
  }

  if (missingFeatureKeys.length > 0) {
    insertFeatureKeys(lines, missingFeatureKeys, keysChanged);
  }

  const text = `${lines.join(newline)}${newline}`;
  return {
    text,
    changed: keysChanged.size > 0,
    keysChanged: normalizeChangedKeys(keysChanged),
  };
}

export function defaultConfigPath() {
  return path.join(os.homedir(), '.codex', 'config.toml');
}

export function ensurePromptConfigFile(configPath = defaultConfigPath()) {
  const resolvedPath = path.resolve(configPath);
  let source = '';

  try {
    source = fs.existsSync(resolvedPath) ? fs.readFileSync(resolvedPath, 'utf8') : '';
  } catch (error) {
    throw new Error(`Unable to read ${resolvedPath}: ${error.message}`);
  }

  const result = ensurePromptConfigText(source);

  if (result.changed) {
    try {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      fs.writeFileSync(resolvedPath, result.text, 'utf8');
    } catch (error) {
      throw new Error(`Unable to write ${resolvedPath}: ${error.message}`);
    }
  }

  return {
    path: resolvedPath,
    changed: result.changed,
    keysChanged: result.keysChanged,
  };
}

function parseCli() {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
    },
    strict: true,
  });

  return values.config;
}

function main() {
  try {
    const configPath = parseCli();
    const result = ensurePromptConfigFile(configPath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
