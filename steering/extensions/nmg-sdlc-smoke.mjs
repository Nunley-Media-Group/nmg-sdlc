import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { terminateOwnedProcessGroup, terminateOwnedProcessGroupAfterLeaderLoss } from "../../src/process-supervision.mjs";
import { resolvePluginController, resolvePluginRoot } from "../../scripts/plugin-controller-path.mjs";
import { inspectDeliveryValidation, inspectVerificationReadiness } from "../../scripts/verification-readiness.mjs";

const SMOKE_REPO = "https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git";
const SMOKE_OWNER = "Nunley-Media-Group";
const SMOKE_NAME = "nmg-sdlc-smoke";
const SHA = /^[0-9a-f]{40}$/i;
const TERMINAL_HEAD_ADVANCE = Object.freeze({
  issue: 379,
  specPath: "specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch",
  allowedPaths: new Set([
    "CHANGELOG.md",
    "scripts/__tests__/nmg-sdlc-smoke.test.mjs",
    "steering/extensions/nmg-sdlc-smoke.mjs",
    "specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/design.md",
    "specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/feature.gherkin",
    "specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/requirements.md",
    "specs/379-reject-non-canonical-spec-file-s-before-worker-dispatch/tasks.md",
  ]),
});
const CLOSING_PRS_QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    issue(number:$number){
      state
      url
      closedByPullRequestsReferences(first:100){
        nodes{number url state headRefOid}
        pageInfo{hasNextPage}
      }
    }
  }
}`;

function envelope(status, summary, identity, evidence = []) {
  return { schemaVersion: 1, status, summary, identity, evidence };
}

function bounded(value, size = 8000) {
  const text = String(value ?? "");
  return text.length <= size ? text : `${text.slice(0, size)}\n[truncated]`;
}

function runCommand(program, args, { cwd, env, signal } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ status: null, signal: null, stdout: "", stderr: "", reasonCode: "cancelled" });
    let child;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let terminalOverride = null;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      resolve({ stdout, stderr, ...result });
    };
    const stop = async (leaderLost = false) => {
      const cleanup = await (leaderLost ? terminateOwnedProcessGroupAfterLeaderLoss : terminateOwnedProcessGroup)(child);
      if (!cleanup.ok) {
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref?.();
      }
      return cleanup;
    };
    const cancel = async () => {
      if (settled || terminalOverride) return;
      terminalOverride = "cancelled";
      const cleanup = await stop();
      settle({ status: null, signal: null, reasonCode: cleanup.ok ? "cancelled" : "cleanup_failed", error: cleanup.error });
    };
    try {
      child = spawn(program, args, {
        cwd,
        env,
        detached: process.platform !== "win32",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      return settle({ status: null, signal: null, reasonCode: "launch_failed", error });
    }
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      if (!terminalOverride) settle({ status: null, signal: null, reasonCode: "launch_failed", error });
    });
    const completed = (code, childSignal) => {
      if (typeof code === "number") return { status: code, signal: childSignal, reasonCode: code === 0 ? null : "failed" };
      return { status: null, signal: childSignal, reasonCode: childSignal ? "failed" : "process_lost" };
    };
    const lost = async (code, childSignal) => {
      if (terminalOverride || settled) return;
      terminalOverride = "process_lost";
      const cleanup = await stop(true);
      settle(cleanup.ok ? completed(code, childSignal) : { status: null, signal: childSignal, reasonCode: "cleanup_failed", error: cleanup.error });
    };
    child.once("exit", (code, childSignal) => {
      if (typeof code !== "number") void lost(code, childSignal);
    });
    child.once("close", (code, childSignal) => {
      if (terminalOverride || settled) return;
      if (typeof code === "number") settle(completed(code, childSignal));
      else void lost(code, childSignal);
    });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) void cancel();
  });
}

function retainedCloneEvidence(work) {
  return {
    kind: "artifact",
    summary: "retained smoke clone",
    artifact: work,
  };
}

function commandEvidence(summary, result, artifact = null) {
  return {
    kind: "command",
    summary,
    artifact,
    stdout: bounded(result?.stdout),
    stderr: bounded(result?.error?.message ?? result?.stderr, 4000),
  };
}

function environmentalFailure(result) {
  return ["cancelled", "process_lost", "launch_failed", "cleanup_failed"].includes(result?.reasonCode);
}

function configuredIssues(config, env) {
  let issues = config?.issues;
  if (!Object.hasOwn(config ?? {}, "issues")) {
    if (typeof config?.issuesEnv !== "string" || !config.issuesEnv) return null;
    const source = String(env[config.issuesEnv] ?? "").trim();
    if (!source) return null;
    const tokens = source.split(/[\s,]+/);
    if (!tokens.every((token) => /^#?[1-9]\d*$/.test(token))) return null;
    issues = tokens.map((token) => Number(token.replace(/^#/, "")));
  }
  return Array.isArray(issues)
    && issues.length > 0
    && issues.every((issue) => Number.isSafeInteger(issue) && issue > 0)
    && new Set(issues).size === issues.length
    ? issues
    : null;
}

function closingIssue(result) {
  if (result?.status !== 0) return null;
  const issue = parseJson(result)?.data?.repository?.issue;
  const references = issue?.closedByPullRequestsReferences;
  if (!issue || !Array.isArray(references?.nodes) || references?.pageInfo?.hasNextPage !== false) return null;
  return {
    state: issue.state,
    url: issue.url,
    pullRequests: references.nodes,
  };
}

function closingPrArgs(issue) {
  return [
    "api", "graphql",
    "-f", `query=${CLOSING_PRS_QUERY}`,
    "-F", `owner=${SMOKE_OWNER}`,
    "-F", `name=${SMOKE_NAME}`,
    "-F", `number=${issue}`,
  ];
}

function pullRequestIdentity(pr) {
  return `${pr?.number ?? ""}:${pr?.url ?? ""}`;
}
function recordedDelivery(readFile, work, issue) {
  try {
    const proof = JSON.parse(readFile(join(work, ".omp", "sdlc", "smoke-deliveries", `${issue}.json`), "utf8"));
    const id = (typeof proof?.invocationId === "string" && proof.invocationId.length > 0) ? proof.invocationId : null;
    if (!id) return null; // no legacy runId-only fallback; only invocationId
    return proof?.schemaVersion === 1
      && proof?.issue === issue
      && Number.isSafeInteger(proof?.pullRequest)
      && proof.pullRequest > 0
      && SHA.test(proof?.headSha ?? "")
      && proof?.recordedBeforeMerge === true
      ? {
        invocationId: id,
        pullRequest: proof.pullRequest,
        headSha: proof.headSha.toLowerCase(),
      }
      : null;
  } catch {
    return null;
  }
}

function validHerdrEnvironment(env) {
  return env.HERDR_ENV === "1"
    && typeof env.HERDR_SOCKET_PATH === "string"
    && env.HERDR_SOCKET_PATH.length > 0
    && typeof env.HERDR_PANE_ID === "string"
    && env.HERDR_PANE_ID.length > 0;
}

function allowedOrigin(value) {
  const origin = String(value ?? "").trim();
  return origin === SMOKE_REPO
    || origin === "https://github.com/Nunley-Media-Group/nmg-sdlc-smoke"
    || origin === "git@github.com:Nunley-Media-Group/nmg-sdlc-smoke.git";
}

function parseJson(result) {
  try {
    return JSON.parse(String(result.stdout ?? ""));
  } catch {
    return null;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function sameOuterRequest(state, request) {
  return state.validationId === request.validationId
    && equal(state.validationConfig, canonical(request.config))
    && state.outerIdentity?.headSha === request.identity?.headSha
    && state.outerIdentity?.specHash === request.identity?.specHash
    && state.outerIdentity?.steeringHash === request.identity?.steeringHash
    && state.outerIdentity?.validationConfigHash === request.identity?.validationConfigHash;
}

function verificationIdentity(identity) {
  return {
    headSha: identity?.headSha,
    specHash: identity?.specHash,
    steeringHash: identity?.steeringHash,
    validationConfigHash: identity?.validationConfigHash,
  };
}

function sameTerminalAuthority(state, request) {
  return state.validationId === request.validationId
    && equal(state.validationConfig, canonical(request.config))
    && state.outerIdentity?.validationConfigHash === request.identity?.validationConfigHash;
}


async function validateTerminalHeadAdvance(executeCommand, state, request, scope, env) {
  const storedHead = state.outerIdentity?.headSha;
  const currentHead = request.identity?.headSha;
  const evidence = [];
  const fail = (status, summary) => ({ status, summary, evidence });
  if (
    scope.issue !== TERMINAL_HEAD_ADVANCE.issue
    || scope.specPath !== TERMINAL_HEAD_ADVANCE.specPath
    || !SHA.test(storedHead ?? "")
    || !SHA.test(currentHead ?? "")
    || storedHead === currentHead
  ) {
    return fail("failed", "nmg-sdlc-smoke terminal head advancement rejected");
  }
  const ancestry = await executeCommand("git", [
    "merge-base", "--is-ancestor", storedHead, currentHead,
  ], { cwd: request.projectRoot, env, signal: request.signal });
  evidence.push(commandEvidence("git merge-base --is-ancestor stored-validation-head current-head", ancestry, request.projectRoot));
  if (environmentalFailure(ancestry)) {
    return fail("incomplete", `nmg-sdlc-smoke terminal head ancestry ${ancestry.reasonCode}`);
  }
  if (ancestry.status !== 0) {
    return fail("failed", "nmg-sdlc-smoke terminal head is not a descendant");
  }
  const changed = await executeCommand("git", [
    "diff", "--name-only", "--no-renames", "-z", storedHead, currentHead, "--",
  ], { cwd: request.projectRoot, env, signal: request.signal });
  evidence.push(commandEvidence("git diff stored-validation-head current-head", changed, request.projectRoot));
  if (environmentalFailure(changed)) {
    return fail("incomplete", `nmg-sdlc-smoke terminal head diff ${changed.reasonCode}`);
  }
  const output = String(changed.stdout ?? "");
  if (changed.status !== 0 || !output.endsWith("\0")) {
    return fail("failed", "nmg-sdlc-smoke terminal head diff unavailable");
  }
  const paths = output.slice(0, -1).split("\0");
  if (!paths.length || paths.some((path) => !TERMINAL_HEAD_ADVANCE.allowedPaths.has(path))) {
    return fail("failed", "nmg-sdlc-smoke terminal head paths exceed approved recovery scope");
  }
  return {
    status: "passed",
    evidence,
    validationIdentity: verificationIdentity(request.identity),
  };
}

// Content-addressed plugin candidate, excluding verification output that changes after a failure.
async function candidateTree(executeCommand, pluginRoot, env, signal) {
  const index = join(tmpdir(), `nmg-sdlc-smoke-index-${randomBytes(12).toString("hex")}`);
  const options = { cwd: pluginRoot, env: { ...env, GIT_INDEX_FILE: index }, signal };
  try {
    for (const args of [
      ["read-tree", "HEAD"],
      ["add", "-A", "--", ".", ":(exclude).omp", ":(exclude)specs/*/verification-report.md"],
    ]) {
      const result = await executeCommand("git", args, options);
      if (result.status !== 0) return null;
    }
    const tree = await executeCommand("git", ["write-tree"], options);
    const sha = String(tree.stdout ?? "").trim();
    return tree.status === 0 && SHA.test(sha) ? sha : null;
  } finally {
    rmSync(index, { force: true });
  }
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function specDigest(specRoot) {
  return `sha256:${digest(["design.md", "feature.gherkin", "requirements.md", "tasks.md"]
    .map((name) => `${name}\0${readFileSync(join(specRoot, name))}`).join("\0"))}`;
}

function readJsonFile(readFile, path) {
  try {
    return JSON.parse(readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export function resolveSmokeRecoveryScope({ projectRoot, identity, verification }) {
  const root = realpathSync(projectRoot);
  if (
    typeof verification?.runId !== "string" || !verification.runId
    || !Number.isSafeInteger(verification.issue) || verification.issue <= 0
    || typeof verification.specPath !== "string"
    || !new RegExp(`^specs/${verification.issue}-[^/]+$`).test(verification.specPath)
  ) throw new Error("outer verification identity unavailable");
  const specPath = verification.specPath;
  if (specDigest(join(root, specPath)) !== identity?.specHash) {
    throw new Error("outer verification spec identity mismatch");
  }
  const recoveryKey = digest(JSON.stringify(canonical({
    projectRoot: root,
    runId: verification.runId,
    issue: verification.issue,
    specPath,
  })));
  return {
    recoveryKey,
    projectRoot: root,
    runId: verification.runId,
    issue: verification.issue,
    specPath,
  };
}

function ensureStoreRoot(root) {
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("smoke recovery store unsafe");
  return realpathSync(root);
}

export function createSmokeRecoveryStore({ root = join(tmpdir(), "nmg-sdlc-smoke-provider-state-v1") } = {}) {
  const directory = ensureStoreRoot(root);
  const pathFor = (key) => {
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("smoke recovery key invalid");
    return join(directory, `${key}.json`);
  };
  const read = (key) => {
    const path = pathFor(key);
    if (!existsSync(path)) return null;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 1024 * 1024) {
      throw new Error("smoke recovery state invalid");
    }
    const value = readJsonFile(readFileSync, path);
    if (!value || value.schemaVersion !== 1 || value.recoveryKey !== key) {
      throw new Error("smoke recovery state invalid");
    }
    return value;
  };
  const write = (key, value, { replace = false } = {}) => {
    const path = pathFor(key);
    const lock = `${path}.lock`;
    const temporary = `${path}.${process.pid}.tmp`;
    let descriptor;
    let lockAcquired = false;
    try {
      descriptor = openSync(lock, "wx");
      lockAcquired = true;
      if (!replace && existsSync(path)) throw new Error("smoke recovery state already exists");
      writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
      renameSync(temporary, path);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      try { unlinkSync(temporary); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      if (lockAcquired) {
        try { unlinkSync(lock); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      }
    }
  };
  const remove = (key) => {
    try { unlinkSync(pathFor(key)); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  };
  return { read, write, remove };
}

// Only already-merged PRs are prior delivery proof. An open PR may be resumed and merged by
// this invocation, which is then bound by its own pre-merge receipt and exact head.
function baselineState(issue, observed) {
  return {
    issue,
    state: observed.state,
    url: observed.url,
    pullRequests: observed.pullRequests.filter((pr) => pr?.state === "MERGED").map((pr) => ({
      number: pr.number,
      url: pr.url,
    })),
  };
}

function validBaseline(baseline, issue) {
  return baseline?.issue === issue
    && typeof baseline.state === "string"
    && typeof baseline.url === "string"
    && Array.isArray(baseline.pullRequests)
    && baseline.pullRequests.every((pr) => (
      Number.isSafeInteger(pr?.number) && pr.number > 0
      && typeof pr.url === "string" && pr.url.length > 0
    ));
}

function exactExpectedQueue(expected, issues, invocationId) {
  return Array.isArray(expected)
    && expected.length === issues.length
    && new Set(expected.map((entry) => entry?.issue)).size === issues.length
    && issues.every((issue) => expected.some((entry) => (
      entry?.issue === issue
      && entry.invocationId === invocationId
      && Number.isSafeInteger(entry.pullRequest) && entry.pullRequest > 0
      && SHA.test(entry.headSha ?? "")
    )));
}

function recoveryToken(key, secret) {
  return `${key}.${secret}`;
}

export function validNestedOwnership(store, token, request, issues) {
  const match = String(token ?? "").match(/^([0-9a-f]{64})\.([0-9a-f]{64})$/);
  if (!match) return null;
  const state = store.read(match[1]);
  if (
    !state
    || state.tokenSecret !== match[2]
    || state.clonePath !== resolve(request.projectRoot)
    || !equal(state.issues, issues)
    || state.phase !== "running"
  ) return null;
  // The token digest binds nested execution to this outer invocation.
  const invocationId = match[1];
  if (state.nestedRunId && state.nestedRunId !== invocationId) return null;
  if (!state.nestedRunId) {
    state.nestedRunId = invocationId;
    store.write(match[1], state, { replace: true });
  }
  return state;
}

function nestedRunIdentity(readFile, work, issues, invocationIdHint = null) {
  // branch-derived nested execution: do not require or read nested .omp/sdlc/run.json or safe-recoveries.
  // The authoritative proof of what the invocation delivered is the pre-merge smoke-deliveries/*.json receipts.
  // Use invocationIdHint (outer recovery key digest) when provided.
  const expected = [];
  let derivedId = invocationIdHint;
  for (const issue of issues) {
    const proof = recordedDelivery(readFile, work, issue);
    if (proof) {
      const pid = proof.invocationId;
      if (!derivedId) derivedId = pid;
      expected.push({ issue, invocationId: pid, pullRequest: proof.pullRequest, headSha: proof.headSha });
    }
  }
  if (expected.length === 0) {
    return { presence: "absent", invocationId: null, expected: [] };
  }
  return { presence: "valid", invocationId: derivedId, expected };
}

function recoveryRecord(readFile, work, invocationId, issue) {
  const proof = recordedDelivery(readFile, work, issue);
  if (proof && proof.invocationId === invocationId) {
    return {
      issue,
      invocationId,
      pullRequest: proof.pullRequest,
      headSha: proof.headSha,
    };
  }
  return null;
}



export function inspectRecoveredVerificationEvidence(
  readFile,
  work,
  recovered,
  immutable,
  { jsonOnly = false } = {},
) {
  const artifact = readJsonFile(
    readFile,
    join(work, ".omp", "sdlc", "verification", `${recovered.issue}.json`),
  );
  if (
    artifact?.schemaVersion === 1
    && artifact.issue === recovered.issue
    && artifact.ceiling === null
    && artifact.coverage?.complete === true
    && artifact.identity?.headSha === immutable.headSha
    && Array.isArray(artifact.results)
    && artifact.results.every((result) => (
      !result.required || !result.applicable || result.effectiveStatus === "passed"
    ))
  ) return true;
  if (jsonOnly) return false;

  let matches;
  try {
    matches = readdirSync(join(work, "specs"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${recovered.issue}-`))
      .map((entry) => entry.name);
  } catch {
    return false;
  }
  if (matches.length !== 1) return false;
  const specPath = `specs/${matches[0]}`;
  let content;
  try {
    content = readFile(join(work, specPath, "verification-report.md"), "utf8");
  } catch {
    return false;
  }
  const readiness = inspectVerificationReadiness({
    content,
    options: {
      expectedIssueNumber: recovered.issue,
      expectedSpecPath: specPath,
      expectedHeadSha: immutable.headSha,
    },
  });
  if (readiness.implementationStatus !== "pass" || readiness.status === "unverifiable") return false;
  if (!content.includes("<!-- nmg-sdlc-delivery-validation:")) return true;
  return inspectDeliveryValidation({
    content,
    options: {
      expectedIssueNumber: recovered.issue,
      expectedSpecPath: specPath,
      expectedPullRequestNumber: recovered.pullRequest,
      expectedHeadSha: immutable.headSha,
      deliveryAcceptanceCriteria: readiness.issueScope?.delivery?.acceptanceCriteria,
    },
  }).status === "satisfied";
}
export function inspectRecoveredDeliveryHandoff(readFile, work, expected) {
  const proof = recordedDelivery(readFile, work, expected.issue);
  return Boolean(proof
    && proof.invocationId === expected.invocationId
    && proof.pullRequest === expected.pullRequest
    && proof.headSha === expected.headSha);
}

