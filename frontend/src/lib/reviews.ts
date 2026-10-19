import { apiFetch, ApiError } from "./api";
export type Review = { id: string; tourId: string; rating: number; comment: string; authorName: string; hidden: boolean; revision: number; createdAt: string; updatedAt: string };
export type ReviewList = { data: Review[]; mine: Review | null; total: number; average: number | null; page: number; totalPages: number };
export function reviewsFetch<T>(path: string, options?: RequestInit) { return apiFetch<T>(`reviews/${path}`, { ...options, credentials: "include", cache: "no-store" }); }
export function reviewError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Bạn cần đăng nhập để gửi hoặc quản lý đánh giá.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 409) return "Đánh giá đã thay đổi ở nơi khác. Bấm tải lại để xem bản mới trước khi sửa tiếp.";
    if (error.status === 429) return "Bạn thao tác hơi nhanh. Chờ một chút rồi thử lại nhé.";
    if (error.status === 400) return "Chọn 1–5 sao và nhận xét tối đa 2.000 ký tự nhé.";
    if (error.status === 404) return "Tour này không còn được hiển thị công khai.";
  }
  return "Chưa kết nối được phần đánh giá. Bạn thử lại sau nhé.";
}
export function reviewDate(date: string) { return new Date(date).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }); }
