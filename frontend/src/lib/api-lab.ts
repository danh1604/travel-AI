export const probes = [
  {
    id: "health",
    name: "Kết nối Express",
    route: "/health",
    description: "Kiểm tra tiến trình API.",
  },
  {
    id: "ready",
    name: "PostgreSQL readiness",
    route: "/ready",
    description:
      "503 có thể xuất hiện khi chưa chạy PostgreSQL; không đồng nghĩa Explore bị lỗi.",
  },
  {
    id: "categories",
    name: "Danh mục tour",
    route: "/explore/categories",
    description: "Các danh mục có tour đang hiển thị.",
  },
  {
    id: "tours",
    name: "Danh sách tour",
    route: "/explore/tours",
    description: "Kiểm tra tìm kiếm, lọc và phân trang.",
  },
  {
    id: "detail",
    name: "Chi tiết tour",
    route: "/explore/tours/:id",
    description: "Ảnh, lịch trình mẫu và lịch khởi hành nguồn.",
  },
  {
    id: "me",
    name: "Phiên đăng nhập",
    route: "/auth/me",
    description: "user=null là kết quả hợp lệ khi chưa đăng nhập.",
  },
  {
    id: "account",
    name: "Tài khoản được bảo vệ",
    route: "/auth/account",
    description: "401 nếu chưa có session.",
  },
  {
    id: "admin",
    name: "Quyền quản trị",
    route: "/auth/admin/overview",
    description: "401 khi chưa đăng nhập; 403 khi tài khoản không phải Admin.",
  },
] as const;
export type ProbeId = (typeof probes)[number]["id"];
export type ProbeOptions = {
  q: string;
  category: string;
  page: string;
  limit: string;
  tourId: string;
};
export function probePath(id: ProbeId, options: ProbeOptions): string {
  const probe = probes.find((item) => item.id === id);
  if (!probe) throw new Error("Unknown probe");
  if (id === "detail") {
    if (!options.tourId.trim() || [".", ".."].includes(options.tourId.trim()))
      throw new Error("Chọn hoặc nhập ID tour trước khi kiểm tra.");
    return `explore/tours/${encodeURIComponent(options.tourId.trim())}`;
  }
  if (id === "tours") {
    const query = new URLSearchParams({
      page: options.page,
      limit: options.limit,
    });
    if (options.q.trim()) query.set("q", options.q.trim());
    if (options.category) query.set("category", options.category);
    return `explore/tours?${query}`;
  }
  return probe.route.slice(1);
}
export function probeStatus(
  id: ProbeId,
  status: number,
): { label: string; tone: "success" | "notice" | "error" } {
  if (status >= 200 && status < 300)
    return { label: "Phản hồi thành công", tone: "success" };
  if (id === "ready" && status === 503)
    return { label: "PostgreSQL chưa sẵn sàng", tone: "notice" };
  if ((id === "account" || id === "admin") && status === 401)
    return { label: "Cần đăng nhập", tone: "notice" };
  if (id === "admin" && status === 403)
    return { label: "Cần quyền Admin", tone: "notice" };
  return {
    label: status ? "Cần kiểm tra phản hồi" : "Chưa kết nối được",
    tone: "error",
  };
}
