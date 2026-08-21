import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUTOMATED_COMMANDS, INTERACTIVE_COMMANDS } from '../src/sdlc-commands.mjs';

const REQUIRED_ARTIFACTS = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];

export const CURRENT_SPEC_DIRECTORIES = [
  '1-run-retro-skill',
  '2-plugin-scaffold-and-marketplace-infrastructure',
  '4-draft-issue-skill',
  '5-write-spec-skill',
  '6-write-code-skill',
  '7-verify-code-skill',
  '8-open-pr-skill',
  '10-start-issue-skill',
  '21-migration-and-upgrade-skill',
  '66-onboard-project-skill',
  '86-add-address-pr-comments-skill-to-close-the-pr-review-loop',
  '106-simplify-skill',
  '125-add-github-actions-contribution-gates-to-project-setup',
  '145-add-lifecycle-status-command-for-active-sdlc-work',
  '151-remove-the-automated-sdlc-loop-and-unattended-mode',
  '193-reduce-injected-sdlc-workflow-tokens-while-keeping-file-command-surfaces',
].sort();

const WORKFLOW_CAPABILITY = new Map([
  ['address-pr-comments', 'address-pr-comments'],
  ['draft-issue', 'draft-issue'],
  ['execute', 'execute'],
  ['onboard-project', 'onboard-project'],
  ['open-pr', 'open-pr'],
  ['run-retro', 'run-retro'],
  ['simplify', 'simplify'],
  ['start-issue', 'start-issue'],
  ['status', 'status'],
  ['upgrade-project', 'project-upgrade'],
  ['verify-code', 'verify-code'],
  ['write-code', 'write-code'],
  ['write-spec', 'write-spec'],
]);

const CAPABILITY_SPEC = new Map([
  ['address-pr-comments', 86],
  ['draft-issue', 4],
  ['onboard-project', 66],
  ['open-pr', 8],
  ['run-retro', 1],
  ['simplify', 106],
  ['start-issue', 10],
  ['status', 145],
  ['project-upgrade', 21],
  ['verify-code', 7],
  ['write-code', 6],
  ['write-spec', 5],
  ['omp-extension', 2],
  ['contribution-gate', 125],
]);

const COMMAND_CAPABILITY = new Map([
  ['sdlc-draft-issue', 'draft-issue'],
  ['sdlc-write-spec', 'write-spec'],
  ['sdlc-onboard-project', 'onboard-project'],
  ['sdlc-upgrade-project', 'project-upgrade'],
  ['sdlc-run-retro', 'run-retro'],
  ['sdlc-execute', 'execute'],
  ['sdlc-status', 'status'],
  ['sdlc-verify-code', 'verify-code'],
  ['sdlc-open-pr', 'open-pr'],
]);

const DEPRECATED_WORKFLOW_STUBS = new Map([
  ['migrate-project', 'Run /sdlc-upgrade-project'],
]);

