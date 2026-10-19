# Quản lý lịch khởi hành

Vào `/admin/tours`, chọn **Lịch khởi hành**. Admin có thể thêm/sửa ngày đi/về, giá, số chỗ, mở/đóng nhận khách, đánh dấu hết chỗ và gỡ lịch có 0 khách. Local lưu trong bản làm việc hiện có, chưa cần Docker.

## Nhập và rà soát

- Ngày giờ nhập theo UTC+7 (Việt Nam), lưu ISO UTC. Ngày về ≥ ngày đi. Có thể quản lý lịch lịch sử; lịch đã khởi hành không tham gia tính giá tour từ.
- Giá gốc/nội bộ và giá bán là chuỗi số không âm, không có dấu phân cách hàng nghìn. Giá gốc chỉ hiển thị cho Admin; không tự lấy giá bán làm giá gốc. Giá nguồn thập phân được giữ nguyên.
- Đánh dấu **Tôi đã xác nhận giá bán này tính bằng VNĐ cho mỗi người** sau khi rà soát. Giá xác nhận là số nguyên 0–999999999999. Sửa giá bán sẽ bỏ đánh dấu để bạn xác nhận lại. Giá chưa xác nhận giữ nhãn giá nguồn và chưa gán ký hiệu tiền tệ.
- Khách tối thiểu từ 1 đến tổng chỗ; tổng chỗ tối đa 100000; số đã đặt từ 0 đến tổng chỗ. Lịch mở phải còn chỗ. Lịch hết chỗ phải có số đã đặt bằng tổng chỗ. Có thể đóng nhận khách dù còn chỗ.

Số khách đã đặt được cập nhật thủ công, chưa đồng bộ booking với MongoDB. Bản snapshot public cũ không có giá gốc và các số liệu chỗ: form để trống và yêu cầu bổ sung trước khi lưu. Không tự đoán bằng 0. PostgreSQL đọc các giá trị đã nhập từ TourDeparture. Xác nhận giá không xóa cờ needsReview chung của tour và nguồn.

**Gỡ** chỉ cho lịch có số đã đặt xác định là 0, kèm nút xác nhận. Lịch có khách hoặc chưa rõ số khách cần giữ lại; dùng **Đóng nhận khách** để ngừng mở bán. PostgreSQL đánh dấu `deleted`, giữ bản ghi/dịch vụ nguồn để import create-only không khôi phục lịch đã gỡ. Local gỡ trong bản làm việc, giữ nguyên snapshot nguồn. Chưa có giao diện khôi phục lịch đã gỡ.

Nút **Đóng nhận khách** ngay trong danh sách giữ nguyên giá và số liệu chỗ; có thể dùng khi lịch cũ chưa đủ metadata. Để mở lại qua form sửa, cần điền đầy đủ các trường hợp lệ.

Mỗi thao tác dùng revision của tour, chung với form cơ bản và ảnh/lịch trình. Khi API trả 409 vì dữ liệu cũ, tải lại rồi kiểm tra trước khi lưu. Ghi lịch và tăng revision là thao tác nguyên tử. ID lịch phải thuộc đúng tour. Ảnh, lịch trình, section và dịch vụ nguồn được giữ nguyên.

## Explore và đơn vị giá

Giá tour từ và số lịch sắp tới được tính lại mỗi request, chỉ xét lịch mở, chưa khởi hành và còn chỗ. Lịch nguồn chưa có dữ liệu chỗ vẫn giữ trạng thái chưa xác nhận. Giá đã xác nhận được ưu tiên hiển thị; nếu chưa có thì hiển thị giá nguồn kèm nhãn chưa xác nhận. Tour/category vẫn phải active để được hiển thị công khai.

Public DTO thêm `priceVnd` (giá thấp nhất đã xác nhận VNĐ/người hoặc null), `departures[].priceConfirmed` và `departures[].availableSeats` (null nếu chưa biết). Planner sau này cần dùng priceVnd cho ngân sách. Các trường `sourcePriceVnd` và `meta.priceUnit=unconfirmed` giữ để tương thích dữ liệu nguồn, không tự xác nhận ngân sách. Giá gốc và metadata quản trị không xuất qua public API. Giá được so sánh chính xác bằng BigInt, không làm tròn bằng Number.

## API và vận hành

Tất cả route yêu cầu Admin. POST/PATCH/DELETE dùng JSON, Origin khớp CLIENT_ORIGIN và cookie credentials include.

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/admin/tours/:id/departures` | Tên tour, revision và lịch chưa gỡ |
| POST | `/api/admin/tours/:id/departures` | Tạo mới |
| PATCH | `/api/admin/tours/:id/departures/:departureId` | Sửa lịch thuộc tour |
| POST | `/api/admin/tours/:id/departures/:departureId/close` | Đóng nhận khách, giữ nguyên dữ liệu; body chỉ gồm revision |
| DELETE | `/api/admin/tours/:id/departures/:departureId` | Gỡ lịch; body chỉ gồm revision |

POST/PATCH nhận toàn bộ: `revision`, `startsAt`, `endsAt` (ISO UTC), `basePriceVnd`, `salePriceVnd` (chuỗi số), `minPeople`, `maxPeople`, `bookedPeople` (số nguyên), `status` (open/closed/full), `priceConfirmed` (boolean). Trường dư bị từ chối. Response trả lại danh sách và revision mới. Quy tắc giá xác nhận được kiểm tra ở API và database.

PostgreSQL cần `npm run db:deploy` để thêm TourDeparture.priceConfirmed; mặc định false cho lịch cũ, không đổi số tiền hay đơn vị. Bản local cũ được bổ sung các trường mặc định khi đọc, không cần tạo lại snapshot. Chưa tự đồng bộ thay đổi local sang PostgreSQL.

```powershell
npm run test:admin
npm run test:explore
npm run test:database
```

Kiểm thử: ngày/giá/chỗ, UTC+7, migration giữ giá thập phân cũ, giá thấp nhất, lịch quá hạn/đóng/hết chỗ, persistence, revision/ownership, trường riêng không bị lộ, Admin/Origin và gỡ lịch. Adapter PostgreSQL cần kiểm tra tích hợp khi có database thật. Chạy các bộ kiểm thử lần lượt khi ít RAM; có thể dừng dev server tạm thời. Cách chuyển cache/file tạm sang ổ H nằm trong [account-admin.md](account-admin.md).
