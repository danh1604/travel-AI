# Khung giao diện và kiểm tra API

Chạy `npm run dev`, mở http://localhost:3000. Không cần Docker để xem Explore/snapshot hoặc dùng tài khoản PGlite local.

| Đường dẫn | Nội dung | Trạng thái |
|---|---|---|
| `/` | Trang tổng quan, kết nối API, số tour/category, tour gợi ý | Dữ liệu từ API thật |
| `/explore` | Tour dạng thẻ hoặc bảng, tìm kiếm/lọc/phân trang | Đã kết nối |
| `/explore?view=table` | Bảng so sánh tour, danh mục, thời lượng và giá | Đã kết nối |
| `/explore/tours/[id]` | Chi tiết tour và đánh giá của khách | Đã kết nối |
| `/planner` | Mẫu yêu cầu, tiến trình xử lý, AI chọn hoạt động, thời tiết, tải JSON, lưu tài khoản | Đã kết nối; nhận điểm đến từ chatbot |
| `/my-trips` | Danh sách, phân trang và xóa lịch đã lưu của tài khoản | Đã kết nối API riêng tư |
| `/my-trips/:id` | Xem lại nguyên lịch trình đã lưu, tải JSON | Chỉ chủ tài khoản được xem |
| `/login`, `/register`, `/account` | Các màn hình tài khoản | Đã kết nối |
| `/admin` | Thống kê tài khoản, kiểm tra quyền và liên kết quản lý catalog | Đã kết nối |
| `/admin/users` | Tìm/xem tài khoản, cấp và thu hồi quyền Admin | Đã kết nối; bảo vệ Admin cuối cùng |
| `/admin/tours`, `/admin/categories` | Tìm kiếm, tạo/sửa, ẩn/hiện catalog | Đã kết nối; yêu cầu Admin |
| `/admin/tours/:id/content` | Thêm/gỡ/sắp xếp ảnh và lịch trình từng ngày | Đã kết nối; yêu cầu Admin |
| `/admin/tours/:id/departures` | Ngày đi/về, giá, số chỗ và trạng thái nhận khách | Đã kết nối; yêu cầu Admin |
| `/admin/login` | Đăng nhập khu vực quản trị | Cùng hệ thống tài khoản, kiểm tra role ADMIN |
| `/admin/tools` | API Lab, status, thời gian phản hồi và JSON | Chỉ admin trong `next dev` |
| `/dev/api` | Chuyển tới `/admin/tools`, giữ tourId nếu có | Đường dẫn cũ trong dev; production 404 |

Khách hàng và admin có hai layout riêng. `frontend/src/app/(customer)/` chứa trang khách và layout dùng `AppShell` + chatbot; route group không đổi URL. `frontend/src/app/admin/` dùng `AdminShell`: tổng quan, tour/lịch khởi hành, danh mục, tài khoản, đánh giá và công cụ dev. Root layout chỉ giữ HTML, CSS và AuthProvider. Không hiện menu quản trị/API Lab trong điều hướng khách; tài khoản admin có lối chuyển sang quản trị ở khu tài khoản.

AdminShell đợi kiểm tra phiên cho đúng pathname trước khi mount nội dung; lỗi kết nối, chưa đăng nhập hoặc role USER đều không mount trang quản trị. Đây là chặn hiển thị phía client; backend vẫn kiểm tra session/role/Origin trên từng API có quyền, không dựa vào việc ẩn menu. Trang `/admin/login` được phép mở khi chưa đăng nhập; chỉ đăng nhập role ADMIN mới đi tiếp. Return URL giới hạn đường dẫn nội bộ `/admin`, không nhận URL ngoài. Tài khoản và session vẫn dùng chung: đăng xuất ở một khu vực cũng đăng xuất khu vực còn lại khi kiểm tra phiên lại.

Giao diện dùng tông trắng ngà/mint cho khách, trắng/xanh nhạt cho admin, header sáng và thẻ nền trắng. Sidebar trên desktop, thanh điều hướng cuộn ngang trên màn hình nhỏ. Chatbot chỉ mount ở layout khách, không xuất hiện trong admin.

Trên các trang khách hàng có nút **Hỏi trợ lý du lịch** ở góc phải dưới, hỗ trợ màn hình nhỏ, Enter để gửi/Shift+Enter để xuống dòng/Escape để đóng. Chat dùng dữ liệu public và hướng dẫn sản phẩm, có nguồn và nút điền nhu cầu sang Planner; không đọc lịch riêng. Không gọi AI khi chỉ mở widget. Chi tiết: [rag-assistant.md](rag-assistant.md).

## Kiểm tra tour

Quản lý catalog và cách cấp Admin: [catalog-admin.md](catalog-admin.md). Sau khi chỉnh sửa có thể mở Explore để đối chiếu; không cần Docker ở local.

1. Mở Explore, chuyển sang “Dạng bảng”.
2. Với quyền admin, vào `/admin/tours` để lấy ID hoặc mở tour cần đối chiếu.
3. Mở `/admin/tools`, chọn phần chi tiết và điền ID tour; nhấn “Gửi GET”.
4. Đối chiếu `data`, `meta`, giá nguồn và lịch khởi hành với trang tour.

## API Lab

Chỉ gửi GET tới whitelist endpoint của Express API từ `NEXT_PUBLIC_API_URL`, không cung cấp arbitrary URL, request body hoặc thao tác ghi. Có nút kiểm tra từng endpoint hoặc toàn bộ endpoint hiện có.
Cookie tài khoản hiện tại được gửi cùng request để kiểm tra session/quyền. Không hiển thị cookie HttpOnly, token hoặc chuỗi kết nối database. JSON `auth/me` có thể chứa thông tin tài khoản của chính bạn.

- HTTP 200: phản hồi thành công; `auth/me.user=null` hợp lệ với khách.
- HTTP 401 ở account/Admin: cần đăng nhập.
- HTTP 403 ở Admin: session có thể hợp lệ nhưng thiếu quyền Admin.
- HTTP 503 ở readiness: PostgreSQL chưa sẵn sàng; Explore và auth local vẫn có thể hoạt động.
- HTTP 503 ở catalog: không tải được nguồn catalog.
- Lỗi kết nối/CORS/timeout: không có HTTP status đọc được ở browser.

Response là kết quả lần chạy cuối, kèm đường dẫn và thời điểm thực tế. JSON dài được rút gọn sau 60.000 ký tự. Không tự gửi request thay đổi tài khoản hoặc quyền.
Trong production, `/dev/api` và `/admin/tools` trả 404, menu công cụ không hiển thị. Trong dev, công cụ nằm trong layout quản trị, yêu cầu phiên admin. API Lab chỉ gọi các API vốn có; từng API vẫn kiểm tra quyền của mình.

Kiểm tra tự động: `npm run test:ui` cho việc tạo đường dẫn an toàn và phân loại status; `npm run test:explore` cho API tour. Build/lint/typecheck kiểm tra các màn hình mới.
