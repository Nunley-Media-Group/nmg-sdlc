#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'dist',
  'build',
]);

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.txt',
  '.gherkin',
  '.gitignore',
]);

const banned = [
  { name: 'legacy provider name', pattern: new RegExp(`${'clau'}${'de'}`, 'i') },
  { name: 'legacy provider domain/package', pattern: new RegExp(`${'anth'}${'ropic'}`, 'i') },
  { name: 'legacy runtime path', pattern: /\.claude(?:\/|-plugin|\b)/ },
  { name: 'legacy root instructions file', pattern: /CLAUDE\.md/ },
  { name: 'legacy interactive tool', pattern: /AskUserQuestion/ },
  { name: 'legacy web tools', pattern: /WebFetch|WebSearch/ },
  { name: 'legacy skill frontmatter fields', pattern: /allowed-tools|disable-model-invocation|argument-hint|subagent_type/ },
  { name: 'legacy CLI invocation', pattern: /claude -p|claude --plugin-dir/ },
  { name: 'unsupported codex exec flag', pattern: /--ask-for-approval|--disallowedTools|--append-system-prompt|--plugin-dir|--project-dir|--output-format/ },
  { name: 'legacy environment variable', pattern: /CODEX_HOME|CLAUDE_CODE_EFFORT_LEVEL/ },
  { name: 'legacy model family', pattern: /\b(opus|sonnet|haiku)\b/i },
];

function isTextFile(relPath) {
  const base = path.basename(relPath);
  if (TEXT_EXTENSIONS.has(base)) return true;
  return TEXT_EXTENSIONS.has(path.extname(relPath));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (/^\.claude(?:$|-plugin$)/.test(entry.name)) {
        out.push({ path: rel, directoryViolation: true });
        continue;
      }
      walk(abs, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (rel === 'scripts/codex-compatibility-check.mjs') continue;
    if (!isTextFile(rel)) continue;
    out.push({ path: rel, abs });
  }
  return out;
}

const violations = [];

for (const file of walk(REPO_ROOT)) {
  if (file.directoryViolation) {
    violations.push(`${file.path}: legacy directory must not exist`);
    continue;
  }

  const source = fs.readFileSync(file.abs, 'utf8');
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const rule of banned) {
      if (rule.pattern.test(lines[i])) {
        violations.push(`${file.path}:${i + 1}: ${rule.name}: ${lines[i].trim()}`);
      }
      rule.pattern.lastIndex = 0;
    }
  }
}

if (violations.length > 0) {
  console.error('Codex compatibility check failed:');
  for (const line of violations.slice(0, 200)) console.error(`- ${line}`);
  if (violations.length > 200) console.error(`... ${violations.length - 200} more`);
  process.exit(1);
}

console.log('Codex compatibility check passed.');
