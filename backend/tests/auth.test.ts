import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import express from "express";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { createAuthRouter, sessionCookieName, tokenDigest } from "../src/auth/router.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { env } from "../src/config/env.js";

test("password hashing uses unique salts and verifies without storing plaintext", async () => {
  const password = "correct horse battery staple";
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second); assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong password phrase", first), false);
  assert.equal(await verifyPassword(password, null), false);
});

test("auth endpoints enforce sessions, origin and admin permissions", async (t) => {
  const repository = await createLocalAuthRepository();
  const app = express(); app.use(express.json()); app.use("/auth", createAuthRouter(async () => repository));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/auth`;
  const credentials = { email: "TRAVEL@Example.Test", password: "correct horse battery staple", name: "Test Traveler" };
  let cookie = "";
  const post = (path: string, body: unknown, session = "", origin = new URL(env.CLIENT_ORIGIN).origin) => fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(session ? { Cookie: session } : {}) }, body: JSON.stringify(body) });
  try {
    await t.test("anonymous access and origin rejection", async () => {
      assert.deepEqual(await (await fetch(`${base}/me`)).json(), { user: null });
      assert.equal((await fetch(`${base}/account`)).status, 401);
      assert.equal((await fetch(`${base}/admin/overview`)).status, 401);
      assert.equal((await post("register", credentials, "", "https://untrusted.test")).status, 403);
      assert.equal((await repository.countUsers()), 0);
    });
    await t.test("registration validation, role injection and normalized duplicate email", async () => {
      assert.equal((await post("register", { ...credentials, password: "short" })).status, 400);
      assert.equal((await post("register", { ...credentials, role: "ADMIN" })).status, 400);
      const response = await post("register", credentials);
      assert.equal(response.status, 201);
      const header = response.headers.get("set-cookie")!;
      assert.ok(header.includes("HttpOnly")); assert.ok(header.includes("SameSite=Lax"));
      assert.ok(!header.includes("Domain="));
      cookie = header.split(";")[0];
      const result = await response.json();
      assert.equal(result.user.role, "USER"); assert.equal(result.user.email, "travel@example.test");
      assert.ok(!("passwordHash" in result.user));
      const stored = await repository.findByEmail("travel@example.test");
      assert.ok(stored?.passwordHash?.startsWith("scrypt-v1$"));
      assert.equal((await post("register", { ...credentials, email: "travel@example.test" })).status, 409);
    });
    await t.test("role is checked in the backend and refreshed from the database", async () => {
      assert.equal((await fetch(`${base}/admin/overview`, { headers: { Cookie: cookie } })).status, 403);
      await repository.promoteAdmin("travel@example.test");
      const response = await fetch(`${base}/admin/overview`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200); assert.equal((await response.json()).stats.users, 1);
    });
    await t.test("wrong credentials, session rotation and logout revocation", async () => {
      const wrong = await post("login", { email: credentials.email, password: "wrong password phrase" });
      const unknown = await post("login", { email: "missing@example.test", password: "wrong password phrase" });
      assert.equal(wrong.status, 401); assert.deepEqual(await wrong.json(), await unknown.json());
      const loggedIn = await post("login", { email: credentials.email, password: credentials.password }, cookie);
      assert.equal(loggedIn.status, 200);
      const replacement = loggedIn.headers.get("set-cookie")!.split(";")[0];
      assert.notEqual(replacement, cookie);
      assert.deepEqual(await (await fetch(`${base}/me`, { headers: { Cookie: cookie } })).json(), { user: null });
      assert.equal((await post("logout", {}, replacement, "https://untrusted.test")).status, 403);
      assert.ok((await (await fetch(`${base}/me`, { headers: { Cookie: replacement } })).json()).user);
      const logout = await post("logout", {}, replacement);
      assert.equal(logout.status, 204); assert.ok(logout.headers.get("set-cookie")!.includes("Expires="));
      assert.deepEqual(await (await fetch(`${base}/me`, { headers: { Cookie: replacement } })).json(), { user: null });
      assert.equal((await post("logout", {})).status, 204);
    });
    await t.test("forged cookies and expired sessions cannot authenticate", async () => {
      assert.equal((await fetch(`${base}/account`, { headers: { Cookie: `${sessionCookieName}=${"f".repeat(64)}` } })).status, 401);
      const user = (await repository.findByEmail("travel@example.test"))!;
      const token = "a".repeat(64);
      const expires = new Date(Date.now() + 3600_000);
      await repository.createSession({ id: randomUUID(), userId: user.id, tokenHash: tokenDigest(token), expiresAt: expires });
      assert.ok(await repository.findSession(tokenDigest(token), new Date()));
      assert.equal(await repository.findSession(tokenDigest(token), new Date(expires.getTime() + 1)), null);
    });
    await t.test("login attempts are rate limited", async () => {
      // Invalid bodies are cheap to reject but still consume the per-IP limit.
      let status = 0;
      for (let attempt = 0; attempt < 31; attempt++) status = (await post("login", {})).status;
      assert.equal(status, 429);
    });
  } finally { server.close(); await repository.close(); }
});

test("local auth data survives reopen and prevents concurrent database writers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pickyourway-auth-test-"));
  try {
    const first = await createLocalAuthRepository(directory);
    const id = randomUUID(), token = "b".repeat(64);
    await first.register({ id, name: "Persistent User", email: "persist@example.test", role: "USER", passwordHash: await hashPassword("persistent password phrase") }, { id: randomUUID(), userId: id, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 3600_000) });
    await assert.rejects(createLocalAuthRepository(directory), /already open/);
    await first.close();
    const reopened = await createLocalAuthRepository(directory);
    assert.equal((await reopened.findSession(tokenDigest(token), new Date()))?.id, id);
    assert.equal(await reopened.countUsers(), 1);
    await reopened.close();
  } finally {
    assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`));
    assert.ok(basename(directory).startsWith("pickyourway-auth-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
