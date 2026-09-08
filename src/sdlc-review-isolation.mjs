import { appendFileSync, existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const isolationModule = pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function isSelPart(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;
  if (t === "raw" || t === "conflicts") return true;
  if (/^\d+(?:-\d*|\+\d*)?$/.test(t)) return true;
  if (/^(\d+(?:-\d*|\+\d*)?)(,\d+(?:-\d*|\+\d*)?)+$/.test(t)) return true;
  return false;
}

function isSupportedSelector(sel) {
  if (typeof sel !== "string" || sel.length === 0) return false;
  const parts = sel.split(":");
  return parts.length > 0 && parts.every(isSelPart);
}

function peelPathAndSelector(requested) {
  if (typeof requested !== "string" || requested.length === 0) {
    return { base: "", selector: null, isBad: true, reason: "path_unreadable", isLiteral: false };
  }
  const p = requested;
  if (p.includes("?") || p.includes("#")) {
    return { base: p, selector: null, isBad: true, reason: "unsupported_selector", isLiteral: false };
  }
  if (p.includes("!")) {
    return { base: p, selector: "archive", isBad: true, reason: "archive_member", isLiteral: false };
  }
  // Prefer literal path if it exists as a file (OMP #4618) -- snapshot relative later
  try {
    const st = lstatSync(p);
    if (st.isFile()) {
      return { base: p, selector: null, isBad: false, isLiteral: true };
    }
  } catch {}
  // split and strip only trailing supported selector segments (handles compounds like :50-100:raw and comma lists)
  const parts = p.split(":");
  let selParts = [];
  let baseEnd = parts.length;
  for (let j = parts.length - 1; j > 0; j--) {
    if (isSelPart(parts[j])) {
      selParts.unshift(parts[j]);
      baseEnd = j;
    } else {
      break;
    }
  }
  const base = parts.slice(0, baseEnd).join(":");
  const selector = selParts.length ? selParts.join(":") : null;
  const hadNonSelColon = parts.length > 1 && selector === null;
  if (hadNonSelColon) {
    return { base: p, selector: null, isBad: true, reason: "archive_member", isLiteral: false };
  }
  return { base, selector, isBad: false, isLiteral: false };
}

export function isAllowedSnapshotRead(requestedPath, assignment) {
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    return { allowed: false, reason: "path_unreadable" };
  }
  const peeled = peelPathAndSelector(requestedPath);
  if (peeled.isBad) {
    return { allowed: false, reason: peeled.reason || "unsupported_selector" };
  }
  const base = peeled.base;
  // block traversals like allowed/../x even if final realpath resolves inside
  if (base.split(/[/\\]/).includes("..")) {
    return { allowed: false, reason: "outside_snapshot" };
  }
  // scheme only on cleaned base (non-literals), first : before any path sep
  if (!peeled.isLiteral && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(base) && base.indexOf("/") < 0 && base.indexOf("\\") < 0) {
    return { allowed: false, reason: "url_read" };
  }
  if (peeled.selector && !isSupportedSelector(peeled.selector)) {
    return { allowed: false, reason: "unsupported_selector" };
  }
  if (!assignment || typeof assignment !== "object" || typeof assignment.snapshotDir !== "string" || !Array.isArray(assignment.allowedPaths)) {
    return { allowed: false, reason: "assignment_invalid" };
  }
  const snapDir = assignment.snapshotDir;
  let resolved;
  try {
    resolved = resolve(snapDir, base);
  } catch {
    return { allowed: false, reason: "path_unreadable" };
  }
  let realSnap;
  try {
    realSnap = realpathSync(snapDir);
  } catch {
    return { allowed: false, reason: "snapshot_unreadable" };
  }
  if (!existsSync(resolved)) {
    return { allowed: false, reason: "outside_snapshot" };
  }
  let realTgt;
  try {
    realTgt = realpathSync(resolved);
  } catch {
    return { allowed: false, reason: "outside_snapshot" };
  }
  const rel = relative(realSnap, realTgt);
  if (rel === "" || isAbsolute(rel) || rel.split(sep).includes("..")) {
    return { allowed: false, reason: "outside_snapshot" };
  }
  const posixRel = rel.split(sep).join("/");
  if (!assignment.allowedPaths.includes(posixRel)) {
    return { allowed: false, reason: "not_allowed_path" };
  }
  return { allowed: true, reason: "allowed" };
}