const STALE_PATTERNS = [
  [/\$nmg-sdlc\b/g, 'legacy $nmg-sdlc invocation'],
  [/\.codex\//g, 'legacy .codex path'],
  [/\bCodex\b/g, 'Codex-only runtime'],
  [/\bClaude Code\b/g, 'Claude Code-only runtime'],
  [/\bunattended mode\b/gi, 'removed unattended mode'],
];

function listDirectories(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function issueFromDirectory(directory) {
  const match = directory.match(/^(\d+)-/);
  return match ? Number(match[1]) : null;
}

export function verifyCurrentSpecs(projectRoot) {
  const errors = [];
  const specsRoot = path.join(projectRoot, 'specs');
  const actualDirectories = listDirectories(specsRoot);
  const missingDirectories = CURRENT_SPEC_DIRECTORIES.filter((directory) => !actualDirectories.includes(directory));
  const staleDirectories = actualDirectories.filter((directory) => !CURRENT_SPEC_DIRECTORIES.includes(directory));
  if (missingDirectories.length) errors.push(`Missing current spec directories: ${missingDirectories.join(', ')}`);
  if (staleDirectories.length) errors.push(`Obsolete or mismatched spec directories remain: ${staleDirectories.join(', ')}`);

  for (const directory of actualDirectories) {
    const issue = issueFromDirectory(directory);
    if (issue === null) {
      errors.push(`Spec directory lacks leading issue number: ${directory}`);
      continue;
    }
    const directoryPath = path.join(specsRoot, directory);
    for (const artifact of REQUIRED_ARTIFACTS) {
      const artifactPath = path.join(directoryPath, artifact);
      if (!fs.existsSync(artifactPath)) {
        errors.push(`Missing ${directory}/${artifact}`);
        continue;
      }
      const text = fs.readFileSync(artifactPath, 'utf8');
      const identity = artifact === 'feature.gherkin' ? `# Issue: #${issue}` : `**Issue**: #${issue}`;
      if (!text.includes(identity)) errors.push(`${directory}/${artifact} lacks singular ${identity}`);
      if (artifact === 'requirements.md' && !text.includes('**Status**: Approved')) {
        errors.push(`${directory}/requirements.md is not Approved`);
      }
      for (const [pattern, label] of STALE_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(text) && !(issue === 151 && label === 'removed unattended mode')) {
          errors.push(`${directory}/${artifact} contains ${label}`);
        }
      }
    }
  }

  const contractPath = path.join(projectRoot, 'references', 'rewrite-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const packageVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version;
  const version = fs.readFileSync(path.join(projectRoot, 'VERSION'), 'utf8').trim();
  if (contract.release !== packageVersion || contract.release !== version) {
    errors.push(`Rewrite contract release ${contract.release} does not match package ${packageVersion} and VERSION ${version}`);
  }
  if (contract.exception !== 'repository-rewrite') errors.push('Rewrite contract lacks repository-rewrite identity');

  const contractGuide = fs.readFileSync(path.join(projectRoot, 'references', 'rewrite-contract.md'), 'utf8');
  const rewriteVerification = fs.readFileSync(path.join(projectRoot, 'references', 'rewrite-verification.md'), 'utf8');
  for (const evidence of [
    '`cd scripts && npm test` — passed',
    '`node scripts/verify-plugin-surface.mjs --root . --label repository` — passed',
    '`node scripts/verify-current-specs.mjs` — passed',
    '`node scripts/skill-inventory-audit.mjs --check` — passed',
  ]) {
    if (!rewriteVerification.includes(evidence)) errors.push(`Rewrite verification lacks outcome: ${evidence}`);
  }
  if (!contractGuide.includes('not an executable issue spec')) {
    errors.push('Human rewrite contract does not distinguish rewrite-only behavior from issue specs');
  }

  const capabilities = new Map((contract.capabilities || []).map((capability) => [capability.id, capability]));
  if (capabilities.size !== 15) errors.push(`Rewrite contract must contain 15 capabilities; found ${capabilities.size}`);
  for (const [id, capability] of capabilities) {
    if (!capability.purpose || !Array.isArray(capability.acceptance) || capability.acceptance.length < 3) {
      errors.push(`Rewrite capability ${id} lacks purpose or acceptance coverage`);
    }
    for (const source of capability.sources || []) {
      const normalized = source.replace(/\/$/, '');
      if (!fs.existsSync(path.join(projectRoot, normalized))) errors.push(`Rewrite capability ${id} references missing source ${source}`);
    }
  }

  const workflows = listDirectories(path.join(projectRoot, 'workflows'));
  for (const workflow of workflows) {
    const deprecatedMessage = DEPRECATED_WORKFLOW_STUBS.get(workflow);
    if (deprecatedMessage) {
      const workflowText = fs.readFileSync(path.join(projectRoot, 'workflows', workflow, 'WORKFLOW.md'), 'utf8');
      if (!workflowText.includes(deprecatedMessage)) errors.push(`Deprecated workflow ${workflow} lacks its exact redirect contract`);
      continue;
    }
    const capability = WORKFLOW_CAPABILITY.get(workflow);
    if (!capability) {
      errors.push(`Active workflow lacks a rewrite capability mapping: ${workflow}`);
      continue;
    }
    if (!capabilities.has(capability)) errors.push(`Active workflow ${workflow} maps to missing rewrite capability ${capability}`);
  }
  for (const workflow of WORKFLOW_CAPABILITY.keys()) {
    if (!workflows.includes(workflow)) errors.push(`Rewrite contract maps missing active workflow: ${workflow}`);
  }

  for (const [capability, issue] of CAPABILITY_SPEC) {
    if (!capabilities.has(capability)) errors.push(`Issue spec #${issue} maps to missing rewrite capability ${capability}`);
    if (!actualDirectories.some((directory) => directory.startsWith(`${issue}-`))) {
      errors.push(`Rewrite capability ${capability} maps to missing genuine issue spec #${issue}`);
    }
  }

  const publicCommands = [...INTERACTIVE_COMMANDS, ...AUTOMATED_COMMANDS].map(([name]) => name).sort();
  const mappedCommands = [...COMMAND_CAPABILITY.keys()].sort();
  if (JSON.stringify(publicCommands) !== JSON.stringify(mappedCommands)) {
    errors.push('Public /sdlc-* command surface does not match rewrite contract command mappings');
  }
  for (const [command, capability] of COMMAND_CAPABILITY) {
    if (!capabilities.has(capability)) errors.push(`Public command /${command} maps to missing rewrite capability ${capability}`);
  }

  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const projectRoot = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const errors = verifyCurrentSpecs(projectRoot);
  if (errors.length) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Current spec verification passed: ${CURRENT_SPEC_DIRECTORIES.length} genuine issue specs, 15 rewrite capabilities, ${WORKFLOW_CAPABILITY.size} active workflow mappings, ${DEPRECATED_WORKFLOW_STUBS.size} deprecated stub.`);
  }
}
