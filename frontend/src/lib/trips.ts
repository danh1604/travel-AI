import { apiFetch, ApiError } from "./api";
import type { ReadyPlan } from "./planner";
export type SavedTrip = { id: string; title: string; notes: string; revision: number; updatedAt: string; createdAt: string; savedAt: string; plan: ReadyPlan };
export type TripSummary = { id: string; title: string; destination: string | null; days: number | null; people: number | null; startDate: string | null; budgetVnd: number | null; savedAt: string };
export type TripList = { data: TripSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
export function tripsFetch<T>(path = "", options?: RequestInit): Promise<T> {
  return apiFetch<T>(`trips${path}`, { ...options, credentials: "include", cache: "no-store" });
}
export function tripError(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return "Lịch trình đã được thay đổi ở nơi khác. Bản sửa của bạn vẫn được giữ; tải bản mới trước khi sửa tiếp.";
  if (error instanceof ApiError && error.status === 400) return "Kiểm tra ngày đi, ghi chú và hoạt động. Cần giữ ít nhất một hoạt động, không trùng nguồn và tối đa 6 hoạt động mỗi ngày.";
  if (error instanceof ApiError && error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error instanceof ApiError && error.status === 404) return "Lịch trình không còn tồn tại hoặc không thuộc tài khoản hiện tại.";
  return "Chưa thể xử lý lịch trình. Vui lòng kiểm tra kết nối rồi thử lại.";
}
