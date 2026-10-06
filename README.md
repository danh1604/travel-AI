# PickYourWay AI

Khung monorepo dùng npm workspaces, TypeScript và Node.js 22.13+ (khuyến nghị bản 22 LTS mới nhất).

```text
client/       Next.js App Router + Tailwind CSS, deploy Vercel
server/       Express API, nghiệp vụ, database và WeatherAPI.com
ai-services/ Module nội bộ: OpenAI-compatible client, kiểu dữ liệu và sau này agent/tools/RAG
```

`ai-services` hiện được import bởi `server`, không phải HTTP service riêng. Cách này giữ phần AI độc lập về code nhưng không cần thêm container, kết nối mạng hay chi phí vận hành. Khi có nhu cầu xử lý độc lập có thể tách thành service sau.

## Chạy local

```powershell
npm install
Copy-Item .env.example .env
Copy-Item client/.env.example client/.env.local
Copy-Item server/.env.example server/.env
docker compose up -d database
npm run dev
```

Frontend: http://localhost:3000. API health: http://localhost:4000/api/health.
Có thể chạy `npm run dev` khi chưa có Docker/database: health endpoint chỉ kiểm tra tiến trình API, không kiểm tra database hay các provider.

Sửa `server/.env` để đặt `WEATHER_API_KEY`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`.
AI base URL phải gồm prefix mà provider yêu cầu (thường là `/v1`). Provider cần hỗ trợ tool calling và structured output khi triển khai planner; embedding model sẽ được cấu hình riêng khi làm RAG.
Các key chỉ đặt ở backend. `client/.env.local` chỉ chứa địa chỉ API công khai.
Nếu sửa code `ai-services` trong lúc dev, chạy `npm run dev --workspace @pickyourway/ai-services` ở terminal khác để build lại liên tục.

## Kiểm tra

```powershell
npm run typecheck
npm run lint
npm run build
```

## Docker / VPS

Copy hai file `.env.example` ở root và server thành `.env`, đặt mật khẩu database và cấu hình provider, sau đó:

```sh
docker compose up -d --build
```

Database và backend chỉ publish cổng trên localhost của VPS. Cấu hình reverse proxy HTTPS (Nginx/Caddy) để chuyển tiếp tên miền API đến `127.0.0.1:4000`; đặt `CLIENT_ORIGIN` là domain frontend thực tế.
Nếu password có ký tự đặc biệt của URL, cần URL-encode khi tạo `DATABASE_URL`; cấu hình Compose hiện ghép trực tiếp các biến PostgreSQL.
pgvector được bật bởi init script khi khởi tạo volume mới. Dữ liệu lưu trong volume `postgres_data`; cần backup định kỳ trước khi có dữ liệu thật.

## Vercel

Chọn Root Directory là `client`, framework Next.js, đặt `NEXT_PUBLIC_API_URL=https://<api-domain>/api` và cho phép truy cập file ngoài root trong thiết lập monorepo để đọc `tsconfig.base.json`. Deploy frontend từ cùng repository; backend chạy trên VPS.

## Phạm vi hiện tại

Đã có trang khởi đầu, Express health endpoint, env validation, PostgreSQL connection pool, OpenAI-compatible client factory và Docker Compose PostgreSQL/pgvector.
Auth, schema nghiệp vụ, CRUD, planner, tool calling, RAG và gọi WeatherAPI.com chưa được triển khai. ORM chưa chốt; `pg` chỉ là kết nối database ban đầu.
WeatherAPI.com Free: 100.000 calls/tháng, dự báo 3 ngày, cho phép thương mại: https://www.weatherapi.com/.
