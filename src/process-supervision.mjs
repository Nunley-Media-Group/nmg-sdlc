import { spawn } from "node:child_process";

function alreadyExited(error) {
  return error?.code === "ESRCH";
}

function waitForClose(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("close", resolve));
}

function waitForResult(child) {
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("close", (code, signal) => resolve({ code, signal, error: null }));
  });
}

export async function terminateOwnedProcessGroup(child, {
  platform = process.platform,
  killGroup = process.kill,
  spawnProcess = spawn,
  signal = "SIGKILL",
  closed = false,
} = {}) {
  const pid = child?.pid;
  if (closed || child?.exitCode !== null || child?.signalCode !== null || !Number.isInteger(pid) || pid <= 0) {
    return { ok: true, alreadyExited: true };
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
      if (child.exitCode !== null || child.signalCode !== null) return { ok: true, alreadyExited: true };
      return { ok: false, error: new Error(`taskkill exited ${result.code}`) };
    }
    await waitForClose(child);
    return { ok: true, alreadyExited: false };
  }

  try {
    killGroup(-pid, signal);
  } catch (error) {
    if (alreadyExited(error)) return { ok: true, alreadyExited: true };
    return { ok: false, error };
  }
  await waitForClose(child);
  return { ok: true, alreadyExited: false };
}
