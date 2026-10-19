"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/admin";
import {
  accountAdminError,
  accountDate,
  type AccountList,
  type ManagedAccount,
} from "@/lib/account-admin";
import { useAuth } from "./auth-provider";

const field =
  "field mt-2";
const button =
  "button-secondary min-h-10 py-2 disabled:opacity-40";

function RoleEditor({
  account,
  list,
  busy,
  save,
  close,
}: {
  account: ManagedAccount;
  list: AccountList;
  busy: boolean;
  save: (role: "USER" | "ADMIN") => Promise<void>;
  close: () => void;
}) {
  const [role, setRole] = useState(account.role);
  const lastAdmin =
    account.role === "ADMIN" && account.canLogin && list.stats.loginAdmins <= 1;
  async function submit(event: FormEvent) {
    event.preventDefault();
    await save(role);
  }
  return (
    <section
      aria-labelledby="account-title"
      className="admin-card p-6 lg:sticky lg:top-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="account-title" className="text-xl font-semibold">
          Chi tiết tài khoản
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={close}
          className="text-sm underline disabled:opacity-40"
        >
          Đóng
        </button>
      </div>
      <p className="mt-5 break-words text-lg font-semibold">{account.name}</p>
      <p className="mt-1 break-all text-sm text-stone-600">{account.email}</p>
      {account.id === list.currentUserId && (
        <span className="mt-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          Tài khoản của bạn
        </span>
      )}
      <dl className="my-6 space-y-3 border-y border-stone-100 py-5 text-sm">
        <div>
          <dt className="text-xs text-stone-500">ID tài khoản</dt>
          <dd className="mt-1 break-all text-xs">{account.id}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Ngày tạo</dt>
          <dd className="mt-1">{accountDate(account.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-stone-500">Cập nhật gần nhất</dt>
          <dd className="mt-1">{accountDate(account.updatedAt)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stone-500">Phiên đăng nhập còn hạn</dt>
          <dd>{account.activeSessions}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stone-500">Thiết lập đăng nhập</dt>
          <dd>{account.canLogin ? "Đã có" : "Chưa có"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stone-500">Quyền hiện tại</dt>
          <dd className="font-semibold">{account.role}</dd>
        </div>
      </dl>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <label className="block text-sm font-medium">
            Quyền tài khoản
            <select
              className={field}
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "USER" | "ADMIN")
              }
            >
              <option value="USER" disabled={lastAdmin}>
                USER — Người dùng
              </option>
              <option value="ADMIN" disabled={!account.canLogin}>
                ADMIN — Quản trị viên
              </option>
            </select>
          </label>
          <p className="text-xs leading-5 text-stone-500">
            Admin có thể quản lý tài khoản và nội dung tour. USER sử dụng các
            chức năng dành cho người dùng.
          </p>
          {lastAdmin && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Đây là Admin có thể đăng nhập cuối cùng. Hãy cấp quyền cho tài
              khoản khác trước khi thu hồi quyền tại đây.
            </p>
          )}
          {!account.canLogin && (
            <p className="text-xs leading-5 text-stone-600">
              Tài khoản chưa thiết lập đăng nhập nên chưa thể được cấp quyền
              Admin.
            </p>
          )}
          {role !== account.role && (
            <p
              role="status"
              className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              Bạn sẽ đổi quyền của{" "}
              <strong className="break-all">{account.email}</strong> từ{" "}
              {account.role} sang {role}.
              {account.id === list.currentUserId &&
                role === "USER" &&
                " Sau khi lưu, bạn sẽ được chuyển về trang Tài khoản."}
            </p>
          )}
          <button
            type="submit"
            disabled={
              role === account.role ||
              (role === "USER" && lastAdmin) ||
              (role === "ADMIN" && !account.canLogin)
            }
            className="button-primary w-full disabled:opacity-40"
          >
            {busy ? "Đang lưu…" : "Lưu quyền tài khoản"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

export function AdminAccounts() {
  const router = useRouter(),
    { refresh } = useAuth();
  const [query, setQuery] = useState({ q: "", role: "", page: 1 });
  const [search, setSearch] = useState("");
  const [list, setList] = useState<AccountList | null>(null);
  const [selected, setSelected] = useState<ManagedAccount | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: query.q,
      role: query.role,
      page: String(query.page),
      limit: "20",
    });
    void adminFetch<AccountList>(`users?${params}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (query.page > Math.max(1, result.pagination.totalPages)) {
          setQuery((current) => ({
            ...current,
            page: Math.max(1, result.pagination.totalPages),
          }));
          return;
        }
        setList(result);
        setError("");
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setList(null);
          setError(accountAdminError(reason));
        }
      });
    return () => controller.abort();
  }, [query.q, query.role, query.page, attempt]);
  function reload() {
    setList(null);
    setSelected(null);
    setError("");
    setAttempt((value) => value + 1);
  }
  function filter(next: typeof query) {
    setList(null);
    setSelected(null);
    setError("");
    setNotice("");
    setQuery(next);
    setAttempt((value) => value + 1);
  }
  async function save(role: "USER" | "ADMIN") {
    if (!selected || !list || busy || role === selected.role) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminFetch<{ data: ManagedAccount }>(
        `users/${encodeURIComponent(selected.id)}/role`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, revision: selected.roleRevision }),
        },
      );
      if (
        result.data.id === list.currentUserId &&
        result.data.role !== "ADMIN"
      ) {
        await refresh();
        router.replace("/account");
        return;
      }
      setNotice(`Đã cập nhật ${result.data.email} thành ${result.data.role}.`);
      reload();
    } catch (reason) {
      setError(accountAdminError(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <p className="eyebrow">QUẢN TRỊ TÀI KHOẢN</p>
      <h1 className="display-type mt-3 text-4xl">Người dùng & phân quyền</h1>
      <p className="mt-3 text-sm leading-6 text-stone-500">
        Xem tài khoản đăng ký trên ứng dụng và quản lý quyền truy cập.
      </p>
      <nav aria-label="Quản trị" className="my-6 flex flex-wrap gap-3 text-sm">
        <Link href="/admin" className="admin-pill">
          Tổng quan
        </Link>
        <Link href="/admin/tours" className="admin-pill">
          Tour
        </Link>
        <Link href="/admin/categories" className="admin-pill">
          Category
        </Link>
        <Link
          href="/admin/users"
          aria-current="page"
          className="admin-pill"
        >
          Tài khoản
        </Link>
      </nav>
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {error}
          <Link href="/account" className="ml-3 underline">
            Tài khoản của tôi
          </Link>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={reload}
          className={button}
        >
          Tải lại
        </button>
        <p className="text-xs text-stone-500">
          Các thay đổi được lưu trực tiếp ở backend, không cần chạy CLI.
        </p>
      </div>
      {list && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Tổng tài khoản", list.stats.users],
            ["Quản trị viên", list.stats.admins],
            ["Admin đã thiết lập đăng nhập", list.stats.loginAdmins],
          ].map(([label, value]) => (
            <section
              key={label}
              className="admin-card p-5"
            >
              <p className="text-xs text-stone-500">{label}</p>
              <p className="mt-3 text-3xl font-semibold text-emerald-800">
                {value}
              </p>
            </section>
          ))}
        </div>
      )}
      <div
        className={`grid items-start gap-6 ${selected ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}
      >
        <section className="min-w-0 admin-card p-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              filter({ ...query, q: search.trim(), page: 1 });
            }}
          >
            <fieldset
              disabled={busy}
              className="mb-5 flex flex-wrap items-end gap-3 disabled:opacity-60"
            >
              <label className="min-w-0 flex-1 text-xs text-stone-600">
                Tìm tên hoặc email
                <input
                  className={field}
                  type="search"
                  maxLength={100}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label className="text-xs text-stone-600">
                Quyền
                <select
                  className={field}
                  value={query.role}
                  onChange={(event) =>
                    filter({ ...query, role: event.target.value, page: 1 })
                  }
                >
                  <option value="">Tất cả</option>
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
              <button type="submit" className={button}>
                Tìm kiếm
              </button>
            </fieldset>
          </form>
          {!list ? (
            !error && (
              <p role="status" className="py-8 text-sm text-stone-500">
                Đang kiểm tra quyền và tải tài khoản…
              </p>
            )
          ) : (
            <>
              <p className="mb-4 text-xs text-stone-500">
                {list.pagination.total} tài khoản phù hợp · 20 tài khoản mỗi
                trang
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stone-200 text-xs text-stone-500">
                    <tr>
                      <th scope="col" className="pb-3 pr-4">
                        Tài khoản
                      </th>
                      <th scope="col" className="pb-3 pr-4">
                        Quyền
                      </th>
                      <th scope="col" className="pb-3 pr-4">
                        Ngày tạo
                      </th>
                      <th scope="col" className="pb-3 text-right">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((account) => (
                      <tr
                        key={account.id}
                        className="border-b border-stone-100 last:border-0"
                      >
                        <td className="py-4 pr-4">
                          <p className="font-semibold">
                            {account.name}
                            {account.id === list.currentUserId && (
                              <span className="ml-2 text-xs font-normal text-emerald-700">
                                (Bạn)
                              </span>
                            )}
                          </p>
                          <p className="mt-1 break-all text-xs text-stone-500">
                            {account.email}
                          </p>
                          {!account.canLogin && (
                            <p className="mt-1 text-xs text-amber-800">
                              Chưa thiết lập đăng nhập
                            </p>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs ${account.role === "ADMIN" ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600"}`}
                          >
                            {account.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-4 pr-4 text-xs text-stone-600">
                          {accountDate(account.createdAt)}
                        </td>
                        <td className="py-4 text-right">
                          <button
                            type="button"
                            disabled={busy}
                            className="admin-action disabled:opacity-40"
                            aria-label={`Xem và phân quyền ${account.email}`}
                            onClick={() => {
                              setSelected(account);
                              setError("");
                              setNotice("");
                            }}
                          >
                            Xem & phân quyền
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!list.data.length && (
                  <p className="py-8 text-center text-sm text-stone-500">
                    Không tìm thấy tài khoản phù hợp.
                  </p>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 text-xs">
                <button
                  disabled={busy || query.page <= 1}
                  onClick={() => filter({ ...query, page: query.page - 1 })}
                  className={button}
                >
                  Trước
                </button>
                <span>
                  Trang {query.page}/{Math.max(1, list.pagination.totalPages)}
                </span>
                <button
                  disabled={busy || query.page >= list.pagination.totalPages}
                  onClick={() => filter({ ...query, page: query.page + 1 })}
                  className={button}
                >
                  Sau
                </button>
              </div>
            </>
          )}
        </section>
        {selected && list && (
          <RoleEditor
            key={`${selected.id}:${selected.roleRevision}`}
            account={selected}
            list={list}
            busy={busy}
            save={save}
            close={() => setSelected(null)}
          />
        )}
      </div>
    </main>
  );
}
