export type Category = { id: string; name: string; slug: string };
export type CatalogMeta = {
  source: "snapshot" | "postgres";
  generatedAt: string | null;
  developmentData: boolean;
  priceUnit: "unconfirmed";
};
export type TourSummary = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  departureLocation: string;
  durationDays: number | null;
  coverImage: string | null;
  sourcePriceVnd: string | null;
  upcomingDepartures: number;
  needsReview: boolean;
  priceVnd?: string | null;
};
export type TourDetail = TourSummary & {
  images: string[];
  days: {
    id: string;
    dayNumber: number;
    title: string;
    mealNote: string | null;
    stops: {
      id: string;
      type: string;
      title: string;
      content: string;
      position: number;
      placeName: string | null;
    }[];
  }[];
  sections: { id: string; title: string; content: string }[];
  departures: {
    id: string;
    startsAt: string;
    endsAt: string;
    sourcePriceVnd: string;
    status: "open" | "closed" | "full";
    needsReview: boolean;
    priceConfirmed?: boolean;
    availableSeats?: number | null;
  }[];
};
export type TourListResponse = {
  data: TourSummary[];
  meta: CatalogMeta;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
export function formatVnd(value: string): string {
  const [integer, fraction] = value.split(".");
  const trimmed = fraction?.replace(/0+$/, "");
  return `${new Intl.NumberFormat("vi-VN").format(BigInt(integer))}${trimmed ? `,${trimmed}` : ""} ₫`;
}
export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
export function formatSourcePrice(value: string): string {
  return formatVnd(value).replace(/\s₫$/, "");
}
