# PickYourWay AI

Khung monorepo dùng npm workspaces, TypeScript và Node.js 22.13+ (khuyến nghị bản 22 LTS mới nhất).

```text
frontend/       Next.js App Router + Tailwind CSS, deploy Vercel
backend/       Express API, nghiệp vụ, database và WeatherAPI.com
ai-services/ Module nội bộ: OpenAI-compatible client, kiểu dữ liệu và sau này agent/tools/RAG
```

`ai-services` được backend import, không phải HTTP service riêng. Frontend và backend có thư mục mã, cấu hình và file môi trường riêng, dùng chung npm workspace ở gốc.

Chạy cả hai: `npm run dev`. Chạy riêng: `npm run dev:frontend` và `npm run dev:backend` trong hai terminal ở thư mục gốc. Build riêng: `npm run build:frontend` hoặc `npm run build:backend`. Các lệnh cũ `dev:client`, `dev:server`, `build:server` vẫn là alias để tương thích. Tên package nội bộ `@pickyourway/client` và `@pickyourway/server` được giữ nguyên; đường dẫn thực tế là `frontend/` và `backend/`.

## Chạy local

```powershell
npm install
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
npm run catalog:snapshot
docker compose up -d database
npm run db:deploy
npm run db:seed
npm run dev
```

Frontend: http://localhost:3000. API health: http://localhost:4000/api/health.
Có thể chạy `npm run dev` khi chưa có Docker/database: health endpoint chỉ kiểm tra tiến trình API, không kiểm tra database hay các provider.
API readiness: http://localhost:4000/api/ready kiểm tra database, bảng Destination và pgvector; trả 503 nếu chưa sẵn sàng. Explore vẫn chạy được bằng snapshot khi readiness PostgreSQL trả 503.
Chỉ copy file env khi chưa có, tránh ghi đè cấu hình đã sửa. Sau khi thay đổi password ở root `.env`, cập nhật `DATABASE_URL` trong `backend/.env` tương ứng.

## Khung website để kiểm tra

Giao diện khách hàng dùng layout riêng tại `/`, `/explore`, `/planner`, `/my-trips` và `/account`. Quản trị có menu/layout riêng tại `/admin`, đăng nhập ở `/admin/login`; chỉ role ADMIN được mở nội dung quản trị. Cùng hệ thống tài khoản và API bảo vệ quyền ở backend. Giao diện dùng tông sáng trắng/mint. Trong dev, công cụ kiểm tra API nằm tại `/admin/tools`, không hiện trong menu khách hàng.
Chi tiết các trang và luồng đối chiếu tour: [docs/web-shell.md](docs/web-shell.md).

## Chạy Explore không cần Docker

Snapshot hiện đã được tạo từ MongoDB. Chạy `npm run dev` và mở http://localhost:3000/explore. Để cập nhật dữ liệu nguồn, chạy `npm run catalog:snapshot` rồi restart backend. Sau khi tạo snapshot, Explore không cần kết nối MongoDB nữa; ảnh vẫn tải từ URL nguồn.

API: `GET /api/explore/categories`, `GET /api/explore/tours?q=&category=&page=1&limit=9`, `GET /api/explore/tours/:id`.
Category filter dùng UUID; tìm kiếm hỗ trợ tiếng Việt không dấu. Limit tối đa 24; input sai trả 400, tour không có trả 404, catalog chưa sẵn sàng trả 503.
Frontend có tìm kiếm/lọc/phân trang theo URL và trang chi tiết tour, ảnh, lịch trình mẫu, lịch khởi hành nguồn. Nội dung render như text, không thực thi HTML từ dữ liệu cũ.

