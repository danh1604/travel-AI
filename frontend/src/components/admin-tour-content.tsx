"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  adminFetch,
  adminError,
  type ContentDay,
  type ContentStop,
  type TourContent,
} from "@/lib/admin";

const field =
  "field mt-2";
const button =
  "admin-action disabled:opacity-40";
type StopDraft = ContentStop & { key: string };
type DayDraft = Omit<ContentDay, "stops"> & { key: string; stops: StopDraft[] };
function move<T>(items: T[], index: number, target: number): T[] {
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  const [item] = result.splice(index, 1);
  result.splice(target, 0, item);
  return result;
}
function contentBody(revision: number, images: string[], days: DayDraft[]) {
  return {
    revision,
    images,
    days: days.map((day) => ({
      id: day.id,
      title: day.title,
      mealNote: day.mealNote,
      stops: day.stops.map((stop) => ({
        id: stop.id,
        type: stop.type,
        title: stop.title,
        content: stop.content,
        placeName: stop.placeName,
      })),
    })),
  };
}

function ContentEditor({
  initial,
  reload,
}: {
  initial: TourContent;
  reload: () => void;
}) {
  const [images, setImages] = useState(initial.images);
  const [days, setDays] = useState<DayDraft[]>(
    initial.days.map((day) => ({
      ...day,
      key: day.id!,
      stops: day.stops.map((stop) => ({ ...stop, key: stop.id! })),
    })),
  );
  const [url, setUrl] = useState("");
  const [imageError, setImageError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(initial.revision);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function changed() {
    setDirty(true);
    setNotice("");
  }
  function updateDay(index: number, input: Partial<DayDraft>) {
    setDays((current) =>
      current.map((day, i) => (i === index ? { ...day, ...input } : day)),
    );
    changed();
  }
  function updateStop(
    dayIndex: number,
    stopIndex: number,
    input: Partial<StopDraft>,
  ) {
    updateDay(dayIndex, {
      stops: days[dayIndex].stops.map((stop, i) =>
        i === stopIndex ? { ...stop, ...input } : stop,
      ),
    });
  }
  function addImage() {
    const value = url.trim();
    try {
      const parsed = new URL(value);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        value.length > 2048
      )
        throw new Error();
    } catch {
      setImageError(
        "Nhập URL HTTPS hợp lệ, không chứa tài khoản hoặc mật khẩu.",
      );
      return;
    }
    if (images.includes(value)) {
      setImageError("Ảnh này đã có trong danh sách.");
      return;
    }
    if (images.length >= 40) return;
    setImages([...images, value]);
    setUrl("");
    setImageError("");
    changed();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminFetch<{ data: TourContent }>(
        `tours/${encodeURIComponent(initial.id)}/content`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contentBody(revision, images, days)),
        },
      );
      setRevision(result.data.revision);
      setImages(result.data.images);
      setDays(
        result.data.days.map((day) => ({
          ...day,
          key: day.id!,
          stops: day.stops.map((stop) => ({ ...stop, key: stop.id! })),
        })),
      );
      setDirty(false);
      setNotice(
        "Đã lưu ảnh và lịch trình. Bạn có thể mở trang tour để đối chiếu.",
      );
    } catch (reason) {
      setError(adminError(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/admin/tours" className="text-emerald-800 underline">
          ← Danh sách tour
        </Link>
        <a
          href={`/explore/tours/${initial.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-800 underline"
        >
          Mở trang tour ↗
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={reload}
          className={button}
        >
          {dirty ? "Tải lại (bỏ thay đổi chưa lưu)" : "Tải lại"}
        </button>
      </div>
      <form onSubmit={save}>
        <div className="sticky top-0 z-10 mb-6 flex flex-wrap items-center justify-between gap-3 admin-card/95 p-4 shadow-sm backdrop-blur">
          <p className="text-sm text-stone-600">
            Phiên bản {revision} ·{" "}
            {dirty ? "Có thay đổi chưa lưu" : "Đã đồng bộ"}
          </p>
          <button
            type="submit"
            disabled={busy || !dirty}
            className="button-primary min-h-10 px-5 py-2.5 disabled:opacity-50"
          >
            {busy ? "Đang lưu…" : "Lưu ảnh & lịch trình"}
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            {error}
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
        <fieldset
          disabled={busy}
          className="min-w-0 space-y-8 disabled:opacity-60"
        >
          <section
            aria-labelledby="images-title"
            className="admin-card p-5 sm:p-7"
          >
            <h2 id="images-title" className="text-2xl font-semibold">
              Ảnh tour{" "}
              <span className="text-sm font-normal text-stone-500">
                {images.length}/40
              </span>
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Ảnh đầu tiên là ảnh đại diện. Thêm bằng URL HTTPS; gỡ ảnh chỉ bỏ
              ảnh khỏi tour.
            </p>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 text-sm font-medium">
                URL ảnh
                <input
                  className={field}
                  type="url"
                  maxLength={2048}
                  placeholder="https://…"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setImageError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addImage();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                onClick={addImage}
                disabled={images.length >= 40 || !url.trim()}
                className={button}
              >
                + Thêm ảnh
              </button>
            </div>
            {imageError && (
              <p role="alert" className="mt-3 text-sm text-red-800">
                {imageError}
              </p>
            )}
            {!images.length && (
              <p className="mt-6 rounded-xl bg-stone-50 p-5 text-sm text-stone-500">
                Tour chưa có ảnh. Explore sẽ dùng khung ảnh mặc định.
              </p>
            )}
            <ol className="mt-6 grid gap-4 md:grid-cols-2">
              {images.map((image, index) => (
                <li
                  key={image}
                  className="overflow-hidden rounded-xl border border-stone-200"
                >
                  <div className="relative aspect-[16/9] bg-stone-100">
                    <Image
                      unoptimized
                      src={image}
                      alt={`Ảnh tour ${index + 1}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 440px"
                      className="object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold text-emerald-800">
                      {index === 0 ? "Ảnh đại diện" : `Ảnh ${index + 1}`}
                    </p>
                    <a
                      href={image}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block break-all text-xs text-stone-500 underline"
                    >
                      {image}
                    </a>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={index === 0}
                        className={button}
                        onClick={() => {
                          setImages(move(images, index, 0));
                          changed();
                        }}
                      >
                        Đặt làm đại diện
                      </button>
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`Chuyển ảnh ${index + 1} lên`}
                        className={button}
                        onClick={() => {
                          setImages(move(images, index, index - 1));
                          changed();
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === images.length - 1}
                        aria-label={`Chuyển ảnh ${index + 1} xuống`}
                        className={button}
                        onClick={() => {
                          setImages(move(images, index, index + 1));
                          changed();
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`${button} text-red-800`}
                        onClick={() => {
                          setImages(images.filter((_, i) => i !== index));
                          changed();
                        }}
                      >
                        Gỡ ảnh
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="days-title" className="space-y-5">
            <div>
              <h2 id="days-title" className="text-2xl font-semibold">
                Lịch trình từng ngày{" "}
                <span className="text-sm font-normal text-stone-500">
                  {days.length}/60
                </span>
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Ngày và hoạt động được đánh số theo thứ tự bên dưới. Nhãn địa
                điểm là văn bản hiển thị; số ngày ở thông tin cơ bản được giữ
                nguyên.
              </p>
            </div>
            {days.map((day, dayIndex) => (
              <article
                key={day.key}
                className="admin-card p-5 sm:p-7"
              >
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-emerald-800">
                    Ngày {dayIndex + 1}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={button}
                      disabled={dayIndex === 0}
                      aria-label={`Chuyển ngày ${dayIndex + 1} lên`}
                      onClick={() => {
                        setDays(move(days, dayIndex, dayIndex - 1));
                        changed();
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={button}
                      disabled={dayIndex === days.length - 1}
                      aria-label={`Chuyển ngày ${dayIndex + 1} xuống`}
                      onClick={() => {
                        setDays(move(days, dayIndex, dayIndex + 1));
                        changed();
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${button} text-red-800`}
                      onClick={() => {
                        setDays(days.filter((_, i) => i !== dayIndex));
                        changed();
                      }}
                    >
                      Gỡ ngày
                    </button>
                  </div>
                </div>
                <label className="block text-sm font-medium">
                  Tiêu đề ngày
                  <input
                    className={field}
                    required
                    maxLength={200}
                    value={day.title}
                    onChange={(event) =>
                      updateDay(dayIndex, { title: event.target.value })
                    }
                  />
                </label>
                <label className="mt-4 block text-sm font-medium">
                  Ghi chú bữa ăn
                  <textarea
                    className={field}
                    rows={2}
                    maxLength={4000}
                    value={day.mealNote ?? ""}
                    onChange={(event) =>
                      updateDay(dayIndex, {
                        mealNote: event.target.value || null,
                      })
                    }
                  />
                </label>
                <ol className="mt-6 space-y-4">
                  {day.stops.map((stop, stopIndex) => (
                    <li
                      key={stop.key}
                      className="rounded-xl border border-stone-200 bg-stone-50 p-4"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold">
                          Hoạt động {stopIndex + 1}
                        </h4>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={button}
                            disabled={stopIndex === 0}
                            aria-label={`Chuyển hoạt động ${stopIndex + 1} ngày ${dayIndex + 1} lên`}
                            onClick={() =>
                              updateDay(dayIndex, {
                                stops: move(
                                  day.stops,
                                  stopIndex,
                                  stopIndex - 1,
                                ),
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className={button}
                            disabled={stopIndex === day.stops.length - 1}
                            aria-label={`Chuyển hoạt động ${stopIndex + 1} ngày ${dayIndex + 1} xuống`}
                            onClick={() =>
                              updateDay(dayIndex, {
                                stops: move(
                                  day.stops,
                                  stopIndex,
                                  stopIndex + 1,
                                ),
                              })
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className={`${button} text-red-800`}
                            onClick={() =>
                              updateDay(dayIndex, {
                                stops: day.stops.filter(
                                  (_, i) => i !== stopIndex,
                                ),
                              })
                            }
                          >
                            Gỡ hoạt động
                          </button>
                        </div>
                      </div>
                      <label className="block text-sm font-medium">
                        Tiêu đề hoạt động
                        <input
                          required
                          className={field}
                          maxLength={200}
                          value={stop.title}
                          onChange={(event) =>
                            updateStop(dayIndex, stopIndex, {
                              title: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-medium">
                          Loại hoạt động
                          <select
                            required
                            className={field}
                            value={stop.type}
                            onChange={(event) =>
                              updateStop(dayIndex, stopIndex, {
                                type: event.target.value,
                              })
                            }
                          >
                            <option value="visit">Tham quan</option>
                            <option value="move">Di chuyển</option>
                            <option value="eat">Ăn uống</option>
                            <option value="rest">Nghỉ ngơi</option>
                            <option value="other">Khác</option>
                          </select>
                        </label>
                        <label className="block text-sm font-medium">
                          Tên địa điểm hiển thị
                          <input
                            className={field}
                            maxLength={200}
                            value={stop.placeName ?? ""}
                            onChange={(event) =>
                              updateStop(dayIndex, stopIndex, {
                                placeName: event.target.value || null,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label className="mt-4 block text-sm font-medium">
                        Nội dung
                        <textarea
                          className={field}
                          rows={4}
                          maxLength={20000}
                          value={stop.content}
                          onChange={(event) =>
                            updateStop(dayIndex, stopIndex, {
                              content: event.target.value,
                            })
                          }
                        />
                      </label>
                    </li>
                  ))}
                </ol>
                {!day.stops.length && (
                  <p className="mt-5 text-sm text-stone-500">
                    Ngày này chưa có hoạt động.
                  </p>
                )}
                <button
                  type="button"
                  className={`mt-5 ${button}`}
                  disabled={day.stops.length >= 100}
                  onClick={() =>
                    updateDay(dayIndex, {
                      stops: [
                        ...day.stops,
                        {
                          key: crypto.randomUUID(),
                          type: "visit",
                          title: "",
                          content: "",
                          placeName: null,
                        },
                      ],
                    })
                  }
                >
                  + Thêm hoạt động
                </button>
              </article>
            ))}
            {!days.length && (
              <p className="admin-card p-6 text-sm text-stone-500">
                Tour chưa có lịch trình.
              </p>
            )}
            <button
              type="button"
              disabled={days.length >= 60}
              className={button}
              onClick={() => {
                setDays([
                  ...days,
                  {
                    key: crypto.randomUUID(),
                    title: "",
                    mealNote: null,
                    stops: [],
                  },
                ]);
                changed();
              }}
            >
              + Thêm ngày
            </button>
          </section>
        </fieldset>
      </form>
    </>
  );
}

export function AdminTourContent({ id }: { id: string }) {
  const [content, setContent] = useState<TourContent | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void adminFetch<{ data: TourContent }>(
      `tours/${encodeURIComponent(id)}/content`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setContent(result.data);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setContent(null);
          setError(adminError(reason));
        }
      });
    return () => controller.abort();
  }, [id, attempt]);
  function reload() {
    setContent(null);
    setError("");
    setAttempt((value) => value + 1);
  }
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <p className="eyebrow">QUẢN TRỊ NỘI DUNG TOUR</p>
      <h1 className="display-type mt-3 text-3xl sm:text-4xl">
        {content?.name ?? "Ảnh & lịch trình"}
      </h1>
      <p className="mb-7 mt-3 text-sm leading-6 text-stone-500">
        Chỉnh sửa ảnh và lịch trình, sau đó lưu để cập nhật Explore. Tour đang
        ẩn vẫn có thể chỉnh sửa ở đây.
      </p>
      {error ? (
        <section
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm"
        >
          <p>{error}</p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link href="/account" className="underline">
              Tài khoản
            </Link>
            <Link href="/admin/tours" className="underline">
              Danh sách tour
            </Link>
            <button onClick={reload} className="underline">
              Thử lại
            </button>
          </div>
        </section>
      ) : content ? (
        <ContentEditor
          key={`${id}:${attempt}`}
          initial={content}
          reload={reload}
        />
      ) : (
        <p role="status">Đang kiểm tra quyền và tải nội dung tour…</p>
      )}
    </main>
  );
}
