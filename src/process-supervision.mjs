import { spawn } from "node:child_process";

function alreadyExited(error) {
  return error?.code === "ESRCH";
}

function waitForClose(child) {
  if ((child.exitCode !== null || child.signalCode !== null)
    && (child.stdio ?? []).every((stream) => !stream || stream.destroyed)) return Promise.resolve();
  return new Promise((resolve) => child.once("close", resolve));
}

function waitForResult(child) {
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("close", (code, signal) => resolve({ code, signal, error: null }));
  });
}

export function terminateOwnedProcessGroup(child, options = {}) {
  // Ordinary completion/cancellation may race with exit. Do not target a PGID
  // that could have been reused after a previously completed invocation.
  if (child?.exitCode !== null || child?.signalCode !== null) {
    return Promise.resolve({ ok: true, alreadyExited: true });
  }
  return terminateOwnedProcessGroupAfterLeaderLoss(child, options);
}

// Only a caller that has just observed unexpected leader loss may bypass the
// normal exited-leader guard to stop this invocation's surviving descendants.
export async function terminateOwnedProcessGroupAfterLeaderLoss(child, {
  platform = process.platform,
  killGroup = process.kill,
  spawnProcess = spawn,
  signal = "SIGKILL",
} = {}) {
  const pid = child?.pid;
  if (pid === undefined) return { ok: true, alreadyExited: true };
  // -1 is a POSIX broadcast, never an owned process group.
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid > 0x7fffffff) {
    return { ok: false, error: new Error("invalid owned process group pid") };
  }

  if (platform === "win32") {
    let killer;
    try {
      killer = spawnProcess("taskkill", ["/pid", String(pid), "/t", "/f"], {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
    } catch (error) {
      if (alreadyExited(error)) return { ok: true, alreadyExited: true };
      return { ok: false, error };
    }
    const result = await waitForResult(killer);
    if (result.error) {
      if (alreadyExited(result.error)) return { ok: true, alreadyExited: true };
      return { ok: false, error: result.error };
    }
    if (result.code !== 0) {
      return { ok: false, error: new Error(`taskkill exited ${result.code}`) };
    }
    await waitForClose(child);
    return { ok: true, alreadyExited: false };
  }

  // The captured detached leader's PID remains the owned PGID after its exit.
  // Signal that group before waiting for pipes inherited by its descendants.
  try {
    killGroup(-pid, signal);
  } catch (error) {
    if (alreadyExited(error)) {
      if (child.exitCode !== null || child.signalCode !== null) await waitForClose(child);
      return { ok: true, alreadyExited: true };
    }
    return { ok: false, error };
  }
  await waitForClose(child);
  return { ok: true, alreadyExited: false };
}