`CATALOG_SOURCE` mặc định là `snapshot` khi phát triển, `postgres` trong production. Snapshot ở `backend/data/catalog.snapshot.json` đã gitignore/dockerignore, chỉ chứa dữ liệu public của catalog. Không có payload legacy, user, booking, URI hoặc giá vốn/dòng dịch vụ.
API chỉ hiển thị tour active thuộc category active, loại bỏ lịch deleted. Giá trên card lấy từ lịch open chưa bắt đầu và còn chỗ; ưu tiên giá đã xác nhận VNĐ/người, còn giá nguồn có nhãn chưa xác nhận. Trang chi tiết giữ cả lịch sử khởi hành. Số chỗ được cập nhật thủ công; chưa tự áp dụng lại discount hoặc cung cấp booking. Quản lý lịch: [docs/departure-management.md](docs/departure-management.md).
Snapshot/working catalog chỉ dành cho phát triển; Planner local có thể dùng để thử nghiệm. Production bắt buộc catalog PostgreSQL.
Khi PostgreSQL sẵn sàng: chạy migrations/import/map catalog, đặt `CATALOG_SOURCE=postgres` và restart API. Không fallback sang snapshot khi database lỗi; production từ chối snapshot.

```powershell
npm run catalog:snapshot
npm run dev
npm run test:explore
```

## Cấu hình Prisma

Đã chọn Prisma ORM 7.9.1 với PostgreSQL driver adapter. CLI, client và adapter được cố định cùng phiên bản.
Root package dùng overrides cho `deepmerge-ts`, `mysql2` và `shell-quote` để lấy bản vá dependency gián tiếp. Các lệnh Prisma của dự án được kiểm tra với cấu hình này.
Schema: `backend/prisma/schema.prisma`. Migration SQL: `backend/prisma/migrations/`. Seed: `backend/prisma/seed.ts`.

```powershell
npm run db:validate                  # kiểm tra schema, không cần database
npm run db:generate                  # sinh client, không cần database
npm run db:deploy                    # áp dụng migration đã commit
npm run db:seed                      # dữ liệu demo, chỉ chạy local/dev
npm run db:status                    # trạng thái migration
npm run db:studio                    # xem database
npm.cmd run db:migrate -- --name change  # PowerShell: tạo migration mới, chỉ dùng dev
```

Seed dùng transaction và upsert: chỉ tạo dòng thiếu, không ghi đè giá/data đã sửa. Bộ seed chứa 1 destination, 3 hotels, 4 restaurants, 4 attractions, 2 transportations, tất cả `source=DEMO`. Không tạo tài khoản admin hay mật khẩu mặc định.
Địa chỉ dịch vụ là giả lập, tọa độ dịch vụ chưa có; không dùng để suy ra route thực tế. `lastVerifiedAt` để trống với dữ liệu demo.

Giá dùng `Decimal(14,0)` theo VND; API sau này cần serialize thành chuỗi và tính bằng Decimal. Đơn vị giá phân biệt phòng/đêm, mỗi người, vé khứ hồi/người, mỗi chuyến xe và mỗi nhóm.
TripActivity lưu snapshot giá, quantity và tổng chi phí; migration kiểm tra tổng bằng `round(unitPriceVnd * quantity)`. Giá snapshot không đổi khi admin cập nhật giá catalog.
TripActivity dùng khóa ngoại riêng cho mỗi loại dịch vụ, thay vì `referenceId` không kiểm chứng. Catalog dùng `isActive` để ngừng hiển thị; database chặn xóa dịch vụ đang được activity tham chiếu.
Trip dates dùng SQL DATE, giờ activity dùng TIME theo giờ địa phương của điểm đến. Activity qua nửa đêm cần tách sang hai ngày.
Trip có version cho cơ chế chống ghi đè khi sửa sau này; cơ chế patch/version, kiểm tra ngày thuộc trip, destination của activity và quyền sở hữu sẽ được triển khai ở API nghiệp vụ.
Chatbot RAG có bảng KnowledgeChunk dùng pgvector 384 chiều với vector từ khóa local + BM25, không tốn phí API embedding. Chưa dùng semantic embedding từ model học máy. Hướng dẫn và giới hạn: [docs/rag-assistant.md](docs/rag-assistant.md).

Trang chi tiết tour có đánh giá 1–5 sao và nhận xét; mỗi tài khoản một đánh giá/tour, sửa/xóa được. Admin kiểm duyệt tại `/admin/reviews`. Điểm trung bình chỉ tính đánh giá công khai. Hướng dẫn và kiểm thử: [docs/tour-reviews.md](docs/tour-reviews.md), `npm run test:reviews`.

## Nhập dữ liệu web cũ từ MongoDB