export function loadReviewAssignment(assignmentPath) {
  if (typeof assignmentPath !== "string" || !isAbsolute(assignmentPath)) {
    return { assignment: null, assignmentDigest: null };
  }
  try {
    const rawBytes = readFileSync(assignmentPath);
    const raw = rawBytes.toString("utf8");
    const assignment = JSON.parse(raw);
    const assignmentDigest = hashBytes(rawBytes);
    if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
      return { assignment: null, assignmentDigest: null };
    }
    if (typeof assignment.issue !== "number" || !Number.isInteger(assignment.issue) || assignment.issue < 1) {
      return { assignment: null, assignmentDigest: null };
    }
    const idStrs = ["sliceId", "runId", "invocationId", "baseSha", "headSha", "specDigest"];
    if (idStrs.some((k) => typeof assignment[k] !== "string" || assignment[k].length === 0)) {
      return { assignment: null, assignmentDigest: null };
    }
    if (!["review1", "review2"].includes(assignment.step)) {
      return { assignment: null, assignmentDigest: null };
    }
    if (!Array.isArray(assignment.allowedPaths) || assignment.allowedPaths.length === 0) {
      return { assignment: null, assignmentDigest: null };
    }
    for (const p of assignment.allowedPaths) {
      if (typeof p !== "string" || p.length === 0 ||
          isAbsolute(p) || p.includes("\\") ||
          p.split("/").some((seg) => !seg || seg === "." || seg === "..")) {
        return { assignment: null, assignmentDigest: null };
      }
    }
    if (typeof assignment.snapshotDir !== "string" || !isAbsolute(assignment.snapshotDir)) {
      return { assignment: null, assignmentDigest: null };
    }
    return { assignment, assignmentDigest };
  } catch {
    return { assignment: null, assignmentDigest: null };
  }
}

export function inspectReviewReceipts(assignmentPath, receiptPath) {
  const loaded = loadReviewAssignment(assignmentPath);
  const assignment = loaded.assignment;
  const assignmentDigest = loaded.assignmentDigest;
  if (!assignment || !assignmentDigest || typeof receiptPath !== "string") {
    return { valid: false, contaminated: false, reasonCode: "review_scope_unproven" };
  }
  let receipts = [];
  try {
    const content = readFileSync(receiptPath, "utf8");
    const lines = content.trim().split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        return { valid: false, contaminated: false, reasonCode: "review_scope_unproven" };
      }
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        return { valid: false, contaminated: false, reasonCode: "review_scope_unproven" };
      }
      receipts.push(r);
    }
  } catch {
    return { valid: false, contaminated: false, reasonCode: "review_scope_unproven" };
  }
  const inv = assignment.invocationId;
  for (const r of receipts) {
    if (r.invocationId !== inv || r.assignmentDigest !== assignmentDigest) {
      return { valid: false, contaminated: false, reasonCode: "review_scope_unproven" };
    }
  }
  if (receipts.some((r) => r && r.event === "arm_failed")) {
    return { valid: false, contaminated: false, reasonCode: "review_scope_unproven" };
  }
  const start = receipts.find((r) => r.event === "session_start" && r.assignmentDigest === assignmentDigest && r.isolationModule === isolationModule);
  if (!start || !Object.hasOwn(start, "activeTools")) {
    return { valid: false, contaminated: false, reasonCode: "review_scope_unproven" };
  }
  const active = start.activeTools;
  if (!Array.isArray(active) || active.length !== 1 || active[0] !== "read") {
    return { valid: false, contaminated: false, reasonCode: "review_scope_unproven" };
  }
  let contaminated = false;
  for (const r of receipts) {
    if (r && r.decision === "allow") {
      if (r.event === "tool_call") {
        const t = r.toolName;
        const pth = r.path;
        if (t !== "read" || !isAllowedSnapshotRead(pth, assignment).allowed) {
          contaminated = true;
          break;
        }
      } else {
        contaminated = true;
        break;
      }
    }
  }
  const result = receipts.findLast((receipt) => receipt.event === "review_result");
  if (result && (result.stopReason !== "stop" || typeof result.text !== "string")) {
    return { valid: false, contaminated: false, reasonCode: "review_scope_unproven" };
  }
  return {
    valid: true, contaminated, reasonCode: contaminated ? "invalid_review_slice" : null,
    ...(result ? { resultText: result.text } : {}),
  };
}

