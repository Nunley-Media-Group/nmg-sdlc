#!/usr/bin/env node

/**
 * Deterministic SDLC Orchestrator
 *
 * Replaces the prompt-engineered heartbeat loop with a Node.js script that
 * deterministically orchestrates `codex exec` subprocess invocations for each
 * SDLC step. All SDLC work still executes inside Codex sessions.
 *
 * Usage:
 *   node sdlc-runner.mjs --config <path-to-sdlc-config.json>
 *   node sdlc-runner.mjs --config <path> --dry-run
 *   node sdlc-runner.mjs --config <path> --step 4
 *   node sdlc-runner.mjs --config <path> --resume
 */

import { spawn, execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const IS_WINDOWS = process.platform === 'win32';
const VALID_EFFORTS = ['low', 'medium', 'high', 'xhigh'];
const INHERITED_CODEX_SANDBOX_ENV = [
  'CODEX_SANDBOX',
  'CODEX_SANDBOX_NETWORK_DISABLED',
  'CODEX_SANDBOX_SEATBELT_PROFILE',
];

// ---------------------------------------------------------------------------
// CLI argument parsing & configuration (guarded for testability)
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

let DRY_RUN = false;
let SINGLE_STEP = null;
let RESUME = false;
let SINGLE_ISSUE_NUMBER = null;
let PROJECT_PATH = '';
let PLUGINS_PATH = '';
let PLUGIN_ROOT = '';
let SKILL_ROOT_SOURCE = '';
let SKILL_ROOT_RECOVERY = null;
let MODEL = 'gpt-5.5';
let EFFORT = 'medium';
let MAX_RETRIES = 3;
let MAX_BOUNCE_RETRIES = 3;
let CLEANUP_PATTERNS = [];
let STATE_PATH = '';
let configPath = '';
let configSteps = {};
let LOG_DIR = '';
let MAX_LOG_DISK_BYTES = 500 * 1024 * 1024;
let ORCHESTRATION_LOG = '';
let dryRunState = null;

if (isMainModule) {
  const { values: args } = parseArgs({
    options: {
      config:  { type: 'string'  },
      'dry-run': { type: 'boolean', default: false },
      step:    { type: 'string'  },
      issue:   { type: 'string'  },
      resume:  { type: 'boolean', default: false },
      help:    { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (args.help) {
    console.log(`
Usage: node sdlc-runner.mjs --config <path> [options]

Options:
  --config <path>            Path to sdlc-config.json (required)
  --dry-run                  Log actions without executing
  --step <N>                 Run only step N (1-9), then exit
  --issue <N>                Process only issue #N then exit (single-cycle mode)
  --resume                   Resume from existing sdlc-state.json
  --help                     Show this help
`);
    process.exit(0);
  }

  if (!args.config) {
    console.error('Error: --config <path> is required');
    process.exit(1);
  }

  DRY_RUN = args['dry-run'];
  SINGLE_STEP = args.step ? parseInt(args.step, 10) : null;
  SINGLE_ISSUE_NUMBER = args.issue ? parseInt(args.issue, 10) : null;
  if (args.issue && (!Number.isInteger(SINGLE_ISSUE_NUMBER) || SINGLE_ISSUE_NUMBER <= 0)) {
    console.error(`Error: --issue must be a positive integer, got "${args.issue}"`);
    process.exit(1);
  }
  RESUME = args.resume;

  // Load configuration
  configPath = path.resolve(args.config);
  if (!fs.existsSync(configPath)) {
    console.error(`Error: config file not found: ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  PROJECT_PATH = config.projectPath;
  PLUGINS_PATH = config.pluginsPath || '';
  PLUGIN_ROOT = config.pluginRoot || '';
  MODEL = config.model || 'gpt-5.5';
  EFFORT = config.effort || 'medium';
  MAX_RETRIES = config.maxRetriesPerStep || 3;
  MAX_BOUNCE_RETRIES = parseMaxBounceRetries(config.maxBounceRetries);

  CLEANUP_PATTERNS = config.cleanup?.processPatterns || [];
  configSteps = config.steps || {};

  // Validate configuration
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    for (const err of configErrors) console.error(`Config error: ${err}`);
    process.exit(1);
  }

  STATE_PATH = path.join(PROJECT_PATH, '.codex', 'sdlc-state.json');

  // Logging setup (uses the already-parsed config)
  LOG_DIR = resolveLogDir(config, PROJECT_PATH);
  MAX_LOG_DISK_BYTES = (config.maxLogDiskUsageMB || 500) * 1024 * 1024;

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch { /* non-fatal — log() will silently skip file writes */ }

  ORCHESTRATION_LOG = path.join(LOG_DIR, 'sdlc-runner.log');
}

// ---------------------------------------------------------------------------
// Logging configuration
// ---------------------------------------------------------------------------

function resolveLogDir(cfg, projectPath) {
  if (cfg.logDir) return path.resolve(cfg.logDir);
  return path.join(os.tmpdir(), 'sdlc-logs', path.basename(projectPath));
}

// Failure loop detection — in-memory, not persisted to state file
const MAX_CONSECUTIVE_ESCALATIONS = 2;
let consecutiveEscalations = 0;
const escalatedIssues = new Set();
let bounceCount = 0;

// Structured context carried from a failed step to the step it bounces to.
// Set at both bounce sites (runStep precondition fail, handleFailure
// precondition fail), consumed by buildCodexArgs exactly once, cleared after
// the receiving step completes or a new cycle starts. Keeps the receiving
// subagent from re-investigating divergence from scratch on every bounce.
let bounceContext = null;

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

// NOTE: draftIssue is intentionally absent. /draft-issue is interactive-only
// as of plugin v1.41.0. Do not add it here — see
// skills/draft-issue/SKILL.md for the rationale.
const STEP_KEYS = [
  'startCycle',   // 1
  'startIssue',   // 2
  'writeSpecs',   // 3
  'implement',    // 4
  'simplify',     // 5 — bundled cleanup skill
  'verify',       // 6
  'createPR',     // 7 — open-pr commits, versions, pushes, and creates the PR
  'monitorCI',    // 8
  'merge',        // 9
];

const STEPS = STEP_KEYS.map((key, i) => ({
  number: i + 1,
  key,
  ...(configSteps[key] || {}),
}));

// Step numbers keyed by name — avoids hardcoding positional indices at call
// sites that care about specific steps (e.g., merge idempotency).
const STEP_NUMBER = Object.fromEntries(STEP_KEYS.map((key, i) => [key, i + 1]));

// ---------------------------------------------------------------------------
// Configuration validation and resolution
// ---------------------------------------------------------------------------

/**
 * Validate model and effort fields throughout a config object.
 * Returns an array of error messages (empty = valid).
 */
function validateConfig(config) {
  const errors = [];

  if (!config.projectPath) {
    errors.push('config must include projectPath');
  }

  if (!config.pluginRoot && !config.pluginsPath) {
    errors.push('config must include either pluginRoot (recommended for Codex plugin installs) or pluginsPath (legacy nmg-plugins monorepo layout) — at least one is required');
  }

  if (config.effort === 'max') {
    errors.push('Global effort "max" is intentionally excluded from nmg-sdlc defaults — max is prone to overthinking on coding workloads; use "xhigh" instead');
  } else if (config.effort !== undefined && !VALID_EFFORTS.includes(config.effort)) {
    errors.push(`Invalid global effort "${config.effort}" — must be one of: ${VALID_EFFORTS.join(', ')}`);
  }
  if (config.model !== undefined && (typeof config.model !== 'string' || config.model.trim() === '')) {
    errors.push('Global model must be a non-empty string');
  }

  if (config.steps) {
    const globalEffort = config.effort;
    const globalModel = config.model;
    for (const [key, step] of Object.entries(config.steps)) {
      if (step.model !== undefined && (typeof step.model !== 'string' || step.model.trim() === '')) {
        errors.push(`steps.${key}.model must be a non-empty string`);
      }
      if (step.effort === 'max') {
        errors.push(`steps.${key}.effort "max" is intentionally excluded from nmg-sdlc defaults — max is prone to overthinking on coding workloads; use "xhigh" instead`);
      } else if (step.effort !== undefined && !VALID_EFFORTS.includes(step.effort)) {
        errors.push(`Invalid steps.${key}.effort "${step.effort}" — must be one of: ${VALID_EFFORTS.join(', ')}`);
      }

      void (step.model || globalModel);
    }
  }

  return errors;
}

function pluginRootShapeDescription() {
  return 'a valid nmg-sdlc plugin root containing .codex-plugin/plugin.json, skills/, and scripts/sdlc-runner.mjs';
}

function safeIsDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function validatePluginRootShape(pluginRoot) {
  if (!pluginRoot) {
    return {
      ok: false,
      missingArtifact: 'plugin root path',
      missingPath: pluginRoot,
      reason: 'path is empty',
    };
  }

  const required = [
    {
      artifact: '.codex-plugin/plugin.json',
      path: path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
      type: 'file',
    },
    {
      artifact: 'skills/',
      path: path.join(pluginRoot, 'skills'),
      type: 'directory',
    },
    {
      artifact: 'scripts/sdlc-runner.mjs',
      path: path.join(pluginRoot, 'scripts', 'sdlc-runner.mjs'),
      type: 'file',
    },
  ];

  for (const item of required) {
    if (!fs.existsSync(item.path)) {
      return {
        ok: false,
        missingArtifact: item.artifact,
        missingPath: item.path,
        reason: 'missing',
      };
    }
    if (item.type === 'directory' && !safeIsDirectory(item.path)) {
      return {
        ok: false,
        missingArtifact: item.artifact,
        missingPath: item.path,
        reason: 'not a directory',
      };
    }
  }

  return { ok: true };
}

function pathSegments(candidatePath) {
  return path
    .normalize(candidatePath)
    .split(/[\\/]+/)
    .filter(Boolean);
}

function isVersionedNmgSdlcCacheRoot(candidatePath) {
  const parts = pathSegments(candidatePath);
  if (parts.length < 5) return false;
  const tail = parts.slice(-5);
  return tail[0] === 'plugins'
    && tail[1] === 'cache'
    && tail[2] === 'nmg-plugins'
    && tail[3] === 'nmg-sdlc'
    && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tail[4]);
}

function runtimePluginRoot() {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

function selectedSkillsRoot() {
  const base = resolveSkillsBase();
  const configuredValue = SKILL_ROOT_SOURCE === 'pluginRoot' ? PLUGIN_ROOT : PLUGINS_PATH;
  return {
    base,
    field: SKILL_ROOT_SOURCE,
    configuredValue,
  };
}

function pluginRootDiagnostic({ base, field, configuredValue }, validation) {
  return [
    `Invalid plugin root from ${field}="${configuredValue}".`,
    `Resolved path: ${base}.`,
    `Missing required artifact: ${validation.missingArtifact} at ${validation.missingPath}.`,
    `Expected ${pluginRootShapeDescription()}.`,
    'Run $nmg-sdlc:upgrade-project to refresh stale versioned cache roots, or update sdlc-config.json to a valid pluginRoot.',
  ].join(' ');
}

function resolveUsableSkillsBase() {
  const selected = selectedSkillsRoot();
  SKILL_ROOT_RECOVERY = null;

  const validation = validatePluginRootShape(selected.base);
  if (validation.ok) return selected.base;

  if (isVersionedNmgSdlcCacheRoot(selected.base)) {
    const fallbackRoot = runtimePluginRoot();
    const fallbackValidation = validatePluginRootShape(fallbackRoot);
    if (fallbackValidation.ok) {
      SKILL_ROOT_RECOVERY = {
        staleField: selected.field,
        staleValue: selected.configuredValue,
        staleRoot: selected.base,
        recoveredRoot: fallbackRoot,
        missingArtifact: validation.missingArtifact,
        missingPath: validation.missingPath,
      };
      return fallbackRoot;
    }
  }

  throw new Error(pluginRootDiagnostic(selected, validation));
}

/**
 * Return a config object packaging module-level globals for the resolution functions.
 */
function getConfigObject() {
  return { model: MODEL, effort: EFFORT };
}

/**
 * Resolve model and effort for a step using the fallback chain:
 *   step.field → config.field → default
 * Model default: 'gpt-5.5'; effort default: 'medium'.
 */
function resolveStepConfig(step, config) {
  const model = step.model || config.model || 'gpt-5.5';
  const effort = step.effort || config.effort || 'medium';
  return {
    model,
    effort,
  };
}


// ---------------------------------------------------------------------------
// Shared helpers (used by validation, state detection, and spec checks)
// ---------------------------------------------------------------------------

const REQUIRED_SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md', 'feature.gherkin'];

/**
 * Locate the feature directory inside specs/.
 * Matches by featureName, branchSlug, issue frontmatter, or directory name.
 * By default it preserves the legacy fallback to the last directory; validation
 * callers pass `{ strict: true }` so unrelated old specs cannot satisfy the
 * current issue's postconditions.
 * Returns the absolute path, or null if nothing is found.
 */
function findFeatureDir(specsDir, featureName, branchSlug, opts = {}) {
  if (!fs.existsSync(specsDir)) return null;
  const dirs = fs.readdirSync(specsDir)
    .filter(d => fs.statSync(path.join(specsDir, d)).isDirectory());
  if (dirs.length === 0) return null;

  if (featureName && dirs.includes(featureName)) {
    return path.join(specsDir, featureName);
  }
  if (branchSlug) {
    const matched = dirs.find(d => d.includes(branchSlug));
    if (matched) return path.join(specsDir, matched);
  }

  const issueNumber = Number(opts.issueNumber);
  if (Number.isInteger(issueNumber) && issueNumber > 0) {
    const issuePattern = new RegExp(`(^|[^0-9])#?${issueNumber}([^0-9]|$)`);
    for (const dir of dirs) {
      if (issuePattern.test(dir)) return path.join(specsDir, dir);
      const reqPath = path.join(specsDir, dir, 'requirements.md');
      if (!fs.existsSync(reqPath)) continue;
      try {
        const content = fs.readFileSync(reqPath, 'utf8');
        const issueFrontmatter = content.match(/^\*\*Issues?\*\*:.*$/m)?.[0] || '';
        if (issuePattern.test(issueFrontmatter)) return path.join(specsDir, dir);
      } catch { /* ignore unreadable candidate */ }
    }
  }

  if (opts.strict) return null;
  return path.join(specsDir, dirs[dirs.length - 1]);
}

function slugFromBranch(branch) {
  const match = typeof branch === 'string' ? branch.match(/^\d+-(.+)$/) : null;
  return match ? match[1] : null;
}

/**
 * Check that all required spec files exist with non-zero size.
 * Returns an array of missing/empty filenames (empty = all present).
 */
function checkRequiredSpecFiles(featureDir) {
  return REQUIRED_SPEC_FILES.filter(f => {
    const fp = path.join(featureDir, f);
    return !fs.existsSync(fp) || fs.statSync(fp).size === 0;
  });
}

/**
 * Parse maxBounceRetries from a config value, returning a validated integer
 * or the default of 3.
 */
function parseMaxBounceRetries(val) {
  if (val === undefined || val === null) return 3;
  const num = Number(val);
  if (!Number.isInteger(num) || num <= 0) {
    log(`Warning: invalid maxBounceRetries value "${val}" — using default 3`);
    return 3;
  }
  return num;
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

function defaultState() {
  return {
    currentStep: 0,
    lastCompletedStep: 0,
    currentIssue: null,
    currentBranch: 'main',
    featureName: null,
    lastTransitionAt: null,
    retries: {},
    runnerPid: process.pid,
  };
}

function readState() {
  if (DRY_RUN && dryRunState) {
    return { ...dryRunState };
  }
  if (fs.existsSync(STATE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch (err) {
      log(`Warning: state file corrupted (${err.message}), resetting to defaults`);
      return defaultState();
    }
  }
  return defaultState();
}

function writeState(state) {
  if (DRY_RUN) {
    dryRunState = { ...state };
    log('[DRY-RUN] Would write .codex/sdlc-state.json');
    return;
  }
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, STATE_PATH);
}

function updateState(patch) {
  const state = readState();
  Object.assign(state, patch, { lastTransitionAt: new Date().toISOString() });
  writeState(state);
  return state;
}

/**
 * Inspect git state and filesystem artifacts to detect in-progress work.
 * Called on every startup to hydrate state from reality, not from a potentially
 * stale state file.
 *
 * Returns a state patch object if work is detected, or null to fall through
 * to normal startup behavior.
 */
function detectAndHydrateState() {
  let branch;
  try {
    branch = git('rev-parse --abbrev-ref HEAD');
  } catch {
    log('detectAndHydrateState: could not determine current branch');
    return null;
  }

  if (branch === 'main') {
    log('detectAndHydrateState: on main branch, proceeding normally');
    return null;
  }

  // Extract issue number from branch name (e.g. "30-feature-slug")
  const branchMatch = branch.match(/^(\d+)-(.+)$/);
  if (!branchMatch) {
    log(`detectAndHydrateState: branch "${branch}" does not match <number>-<slug> pattern, skipping detection`);
    return null;
  }

  const issueNumber = parseInt(branchMatch[1], 10);
  log(`detectAndHydrateState: on feature branch "${branch}", issue #${issueNumber}`);

  // Check if PR is already merged — if so, return to main for a fresh cycle
  try {
    const prState = gh('pr view --json state --jq .state');
    if (prState === 'MERGED') {
      log('detectAndHydrateState: PR is already merged, checking out main for fresh cycle');
      if (!DRY_RUN) {
        try {
          git('checkout main');
          git('pull');
        } catch (err) {
          log(`Warning: could not checkout main after merged PR: ${err.message}`);
          return null;
        }
      }
      return { _merged: true };
    }
  } catch {
    // No PR exists yet — that's fine, continue probing
  }

  // Read any persisted state up front: verify and simplify have no
  // git-observable artifact, so we need the saved state to confirm they passed
  // before probing past implement on the basis of "branch pushed".
  const savedState = readState();
  const savedLastCompleted = typeof savedState.lastCompletedStep === 'number' ? savedState.lastCompletedStep : 0;

  // Probe artifacts from highest to lowest to determine lastCompletedStep
  let lastCompletedStep = STEP_NUMBER.startIssue; // At minimum, we're on a feature branch (startIssue done)

  // Check for spec files (writeSpecs)
  const specsDir = path.join(PROJECT_PATH, 'specs');
  let featureName = null;
  const featureDir = findFeatureDir(specsDir, null, branchMatch[2], {
    strict: true,
    issueNumber,
  });
  if (featureDir && checkRequiredSpecFiles(featureDir).length === 0) {
    lastCompletedStep = STEP_NUMBER.writeSpecs;
    featureName = path.basename(featureDir);
  }

  // Check for commits ahead of main (implement — conservative; implement/simplify/verify indistinguishable from git state)
  if (lastCompletedStep >= STEP_NUMBER.writeSpecs) {
    try {
      const aheadLog = git('log main..HEAD --oneline');
      if (aheadLog) {
        lastCompletedStep = STEP_NUMBER.implement;
      }
    } catch { /* ignore */ }
  }

  // Check if PR exists (createPR)
  if (lastCompletedStep >= STEP_NUMBER.verify || savedLastCompleted >= STEP_NUMBER.verify) {
    try {
      gh('pr view --json number');
      lastCompletedStep = STEP_NUMBER.createPR;
    } catch {
      // No PR yet
    }
  }

  // Check if CI is passing (monitorCI)
  if (lastCompletedStep >= STEP_NUMBER.createPR) {
    try {
      const checks = gh('pr checks');
      if (!/fail|pending/i.test(checks)) {
        lastCompletedStep = STEP_NUMBER.monitorCI;
      }
    } catch (err) {
      if (/no checks reported/i.test(err.stderr || err.message || '')) {
        lastCompletedStep = STEP_NUMBER.monitorCI;
      }
    }
  }

  // If the runner was shut down by signal, the SIGTERM handler may have saved
  // WIP commits. Cap the probed value to what the state file recorded before
  // shutdown so resume never treats saved WIP as a completed delivery handoff.
  if (savedState.signalShutdown && savedState.lastCompletedStep < lastCompletedStep) {
    log(`detectAndHydrateState: signal shutdown detected — capping lastCompletedStep from ${lastCompletedStep} to ${savedState.lastCompletedStep} (state file value)`);
    lastCompletedStep = savedState.lastCompletedStep;
  }

  log(`detectAndHydrateState: detected lastCompletedStep=${lastCompletedStep}, featureName=${featureName || '<unknown>'}`);

  return {
    currentIssue: issueNumber,
    currentBranch: branch,
    featureName,
    lastCompletedStep,
  };
}

// ---------------------------------------------------------------------------
// Status notifications (logged to console and orchestration log)
// ---------------------------------------------------------------------------

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(ORCHESTRATION_LOG, line + '\n'); } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Per-step log persistence
// ---------------------------------------------------------------------------

function parseJsonEvents(streamOutput) {
  if (!streamOutput || typeof streamOutput !== 'string') return [];
  const events = [];
  const lines = streamOutput.trim().split('\n');
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch { /* skip non-JSON lines */ }
  }
  if (events.length === 0) {
    try {
      events.push(JSON.parse(streamOutput));
    } catch { /* not valid JSON */ }
  }
  return events;
}

const MEMORY_METADATA_KEYS = new Set([
  'cmd',
  'command',
  'file_path',
  'filepath',
  'notebook_path',
  'path',
  'pathname',
  'source',
  'source_path',
  'uri',
  'url',
]);

const OUTPUT_LIKE_KEYS = new Set([
  'aggregated_output',
  'content',
  'delta',
  'message',
  'messages',
  'output',
  'result',
  'stderr',
  'stdout',
  'summary',
  'text',
]);

function normalizePathForSearch(value) {
  return String(value)
    .replace(/^file:\/\//i, '')
    .replace(/\\ /g, ' ')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

function codexMemoryRoots() {
  return [normalizePathForSearch(path.resolve(path.join(os.homedir(), '.codex', 'memories')))];
}

function containsPathUnderRoot(value, root) {
  const haystack = normalizePathForSearch(value);
  const needle = normalizePathForSearch(root);
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const before = index === 0 ? '' : haystack[index - 1];
    const after = haystack[index + needle.length] || '';
    const beforeOk = index === 0 || /[\s"'=(:;,]/.test(before) || before === '/';
    const afterOk = after === '' || after === '/' || /[\s"')\];,]/.test(after);
    if (beforeOk && afterOk) return true;
    index = haystack.indexOf(needle, index + 1);
  }
  return false;
}

function valueReferencesCodexMemory(value, memoryRoots) {
  return memoryRoots.some(root => containsPathUnderRoot(value, root));
}

function shouldInspectMetadataKey(key) {
  const normalized = key.toLowerCase();
  return MEMORY_METADATA_KEYS.has(normalized) ||
    normalized.endsWith('_path') ||
    normalized.endsWith('path') ||
    normalized.endsWith('_uri') ||
    normalized.endsWith('uri') ||
    normalized.endsWith('_source') ||
    normalized.endsWith('source');
}

function collectMetadataStrings(value, key = '', results = []) {
  if (typeof value === 'string') {
    if (shouldInspectMetadataKey(key)) results.push(value);
    return results;
  }
  if (!value || typeof value !== 'object') return results;

  if (Array.isArray(value)) {
    for (const item of value) collectMetadataStrings(item, key, results);
    return results;
  }

  for (const [childKey, childValue] of Object.entries(value)) {
    if (OUTPUT_LIKE_KEYS.has(childKey.toLowerCase())) continue;
    collectMetadataStrings(childValue, childKey, results);
  }

  return results;
}

function hasMemorySourceMarker(value, key = '') {
  if (typeof value === 'string') {
    const normalizedKey = key.toLowerCase();
    if (!/(^|_)source($|_)|(^|_)origin($|_)/.test(normalizedKey)) return false;
    return /^(codex[-_\s])?memor(y|ies)$/i.test(value.trim());
  }
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => hasMemorySourceMarker(item, key));

  for (const [childKey, childValue] of Object.entries(value)) {
    if (OUTPUT_LIKE_KEYS.has(childKey.toLowerCase())) continue;
    if (hasMemorySourceMarker(childValue, childKey)) return true;
  }

  return false;
}

function isMemoryOriginEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (hasMemorySourceMarker(event)) return true;
  const memoryRoots = codexMemoryRoots();
  return collectMetadataStrings(event).some(value => valueReferencesCodexMemory(value, memoryRoots));
}

function eventExitCode(event) {
  const candidates = [
    event?.exit_code,
    event?.exitCode,
    event?.item?.exit_code,
    event?.item?.exitCode,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string' && /^-?\d+$/.test(candidate.trim())) {
      return Number(candidate);
    }
  }
  return null;
}

function isCommandExecutionEvent(event) {
  if (!event || typeof event !== 'object') return false;
  const type = typeof event.type === 'string' ? event.type : '';
  const itemType = typeof event.item?.type === 'string' ? event.item.type : '';
  return type === 'command_execution' || itemType === 'command_execution';
}

function isSuccessfulCommandExecutionEvent(event) {
  return isCommandExecutionEvent(event) && eventExitCode(event) === 0;
}

function failureEvidenceOutput(output) {
  if (!output || typeof output !== 'string') return '';
  const evidenceLines = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      evidenceLines.push(line);
      continue;
    }
    try {
      const event = JSON.parse(line);
      if (isMemoryOriginEvent(event) || isSuccessfulCommandExecutionEvent(event)) continue;
    } catch { /* non-JSON lines remain failure evidence */ }
    evidenceLines.push(line);
  }
  return evidenceLines.join('\n');
}

/**
 * Extract the final result JSON object from stream-json output.
 * Older Codex CLI versions emitted a final event with type "result".
 * Falls back to parsing the entire output as a single JSON object (legacy json format).
 */
function extractResultFromStream(streamOutput) {
  const events = parseJsonEvents(streamOutput);
  for (let i = events.length - 1; i >= 0; i--) {
    const parsed = events[i];
    if (parsed?.type === 'result') return parsed;
  }
  if (events.length === 1 && events[0]?.type === undefined) return events[0];
  return null;
}

/**
 * Extract the terminal JSON event from either legacy stream-json output or
 * current Codex JSONL output. Current `codex exec --json` emits events like
 * `turn.failed` instead of the older `result` event; matching both keeps
 * failure classification stable across CLI versions.
 */
function extractTerminalEventFromStream(streamOutput) {
  const events = parseJsonEvents(streamOutput);
  const terminalTypes = new Set(['result', 'turn.failed', 'turn.completed', 'task_complete']);
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type && terminalTypes.has(event.type)) return event;
  }
  if (events.length === 1 && events[0]?.type === undefined) return events[0];
  return null;
}

function getEventFailureCode(event) {
  return event?.subtype ||
    event?.error?.code ||
    event?.error?.codexErrorInfo?.code ||
    event?.error?.codex_error_info?.code ||
    event?.codexErrorInfo?.code ||
    event?.codex_error_info?.code ||
    null;
}

function getEventMessage(event) {
  return [
    event?.message,
    event?.error?.message,
    event?.error?.reason,
    event?.error?.details,
    event?.reason,
    event?.result,
  ].filter(v => typeof v === 'string').join('\n');
}

function extractSessionId(jsonOutput) {
  const result = extractResultFromStream(jsonOutput);
  if (result?.session_id) return String(result.session_id).slice(0, 12);
  const thread = parseJsonEvents(jsonOutput).find(e => e?.thread_id);
  if (thread?.thread_id) return String(thread.thread_id).slice(0, 12);
  return randomUUID().slice(0, 12);
}

function enforceMaxDisk(logDir, maxBytes) {
  try {
    const entries = fs.readdirSync(logDir)
      .filter(f => f.endsWith('.log') && f !== 'sdlc-runner.log')
      .map(f => {
        const fp = path.join(logDir, f);
        const stat = fs.statSync(fp);
        return { path: fp, size: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime); // oldest first

    let total = entries.reduce((sum, e) => sum + e.size, 0);
    for (const entry of entries) {
      if (total <= maxBytes) break;
      fs.unlinkSync(entry.path);
      total -= entry.size;
      log(`Pruned old log: ${path.basename(entry.path)}`);
    }
  } catch (err) { log(`Warning: disk cleanup failed: ${err.message}`); }
}

function writeStepLog(stepKey, result) {
  try {
    enforceMaxDisk(LOG_DIR, MAX_LOG_DISK_BYTES);
    const sessionId = extractSessionId(result.stdout);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${stepKey}-${sessionId}-${ts}.log`;
    const header = [
      `Step: ${stepKey}`,
      `Session: ${sessionId}`,
      `Exit code: ${result.exitCode}`,
      `Duration: ${result.duration}s`,
      `Timestamp: ${new Date().toISOString()}`,
      '---',
      '',
    ].join('\n');
    const body = `=== STDOUT ===\n${result.stdout}\n\n=== STDERR ===\n${result.stderr}\n`;
    fs.writeFileSync(path.join(LOG_DIR, filename), header + body);
    log(`Step log written: ${filename}`);
  } catch (err) { log(`Warning: failed to write step log for ${stepKey}: ${err.message}`); }
}

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

function git(args, cwd = PROJECT_PATH) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8', timeout: 30_000 }).trim();
}

function gh(args, cwd = PROJECT_PATH) {
  return execSync(`gh ${args}`, { cwd, encoding: 'utf8', timeout: 60_000 }).trim();
}

// Runner-managed files that should not count as "dirty" working tree
const RUNNER_ARTIFACTS = ['.codex/sdlc-state.json', '.codex/unattended-mode'];

/**
 * Ensure each RUNNER_ARTIFACTS entry is listed in the target project's .gitignore.
 * Append-only — never removes existing content. Idempotent on repeated calls.
 */
function ensureRunnerArtifactsGitignored() {
  const gitignorePath = path.join(PROJECT_PATH, '.gitignore');
  let content = '';
  try {
    content = fs.readFileSync(gitignorePath, 'utf8');
  } catch (err) { if (err.code !== 'ENOENT') throw err; }

  const existingLines = new Set(content.split('\n').map(l => l.trim()));
  const missing = RUNNER_ARTIFACTS.filter(entry => !existingLines.has(entry));
  if (missing.length === 0) return;

  let append = '';
  if (content.length > 0 && !content.endsWith('\n')) {
    append += '\n';
  }
  append += '\n# SDLC runner artifacts\n';
  append += missing.join('\n') + '\n';

  fs.appendFileSync(gitignorePath, append);
  log(`Appended to .gitignore: ${missing.join(', ')}`);
}

/**
 * If any RUNNER_ARTIFACTS are already git-tracked (committed before the
 * .gitignore entry was in place), untrack them with `git rm --cached`.
 * This is a one-time self-healing operation — once untracked, .gitignore
 * keeps them out of future commits.
 */
function untrackRunnerArtifactsIfTracked() {
  for (const artifact of RUNNER_ARTIFACTS) {
    try {
      // ls-files --error-unmatch exits non-zero if the file is not tracked
      git(`ls-files --error-unmatch ${artifact}`);
      // If we get here, the file IS tracked — untrack it
      git(`rm --cached ${artifact}`);
      log(`Untracked previously committed runner artifact: ${artifact}`);
    } catch {
      // Not tracked (or doesn't exist) — nothing to do
    }
  }
}

function removeUnattendedMode() {
  try {
    fs.unlinkSync(path.join(PROJECT_PATH, '.codex', 'unattended-mode'));
    log('Removed .codex/unattended-mode flag');
  } catch { /* best effort — file may not exist */ }
}

/**
 * Commit and push any dirty working-tree changes (excluding runner artifacts).
 * Non-fatal — logs warnings on failure. Returns true if a commit was made.
 */
function autoCommitIfDirty(message) {
  try {
    const status = git('status --porcelain');
    if (!status) return false;

    // Filter out runner artifacts
    const meaningful = status
      .split('\n')
      .filter(line => !RUNNER_ARTIFACTS.some(f => line.trimStart().endsWith(f)))
      .join('\n')
      .trim();

    if (!meaningful) {
      log('Auto-commit: only runner artifacts changed, skipping.');
      return false;
    }

    if (DRY_RUN) {
      log(`[DRY-RUN] Would auto-commit: ${message}`);
      return true;
    }

    git('add -A');
    git(`commit -m ${shellEscape(message)}`);
    git('push');
    log(`Auto-committed: ${message}`);
    return true;
  } catch (err) {
    log(`Warning: autoCommitIfDirty failed: ${err.message}`);
    return false;
  }
}

function shellEscape(str) {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

// ---------------------------------------------------------------------------
// Process cleanup — helpers
// ---------------------------------------------------------------------------

function getChildPids(pid) {
  try {
    let stdout;
    if (IS_WINDOWS) {
      stdout = execSync(`wmic process where (ParentProcessId=${pid}) get ProcessId`, { encoding: 'utf8', timeout: 5_000 });
    } else {
      stdout = execSync(`pgrep -P ${pid}`, { encoding: 'utf8', timeout: 5_000 });
    }
    return stdout.trim().split(/\s+/).map(Number).filter(n => n > 0 && Number.isInteger(n));
  } catch {
    return [];
  }
}

function getProcessTree(pid) {
  const children = getChildPids(pid);
  const result = [];
  for (const child of children) {
    result.push(...getProcessTree(child));
  }
  result.push(pid);
  return result;
}

function killProcessTree(pid) {
  if (IS_WINDOWS) {
    try {
      execSync(`taskkill /T /F /PID ${pid}`, { encoding: 'utf8', timeout: 5_000 });
      return 1;
    } catch {
      return 0;
    }
  }
  const pids = getProcessTree(pid);
  let killed = 0;
  for (const p of pids) {
    try {
      process.kill(p, 'SIGTERM');
      killed++;
    } catch (err) {
      if (err.code !== 'ESRCH') throw err;
    }
  }
  return killed;
}

function findProcessesByPattern(pattern) {
  try {
    let stdout;
    if (IS_WINDOWS) {
      const escaped = pattern.replace(/'/g, "''");
      stdout = execSync(`wmic process where "CommandLine like '%${escaped}%'" get ProcessId`, { encoding: 'utf8', timeout: 5_000 });
    } else {
      stdout = execSync(`pgrep -f -- ${shellEscape(pattern)}`, { encoding: 'utf8', timeout: 5_000 });
    }
    return stdout.trim().split(/\s+/).map(Number).filter(n => n > 0 && Number.isInteger(n));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Process cleanup
// ---------------------------------------------------------------------------

function cleanupProcesses() {
  const phase1Ran = !!lastCodexPid;

  // Phase 1: tree-based cleanup via lastCodexPid
  if (lastCodexPid) {
    const killed = killProcessTree(lastCodexPid);
    log(`[CLEANUP] Phase 1: killed ${killed} process(es) in tree rooted at PID ${lastCodexPid}`);
    lastCodexPid = null;
  }

  // Phase 2: pattern-based fallback
  if (CLEANUP_PATTERNS.length === 0) {
    if (!phase1Ran) log('[CLEANUP] No matching processes found');
    return;
  }

  let phase2Killed = false;
  for (const pattern of CLEANUP_PATTERNS) {
    try {
      const pids = findProcessesByPattern(pattern).filter(p => p !== process.pid);
      if (pids.length === 0) continue;

      phase2Killed = true;
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch (err) {
          if (err.code !== 'ESRCH') throw err;
        }
      }
      log(`[CLEANUP] Phase 2: killed ${pids.length} process(es) matching "${pattern}"`);
    } catch (err) {
      log(`[CLEANUP] Warning: error cleaning up pattern "${pattern}": ${err.message}`);
    }
  }

  if (!phase2Killed && !phase1Ran) {
    log('[CLEANUP] No matching processes found');
  }
}

// ---------------------------------------------------------------------------
// Precondition validation
// ---------------------------------------------------------------------------

function validatePreconditions(step, state) {
  switch (step.number) {
    case STEP_NUMBER.startCycle: { // Start cycle — clean working tree before any checkout/pull
      try {
        const status = git('status --porcelain')
          .split('\n')
          .filter(line => !RUNNER_ARTIFACTS.some(f => line.trimStart().endsWith(f)))
          .join('\n')
          .trim();
        if (status.length > 0) return { ok: false, failedCheck: 'clean working tree', reason: 'Working tree is dirty before start-cycle' };
        return { ok: true };
      } catch (err) {
        return { ok: false, failedCheck: 'git state check', reason: `Git check failed: ${err.message}` };
      }
    }

    case STEP_NUMBER.startIssue: { // Start issue — clean main branch
      try {
        const status = git('status --porcelain')
          .split('\n')
          .filter(line => !RUNNER_ARTIFACTS.some(f => line.trimStart().endsWith(f)))
          .join('\n')
          .trim();
        const branch = git('rev-parse --abbrev-ref HEAD');
        if (status.length > 0) return { ok: false, failedCheck: 'clean working tree', reason: 'Working tree is dirty' };
        if (branch !== 'main') return { ok: false, failedCheck: 'on main branch', reason: `Expected main branch, on ${branch}` };
        return { ok: true };
      } catch (err) {
        return { ok: false, failedCheck: 'git state check', reason: `Git check failed: ${err.message}` };
      }
    }

    case STEP_NUMBER.writeSpecs: { // Write specs — feature branch exists, issue known
      const branch = git('rev-parse --abbrev-ref HEAD');
      if (branch === 'main') return { ok: false, failedCheck: 'feature branch exists', reason: 'Still on main, expected feature branch' };
      if (!state.currentIssue) return { ok: false, failedCheck: 'issue number known', reason: 'No current issue set in state' };
      return { ok: true };
    }

    case STEP_NUMBER.implement: { // Implement — all 4 spec files exist
      const specsDir = path.join(PROJECT_PATH, 'specs');
      const featureDir = findFeatureDir(specsDir, state.featureName, slugFromBranch(state.currentBranch), {
        strict: true,
        issueNumber: state.currentIssue,
      });
      if (!featureDir) {
        return { ok: false, failedCheck: 'spec files exist', reason: 'No feature spec directory found' };
      }
      const missing = checkRequiredSpecFiles(featureDir);
      if (missing.length > 0) {
        return { ok: false, failedCheck: 'spec files exist', reason: `Missing spec files: ${missing.join(', ')}` };
      }
      return { ok: true };
    }

    case STEP_NUMBER.simplify: // Simplify — no preconditions
      return { ok: true };

    case STEP_NUMBER.verify: { // Verify — implementation committed on feature branch
      const branch = git('rev-parse --abbrev-ref HEAD');
      if (branch === 'main') return { ok: false, failedCheck: 'on feature branch', reason: 'On main, expected feature branch' };
      try {
        const log = git('log main..HEAD --oneline');
        if (!log) return { ok: false, failedCheck: 'commits exist on branch', reason: 'No commits ahead of main' };
      } catch {
        // If main doesn't exist as a ref, just check we have commits
      }
      return { ok: true };
    }

    case STEP_NUMBER.createPR: // open-pr owns commit, version, rebase, push, and PR creation
      return { ok: true };

    case STEP_NUMBER.monitorCI: { // Monitor CI — PR exists
      try {
        gh('pr view --json number');
        return { ok: true };
      } catch {
        return { ok: false, failedCheck: 'PR exists', reason: 'No PR found for current branch' };
      }
    }

    case STEP_NUMBER.merge: { // Merge — CI passing
      try {
        const checks = gh('pr checks');
        if (checksIndicateFailure(checks)) return { ok: false, failedCheck: 'CI checks passing', reason: 'CI checks failing' };
        if (checksIndicatePending(checks)) return { ok: false, failedCheck: 'CI checks complete', reason: 'CI checks pending' };
        return { ok: true };
      } catch (err) {
        if (/no checks reported/i.test(err.stderr || err.message || '')) {
          return { ok: true };
        }
        return { ok: false, failedCheck: 'PR status check', reason: 'Could not check PR status' };
      }
    }

    default:
      return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Build codex exec arguments for each step
// ---------------------------------------------------------------------------

/**
 * Return the directory that contains `skills/` for the current config.
 * Precedence: `pluginRoot` wins if set (Codex plugin-cache layout),
 * otherwise fall back to `{pluginsPath}/plugins/nmg-sdlc` (legacy monorepo).
 * Records the chosen field name in SKILL_ROOT_SOURCE so error messages and
 * the startup log can name it.
 */
function resolveSkillsBase() {
  if (PLUGIN_ROOT) {
    SKILL_ROOT_SOURCE = 'pluginRoot';
    return PLUGIN_ROOT;
  }
  if (PLUGINS_PATH) {
    SKILL_ROOT_SOURCE = 'pluginsPath';
    return path.join(PLUGINS_PATH, 'plugins', 'nmg-sdlc');
  }
  throw new Error('Cannot resolve skills base: neither pluginRoot nor pluginsPath is set in config');
}

function readSkill(skillName) {
  const base = resolveUsableSkillsBase();
  const skillPath = path.join(base, 'skills', skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    const configuredValue = SKILL_ROOT_RECOVERY
      ? SKILL_ROOT_RECOVERY.recoveredRoot
      : (SKILL_ROOT_SOURCE === 'pluginRoot' ? PLUGIN_ROOT : PLUGINS_PATH);
    const source = SKILL_ROOT_RECOVERY ? 'recovered plugin root' : SKILL_ROOT_SOURCE;
    throw new Error(
      `Skill file not found: ${skillPath} ` +
      `(resolved from ${source}="${configuredValue}"). ` +
      `Check that ${source} points at a directory containing skills/${skillName}/SKILL.md.`
    );
  }
  return fs.readFileSync(skillPath, 'utf8');
}

function buildCodexArgs(step, state, overrides = {}) {
  const issue = state.currentIssue || '<unknown>';
  const branch = state.currentBranch || '<unknown>';
  const skillRoot = step.skill
    ? path.join(resolveUsableSkillsBase(), 'skills', step.skill)
    : null;

  const prompts = {
    [STEP_NUMBER.startCycle]: 'Check out main and pull latest without discarding user work. Run: git checkout main && git pull --ff-only. Do not run destructive cleanup or reset commands in this step. If checkout or pull cannot complete cleanly, exit non-zero and report the blocker. Report the current branch and latest commit.',

    [STEP_NUMBER.startIssue]: (SINGLE_ISSUE_NUMBER || preSelectedIssue)
      ? [
          `You are running in UNATTENDED MODE (\`.codex/unattended-mode\` exists).`,
          `Start issue #${SINGLE_ISSUE_NUMBER || preSelectedIssue}. The issue has already been selected by the runner.`,
          `Do NOT ask the user questions — there is no interactive user in this runner. Do NOT call \`request_user_input\`, and do NOT emit text asking the user to reply.`,
          `Skip issue selection and confirmation gates. Follow the skill's unattended-mode path: create or reconcile the linked feature branch, set the issue to In Progress if applicable, and exit successfully only after HEAD is on the <number>-<slug> feature branch.`,
          `Skill instructions are included below. Resolve relative file references from ${skillRoot}/.`,
        ].join('\n')
      : [
          `You are running in UNATTENDED MODE (\`.codex/unattended-mode\` exists).`,
          `Do NOT ask the user questions — there is no interactive user in this runner. Do NOT emit`,
          `text asking the user to reply. Follow the skill's unattended-mode path:`,
          ``,
          `1. Fetch viable milestones via \`gh api repos/{owner}/{repo}/milestones --jq '[.[] | select(.open_issues > 0) | {title: .title, open_issues: .open_issues}] | sort_by(.title)'\`.`,
          `2. Select the first milestone alphabetically. If none, fall back to repo-wide.`,
          `3. List issues with \`--label automatable\`: \`gh issue list -s open -m "<milestone>" --label automatable -L 10 --json number,title,labels\`.`,
          `4. If the list is empty, run the diagnostic query described in the skill and exit.`,
          `5. Otherwise, pick the issue with the lowest number from the list and use \`gh issue develop <N> --checkout\` to create and check out a branch. Update the project board status if applicable.`,
          `6. Exit successfully. HEAD must be on the new <number>-<slug> feature branch when you exit.`,
          ``,
          escalatedIssues.size > 0 ? `Do NOT select any of these previously-escalated issues: ${[...escalatedIssues].map(i => `#${i}`).join(', ')}.` : '',
          `Skill instructions are included below. Resolve relative file references from ${skillRoot}/.`,
        ].filter(Boolean).join('\n'),

    [STEP_NUMBER.writeSpecs]: `Write BDD specifications for issue #${issue} on branch ${branch}. Skill instructions are included below. Resolve relative file references from ${skillRoot}/.`,

    [STEP_NUMBER.implement]: `Implement the specifications for issue #${issue} on branch ${branch}. Skill instructions are included below. Resolve relative file references from ${skillRoot}/.`,

    [STEP_NUMBER.simplify]: [
      `Run the bundled nmg-sdlc simplify pass over files changed on branch ${branch} for issue #${issue}.`,
      ``,
      `Invoke $nmg-sdlc:simplify and provide the changed-file scope from:`,
      `git diff main...HEAD --name-only`,
      ``,
      `If the bundled skill reports failures, print the details and exit with code 1.`,
      `Exit with code 0 only after simplify has either applied worthwhile behavior-preserving fixes or reported that the changed files were already clean.`,
    ].join('\n'),

    [STEP_NUMBER.verify]: `Verify the implementation for issue #${issue} on branch ${branch}. Fix any findings. Skill instructions are included below. Resolve relative file references from ${skillRoot}/.`,

    [STEP_NUMBER.createPR]: `Create a pull request for branch ${branch} targeting main for issue #${issue}. This open-pr delivery step owns staging eligible non-runner work, applying the version bump, creating the conventional commit when needed, fetching origin, rebasing onto origin/main when local is behind, pushing with --force-with-lease=HEAD:{EXPECTED_SHA} after a rebase, verifying no unpushed commits remain, and then running gh pr create. Clean already-pushed branches must skip unnecessary commits and report that no additional commit was needed. Skill instructions are included below. Resolve relative file references from ${skillRoot}/.`,

    [STEP_NUMBER.monitorCI]: [
      `Monitor CI for the PR on branch ${branch}. Follow these steps exactly:`,
      `1. Run \`gh pr checks\`. If the output contains "no checks reported", the repository has no CI configured — treat this as success and exit with code 0 immediately.`,
      `2. Poll \`gh pr checks\` every 30 seconds until no checks are "pending".`,
      `3. If all checks pass, report success and exit with code 0.`,
      `4. If any check fails:`,
      `   a. Read the CI logs for the failing check(s) to diagnose the root cause.`,
      `   b. Before applying any fix, review the spec files in specs/ to ensure`,
      `      the fix does not deviate from specified behavior. If the only correct fix`,
      `      would change specified behavior, exit with a non-zero status explaining why.`,
      `   c. Apply the minimal fix, commit with a "fix:" conventional-commit message, and push.`,
      `   d. Return to step 2 to re-poll CI after the push.`,
      `5. If you cannot fix the failure after 3 attempts, exit with a non-zero status`,
      `   explaining what failed and why you could not fix it.`,
      `6. Only exit with code 0 when ALL CI checks show as passing.`,
    ].join('\n'),

    [STEP_NUMBER.merge]: `First verify CI is passing with gh pr checks. If the output contains "no checks reported", treat this as passing (the repository has no CI configured). If any check is failing, do NOT merge — report the failure and exit with a non-zero status. If all checks pass, merge the current PR to main and delete the remote branch ${branch}.`,
  };

  let basePrompt = overrides.prompt || prompts[step.number];

  // Prepend a structured bounce-context block when the current step is the
  // one being bounced TO (i.e. the previous step failed and the runner
  // re-entered step N-1). Keeps the receiving subagent from re-investigating
  // the divergence from scratch — it can read `reason` / `failedCheck` /
  // `remoteCommitsSuperseded` directly.
  if (bounceContext && bounceContext.fromStepNumber === step.number + 1 && !overrides.prompt) {
    const hints = bounceContext.divergenceHints || {};
    const ctxBlock = [
      '## Bounce context',
      `from: ${bounceContext.from}`,
      `reason: ${bounceContext.reason}`,
      `failedCheck: ${bounceContext.failedCheck || '(none)'}`,
      `remoteCommitsSuperseded: ${Boolean(hints.remoteCommitsSuperseded)}`,
      hints.localCommitsAhead !== undefined ? `localCommitsAhead: ${Boolean(hints.localCommitsAhead)}` : null,
      '',
      'The previous step bounced to you. Use this context to act directly — do not re-investigate the divergence from scratch.',
      '',
    ].filter(l => l !== null).join('\n');
    basePrompt = `${ctxBlock}\n${basePrompt}`;
  }

  let prompt = basePrompt;

  if (step.skill && !overrides.prompt) {
    const skillContent = readSkill(step.skill);
    prompt = [
      basePrompt,
      '',
      '## Skill instructions',
      skillContent,
    ].join('\n');
  }

  const codexArgs = [
    'exec',
    '--model', overrides.model || MODEL,
    '--cd', PROJECT_PATH,
    '--dangerously-bypass-approvals-and-sandbox',
    '--json',
  ];

  if (overrides.effort) {
    codexArgs.push('-c', `model_reasoning_effort="${overrides.effort}"`);
  }

  codexArgs.push(prompt);

  return codexArgs;
}

function buildCodexEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const key of INHERITED_CODEX_SANDBOX_ENV) {
    delete env[key];
  }
  return env;
}

// ---------------------------------------------------------------------------
// Codex subprocess execution
// ---------------------------------------------------------------------------

function runCodex(step, state, overrides = {}) {
  const resolved = resolveStepConfig(step, getConfigObject());
  const model = overrides.model || resolved.model;
  const effort = overrides.effort ?? resolved.effort;

  const codexArgs = buildCodexArgs(step, state, { model, effort, prompt: overrides.prompt });
  const timeoutMs = (step.timeoutMin || 10) * 60 * 1000;

  if (DRY_RUN) {
    log(`[DRY-RUN] Would run: codex ${codexArgs.slice(0, 8).join(' ')} ... (timeout: ${step.timeoutMin || 10}min)`);
    return Promise.resolve({ exitCode: 0, stdout: '{"type":"result","result":"dry-run"}', stderr: '', duration: 0 });
  }

  // Create live log file for real-time streaming
  const liveLogName = `${overrides.liveLogLabel || step.key || 'step' + step.number}-live.log`;
  const liveLogPath = path.join(LOG_DIR, liveLogName);
  let liveLogFd;
  try {
    liveLogFd = fs.openSync(liveLogPath, 'w');
    log(`Live log: ${liveLogPath}`);
  } catch (err) {
    log(`Warning: could not create live log: ${err.message}`);
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

    const spawnOpts = {
      cwd: PROJECT_PATH,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildCodexEnv(),
    };

    const proc = spawn('codex', codexArgs, spawnOpts);
    currentProcess = proc;
    lastCodexPid = proc.pid;

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (liveLogFd !== undefined) {
        try { fs.writeSync(liveLogFd, chunk); } catch { /* ignore write errors */ }
      }
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (liveLogFd !== undefined) {
        try { fs.writeSync(liveLogFd, '[STDERR] ' + chunk); } catch { /* ignore write errors */ }
      }
    });

    // Stall timeout
    const timer = setTimeout(() => {
      log(`Step ${step.number} exceeded timeout (${step.timeoutMin || 10}min). Sending SIGTERM...`);
      proc.kill('SIGTERM');
      // Grace period then SIGKILL
      setTimeout(() => {
        if (!proc.killed) {
          log('Grace period expired. Sending SIGKILL...');
          proc.kill('SIGKILL');
        }
      }, 5_000);
    }, timeoutMs);

    proc.on('close', (code) => {
      currentProcess = null;
      clearTimeout(timer);
      if (liveLogFd !== undefined) {
        try { fs.closeSync(liveLogFd); } catch { /* ignore */ }
      }
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        duration: Math.round((Date.now() - startTime) / 1000),
      });
    });

    proc.on('error', (err) => {
      currentProcess = null;
      clearTimeout(timer);
      if (liveLogFd !== undefined) {
        try { fs.closeSync(liveLogFd); } catch { /* ignore */ }
      }
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + '\n' + err.message,
        duration: Math.round((Date.now() - startTime) / 1000),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Error pattern matching
// ---------------------------------------------------------------------------

const IMMEDIATE_ESCALATION_PATTERNS = [
  /context_window_exceeded/i,
  /signal:\s*9/i,
  /signal:\s*SIGKILL/i,
];

const RATE_LIMIT_PATTERN = /rate_limit/i;

function matchErrorPattern(output) {
  const failureOutput = failureEvidenceOutput(output);
  for (const pattern of IMMEDIATE_ESCALATION_PATTERNS) {
    if (pattern.test(failureOutput)) return { action: 'escalate', pattern: pattern.source };
  }
  const terminalEvent = extractTerminalEventFromStream(output);
  const terminalCode = getEventFailureCode(terminalEvent);
  const terminalMessage = getEventMessage(terminalEvent);
  // error_max_turns is semantically distinct from rate-limiting: the session
  // exhausted its turn budget, not a rate cap. Detect via parsed JSON (stream
  // result) before the rate-limit regex so the "Rate limited. Waiting 60s..."
  // branch never fires for a max-turns exit.
  if (terminalCode === 'error_max_turns' || /error_max_turns/i.test(terminalMessage)) {
    return { action: 'max_turns', pattern: 'error_max_turns' };
  }
  if (RATE_LIMIT_PATTERN.test(failureOutput) || RATE_LIMIT_PATTERN.test(terminalMessage)) return { action: 'wait', pattern: 'rate_limit' };
  return null;
}

// ---------------------------------------------------------------------------
// Soft failure detection (exit code 0 but step did not succeed)
// ---------------------------------------------------------------------------

// Legacy tool names that are benign when denied — older cached plugin
// versions may still attempt them but recover. These should NOT trigger soft
// failure escalation.
const BENIGN_DENIED_TOOLS = new Set(['request_user_input', 'plan approval']);

// OS temp directory — resolved once at startup. Permission denials targeting
// paths inside this directory are treated as benign because SDLC skills
// routinely create ephemeral test scaffolds there (see steering/structure.md
// "Test Project Scaffolding"). The subprocess sandbox blocks writes outside
// the project root, so scaffold writes get denied even under
// --dangerously-skip-permissions. The model recovers from these denials and
// the step still completes; escalating on them halts otherwise-successful runs.
const OS_TMPDIR = os.tmpdir();

// Known text-based failure patterns — detected in raw stdout when JSON checks
// find no failure indicators.  Each entry has a regex and a human-readable label
// used in the soft-failure reason string and status log messages.
const GITHUB_ACCESS_PATTERN = /error connecting to api\.github\.com/i;
const GITHUB_STATUS_HINT_PATTERN = /check your internet connection or https:\/\/githubstatus\.com/i;

const TEXT_FAILURE_PATTERNS = [
  { pattern: /plan approval/i, label: 'plan approval' },
  { pattern: /^request_user_input is not supported in exec mode$/im, label: 'request_user_input unsupported in exec mode' },
  { pattern: /request_user_input.*unattended-mode/i, label: 'request_user_input in unattended-mode' },
];

function matchTextFailure(text, labels = null) {
  if (!text) return null;
  for (const { pattern, label } of TEXT_FAILURE_PATTERNS) {
    if (labels && !labels.has(label)) continue;
    if (pattern.test(text)) {
      return { isSoftFailure: true, reason: `text_pattern: ${label}` };
    }
  }
  return null;
}

function nonJsonLines(output) {
  if (!output || typeof output !== 'string') return [];
  return output.split('\n').filter(line => {
    if (!line.trim()) return false;
    try {
      JSON.parse(line);
      return false;
    } catch {
      return true;
    }
  });
}

function isDirectGithubAccessLine(line, nextLine = '') {
  const trimmed = line.trim();
  if (!GITHUB_ACCESS_PATTERN.test(trimmed)) return false;
  if (/^error connecting to api\.github\.com$/i.test(trimmed)) return true;
  if (/^(gh|github|error|fatal):/i.test(trimmed)) return true;
  return GITHUB_STATUS_HINT_PATTERN.test(nextLine);
}

function isTerminalFailureEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'turn.failed') return true;
  if (event.error) return true;
  if (event.subtype && event.subtype !== 'success') return true;
  return false;
}

