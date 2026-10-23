import { apiFetch, ApiError } from "./api";

export type ServiceKind = "hotels" | "restaurants" | "attractions" | "transportations";
export type TravelKind = "destinations" | ServiceKind;
export const serviceKinds: ServiceKind[] = ["hotels", "restaurants", "attractions", "transportations"];
export const travelKinds: TravelKind[] = ["destinations", ...serviceKinds];
export const isServiceKind = (value: string): value is ServiceKind => (serviceKinds as string[]).includes(value);
export const isTravelKind = (value: string): value is TravelKind => (travelKinds as string[]).includes(value);

export const kindLabels: Record<TravelKind, { plural: string; singular: string; icon: "pin" | "home" | "compass" | "map" | "sparkles"; unit: string }> = {
  destinations: { plural: "Điểm đến", singular: "điểm đến", icon: "pin", unit: "" },
  hotels: { plural: "Khách sạn", singular: "khách sạn", icon: "home", unit: "phòng/đêm" },
  restaurants: { plural: "Nhà hàng", singular: "nhà hàng", icon: "sparkles", unit: "người/bữa" },
  attractions: { plural: "Điểm tham quan", singular: "điểm tham quan", icon: "compass", unit: "người" },
  transportations: { plural: "Phương tiện", singular: "phương tiện", icon: "map", unit: "" },
};
export const costUnitLabels: Record<string, string> = {
  PER_PERSON: "người",
  PER_PERSON_ROUND_TRIP: "người, khứ hồi",
  PER_ROOM_NIGHT: "phòng/đêm",
  PER_VEHICLE_TRIP: "chuyến xe",
  PER_GROUP: "nhóm",
};
export const modeLabels: Record<string, string> = {
  FLIGHT: "Máy bay", TRAIN: "Tàu hỏa", BUS: "Xe khách", CAR: "Ô tô", TAXI: "Taxi", MOTORBIKE: "Xe máy", BOAT: "Tàu/thuyền",
};
export const sourceLabels: Record<string, string> = { DEMO: "Dữ liệu demo", INTERNAL: "Nội bộ", EXTERNAL_API: "Nguồn ngoài" };

export type TravelItem = {
  id: string; slug: string; name: string; description: string; isActive: boolean; revision: number; updatedAt: string;
  source: string; sourceUrl: string | null; tags?: string[];
  destinationId?: string; destinationName?: string; destinationSlug?: string;
  address?: string; latitude?: number | null; longitude?: number | null;
  priceVnd?: string; costUnit?: string;
  province?: string; roomCapacity?: number; foodOptions?: string[]; durationMinutes?: number; isIndoor?: boolean;
  departure?: string; mode?: string; capacity?: number;
};
export type DestinationSummary = TravelItem & { counts: Record<ServiceKind, number> };
export type Pagination = { page: number; limit: number; total: number; totalPages: number };
export type ServiceList = { data: TravelItem[]; pagination: Pagination; facets: { tags: string[] } };
export type DestinationDetail = { destination: TravelItem } & Record<ServiceKind, TravelItem[]>;
export type AdminTravelList = { data: TravelItem[]; pagination: Pagination; destinations: { id: string; name: string; isActive: boolean }[] };

export const travelApi = {
  destinations: (signal?: AbortSignal) => apiFetch<{ data: DestinationSummary[] }>("travel/destinations", { signal }),
  destination: (slug: string, signal?: AbortSignal) => apiFetch<{ data: DestinationDetail }>(`travel/destinations/${encodeURIComponent(slug)}`, { signal }),
  services: (kind: ServiceKind, query: URLSearchParams, signal?: AbortSignal) => apiFetch<ServiceList>(`travel/${kind}?${query}`, { signal }),
};
export function adminTravelFetch<T>(path: string, options?: RequestInit) {
  return apiFetch<T>(`admin/travel/${path}`, { ...options, credentials: "include", cache: "no-store" });
}

export function formatPrice(item: Pick<TravelItem, "priceVnd" | "costUnit">) {
  if (item.priceVnd === undefined) return "";
  const amount = BigInt(item.priceVnd);
  const money = amount === 0n ? "Miễn phí" : `${new Intl.NumberFormat("vi-VN").format(amount)} ₫`;
  return amount === 0n || !item.costUnit ? money : `${money}/${costUnitLabels[item.costUnit] ?? ""}`.replace(/\/$/, "");
}
export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours} giờ${rest ? ` ${rest} phút` : ""}` : `${rest} phút`;
}
export function travelError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Không thể kết nối backend. Hãy thử lại.";
  if (error.status === 401) return "Bạn cần đăng nhập bằng tài khoản quản trị.";
  if (error.status === 403) return "Tài khoản không có quyền Admin hoặc phiên truy cập không hợp lệ.";
  if (error.code === "duplicate_slug") return "Slug đã được dùng. Hãy chọn slug khác.";
  if (error.code === "stale_revision") return "Dữ liệu đã được sửa ở nơi khác. Bấm Tải lại rồi mở lại bản ghi.";
  if (error.code === "invalid_destination") return "Điểm đến không còn tồn tại. Hãy tải lại danh sách.";
  if (error.status === 404) return "Bản ghi không còn tồn tại. Hãy tải lại danh sách.";
  if (error.status === 400) return "Thông tin chưa hợp lệ. Kiểm tra tên, slug (chữ thường, số, dấu gạch), giá (số nguyên VNĐ) và các trường bắt buộc.";
  return "Chưa thể lưu hoặc tải dữ liệu. Hãy kiểm tra backend rồi thử lại.";
}
