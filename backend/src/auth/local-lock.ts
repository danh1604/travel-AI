import {
  mkdir,
  open,
  readFile,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { join } from "node:path";

function hasCode(error: unknown, code: string) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code
  );
}
function busy() {
  return new Error(
    "Local auth database is already open or its lock cannot be verified. Stop the backend before running an admin command. Never remove a lock while its owner is running.",
  );
}
function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !hasCode(error, "ESRCH");
  }
}
async function contents(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
}
async function removeMissingOk(path: string) {
  try {
    await unlink(path);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
}

export async function acquireLocalAuthLock(
  directory?: string,
): Promise<() => Promise<void>> {
  if (!directory) return async () => {};
  await mkdir(directory, { recursive: true });
  const path = join(directory, ".process.lock");
  const owner = String(process.pid);

  async function create(): Promise<FileHandle> {
    const file = await open(path, "wx", 0o600);
    try {
      await file.writeFile(owner);
      await file.sync();
    } catch (error) {
      await file.close();
      await removeMissingOk(path);
      throw error;
    }
    return file;
  }
  let lock: FileHandle;
  try {
    lock = await create();
  } catch (error) {
    if (!hasCode(error, "EEXIST")) throw error;
    const previous = await contents(path);
    if (previous === undefined) {
      // The previous owner may have finished a normal shutdown between open/read.
      try {
        lock = await create();
      } catch (retryError) {
        if (hasCode(retryError, "EEXIST")) throw busy();
        throw retryError;
      }
    } else {
      const pid = Number(previous);
      if (
        !/^\d+$/.test(previous) ||
        !Number.isSafeInteger(pid) ||
        pid < 1 ||
        pid > 2_147_483_647 ||
        processAlive(pid)
      )
        throw busy();

      // Only one process can recover this stale owner. Without this claim, two
      // simultaneous recoveries could delete the fresh lock created by a winner.
      const recoveryPath = `${path}.recover-${pid}`;
      let recovery: FileHandle;
      try {
        recovery = await open(recoveryPath, "wx", 0o600);
      } catch (claimError) {
        if (hasCode(claimError, "EEXIST"))
          throw new Error(
            `Local auth lock recovery is already in progress. Retry shortly. If it persists after all backend/CLI processes stop, inspect ${recoveryPath}.`,
          );
        throw claimError;
      }
      try {
        await recovery.writeFile(owner);
        // Recheck under the recovery claim; never delete a changed or live lock.
        if ((await contents(path)) === previous && !processAlive(pid))
          await unlink(path);
        try {
          lock = await create();
        } catch (retryError) {
          if (hasCode(retryError, "EEXIST")) throw busy();
          throw retryError;
        }
      } finally {
        try {
          await recovery.close();
        } finally {
          await removeMissingOk(recoveryPath);
        }
      }
    }
  }
  let released = false;
  return async () => {
    if (released) return;
    await lock.close();
    // Preserve any externally replaced lock instead of unlinking another owner.
    if ((await contents(path)) === owner) await removeMissingOk(path);
    released = true;
  };
}
