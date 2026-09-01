import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const SMOKE_REPO = "https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git";
const SMOKE_OWNER = "Nunley-Media-Group";
const SMOKE_NAME = "nmg-sdlc-smoke";
const SHA = /^[0-9a-f]{40}$/i;
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
function waitForClose(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("close", resolve));
}

function terminateOwnedProcessGroup(child) {
  const pid = child?.pid;
  if (child?.exitCode !== null || child?.signalCode !== null || !Number.isInteger(pid) || pid <= 0) {
    return Promise.resolve({ ok: true, alreadyExited: true });
  }
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (error?.code === "ESRCH") return Promise.resolve({ ok: true, alreadyExited: true });
      return Promise.resolve({ ok: false, error });
    }
    return waitForClose(child).then(() => ({ ok: true, alreadyExited: false }));
  }
  return new Promise((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", (error) => {
      resolve(error?.code === "ESRCH" ? { ok: true, alreadyExited: true } : { ok: false, error });
    });
    killer.once("close", async (code) => {
      if (code !== 0) {
        if (child.exitCode !== null || child.signalCode !== null) resolve({ ok: true, alreadyExited: true });
        else resolve({ ok: false, error: new Error(`taskkill exited ${code}`) });
        return;
      }
      await waitForClose(child);
      resolve({ ok: true, alreadyExited: false });
    });
  });
}

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
    const cancel = async () => {
      if (settled || terminalOverride) return;
      terminalOverride = "cancelled";
      const cleanup = await terminateOwnedProcessGroup(child);
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
    child.once("close", (code, childSignal) => {
      if (terminalOverride || settled) return;
      if (typeof code === "number") settle({ status: code, signal: childSignal, reasonCode: code === 0 ? null : "failed" });
      else if (childSignal) settle({ status: null, signal: childSignal, reasonCode: "failed" });
      else settle({ status: null, signal: null, reasonCode: "process_lost" });
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
      && Number.isSafeInteger(proof?.pullRequest)
      && proof.pullRequest > 0
      && SHA.test(proof?.headSha ?? "")
      && proof?.recordedBeforeMerge === true
      ? {
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

export function createSmokeProvider({
  runCommand: executeCommand = runCommand,
  mkdtempSync: createTemp = mkdtempSync,
  readFileSync: readFile = readFileSync,
  rmSync: remove = rmSync,
  env = process.env,
} = {}) {
  return async function smokeProvider(request) {
    const identity = request.identity;
    const issues = configuredIssues(request.config, env);
    if (!issues) {
      return envelope("failed", "nmg-sdlc-smoke issues config invalid", identity);
    }
    if (env.NMG_SDLC_SMOKE_OWNED === "1") {
      return envelope("failed", "nmg-sdlc-smoke nested execution blocked", identity);
    }
    if (!validHerdrEnvironment(env)) {
      return envelope("failed", "nmg-sdlc-smoke Herdr environment missing", identity);
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

    const work = createTemp(join(tmpdir(), "nmg-sdlc-smoke-"));
    const retain = (status, summary, evidence = []) => envelope(status, summary, identity, [
      ...evidence,
      retainedCloneEvidence(work),
    ]);

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

      const baselines = new Map();
      const baselineEvidence = [];
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
      }

      const controller = join(request.projectRoot, "scripts", "sdlc-execute.mjs");
      const execute = await executeCommand(process.execPath, [
        controller,
        "run",
        ...issues.map((issue) => `#${issue}`),
      ], {
        cwd: work,
        env: { ...env, NMG_SDLC_SMOKE_OWNED: "1" },
        signal: request.signal,
      });
      const evidence = [
        cloneEvidence,
        ...baselineEvidence,
        commandEvidence(`sdlc-execute run ${issues.map((issue) => `#${issue}`).join(" ")}`, execute, work),
      ];
      if (environmentalFailure(execute)) {
        return retain("incomplete", `nmg-sdlc-smoke execute ${execute.reasonCode}`, evidence);
      }
      if (execute.status !== 0) {
        return retain("failed", `nmg-sdlc-smoke execute exited ${execute.status}`, evidence);
      }


      for (const issue of issues) {
        const delivery = recordedDelivery(readFile, work, issue);
        if (!delivery) {
          return retain("failed", `nmg-sdlc-smoke issue #${issue} missing invocation delivery proof`, evidence);
        }
        const issueResult = await executeCommand("gh", closingPrArgs(issue), {
          cwd: work,
          env,
          signal: request.signal,
        });
        const issueCommandEvidence = commandEvidence(`gh issue closing PR proof ${issue}`, issueResult);
        if (environmentalFailure(issueResult)) {
          return retain("incomplete", `nmg-sdlc-smoke issue proof ${issueResult.reasonCode}`, [...evidence, issueCommandEvidence]);
        }
        const issueProof = closingIssue(issueResult);
        if (issueProof?.state !== "CLOSED" || typeof issueProof.url !== "string" || issueProof.url.length === 0) {
          return retain("failed", `nmg-sdlc-smoke issue #${issue} is not CLOSED`, [...evidence, issueCommandEvidence]);
        }
        const baseline = baselines.get(issue);
        const candidates = issueProof.pullRequests.filter((pr) => !baseline.has(pullRequestIdentity(pr)));
        const matches = candidates.filter((pr) => (
          pr?.number === delivery.pullRequest
          && pr?.state === "MERGED"
          && typeof pr.url === "string"
          && pr.url.length > 0
          && String(pr.headRefOid ?? "").toLowerCase() === delivery.headSha
        ));
        if (matches.length !== 1) {
          return retain("failed", `nmg-sdlc-smoke issue #${issue} missing new exact-head merged PR proof`, [...evidence, issueCommandEvidence]);
        }
        const pr = matches[0];
        evidence.push(issueCommandEvidence, {
          kind: "github",
          summary: `issue #${issue} ${issueProof.url} CLOSED; PR ${pr.url} MERGED at ${delivery.headSha}`,
          artifact: pr.url,
        });
      }

      try {
        remove(work, { recursive: true, force: true });
      } catch (error) {
        return retain("incomplete", "nmg-sdlc-smoke cleanup_failed", [
          ...evidence,
          commandEvidence("remove smoke clone", { error }),
        ]);
      }
      return envelope("passed", `nmg-sdlc-smoke delivered ${issues.map((issue) => `#${issue}`).join(", ")}`, identity, evidence);
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
