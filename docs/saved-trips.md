# Lưu lịch trình theo tài khoản

1. Đăng nhập, mở `/planner`, tạo lịch trình mới.
2. Trang chuyển tới khung **Kế hoạch của bạn** sau khi nhận kết quả. Bấm **Lưu vào chuyến đi của tôi** ngay phía trên lịch từng ngày, rồi bấm **Mở lịch đã lưu** để xem lại. Nút luôn hiển thị trong khung kết quả, chỉ bật khi đăng nhập và tạo được kết quả có mã bản nháp trên server. Lịch chưa được lưu vào tài khoản cho tới khi bấm lưu thành công.
3. Trang `/my-trips` hiển thị lịch của tài khoản hiện tại, có phân trang, ngày đi, số người và ngân sách nhóm.
4. Chọn **Xem lịch trình** để mở `/my-trips/:id`, tải JSON hoặc đọc lại nguồn tour/thời tiết. Không gọi lại AI.
5. Bấm **Xóa → Xác nhận xóa** trong danh sách để xóa vĩnh viễn lịch khỏi tài khoản.

## Chỉnh sửa thủ công

Trong chi tiết chuyến đi bấm **Chỉnh sửa lịch trình**: đổi tên, ngày khởi hành, ghi chú chung/ngày/hoạt động, đổi buổi, chuyển hoạt động sang ngày khác, sắp xếp trong cùng buổi hoặc bỏ hoạt động. Bấm **Lưu thay đổi** để lưu, **Hủy chỉnh sửa** để giữ bản cũ. Không gọi AI và không thay đổi catalog nguồn.

Ngày của từng ngày trong lịch được tính lại từ ngày đi, có thể để trống ngày đi. Đổi ngày sẽ bỏ dự báo và danh sách tour gợi ý cũ để tránh hiểu nhầm rằng chúng áp dụng cho ngày mới. Chi phí chưa biết vẫn là null. Chưa cho tự thêm dịch vụ/giá hoặc đổi số ngày trong bước này; chỉ thao tác các hoạt động đã có trong bản lịch hiện tại. Giữ tối thiểu 1 hoạt động, tối đa 6/ngày. Lịch được đánh dấu đã sửa thủ công.

API `PATCH /api/trips/:id` nhận `{revision,title,startDate,notes,days:[{dayNumber,note,activities:[{ref,period,note}]}]}`. Backend tự lấy lại nội dung, nguồn và giá từ bản đã lưu; từ chối ref bịa, ref trùng, ngày không hợp lệ, can thiệp owner/snapshot. Chỉ chủ sở hữu được sửa. `revision` tăng sau mỗi lần lưu; tab dùng bản cũ nhận 409, giữ bản sửa trên màn hình và có nút **Bỏ bản sửa, tải lại từ server**. Danh sách My Trips hiển thị tên mới.

Migration bổ sung: `20261018000200_edit_saved_plans`; PostgreSQL/VPS cần chạy `npm run db:deploy`. Các lịch cũ có revision=1 và tên mặc định, vẫn mở/sửa được.

Kết quả đã tạo trước khi có tính năng này chưa có mã bản nháp trên server: cần tạo lại một lần để lưu. Bấm lưu lại cùng bản nháp không tạo bản sao.

## Dữ liệu và quyền truy cập

- Backend lưu nguyên kết quả `ready` thành bản nháp riêng tư trước khi trả response Planner, kèm `draftId`. Browser chỉ gửi `{draftId}` khi lưu, không được tự gửi snapshot/ownerId để giả kết quả AI.
- `ownerId` lấy từ session HttpOnly; mọi truy vấn xem/lưu/xóa đều lọc theo tài khoản. Admin cũng không được đọc lịch người khác qua API này. ID không tồn tại hoặc thuộc người khác cùng trả 404.
- Snapshot ban đầu giữ ngày yêu cầu, hoạt động, nguồn, tour gần nhất, weather và cảnh báo ngân sách tại thời điểm tạo; chủ tài khoản có thể chỉnh sửa theo luồng trên. Thay đổi catalog không tự làm sửa lịch đã lưu. Giá/số chỗ/thời tiết là thông tin lịch sử, không đảm bảo còn hiệu lực khi đi thực tế.
- Bản nháp chỉ xuất hiện trong My Trips sau khi bấm Lưu. Bản nháp chưa lưu quá 7 ngày được dọn khi tài khoản tạo lịch mới; lịch đã lưu không tự hết hạn.
- Các API trả `Cache-Control: no-store`; frontend bỏ kết quả cũ khỏi màn hình khi đổi tài khoản và không lưu lịch vào localStorage.
- Local dùng cùng database PGlite auth ở `backend/data/auth/`; không cần Docker, dữ liệu còn sau restart. Production dùng cùng PostgreSQL của tài khoản.
- Bảng `SavedPlan` có FK User `ON DELETE CASCADE`, `snapshot JSONB`, `createdAt`, `savedAt`. Tách khỏi `Trip` dành cho dịch vụ có Destination và giá xác minh, tránh phải bịa Destination ID/giá/activity khi Planner chưa có các dữ liệu đó.

Migration mới: `20261018000100_saved_plans`. Local tự áp dụng khi auth repository khởi tạo lại; PostgreSQL/VPS cần `npm run db:deploy` trước khi chạy backend phiên bản này. Không thay đổi tài khoản hoặc mật khẩu hiện tại.

## API

| Method | Path | Dữ liệu |
|---|---|---|
| POST | `/api/trips` | JSON `{draftId}`; lưu đúng bản nháp của session, idempotent |
| GET | `/api/trips?page=1&limit=12` | Danh sách tóm tắt và pagination; limit tối đa 24 |
| GET | `/api/trips/:id` | `{data:{id,createdAt,savedAt,plan}}`; chỉ lịch đã lưu |
| DELETE | `/api/trips/:id` | JSON `{}`; xóa lịch đã lưu thuộc session |

Các thao tác ghi yêu cầu Origin bằng `CLIENT_ORIGIN` và JSON. Không có endpoint chia sẻ công khai, sửa lịch bằng hội thoại hoặc đặt tour trong thay đổi này.

Kiểm tra: `npm run test:trips`. Test tạo hai tài khoản riêng trong database tạm, kiểm tra Planner → draft → save → list/detail → restart → delete, quyền sở hữu, session hết hạn, Origin, chống giả snapshot và lưu lặp. Không ghi lịch test vào tài khoản thật, không gọi AI hoặc dịch vụ ngoài.
