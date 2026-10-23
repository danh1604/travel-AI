"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { authFetch } from "@/lib/auth";
import { useAuth } from "@/components/auth-provider";
import { Icon, type IconName } from "@/components/icon";

const shortcuts: { href: string; title: string; text: string; icon: IconName }[] = [
  { href: "/admin/tours", title: "Quản lý tour", text: "Tìm tour, tạo mới, chỉnh sửa thông tin và bật/tắt hiển thị trên Explore.", icon: "compass" },
  { href: "/admin/categories", title: "Quản lý category", text: "Tổ chức danh mục tour. Ẩn một category sẽ ẩn các tour liên quan khỏi Explore.", icon: "map" },
  { href: "/admin/travel/destinations", title: "Điểm đến & dịch vụ", text: "Quản lý điểm đến, khách sạn, nhà hàng, điểm tham quan và phương tiện cùng mức giá tham khảo.", icon: "pin" },
  { href: "/admin/users", title: "Quản lý tài khoản", text: "Tìm người dùng, xem thông tin và cấp hoặc thu hồi quyền Admin ngay trên web.", icon: "user" },
  { href: "/admin/reviews", title: "Quản lý đánh giá tour", text: "Xem điểm sao và nhận xét; ẩn nội dung vi phạm hoặc hiển thị lại.", icon: "star" },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void authFetch<{ stats: { users: number } }>("admin/overview", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setUsers(result.stats.users);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setUsers(null);
          setError(
            reason instanceof ApiError && reason.status === 401
              ? "Bạn cần đăng nhập để truy cập trang quản trị."
              : reason instanceof ApiError && reason.status === 403
                ? "Tài khoản của bạn không có quyền quản trị."
                : "Dịch vụ quản trị tạm thời chưa sẵn sàng.",
          );
        }
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950 p-7 text-white shadow-xl shadow-emerald-950/15 sm:p-10">
        <div aria-hidden="true" className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-24 right-48 h-56 w-56 rounded-full bg-orange-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-200">Bảng điều khiển</p>
            <h1 className="display-type mt-3 text-3xl sm:text-4xl">Chào {user?.name ?? "bạn"}, chúc một ngày làm việc hiệu quả.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Quản lý tour, lịch khởi hành, tài khoản và đánh giá của PickYourWay tại một nơi.</p>
          </div>
          <div className="glass min-w-48 rounded-2xl p-5">
            <p className="flex items-center gap-2 text-xs text-emerald-100"><Icon name="user" className="h-4 w-4" /> Tài khoản ứng dụng</p>
            <p className="mt-2 text-4xl font-bold tracking-tight">
              {error ? "—" : users === null ? <span className="inline-block h-9 w-16 animate-pulse rounded-lg bg-white/20" /> : users}
            </p>
          </div>
        </div>
      </section>
      {error ? (
        <section role="alert" className="admin-card mt-8 border-red-200 p-6">
          <p className="font-semibold text-red-900">{error}</p>
          <div className="mt-5 flex gap-3">
            <Link href="/account" className="button-secondary">Tài khoản của tôi</Link>
            <button className="button-primary" onClick={() => setAttempt((value) => value + 1)}>Thử lại</button>
          </div>
        </section>
      ) : users === null ? (
        <p role="status" className="mt-8 text-sm text-stone-500">Đang kiểm tra quyền quản trị…</p>
      ) : (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-widest text-stone-400">Truy cập nhanh</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {shortcuts.map((item) => (
              <Link key={item.href} href={item.href} className="admin-card group flex gap-5 p-6 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg">
                <span className="icon-bubble h-12 w-12 shrink-0 rounded-2xl transition group-hover:bg-none group-hover:bg-emerald-600 group-hover:text-white"><Icon name={item.icon} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3 text-lg font-semibold">{item.title}<Icon name="arrow" className="h-4 w-4 shrink-0 text-stone-300 transition group-hover:translate-x-1 group-hover:text-emerald-600" /></span>
                  <span className="mt-2 block text-sm leading-6 text-stone-500">{item.text}</span>
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-6 flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm leading-6 text-emerald-900">
            <span aria-hidden="true">💡</span>
            Chọn “Ảnh & lịch trình” trong danh sách tour để bổ sung nội dung. Chọn “Lịch khởi hành” để quản lý ngày đi, giá và số chỗ. Tour vẫn giữ cờ cần rà soát.
          </p>
        </>
      )}
    </main>
  );
}
