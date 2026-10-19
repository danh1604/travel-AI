import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import {
  formatDate,
  formatVnd,
  formatSourcePrice,
  type TourDetail,
  type CatalogMeta,
} from "@/lib/explore";
import { CatalogNotice } from "@/components/catalog-notice";
import { TourReviews } from "@/components/tour-reviews";
export const dynamic = "force-dynamic";

export default async function TourPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let result: { data: TourDetail; meta: CatalogMeta };
  try {
    result = await apiFetch(`explore/tours/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError && [400, 404].includes(error.status))
      notFound();
    return (
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-3xl font-semibold">
          Chưa tải được chi tiết chuyến đi
        </h1>
        <p className="mt-4 text-stone-600">
          Dịch vụ dữ liệu tạm thời chưa sẵn sàng. Hãy thử lại sau ít phút.
        </p>
        <Link href="/explore" className="button-primary mt-6 inline-flex">
          Quay lại Explore
        </Link>
      </main>
    );
  }
  const { data: tour, meta } = result;
  const departures = [...tour.departures].sort((a, b) =>
    b.startsAt.localeCompare(a.startsAt),
  );
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <Link
        href="/explore"
        className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300"
      >
        ← Quay lại khám phá
      </Link>
      <section className="relative mt-6 mb-8 flex min-h-[420px] items-end overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-800 to-teal-950 shadow-2xl shadow-emerald-950/20">
        {tour.images[0] && (
          <Image
            unoptimized
            priority
            src={tour.images[0]}
            alt={tour.name}
            fill
            className="object-cover"
            sizes="(max-width: 1280px) 100vw, 1280px"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <div className="relative p-6 text-white sm:p-10">
          <span className="glass inline-block rounded-full px-3.5 py-1.5 text-xs font-semibold">
            {tour.category.name}
          </span>
          <h1 className="display-type mt-4 max-w-4xl text-3xl leading-tight sm:text-5xl">
            {tour.name}
          </h1>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <span className="glass rounded-full px-4 py-2">📍 Khởi hành từ {tour.departureLocation}</span>
            <span className="glass rounded-full px-4 py-2">
              🕒 {tour.durationDays ? `${tour.durationDays} ngày` : "Thời lượng cần xác nhận"}
            </span>
            {departures.length > 0 && (
              <span className="glass rounded-full px-4 py-2">📅 {departures.length} lịch khởi hành</span>
            )}
          </div>
        </div>
      </section>
      <CatalogNotice meta={meta} />
      <div className="mt-10 grid items-start gap-8 xl:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section>
            <h2 className="display-type mb-5 text-3xl">
              Lịch trình trải nghiệm
            </h2>
            <p className="mb-6 text-sm leading-6 text-stone-500">
              Lịch trình mẫu từ tour gốc. Giờ hoạt động, thời gian di chuyển và
              các nội dung trùng thứ tự cần được xác nhận trước chuyến đi.
            </p>
            {tour.days.length ? (
              tour.days.map((day) => (
                <article
                  key={day.id}
                  className="card mb-4 p-6"
                >
                  <span className="inline-flex rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
                    Ngày {day.dayNumber}
                  </span>
                  <h3 className="mt-2 text-xl font-semibold">{day.title}</h3>
                  {day.mealNote && (
                    <p className="mt-2 text-sm text-stone-500">
                      {day.mealNote}
                    </p>
                  )}
                  <ol className="mt-5 space-y-5 border-l-2 border-dashed border-emerald-200 pl-6">
                    {day.stops.map((stop) => (
                      <li key={stop.id} className="relative before:absolute before:-left-[31px] before:top-1.5 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-white before:bg-emerald-500 before:shadow before:content-['']">
                        <h4 className="font-semibold">{stop.title}</h4>
                        {stop.placeName && (
                          <p className="mt-1 text-xs font-medium text-emerald-700">
                            {stop.placeName}
                          </p>
                        )}
                        <p className="mt-2 whitespace-pre-line text-sm leading-7 text-stone-600">
                          {stop.content}
                        </p>
                      </li>
                    ))}
                  </ol>
                  {!day.stops.length && (
                    <p className="mt-4 text-sm text-stone-500">
                      Chi tiết hoạt động đang được cập nhật.
                    </p>
                  )}
                </article>
              ))
            ) : (
              <p className="rounded-2xl bg-white p-6 text-stone-600">
                Lịch trình đang được cập nhật.
              </p>
            )}
          </section>
          {tour.sections.length > 0 && (
            <section>
              <h2 className="display-type mb-5 text-3xl">
                Thông tin từ đơn vị tổ chức
              </h2>
              {tour.sections.map((section) => (
                <details
                  key={section.id}
                  className="card mb-3 rounded-2xl p-5"
                >
                  <summary className="cursor-pointer font-semibold">
                    {section.title}
                  </summary>
                  <p className="mt-4 whitespace-pre-line text-sm leading-7 text-stone-600">
                    {section.content}
                  </p>
                </details>
              ))}
            </section>
          )}
          {tour.images.length > 1 && (
            <section>
              <h2 className="display-type mb-5 text-3xl">Một góc chuyến đi</h2>
              <div className="grid grid-cols-2 gap-4">
                {tour.images.slice(1).map((url, index) => (
                  <div
                    key={`${url}:${index}`}
                    className="group relative aspect-[4/3] overflow-hidden rounded-2xl"
                  >
                    <Image
                      unoptimized
                      src={url}
                      alt={`${tour.name} · ảnh ${index + 2}`}
                      fill
                      sizes="(max-width: 1024px) 50vw, 400px"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="card p-6 xl:sticky xl:top-24">
          <h2 className="text-xl font-semibold">Lịch khởi hành đã lưu</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            Thông tin lịch sử từ website cũ, gồm cả ngày đã qua. Chưa hỗ trợ đặt
            tour hoặc xác nhận chỗ.
          </p>
          <div className="mt-5 max-h-[560px] space-y-3 overflow-y-auto pr-1">
            {departures.length ? (
              departures.map((departure) => (
                <article
                  key={departure.id}
                  className="rounded-2xl border border-stone-100 bg-stone-50/60 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <p className="text-sm font-semibold">
                    {formatDate(departure.startsAt)} →{" "}
                    {formatDate(departure.endsAt)}
                  </p>
                  <p className="mt-2 font-semibold text-emerald-800">
                    {departure.priceConfirmed
                      ? formatVnd(departure.sourcePriceVnd)
                      : formatSourcePrice(departure.sourcePriceVnd)}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {departure.priceConfirmed
                      ? "VNĐ/người · Đã xác nhận"
                      : "Giá nguồn · đơn vị tính cần xác nhận"}
                  </p>
                  <p className="mt-2 text-xs text-stone-600">
                    {departure.availableSeats != null
                      ? `Còn ${departure.availableSeats} chỗ`
                      : "Số chỗ cần xác nhận"}
                  </p>
                  <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${departure.status === "open" ? "bg-emerald-100 text-emerald-800" : departure.status === "full" ? "bg-orange-100 text-orange-800" : "bg-stone-100 text-stone-600"}`}>
                    Trạng thái:{" "}
                    {departure.status === "open"
                      ? "Mở"
                      : departure.status === "full"
                        ? "Đầy"
                        : "Đóng"}
                  </span>
                </article>
              ))
            ) : (
              <p className="text-sm text-stone-600">
                Chưa có lịch khởi hành hợp lệ được lưu.
              </p>
            )}
          </div>
        </aside>
      </div>
      <TourReviews tourId={id} />
    </main>
  );
}
