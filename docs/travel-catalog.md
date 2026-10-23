# Điểm đến và dịch vụ du lịch

Quản lý và hiển thị **điểm đến, khách sạn, nhà hàng, điểm tham quan, phương tiện**. Đây là dữ liệu nền để tính ngân sách và để AI gọi công cụ tìm kiếm ở các bước sau; chưa nối vào Planner.

## API công khai (`/api/travel`)

| Đường dẫn | Mô tả |
|---|---|
| `GET /destinations` | Điểm đến đang hiển thị, kèm số lượng dịch vụ từng loại |
| `GET /destinations/:slug` | Một điểm đến và toàn bộ dịch vụ của nó |
| `GET /hotels`, `/restaurants`, `/attractions`, `/transportations` | Danh sách có lọc |

Tham số danh sách: `destination` (slug), `q` (không phân biệt dấu), `tag`, `maxPrice` (VNĐ, số nguyên), `sort=price|name`, `page`, `limit` (tối đa 24). Tham số lạ hoặc sai định dạng trả 400. Dịch vụ ẩn, hoặc thuộc điểm đến bị ẩn, không bao giờ xuất hiện.

## API quản trị (`/api/admin/travel/:kind`)

`kind` là `destinations`, `hotels`, `restaurants`, `attractions` hoặc `transportations`. Chỉ ADMIN; yêu cầu ghi cần đúng `Origin` và `Content-Type: application/json` như phần quản trị catalog.

- `GET` danh sách (`q`, `status`, `destinationId`, `page`, 20 bản ghi/trang), `POST` tạo, `PATCH /:id` sửa.
- Sửa cần `revision` hiện tại; lệch revision trả 409 `stale_revision`. Slug trùng trả 409 `duplicate_slug`.
- Không xóa cứng: ẩn bản ghi bằng `isActive=false` vì chuyến đi sau này sẽ tham chiếu tới dịch vụ.

## Quy tắc dữ liệu

- Giá là chuỗi số nguyên VNĐ, không dùng số thực. Đơn vị giá bị ràng buộc theo loại, khớp CHECK trong database: khách sạn luôn `PER_ROOM_NIGHT`, nhà hàng luôn `PER_PERSON`, điểm tham quan `PER_PERSON` hoặc `PER_GROUP`, phương tiện có thêm `PER_PERSON_ROUND_TRIP` và `PER_VEHICLE_TRIP`.
- `source`: `DEMO` (minh họa), `INTERNAL`, `EXTERNAL_API`. Dữ liệu `DEMO` được gắn nhãn "giá minh họa, chưa xác nhận" trên giao diện.
- `sourceUrl` chỉ nhận HTTPS.

## Dữ liệu mẫu

Khi dùng cơ sở dữ liệu cục bộ (`AUTH_DATABASE_SOURCE=pglite`), lần chạy đầu tự thêm 3 điểm đến (Đà Nẵng, Đà Lạt, Phú Quốc) cùng dịch vụ mẫu, chỉ khi bảng điểm đến còn trống. Dữ liệu mẫu nằm ở `backend/src/travel/demo-data.ts`. Với PostgreSQL thật không tự thêm dữ liệu; tạo bằng trang quản trị.

## Giao diện

- Khách: `/destinations`, `/destinations/:slug`, `/explore/hotels|restaurants|attractions|transportations`, có thanh tab chung với `/explore`.
- Quản trị: `/admin/travel/:kind`.

Kiểm thử: `npm run test:travel`.