async function retainedCloneIdentity(executeCommand, state, env, signal) {
  const origin = await executeCommand("git", ["remote", "get-url", "origin"], {
    cwd: state.clonePath, env, signal,
  });
  const evidence = [commandEvidence("git remote get-url retained smoke origin", origin, state.clonePath)];
  if (environmentalFailure(origin)) return { status: "incomplete", summary: `nmg-sdlc-smoke retained origin ${origin.reasonCode}`, evidence };
  if (origin.status !== 0 || !allowedOrigin(origin.stdout)) return { status: "failed", summary: "nmg-sdlc-smoke retained clone identity mismatch", evidence };
  const ancestor = await executeCommand("git", ["merge-base", "--is-ancestor", state.cloneInitialHead, "HEAD"], {
    cwd: state.clonePath, env, signal,
  });
  evidence.push(commandEvidence("git merge-base --is-ancestor retained-head HEAD", ancestor, state.clonePath));
  if (environmentalFailure(ancestor)) return { status: "incomplete", summary: `nmg-sdlc-smoke retained ancestry ${ancestor.reasonCode}`, evidence };
  return ancestor.status === 0
    ? { status: "passed", evidence }
    : { status: "failed", summary: "nmg-sdlc-smoke retained clone identity mismatch", evidence };
}