function isToolOriginatedEvent(event) {
  if (!event || typeof event !== 'object') return false;
  const type = typeof event.type === 'string' ? event.type : '';
  const itemType = typeof event.item?.type === 'string' ? event.item.type : '';
  return /tool|exec|command|function_call_output/i.test(type) ||
    /tool|exec|command|function_call_output/i.test(itemType) ||
    Boolean(event.tool_name || event.tool_call_id);
}

function matchGithubAccessFailure(output) {
  const failureOutput = failureEvidenceOutput(output);
  const events = parseJsonEvents(failureOutput);
  for (const event of events) {
    if (!GITHUB_ACCESS_PATTERN.test(JSON.stringify(event))) continue;
    if (isTerminalFailureEvent(event) || isToolOriginatedEvent(event)) {
      return { isSoftFailure: true, reason: 'text_pattern: github_access' };
    }
  }

  const lines = nonJsonLines(failureOutput);
  for (let i = 0; i < lines.length; i++) {
    if (isDirectGithubAccessLine(lines[i], lines[i + 1] || '')) {
      return { isSoftFailure: true, reason: 'text_pattern: github_access' };
    }
  }

  return null;
}

function getToolName(denial) {
  return typeof denial === 'object' && denial !== null ? denial.tool_name : String(denial);
}

