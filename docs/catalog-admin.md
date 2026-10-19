# Quản lý catalog

Mở `/admin`, chọn **Quản lý tour** hoặc **Quản lý category**. Tài khoản phải có role ADMIN ở backend. Nếu chưa có tài khoản Admin, đăng ký qua `/register`, dừng backend rồi chạy:

```powershell
npm.cmd run auth:admin -- --email=your-account@example.com
npm run dev
```

## Chức năng

Đã có **Lịch khởi hành** trong danh sách tour: quản lý ngày đi/về, giá, số chỗ và trạng thái. Xem [departure-management.md](departure-management.md).

- Danh sách có tìm kiếm tiếng Việt không dấu, lọc trạng thái và phân trang.
- Tạo và sửa tên, slug, trạng thái category.
- Tạo và sửa tên, slug, category, điểm khởi hành, số ngày và trạng thái tour.
- Tour mới mặc định ẩn. Khi bật hiển thị, tour xuất hiện trên Explore nếu category cũng đang hiển thị.
- Ẩn category làm các tour liên quan biến mất khỏi Explore. Hiện lại category khôi phục các tour đang bật hiển thị. Bản ghi không bị xóa.
- Trong danh sách tour, chọn **Ảnh & lịch trình** để thêm/gỡ/sắp xếp ảnh, chọn ảnh đại diện, quản lý ngày và hoạt động. Form thông tin cơ bản giữ nguyên các phần này. Tour được tạo/sửa vẫn mang cờ `needsReview`, chưa xác nhận giá hay tính đầy đủ của dữ liệu.
- Mỗi lần sửa phải gửi `revision` đã đọc. Backend trả 409 nếu có người khác đã sửa; bấm **Tải lại**, mở lại bản ghi và nhập thay đổi theo dữ liệu mới.

## Chạy local không Docker

Với `CATALOG_SOURCE=snapshot`, lần lưu đầu tiên tạo bản làm việc `backend/data/catalog.admin.json` từ snapshot công khai hiện tại. Thay đổi tồn tại sau restart và được Explore đọc ngay; snapshot nguồn không bị sửa. Bản local chỉ có các bản ghi có trong snapshot công khai (hiện 49 tour), không khôi phục tour vốn bị ẩn trong MongoDB.

File làm việc, file tạm và lock đều bị gitignore/dockerignore. Ghi dữ liệu dùng khóa độc quyền, file tạm và rename; không có tự động ghi đè bằng snapshot nếu file hiện tại hỏng. Hãy sao lưu file này trước khi thay đổi cách chạy. Sau khi đã có bản làm việc, chạy lại `catalog:snapshot` không tự nhập thêm dữ liệu vào bản làm việc. Nếu muốn bắt đầu lại từ snapshot mới, dừng backend và **đổi tên/sao lưu** bản làm việc trước; các thay đổi cũ vẫn nằm trong bản sao lưu.

Nếu backend crash khi đang lưu, chỉ xóa `backend/data/catalog.admin.json.lock` sau khi xác nhận mọi backend đã dừng. Không xóa file dữ liệu. Phương án này dành cho phát triển trên máy local.

## PostgreSQL / VPS

Chạy `npm run db:deploy` để áp dụng migration mới, trong đó có cột `revision` của Tour/TourCategory. Khi `CATALOG_SOURCE=postgres`, Admin ghi trực tiếp vào các bảng này bằng Prisma transaction và kiểm tra revision; Explore đọc cùng database. Tài khoản cũng phải có Admin trong database auth được chọn. Bản ghi mới dùng `sourceDatabase=manual`; dữ liệu nhập cũ giữ nguồn gốc. Import catalog cũ vẫn create-only, không ghi đè chỉnh sửa Admin.

**Bản làm việc local không tự chuyển sang PostgreSQL.** Khi chuẩn bị chuyển môi trường, cần xuất/đối chiếu và nhập các chỉnh sửa local riêng; giữ file sao lưu. Chưa có công cụ đồng bộ hai môi trường. Production từ chối chế độ snapshot.

## API

