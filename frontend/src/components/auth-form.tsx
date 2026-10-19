"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { authFetch, type User } from "@/lib/auth";
import { useAuth } from "./auth-provider";
import { adminReturnPath } from "@/lib/admin-access";

export function AuthForm({ mode, area = "customer", returnTo }: { mode: "login" | "register"; area?: "customer" | "admin"; returnTo?: string }) {
  const register = mode === "register", router = useRouter(), { setUser } = useAuth();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const values = new FormData(event.currentTarget), password = String(values.get("password") ?? "");
    if (register && password !== values.get("confirmPassword")) { setError("Hai mật khẩu chưa trùng khớp."); setPending(false); return; }
    const body = { email: String(values.get("email") ?? ""), password, ...(register ? { name: String(values.get("name") ?? "") } : {}) };
    try {
      const result = await authFetch<{ user: User }>(mode, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setUser(result.user);
      if (area === "admin" && result.user.role !== "ADMIN") { setError("Tài khoản này không có quyền quản trị. Bạn có thể quay về trang khách hàng hoặc dùng tài khoản quản trị khác."); return; }
      router.replace(area === "admin" ? adminReturnPath(returnTo) : "/account");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.status === 401 ? "Email hoặc mật khẩu không đúng." : reason.status === 409 ? "Email này đã được sử dụng. Bạn có thể đăng nhập." : reason.status === 429 ? "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau." : reason.status === 400 ? "Kiểm tra tên, email và mật khẩu từ 12–128 ký tự." : "Chưa kết nối được dịch vụ tài khoản. Vui lòng thử lại." : "Chưa kết nối được dịch vụ tài khoản. Vui lòng thử lại.");
    } finally { setPending(false); }
  }
  return <main className="mx-auto grid max-w-6xl items-stretch gap-8 px-4 py-10 sm:px-8 sm:py-14 lg:grid-cols-[1fr_1.05fr]">
    <aside className="relative hidden overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-700 via-emerald-900 to-teal-950 p-10 text-white shadow-2xl shadow-emerald-950/25 lg:flex lg:flex-col">
      <div aria-hidden="true" className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-emerald-300/25 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-orange-300/20 blur-3xl" />
      <p className="relative text-xs font-bold uppercase tracking-[.2em] text-emerald-200">PickYourWay AI</p>
      <h2 className="display-type relative mt-auto text-4xl leading-tight">{area === "admin" ? "Chăm chút từng hành trình cho khách." : "Mỗi chuyến đi bắt đầu từ một ý tưởng nhỏ."}</h2>
      <ul className="relative mt-8 space-y-3 text-sm text-white/80">{(area === "admin" ? ["Quản lý tour & lịch khởi hành", "Kiểm duyệt đánh giá", "Quản lý tài khoản"] : ["Lịch trình AI theo từng ngày", "Lưu & chỉnh sửa chuyến đi", "Gợi ý tour khởi hành gần nhất"]).map((item) => <li key={item} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">✓</span>{item}</li>)}</ul>
    </aside>
    <div className="mx-auto w-full max-w-md py-4 lg:py-10"><p className="eyebrow">{area === "admin" ? "Quản trị" : "Tài khoản"}</p><h1 className="display-type mt-3 text-4xl">{area === "admin" ? "Đăng nhập quản trị" : register ? "Bắt đầu hành trình" : "Chào mừng trở lại"}</h1><p className="mt-4 text-sm leading-6 text-stone-600">{area === "admin" ? "Không gian quản lý tour, lịch khởi hành và khách hàng của PickYourWay." : register ? "Tạo tài khoản của bạn để chuẩn bị cho những chuyến đi tiếp theo." : "Đăng nhập để tiếp tục với tài khoản của bạn."}</p>
    <form onSubmit={submit} className="card mt-8 space-y-5 p-6 sm:p-7">
      {register && <label className="block text-sm font-semibold">Tên của bạn<input className="field mt-2" name="name" autoComplete="name" minLength={2} maxLength={80} required disabled={pending} /></label>}
      <label className="block text-sm font-semibold">Email<input className="field mt-2" name="email" type="email" autoComplete="email" maxLength={254} required disabled={pending} /></label>
      <label className="block text-sm font-semibold">Mật khẩu<input className="field mt-2" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={12} maxLength={128} required disabled={pending} />{register && <span className="mt-2 block text-xs font-normal text-stone-500">Dùng từ 12–128 ký tự; có thể dùng một cụm từ dài dễ nhớ.</span>}</label>
      {register && <label className="block text-sm font-semibold">Nhập lại mật khẩu<input className="field mt-2" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={pending} /></label>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="submit" disabled={pending} className="button-primary w-full disabled:cursor-wait disabled:opacity-60">{pending ? "Đang xử lý…" : register ? "Tạo tài khoản →" : "Đăng nhập →"}</button>
    </form>
    {area === "admin" ? <p className="mt-6 text-center text-sm text-stone-600"><Link href="/login" className="font-semibold text-emerald-800 underline">Đăng nhập dành cho khách hàng</Link></p> : <p className="mt-6 text-center text-sm text-stone-600">{register ? "Đã có tài khoản?" : "Chưa có tài khoản?"} <Link href={register ? "/login" : "/register"} className="font-semibold text-emerald-800 underline">{register ? "Đăng nhập" : "Đăng ký"}</Link></p>}
    </div>
  </main>;
}