// Fields on `tool_input` that carry filesystem paths or shell commands. We
// check these directly rather than serializing the whole object — a substring
// match against a stringified object can false-positive on unrelated fields.
const DENIAL_PATH_FIELDS = ['file_path', 'notebook_path', 'path', 'command'];

function isEphemeralScaffoldDenial(denial) {
  if (!denial || typeof denial !== 'object') return false;
  const input = denial.tool_input;
  if (!input || typeof input !== 'object') return false;
  return DENIAL_PATH_FIELDS.some(field => typeof input[field] === 'string' && input[field].includes(OS_TMPDIR));
}

function detectSoftFailure(stdout) {
  const parsed = extractTerminalEventFromStream(stdout);
  if (parsed) {
    const failureCode = getEventFailureCode(parsed);
    const eventMessage = getEventMessage(parsed);
    if (failureCode === 'error_max_turns' || /error_max_turns/i.test(eventMessage)) {
      return { isSoftFailure: true, reason: 'error_max_turns' };
    }
    if (parsed.type === 'turn.failed') {
      const reason = eventMessage || failureCode || 'turn.failed';
      return { isSoftFailure: true, reason: `turn_failed: ${reason}` };
    }
    if (Array.isArray(parsed.permission_denials) && parsed.permission_denials.length > 0) {
      // Filter out benign denials: interactive tools the model tried but
      // recovered from, and denials targeting the OS temp directory (expected
      // for skills that create ephemeral test scaffolds).
      const serious = parsed.permission_denials.filter(d => {
        if (BENIGN_DENIED_TOOLS.has(getToolName(d))) return false;
        if (isEphemeralScaffoldDenial(d)) return false;
        return true;
      });
      if (serious.length > 0) {
        return { isSoftFailure: true, reason: `permission_denials: ${serious.map(getToolName).join(', ')}` };
      }
    }

    const textFailure = matchTextFailure(eventMessage);
    if (textFailure) return textFailure;
  }
  // Text-pattern scan: catch failures that produce text output but no JSON
  // indicators. Structured checks above stay authoritative when they find a
  // concrete failure; otherwise the parsed terminal message and raw combined
  // output can still carry child-tool failures that exited 0.
  const githubAccessFailure = matchGithubAccessFailure(stdout);
  if (githubAccessFailure) return githubAccessFailure;
  const textFailure = parsed ? null : matchTextFailure(failureEvidenceOutput(stdout));
  if (textFailure) return textFailure;
  return { isSoftFailure: false };
}

