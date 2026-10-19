import { ApiError } from "./api";

export type ManagedAccount = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  createdAt: string;
  updatedAt: string;
  roleRevision: number;
  canLogin: boolean;
  activeSessions: number;
};
export type AccountList = {
  data: ManagedAccount[];
  currentUserId: string;
  stats: { users: number; admins: number; loginAdmins: number };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
export function accountAdminError(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Không kết nối được backend. Hãy thử lại.";
  if (error.status === 401) return "Bạn cần đăng nhập để quản lý tài khoản.";
  if (error.status === 403)
    return "Tài khoản không còn quyền Admin hoặc phiên truy cập không hợp lệ.";
  if (error.code === "last_admin")
    return "Cần giữ ít nhất một tài khoản Admin có thể đăng nhập. Hãy cấp quyền cho tài khoản khác trước.";
  if (error.code === "stale_account")
    return "Quyền tài khoản đã được thay đổi ở nơi khác. Bấm Tải lại rồi kiểm tra lại trước khi lưu.";
  if (error.code === "login_unavailable")
    return "Tài khoản này chưa thiết lập đăng nhập nên chưa thể cấp quyền Admin.";
  if (error.status === 404)
    return "Tài khoản không còn tồn tại. Hãy tải lại danh sách.";
  if (error.status === 400)
    return "Yêu cầu chưa hợp lệ. Hãy kiểm tra bộ lọc hoặc tải lại dữ liệu.";
  return "Dịch vụ quản lý tài khoản tạm thời chưa sẵn sàng. Hãy thử lại.";
}
export function accountDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
