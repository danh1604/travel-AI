import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  spawn,
  execFileSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLocalAuthLock } from "../src/auth/local-lock.js";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

const lockModule = new URL("../src/auth/local-lock.ts", import.meta.url).href;
const repositoryModule = new URL(
  "../src/auth/local-repository.ts",
  import.meta.url,
).href;
async function temporary(t: import("node:test").TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "pwy-lock-test-"));
  t.after(async () => {
    const target = resolve(directory);
    assert.ok(
      target.startsWith(`${resolve(tmpdir())}${sep}`) &&
        basename(target).startsWith("pwy-lock-test-"),
    );
    await rm(target, { recursive: true, force: true });
  });
  return directory;
}
function deadPid() {
  return Number(
    execFileSync(
      process.execPath,
      ["-e", "process.stdout.write(String(process.pid))"],
      { encoding: "utf8" },
    ),
  );
}
function worker(code: string) {
  return spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "pipe" },
  );
}
async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
}
function line(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolveLine, reject) => {
    let output = "",
      errors = "";
    const timeout = setTimeout(
      () => reject(new Error(`Child did not become ready: ${errors}`)),
      30_000,
    );
    child.stdout.on("data", (data) => {
      output += String(data);
      if (output.includes("\n")) {
        clearTimeout(timeout);
        resolveLine(output.slice(0, output.indexOf("\n")));
      }
    });
    child.stderr.on("data", (data) => {
      errors = (errors + String(data)).slice(-2000);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (!output.includes("\n"))
        reject(new Error(`Child exited ${code}: ${errors}`));
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

test("a dead owner's lock is recovered without removing database files", async (t) => {
  const directory = await temporary(t),
    path = join(directory, ".process.lock");
  await writeFile(join(directory, "keep.txt"), "database marker");
  await writeFile(path, String(deadPid()));
  const release = await acquireLocalAuthLock(directory);
  try {
    assert.equal(await readFile(path, "utf8"), String(process.pid));
    await assert.rejects(acquireLocalAuthLock(directory), /already open/);
    assert.equal(
      await readFile(join(directory, "keep.txt"), "utf8"),
      "database marker",
    );
  } finally {
    await release();
  }
  await release(); // Closing the same owner twice is harmless.
  await assert.rejects(readFile(path), { code: "ENOENT" });
});

test("live and unverifiable locks are never removed", async (t) => {
  const directory = await temporary(t),
    path = join(directory, ".process.lock");
  for (const owner of [
    String(process.pid),
    "",
    "invalid",
    "0",
    "-1",
    "999999999999999999999",
  ]) {
    await writeFile(path, owner);
    await assert.rejects(acquireLocalAuthLock(directory), /already open/);
    assert.equal(await readFile(path, "utf8"), owner);
  }
});

test("competing processes cannot replace a recovered live lock", async (t) => {
  const directory = await temporary(t),
    path = join(directory, ".process.lock");
  await writeFile(path, String(deadPid()));
  const code = `import {acquireLocalAuthLock} from ${JSON.stringify(lockModule)};
    try { await acquireLocalAuthLock(${JSON.stringify(directory)}); process.stdout.write('ACQUIRED\\n'); }
    catch { process.stdout.write('BUSY\\n'); }
    setInterval(()=>{},1000);`;
  const children = [worker(code), worker(code)];
  try {
    const responses = await Promise.all(children.map(line));
    assert.equal(responses.filter((value) => value === "ACQUIRED").length, 1);
    assert.equal(responses.filter((value) => value === "BUSY").length, 1);
    const winner = children[responses.indexOf("ACQUIRED")];
    assert.equal(await readFile(path, "utf8"), String(winner.pid));
  } finally {
    await Promise.all(children.map(stop));
  }
  const release = await acquireLocalAuthLock(directory);
  await release();
});

test("Admin account, password and session survive a killed backend and automatic recovery", async (t) => {
  const directory = await temporary(t),
    userId = randomUUID(),
    sessionId = randomUUID();
  const password = "restart resilient password",
    passwordHash = await hashPassword(password);
  const tokenHash = "c".repeat(64),
    email = "restart@example.test";
  const code = `import {createLocalAuthRepository} from ${JSON.stringify(repositoryModule)};
    const repo=await createLocalAuthRepository(${JSON.stringify(directory)});
    await repo.register(${JSON.stringify({ id: userId, name: "Restart Admin", email, role: "USER", passwordHash })},
      {id:${JSON.stringify(sessionId)},userId:${JSON.stringify(userId)},tokenHash:${JSON.stringify(tokenHash)},expiresAt:new Date(Date.now()+3600000)});
    await repo.promoteAdmin(${JSON.stringify(email)});
    process.stdout.write('READY\\n'); setInterval(()=>{},1000);`;
  const child = worker(code);
  let reopened:
    Awaited<ReturnType<typeof createLocalAuthRepository>> | undefined;
  try {
    assert.equal(await line(child), "READY");
    await assert.rejects(createLocalAuthRepository(directory), /already open/);
    await stop(child);
    assert.equal(
      await readFile(join(directory, ".process.lock"), "utf8"),
      String(child.pid),
    );
    reopened = await createLocalAuthRepository(directory);
    const user = await reopened.findByEmail(email);
    assert.equal(user?.role, "ADMIN");
    assert.equal(
      await verifyPassword(password, user?.passwordHash ?? null),
      true,
    );
    assert.equal(
      (await reopened.findSession(tokenHash, new Date()))?.role,
      "ADMIN",
    );
    assert.equal(await reopened.countUsers(), 1);
  } finally {
    await stop(child);
    await reopened?.close();
  }
});
