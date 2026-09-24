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
    return proof?.schemaVersion === 1
      && proof?.issue === issue
      && typeof proof?.runId === "string" && proof.runId.length > 0
      && Number.isSafeInteger(proof?.pullRequest)
      && proof.pullRequest > 0
      && SHA.test(proof?.headSha ?? "")
      && proof?.recordedBeforeMerge === true
      ? {
        runId: proof.runId,
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

function baselineState(issue, observed) {
  return {
    issue,
    state: observed.state,
    url: observed.url,
    pullRequests: observed.pullRequests.map((pr) => ({
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

function recoveryToken(key, secret) {
  return `${key}.${secret}`;
}

function exactExpectedQueue(expected, issues, nestedRunId) {
  return Array.isArray(expected)
    && expected.length === issues.length
    && new Set(expected.map((entry) => entry?.issue)).size === issues.length
    && issues.every((issue) => expected.some((entry) => (
      entry?.issue === issue
      && entry.runId === nestedRunId
      && Number.isSafeInteger(entry.pullRequest) && entry.pullRequest > 0
      && SHA.test(entry.headSha ?? "")
    )));
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
  const nested = readJsonFile(readFileSync, join(request.projectRoot, ".omp", "sdlc", "run.json"));
  if (
    nested?.schemaVersion !== 1
    || nested.projectRoot !== realpathSync(request.projectRoot)
    || typeof nested.runId !== "string" || !nested.runId
    || !equal(nested.issues, issues)
    || !issues.includes(nested.currentIssue)
    || nested.currentStep !== "verify"
    || (state.nestedRunId && state.nestedRunId !== nested.runId)
  ) return null;
  if (!state.nestedRunId) {
    state.nestedRunId = nested.runId;
    store.write(match[1], state, { replace: true });
  }
  return state;
}

function nestedRunIdentity(readFile, work, issues) {
  let raw;
  try {
    raw = readFile(join(work, ".omp", "sdlc", "run.json"), "utf8");
  } catch {
    return { presence: "absent", runId: null, expected: [] };
  }
  let run;
  try {
    run = JSON.parse(raw);
  } catch {
    return { presence: "invalid", runId: null, expected: [] };
  }
  if (
    run?.schemaVersion !== 1
    || resolve(run.projectRoot) !== resolve(work)
    || typeof run.runId !== "string" || !run.runId
    || !equal(run.issues, issues)
    || !issues.includes(run.currentIssue)
    || run.currentStep !== "deliver"
    || run.delivery?.issue !== run.currentIssue
    || !Number.isSafeInteger(run.delivery.pullRequest) || run.delivery.pullRequest <= 0
    || !SHA.test(run.delivery.expectedHead ?? "")
  ) return { presence: "invalid", runId: null, expected: [] };
  const expected = [{
    issue: run.delivery.issue,
    runId: run.runId,
    pullRequest: run.delivery.pullRequest,
    headSha: run.delivery.expectedHead.toLowerCase(),
  }];
  for (const issue of issues) {
    if (issue === run.delivery.issue) continue;
    const proof = recordedDelivery(readFile, work, issue);
    if (proof?.runId === run.runId) expected.push({ issue, ...proof });
  }
  return { presence: "valid", runId: run.runId, expected };
}

function recoveryRecord(readFile, work, runId, issue) {
  const safe = readJsonFile(readFile, join(work, ".omp", "sdlc", "safe-recoveries.json"));
  const matches = Array.isArray(safe?.records) ? safe.records.filter((record) => (
    record?.class === "post_merge_observation"
    && record?.runId === runId
    && record?.issue === issue
    && record?.step === "deliver"
    && record?.disposition === "consumed"
    && Number.isSafeInteger(record?.evidence?.pullRequest)
    && SHA.test(record?.evidence?.headSha ?? "")
  )) : [];
  return matches.length === 1 ? {
    issue,
    runId,
    pullRequest: matches[0].evidence.pullRequest,
    headSha: matches[0].evidence.headSha.toLowerCase(),
  } : null;
}


function optionalPassedHandoff(readFile, work, expected, step) {
  const path = join(work, ".omp", "sdlc", "handoffs", `${expected.issue}-${step}.json`);
  if (!existsSync(path)) return true;
  const handoff = readJsonFile(readFile, path);
  return handoff?.schemaVersion === 1
    && handoff.issue === expected.issue
    && handoff.step === step
    && handoff.status === "passed"
    && handoff.intervention === false
    && handoff.reasonCode === null;
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
export function inspectRecoveredDeliveryHandoff(
  readFile,
  work,
  expected,
  { required = false } = {},
) {
  const sessionsRoot = join(work, ".omp", "sdlc", "sessions");
  let tokens;
  try {
    tokens = readdirSync(sessionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .slice(0, 101);
  } catch {
    return !required;
  }
  if (tokens.length > 100) return false;
  const matched = [];
  for (const token of tokens) {
    const pointer = readJsonFile(readFile, join(sessionsRoot, token.name, "recovery-owner.json"));
    if (
      pointer?.projectRoot !== realpathSync(work)
      || pointer?.recoveryOwnerId !== expected.runId
      || pointer?.issue !== expected.issue
      || pointer?.step !== "deliver"
    ) continue;

    matched.push(readJsonFile(
      readFile,
      join(sessionsRoot, token.name, "handoffs", `${expected.issue}-deliver.json`),
    ));
  }
  if (matched.length === 0) return !required;
  if (matched.length !== 1) return false;
  const [handoff] = matched;
  return handoff?.schemaVersion === 1
    && handoff.issue === expected.issue
    && handoff.step === "deliver"
    && handoff.status === "passed"
    && handoff.intervention === false
    && handoff.reasonCode === null
    && Array.isArray(handoff.artifacts)
    && handoff.artifacts.includes(`https://github.com/${SMOKE_OWNER}/${SMOKE_NAME}/pull/${expected.pullRequest}`);
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

function exactRealPath(value, expected) {
  try {
    return typeof value === "string" && realpathSync(value) === expected;
  } catch {
    return false;
  }
}

function legacyClonePath(evidence) {
  const retained = evidence.filter((item) => (
    item?.kind === "artifact"
    && item.summary === "retained smoke clone"
  ));
  if (retained.length !== 1) return null;
  try {
    const stat = lstatSync(retained[0].artifact);
    const clone = realpathSync(retained[0].artifact);
    const temporaryRoot = realpathSync(tmpdir());
    if (
      stat.isSymbolicLink()
      || !stat.isDirectory()
      || resolve(clone, "..") !== temporaryRoot
      || !clone.slice(temporaryRoot.length + 1).startsWith("nmg-sdlc-smoke-")
    ) return null;
    return clone;
  } catch {
    return null;
  }
}

export function inspectLegacySmokeFailure(readFile, { request, scope, issues, pluginRoot }) {
  const artifactPath = join(scope.projectRoot, ".omp", "sdlc", "verification", `${scope.issue}.json`);
  let artifact;
  try {
    artifact = JSON.parse(readFile(artifactPath, "utf8"));
  } catch (error) {
    return { presence: error?.code === "ENOENT" ? "absent" : "invalid" };
  }
  const candidates = Array.isArray(artifact?.results)
    ? artifact.results.filter((entry) => entry?.id === "repository.nmg-sdlc-smoke")
    : [];
  if (candidates.length === 0) return { presence: "absent" };
  if (candidates.length !== 1) return { presence: "invalid" };
  const [candidate] = candidates;
  const failedRequest = candidate.request;
  const failedResult = candidate.result;
  const resultIdentity = failedResult?.identity;
  // Only a coherent, uniquely attributable old attempt can be non-authoritative.
  // An ambiguous artifact or a broken current attempt must still fail closed.
  const recordedIdentity = {
    headSha: failedRequest?.identity?.headSha,
    steeringHash: failedRequest?.identity?.steeringHash,
    specHash: failedRequest?.identity?.specHash,
  };
  const executeCommands = Array.isArray(failedResult?.evidence)
    ? failedResult.evidence.filter((item) => (
      item?.kind === "command" && /^sdlc-execute run /.test(item.summary ?? "")
    ))
    : [];
  const oldQueue = executeCommands.length === 1
    ? executeCommands[0].summary.match(/^sdlc-execute run ((?:#[1-9]\d*)(?: #[1-9]\d*)*)$/)?.[1]
      .split(" ").map((token) => Number(token.slice(1)))
    : null;
  const attributable = artifact?.schemaVersion === 1
    && artifact.ceiling === "Fail"
    && artifact.coverage?.complete === true
    && artifact.issue === scope.issue
    && candidate.provider === "project.nmg-sdlc-smoke"
    && candidate.required === true
    && candidate.applicable === true
    && candidate.effectiveStatus === "failed"
    && failedRequest?.schemaVersion === 1
    && failedRequest.validationId === request.validationId
    && failedRequest.verification === undefined
    && exactRealPath(failedRequest.projectRoot, scope.projectRoot)
    && failedResult?.schemaVersion === 1
    && failedResult.status === "failed"
    && equal(resultIdentity, failedRequest.identity)
    && equal(artifact.identity, recordedIdentity)
    && SHA.test(recordedIdentity.headSha ?? "")
    && [recordedIdentity.specHash, recordedIdentity.steeringHash,
      failedRequest.identity?.validationConfigHash].every((value) => (
      typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value)
    ));
  if (attributable && (
    !equal(verificationIdentity(failedRequest.identity), verificationIdentity(request.identity))
    || (oldQueue?.length > 0 && new Set(oldQueue).size === oldQueue.length && !equal(oldQueue, issues))
  )) return { presence: "absent" };
  if (
    artifact?.schemaVersion !== 1
    || artifact.issue !== scope.issue
    || artifact.ceiling !== "Fail"
    || artifact.coverage?.complete !== true
    || candidate.provider !== "project.nmg-sdlc-smoke"
    || candidate.required !== true
    || candidate.applicable !== true
    || candidate.effectiveStatus !== "failed"
    || failedRequest?.schemaVersion !== 1
    || failedRequest.validationId !== request.validationId
    || failedRequest.verification !== undefined
    || !exactRealPath(failedRequest.projectRoot, scope.projectRoot)
    || !equal(failedRequest.config, request.config)
    || !equal(resultIdentity, failedRequest.identity)
    || failedResult?.schemaVersion !== 1
    || failedResult.status !== "failed"
    || !equal(artifact.identity, {
      headSha: failedRequest.identity?.headSha,
      steeringHash: failedRequest.identity?.steeringHash,
      specHash: failedRequest.identity?.specHash,
    })
    || failedRequest.identity?.validationConfigHash !== request.identity?.validationConfigHash
    || !Array.isArray(failedResult.evidence)
  ) return { presence: "invalid" };

  const statusMatch = String(failedResult.summary ?? "").match(/^nmg-sdlc-smoke execute exited ([1-9]\d*)$/);
  const executeEvidence = failedResult.evidence.filter((item) => (
    item?.kind === "command"
    && item.summary === `sdlc-execute run ${issues.map((issue) => `#${issue}`).join(" ")}`
  ));
  const clonePath = legacyClonePath(failedResult.evidence);
  const cloneEvidence = failedResult.evidence.filter((item) => (
    item?.kind === "command"
    && item.summary === `git clone --single-branch ${SMOKE_REPO}`
  ));
  if (
    !statusMatch
    || executeEvidence.length !== 1
    || !clonePath
    || cloneEvidence.length !== 1
    || !exactRealPath(cloneEvidence[0].artifact, clonePath)
    || !exactRealPath(executeEvidence[0].artifact, clonePath)
  ) return { presence: "invalid" };

  const baselines = [];
  const baselineEvidence = failedResult.evidence.filter((item) => (
    item?.kind === "command" && String(item.summary ?? "").startsWith("gh issue closing PR baseline ")
  ));
  if (baselineEvidence.length !== issues.length) return { presence: "invalid" };
  for (const issue of issues) {
    const matches = baselineEvidence.filter((item) => item.summary === `gh issue closing PR baseline ${issue}`);
    const observed = matches.length === 1
      ? closingIssue({ status: 0, stdout: matches[0].stdout })
      : null;
    if (
      !observed
      || observed.url !== `https://github.com/${SMOKE_OWNER}/${SMOKE_NAME}/issues/${issue}`
    ) return { presence: "invalid" };
    baselines.push(baselineState(issue, observed));
  }

  const nested = nestedRunIdentity(readFile, clonePath, issues);
  const run = readJsonFile(readFile, join(clonePath, ".omp", "sdlc", "run.json"));
  const rootDelivery = readJsonFile(
    readFile,
    join(clonePath, ".omp", "sdlc", "handoffs", `${run?.currentIssue}-deliver.json`),
  );
  if (
    nested.presence !== "valid"
    || !exactExpectedQueue(nested.expected, issues, nested.runId)
    || !SHA.test(run?.head ?? "")
    || run.issue !== run.currentIssue
    || run.failed?.issue !== run.currentIssue
    || run.failed?.step !== "deliver"
    || run.failed?.reasonCode !== "automatic_review_unactionable"
    || run.delivery?.status !== "expected"
    || rootDelivery?.schemaVersion !== 1
    || rootDelivery.issue !== run.currentIssue
    || rootDelivery.step !== "deliver"
    || rootDelivery.status !== "failed"
    || rootDelivery.intervention !== true
    || rootDelivery.reasonCode !== "automatic_review_unactionable"
  ) return { presence: "invalid" };

  return {
    presence: "valid",
    state: {
      schemaVersion: 1,
      recoveryKey: scope.recoveryKey,
      scope,
      outerIdentity: request.identity,
      validationId: request.validationId,
      pluginRoot,
      clonePath,
      cloneInitialHead: run.head.toLowerCase(),
      issues,
      baselines,
      tokenSecret: randomBytes(32).toString("hex"),
      phase: "failed",
      executeStatus: Number(statusMatch[1]),
      nestedRunId: nested.runId,
      expected: nested.expected,
      validationConfig: canonical(request.config),
      bootstrap: {
        kind: "legacy-verification-failure",
        issue: scope.issue,
        artifactDigest: digest(JSON.stringify(canonical(artifact))),
        deliveryProofRequired: false,
      },
    },
  };
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
  verifyOptionalHandoff = optionalPassedHandoff,
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
    if (state && (!equal(state.scope, scope) || !equal(state.issues, issues))) {
      return envelope("failed", "nmg-sdlc-smoke recovery identity mismatch", identity, [
        ...(typeof state.clonePath === "string" ? [retainedCloneEvidence(state.clonePath)] : []),
      ]);
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

    if (!state) {
      let legacy;
      try {
        legacy = inspectLegacySmokeFailure(readFile, {
          request,
          scope,
          issues,
          pluginRoot,
        });
      } catch {
        legacy = { presence: "invalid" };
      }
      if (legacy.presence === "invalid") {
        return envelope("failed", "nmg-sdlc-smoke legacy recovery evidence invalid", identity);
      }
      if (legacy.presence === "valid") {
        try {
          recoveryStore.write(scope.recoveryKey, legacy.state);
          state = recoveryStore.read(scope.recoveryKey);
        } catch (error) {
          return envelope("failed", `nmg-sdlc-smoke ${error.message}`, identity);
        }
      }
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
          const legacyWithoutProof = recovered
            && state.bootstrap?.kind === "legacy-verification-failure"
            && state.bootstrap.issue === scope.issue
            && /^[0-9a-f]{64}$/.test(state.bootstrap.artifactDigest ?? "")
            && state.bootstrap.deliveryProofRequired === false;
          if ((!delivery && !legacyWithoutProof)
            || (delivery && (
              delivery.runId !== target.runId
              || delivery.pullRequest !== target.pullRequest
              || delivery.headSha !== target.headSha
            ))) {
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
      if (retained.status !== "passed") return retain(retained.status, retained.summary, evidence);
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
          || recovered.runId !== immutable.runId
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
        if (!verifyOptionalHandoff(readFile, work, recovered, "verify")
          || !verifyRecoveredDelivery(readFile, work, recovered, { required: true })
          || !verifyCurrentEvidence(readFile, work, recovered, immutable, {
            jsonOnly: state.bootstrap?.kind === "legacy-verification-failure",
          })) {
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
        baselines.set(issue, new Set(baseline.pullRequests.map(pullRequestIdentity)));
        persistedBaselines.push(baselineState(issue, baseline));
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
      };
      recoveryStore.write(scope.recoveryKey, state);
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
        const nested = nestedRunIdentity(readFile, work, issues);
        state = {
          ...state,
          phase: "failed",
          executeStatus: execute.status,
          nestedRunId: nested.runId,
          expected: nested.expected,
        };
        recoveryStore.write(scope.recoveryKey, state, { replace: true });
        const invocationEvidence = [
          ...evidence,
          commandEvidence("retained smoke invocation identity", {
            status: 0,
            stdout: JSON.stringify({
              outerRunId: scope.runId,
              nestedRunId: nested.runId,
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
          && exactExpectedQueue(exactProof, issues, nested.runId)
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

      const completedNested = nestedRunIdentity(readFile, work, issues);
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
      const proofRunIds = [...new Set(expected.map((entry) => entry.runId))];
      if (proofRunIds.length !== 1) {
        recoveryStore.write(scope.recoveryKey, { ...state, phase: "completed_unproven" }, { replace: true });
        return retain("failed", "nmg-sdlc-smoke completed invocation run identity mismatch", evidence);
      }
      const trustedRunId = completedNested.runId ?? persistedRunning?.nestedRunId ?? proofRunIds[0];
      if (trustedRunId !== proofRunIds[0]) {
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
        nestedRunId: trustedRunId,
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