// ---------------------------------------------------------------------------
// Bounce loop detection
// ---------------------------------------------------------------------------

/**
 * Increment the per-cycle bounce counter and check whether the bounce-loop
 * threshold has been exceeded.  Returns true when the caller should escalate.
 */
function incrementBounceCount() {
  bounceCount++;
  if (bounceCount > MAX_BOUNCE_RETRIES) {
    log(`Bounce loop detected: ${bounceCount} step-back transitions exceed threshold ${MAX_BOUNCE_RETRIES}`);
    return true;
  }
  return false;
}

/**
 * Cheap probe for remote-vs-local divergence hints. Returns an object with
 * hints the receiving step can use to act without re-investigating. Purpose
 * is a hint, not a full diagnosis — one git call, no loops.
 */
function probeDivergenceHints(branch) {
  const hints = { remoteCommitsSuperseded: false };
  if (!branch || branch === 'main' || branch === 'master') return hints;
  // Pass the branch as an argv element (no shell) so a hostile ref name cannot
  // smuggle metacharacters into the command. Git's own ref-format rules already
  // forbid most shell metacharacters, but execFileSync removes the class of
  // risk entirely.
  const runGit = (args) => execFileSync('git', args, {
    cwd: PROJECT_PATH, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  try {
    const remoteRef = `origin/${branch}`;
    // Commits reachable from origin/<branch> but not from HEAD — i.e. remote
    // has commits that are no longer in local history (typically after a
    // rebase). If the remote branch does not exist this throws and we fall
    // back to the default "false" hint.
    const localAhead = runGit(['log', `${remoteRef}..HEAD`, '--oneline']);
    const remoteAhead = runGit(['log', `HEAD..${remoteRef}`, '--oneline']);
    hints.remoteCommitsSuperseded = remoteAhead.length > 0;
    hints.localCommitsAhead = localAhead.length > 0;
  } catch {
    // Remote branch doesn't exist or git call failed — leave defaults.
  }
  return hints;
}

/**
 * Capture the current bounce state so the receiving step sees it once via
 * buildCodexArgs. `reason` is one of 'precondition_failed' | 'error_max_turns'.
 */
function setBounceContext({ fromStep, reason, failedCheck, branch }) {
  bounceContext = {
    from: fromStep.key,
    fromStepNumber: fromStep.number,
    reason,
    failedCheck: failedCheck || null,
    divergenceHints: probeDivergenceHints(branch),
  };
}

function clearBounceContext() {
  bounceContext = null;
}

// ---------------------------------------------------------------------------
// Step outcome idempotency detection
// ---------------------------------------------------------------------------

/**
 * Return true when a step's expected outcome is already observable in the
 * repo / GitHub, making a retry unnecessary (and usually harmful). Currently
 * only the merge step is covered — it's the only step whose inner action
 * produces irreversible side-effects (squash-merge + branch delete) before
 * the Codex session might exit non-zero on unrelated follow-up noise.
 *
 * Other steps (spec writing, implement, verify, createPR, monitorCI) are
 * either purely local or idempotent enough that retrying is safe.
 */
function isStepOutcomeSatisfied(step, state) {
  if (step.number !== STEP_NUMBER.merge) return false;
  const issueNum = state.currentIssue;
  if (!issueNum) return false;
  // Look for a merged PR associated with this issue. `gh pr list --search`
  // matches on title/body, and the issue number typically appears in the
  // title ("feat: … (#N)") or body ("Closes #N"). Filter strictly by state
  // to avoid false positives on open PRs.
  try {
    const out = gh(`pr list --state merged --search "${issueNum} in:title,body" --json number,state,title,body --limit 10`);
    const list = JSON.parse(out);
    if (!Array.isArray(list)) return false;
    const pattern = new RegExp(`#${issueNum}(?!\\d)`);
    return list.some(p => p.state === 'MERGED' && (pattern.test(p.title || '') || pattern.test(p.body || '')));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

async function handleFailure(step, result, state) {
  const output = result.stdout + '\n' + result.stderr;

  // 0. Idempotency check: did the step already achieve its outcome before
  // exiting non-zero? The merge step is the canonical example — `gh pr merge`
  // can squash-merge the PR (mutating shared GitHub state and deleting the
  // branch) and then the Codex session exits non-zero on an unrelated
  // follow-up (rate_limit noise, post-merge `gh pr checks` on the
  // auto-switched `main` branch, etc.). Retrying such a step can't redo a
  // completed merge, and precondition probing sees a deleted branch and
  // escalates. When we can confirm the outcome is satisfied, treat the exit
  // as success.
  if (isStepOutcomeSatisfied(step, state)) {
    log(`Step ${step.number} (${step.key}) exited non-zero but outcome is already satisfied — treating as success.`);
    log(`[STATUS] Step ${step.number} (${step.key}) complete (idempotent — outcome was already achieved).`);
    const patch = extractStateFromStep(step, result, state);
    if (patch.lastCompletedStep === undefined) patch.lastCompletedStep = step.number;
    updateState(patch);
    return 'ok';
  }

  // 1. Check for known error patterns
  const patternMatch = matchErrorPattern(output);
  if (patternMatch?.action === 'escalate') {
    log(`Immediate escalation: matched pattern "${patternMatch.pattern}"`);
    await escalate(step, `Matched unrecoverable pattern: ${patternMatch.pattern}`, output);
    return 'escalated';
  }

  if (patternMatch?.action === 'max_turns') {
    // error_max_turns is a turn-budget exhaustion, not rate-limiting. Skip the
    // 60s sleep and fall through to the bounce path so the previous step can
    // re-establish a clean starting state (with structured bounce context).
    log(`Turn budget exhausted on Step ${step.number} (${step.key}). Bouncing to previous step.`);
    log(`[STATUS] Step ${step.number} (${step.key}) exhausted turn budget. Bouncing to previous step.`);
  } else if (patternMatch?.action === 'wait') {
    log('Rate limited. Waiting 60s before retry...');
    log(`[STATUS] Rate limited on Step ${step.number}. Waiting 60s...`);
    await sleep(60_000);
  }

  // 2. Check input artifacts for prior step
  if (step.number > 1) {
    const prevStep = STEPS[step.number - 2];
    const preconds = validatePreconditions(step, state);
    if (!preconds.ok || patternMatch?.action === 'max_turns') {
      if (incrementBounceCount()) {
        await escalate(step, `Bounce loop: ${bounceCount} step-back transitions exceed threshold ${MAX_BOUNCE_RETRIES}`, output);
        return 'escalated';
      }
      const failedCheck = preconds.failedCheck || preconds.reason || (patternMatch?.action === 'max_turns' ? 'turn budget exhausted' : null);
      const reason = patternMatch?.action === 'max_turns' ? 'error_max_turns' : 'precondition_failed';
      setBounceContext({ fromStep: step, reason, failedCheck, branch: state.currentBranch });
      log(`Step ${step.number} (${step.key}) precondition failed: "${failedCheck}". Bouncing to Step ${prevStep.number} (${prevStep.key}). (bounce ${bounceCount}/${MAX_BOUNCE_RETRIES})`);
      log(`[STATUS] Step ${step.number} (${step.key}) bounced to Step ${prevStep.number} (${prevStep.key}). Precondition failed: "${failedCheck}". (bounce ${bounceCount}/${MAX_BOUNCE_RETRIES})`);
      return 'retry-previous';
    }
  }

  // 3. Commit dirty working tree
  autoCommitIfDirty(`chore: save work before retry (step ${step.number})`);

  // 4. Check retry count
  const retries = state.retries || {};
  const count = (retries[step.number] || 0) + 1;
  if (count >= MAX_RETRIES) {
    log(`Step ${step.number} exhausted retries (${count}/${MAX_RETRIES}). Escalating.`);
    await escalate(step, `Exhausted ${MAX_RETRIES} retries`, output);
    return 'escalated';
  }

  // 5. Increment retry and signal to relaunch
  updateState({ retries: { ...retries, [step.number]: count } });
  log(`[STATUS] Step ${step.number} failed (attempt ${count}/${MAX_RETRIES}). Retrying...`);
  log(`Retry ${count}/${MAX_RETRIES} for step ${step.number}`);
  return 'retry';
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

async function escalate(step, reason, output = '') {
  const state = readState();
  const truncated = (output || '').slice(-500);

  // Track escalated issues and consecutive escalation count
  if (state.currentIssue) escalatedIssues.add(state.currentIssue);
  consecutiveEscalations++;

  if (consecutiveEscalations >= MAX_CONSECUTIVE_ESCALATIONS) {
    await haltFailureLoop('consecutive escalations', [
      `Issues: ${[...escalatedIssues].map(i => `#${i}`).join(', ')}`,
      `Last step: ${step.number} (${step.key})`,
      `Reason: ${reason}`,
      truncated ? `Last output: ...${truncated}` : '',
    ]);
  }

  cleanupProcesses();

  log(`ESCALATION: Step ${step.number} — ${reason}`);

  // Commit/push partial work
  autoCommitIfDirty('chore: save partial work before escalation');

  // Post diagnostic
  const diagnostic = [
    `ESCALATION: Step ${step.number} (${step.key}) failed.`,
    `Reason: ${reason}`,
    `Retries: ${JSON.stringify(state.retries)}`,
    `Branch: ${state.currentBranch}`,
    `Issue: ${state.currentIssue || 'none'}`,
    truncated ? `Last output: ...${truncated}` : '',
    'Manual intervention required.',
  ].filter(Boolean).join('\n');

  log(`[STATUS] ${diagnostic}`);

  // Preserve issue/branch state for manual recovery. The main loop treats any
  // issue-level escalation as terminal for this invocation, so do not reset the
  // state into a clean next-cycle boundary.

  // In single-issue mode, exit immediately on escalation — no next cycle
  if (SINGLE_ISSUE_NUMBER) {
    removeUnattendedMode();
    process.exit(1);
  }
}

/**
 * Halt the runner due to a detected failure loop.
 * Does NOT call removeUnattendedMode(), updateState(), or git checkout —
 * preserves all state for manual inspection.
 */
async function haltFailureLoop(loopType, details) {
  const diagnostic = [
    `FAILURE LOOP DETECTED: ${loopType}`,
    ...details,
    `Consecutive escalations: ${consecutiveEscalations}`,
    `Escalated issues: ${escalatedIssues.size > 0 ? [...escalatedIssues].map(i => `#${i}`).join(', ') : 'none'}`,
    'State preserved for manual inspection.',
  ].filter(Boolean).join('\n');

  log(diagnostic);
  cleanupProcesses();
  log(`[STATUS] ${diagnostic}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Post-step state extraction
// ---------------------------------------------------------------------------

function extractStateFromStep(step, result, state) {
  const output = result.stdout;
  const patch = {};

  if (step.number === STEP_NUMBER.startCycle) {
    // After checkout main, reset cycle state
    patch.currentIssue = null;
    patch.currentBranch = 'main';
    patch.featureName = null;
    patch.retries = {};
  }

  if (step.number === STEP_NUMBER.startIssue) {
    // Detect branch first — more reliable than parsing Agent output
    try {
      const branch = git('rev-parse --abbrev-ref HEAD');
      if (branch !== 'main') {
        patch.currentBranch = branch;
        // Extract issue number from branch name (e.g. "42-feature-slug")
        const branchIssue = branch.match(/^(\d+)-/);
        if (branchIssue) patch.currentIssue = parseInt(branchIssue[1], 10);
      }
    } catch { /* ignore */ }

    // If branch-based extraction failed, log a warning — do NOT fall back to
    // regex on conversation output, which can match stale issue numbers (#62)
    if (!patch.currentIssue) {
      log('Warning: branch-based issue extraction failed after startIssue — currentIssue will be null');
    }
  }

  if (step.number === STEP_NUMBER.writeSpecs) {
    // Try to detect the feature name from specs directory
    const specsDir = path.join(PROJECT_PATH, 'specs');
    const featureDir = findFeatureDir(specsDir, state.featureName, slugFromBranch(state.currentBranch), {
      strict: true,
      issueNumber: state.currentIssue,
    });
    if (featureDir) {
      patch.featureName = path.basename(featureDir);
    }
  }

  if (step.number === STEP_NUMBER.createPR) {
    // Try to extract PR number from output
    const prMatch = output.match(/pull\/(\d+)/);
    if (prMatch) patch.prNumber = parseInt(prMatch[1], 10);
  }

  if (step.number === STEP_NUMBER.merge) {
    // Merged — reset for next cycle
    patch.currentStep = 0;
    patch.lastCompletedStep = 0;
    patch.currentIssue = null;
    patch.currentBranch = 'main';
    patch.featureName = null;
    patch.retries = {};
  }

  return patch;
}

// ---------------------------------------------------------------------------
// Check for remaining open issues
// ---------------------------------------------------------------------------

function hasOpenIssues() {
  try {
    const issues = gh('issue list --state open --limit 1 --json number');
    const parsed = JSON.parse(issues);
    return parsed.length > 0;
  } catch {
    log('Warning: could not check for open issues. Assuming there are some.');
    return true;
  }
}

function hasNonEscalatedIssues() {
  try {
    const issues = gh('issue list --state open --limit 200 --json number');
    const parsed = JSON.parse(issues);
    return parsed.some(i => !escalatedIssues.has(i.number));
  } catch {
    log('Warning: could not check for non-escalated issues. Assuming there are some.');
    return true;
  }
}

// ---------------------------------------------------------------------------
// Milestone + topological issue selection
// ---------------------------------------------------------------------------

const DEPENDENCY_BODY_RE = /(Depends on|Blocks):\s*#(\d+)\b/gi;

/**
 * Pick the alphabetically-first open milestone with open issues.
 * Returns null if none found or on error.
 */
function selectMilestone(opts = {}) {
  const ghRunner = opts.ghRunner || gh;
  try {
    const raw = ghRunner(
      "api repos/{owner}/{repo}/milestones --jq '[.[] | select(.open_issues > 0) | {title: .title, open_issues: .open_issues}] | sort_by(.title)'"
    );
    const milestones = JSON.parse(raw);
    if (!Array.isArray(milestones) || milestones.length === 0) return null;
    return milestones[0].title;
  } catch (err) {
    log(`Warning: could not fetch milestones: ${err.message}`);
    return null;
  }
}

/**
 * Select the next ready issue from a milestone, respecting topological order
 * derived from `Depends on: #N` / `Blocks: #N` body cross-refs and the GitHub
 * sub-issue parent field.
 *
 * @param {string|null} milestone  Milestone title, or null for repo-wide.
 * @param {object} opts
 * @param {(args: string) => string} [opts.ghRunner]  Injectable `gh` runner for tests.
 * @param {Set<number>} [opts.excluded]  Issue numbers to skip (e.g., escalated).
 * @returns {{ issue: number|null, blockedIssues: Array<{issue: number, blockers: number[]}> }}
 *
 * An issue is "ready" when every `Depends on` / `Blocks` / parent link either
 * points outside the milestone pool (treated as satisfied) or points to an
 * issue that is CLOSED with at least one merged PR in
 * `closedByPullRequestsReferences`. Lowest-numbered ready issue wins.
 */
function selectNextIssueFromMilestone(milestone, opts = {}) {
  const ghRunner = opts.ghRunner || gh;
  const excluded = opts.excluded instanceof Set ? opts.excluded : new Set();

  const listCmd = [
    'issue list -s open',
    milestone ? `-m ${shellEscape(milestone)}` : '',
    '--label automatable -L 50 --json number',
  ].filter(Boolean).join(' ');

  let candidates;
  try {
    const raw = ghRunner(listCmd);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('gh issue list returned non-array');
    candidates = parsed
      .map((i) => Number(i.number))
      .filter((n) => Number.isInteger(n) && n > 0 && !excluded.has(n))
      .sort((a, b) => a - b);
  } catch (err) {
    throw new Error(`Failed to list milestone issues: ${err.message}`);
  }

  if (candidates.length === 0) {
    return { issue: null, blockedIssues: [] };
  }

  const details = new Map();
  const fetchFailed = new Set();
  for (const n of candidates) {
    try {
      const raw = ghRunner(
        `issue view ${n} --json number,state,body,closedByPullRequestsReferences`
      );
      details.set(n, JSON.parse(raw));
    } catch (err) {
      log(`Warning: could not fetch issue #${n} details: ${err.message}`);
      details.set(n, { number: n, state: 'OPEN', body: '', parent: null, closedByPullRequestsReferences: [] });
      fetchFailed.add(n);
    }
  }

  const depMap = new Map(candidates.map((n) => [n, new Set()]));
  for (const [n, d] of details) {
    const deps = depMap.get(n) || new Set();
    const body = typeof d.body === 'string' ? d.body : '';
    for (const match of body.matchAll(DEPENDENCY_BODY_RE)) {
      const relation = match[1].toLowerCase();
      const dep = Number(match[2]);
      if (!Number.isInteger(dep) || dep <= 0 || dep === n) continue;
      if (relation === 'depends on') {
        deps.add(dep);
      } else if (relation === 'blocks' && depMap.has(dep)) {
        depMap.get(dep).add(n);
      }
    }
    if (d.parent && typeof d.parent.number === 'number' && d.parent.number !== n) {
      deps.add(d.parent.number);
    }
  }

  const milestoneSet = new Set(candidates);
  const blockedIssues = [];
  const ready = [];

  for (const n of candidates) {
    if (fetchFailed.has(n)) {
      blockedIssues.push({ issue: n, blockers: [], reason: 'fetch-failed' });
      continue;
    }
    const deps = depMap.get(n) || new Set();
    const blockers = [];
    for (const dep of deps) {
      if (!milestoneSet.has(dep)) continue; // external — assumed satisfied
      const depDetails = details.get(dep);
      if (!depDetails) { blockers.push(dep); continue; }
      const prs = Array.isArray(depDetails.closedByPullRequestsReferences)
        ? depDetails.closedByPullRequestsReferences
        : [];
      const isMerged = depDetails.state === 'CLOSED' &&
        prs.some((pr) => pr && (pr.state === 'MERGED' || pr.mergedAt != null));
      if (!isMerged) blockers.push(dep);
    }
    if (blockers.length === 0) ready.push(n);
    else blockedIssues.push({ issue: n, blockers: blockers.sort((a, b) => a - b) });
  }

  return {
    issue: ready.length > 0 ? ready[0] : null,
    blockedIssues,
  };
}

// Set by runStep() when pre-selecting the next issue in JS; cleared after
// the startIssue step completes. Used by buildCodexArgs to emit the simple
// "Start issue #N" prompt instead of the prompt-driven selection path.
let preSelectedIssue = null;

// ---------------------------------------------------------------------------
// Spec validation gate (post-step-3)
// ---------------------------------------------------------------------------

/**
 * Validate spec file content structure after file-existence checks pass.
 * Returns { ok: boolean, issues: string[] } with per-file, per-check detail.
 */
function validateSpecContent(featureDir) {
  const issues = [];

  // Validate requirements.md
  try {
    const reqContent = fs.readFileSync(path.join(featureDir, 'requirements.md'), 'utf8');
    if (!/\*\*Issues?\*\*\s*:/.test(reqContent)) {
      issues.push('requirements.md: missing **Issues**: frontmatter');
    }
    if (!/^### AC\d/m.test(reqContent)) {
      issues.push('requirements.md: no ### AC heading found');
    }
  } catch (err) {
    issues.push(`requirements.md: read error — ${err.message}`);
  }

  // Validate tasks.md
  try {
    const taskContent = fs.readFileSync(path.join(featureDir, 'tasks.md'), 'utf8');
    if (!/^### T\d/m.test(taskContent)) {
      issues.push('tasks.md: no task heading (### T) found');
    }
  } catch (err) {
    issues.push(`tasks.md: read error — ${err.message}`);
  }

  return { ok: issues.length === 0, issues };
}

function validateSpecs(state) {
  const specsDir = path.join(PROJECT_PATH, 'specs');
  const featureDir = findFeatureDir(specsDir, state.featureName, slugFromBranch(state.currentBranch), {
    strict: true,
    issueNumber: state.currentIssue,
  });

  if (!featureDir) {
    return { ok: false, missing: ['feature directory'] };
  }

  const missing = checkRequiredSpecFiles(featureDir);
  if (missing.length > 0) {
    return { ok: false, missing };
  }

  // Content structure validation (only runs when all files exist with non-zero size)
  const contentCheck = validateSpecContent(featureDir);
  if (!contentCheck.ok) {
    return { ok: false, missing: contentCheck.issues };
  }

  // Update feature name in state if we found it
  const featureName = path.basename(featureDir);
  if (featureName !== state.featureName) {
    updateState({ featureName });
  }

  return { ok: true, missing: [] };
}

// ---------------------------------------------------------------------------
// CI validation gate (post-monitorCI)
// ---------------------------------------------------------------------------

function checksIndicateFailure(checks) {
  return /\b(fail|failed|failure|error|cancelled|canceled|timed[_ -]?out|timed out)\b/i.test(checks || '');
}

function checksIndicatePending(checks) {
  return /\b(pending|queued|waiting|in[_ -]?progress|in progress|expected|requested)\b/i.test(checks || '');
}

function validateCI() {
  try {
    const checks = gh('pr checks');
    if (checksIndicateFailure(checks)) {
      return { ok: false, reason: `CI checks still failing after Step ${STEP_NUMBER.monitorCI}` };
    }
    if (checksIndicatePending(checks)) {
      return { ok: false, reason: `CI checks still pending after Step ${STEP_NUMBER.monitorCI}` };
    }
    return { ok: true };
  } catch (err) {
    if (/no checks reported/i.test(err.stderr || err.message || '')) {
      return { ok: true };
    }
    return { ok: false, reason: `Could not check CI status: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Push validation gate (post-step-6)
// ---------------------------------------------------------------------------

function validatePush() {
  try {
    const branch = git('rev-parse --abbrev-ref HEAD');
    git('fetch');
    const unpushed = git(`log origin/${branch}..HEAD --oneline`);
    if (unpushed) {
      return { ok: false, reason: 'Unpushed commits remain after push' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Push validation check failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Version bump validation gate (post-step-7)
// ---------------------------------------------------------------------------

function validateVersionBump() {
  const versionPath = path.join(PROJECT_PATH, 'VERSION');
  if (!fs.existsSync(versionPath)) return { ok: true }; // no VERSION file → skip

  // Check if VERSION contains valid semver
  const version = fs.readFileSync(versionPath, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    log('Warning: VERSION file does not contain valid semver, skipping version bump check');
    return { ok: true };
  }

  // Check if VERSION changed vs main
  try {
    const diff = git('diff main -- VERSION');
    if (diff) return { ok: true }; // VERSION changed — bump was done
    return { ok: false, reason: 'VERSION file unchanged relative to main' };
  } catch (err) {
    log(`Warning: could not diff VERSION against main: ${err.message}`);
    return { ok: true }; // can't verify → skip
  }
}

// ---------------------------------------------------------------------------
// Deterministic version bump (recovery when LLM skips the bump)
// ---------------------------------------------------------------------------

/**
 * Classify the version bump type from issue labels.
 * Reads the classification matrix from steering/tech.md if available,
 * falls back to hardcoded defaults (bug→patch, else→minor).
 */
function classifyBumpType(labels, projectPath) {
  const techMdPath = path.join(projectPath, 'steering', 'tech.md');

  if (!fs.existsSync(techMdPath)) {
    return labels.includes('bug') ? 'patch' : 'minor';
  }

  try {
    const content = fs.readFileSync(techMdPath, 'utf8');
    const versioningSection = content.match(/## Versioning\s*\n([\s\S]*?)(?=\n## |\n$|$)/);
    if (!versioningSection) {
      return labels.includes('bug') ? 'patch' : 'minor';
    }

    const classSection = versioningSection[1].match(/### Version Bump Classification\s*\n([\s\S]*?)(?=\n### |\n## |$)/);
    if (!classSection) {
      return labels.includes('bug') ? 'patch' : 'minor';
    }

    // Parse the markdown table into a label→bump map
    const rows = classSection[1].match(/\|[^|\n]+\|[^|\n]+\|/g) || [];
    const classMap = new Map();
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2 && cells[0] !== 'Label' && !cells[0].startsWith('-')) {
        classMap.set(cells[0].replace(/`/g, '').toLowerCase(), cells[1].toLowerCase().trim());
      }
    }

    for (const label of labels) {
      const bump = classMap.get(label.toLowerCase());
      if (bump) return bump;
    }
    return 'minor';
  } catch (err) {
    log(`Warning: could not read tech.md classification: ${err.message}`);
    return labels.includes('bug') ? 'patch' : 'minor';
  }
}

function performDeterministicVersionBump(state) {
  const versionPath = path.join(PROJECT_PATH, 'VERSION');

  // Guard: VERSION file must exist and contain valid semver
  if (!fs.existsSync(versionPath)) {
    log('performDeterministicVersionBump: no VERSION file, skipping');
    return false;
  }

  const currentVersion = fs.readFileSync(versionPath, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(currentVersion)) {
    log(`performDeterministicVersionBump: invalid semver "${currentVersion}", skipping`);
    return false;
  }

  const [major, minor, patch] = currentVersion.split('.').map(Number);
  const issue = state.currentIssue;

  if (!issue) {
    log('performDeterministicVersionBump: no current issue, skipping');
    return false;
  }

  try {
    // Get issue labels
    let labels = [];
    try {
      const labelOutput = gh(`issue view ${issue} --json labels --jq '.labels[].name'`);
      labels = labelOutput.split('\n').map(l => l.trim()).filter(Boolean);
    } catch (err) {
      log(`Warning: could not read issue labels: ${err.message}`);
    }

    const bumpType = classifyBumpType(labels, PROJECT_PATH);

    let newVersion;
    if (bumpType === 'patch') {
      newVersion = `${major}.${minor}.${patch + 1}`;
    } else {
      // minor (default) or any other non-patch bump type
      newVersion = `${major}.${minor + 1}.0`;
    }

    log(`Deterministic version bump: ${currentVersion} → ${newVersion}`);

    if (DRY_RUN) {
      log(`[DRY-RUN] Would bump version to ${newVersion}`);
      return true;
    }

    // 1. Update VERSION file
    fs.writeFileSync(versionPath, newVersion + '\n');

    // 2. Update CHANGELOG.md if it exists
    const changelogPath = path.join(PROJECT_PATH, 'CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      try {
        let changelog = fs.readFileSync(changelogPath, 'utf8');
        const today = new Date().toISOString().slice(0, 10);
        changelog = changelog.replace(
          /## \[Unreleased\]/,
          `## [Unreleased]\n\n## [${newVersion}] - ${today}`
        );
        fs.writeFileSync(changelogPath, changelog);
      } catch (err) {
        log(`Warning: could not update CHANGELOG.md: ${err.message}`);
      }
    }

    // 3. Update stack-specific files from steering/tech.md
    const techMdPath = path.join(PROJECT_PATH, 'steering', 'tech.md');
    if (fs.existsSync(techMdPath)) {
      try {
        const techMd = fs.readFileSync(techMdPath, 'utf8');
        const versioningMatch = techMd.match(/## Versioning\s*\n([\s\S]*?)(?=\n### |\n## |\n$|$)/);
        if (versioningMatch) {
          // Parse table rows: | file | dot.path |
          const tableRows = versioningMatch[1].match(/\|[^|\n]+\|[^|\n]+\|/g) || [];
          for (const row of tableRows) {
            const cells = row
              .split('|')
              .map(c => c.trim().replace(/^`|`$/g, ''))
              .filter(Boolean);
            if (cells.length < 2 || cells[0] === 'File' || cells[0].startsWith('-')) continue;

            const filePath = path.join(PROJECT_PATH, cells[0]);
            const dotPath = cells[1];

            if (!fs.existsSync(filePath)) {
              log(`Warning: versioned file not found: ${cells[0]}`);
              continue;
            }

            try {
              if (filePath.endsWith('.json')) {
                // JSON: parse, update dot-path (supports arr[0] indexing), write back
                const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const navigate = (root, segments, setOnLast) => {
                  let obj = root;
                  for (let i = 0; i < segments.length; i++) {
                    const seg = segments[i];
                    const parts = [];
                    const re = /([^\[\]]+)|\[(\d+)\]/g;
                    let m;
                    while ((m = re.exec(seg)) !== null) {
                      parts.push(m[1] !== undefined ? m[1] : Number(m[2]));
                    }
                    for (let j = 0; j < parts.length; j++) {
                      const isLast = i === segments.length - 1 && j === parts.length - 1;
                      if (isLast && setOnLast) {
                        obj[parts[j]] = newVersion;
                        return true;
                      }
                      obj = obj[parts[j]];
                      if (obj == null) return false;
                    }
                  }
                  return false;
                };
                if (navigate(json, dotPath.split('.'), true)) {
                  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
                }
              } else if (filePath.endsWith('.toml')) {
                // TOML: regex replace the version value at the dot-path
                let content = fs.readFileSync(filePath, 'utf8');
                const lastKey = dotPath.split('.').pop();
                const pattern = new RegExp(`(${lastKey}\\s*=\\s*")([^"]*)(")`, 'g');
                content = content.replace(pattern, `$1${newVersion}$3`);
                fs.writeFileSync(filePath, content);
              } else {
                // Plain text: replace version string
                let content = fs.readFileSync(filePath, 'utf8');
                content = content.replace(currentVersion, newVersion);
                fs.writeFileSync(filePath, content);
              }
            } catch (err) {
              log(`Warning: could not update ${cells[0]}: ${err.message}`);
            }
          }
        }
      } catch (err) {
        log(`Warning: could not parse tech.md versioning section: ${err.message}`);
      }
    }

    // 4. Commit and push
    git('add -A');
    git(`commit -m ${shellEscape(`chore: bump version to ${newVersion}`)}`);
    git('push');

    log(`Deterministic version bump committed and pushed: ${newVersion}`);
    return true;
  } catch (err) {
    log(`Warning: performDeterministicVersionBump failed: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Signal handling (graceful shutdown)
// ---------------------------------------------------------------------------

let currentProcess = null;
let lastCodexPid = null;
let shuttingDown = false;

function handleSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}. Shutting down gracefully...`);

  // Kill current subprocess
  if (currentProcess && !currentProcess.killed) {
    currentProcess.kill('SIGTERM');
  }

  cleanupProcesses();

  // Commit/push any work
  autoCommitIfDirty(`chore: save work on signal ${signal}`);

  const savedState = readState();
  const nextStep = (savedState.lastCompletedStep || 0) + 1;
  log(`[STATUS] SDLC runner stopped (${signal}). Work saved. Resume with --resume to continue from Step ${nextStep}.`);
  // Preserve lastCompletedStep for resume — don't reset step tracking.
  // Mark signalShutdown so detectAndHydrateState knows the saved commit was
  // WIP, not a completed open-pr delivery step.
  updateState({ runnerPid: null, signalShutdown: true });
  removeUnattendedMode();
  process.exit(0);
}

process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.on('SIGINT', () => handleSignal('SIGINT'));

function resolveMainLoopAction(result, step) {
  if (result === 'escalated') {
    return {
      action: 'stop-runner',
      logMessage: 'Escalation triggered. Stopping runner.',
      removeUnattendedMode: true,
      exitCode: 1,
    };
  }

  if (result === 'skip') {
    return {
      action: 'skip',
      logMessage: `Skipping step ${step.number}`,
      removeUnattendedMode: false,
    };
  }

  if (result === 'done') {
    return {
      action: 'stop-runner',
      logMessage: null,
      removeUnattendedMode: false,
    };
  }

  return {
    action: 'continue',
    logMessage: null,
    removeUnattendedMode: false,
  };
}


// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

/**
 * Run a post-step validation gate. If the validator fails, retry or escalate
 * using the standard pattern shared by steps 3, 6, and 8.
 * Returns null if validation passed, or a step result string ('retry'|'escalated').
 */
async function runValidationGate(step, state, validateFn, label) {
  const check = validateFn();
  if (check.ok) return null;

  const reason = check.reason || check.missing?.join(', ') || 'unknown';
  log(`${label} failed: ${reason}`);
  log(`[STATUS] ${label} failed after Step ${step.number} — ${reason}. Retrying...`);

  const retries = state.retries || {};
  const count = (retries[step.number] || 0) + 1;
  if (count >= MAX_RETRIES) {
    await escalate(step, `${label} failed after ${MAX_RETRIES} attempts`);
    return 'escalated';
  }
  updateState({ retries: { ...retries, [step.number]: count } });
  return 'retry';
}

async function runStep(step, state) {
  log(`=== Step ${step.number}: ${step.key} ===`);

  // Validate preconditions
  const preconds = validatePreconditions(step, state);
  if (!preconds.ok) {
    const failedCheck = preconds.failedCheck || preconds.reason;
    log(`Preconditions failed for step ${step.number} (${step.key}): "${failedCheck}"`);
    log(`[STATUS] Step ${step.number} (${step.key}) preconditions failed: "${failedCheck}"`);

    if (step.number === STEP_NUMBER.startCycle) {
      await haltFailureLoop('start-cycle precondition failed', [
        `Step 1 cannot run safely: ${failedCheck}`,
        preconds.reason,
      ].filter(Boolean));
      return 'escalated';
    }

    if (step.number > 1) {
      const prevStep = STEPS[step.number - 2];
      if (incrementBounceCount()) {
        await escalate(prevStep, `Bounce loop: ${bounceCount} step-back transitions exceed threshold ${MAX_BOUNCE_RETRIES} (precondition: ${failedCheck})`);
        return 'escalated';
      }
      setBounceContext({ fromStep: step, reason: 'precondition_failed', failedCheck, branch: state.currentBranch });
      log(`Step ${step.number} (${step.key}) bounced to Step ${prevStep.number} (${prevStep.key}). Precondition failed: "${failedCheck}". (bounce ${bounceCount}/${MAX_BOUNCE_RETRIES})`);
      log(`[STATUS] Step ${step.number} (${step.key}) bounced to Step ${prevStep.number} (${prevStep.key}). Precondition failed: "${failedCheck}". (bounce ${bounceCount}/${MAX_BOUNCE_RETRIES})`);
      // Increment retry for the previous step
      const retries = state.retries || {};
      const prevCount = (retries[prevStep.number] || 0) + 1;
      if (prevCount >= MAX_RETRIES) {
        await escalate(prevStep, `Precondition check for step ${step.number} failed ${MAX_RETRIES} times: ${preconds.reason}`);
        return 'escalated';
      }
      updateState({
        currentStep: prevStep.number,
        retries: { ...retries, [prevStep.number]: prevCount },
      });
      return 'retry-previous';
    }
    return 'skip';
  }

  // Update state
  state = updateState({ currentStep: step.number });
  log(`[STATUS] Starting Step ${step.number}: ${step.key}${state.currentIssue ? ` (issue #${state.currentIssue})` : ''}...`);

  // Pre-select the next issue in JS for startIssue when not in single-issue or dry-run mode.
  // Builds a dependency graph fresh from live `gh` state each cycle per the
  // retrospective learning about stale cache contamination — never cached in sdlc-state.json.
  preSelectedIssue = null;
  if (step.number === STEP_NUMBER.startIssue && !SINGLE_ISSUE_NUMBER && !DRY_RUN) {
    try {
      const milestone = selectMilestone();
      const { issue, blockedIssues } = selectNextIssueFromMilestone(milestone, { excluded: escalatedIssues });

      const describeBlockers = (entry) => entry.reason === 'fetch-failed'
        ? 'gh fetch failed'
        : entry.blockers.map((b) => `#${b}`).join(', ');

      for (const entry of blockedIssues) {
        log(`[runner] skipping #${entry.issue} — blocked by unmerged dependencies: ${describeBlockers(entry)}`);
      }

      if (issue === null && blockedIssues.length > 0) {
        const diagnostic = [
          'Every open issue in the milestone is blocked by unmerged dependencies:',
          ...blockedIssues.map((e) => `  #${e.issue} ← blocked by ${describeBlockers(e)}`),
        ];
        for (const line of diagnostic) console.error(line);
        await haltFailureLoop('all issues blocked', diagnostic);
        return 'escalated';
      }

      if (issue !== null) {
        preSelectedIssue = issue;
        log(`[runner] pre-selected issue #${issue} from milestone "${milestone || '(repo-wide)'}"`);
      } else {
        const diagnostic = `No automatable issues found in ${milestone ? `milestone "${milestone}"` : 'the repository'}. SDLC runner complete.`;
        log(diagnostic);
        log(`[STATUS] ${diagnostic}`);
        updateState({ currentStep: 0, lastCompletedStep: 0 });
        removeUnattendedMode();
        return 'done';
      }
    } catch (err) {
      log(`Warning: pre-selection failed (${err.message}); falling back to prompt-driven selection`);
    }
  }

  // Run Codex
  let result;
  result = await runCodex(step, state);
  log(`Step ${step.number} exited with code ${result.exitCode} in ${result.duration}s`);
  writeStepLog(step.key, result);
  cleanupProcesses();

  if (result.exitCode === 0) {
    // Check for soft failures (exit code 0 but step did not succeed)
    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const softFailure = detectSoftFailure(combinedOutput);
    if (softFailure.isSoftFailure) {
      log(`Soft failure detected: ${softFailure.reason}`);
      log(`[STATUS] Step ${step.number} (${step.key}) soft failure: ${softFailure.reason}`);
      return await handleFailure(step, result, state);
    }

    // Extract state updates
    const patch = extractStateFromStep(step, result, state);
    // Step 2 postcondition: a feature branch must be checked out. Check this
    // before persisting lastCompletedStep so a failed handoff cannot leave
    // runner state that implies Step 2 succeeded.
    if (step.number === STEP_NUMBER.startIssue) {
      const nextIssue = patch.currentIssue ?? state.currentIssue;
      const nextBranch = patch.currentBranch ?? state.currentBranch;
      if (!nextIssue || !nextBranch || nextBranch === 'main') {
        log('Soft failure detected: step 2 exited 0 but no feature branch was created');
        log(`[STATUS] Step 2 (startIssue) soft failure: no feature branch created (HEAD on ${nextBranch || 'main'})`);
        return await handleFailure(step, result, state);
      }
    }

    // Track completed step for resume (merge resets this to 0 via its own patch)
    if (patch.lastCompletedStep === undefined) {
      patch.lastCompletedStep = step.number;
    }
    state = updateState(patch);

    // Special: spec validation gate after writeSpecs
    if (step.number === STEP_NUMBER.writeSpecs) {
      const gate = await runValidationGate(step, state, () => validateSpecs(state), 'Spec validation');
      if (gate) return gate;
    }

    // Special: delivery validation gates after createPR
    if (step.number === STEP_NUMBER.createPR) {
      const pushGate = await runValidationGate(step, state, validatePush, 'Push validation');
      if (pushGate) return pushGate;

      const versionCheck = validateVersionBump();
      if (!versionCheck.ok) {
        log(`Version bump missing: ${versionCheck.reason}`);
        log(`[STATUS] Version bump missing after Step ${STEP_NUMBER.createPR} — ${versionCheck.reason}. Performing deterministic bump...`);
        const bumped = performDeterministicVersionBump(state);
        if (bumped) {
          log(`[STATUS] Deterministic version bump succeeded. Retrying Step ${STEP_NUMBER.createPR}...`);
          return 'retry';
        } else {
          // Could not bump — warn but don't block PR creation
          log('Warning: deterministic version bump failed, continuing without version bump');
          log('[STATUS] Warning: could not perform deterministic version bump. Continuing.');
        }
      }
    }

    // Auto-commit implementation so the simplify/verify "commits ahead of main" precondition passes
    if (step.number === STEP_NUMBER.implement) {
      const issue = state.currentIssue || 'unknown';
      const committed = autoCommitIfDirty(`feat: implement issue #${issue}`);
      if (committed) {
        log(`[STATUS] Auto-committed implementation changes after Step ${STEP_NUMBER.implement}.`);
      }
    }

    // Special: CI validation gate after monitorCI
    if (step.number === STEP_NUMBER.monitorCI) {
      const gate = await runValidationGate(step, state, validateCI, 'CI validation');
      if (gate) return gate;
    }

    log(`[STATUS] Step ${step.number} (${step.key}) complete.${result.duration > 60 ? ` (${Math.round(result.duration / 60)}min)` : ''}`);
    clearBounceContext();
    return 'ok';
  }

  // Handle failure
  return await handleFailure(step, result, state);
}

async function main() {
  log('SDLC Runner starting...');
  log(`Config: ${configPath}`);
  log(`Project: ${PROJECT_PATH}`);
  const resolvedSkillsBase = resolveUsableSkillsBase();
  log(`Plugin root: ${resolvedSkillsBase} (from ${SKILL_ROOT_SOURCE})`);
  if (SKILL_ROOT_RECOVERY) {
    log(
      `Recovered stale ${SKILL_ROOT_RECOVERY.staleField}="${SKILL_ROOT_RECOVERY.staleValue}" ` +
      `(${SKILL_ROOT_RECOVERY.missingArtifact} missing at ${SKILL_ROOT_RECOVERY.missingPath}); ` +
      `using ${SKILL_ROOT_RECOVERY.recoveredRoot} for this invocation. ` +
      'Run $nmg-sdlc:upgrade-project to repair sdlc-config.json.'
    );
  }
  log(`Model: ${MODEL}`);
  if (EFFORT) log(`Effort: ${EFFORT}`);
  if (DRY_RUN) log('DRY-RUN MODE — no actions will be executed');
  if (SINGLE_STEP) log(`Single step mode: running only step ${SINGLE_STEP}`);
  if (SINGLE_ISSUE_NUMBER) log(`Single issue mode: #${SINGLE_ISSUE_NUMBER}`);
  if (RESUME) log('Resume mode: continuing from existing state');

  // Validate project path exists and is a git repo
  if (!fs.existsSync(PROJECT_PATH)) {
    log(`Error: projectPath does not exist: ${PROJECT_PATH}`);
    process.exit(1);
  }
  try {
    git('rev-parse --is-inside-work-tree');
  } catch {
    log(`Error: projectPath is not a git repository: ${PROJECT_PATH}`);
    process.exit(1);
  }

  // Ensure runner artifacts are gitignored before creating any. In dry-run
  // mode, report the action without mutating the target repository.
  if (DRY_RUN) {
    log('[DRY-RUN] Would ensure runner artifacts are listed in .gitignore');
    log('[DRY-RUN] Would untrack any previously committed runner artifacts');
  } else {
    ensureRunnerArtifactsGitignored();
    untrackRunnerArtifactsIfTracked();
  }

  // Ensure unattended-mode flag exists
  const unattendedModePath = path.join(PROJECT_PATH, '.codex', 'unattended-mode');
  if (DRY_RUN) {
    log('[DRY-RUN] Would ensure .codex/unattended-mode flag exists');
  } else if (!fs.existsSync(unattendedModePath)) {
    const dir = path.dirname(unattendedModePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(unattendedModePath, '');
    log('Created .codex/unattended-mode flag');
  }

  // Detect in-progress work from git state (runs on every startup)
  const detected = detectAndHydrateState();
  let state;

  if (detected && detected._merged) {
    // PR was merged but we were still on the feature branch — start fresh
    state = defaultState();
    writeState(state);
    log('Detected merged PR on feature branch. Checked out main for fresh cycle.');
    log('[STATUS] Detected merged PR — checked out main, starting fresh cycle.');
  } else if (detected) {
    // In-progress work detected from git/filesystem artifacts
    const nextStep = detected.lastCompletedStep + 1;

    // Preserve retry counts from state file if --resume was passed
    if (RESUME && fs.existsSync(STATE_PATH)) {
      const savedState = readState();
      detected.retries = savedState.retries || {};
    } else {
      if (RESUME) log('Warning: --resume specified but state file not found — retry history lost. Starting with empty retry counters.');
      detected.retries = {};
    }

    state = { ...defaultState(), ...detected };
    writeState(state);
    log(`Detected in-progress work: issue #${detected.currentIssue}, branch "${detected.currentBranch}", lastCompletedStep=${detected.lastCompletedStep} — resuming from step ${nextStep}`);
    log(`[STATUS] Detected in-progress work on issue #${detected.currentIssue} (step ${detected.lastCompletedStep} complete). Resuming from Step ${nextStep}.`);
  } else if (RESUME) {
    // No feature branch detected but --resume passed — use state file
    state = readState();
    const nextStep = (state.lastCompletedStep || 0) + 1;
    log(`Resuming: last completed step ${state.lastCompletedStep || 0}, starting from step ${nextStep}. Issue: #${state.currentIssue || 'none'}`);
    log(`[STATUS] SDLC runner resuming from Step ${nextStep}.`);
  } else {
    // Fresh start on main — normal behavior
    state = defaultState();
    writeState(state);
    log('[STATUS] SDLC runner started.');
  }

  // Record PID
  updateState({ runnerPid: process.pid });

  // Single step mode
  if (SINGLE_STEP) {
    const step = STEPS[SINGLE_STEP - 1];
    if (!step) {
      console.error(`Invalid step number: ${SINGLE_STEP}`);
      removeUnattendedMode();
      process.exit(1);
    }
    state = readState();
    const result = await runStep(step, state);
    log(`Single step result: ${result}`);
    removeUnattendedMode();
    process.exit(result === 'ok' ? 0 : 1);
  }

  // Main continuous loop
  while (!shuttingDown) {
    // Check for open issues (skip in single-issue mode — we already know which issue to work on)
    if (!SINGLE_ISSUE_NUMBER && !DRY_RUN && !hasOpenIssues()) {
      log('No more open issues. All done!');
      log('[STATUS] No more open issues in the project. SDLC runner complete.');
      updateState({ currentStep: 0 });
      removeUnattendedMode();
      break;
    }

    // Check if all remaining issues have been escalated this session (skip in single-issue mode)
    if (!SINGLE_ISSUE_NUMBER && !DRY_RUN && escalatedIssues.size > 0 && !hasNonEscalatedIssues()) {
      await haltFailureLoop('all issues escalated', [
        `All open issues have been escalated: ${[...escalatedIssues].map(i => `#${i}`).join(', ')}`,
        'No non-escalated issues remain.',
      ]);
    }

    // Determine starting step
    state = readState();
    let startIdx = 0;
    if (state.lastCompletedStep > 0) {
      // Skip already-completed steps — start from the one after lastCompletedStep
      startIdx = state.lastCompletedStep; // 1-indexed step → 0-indexed array position of next step
      log(`Continuing from step ${startIdx + 1} (last completed: ${state.lastCompletedStep})`);
    }

    // Reset bounce counter for each cycle
    bounceCount = 0;

    for (let i = startIdx; i < STEPS.length; i++) {
      if (shuttingDown) break;

      const step = STEPS[i];
      let result = await runStep(step, readState());

      // Handle retry on same step
      while (result === 'retry' && !shuttingDown) {
        result = await runStep(step, readState());
      }

      // Handle retry of previous step
      if (result === 'retry-previous' && i > 0) {
        i -= 2; // Will be incremented by for loop to i-1
        continue;
      }

      const mainLoopAction = resolveMainLoopAction(result, step);
      if (mainLoopAction.logMessage) log(mainLoopAction.logMessage);
      if (mainLoopAction.removeUnattendedMode) removeUnattendedMode();
      if (typeof mainLoopAction.exitCode === 'number') process.exitCode = mainLoopAction.exitCode;

      if (mainLoopAction.action === 'stop-runner') {
        shuttingDown = true;
        break;
      }

      if (mainLoopAction.action === 'skip') continue;

      // Post-startIssue safety check: halt if Codex selected an escalated issue (skip in single-issue mode)
      if (!SINGLE_ISSUE_NUMBER && result === 'ok' && step.number === STEP_NUMBER.startIssue) {
        const freshState = readState();
        if (freshState.currentIssue && escalatedIssues.has(freshState.currentIssue)) {
          await haltFailureLoop('all issues escalated', [
            `Step 2 selected issue #${freshState.currentIssue} which was previously escalated.`,
            `Escalated issues: ${[...escalatedIssues].map(i => `#${i}`).join(', ')}`,
          ]);
        }
      }

      // After successful merge, reset consecutive escalation counter
      if (result === 'ok' && step.number === STEP_NUMBER.merge) {
        consecutiveEscalations = 0;
        if (SINGLE_ISSUE_NUMBER) {
          log(`Single-issue mode: issue #${SINGLE_ISSUE_NUMBER} complete. Exiting.`);
          removeUnattendedMode();
          break; // Exit the for loop
        }
      }
    }

    // Single-issue mode: exit the while loop after the for loop completes
    if (SINGLE_ISSUE_NUMBER) break;

    if (shuttingDown) break;

    // After a full cycle, reset for next iteration
    clearBounceContext();
    state = readState();
    if (state.currentStep === 0) {
      // Clean cycle completion — check for more issues
      continue;
    }

    // If we got here mid-cycle, reset to a clean cycle boundary.
    state = updateState({ currentStep: 0, lastCompletedStep: 0 });
  }

  log('SDLC Runner exiting.');
}

if (isMainModule) {
  main().catch((err) => {
    log(`Fatal error: ${err.message}`);
    log(`[STATUS] SDLC runner crashed: ${err.message}`);
    removeUnattendedMode();
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const __test__ = {
  resetState() {
    bounceCount = 0;
    consecutiveEscalations = 0;
    escalatedIssues.clear();
    SINGLE_ISSUE_NUMBER = null;
    preSelectedIssue = null;
    bounceContext = null;
    dryRunState = null;
    SKILL_ROOT_RECOVERY = null;
    shuttingDown = false;
  },
  setConfig(cfg) {
    PROJECT_PATH = cfg.projectPath ?? PROJECT_PATH;
    PLUGINS_PATH = cfg.pluginsPath ?? PLUGINS_PATH;
    PLUGIN_ROOT = cfg.pluginRoot ?? PLUGIN_ROOT;
    MODEL = cfg.model ?? MODEL;
    if ('effort' in cfg) EFFORT = cfg.effort;
    MAX_RETRIES = cfg.maxRetriesPerStep ?? MAX_RETRIES;
    MAX_BOUNCE_RETRIES = cfg.maxBounceRetries === undefined
      ? MAX_BOUNCE_RETRIES
      : parseMaxBounceRetries(cfg.maxBounceRetries);
    if ('singleIssueNumber' in cfg) SINGLE_ISSUE_NUMBER = cfg.singleIssueNumber;
    CLEANUP_PATTERNS = cfg.cleanup?.processPatterns ?? CLEANUP_PATTERNS;
    STATE_PATH = cfg.statePath ?? STATE_PATH;
    DRY_RUN = cfg.dryRun ?? DRY_RUN;
    RESUME = cfg.resume ?? RESUME;
    LOG_DIR = cfg.logDir ?? LOG_DIR;
    ORCHESTRATION_LOG = cfg.orchestrationLog ?? ORCHESTRATION_LOG;
    if (cfg.configSteps !== undefined) configSteps = cfg.configSteps;
  },
  get singleIssueNumber() { return SINGLE_ISSUE_NUMBER; },
  set singleIssueNumber(v) { SINGLE_ISSUE_NUMBER = v; },
  get preSelectedIssue() { return preSelectedIssue; },
  set preSelectedIssue(v) { preSelectedIssue = v; },
  get skillRootSource() { return SKILL_ROOT_SOURCE; },
  get skillRootRecovery() { return SKILL_ROOT_RECOVERY; },
  get bounceCount() { return bounceCount; },
  set bounceCount(v) { bounceCount = v; },
  get bounceContext() { return bounceContext; },
  set bounceContext(v) { bounceContext = v; },
  get consecutiveEscalations() { return consecutiveEscalations; },
  set consecutiveEscalations(v) { consecutiveEscalations = v; },
  get escalatedIssues() { return escalatedIssues; },
  get currentProcess() { return currentProcess; },
  get lastCodexPid() { return lastCodexPid; },
  set lastCodexPid(v) { lastCodexPid = v; },
};

// ---------------------------------------------------------------------------
// Named exports for testability
// ---------------------------------------------------------------------------

export {
  detectSoftFailure,
  detectAndHydrateState,
  isStepOutcomeSatisfied,
  validatePreconditions,
  extractStateFromStep,
  matchErrorPattern,
  incrementBounceCount,
  setBounceContext,
  clearBounceContext,
  probeDivergenceHints,
  defaultState,
  validateConfig,
  validatePluginRootShape,
  isVersionedNmgSdlcCacheRoot,
  resolveUsableSkillsBase,
  runtimePluginRoot,
  getConfigObject,
  resolveStepConfig,

  findFeatureDir,
  checkRequiredSpecFiles,
  parseMaxBounceRetries,
  slugFromBranch,
  buildCodexEnv,
  checksIndicateFailure,
  checksIndicatePending,
  classifyBumpType,
  runValidationGate,

  validateSpecs,
  validateSpecContent,
  validateCI,
  validatePush,
  validateVersionBump,
  performDeterministicVersionBump,
  autoCommitIfDirty,
  buildCodexArgs,
  readSkill,
  resolveSkillsBase,
  handleFailure,
  escalate,
  haltFailureLoop,

  runStep,
  log,
  readState,
  writeState,
  updateState,
  runCodex,
  resolveMainLoopAction,
  removeUnattendedMode,
  ensureRunnerArtifactsGitignored,
  cleanupProcesses,
  getChildPids,
  getProcessTree,
  killProcessTree,
  findProcessesByPattern,
  handleSignal,
  hasOpenIssues,
  hasNonEscalatedIssues,
  selectMilestone,
  selectNextIssueFromMilestone,
  writeStepLog,
  extractResultFromStream,
  extractSessionId,
  enforceMaxDisk,
  resolveLogDir,
  sleep,
  main,
  IS_WINDOWS,
  STEPS,
  STEP_KEYS,
  STEP_NUMBER,
  REQUIRED_SPEC_FILES,
  RUNNER_ARTIFACTS,
  IMMEDIATE_ESCALATION_PATTERNS,
  TEXT_FAILURE_PATTERNS,
  BENIGN_DENIED_TOOLS,
  RATE_LIMIT_PATTERN,
  VALID_EFFORTS,
  MAX_CONSECUTIVE_ESCALATIONS,
  __test__,
};
