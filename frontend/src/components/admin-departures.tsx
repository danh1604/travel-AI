"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { adminFetch, adminError, type RefreshResult } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { formatDate, formatVnd, formatSourcePrice } from "@/lib/explore";
import {
  vnDateInput,
  vnDateIso,
  type DepartureList,
  type AdminDeparture,
} from "@/lib/departures";

const field =
  "field mt-2";
const button =
  "button-secondary min-h-10 py-2 disabled:opacity-40";
function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "invalid_departure")
    return "Kiểm tra ngày về ≥ ngày đi; giá không âm; 1 ≤ số khách tối thiểu ≤ tổng chỗ; số đã đặt không vượt tổng chỗ. Lịch mở phải còn chỗ, lịch hết chỗ phải có số đã đặt bằng tổng chỗ. Giá xác nhận là số nguyên VNĐ tối đa 999999999999.";
  if (error instanceof ApiError && error.code === "departure_has_guests")
    return "Lịch sắp tới đã có khách hoặc chưa rõ số khách nên chưa thể xóa. Hãy sửa và chọn Đóng nhận khách. Lịch đã qua luôn xóa được.";
  return adminError(error);
}
function DepartureEditor({
  row,
  busy,
  save,
  close,
}: {
  row: AdminDeparture | null;
  busy: boolean;
  save: (fields: object) => Promise<void>;
  close: () => void;
}) {
  const [startsAt, setStartsAt] = useState(
      row ? vnDateInput(row.startsAt) : "",
    ),
    [endsAt, setEndsAt] = useState(row ? vnDateInput(row.endsAt) : "");
  const [base, setBase] = useState(row?.basePriceVnd ?? ""),
    [sale, setSale] = useState(row?.salePriceVnd ?? "");
  const [min, setMin] = useState(row?.minPeople?.toString() ?? ""),
    [max, setMax] = useState(row?.maxPeople?.toString() ?? ""),
    [booked, setBooked] = useState(row?.bookedPeople?.toString() ?? "");
  const [status, setStatus] = useState<AdminDeparture["status"]>(
      row?.status ?? "closed",
    ),
    [confirmed, setConfirmed] = useState(row?.priceConfirmed ?? false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await save({
      startsAt:
        row && startsAt === vnDateInput(row.startsAt)
          ? row.startsAt
          : vnDateIso(startsAt),
      endsAt:
        row && endsAt === vnDateInput(row.endsAt)
          ? row.endsAt
          : vnDateIso(endsAt),
      basePriceVnd: base,
      salePriceVnd: sale,
      minPeople: Number(min),
      maxPeople: Number(max),
      bookedPeople: Number(booked),
      status,
      priceConfirmed: confirmed,
    });
  }
  return (
    <section
      className="admin-card p-6 lg:sticky lg:top-6"
      aria-labelledby="departure-editor"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="departure-editor" className="text-xl font-semibold">
          {row ? "Sửa lịch khởi hành" : "Thêm lịch khởi hành"}
        </h2>
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className="text-sm underline"
        >
          Đóng
        </button>
      </div>
      <form className="mt-5" onSubmit={submit}>
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <p className="text-xs leading-5 text-stone-500">
            Ngày giờ theo giờ Việt Nam (UTC+7). Lịch cũ thiếu giá gốc hoặc số
            chỗ cần được bổ sung trước khi lưu.
          </p>
          <label className="block text-sm font-medium">
            Ngày giờ đi
            <input
              required
              type="datetime-local"
              className={field}
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Ngày giờ về
            <input
              required
              type="datetime-local"
              className={field}
              min={startsAt || undefined}
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Giá gốc / nội bộ
            <input
              required
              inputMode="decimal"
              className={field}
              maxLength={66}
              pattern="[0-9]+([.][0-9]+)?"
              value={base}
              onChange={(event) => setBase(event.target.value)}
            />
            <span className="mt-1 block text-xs font-normal text-stone-500">
              Giữ giá trị nguồn nếu chưa rà soát; thông tin này chỉ dành cho
              Admin.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Giá bán
            <input
              required
              inputMode="decimal"
              className={field}
              maxLength={66}
              pattern="[0-9]+([.][0-9]+)?"
              value={sale}
              onChange={(event) => {
                setSale(event.target.value);
                setConfirmed(false);
              }}
            />
            <span className="mt-1 block text-xs font-normal text-stone-500">
              Nhập số liền, ví dụ 2500000. Giá VNĐ/người đã xác nhận phải là số
              nguyên.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              Tôi đã xác nhận giá bán này tính bằng VNĐ cho mỗi người.
            </span>
          </label>
          {(
            [
              ["Khách tối thiểu", min, setMin, 1],
              ["Tổng số chỗ", max, setMax, 1],
              ["Số chỗ đã đặt", booked, setBooked, 0],
            ] as const
          ).map(([label, value, setter, minimum]) => (
            <label key={label} className="block text-sm font-medium">
              {label}
              <input
                required
                type="number"
                min={minimum}
                max={100000}
                step={1}
                className={field}
                value={value}
                onChange={(event) => setter(event.target.value)}
              />
            </label>
          ))}
          <label className="block text-sm font-medium">
            Trạng thái
            <select
              className={field}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as AdminDeparture["status"])
              }
            >
              <option value="closed">Đóng nhận khách</option>
              <option value="open">Mở nhận khách</option>
              <option value="full">Hết chỗ</option>
            </select>
          </label>
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            Số chỗ đã đặt được cập nhật thủ công. Giá chưa xác nhận sẽ giữ nhãn
            giá nguồn; lịch đã qua, đóng hoặc hết chỗ sẽ không được dùng tính
            giá tour từ.
          </p>
          <button
            type="submit"
            className="button-primary w-full"
          >
            {busy ? "Đang lưu…" : "Lưu lịch khởi hành"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
export function AdminDepartures({ id }: { id: string }) {
  const [list, setList] = useState<DepartureList | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<{ row: AdminDeparture | null } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<AdminDeparture | null>(null),
    [renewPlan, setRenewPlan] = useState<RefreshResult | null>(null),
    [bulkRemove, setBulkRemove] = useState(false);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const controller = new AbortController();
    void adminFetch<{ data: DepartureList }>(
      `tours/${encodeURIComponent(id)}/departures`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setList(result.data);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setList(null);
          setError(errorMessage(reason));
        }
      });
    return () => controller.abort();
  }, [id, attempt]);
  function reload() {
    setList(null);
    setEditor(null);
    setRemove(null);
    setError("");
    setNotice("");
    setAttempt((value) => value + 1);
  }
  async function save(fields: object) {
    if (!list || !editor || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminFetch<{ data: DepartureList }>(
        `tours/${encodeURIComponent(id)}/departures${editor.row ? `/${editor.row.id}` : ""}`,
        {
          method: editor.row ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...fields, revision: list.revision }),
        },
      );
      setList(result.data);
      setEditor(null);
      setNotice("Đã lưu lịch khởi hành.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!list || !remove || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminFetch<{ data: DepartureList }>(
        `tours/${encodeURIComponent(id)}/departures/${remove.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: list.revision }),
        },
      );
      setList(result.data);
      setRemove(null);
      setEditor(null);
      setNotice("Đã xóa lịch khởi hành.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  const renewBody = (dryRun: boolean) =>
    JSON.stringify({
      startDate: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10),
      gapDays: 7,
      dryRun,
      tourId: id,
    });
  async function renew(dryRun: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminFetch<RefreshResult>("departures/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: renewBody(dryRun),
      });
      if (dryRun) {
        setNotice(result.summary.tours ? "" : "Không có lịch cũ nào cần làm mới.");
        setRenewPlan(result.summary.tours ? result : null);
      } else {
        setRenewPlan(null);
        reload();
        setNotice(`Đã làm mới ${result.summary.moved + result.summary.cloned} lịch khởi hành.`);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function archivePast() {
    if (!list || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminFetch<{ data: DepartureList }>(
        `tours/${encodeURIComponent(id)}/departures/archive-past`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: list.revision }),
        },
      );
      const removed = list.departures.length - result.data.departures.length;
      setList(result.data);
      setBulkRemove(false);
      setEditor(null);
      setNotice(`Đã xóa ${removed} lịch đã qua.`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function closeDeparture(row: AdminDeparture) {
    if (!list || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminFetch<{ data: DepartureList }>(
        `tours/${encodeURIComponent(id)}/departures/${row.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: list.revision }),
        },
      );
      setList(result.data);
      setEditor(null);
      setRemove(null);
      setNotice("Đã đóng nhận khách cho lịch khởi hành.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <p className="eyebrow">QUẢN TRỊ TOUR</p>
      <h1 className="display-type mt-3 text-4xl">Lịch khởi hành</h1>
      <p className="mt-3 text-stone-600">{list?.name}</p>
      <nav className="my-6 flex flex-wrap gap-4 text-sm">
        <Link href="/admin/tours" className="text-emerald-800 underline">
          ← Danh sách tour
        </Link>
        <Link
          href={`/admin/tours/${id}/content`}
          className="text-emerald-800 underline"
        >
          Ảnh & lịch trình
        </Link>
        <a
          href={`/explore/tours/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-800 underline"
        >
          Mở trang tour ↗
        </a>
      </nav>
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {error}{" "}
          <Link href="/account" className="underline">
            Tài khoản
          </Link>
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      <div className="mb-6 flex gap-3">
        <button onClick={reload} disabled={busy} className={button}>
          Tải lại
        </button>
        {list && (
          <button
            disabled={busy}
            onClick={() => void renew(true)}
            className={button}
          >
            Làm mới lịch cũ
          </button>
        )}
        {list && list.departures.some((row) => Date.parse(row.startsAt) < now) && (
          <button
            disabled={busy}
            onClick={() => {
              setBulkRemove(true);
              setRemove(null);
              setEditor(null);
              setRenewPlan(null);
            }}
            className={`${button} text-red-800`}
          >
            Xóa lịch đã qua
          </button>
        )}
        {list && (
          <button
            disabled={busy}
            onClick={() => {
              setEditor({ row: null });
              setRemove(null);
              setError("");
              setNotice("");
            }}
            className="button-primary min-h-10 px-4 py-2 disabled:opacity-40"
          >
            + Thêm lịch
          </button>
        )}
      </div>
      {renewPlan && (
        <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm">
          <p className="font-semibold">
            Dời toàn bộ {renewPlan.summary.moved + renewPlan.summary.cloned} lịch cũ sang ngày mới, cách nhau 7 ngày (giữ giờ đi, số ngày và giá):
          </p>
          <ul className="mt-3 space-y-1">
            {renewPlan.tours[0].changes.map((change) => (
              <li key={change.departureId}>
                {formatDate(change.from)} → <strong>{formatDate(change.to)}</strong>
                {change.action === "clone" ? " (đã có khách: giữ lịch cũ, tạo bản mới)" : ""}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-3">
            <button disabled={busy} onClick={() => void renew(false)} className="button-primary min-h-10 px-4 py-2">
              Áp dụng
            </button>
            <button disabled={busy} onClick={() => setRenewPlan(null)} className={button}>
              Hủy
            </button>
          </div>
          <p className="mt-3 text-xs text-stone-600">
            Muốn chọn ngày đi hoặc khoảng cách khác? Dùng nút “Làm mới lịch cũ” ở danh sách tour.
          </p>
        </section>
      )}
      {bulkRemove && list && (
        <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm">
          <p>Xóa {list.departures.filter((row) => Date.parse(row.startsAt) < now).length} lịch đã qua của tour này? Các lịch sắp tới không bị ảnh hưởng.</p>
          <div className="mt-4 flex gap-3">
            <button disabled={busy} onClick={() => void archivePast()} className={`${button} text-red-800`}>Xác nhận xóa</button>
            <button disabled={busy} onClick={() => setBulkRemove(false)} className={button}>Giữ lại</button>
          </div>
        </section>
      )}
      {remove && (
        <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm">
          <p>
            Xóa lịch đi {formatDate(remove.startsAt)}? Lịch này sẽ không còn xuất
            hiện trên Explore và không thể khôi phục.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              disabled={busy}
              onClick={archive}
              className={`${button} text-red-800`}
            >
              Xác nhận xóa lịch
            </button>
            <button
              disabled={busy}
              onClick={() => setRemove(null)}
              className={button}
            >
              Giữ lại
            </button>
          </div>
        </section>
      )}
      {!list ? (
        !error && <p role="status">Đang tải lịch khởi hành…</p>
      ) : (
        <div
          className={`grid items-start gap-6 ${editor ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}
        >
          <section className="min-w-0 admin-card p-5">
            <p className="mb-5 text-sm text-stone-500">
              {list.departures.length} lịch · Phiên bản {list.revision}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 text-xs text-stone-500">
                  <tr>
                    <th className="pb-3 pr-4" scope="col">
                      Ngày đi / về
                    </th>
                    <th className="pb-3 pr-4" scope="col">
                      Giá bán
                    </th>
                    <th className="pb-3 pr-4" scope="col">
                      Chỗ & trạng thái
                    </th>
                    <th className="pb-3 text-right" scope="col">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...list.departures].reverse().map((row) => (
                    <tr key={row.id} className={`border-b border-stone-100 ${Date.parse(row.startsAt) < now ? "opacity-60" : ""}`}>
                      <td className="whitespace-nowrap py-4 pr-4">
                        {formatDate(row.startsAt)}
                        {Date.parse(row.startsAt) < now && (
                          <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">Đã qua</span>
                        )}
                        <span className="mt-1 block text-xs text-stone-500">
                          → {formatDate(row.endsAt)}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="font-semibold text-emerald-800">
                          {row.priceConfirmed
                            ? formatVnd(row.salePriceVnd)
                            : formatSourcePrice(row.salePriceVnd)}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {row.priceConfirmed
                            ? "VNĐ/người · Đã xác nhận"
                            : "Giá nguồn · Chưa xác nhận"}
                        </p>
                      </td>
                      <td className="py-4 pr-4">
                        <p>
                          {row.status === "open"
                            ? "Mở nhận khách"
                            : row.status === "full"
                              ? "Hết chỗ"
                              : "Đóng nhận khách"}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {row.bookedPeople === null || row.maxPeople === null
                            ? "Chưa có dữ liệu chỗ"
                            : `Đã đặt ${row.bookedPeople}/${row.maxPeople} · Còn ${row.maxPeople - row.bookedPeople}`}
                        </p>
                      </td>
                      <td className="py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            disabled={busy}
                            className={button}
                            onClick={() => {
                              setEditor({ row });
                              setRemove(null);
                              setError("");
                              setNotice("");
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            disabled={busy || !(Date.parse(row.startsAt) < now || row.bookedPeople === 0)}
                            className={`${button} text-red-800`}
                            onClick={() => {
                              setRemove(row);
                              setEditor(null);
                              setError("");
                            }}
                          >
                            Xóa
                          </button>
                          {row.status !== "closed" && (
                            <button
                              disabled={busy}
                              className={button}
                              onClick={() => closeDeparture(row)}
                            >
                              Đóng nhận khách
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!list.departures.length && (
                <p className="py-8 text-center text-sm text-stone-500">
                  Tour chưa có lịch khởi hành.
                </p>
              )}
            </div>
          </section>
          {editor && (
            <DepartureEditor
              key={editor.row?.id ?? "new"}
              row={editor.row}
              busy={busy}
              save={save}
              close={() => setEditor(null)}
            />
          )}
        </div>
      )}
    </main>
  );
}
