"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  adminFetch,
  adminError,
  catalogSlug,
  type AdminCategory,
  type AdminTour,
  type AdminData,
  type CatalogForm,
} from "@/lib/admin";

const inputClass =
  "field mt-2";
type Kind = "tours" | "categories";
function isTour(row: AdminCategory): row is AdminTour {
  return "categoryId" in row;
}

function CatalogEditor({
  kind,
  row,
  categories,
  busy,
  save,
  cancel,
}: {
  kind: Kind;
  row: AdminCategory | AdminTour | null;
  categories: AdminCategory[];
  busy: boolean;
  save: (input: CatalogForm) => Promise<void>;
  cancel: () => void;
}) {
  const tour = row && "categoryId" in row ? row : null;
  const [name, setName] = useState(row?.name ?? "");
  const [slug, setSlug] = useState(row?.slug ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(
    row?.status ?? "inactive",
  );
  const [categoryId, setCategoryId] = useState(tour?.categoryId ?? "");
  const [departure, setDeparture] = useState(tour?.departureLocation ?? "");
  const [days, setDays] = useState(tour?.durationDays?.toString() ?? "");
  async function submit(event: FormEvent) {
    event.preventDefault();
    await save({
      name,
      slug,
      status,
      ...(kind === "tours"
        ? {
            categoryId,
            departureLocation: departure,
            durationDays: days === "" ? null : Number(days),
          }
        : {}),
    });
  }
  return (
    <section
      aria-labelledby="editor-title"
      className="admin-card p-6 lg:sticky lg:top-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="editor-title" className="text-xl font-semibold">
          {row ? "Chỉnh sửa" : "Tạo mới"}{" "}
          {kind === "tours" ? "tour" : "category"}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={cancel}
          className="text-sm underline disabled:opacity-50"
        >
          Đóng
        </button>
      </div>
      {row && (
        <p className="mt-2 break-all text-xs text-stone-500">
          {row.id} · Phiên bản {row.revision}
        </p>
      )}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <label className="block text-sm font-medium">
            Tên
            <input
              className={inputClass}
              required
              minLength={2}
              maxLength={200}
              value={name}
              onChange={(event) => {
                const next = event.target.value;
                setName(next);
                if (!row && slug === catalogSlug(name))
                  setSlug(catalogSlug(next));
              }}
            />
          </label>
          <label className="block text-sm font-medium">
            Slug
            <input
              className={inputClass}
              required
              maxLength={200}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Chữ thường không dấu, số và dấu gạch ngang"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
            <span className="mt-1 block text-xs font-normal text-stone-500">
              Chữ thường không dấu; ví dụ: da-nang-3-ngay.
            </span>
          </label>
          {kind === "tours" && (
            <>
              <label className="block text-sm font-medium">
                Category
                <select
                  required
                  className={inputClass}
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Chọn category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.status === "inactive" ? " (đang ẩn)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Điểm khởi hành
                <input
                  className={inputClass}
                  required
                  minLength={2}
                  maxLength={200}
                  value={departure}
                  onChange={(event) => setDeparture(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Số ngày
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
                <span className="mt-1 block text-xs font-normal text-stone-500">
                  Để trống nếu chưa xác định.
                </span>
              </label>
            </>
          )}
          <label className="block text-sm font-medium">
            Trạng thái
            <select
              className={inputClass}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "active" | "inactive")
              }
            >
              <option value="inactive">Ẩn</option>
              <option value="active">Hiển thị</option>
            </select>
          </label>
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            {kind === "categories"
              ? "Ẩn category sẽ ẩn toàn bộ tour thuộc category khỏi Explore. Hiện lại category sẽ khôi phục các tour đang bật hiển thị."
              : "Tour chỉ xuất hiện khi cả tour và category đều bật hiển thị. Ảnh và lịch trình cũ được giữ lại. Tour mới chưa có ảnh, lịch trình và lịch khởi hành."}
          </p>
          <button
            type="submit"
            className="button-primary w-full disabled:opacity-50"
          >
            {busy ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

export function AdminCatalog({ kind }: { kind: Kind }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{
    row: AdminCategory | AdminTour | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void adminFetch<AdminData>("catalog", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(adminError(reason));
        }
      });
    return () => controller.abort();
  }, [attempt]);
  async function save(input: CatalogForm) {
    if (busy || !data || !editor) return;
    setBusy(true);
    setError("");
    setNotice("");
    const row = editor.row;
    try {
      const result = await adminFetch<{ data: AdminCategory | AdminTour }>(
        `${kind}${row ? `/${row.id}` : ""}`,
        {
          method: row ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            ...(row ? { revision: row.revision } : {}),
          }),
        },
      );
      setData((current) =>
        current
          ? ({
              ...current,
              [kind]: row
                ? current[kind].map((item) =>
                    item.id === row.id ? result.data : item,
                  )
                : [...current[kind], result.data],
            } as AdminData)
          : current,
      );
      setEditor(null);
      setNotice(`Đã lưu “${result.data.name}”.`);
    } catch (reason) {
      setError(adminError(reason));
    } finally {
      setBusy(false);
    }
  }
  const rows = (data?.[kind] ?? [])
    .filter(
      (row) =>
        (status === "all" || row.status === status) &&
        catalogSlug(`${row.name} ${row.slug}`).includes(catalogSlug(q)),
    )
    .sort(
      (a, b) => a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 10)),
    currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * 10, currentPage * 10);
  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <p className="eyebrow">QUẢN TRỊ CATALOG</p>
      <h1 className="display-type mt-3 text-4xl">
        {kind === "tours" ? "Quản lý tour" : "Quản lý category"}
      </h1>
      <nav aria-label="Quản trị" className="my-6 flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin"
          className="admin-pill"
        >
          Tổng quan
        </Link>
        {(["tours", "categories"] as const).map((item) => (
          <Link
            key={item}
            href={`/admin/${item}`}
            aria-current={item === kind ? "page" : undefined}
            className="admin-pill"
          >
            {item === "tours" ? "Tour" : "Category"}
          </Link>
        ))}
        <Link
          href="/admin/users"
          className="admin-pill"
        >
          Tài khoản
        </Link>
        <Link href="/explore" className="px-4 py-2 text-emerald-800 underline">
          Xem Explore ↗
        </Link>
      </nav>
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {error}
          <Link href="/account" className="ml-3 underline">
            Tài khoản
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
          className="button-secondary min-h-10 py-2 disabled:opacity-50"
          onClick={() => {
            setData(null);
            setError("");
            setNotice("");
            setEditor(null);
            setAttempt((value) => value + 1);
          }}
        >
          Tải lại
        </button>
        {data && (
          <button
            type="button"
            disabled={busy || (kind === "tours" && !data.categories.length)}
            className="button-primary min-h-10 px-4 py-2 disabled:opacity-50"
            onClick={() => {
              setEditor({ row: null });
              setError("");
              setNotice("");
            }}
          >
            + Tạo {kind === "tours" ? "tour" : "category"}
          </button>
        )}
      </div>
      {!data ? (
        !error && <p role="status">Đang kiểm tra quyền và tải catalog…</p>
      ) : (
        <div
          className={`grid items-start gap-6 ${editor ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}
        >
          <section className="min-w-0 admin-card p-5">
            <div className="mb-5 flex flex-wrap gap-3">
              <label className="min-w-0 flex-1 text-xs text-stone-600">
                Tìm theo tên hoặc slug
                <input
                  className={inputClass}
                  type="search"
                  value={q}
                  onChange={(event) => {
                    setQ(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="text-xs text-stone-600">
                Trạng thái
                <select
                  className={inputClass}
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Tất cả</option>
                  <option value="active">Hiển thị</option>
                  <option value="inactive">Ẩn</option>
                </select>
              </label>
            </div>
            <p className="mb-3 text-xs text-stone-500">
              {rows.length} bản ghi · 10 bản ghi mỗi trang
            </p>
            {kind === "tours" && !data.categories.length && (
              <p className="mb-4 text-sm">
                Hãy tạo category trước khi tạo tour.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 text-xs text-stone-500">
                  <tr>
                    <th scope="col" className="pb-3 pr-4">
                      {kind === "tours" ? "Tour" : "Category"}
                    </th>
                    <th scope="col" className="pb-3 pr-4">
                      Trạng thái
                    </th>
                    <th scope="col" className="pb-3 text-right">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="py-4 pr-4">
                        <p className="font-semibold">{row.name}</p>
                        <p className="mt-1 break-all text-xs text-stone-500">
                          {row.slug}
                        </p>
                        {isTour(row) && (
                          <p className="mt-1 text-xs text-stone-500">
                            {data.categories.find(
                              (category) => category.id === row.categoryId,
                            )?.name ?? "Category không tồn tại"}
                            {row.needsReview && " · Cần rà soát"}
                          </p>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        <span
                          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${row.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600"}`}
                        >
                          {row.status === "active" ? "Hiển thị" : "Ẩn"}
                        </span>
                        {isTour(row) &&
                          data.categories.find(
                            (category) => category.id === row.categoryId,
                          )?.status === "inactive" && (
                            <p className="mt-2 text-xs text-amber-800">
                              Category đang ẩn
                            </p>
                          )}
                      </td>
                      <td className="py-4 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditor({ row });
                            setError("");
                            setNotice("");
                          }}
                          className="admin-action disabled:opacity-50"
                          aria-label={`Sửa ${row.name}`}
                        >
                          Sửa
                        </button>
                        {kind === "tours" && (
                          <Link
                            href={`/admin/tours/${row.id}/content`}
                            className="mt-3 block text-xs font-semibold text-emerald-800 underline"
                          >
                            Ảnh & lịch trình
                          </Link>
                        )}
                        {kind === "tours" && (
                          <Link
                            href={`/admin/tours/${row.id}/departures`}
                            className="mt-3 block text-xs font-semibold text-emerald-800 underline"
                          >
                            Lịch khởi hành
                          </Link>
                        )}
                        {kind === "tours" &&
                          isTour(row) &&
                          row.status === "active" &&
                          data.categories.some(
                            (category) =>
                              category.id === row.categoryId &&
                              category.status === "active",
                          ) && (
                            <Link
                              href={`/explore/tours/${row.id}`}
                              className="mt-2 block text-xs text-emerald-800 underline"
                            >
                              Xem tour
                            </Link>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <p className="py-8 text-center text-sm text-stone-500">
                  Không có bản ghi phù hợp.
                </p>
              )}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 text-xs">
              <button
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                className="button-secondary min-h-9 px-3 py-1.5 disabled:opacity-40"
              >
                Trước
              </button>
              <span>
                Trang {currentPage}/{pages}
              </span>
              <button
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
                className="button-secondary min-h-9 px-3 py-1.5 disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          </section>
          {editor && (
            <CatalogEditor
              key={editor.row?.id ?? `new-${kind}`}
              kind={kind}
              row={editor.row}
              categories={data.categories}
              busy={busy}
              save={save}
              cancel={() => setEditor(null)}
            />
          )}
        </div>
      )}
    </main>
  );
}
