import { apiFetch, ApiError } from "./api";

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  revision: number;
};
export type AdminTour = AdminCategory & {
  categoryId: string;
  departureLocation: string;
  durationDays: number | null;
  needsReview: boolean;
};
export type AdminData = { categories: AdminCategory[]; tours: AdminTour[] };
export type ContentStop = {
  id?: string;
  type: string;
  title: string;
  content: string;
  placeName: string | null;
};
export type ContentDay = {
  id?: string;
  title: string;
  mealNote: string | null;
  stops: ContentStop[];
};
export type TourContent = {
  id: string;
  name: string;
  revision: number;
  images: string[];
  days: ContentDay[];
};
export type CatalogForm = {
  name: string;
  slug: string;
  status: "active" | "inactive";
  categoryId?: string;
  departureLocation?: string;
  durationDays?: number | null;
};
export function adminFetch<T>(path: string, options?: RequestInit) {
  return apiFetch<T>(`admin/${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
  });
}
export function adminError(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Không thể kết nối backend. Hãy thử lại.";
  if (error.status === 401) return "Bạn cần đăng nhập để quản lý catalog.";
  if (error.status === 403)
    return "Tài khoản không có quyền Admin hoặc phiên truy cập không hợp lệ.";
  if (error.code === "stale_revision")
    return "Dữ liệu đã được sửa ở nơi khác. Bấm Tải lại rồi mở lại bản ghi trước khi sửa.";
  if (error.code === "busy")
    return "Catalog đang được lưu bởi một yêu cầu khác. Hãy thử lại.";
  if (error.code === "invalid_category")
    return "Category không còn tồn tại. Hãy tải lại danh sách.";
  if (error.code === "invalid_content")
    return "Nội dung chưa hợp lệ: ảnh phải là URL HTTPS không trùng; ngày và hoạt động cần tiêu đề. Tối đa 40 ảnh, 60 ngày, 100 hoạt động/ngày.";
  if (error.code === "invalid_child")
    return "Ngày hoặc hoạt động không thuộc tour này hoặc đã bị gỡ. Hãy tải lại dữ liệu.";
  if (error.status === 400)
    return "Thông tin chưa hợp lệ. Kiểm tra tên, slug, category và số ngày (1–365).";
  if (error.status === 404)
    return "Bản ghi không còn tồn tại. Hãy tải lại danh sách.";
  return "Chưa thể lưu hoặc tải catalog. Hãy kiểm tra backend rồi thử lại.";
}
export function catalogSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
