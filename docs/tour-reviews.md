# Đánh giá tour

Cuối trang chi tiết tour có phần **Đánh giá & nhận xét**. Khách chưa đăng nhập đọc được nhận xét công khai và điểm trung bình. Sau đăng nhập, chọn 1–5 sao; nhận xét tùy chọn, tối đa 2.000 ký tự. Mỗi tài khoản có một đánh giá/tour, được sửa hoặc xóa. Xóa có bước xác nhận. Chưa có xác minh đặt tour nên không gắn nhãn đã trải nghiệm.

Admin mở **Quản lý đánh giá tour** từ `/admin` hoặc `/admin/reviews`, xem tất cả đánh giá và ẩn/hiển thị lại. Nội dung bị ẩn không xuất hiện trong danh sách công khai hoặc điểm trung bình. Chủ đánh giá vẫn xem/sửa/xóa được; sửa không tự bỏ cờ ẩn. Đây là kiểm duyệt nội dung, chưa có báo cáo vi phạm hay cơ chế cấm tài khoản gửi lại sau khi xóa.

Lưu trong `TourReview` cùng database tài khoản: PGlite local, PostgreSQL production. Không ghi vào catalog JSON, không gọi AI và không đưa đánh giá vào RAG. FK người dùng có cascade; `tourId` không có FK sang bảng tour vì catalog local nằm trong snapshot. API kiểm tra tour còn công khai qua catalog loader trước khi khách đọc/gửi/sửa/xóa. Admin vẫn xem nội dung của tour đã ẩn để kiểm duyệt. Tên người viết lấy từ tên hiển thị của tài khoản; email, mật khẩu và session không được trả trong API đánh giá.

Migration `20261019000100_tour_reviews` tự áp dụng khi database local được mở lại. Với VPS/PostgreSQL chạy `npm run db:deploy` trước khi dùng bản server mới. Ràng buộc SQL kiểm tra sao 1–5, độ dài nhận xét và unique `(tourId,userId)`. Điểm trung bình và danh sách được đọc trong một SQL statement; ẩn đánh giá được phản ánh vào thống kê ở lần tải sau. Thay đổi dùng revision để từ chối ghi đè bản cũ (409). Không có đánh giá mẫu hoặc chỉnh tài khoản thật trong các kiểm thử.

API dưới `/api/reviews`:

- `GET /tours/:tourId?page=1`: tối đa 10 đánh giá công khai, tổng, trung bình, số trang và `mine` nếu có session. `mine` chỉ là đánh giá của tài khoản hiện tại, gồm trạng thái ẩn. Response no-store.
- `PUT /tours/:tourId/mine`: `{rating,comment?,revision}`; revision 0 để tạo, revision hiện tại để sửa. Server lấy chủ đánh giá từ session.
- `DELETE /tours/:tourId/mine`: `{revision}`.
- `GET /admin?page=1`: admin, 20 đánh giá/trang, cả công khai và bị ẩn.
- `PATCH /admin/:id`: admin, `{hidden,revision}`.

Mutation yêu cầu session, đúng Origin, JSON và giới hạn 30 thao tác/15 phút/IP (RAM/process). Nội dung hiển thị bằng React text, không render HTML từ người viết. Không tự động tải cập nhật giữa các browser; dùng **Tải lại đánh giá** khi cần.

Chạy `npm run test:reviews`, `npm run test:auth`, `npm run build` và `npm run lint`. Test dùng database tạm, kiểm tra quyền, Origin, schema, một đánh giá/tài khoản, thống kê, kiểm duyệt, xung đột, ghi đồng thời và khởi động lại database.
