import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../config/env.js";
import { getAuthRepository } from "./repository.js";
import { hashPassword, verifyPassword } from "./password.js";
import { DuplicateEmail, publicUser, type AuthRepository, type PublicUser } from "./types.js";

const credentials = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  password: z.string().min(12).max(128),
}).strict();
const registration = credentials.extend({ name: z.string().trim().min(2).max(80) });
const sessionSeconds = 7 * 24 * 60 * 60;
export const sessionCookieName = env.NODE_ENV === "production" ? "__Host-pwy_session" : "pwy_session";
export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");

function cookieOptions() {
  return { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: env.SESSION_COOKIE_SAME_SITE, path: "/" } as const;
}
function clearCookie(response: Response) { response.clearCookie(sessionCookieName, cookieOptions()); }
export function readToken(request: Request): string | undefined {
  const matches = (request.headers.cookie ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${sessionCookieName}=`));
  if (matches.length !== 1) return undefined;
  const token = matches[0].slice(sessionCookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}
function session(userId: string) {
  const token = randomBytes(32).toString("hex");
  return { token, record: { id: randomUUID(), userId, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + sessionSeconds * 1000) } };
}
function setCookie(response: Response, token: string) { response.cookie(sessionCookieName, token, { ...cookieOptions(), maxAge: sessionSeconds * 1000 }); }

export function createAuthRouter(loader: () => Promise<AuthRepository> = getAuthRepository) {
  const router = Router();
  router.use((request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.get("Origin") !== new URL(env.CLIENT_ORIGIN).origin) {
        response.status(403).json({ error: "Yêu cầu không được phép." }); return;
      }
      if (!request.is("application/json")) {
        response.status(415).json({ error: "Yêu cầu phải dùng JSON." }); return;
      }
    }
    next();
  });
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau." } });
  const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Bạn đã tạo tài khoản quá nhiều lần. Vui lòng thử lại sau." } });
  async function currentUser(request: Request, response: Response): Promise<PublicUser | null> {
    const token = readToken(request);
    if (!token) return null;
    const user = await (await loader()).findSession(tokenDigest(token), new Date());
    if (!user) clearCookie(response);
    return user;
  }
  router.post("/register", registerLimit, async (request, response) => {
    const parsed = registration.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Tên cần từ 2–80 ký tự, email hợp lệ và mật khẩu từ 12–128 ký tự." }); return; }
    const { email, name, password } = parsed.data;
    const user = { id: randomUUID(), email, name, passwordHash: await hashPassword(password), role: "USER" as const };
    const created = session(user.id);
    try { await (await loader()).register(user, created.record); }
    catch (error) { if (error instanceof DuplicateEmail) { response.status(409).json({ error: "Email này đã được sử dụng." }); return; } throw error; }
    setCookie(response, created.token);
    response.status(201).json({ user: publicUser(user) });
  });
  router.post("/login", loginLimit, async (request, response) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Email hoặc mật khẩu không hợp lệ." }); return; }
    const repository = await loader();
    const user = await repository.findByEmail(parsed.data.email);
    const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? null);
    if (!user || !valid) { response.status(401).json({ error: "Email hoặc mật khẩu không đúng." }); return; }
    const created = session(user.id), previous = readToken(request);
    await repository.createSession(created.record, previous ? tokenDigest(previous) : undefined);
    setCookie(response, created.token);
    response.json({ user: publicUser(user) });
  });
  router.post("/logout", async (request, response) => {
    const token = readToken(request);
    if (token) await (await loader()).deleteSession(tokenDigest(token));
    clearCookie(response);
    response.status(204).end();
  });
  router.get("/me", async (request, response) => { response.json({ user: await currentUser(request, response) }); });
  router.get("/account", async (request, response) => {
    const user = await currentUser(request, response);
    if (!user) { response.status(401).json({ error: "Bạn cần đăng nhập." }); return; }
    response.json({ user });
  });
  router.get("/admin/overview", async (request, response) => {
    const user = await currentUser(request, response);
    if (!user) { response.status(401).json({ error: "Bạn cần đăng nhập." }); return; }
    if (user.role !== "ADMIN") { response.status(403).json({ error: "Bạn không có quyền quản trị." }); return; }
    response.json({ user, stats: { users: await (await loader()).countUsers() } });
  });
  router.use((error: unknown, _request: Request, response: Response, _next: import("express").NextFunction) => {
    console.warn("Authentication request failed:", error instanceof Error ? error.name : "unknown error");
    response.status(503).json({ error: "Dịch vụ tài khoản tạm thời chưa sẵn sàng. Vui lòng thử lại." });
  });
  return router;
}