Nguồn hiện có là website tour: collection `trips` chứa lịch khởi hành tour, không phải Trip cá nhân trong planner. `places` chưa có tọa độ và chưa thấy catalog khách sạn/nhà hàng riêng.
Vì vậy bước nhập đầu tiên giữ nguyên tài liệu vào bảng riêng `LegacyDocument` bằng MongoDB Extended JSON (giữ ObjectId, ngày và kiểu số). Không tự gán địa điểm thành hotel/restaurant hay invent giá/tọa độ.

Đặt `MONGODB_SOURCE_URI` trong `backend/.env` (đã bị gitignore). Công cụ không in URI, tài liệu hoặc thông tin cá nhân, và chỉ đọc nguồn MongoDB.

```powershell
npm run db:import:mongo                                  # chỉ đếm nguồn, không ghi đích
npm run db:deploy                                       # PostgreSQL phải chạy trước
npm.cmd run db:import:mongo -- --apply                   # PowerShell: nhập vào bảng trung gian
npm.cmd run db:import:mongo -- --apply --collections=tours,places,services
```

Trên PowerShell dùng `npm.cmd` cho lệnh có tham số sau `--` để tránh wrapper `npm.ps1` làm mất tham số. Trên Linux/macOS dùng `npm`.

Import upsert theo `(sourceDatabase, collection, sourceId)` từng batch 100 documents; chạy lại cập nhật snapshot nguồn và không tạo bản trùng. Không xóa dòng đích khi dòng nguồn bị xóa. Import không phải snapshot nhất quán toàn database nếu nguồn đang thay đổi; nên chạy lúc ít hoạt động khi cần đối chiếu số lượng.
Bảng này có thể chứa dữ liệu user/booking/thanh toán; chỉ backend và người vận hành database được truy cập. Không expose qua public API hay gửi toàn bộ payload cho AI. Chưa chuyển user cũ thành tài khoản mới hoặc gán role cũ sang admin.
Đã có mapper sang catalog tour/dịch vụ/địa điểm/lịch khởi hành cùng migration. Chi tiết trường và dữ liệu cần review: [docs/legacy-data-mapping.md](docs/legacy-data-mapping.md). Explore đọc catalog công khai; Admin có thể quản lý thông tin cơ bản của tour và category. Không tự chạy import khi khởi động app hoặc deploy.

Không cần Docker để kiểm tra mapping:

```powershell
npm run db:map:legacy
npm.cmd run db:map:legacy -- --verify
npm run test:legacy
npm run test:explore
npm run test:auth
```

Khi PostgreSQL đã có migration và dữ liệu trung gian, đặt `LEGACY_SOURCE_DATABASE` trong `backend/.env` rồi chạy `npm.cmd run db:map:legacy -- --apply`.

Sửa `backend/.env` để đặt `WEATHER_API_KEY`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
AI base URL phải gồm prefix mà provider yêu cầu (thường là `/v1`). Planner cần provider hỗ trợ Chat Completions tool calling với tool_choice chỉ định function; embedding model sẽ được cấu hình riêng khi làm RAG. Hướng dẫn: [docs/ai-planner.md](docs/ai-planner.md).
Các key chỉ đặt ở backend. `frontend/.env.local` chỉ chứa địa chỉ API công khai.
Nếu sửa code `ai-services` trong lúc dev, chạy `npm run dev --workspace @pickyourway/ai-services` ở terminal khác để build lại liên tục.

