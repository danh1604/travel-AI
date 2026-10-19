# Authentication và phân quyền

## Chạy local chưa cần Docker

```powershell
npm run dev
```

Frontend có `/register`, `/login`, `/account` và `/admin`. Tài khoản đăng ký luôn là USER; role gửi trong request bị từ chối. Đăng ký thành công sẽ đăng nhập ngay.
Auth local dùng PostgreSQL nhúng PGlite, lưu ở `backend/data/auth/` (gitignored/dockerignored); tài khoản và session còn sau khi restart. Lần đăng ký/đăng nhập đầu tiên sẽ tạo database và áp dụng các migration SQL đã commit.
Explore vẫn dùng snapshot catalog; auth local không tự nhập tài khoản MongoDB hoặc chuyển tài khoản phát triển sang PostgreSQL production.
Chỉ chạy một backend với database auth local. Database này không dành cho production.

## API

| Method | Endpoint | Chức năng |
|---|---|---|
| POST | `/api/auth/register` | Tạo tài khoản USER và session |
| POST | `/api/auth/login` | Kiểm tra mật khẩu, tạo/đổi session |
| POST | `/api/auth/logout` | Thu hồi session hiện tại và xóa cookie |
| GET | `/api/auth/me` | User hiện tại hoặc `null` |
| GET | `/api/auth/account` | User hiện tại; trả 401 khi chưa đăng nhập |
| GET | `/api/auth/admin/overview` | Thống kê tài khoản; trả 401/403 nếu không đủ quyền |

POST yêu cầu JSON và header Origin khớp `CLIENT_ORIGIN`. Browser tự gửi Origin; frontend/frontend cần `credentials: include`. CORS chỉ cho origin đã cấu hình và hỗ trợ credential.
Tên 2–80 ký tự, email được trim/lowercase, mật khẩu 12–128 ký tự. Mật khẩu không bị trim hoặc lưu trong localStorage/log. Chưa có xác minh email, khôi phục mật khẩu, OAuth hoặc chỉnh sửa profile.

## Session và bảo mật

Password dùng scrypt với salt riêng, N=32768, r=8, p=3, format có version; cấu hình này nằm trong các phương án [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Dùng [Node crypto](https://nodejs.org/api/crypto.html) async và timingSafeEqual; tài khoản không có/không đúng định dạng hash vẫn chạy phép tính dummy khi login.
Session là token ngẫu nhiên 32 bytes. Cookie chứa token; database chỉ lưu SHA-256 của token. Thời hạn tuyệt đối 7 ngày, không tự kéo dài. Login đổi token cookie hiện tại; logout thu hồi session hiện tại. Các session ở thiết bị khác vẫn giữ nguyên. Role được đọc từ User mỗi request, không tin role client hay một JWT cũ.
Cookie HttpOnly, Path=/, không Domain. Local dùng `pwy_session` + SameSite=Lax; production dùng `__Host-pwy_session` + Secure. Cấu hình theo [MDN cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
Origin guard áp dụng cả register/login/logout để chặn CSRF từ website khác. Đăng nhập giới hạn 30 request/IP/15 phút, đăng ký 10 request/IP/giờ; limiter hiện lưu trong memory của một tiến trình. Nếu chạy nhiều instance cần store dùng chung.

## Cấp quyền Admin

Đã có trang [Quản lý tài khoản](account-admin.md) tại `/admin/users` để xem user và cấp/thu hồi quyền trực tiếp trên web. Các bước CLI dưới đây dùng để tạo Admin đầu tiên hoặc phục hồi quyền khi cần.

1. Đăng ký tài khoản qua `/register`.
2. Nếu dùng PGlite local, dừng backend trước khi mở database bằng CLI.
3. Chạy lệnh với email tài khoản của bạn:

```powershell
npm.cmd run auth:admin -- --email=your-account@example.com
```

4. Khởi động lại backend và mở `/account` hoặc `/admin`.

Không tạo tài khoản/mật khẩu admin mặc định. Không có endpoint cho user tự nâng quyền. CLI chỉ cập nhật một tài khoản có passwordHash đang tồn tại trong database auth được chọn.
PGlite dùng `.process.lock` để ngăn hai tiến trình ghi cùng database. Backend/CLI tự phục hồi file khóa nếu PID ghi trong đó đã dừng: kiểm tra tiến trình, giành quyền phục hồi độc quyền, kiểm tra lại rồi mới thay khóa. Không xóa dữ liệu, tài khoản, mật khẩu hoặc session. Nếu PID vẫn sống, không xác minh được PID, hoặc file khóa không hợp lệ, thao tác vẫn bị chặn. Vì vậy vẫn cần dừng backend trước khi chạy CLI cấp Admin.

Nếu hai tiến trình cùng mở lại database sau crash, chỉ một tiến trình được phục hồi/giữ khóa; tiến trình còn lại bị từ chối. Nếu lỗi báo đang phục hồi, đợi ngắn rồi thử lại. Trường hợp hiếm tiến trình bị dừng ngay trong lúc phục hồi có thể để lại `.process.lock.recover-<PID>`; chỉ kiểm tra/xóa file khóa hoặc file phục hồi liên quan sau khi xác nhận mọi backend/CLI đã dừng. Không xóa `backend/data/auth/` hoặc sửa migration cũ. Migration đã áp dụng có checksum.

## Production / VPS

Đặt `NODE_ENV=production`, `DATABASE_URL`, `CLIENT_ORIGIN=https://<frontend-domain>`. Mặc định auth và catalog chuyển sang PostgreSQL; production từ chối PGlite/snapshot. Áp dụng migration mới trước khi khởi động runtime.
Nên dùng frontend/API dưới cùng site, ví dụ `app.example.com` và `api.example.com`, với `SESSION_COOKIE_SAME_SITE=lax`.
Nếu frontend Vercel và API ở hai site khác nhau, cấu hình `SESSION_COOKIE_SAME_SITE=none`; cookie luôn Secure trong production. Trình duyệt có thể chặn cookie bên thứ ba, nên cấu hình domain cùng site là phương án ít vấn đề hơn.
Với Nginx/Caddy một hop, đặt `TRUST_PROXY_HOPS=1`; chỉ tin đúng số reverse proxy thật để limiter nhận IP client. Không đặt trust proxy tùy tiện hoặc expose trực tiếp cổng API bên cạnh proxy.
Cookie chỉ giữ ở domain API; frontend không đọc token. API gọi từ server component phải có cơ chế chuyển tiếp cookie khi cần; hiện các màn hình auth gọi API phía browser, còn trang tour public không cần session.

## Kiểm tra

```powershell
npm run test:auth
npm run test:database
npm run typecheck
npm run build
npm run lint
```

Test auth dùng database tạm biệt lập: hash, role injection, cookie flags, Origin, invalid credentials, rotate/revoke/expiry, 401/403, limiter và persistence sau reopen. Có kiểm thử hai tiến trình cạnh tranh khóa, giữ nguyên khóa còn chủ/không xác minh được, cùng phục hồi tài khoản Admin, mật khẩu và session sau khi backend bị kill. Chưa chạy auth trên PostgreSQL/VPS thật khi Docker chưa được cài.
