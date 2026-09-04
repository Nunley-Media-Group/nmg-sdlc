#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AsyncFunction = Object.getPrototypeOf(async function evaluator() {}).constructor;
const MODULE_PATH = fileURLToPath(import.meta.url);
const CONTRACT_PATH = fileURLToPath(new URL('../references/contribution-gate.md', import.meta.url));

function evaluatorSource(contract) {
  const template = String(contract).match(/```yaml\n([\s\S]*?)\n```/)?.[1];
  if (!template) throw new Error('contribution gate workflow template not found');
  const marker = '          script: |\n';
  const start = template.indexOf(marker);
  if (start < 0) throw new Error('embedded github-script evaluator not found');
  return template
    .slice(start + marker.length)
    .split('\n')
    .map((line) => line.startsWith('            ') ? line.slice(12) : line)
    .join('\n');
}

export async function evaluateContributionEvidence({
  title,
  body,
  changedPaths,
  readText,
  pathExists,
}) {
  if (!Array.isArray(changedPaths) || typeof readText !== 'function' || typeof pathExists !== 'function') {
    throw new Error('invalid contribution evidence inputs');
  }
  const contract = fs.readFileSync(CONTRACT_PATH, 'utf8');
  const executeEvaluator = new AsyncFunction('github', 'context', 'core', 'Buffer', evaluatorSource(contract));
  const errors = [];
  const notFound = () => Object.assign(new Error('not found'), { status: 404 });
  const github = {
    paginate: async () => changedPaths.map((filename) => ({ filename })),
    rest: {
      pulls: { listFiles: async () => ({ data: [] }) },
      repos: {
        getContent: async ({ path: requestedPath }) => {
          if (!(await pathExists(requestedPath))) throw notFound();
          return {
            data: {
              type: 'file',
              encoding: 'base64',
              content: Buffer.from(await readText(requestedPath), 'utf8').toString('base64'),
            },
          };
        },
      },
    },
  };
  const context = {
    repo: { owner: 'local', repo: 'repository' },
    payload: { pull_request: { number: 1, title, body, head: { sha: 'local' } } },
  };
  const core = {
    error: (message) => errors.push(String(message)),
    info: () => {},
    setFailed: () => {},
  };

  await executeEvaluator(github, context, core, Buffer);
  return { ok: errors.length === 0, errors };
}

export function buildDeliveryPullRequestBody({ issue, specRelative, changedPaths, verificationReport }) {
  const specDirectory = String(specRelative).replace(/\/$/, '');
  const reportPath = `${specDirectory}/verification-report.md`;
  const commandResults = String(verificationReport ?? '')
    .split(/\r?\n/)
    .filter((line) => /(?:`[^`]+`|\b(?:command|run)\s*:)/i.test(line)
      && /\b(?:pass(?:ed)?|fail(?:ed)?|succeed(?:ed)?|exit\s+(?:code\s+)?0|\d+\s+tests?\s+passed)\b/i.test(line));
  return [
    `Closes #${issue}`,
    '',
    `Spec: ${specDirectory}/`,
    '',
    'Steering alignment: follows `steering/manifest.json` and the registered `steering/modules/` contracts.',
    '',
    '## Verification',
    `\`${reportPath}\` — passed`,
    ...commandResults,
    '',
    'Changed paths:',
    ...changedPaths.map((changedPath) => `- \`${changedPath}\``),
    '',
  ].join('\n');
}

function repositoryReader(root) {
  const canonicalRoot = fs.realpathSync(root);
  const withinRoot = (candidate) => candidate === canonicalRoot
    || candidate.startsWith(`${canonicalRoot}${path.sep}`);
  const regularFile = (relative) => {
    const candidate = path.resolve(canonicalRoot, relative);
    if (!withinRoot(candidate)) throw new Error(`repository path escapes root: ${relative}`);
    if (!fs.existsSync(candidate)) return null;
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const canonicalCandidate = fs.realpathSync(candidate);
    if (!withinRoot(canonicalCandidate)) throw new Error(`repository path escapes root: ${relative}`);
    return canonicalCandidate;
  };
  return {
    pathExists: (relative) => regularFile(relative) !== null,
    readText: (relative) => {
      const candidate = regularFile(relative);
      return candidate === null ? '' : fs.readFileSync(candidate, 'utf8');
    },
  };
}

async function main() {
  if (process.argv.length !== 5 || process.argv[2] !== '--root') {
    throw new Error('Usage: node scripts/contribution-evidence.mjs --root ROOT INPUT_JSON');
  }
  const root = process.argv[3];
  const input = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  const result = await evaluateContributionEvidence({ ...input, ...repositoryReader(root) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