## Kiểm tra

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:database
npm run test:legacy
```

## Tài khoản và phân quyền

Đã có đăng ký/đăng nhập/đăng xuất, session cookie HttpOnly, trang `/account` và quyền Admin được kiểm tra ở backend. Chạy `npm run dev`, mở http://localhost:3000/register để tạo tài khoản. Không cần Docker: auth local lưu bằng PGlite ở `backend/data/auth/` và còn sau restart.
Chi tiết API, cách cấp Admin, cookie/CORS và cấu hình production: [docs/authentication.md](docs/authentication.md).

```powershell
npm run test:auth
```

## Quản lý tài khoản trên web

Mở `/admin/users` hoặc chọn **Quản lý tài khoản** ở trang Admin để tìm/xem user, lọc quyền và cấp/thu hồi Admin. Thay đổi lưu trực tiếp vào database, không cần chạy CLI cho từng user. Backend bảo vệ Admin cuối cùng và ghi lại thay đổi quyền. Chi tiết: [docs/account-admin.md](docs/account-admin.md).

## Quản lý tour và category

Đã có `/admin/tours` và `/admin/categories`: tìm kiếm, tạo/sửa và ẩn/hiện catalog, kiểm tra quyền Admin ở backend. Local lưu thay đổi riêng, chưa cần Docker. Cách cấp Admin, API và cách lưu dữ liệu: [docs/catalog-admin.md](docs/catalog-admin.md).

```powershell
npm run test:admin
```

## Deploy Docker / VPS

Copy hai file `.env.example` ở root và server thành `.env`, đặt mật khẩu database và cấu hình provider, sau đó:

```sh
docker compose up -d database
docker compose --profile tools run --rm --build migrate
docker compose up -d --build server
```

Không tự động seed trên VPS. Migration chạy trong image build riêng có Prisma CLI; image runtime chỉ chứa dependency production và client đã sinh. Readiness cần kiểm tra sau migration/deploy.

Database và backend chỉ publish cổng trên localhost của VPS. Cấu hình reverse proxy HTTPS (Nginx/Caddy) để chuyển tiếp tên miền API đến `127.0.0.1:4000`; đặt `CLIENT_ORIGIN` là domain frontend thực tế.
Nếu password có ký tự đặc biệt của URL, cần URL-encode khi tạo `DATABASE_URL`; cấu hình Compose hiện ghép trực tiếp các biến PostgreSQL.
pgvector được bật bởi init script khi khởi tạo volume mới. Dữ liệu lưu trong volume `postgres_data`; cần backup định kỳ trước khi có dữ liệu thật.

## Vercel

Có thể deploy giao diện trước, kết nối backend sau. Cấu hình và giới hạn bản chỉ giao diện: [docs/vercel-deployment.md](docs/vercel-deployment.md). Để trống `NEXT_PUBLIC_API_URL` khi chưa có API public; production không gọi localhost của khách. Đã có `frontend/vercel.json` và `.vercelignore` để chuẩn bị upload.

Chọn Root Directory là `frontend`, framework Next.js, đặt `NEXT_PUBLIC_API_URL=https://<api-domain>/api` và cho phép truy cập file ngoài root trong thiết lập monorepo để đọc `tsconfig.base.json`. Deploy frontend từ cùng repository; backend chạy trên VPS. Nếu Vercel trước đây dùng `client`, cập nhật Root Directory trước lần deploy tiếp theo.

## Phạm vi hiện tại

Đã có trang khởi đầu, Express health/readiness endpoint, env validation, Prisma client, schema MVP (user/preference, catalog, trip/day/activity, conversation/message), migration đầu tiên, seed demo và Docker Compose PostgreSQL/pgvector.
Auth và phân quyền User/Admin đã được triển khai. Admin có quản lý tài khoản, thông tin cơ bản/ẩn hiện tour, category, ảnh/lịch trình từng ngày và lịch khởi hành. Planner AI đọc yêu cầu, tìm tour nguồn, chọn hoạt động theo ngày và tích hợp WeatherAPI.com; form đủ thông tin giảm còn một lượt gọi AI, có tiến trình SSE và giữ kết quả cũ khi hủy/lỗi. Kết quả tải được JSON, lưu và chỉnh sửa thủ công trong My Trips theo tài khoản. Đã bổ sung 29 điểm tham khảo từ Traveloka/Vietnam Tourism và chatbot RAG góc phải để hướng dẫn/tư vấn có nguồn. Chưa tối ưu chi phí thực tế/route khi thiếu dữ liệu dịch vụ. Xem [docs/ai-planner.md](docs/ai-planner.md), [docs/rag-assistant.md](docs/rag-assistant.md), [docs/saved-trips.md](docs/saved-trips.md).
`test:database` chạy các migration cùng pgvector trên PostgreSQL nhúng PGlite, kiểm tra ràng buộc giá, budget, reference, cascade và tính duy nhất của ID nguồn import. Đây là dependency chỉ dùng test/dev; không thay thế database PostgreSQL hoặc kiểm tra Docker trong production.
WeatherAPI.com Free: 100.000 calls/tháng, dự báo 3 ngày, cho phép thương mại: https://www.weatherapi.com/.
