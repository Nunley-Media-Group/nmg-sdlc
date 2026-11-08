import { createHash, randomBytes, randomUUID } from "node:crypto";
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
// The steering writer validates a staged copy of steering/ outside the checkout, where these
// plugin modules do not resolve. Loading must still succeed there; a provider invocation
// without them fails closed instead.
const plugin = await Promise.all([
  import("../../src/process-supervision.mjs"),
  import("../../scripts/plugin-controller-path.mjs"),
  import("../../scripts/verification-readiness.mjs"),
]).then(([supervision, controllerPath, readiness]) => ({ ...supervision, ...controllerPath, ...readiness }))
  .catch(() => null);

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
      const cleanup = await (leaderLost
        ? plugin.terminateOwnedProcessGroupAfterLeaderLoss
        : plugin.terminateOwnedProcessGroup)(child);
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

function explicitIssues(issues) {
  return Array.isArray(issues)
    && issues.length > 0
    && issues.every((issue) => Number.isSafeInteger(issue) && issue > 0)
    && new Set(issues).size === issues.length
    ? issues
    : null;
}

// Explicit queues (config.issues or a non-blank env value) take priority. Without one, the gate
// delivers the issue named by the verify worker's provisioning record. The provider never drafts
// or specifies an issue, and ignores `provision.need`.
function resolveQueue(config, env) {
  if (Object.hasOwn(config ?? {}, "issues")) {
    const issues = explicitIssues(config.issues);
    return issues ? { kind: "explicit", issues } : null;
  }
  if (typeof config?.issuesEnv !== "string" || !config.issuesEnv) return null;
  const source = String(env[config.issuesEnv] ?? "").trim();
  if (source) {
    const tokens = source.split(/[\s,]+/);
    if (!tokens.every((token) => /^#?[1-9]\d*$/.test(token))) return null;
    const issues = explicitIssues(tokens.map((token) => Number(token.replace(/^#/, ""))));
    return issues ? { kind: "explicit", issues } : null;
  }
  const recordPath = config.provision?.record;
  return typeof recordPath === "string" && recordPath.trim() ? { kind: "recorded", recordPath: recordPath.trim() } : null;
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
    const proof = JSON.parse(readFile(join(work, ".nmg-sdlc", "smoke-deliveries", `${issue}.json`), "utf8"));
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
export async function candidateTree(executeCommand, pluginRoot, env, signal) {
  const index = join(tmpdir(), `nmg-sdlc-smoke-index-${randomBytes(12).toString("hex")}`);
  const options = { cwd: pluginRoot, env: { ...env, GIT_INDEX_FILE: index }, signal };
  try {
    // git refuses a pathspec, an exclusion included, that names an ignored path, and `add -A`
    // already leaves ignored files out, so `.nmg-sdlc` is excluded only where it is not ignored.
    const ignored = await executeCommand("git", ["check-ignore", "-q", ".nmg-sdlc"], options);
    if (![0, 1].includes(ignored.status)) return null;
    const runtime = ignored.status === 0 ? [] : [":(exclude).nmg-sdlc"];
    for (const args of [
      ["read-tree", "HEAD"],
      ["add", "-A", "--", ".", ...runtime, ":(exclude)specs/*/verification-report.md"],
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
  // A recorded queue (issues === null) reaches nested execution only through the outer
  // invocation's recorded provisioned issue.
  const expectedIssues = issues ?? (state?.provisioned ? [state.provisioned.issue] : null);
  if (
    !state
    || state.tokenSecret !== match[2]
    || state.clonePath !== resolve(request.projectRoot)
    || !expectedIssues
    || !equal(state.issues, expectedIssues)
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
  // branch-derived nested execution: do not require or read nested .nmg-sdlc/run.json or safe-recoveries.
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

const SMOKE_SLUG = `${SMOKE_OWNER}/${SMOKE_NAME}`;
const WORKER_PERMISSION_MODES = new Set(["default", "acceptEdits", "auto", "dontAsk", "bypassPermissions"]);

// The headless delivery session uses the same permission mode as `/sdlc-execute` worker sessions.
export function workerPermissionMode(env = process.env) {
  const mode = env?.NMG_SDLC_WORKER_PERMISSION_MODE;
  return WORKER_PERMISSION_MODES.has(mode) ? mode : "auto";
}

const NOT_PROVISIONED = "nmg-sdlc-smoke smoke issue not provisioned";

// The verify worker records the smoke issue it provisioned as
// `{ schemaVersion: 1, repo: "Nunley-Media-Group/nmg-sdlc-smoke", issue, provisionedAt }`.
// Returns `{ issue }` for a well-formed record, otherwise `{ reason }`.
function readProvisionRecord(readFile, projectRoot, recordPath) {
  let text;
  try {
    text = readFile(resolve(projectRoot, recordPath), "utf8");
  } catch (error) {
    return { reason: error?.code === "ENOENT" ? "record missing" : "record unreadable" };
  }
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return { reason: "record unparsable" };
  }
  if (record?.schemaVersion !== 1) return { reason: "record schemaVersion invalid" };
  if (record.repo !== SMOKE_SLUG) return { reason: `record repo ${JSON.stringify(record.repo ?? null)} is not ${SMOKE_SLUG}` };
  if (!Number.isSafeInteger(record.issue) || record.issue <= 0) return { reason: "record issue invalid" };
  return { issue: record.issue };
}

// The recorded issue is deliverable only while it is OPEN, authored by the authenticated gh user,
// labelled `spec-created`, and its `docs: approve spec for #N` PR is merged. Returns the published
// evidence, or `{ status, reason }` naming why it is not deliverable.
async function publishedSpec(executeCommand, env, signal, issue) {
  const evidence = [];
  const gh = async (summary, args) => {
    const result = await executeCommand("gh", args, { env, signal });
    evidence.push(commandEvidence(summary, result));
    return result;
  };
  const stop = (status, reason) => ({ status, reason, evidence });
  const user = await gh("gh api user", ["api", "user", "--jq", ".login"]);
  if (environmentalFailure(user)) return stop("incomplete", `gh user ${user.reasonCode}`);
  const login = user.status === 0 ? String(user.stdout ?? "").trim() : "";
  if (!login) return stop("failed", "authenticated gh user unavailable");
  const viewed = await gh(`gh issue view #${issue}`, [
    "issue", "view", String(issue), "-R", SMOKE_SLUG, "--json", "state,author,labels,url",
  ]);
  if (environmentalFailure(viewed)) return stop("incomplete", `issue view ${viewed.reasonCode}`);
  const view = viewed.status === 0 ? parseJson(viewed) : null;
  if (!view || typeof view !== "object") return stop("failed", `#${issue} unavailable`);
  if (view.state !== "OPEN") return stop("failed", `#${issue} closed`);
  if (view.author?.login !== login) return stop("failed", `#${issue} foreign author`);
  if (!Array.isArray(view.labels) || !view.labels.some((label) => label?.name === "spec-created")) {
    return stop("failed", `#${issue} no spec-created label`);
  }
  const title = `docs: approve spec for #${issue}`;
  const listed = await gh(`gh pr list merged spec PR #${issue}`, [
    "pr", "list", "-R", SMOKE_SLUG, "--state", "merged", "--search", `"${title}" in:title`, "--json", "number,title,url",
  ]);
  if (environmentalFailure(listed)) return stop("incomplete", `spec PR list ${listed.reasonCode}`);
  const pulls = listed.status === 0 ? parseJson(listed) : null;
  const pull = Array.isArray(pulls) ? pulls.find((candidate) => candidate?.title === title) : null;
  if (!pull) return stop("failed", `#${issue} no merged spec PR`);
  return { status: "passed", issueUrl: view.url, pull, evidence };
}

// The delivery session is one headless `/sdlc-execute` run in the delivery clone: a fresh session id
// per invocation, the candidate plugin loaded with --plugin-dir, and the queue as issue references.
function deliverySessionArgs({ pluginRoot, permissionMode, sessionId, issues }) {
  return [
    "-p",
    "--session-id", sessionId,
    "--plugin-dir", pluginRoot,
    "--model", "opus",
    "--permission-mode", permissionMode,
    `/sdlc-execute ${issues.map((issue) => `#${issue}`).join(" ")}`,
  ];
}

// The controller status is the `status` in its result record under the delivery clone. A missing,
// unreadable or non-integer record is a nonzero status, so only the exact current-invocation proof passes.
function executeResultStatus(readFile, work, sessionId, launched) {
  const record = readJsonFile(readFile, join(work, ".nmg-sdlc", "execute", "results", `${sessionId}.json`));
  if (Number.isSafeInteger(record?.status)) return record.status;
  return Number.isSafeInteger(launched?.status) && launched.status !== 0 ? launched.status : 1;
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
    join(work, ".nmg-sdlc", "verification", `${recovered.issue}.json`),
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
  const readiness = plugin.inspectVerificationReadiness({
    content,
    options: {
      expectedIssueNumber: recovered.issue,
      expectedSpecPath: specPath,
      expectedHeadSha: immutable.headSha,
    },
  });
  if (readiness.implementationStatus !== "pass" || readiness.status === "unverifiable") return false;
  if (!content.includes("<!-- nmg-sdlc-delivery-validation:")) return true;
  return plugin.inspectDeliveryValidation({
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

// The gate proves this checkout's controller: when the project under verification is itself an
// nmg-sdlc plugin root, use it instead of an installed plugin that NMG_SDLC_PLUGIN_ROOT may name
// (Claude Code's plugin cache under ~/.claude/plugins/ carries no Git candidate identity). The
// same root is the `--plugin-dir` of the delivery session. Nested smoke verification runs in a
// non-plugin clone and keeps the outer invocation's propagated root.
function smokePluginRoot(projectRoot, options) {
  try {
    return plugin.resolvePluginRoot({ env: { NMG_SDLC_PLUGIN_ROOT: projectRoot } });
  } catch {
    return plugin.resolvePluginRoot(options);
  }
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
  const deliverSmoke = async (request, recordedEvidence) => {
    const identity = request.identity;
    const queue = resolveQueue(request.config, env);
    if (!queue) {
      return envelope("failed", "nmg-sdlc-smoke issues config invalid", identity);
    }
    let issues = queue.kind === "explicit" ? queue.issues : null;

    let pluginRoot;
    try {
      if (!plugin) throw new Error("plugin modules unavailable");
      pluginRoot = smokePluginRoot(request.projectRoot, {
        env,
        importMetaUrl: new URL("../../scripts/plugin-controller-path.mjs", import.meta.url).href,
      });
      // The delivery session runs /sdlc-execute from this plugin root, so its controller must resolve here.
      plugin.resolvePluginController("sdlc-execute.mjs", { env: { NMG_SDLC_PLUGIN_ROOT: pluginRoot } });
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
    const permissionMode = workerPermissionMode(env);

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
    let provisioned = null;
    if (queue.kind === "recorded") {
      const record = readProvisionRecord(readFile, request.projectRoot, queue.recordPath);
      if (!record.issue) return envelope("failed", `${NOT_PROVISIONED}: ${record.reason}`, identity);
      issues = [record.issue];
      if (state) {
        const held = Number.isSafeInteger(state.provisioned?.issue) ? state.provisioned.issue : null;
        const terminal = ["terminal", "cleanup_pending"].includes(state.phase);
        if (held === record.issue) {
          // A delivered issue is terminal and never reused: only the same outer request replays it.
          if (terminal && !sameOuterRequest(state, request)) {
            return envelope("failed", `${NOT_PROVISIONED}: #${record.issue} already delivered`, identity, [
              ...(state.phase === "cleanup_pending" && typeof state.clonePath === "string"
                ? [retainedCloneEvidence(state.clonePath)] : []),
            ]);
          }
          provisioned = state.provisioned;
        } else if (terminal || receiptlessFailure() || !Array.isArray(state.issues) || !state.issues.length) {
          // State for a different (or no) recorded issue that delivered nothing still in flight is
          // superseded by the newly recorded issue; a retained terminal clone is removed first.
          if (state.phase === "cleanup_pending" && typeof state.clonePath === "string") {
            try {
              remove(state.clonePath, { recursive: true, force: true });
            } catch (error) {
              return envelope("incomplete", "nmg-sdlc-smoke cleanup_failed", identity, [
                commandEvidence("remove retained smoke clone", { error }),
                retainedCloneEvidence(state.clonePath),
              ]);
            }
          }
          state = null;
          supersedeFailedState = true;
        } else {
          return envelope("failed", "nmg-sdlc-smoke recovery identity mismatch", identity, [
            ...(typeof state.clonePath === "string" ? [retainedCloneEvidence(state.clonePath)] : []),
          ]);
        }
      }
    }
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

    // Only a retained recovery state for this issue skips the GitHub check; a fresh run (including one
    // that superseded a receipt-less failure) rechecks the recorded issue first.
    if (queue.kind === "recorded" && !(state && provisioned?.published)) {
      const [issue] = issues;
      const published = await publishedSpec(executeCommand, env, request.signal, issue);
      recordedEvidence.push(...published.evidence);
      if (published.status !== "passed") {
        return envelope(published.status, `${NOT_PROVISIONED}: ${published.reason}`, identity);
      }
      recordedEvidence.push({
        kind: "github",
        summary: `provisioned smoke issue #${issue} ${published.issueUrl}; spec PR ${published.pull.url} MERGED`,
        artifact: published.pull.url,
      });
      provisioned = { issue, published: true };
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
      // Receipts from the failed invocation must cover a non-empty leading prefix of the queue.
      const delivered = [];
      for (const issue of issues) {
        const immutable = state.expected.find((entry) => entry.issue === issue);
        if (!immutable) break;
        const recovered = readRecoveryRecord(readFile, work, state.nestedRunId, issue);
        if (!recovered
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
        delivered.push(recovered);
      }
      if (!delivered.length || delivered.length !== state.expected.length) {
        return retain("failed", `nmg-sdlc-smoke execute exited ${state.executeStatus}`, evidence);
      }
      const baselines = new Map();
      for (const issue of issues) {
        const baseline = state.baselines.find((entry) => entry.issue === issue);
        if (!validBaseline(baseline, issue)) {
          return retain("failed", `nmg-sdlc-smoke issue #${issue} baseline unavailable`, evidence);
        }
        baselines.set(issue, new Set(baseline.pullRequests.map(pullRequestIdentity)));
      }
      if (delivered.length === issues.length) {
        return verifyRemoteDelivery({ expected: delivered, baselines, evidence, recovered: true });
      }

      // Resume only the undelivered remainder in the retained clone under the same invocation
      // token; delivered issues are never dispatched again and keep their original receipts.
      const remaining = issues.slice(delivered.length);
      if (state.nestedRunId !== scope.recoveryKey
        || !/^[0-9a-f]{64}$/.test(state.tokenSecret ?? "")
        || remaining.some((issue) => recordedDelivery(readFile, work, issue))) {
        return retain("failed", `nmg-sdlc-smoke execute exited ${state.executeStatus}`, evidence);
      }
      const priorStatus = state.executeStatus;
      const sessionId = randomUUID();
      state = { ...state, phase: "running", executeStatus: null, executeSessionId: sessionId };
      recoveryStore.write(scope.recoveryKey, state, { replace: true });
      const resumed = await executeCommand("claude", deliverySessionArgs({
        pluginRoot, permissionMode, sessionId, issues: remaining,
      }), {
        cwd: work,
        env: {
          ...env,
          NMG_SDLC_PLUGIN_ROOT: pluginRoot,
          NMG_SDLC_SMOKE_OWNED: "1",
          NMG_SDLC_SMOKE_RECOVERY: recoveryToken(scope.recoveryKey, state.tokenSecret),
        },
        signal: request.signal,
      });
      const resumedStatus = environmentalFailure(resumed) ? null : executeResultStatus(readFile, work, sessionId, resumed);
      evidence.push(commandEvidence(
        `claude /sdlc-execute ${remaining.map((issue) => `#${issue}`).join(" ")} (resumed after ${delivered.map(({ issue }) => `#${issue}`).join(", ")}, session ${sessionId})`,
        resumed,
        work,
      ));
      const receipts = [];
      for (const issue of issues) {
        const proof = recordedDelivery(readFile, work, issue);
        if (!proof) break;
        receipts.push({ issue, ...proof });
      }
      const consistent = receipts.every((receipt) => receipt.invocationId === scope.recoveryKey)
        && delivered.every((prior, index) => equal(receipts[index], prior))
        && !issues.slice(receipts.length).some((issue) => recordedDelivery(readFile, work, issue));
      if (!consistent) {
        recoveryStore.write(scope.recoveryKey, { ...state, phase: "completed_unproven" }, { replace: true });
        return retain("failed", "nmg-sdlc-smoke resumed invocation receipts inconsistent", evidence);
      }
      const environmental = environmentalFailure(resumed);
      state = {
        ...state,
        phase: "failed",
        executeStatus: environmental || resumedStatus === 0 ? priorStatus : resumedStatus,
        expected: receipts,
      };
      recoveryStore.write(scope.recoveryKey, state, { replace: true });
      if (environmental) return retain("incomplete", `nmg-sdlc-smoke execute ${resumed.reasonCode}`, evidence);
      if (receipts.length === issues.length) {
        return verifyRemoteDelivery({ expected: receipts, baselines, evidence, recovered: true });
      }
      return retain("failed", resumedStatus === 0
        ? `nmg-sdlc-smoke issue #${issues[receipts.length]} missing invocation delivery proof`
        : `nmg-sdlc-smoke resumed execute exited ${resumedStatus}`, evidence);
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
      const sessionId = randomUUID();
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
        executeSessionId: sessionId,
        expected: [],
        validationConfig: canonical(request.config),
        candidateTree: launchedCandidate,
        ...(provisioned ? { provisioned } : {}),
      };
      recoveryStore.write(scope.recoveryKey, state, { replace: supersedeFailedState });
      const execute = await executeCommand("claude", deliverySessionArgs({
        pluginRoot, permissionMode, sessionId, issues,
      }), {
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
        commandEvidence(`claude /sdlc-execute ${issues.map((issue) => `#${issue}`).join(" ")} (session ${sessionId})`, execute, work),
      ];
      if (environmentalFailure(execute)) {
        recoveryStore.write(scope.recoveryKey, { ...state, phase: "incomplete" }, { replace: true });
        return retain("incomplete", `nmg-sdlc-smoke execute ${execute.reasonCode}`, evidence);
      }
      const launchStatus = executeResultStatus(readFile, work, sessionId, execute);
      if (launchStatus !== 0) {
        const nested = nestedRunIdentity(readFile, work, issues, scope.recoveryKey);
        state = {
          ...state,
          phase: "failed",
          executeStatus: launchStatus,
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
        return retain("failed", `nmg-sdlc-smoke execute exited ${launchStatus}`, invocationEvidence);
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
  return async function smokeProvider(request) {
    const recordedEvidence = [];
    const result = await deliverSmoke(request, recordedEvidence);
    return recordedEvidence.length ? { ...result, evidence: [...recordedEvidence, ...result.evidence] } : result;
  };
}

export const extension = Object.freeze({
  schemaVersion: 1,
  id: "project.nmg-sdlc-smoke",
  providers: Object.freeze({
    "project.nmg-sdlc-smoke": createSmokeProvider(),
  }),
});