export function createSmokeProvider({
  runCommand: executeCommand = runCommand,
  mkdtempSync: createTemp = mkdtempSync,
  readFileSync: readFile = readFileSync,
  rmSync: remove = rmSync,
  recoveryStore = createSmokeRecoveryStore(),
  resolveOuterScope = resolveSmokeRecoveryScope,
  validateNestedOwnership = validNestedOwnership,
  readRecoveryRecord = recoveryRecord,
  verifyCurrentEvidence = inspectRecoveredVerificationEvidence,
  verifyRecoveredDelivery = inspectRecoveredDeliveryHandoff,
  verifyRetainedClone = retainedCloneIdentity,
  env = process.env,
} = {}) {
  return async function smokeProvider(request) {
    const identity = request.identity;
    const issues = configuredIssues(request.config, env);
    if (!issues) {
      return envelope("failed", "nmg-sdlc-smoke issues config invalid", identity);
    }

    let controller;
    let pluginRoot;
    try {
      const options = {
        env,
        importMetaUrl: new URL("../../scripts/plugin-controller-path.mjs", import.meta.url).href,
      };
      pluginRoot = resolvePluginRoot(options);
      controller = resolvePluginController("sdlc-execute.mjs", options);
    } catch (error) {
      return envelope("failed", `nmg-sdlc-smoke ${error.message}`, identity);
    }

    if (env.NMG_SDLC_SMOKE_OWNED !== undefined || env.NMG_SDLC_SMOKE_RECOVERY !== undefined) {
      if (env.NMG_SDLC_SMOKE_OWNED !== "1") {
        return envelope("failed", "nmg-sdlc-smoke outer ownership bypass rejected", identity);
      }
      let owner;
      try {
        owner = validateNestedOwnership(recoveryStore, env.NMG_SDLC_SMOKE_RECOVERY, request, issues);
      } catch {
        owner = null;
      }
      if (!owner || owner.pluginRoot !== pluginRoot) {
        return envelope("failed", "nmg-sdlc-smoke outer ownership bypass rejected", identity);
      }
      const origin = await executeCommand("git", ["remote", "get-url", "origin"], {
        cwd: request.projectRoot,
        env,
        signal: request.signal,
      });
      const evidence = [commandEvidence("git remote get-url nested smoke origin", origin, request.projectRoot)];
      if (environmentalFailure(origin)) {
        return envelope("incomplete", `nmg-sdlc-smoke nested origin ${origin.reasonCode}`, identity, evidence);
      }
      if (origin.status !== 0 || !allowedOrigin(origin.stdout)) {
        return envelope("failed", "nmg-sdlc-smoke nested ownership identity invalid", identity, evidence);
      }
      return envelope("passed", "nmg-sdlc-smoke nested execution blocked (satisfied by enclosing owned delivery)", identity, evidence);
    }
    if (!validHerdrEnvironment(env)) {
      return envelope("failed", "nmg-sdlc-smoke Herdr environment missing", identity);
    }

    let scope;
    try {
      scope = resolveOuterScope({
        projectRoot: request.projectRoot,
        identity,
        verification: request.verification,
      });
    } catch (error) {
      return envelope("failed", `nmg-sdlc-smoke ${error.message}`, identity);
    }
    let state;
    try {
      state = recoveryStore.read(scope.recoveryKey);
    } catch (error) {
      return envelope("failed", `nmg-sdlc-smoke ${error.message}`, identity);
    }
    let terminalValidationIdentity = null;
    let terminalHeadEvidence = [];
    let supersedeFailedState = false;
    const receiptlessFailure = () => state?.phase === "failed" && !(state.expected ?? []).length;
    if (state && (!equal(state.scope, scope) || !equal(state.issues, issues))) {
      return envelope("failed", "nmg-sdlc-smoke recovery identity mismatch", identity, [
        ...(typeof state.clonePath === "string" ? [retainedCloneEvidence(state.clonePath)] : []),
      ]);
    }
    if (state && !sameOuterRequest(state, request) && receiptlessFailure()) {
      // A failed attempt without a pre-merge receipt delivered nothing; a new identity is a new experiment.
      state = null;
      supersedeFailedState = true;
    }
    if (state && !sameOuterRequest(state, request)) {
      if (!["terminal", "cleanup_pending"].includes(state.phase)
        || !sameTerminalAuthority(state, request)) {
        return envelope("failed", "nmg-sdlc-smoke recovery identity mismatch", identity, [
          ...(typeof state.clonePath === "string" ? [retainedCloneEvidence(state.clonePath)] : []),
        ]);
      }
      const advancement = await validateTerminalHeadAdvance(executeCommand, state, request, scope, env);
      terminalHeadEvidence = advancement.evidence;
      if (advancement.status !== "passed") {
        return envelope(advancement.status, advancement.summary, identity, [
          ...terminalHeadEvidence,
          ...(typeof state.clonePath === "string" ? [retainedCloneEvidence(state.clonePath)] : []),
        ]);
      }
      terminalValidationIdentity = advancement.validationIdentity;
    }

    const auth = await executeCommand("gh", ["auth", "status"], { env, signal: request.signal });
    if (environmentalFailure(auth)) {
      return envelope("incomplete", `nmg-sdlc-smoke GitHub auth ${auth.reasonCode}`, identity, [
        commandEvidence("gh auth status", auth),
      ]);
    }
    if (auth.status !== 0) {
      return envelope("failed", "nmg-sdlc-smoke GitHub auth unavailable", identity, [
        commandEvidence("gh auth status", auth),
      ]);
    }


    let work = state?.clonePath ?? null;
    const retain = (status, summary, evidence = []) => envelope(status, summary, identity, [
      ...evidence,
      ...(work && state?.phase !== "terminal" ? [retainedCloneEvidence(work)] : []),
    ]);

    const verifyRemoteDelivery = async ({
      expected,
      baselines,
      evidence,
      recovered,
      terminal = false,
      validationIdentity = null,
    }) => {
      for (const target of expected) {
        if (!terminal) {
          const delivery = recordedDelivery(readFile, work, target.issue);
          if (!delivery
            || delivery.invocationId !== target.invocationId
            || delivery.pullRequest !== target.pullRequest
            || delivery.headSha !== target.headSha
          ) {
            return retain("failed", recovered
              ? `nmg-sdlc-smoke execute exited ${state.executeStatus}`
              : `nmg-sdlc-smoke issue #${target.issue} missing invocation delivery proof`, evidence);
          }
        }
        const issueResult = await executeCommand("gh", closingPrArgs(target.issue), {
          cwd: terminal ? request.projectRoot : work,
          env,
          signal: request.signal,
        });
        const issueCommandEvidence = commandEvidence(`gh issue closing PR proof ${target.issue}`, issueResult);
        if (environmentalFailure(issueResult)) {
          return retain("incomplete", `nmg-sdlc-smoke issue proof ${issueResult.reasonCode}`, [...evidence, issueCommandEvidence]);
        }
        const issueProof = closingIssue(issueResult);
        if (issueProof?.state !== "CLOSED" || typeof issueProof.url !== "string" || issueProof.url.length === 0) {
          return retain("failed", `nmg-sdlc-smoke issue #${target.issue} is not CLOSED`, [...evidence, issueCommandEvidence]);
        }
        const baseline = baselines.get(target.issue);
        if (!baseline) {
          return retain("failed", `nmg-sdlc-smoke issue #${target.issue} baseline unavailable`, [...evidence, issueCommandEvidence]);
        }
        const matches = issueProof.pullRequests.filter((pr) => (
          !baseline.has(pullRequestIdentity(pr))
          && pr?.number === target.pullRequest
          && pr?.state === "MERGED"
          && typeof pr.url === "string"
          && pr.url.length > 0
          && String(pr.headRefOid ?? "").toLowerCase() === target.headSha
        ));
        if (matches.length !== 1) {
          return retain("failed", `nmg-sdlc-smoke issue #${target.issue} missing new exact-head merged PR proof`, [...evidence, issueCommandEvidence]);
        }
        const pr = matches[0];
        evidence.push(issueCommandEvidence, {
          kind: "github",
          summary: `issue #${target.issue} ${issueProof.url} CLOSED; PR ${pr.url} MERGED at ${target.headSha}`,
          artifact: pr.url,
        });
      }
      try {
        if (terminal) {
          let terminalStateChanged = false;
          if (state.phase === "cleanup_pending") {
            remove(work, { recursive: true, force: true });
            state = { ...state, phase: "terminal" };
            terminalStateChanged = true;
          }
          if (validationIdentity) {
            state = {
              ...state,
              validationHead: validationIdentity.headSha,
              validationIdentity,
            };
            terminalStateChanged = true;
          }
          if (terminalStateChanged) recoveryStore.write(scope.recoveryKey, state, { replace: true });
        } else {
          state = { ...state, phase: "cleanup_pending", accepted: expected };
          recoveryStore.write(scope.recoveryKey, state, { replace: true });
          remove(work, { recursive: true, force: true });
          state = { ...state, phase: "terminal" };
          recoveryStore.write(scope.recoveryKey, state, { replace: true });
        }
      } catch (error) {
        return retain("incomplete", "nmg-sdlc-smoke cleanup_failed", [
          ...evidence,
          commandEvidence("remove retained smoke clone", { error }),
        ]);
      }
      return envelope("passed", `nmg-sdlc-smoke delivered ${issues.map((issue) => `#${issue}`).join(", ")}`, identity, evidence);
    };

    let retainedEvidence = [];
    if (state) {
      if (["terminal", "cleanup_pending"].includes(state.phase)) {
        const evidence = [
          ...terminalHeadEvidence,
          commandEvidence("terminal smoke delivery identity", {
            status: 0,
            stdout: JSON.stringify({
              outerRunId: state.scope.runId,
              originalOuterHead: state.outerIdentity.headSha,
              validationHead: terminalValidationIdentity?.headSha ?? state.validationHead ?? state.outerIdentity.headSha,
              nestedRunId: state.nestedRunId,
              issues: state.issues,
              accepted: state.accepted,
            }),
          }),
        ];
        if (!exactExpectedQueue(state.accepted, issues, state.nestedRunId)) {
          return retain("failed", "nmg-sdlc-smoke terminal recovery proof missing", evidence);
        }
        const baselines = new Map();
        for (const issue of issues) {
          const baseline = state.baselines.find((entry) => entry.issue === issue);
          if (!validBaseline(baseline, issue)) {
            return retain("failed", `nmg-sdlc-smoke issue #${issue} baseline unavailable`, evidence);
          }
          baselines.set(issue, new Set(baseline.pullRequests.map(pullRequestIdentity)));
        }
        return verifyRemoteDelivery({
          expected: state.accepted,
          baselines,
          evidence,
          recovered: state.executeStatus !== 0,
          terminal: true,
          validationIdentity: terminalValidationIdentity,
        });
      }
      const retained = await verifyRetainedClone(executeCommand, state, env, request.signal);
      const evidence = [
        commandEvidence("retained smoke invocation identity", {
          status: 0,
          stdout: JSON.stringify({
            outerRunId: state.scope.runId,
            nestedRunId: state.nestedRunId,
            issues: state.issues,
            expected: state.expected,
          }),
        }, state.clonePath),
        ...retained.evidence,
      ];
      retainedEvidence = evidence;
      if (retained.status !== "passed") return retain(retained.status, retained.summary, evidence);
      if (state.phase === "failed" && !(state.expected ?? []).length) {
        const current = await candidateTree(executeCommand, pluginRoot, env, request.signal);
        if (current && current !== state.candidateTree) {
          // No pre-merge receipt exists, so a changed plugin candidate is a new experiment.
          state = null;
          supersedeFailedState = true;
        }
      }
    }
    if (state) {
      const evidence = retainedEvidence;
      if (state.phase !== "failed"
        || !Number.isSafeInteger(state.executeStatus)
        || typeof state.nestedRunId !== "string" || !state.nestedRunId) {
        return retain("failed", `nmg-sdlc-smoke execute exited ${state.executeStatus ?? "without recoverable identity"}`, evidence);
      }
      const expected = [];
      for (const issue of issues) {
        const recovered = readRecoveryRecord(readFile, work, state.nestedRunId, issue);
        const immutable = state.expected.find((entry) => entry.issue === issue);
        if (!recovered || !immutable
          || recovered.invocationId !== immutable.invocationId
          || recovered.issue !== immutable.issue
          || recovered.pullRequest !== immutable.pullRequest) {
          return retain("failed", `nmg-sdlc-smoke execute exited ${state.executeStatus}`, evidence);
        }
        const ancestry = await executeCommand("git", [
          "merge-base", "--is-ancestor", immutable.headSha, recovered.headSha,
        ], { cwd: work, env, signal: request.signal });
        evidence.push(commandEvidence(
          `git merge-base --is-ancestor expected-head recovered-head #${issue}`,
          ancestry,
          work,
        ));
        if (environmentalFailure(ancestry)) {
          return retain("incomplete", `nmg-sdlc-smoke recovered ancestry ${ancestry.reasonCode}`, evidence);
        }
        if (ancestry.status !== 0) {
          return retain("failed", `nmg-sdlc-smoke execute exited ${state.executeStatus}`, evidence);
        }
        if (!verifyRecoveredDelivery(readFile, work, recovered)
          || !verifyCurrentEvidence(readFile, work, recovered, immutable)) {
          return retain("failed", `nmg-sdlc-smoke execute exited ${state.executeStatus}`, evidence);
        }
        expected.push(recovered);
      }
      const baselines = new Map();
      for (const issue of issues) {
        const baseline = state.baselines.find((entry) => entry.issue === issue);
        if (!validBaseline(baseline, issue)) {
          return retain("failed", `nmg-sdlc-smoke issue #${issue} baseline unavailable`, evidence);
        }
        baselines.set(issue, new Set(baseline.pullRequests.map(pullRequestIdentity)));
      }
      return verifyRemoteDelivery({ expected, baselines, evidence, recovered: true });
    }

    work = createTemp(join(tmpdir(), "nmg-sdlc-smoke-"));
    try {
      const clone = await executeCommand("git", ["clone", "--single-branch", SMOKE_REPO, work], {
        env,
        signal: request.signal,
      });
      const cloneEvidence = commandEvidence(`git clone --single-branch ${SMOKE_REPO}`, clone, work);
      if (environmentalFailure(clone) || clone.status !== 0) {
        return retain("incomplete", `nmg-sdlc-smoke clone ${clone.reasonCode ?? `exited ${clone.status}`}`, [cloneEvidence]);
      }

      const origin = await executeCommand("git", ["remote", "get-url", "origin"], {
        cwd: work,
        env,
        signal: request.signal,
      });
      if (environmentalFailure(origin)) {
        return retain("incomplete", `nmg-sdlc-smoke origin ${origin.reasonCode}`, [cloneEvidence, commandEvidence("git remote get-url origin", origin, work)]);
      }
      if (origin.status !== 0 || !allowedOrigin(origin.stdout)) {
        return retain("failed", "nmg-sdlc-smoke origin not allowlisted", [cloneEvidence, commandEvidence("git remote get-url origin", origin, work)]);
      }

      const dirty = await executeCommand("git", ["status", "--porcelain"], {
        cwd: work,
        env,
        signal: request.signal,
      });
      if (environmentalFailure(dirty)) {
        return retain("incomplete", `nmg-sdlc-smoke clean-check ${dirty.reasonCode}`, [cloneEvidence, commandEvidence("git status --porcelain", dirty, work)]);
      }
      if (dirty.status !== 0 || String(dirty.stdout ?? "").trim() !== "") {
        return retain("failed", "nmg-sdlc-smoke clone dirty", [cloneEvidence, commandEvidence("git status --porcelain", dirty, work)]);
      }
      const cloneHead = await executeCommand("git", ["rev-parse", "HEAD"], {
        cwd: work,
        env,
        signal: request.signal,
      });
      const cloneInitialHead = String(cloneHead.stdout ?? "").trim().toLowerCase();
      if (environmentalFailure(cloneHead)) {
        return retain("incomplete", `nmg-sdlc-smoke clone identity ${cloneHead.reasonCode}`, [cloneEvidence, commandEvidence("git rev-parse HEAD", cloneHead, work)]);
      }
      if (cloneHead.status !== 0 || !SHA.test(cloneInitialHead)) {
        return retain("failed", "nmg-sdlc-smoke clone identity unavailable", [cloneEvidence, commandEvidence("git rev-parse HEAD", cloneHead, work)]);
      }

      const baselines = new Map();
      const baselineEvidence = [];
      const persistedBaselines = [];
      for (const issue of issues) {
        const baselineResult = await executeCommand("gh", closingPrArgs(issue), {
          cwd: work,
          env,
          signal: request.signal,
        });
        const summary = `gh issue closing PR baseline ${issue}`;
        baselineEvidence.push(commandEvidence(summary, baselineResult));
        if (environmentalFailure(baselineResult)) {
          return retain("incomplete", `nmg-sdlc-smoke baseline ${baselineResult.reasonCode}`, [cloneEvidence, ...baselineEvidence]);
        }
        const baseline = closingIssue(baselineResult);
        if (!baseline) {
          return retain("failed", `nmg-sdlc-smoke issue #${issue} baseline unavailable`, [cloneEvidence, ...baselineEvidence]);
        }
        const recorded = baselineState(issue, baseline);
        baselines.set(issue, new Set(recorded.pullRequests.map(pullRequestIdentity)));
        persistedBaselines.push(recorded);
      }

      const launchedCandidate = await candidateTree(executeCommand, pluginRoot, env, request.signal);
      if (!launchedCandidate) {
        return retain("incomplete", "nmg-sdlc-smoke candidate identity unavailable", [cloneEvidence, ...baselineEvidence]);
      }
      const tokenSecret = randomBytes(32).toString("hex");
      state = {
        schemaVersion: 1,
        recoveryKey: scope.recoveryKey,
        scope,
        outerIdentity: identity,
        validationId: request.validationId,
        pluginRoot,
        clonePath: work,
        cloneInitialHead,
        issues,
        baselines: persistedBaselines,
        tokenSecret,
        phase: "running",
        executeStatus: null,
        nestedRunId: null,
        expected: [],
        validationConfig: canonical(request.config),
        candidateTree: launchedCandidate,
      };
      recoveryStore.write(scope.recoveryKey, state, { replace: supersedeFailedState });
      const execute = await executeCommand(process.execPath, [
        controller,
        "run",
        ...issues.map((issue) => `#${issue}`),
      ], {
        cwd: work,
        env: {
          ...env,
          NMG_SDLC_PLUGIN_ROOT: pluginRoot,
          NMG_SDLC_SMOKE_OWNED: "1",
          NMG_SDLC_SMOKE_RECOVERY: recoveryToken(scope.recoveryKey, tokenSecret),
        },
        signal: request.signal,
      });
      const evidence = [
        cloneEvidence,
        ...baselineEvidence,
        commandEvidence(`sdlc-execute run ${issues.map((issue) => `#${issue}`).join(" ")}`, execute, work),
      ];
      if (environmentalFailure(execute)) {
        recoveryStore.write(scope.recoveryKey, { ...state, phase: "incomplete" }, { replace: true });
        return retain("incomplete", `nmg-sdlc-smoke execute ${execute.reasonCode}`, evidence);
      }
      if (execute.status !== 0) {
        const nested = nestedRunIdentity(readFile, work, issues, scope.recoveryKey);
        state = {
          ...state,
          phase: "failed",
          executeStatus: execute.status,
          nestedRunId: nested.invocationId,
          expected: nested.expected,
        };
        recoveryStore.write(scope.recoveryKey, state, { replace: true });
        const invocationEvidence = [
          ...evidence,
          commandEvidence("retained smoke invocation identity", {
            status: 0,
            stdout: JSON.stringify({
              outerRunId: scope.runId,
              nestedRunId: nested.invocationId,
              issues,
              expected: nested.expected,
            }),
          }, work),
        ];
        const exactProof = issues.map((issue) => {
          const proof = recordedDelivery(readFile, work, issue);
          return proof ? { issue, ...proof } : null;
        });
        if (exactProof.every(Boolean)
          && exactExpectedQueue(exactProof, issues, nested.invocationId)
          && nested.expected.every((expected) => equal(
            exactProof.find((proof) => proof.issue === expected.issue),
            expected,
          ))) {
          return verifyRemoteDelivery({
            expected: exactProof,
            baselines,
            evidence: invocationEvidence,
            recovered: false,
          });
        }
        return retain("failed", `nmg-sdlc-smoke execute exited ${execute.status}`, invocationEvidence);
      }
      const completedNested = nestedRunIdentity(readFile, work, issues, scope.recoveryKey);
      const persistedRunning = recoveryStore.read(scope.recoveryKey);
      state = persistedRunning;
      if (completedNested.presence === "invalid") {
        recoveryStore.write(scope.recoveryKey, { ...state, phase: "completed_unproven" }, { replace: true });
        return retain("failed", "nmg-sdlc-smoke completed invocation run identity invalid", evidence);
      }
      const expected = [];
      for (const issue of issues) {
        const delivery = recordedDelivery(readFile, work, issue);
        if (!delivery) {
          recoveryStore.write(scope.recoveryKey, { ...state, phase: "completed_unproven" }, { replace: true });
          return retain("failed", `nmg-sdlc-smoke issue #${issue} missing invocation delivery proof`, evidence);
        }
        expected.push({ issue, ...delivery });
      }
      const proofInvocationIds = [...new Set(expected.map((entry) => entry.invocationId))];
      if (proofInvocationIds.length !== 1) {
        recoveryStore.write(scope.recoveryKey, { ...state, phase: "completed_unproven" }, { replace: true });
        return retain("failed", "nmg-sdlc-smoke completed invocation run identity mismatch", evidence);
      }
      const trustedInvocationId = completedNested.invocationId || persistedRunning?.nestedRunId || proofInvocationIds[0];
      if (trustedInvocationId !== proofInvocationIds[0]) {
        recoveryStore.write(scope.recoveryKey, { ...state, phase: "completed_unproven" }, { replace: true });
        return retain("failed", "nmg-sdlc-smoke completed invocation run identity mismatch", evidence);
      }
      for (const runExpected of completedNested.expected) {
        const proof = expected.find((entry) => entry.issue === runExpected.issue);
        if (!proof || !equal(runExpected, proof)) {
          recoveryStore.write(scope.recoveryKey, { ...state, phase: "completed_unproven" }, { replace: true });
          return retain("failed", `nmg-sdlc-smoke issue #${runExpected.issue} delivery state mismatch`, evidence);
        }
      }
      state = {
        ...state,
        phase: "ready",
        executeStatus: 0,
        nestedRunId: trustedInvocationId,
        expected,
      };
      return verifyRemoteDelivery({ expected, baselines, evidence, recovered: false });
    } catch (error) {
      return retain("incomplete", error instanceof Error ? error.message : String(error));
    }
  };
}

export const extension = Object.freeze({
  schemaVersion: 1,
  id: "project.nmg-sdlc-smoke",
  providers: Object.freeze({
    "project.nmg-sdlc-smoke": createSmokeProvider(),
  }),
});
