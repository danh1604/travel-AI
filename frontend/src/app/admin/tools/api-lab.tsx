"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL, apiFetch } from "@/lib/api";
import { probes, probePath, probeStatus, type ProbeId } from "@/lib/api-lab";
import type { Category, TourListResponse, TourSummary } from "@/lib/explore";
import { Icon } from "@/components/icon";

type Result = {
  id: ProbeId;
  path: string;
  status: number;
  ms: number;
  body: string;
  checkedAt: string;
};
const toneClass = {
  success: "bg-emerald-50 text-emerald-800",
  notice: "bg-amber-50 text-amber-900",
  error: "bg-red-50 text-red-800",
};

export function ApiLab({ initialTourId }: { initialTourId: string }) {
  const [selected, setSelected] = useState<ProbeId>(
      initialTourId ? "detail" : "health",
    ),
    [results, setResults] = useState<Partial<Record<ProbeId, Result>>>({});
  const [q, setQ] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState("1"),
    [limit, setLimit] = useState("3"),
    [tourId, setTourId] = useState(initialTourId);
  const [tours, setTours] = useState<TourSummary[]>([]),
    [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const requestState = useRef({ controller: null as AbortController | null });
  useEffect(() => {
    const controller = new AbortController(),
      state = requestState.current;
    void Promise.allSettled([
      apiFetch<TourListResponse>("explore/tours?limit=5", {
        signal: controller.signal,
      }),
      apiFetch<{ data: Category[] }>("explore/categories", {
        signal: controller.signal,
      }),
    ]).then(([list, options]) => {
      if (controller.signal.aborted) return;
      if (list.status === "fulfilled") {
        setTours(list.value.data);
        setTourId((previous) => previous || list.value.data[0]?.id || "");
      }
      if (options.status === "fulfilled") setCategories(options.value.data);
    });
    return () => {
      controller.abort();
      state.controller?.abort();
    };
  }, []);

  async function run(ids: ProbeId[]) {
    setBusy(true);
    setMessage("");
    const controller = new AbortController();
    requestState.current.controller = controller;
    try {
      for (const id of ids) {
        if (controller.signal.aborted) break;
        let path: string;
        try {
          path = probePath(id, { q, category, page, limit, tourId });
        } catch {
          setMessage("Chọn hoặc nhập ID tour để kiểm tra chi tiết.");
          continue;
        }
        const start = performance.now();
        let status = 0,
          body: string;
        try {
          const response = await fetch(
            `${API_URL.replace(/\/$/, "")}/${path}`,
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              redirect: "error",
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(10_000),
              ]),
            },
          );
          status = response.status;
          const text = await response.text();
          try {
            body = JSON.stringify(JSON.parse(text), null, 2);
          } catch {
            body = text;
          }
        } catch {
          if (controller.signal.aborted) break;
          body = JSON.stringify(
            {
              error:
                "Không đọc được phản hồi. Kiểm tra backend, API URL, CORS hoặc thời gian chờ.",
            },
            null,
            2,
          );
        }
        const result = {
          id,
          path,
          status,
          ms: Math.round(performance.now() - start),
          body,
          checkedAt: new Date().toISOString(),
        };
        setResults((previous) => ({ ...previous, [id]: result }));
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const result = results[selected],
    probe = probes.find((item) => item.id === selected)!;
  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <p className="eyebrow">DEVELOPMENT / API LAB</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display-type text-4xl">Một nơi để kiểm tra API.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
            Gửi các request GET có sẵn, xem HTTP status và JSON trả về. Công cụ
            không tạo, sửa hay xóa dữ liệu.
          </p>
        </div>
        <button
          disabled={busy}
          className="button-primary disabled:opacity-50"
          onClick={() =>
            void run(
              probes
                .filter((item) => item.id !== "detail" || tourId.trim())
                .map((item) => item.id),
            )
          }
        >
          <Icon name="check" className="h-4 w-4" />
          {busy ? "Đang kiểm tra…" : "Kiểm tra tất cả"}
        </button>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-950">
        <span>
          Chỉ xuất hiện ở môi trường phát triển. Cookie phiên hiện tại được gửi
          khi kiểm tra tài khoản.
        </span>
        <code className="break-all font-semibold">{API_URL}</code>
      </div>
      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <section className="overflow-hidden admin-card">
          <h2 className="border-b border-stone-100 p-5 text-sm font-semibold">
            Các endpoint hiện có
          </h2>
          <div className="p-2">
            {probes.map((item) => {
              const checked = results[item.id],
                state = checked ? probeStatus(item.id, checked.status) : null;
              return (
                <button
                  key={item.id}
                  aria-pressed={selected === item.id}
                  onClick={() => {
                    setSelected(item.id);
                    setMessage("");
                  }}
                  className={`mb-1 block w-full rounded-xl p-3 text-left ${selected === item.id ? "bg-emerald-50 text-emerald-950" : "hover:bg-stone-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{item.name}</span>
                    {state && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${toneClass[state.tone]}`}
                      >
                        {checked!.status || "ERR"}
                      </span>
                    )}
                  </div>
                  <code className="mt-1 block text-[10px] text-stone-500">
                    GET {item.route}
                  </code>
                </button>
              );
            })}
          </div>
        </section>
        <div className="min-w-0 space-y-5">
          <section className="admin-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">{probe.name}</h2>
                <p className="mt-2 text-xs leading-6 text-stone-500">
                  {probe.description}
                </p>
              </div>
              <button
                disabled={busy || (selected === "detail" && !tourId.trim())}
                onClick={() => void run([selected])}
                className="button-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Đang gửi…" : "Gửi GET"}
                <Icon name="arrow" className="h-4 w-4" />
              </button>
            </div>
            {selected === "tours" && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Từ khóa
                  <input
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    disabled={busy}
                    className="field mt-2"
                    placeholder="da nang"
                    maxLength={100}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Category
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    disabled={busy}
                    className="field mt-2"
                  >
                    <option value="">Tất cả</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Page
                  <input
                    type="number"
                    value={page}
                    onChange={(event) => setPage(event.target.value)}
                    disabled={busy}
                    className="field mt-2"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Limit (API tối đa 24)
                  <input
                    type="number"
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                    disabled={busy}
                    className="field mt-2"
                  />
                </label>
              </div>
            )}
            {selected === "detail" && (
              <div className="mt-5 space-y-4">
                <label className="block text-xs font-semibold">
                  Chọn tour có sẵn
                  <select
                    className="field mt-2"
                    value={
                      tours.some((item) => item.id === tourId) ? tourId : ""
                    }
                    disabled={busy}
                    onChange={(event) => setTourId(event.target.value)}
                  >
                    <option value="">Chọn tour hoặc nhập ID bên dưới</option>
                    {tours.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold">
                  ID tour
                  <input
                    className="field mt-2 font-mono"
                    value={tourId}
                    onChange={(event) => setTourId(event.target.value)}
                    disabled={busy}
                    maxLength={100}
                    placeholder="UUID từ /explore/tours"
                  />
                </label>
                {tourId && (
                  <Link
                    href={`/explore/tours/${encodeURIComponent(tourId)}`}
                    className="inline-flex text-xs font-semibold text-emerald-800 underline"
                  >
                    Mở trang tour để đối chiếu ↗
                  </Link>
                )}
              </div>
            )}
          </section>
          {message && (
            <p
              role="alert"
              className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
            >
              {message}
            </p>
          )}
          <section className="overflow-hidden admin-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
              <h2 className="text-sm font-semibold">Phản hồi lần chạy cuối</h2>
              {result && (
                <div className="flex items-center gap-3 text-xs">
                  <span
                    className={`rounded-full px-3 py-1 ${toneClass[probeStatus(selected, result.status).tone]}`}
                  >
                    {result.status || "Lỗi kết nối"} ·{" "}
                    {probeStatus(selected, result.status).label}
                  </span>
                  <span className="text-stone-500">{result.ms} ms</span>
                </div>
              )}
            </div>
            {result ? (
              <>
                <div className="border-b border-stone-100 px-5 py-3">
                  <code className="break-all text-[11px] text-stone-500">
                    GET /{result.path}
                  </code>
                  <p className="mt-2 text-[10px] text-stone-400">
                    {new Intl.DateTimeFormat("vi-VN", {
                      dateStyle: "short",
                      timeStyle: "medium",
                      timeZone: "Asia/Ho_Chi_Minh",
                    }).format(new Date(result.checkedAt))}
                  </p>
                </div>
                <pre
                  tabIndex={0}
                  aria-label="JSON phản hồi API"
                  className="max-h-[620px] overflow-auto bg-[#132d26] p-5 text-xs leading-6 text-emerald-50"
                >
                  {result.body.slice(0, 60000)}
                </pre>
                {result.body.length > 60000 && (
                  <p className="p-4 text-xs text-stone-500">
                    Phản hồi đã rút gọn sau 60.000 ký tự.
                  </p>
                )}
              </>
            ) : (
              <div className="px-6 py-16 text-center">
                <Icon
                  name="code"
                  className="mx-auto mb-4 h-8 w-8 text-stone-300"
                />
                <p className="text-sm text-stone-500">
                  Chọn endpoint và nhấn “Gửi GET” để xem JSON thật.
                </p>
              </div>
            )}
          </section>
          <p className="text-xs leading-6 text-stone-500">
            Readiness 503: PostgreSQL chưa sẵn sàng. Auth 401/403: request đã
            tới backend nhưng thiếu session hoặc quyền; đăng nhập rồi thử lại.
            Các màn hình tour có thể vẫn chạy bằng snapshot.
          </p>
        </div>
      </div>
    </main>
  );
}