Tất cả endpoint bên dưới đều yêu cầu session Admin. POST/PATCH/PUT phải dùng JSON và Origin khớp `CLIENT_ORIGIN`; frontend gửi cookie bằng `credentials: include`.

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/admin/catalog` | Danh sách category và metadata tour, gồm bản ghi đang ẩn |
| POST | `/api/admin/categories` | Tạo category |
| PATCH | `/api/admin/categories/:id` | Sửa category, kèm revision |
| POST | `/api/admin/tours` | Tạo tour |
| PATCH | `/api/admin/tours/:id` | Sửa tour, kèm revision |
| GET | `/api/admin/tours/:id/content` | Đọc ảnh và lịch trình, kể cả tour đang ẩn |
| PUT | `/api/admin/tours/:id/content` | Lưu toàn bộ ảnh và lịch trình, kèm revision |

Category: `name` (2–200 ký tự), `slug` (chữ thường không dấu, số, dấu gạch ngang, tối đa 200), `status` (`active`/`inactive`). Tour thêm `categoryId` (UUID), `departureLocation` (2–200), `durationDays` (1–365 hoặc null). PATCH gửi toàn bộ các trường này cùng revision; không chấp nhận trường dư. API không cho sửa nguồn gốc dữ liệu, ID hoặc `needsReview`. Route chi tiết Explore dùng UUID, slug chưa yêu cầu duy nhất.

```powershell
npm run test:admin
```

Kiểm thử bao gồm session/role/Origin, validation, xung đột phiên bản, ghi đồng thời, lưu qua lần mở lại, giữ nguyên chi tiết tour, dữ liệu hỏng, sắp xếp nội dung và ẩn/hiện category trên public API. Migration được chạy trong `test:database` bằng PGlite; adapter Prisma/PostgreSQL cần kiểm tra tích hợp khi có PostgreSQL thật.

## Ảnh và lịch trình

Mở `/admin/tours`, chọn **Ảnh & lịch trình** ở tour cần sửa. Ảnh được thêm bằng URL HTTPS (tối đa 40 ảnh, không trùng URL); ảnh đầu tiên là ảnh đại diện. Nút **Đặt làm đại diện** đưa ảnh lên đầu. Nút mũi tên thay đổi thứ tự. **Gỡ ảnh** chỉ bỏ liên kết khỏi tour, không xóa file ở Cloudinary hay dịch vụ ảnh. Chưa có upload file; URL cần trỏ tới ảnh công khai có thể tải được.

Mỗi tour có tối đa 60 ngày, mỗi ngày tối đa 100 hoạt động. Ngày có tiêu đề và ghi chú bữa ăn; hoạt động có tiêu đề, loại (tham quan/di chuyển/ăn uống/nghỉ ngơi/khác), nội dung và tên địa điểm hiển thị. Nút lên/xuống đổi thứ tự, nút gỡ loại mục khỏi nội dung sẽ lưu. Có thể sửa lại trước khi bấm **Lưu ảnh & lịch trình**. Để hủy các thay đổi chưa lưu, chọn **Tải lại (bỏ thay đổi chưa lưu)**.

Tên địa điểm nhập ở đây là nhãn văn bản cho hoạt động; không tạo CatalogPlace mới, không cập nhật tọa độ hay thay đổi liên kết địa điểm nguồn. Khi bỏ nhãn, trang tour không hiển thị tên địa điểm tại hoạt động đó. Nội dung được render như text, không thực thi HTML.

PUT nhận `{ revision, images, days }`. Mỗi ngày có `{ id?, title, mealNote, stops }`; mỗi hoạt động có `{ id?, type, title, content, placeName }`. Gửi `null` cho ghi chú/tên địa điểm trống. `type` nhận `visit`, `move`, `eat`, `rest`, `other`. Giữ ID của mục hiện có; bỏ ID để tạo mới. ID phải thuộc chính tour này, không được trùng. Server cấp ID mới, đánh số ngày từ 1 và vị trí hoạt động từ 0 theo thứ tự mảng.

PUT thay thế toàn bộ ảnh và lịch trình trong một lần lưu; mảng rỗng sẽ gỡ toàn bộ nội dung tương ứng. Dùng chung revision với metadata tour, nên một thay đổi ở form cơ bản cũng làm nội dung cũ trả 409. Khi có xung đột, giữ lại phần nội dung cần sửa trước khi tải lại. Không tự đổi `durationDays` khi thêm/gỡ ngày. Form nội dung giữ nguyên lịch khởi hành, giá và section; lịch khởi hành có trang quản lý riêng. Chưa có form sửa section.

Ở local, dữ liệu được lưu trong bản làm việc hiện có, không cần tạo lại snapshot. Với PostgreSQL, chạy các migration mới trước khi khởi động: `CatalogImage.position` lưu thứ tự ảnh; `TourStop.placeLabel` lưu nhãn địa điểm; `isHidden` trên ảnh/ngày/hoạt động lưu trạng thái gỡ. Các dòng cũ và nguồn gốc được giữ lại, nên import create-only không làm những mục đã gỡ tự xuất hiện lại. Chưa có giao diện khôi phục các mục đã gỡ sau khi lưu. Thứ tự ảnh cũ trong PostgreSQL được migration chuẩn hóa theo ID vì trước đây chưa có cột thứ tự; bản snapshot local giữ thứ tự ảnh hiện tại.