export function installReviewIsolation(pi, { env = process.env } = {}) {
  const isReviewSlice = !!(env && env.NMG_SDLC_REVIEW_SLICE === "1");
  if (!isReviewSlice) {
    // ordinary sessions: unchanged, no handlers, no setActiveTools, no receipts
    return;
  }
  const assignmentPath = env.NMG_SDLC_REVIEW_ASSIGNMENT;
  const receiptPath = env.NMG_SDLC_REVIEW_RECEIPT;

  let armed = false;
  let allowRead = false;
  let assignment = null;
  let assignmentDigest = null;
  let invocationId = null;

  function appendReceipt(entry) {
    if (!receiptPath) {
      throw new Error("nmg-sdlc review isolation: receipt_path_missing");
    }
    const full = { ...entry, isolationModule, at: new Date().toISOString() };
    if (invocationId) full.invocationId = invocationId;
    if (assignmentDigest) full.assignmentDigest = assignmentDigest;
    try {
      appendFileSync(receiptPath, JSON.stringify(full) + "\n", "utf8");
    } catch {
      throw new Error("nmg-sdlc review isolation: receipt_append_failed");
    }
  }

  // Synchronous deny-all registration at factory load, before any await / session_start body / input handlers
  pi.on("tool_call", (event, ctx) => {
    const e = (event ?? {});
    const toolName = e.toolName || e.name || "unknown";
    const input = e.input || {};
    const pth = input.path;
    let correctRoot = true;
    if (armed && toolName === "read" && typeof pth === "string" && !isAbsolute(pth)) {
      try {
        correctRoot = typeof ctx?.cwd === "string"
          && realpathSync(ctx.cwd) === realpathSync(assignment.snapshotDir);
      } catch { correctRoot = false; }
    }
    if (!armed || toolName !== "read" || !allowRead || !assignment || !correctRoot || !isAllowedSnapshotRead(pth, assignment).allowed) {
      const rc = !armed ? "not_armed" : toolName !== "read" ? "non_read_tool"
        : !correctRoot ? "snapshot_root_mismatch" : "disallowed_path";
      try { appendReceipt({ event: "tool_call", decision: "block", toolName, path: pth, reasonCode: rc }); } catch {}
      return { block: true, reason: `nmg-sdlc review isolation: ${rc}` };
    }
    // allow path: append must succeed or throw (fail-closed per tool_call contract)
    appendReceipt({ event: "tool_call", decision: "allow", toolName, path: pth });
    return undefined;
  });

  pi.on("user_bash", (event) => {
    const command = (event && event.command) || "";
    const output = "nmg-sdlc review isolation: user_bash blocked";
    const totalBytes = Buffer.byteLength(output, "utf8");
    try { appendReceipt({ event: "user_bash", decision: "block", command }); } catch {}
    return {
      result: {
        output,
        exitCode: 1,
        cancelled: false,
        truncated: false,
        totalLines: 1,
        totalBytes,
        outputLines: 1,
        outputBytes: totalBytes,
      },
    };
  });

  pi.on("user_python", (event) => {
    const code = (event && event.code) || "";
    const output = "nmg-sdlc review isolation: user_python blocked";
    const totalBytes = Buffer.byteLength(output, "utf8");
    try { appendReceipt({ event: "user_python", decision: "block", code }); } catch {}
    return {
      result: {
        output,
        exitCode: 1,
        cancelled: false,
        truncated: false,
        totalLines: 1,
        totalBytes,
        outputLines: 1,
        outputBytes: totalBytes,
        displayOutputs: [],
        stdinRequested: false,
      },
    };
  });

  // session_start handler arms (async only the activation; registration was sync)
  pi.on("session_start", async (_event, ctx) => {
    if (!assignmentPath || !receiptPath) {
      try { appendReceipt({ event: "arm_failed", reason: "missing_env_paths" }); } catch {}
      return;
    }
    const loaded = loadReviewAssignment(assignmentPath);
    assignment = loaded.assignment;
    assignmentDigest = loaded.assignmentDigest;
    if (!assignment || !assignmentDigest) {
      try { appendReceipt({ event: "arm_failed", reason: "assignment_unreadable" }); } catch {}
      return;
    }
    invocationId = assignment.invocationId;

    let proofOk = false;
    let current = null;
    let activationError = null;
    try {
      await pi.setActiveTools(["read"]);
      if (typeof pi.getActiveTools !== "function") throw new Error("getActiveTools unavailable");
      current = await pi.getActiveTools();
      const arr = Array.isArray(current) ? current : [];
      if (arr.length === 1 && arr[0] === "read") {
        proofOk = true;
      }
    } catch (error) { activationError = String(error?.message ?? error); }

    if (!proofOk) {
      try { appendReceipt({ event: "arm_failed", reason: "setActiveTools_failed", activeTools: current, error: activationError }); } catch {}
      armed = false;
      allowRead = false;
      return;
    }

    appendReceipt({
      event: "session_start",
      activeTools: ["read"],
    });

    armed = true;
    allowRead = true;
  });
  pi.on("message_end", (event) => {
    const message = event?.message;
    if (!armed || message?.role !== "assistant" || message.stopReason !== "stop") return;
    if (!Array.isArray(message.content) || message.content.some((part) => part.type === "toolCall")) return;
    const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    appendReceipt({ event: "review_result", stopReason: "stop", text });
  });
}
