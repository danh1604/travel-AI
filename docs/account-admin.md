# Quản lý tài khoản trong Admin

Mở `/admin`, chọn **Quản lý tài khoản**, hoặc vào `/admin/users`. Tài khoản đang đăng nhập phải có quyền ADMIN. Trang lấy dữ liệu từ bảng User của ứng dụng mới, gồm các tài khoản đã đăng ký tại `/register`. User của website MongoDB cũ chưa được chuyển thành tài khoản đăng nhập mới.

## Sử dụng

1. Tìm theo tên/email, lọc USER hoặc ADMIN. Danh sách có 20 tài khoản mỗi trang.
2. Chọn **Xem & phân quyền** để xem ID, email, ngày tạo/cập nhật, quyền hiện tại, thiết lập đăng nhập và số phiên chưa hết hạn. Số phiên còn hạn không phải số người đang online.
3. Chọn quyền mới, kiểm tra email và phần mô tả thay đổi, rồi bấm **Lưu quyền tài khoản**.

Thay đổi lưu vào database auth đang được cấu hình; không cần dừng backend hay chạy CLI. Local dùng PGlite nên quyền được giữ qua restart, chưa cần Docker. Production dùng PostgreSQL và cần chạy migration trước khi triển khai phiên bản mới.

USER sử dụng chức năng người dùng; ADMIN có thể quản lý nội dung tour và tài khoản. Khi quyền bị thu hồi, những request Admin tiếp theo của tài khoản đó sẽ trả 403 ngay cả khi cookie đăng nhập vẫn còn hạn. Nếu tự hạ quyền, trang chuyển về `/account`.

Backend giữ ít nhất một Admin đã thiết lập đăng nhập. Tài khoản chưa có password hash không thể được cấp Admin từ trang này. Mỗi lần lưu gửi phiên bản quyền `roleRevision`; nếu có người khác đã sửa, API trả 409 và bạn cần **Tải lại** rồi kiểm tra lại. Các thay đổi quyền được ghi vào bảng `AccountRoleChange`, gồm người thực hiện, tài khoản đích, quyền trước/sau và thời gian. Giao diện hiện chưa hiển thị lịch sử này.

Trang hiện hỗ trợ xem và phân quyền; chưa có khóa/xóa tài khoản, đổi email hay đặt lại mật khẩu. Các thông tin trả về không chứa password hash hoặc token session.

## API

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/admin/users?q=&role=&page=1&limit=20` | Danh sách, thống kê và ID Admin đang thao tác |
| PATCH | `/api/admin/users/:id/role` | Đổi quyền tài khoản |

`q` tối đa 100 ký tự, tìm chuỗi con không phân biệt hoa/thường theo tên/email; dấu tiếng Việt được giữ nguyên. `role` nhận chuỗi rỗng, USER hoặc ADMIN; page từ 1–100000, limit từ 1–50. Query và body từ chối trường dư. Không chấp nhận actorId do client gửi.

Body PATCH:

```json
{ "role": "ADMIN", "revision": 1 }
```

`revision` lấy từ `roleRevision` của bản ghi đã đọc. PATCH yêu cầu JSON, Origin khớp CLIENT_ORIGIN và session cookie Admin. Backend kiểm tra lại quyền người thao tác trong transaction, khóa các hàng Admin theo thứ tự cố định, kiểm tra Admin cuối cùng, cập nhật quyền/phiên bản và ghi lịch sử trong cùng transaction. Các câu SQL dùng tham số bind. Đổi về cùng quyền hiện tại là thao tác không làm tăng phiên bản hoặc thêm lịch sử, nhưng vẫn cần phiên bản đúng.

Lỗi: 401 chưa đăng nhập; 403 không có quyền hoặc Origin sai; 404 tài khoản không tồn tại; 409 `last_admin`, `stale_account`, `login_unavailable`; 400 input sai; 415 không dùng JSON; 503 database chưa sẵn sàng.

## Khởi tạo và kiểm thử

Admin đầu tiên hoặc trường hợp cần phục hồi quyền vẫn có thể dùng CLI theo [authentication.md](authentication.md). CLI chỉ cấp quyền, tăng phiên bản nếu quyền thay đổi và không ghi lịch sử thao tác web. Không cần chạy lại CLI để quản lý các user sau đó.

Migration mới thêm User.roleRevision và bảng AccountRoleChange, giữ nguyên tài khoản/mật khẩu/quyền hiện có. PGlite tự áp dụng migration khi mở database; PostgreSQL chạy `npm run db:deploy` trước khi khởi động backend mới.

```powershell
npm run test:admin
npm run test:auth
```

Kiểm thử dùng database riêng: truy vấn tìm kiếm/phân trang, dữ liệu trả về, cấp/thu hồi quyền, audit, phiên bản cũ, hai Admin cùng tự hạ quyền, quyền của người thao tác bị thu hồi, bảo vệ session/Origin và hiệu lực quyền ở request tiếp theo. Các file kiểm thử dùng PGlite chạy lần lượt để giảm RAM. Câu SQL dùng chung giữa PGlite và adapter PostgreSQL; cần kiểm tra tích hợp adapter trên PostgreSQL thật khi môi trường đó được thiết lập.

## Khi ổ C đầy trên máy local

Nếu npm báo `ENOSPC`, có thể đặt cache npm và file tạm trong project trên ổ H. Chạy các lệnh sau từ thư mục gốc `H:\travel-AI`, trong terminal dùng để chạy dự án:

```powershell
$taskCacheRoot = Join-Path (Get-Location) '.cache'
$env:npm_config_cache = Join-Path $taskCacheRoot 'npm'
$env:TEMP = Join-Path $taskCacheRoot 'tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
npm run dev
```

Các biến chỉ áp dụng trong terminal hiện tại và các tiến trình con. `.cache/` được gitignore/dockerignore; dữ liệu tài khoản vẫn ở `backend/data/auth/`. Cần duy trì dung lượng trống trên ổ hệ thống để các công cụ khác chạy ổn định.
