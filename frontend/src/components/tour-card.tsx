import Image from "next/image";
import Link from "next/link";
import { formatVnd, formatSourcePrice, type TourSummary } from "@/lib/explore";
import { Icon } from "./icon";

export function TourCard({ tour }: { tour: TourSummary }) {
  const price = tour.priceVnd ?? tour.sourcePriceVnd;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[1.6rem] border border-stone-200/70 bg-white shadow-[0_1px_2px_rgb(13_42_35/0.04),0_10px_30px_-18px_rgb(13_42_35/0.25)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_30px_60px_-28px_rgb(6_78_59/0.45)]">
      <Link
        href={`/explore/tours/${tour.id}`}
        className="relative m-2 mb-0 block aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-emerald-100 to-teal-50"
        aria-label={`Xem ${tour.name}`}
      >
        {tour.coverImage ? (
          <Image
            unoptimized
            src={tour.coverImage}
            alt={tour.name}
            fill
            className="object-cover transition duration-700 group-hover:scale-110"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-emerald-800">
            <Icon name="compass" className="h-8 w-8 opacity-60" />
            Ảnh chuyến đi đang được cập nhật
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-900 shadow-sm backdrop-blur">
          {tour.category.name}
        </span>
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
          <Icon name="clock" className="h-3.5 w-3.5" />
          {tour.durationDays ? `${tour.durationDays} ngày` : "Thời lượng cần xác nhận"}
        </span>
      </Link>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <p className="flex items-center gap-1.5 text-xs text-stone-500">
          <Icon name="pin" className="h-3.5 w-3.5 text-emerald-600" />
          Khởi hành từ {tour.departureLocation}
        </p>
        <h2 className="mt-2 line-clamp-2 text-[17px] font-semibold leading-snug">
          <Link
            href={`/explore/tours/${tour.id}`}
            className="transition hover:text-emerald-700"
          >
            {tour.name}
          </Link>
        </h2>
        <div className="mt-auto pt-5">
          <div className="flex items-end justify-between gap-3 border-t border-dashed border-stone-200 pt-4">
            <div>
              <p className="text-[11px] text-stone-500">
                {tour.priceVnd != null
                  ? "Giá từ · VNĐ/người"
                  : price
                    ? "Giá nguồn từ · Chưa xác nhận"
                    : "Giá khởi hành"}
              </p>
              <p className="mt-0.5 text-lg font-bold text-emerald-700">
                {price
                  ? tour.priceVnd != null
                    ? formatVnd(price)
                    : formatSourcePrice(price)
                  : "Cần xác nhận"}
              </p>
            </div>
            <Link
              href={`/explore/tours/${tour.id}`}
              aria-label={`Chi tiết ${tour.name}`}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-800 transition group-hover:bg-emerald-700 group-hover:text-white"
            >
              <Icon name="arrow" className="h-4 w-4 -rotate-45 transition group-hover:rotate-0" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
