# Đưa giao diện lên Vercel trước

Frontend Next.js có thể deploy ngay khi backend chưa public. Bản này hiển thị giao diện; dữ liệu tour, tài khoản, Planner và chatbot chờ API Express. Production khi chưa đặt `NEXT_PUBLIC_API_URL` không gọi localhost của khách và không tạo dữ liệu giả. File `.env.local` trên máy phát triển không dùng làm môi trường Vercel.

## Cấu hình project

Repository: `https://github.com/danh1604/travel-AI`. Chọn nhánh có mã frontend mới nhất; hiện thay đổi chưa push sẽ không xuất hiện nếu deploy bằng Git. Deploy CLI có thể gửi mã local sau khi đăng nhập Vercel.

- Framework: **Next.js**.
- Root Directory: **frontend**.
- Cho phép build đọc file ngoài Root Directory để dùng `tsconfig.base.json` và npm lockfile ở gốc monorepo.
- Build Command: **npm run build** trong frontend, đã khai báo ở `frontend/vercel.json`. Không dùng lệnh build toàn monorepo vì backend sẽ chạy trên VPS sau.
- Output Directory: giữ mặc định Next.js, không điền `dist` hoặc `out`.
- Install Command: giữ mặc định npm theo workspace/lockfile.
- Giai đoạn chỉ đưa giao diện online: **chưa đặt NEXT_PUBLIC_API_URL**. Không nhập `http://localhost:4000/api` trên Vercel.

Không đưa AI_API_KEY, WEATHER_API_KEY, DATABASE_URL hoặc file backend/.env lên frontend. `.vercelignore` ở gốc loại file môi trường, dữ liệu local và cache khỏi upload CLI. Lệnh chạy CLI từ thư mục gốc để áp dụng cấu hình bỏ qua này; project Vercel cần Root Directory frontend.

## Khi backend đã public

1. Deploy Express và PostgreSQL lên VPS, áp dụng migration; cung cấp API HTTPS ổn định.
2. Đặt `NEXT_PUBLIC_API_URL=https://api.tenmien.vn/api` trong môi trường Vercel rồi redeploy frontend. Biến `NEXT_PUBLIC_*` được đóng gói lúc build.
3. Backend: `NODE_ENV=production`, `CLIENT_ORIGIN=https://ten-project.vercel.app`, cấu hình database/provider và reverse proxy phù hợp. Không đặt origin wildcard khi dùng cookie.
4. Nếu frontend và API ở khác site, cấu hình cookie theo `docs/authentication.md`; khi dùng domain cùng site thường ít gặp vấn đề cookie bên thứ ba hơn.
5. Kiểm tra tour, đăng nhập, tạo/lưu lịch, chatbot và admin từ địa chỉ Vercel thật.

Vercel chỉ chạy frontend trong phương án này; Docker/VPS và database không được khởi tạo trên Vercel. Chưa có URL deploy nếu tài khoản Vercel chưa được liên kết/xác thực thành công.

Nguồn cấu hình: [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json), [monorepos](https://vercel.com/docs/monorepos), [CLI login](https://vercel.com/docs/cli/login).
