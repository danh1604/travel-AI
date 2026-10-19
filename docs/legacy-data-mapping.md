# Ánh xạ dữ liệu website tour cũ

PostgreSQL vẫn là database chính. MongoDB chỉ là nguồn đọc khi xem trước/nhập dữ liệu. Docker có thể cài sau; kiểm tra bằng PostgreSQL nhúng PGlite không tạo database persistent.

## Quy trình

1. `db:import:mongo -- --apply` giữ nguyên mọi collection vào `LegacyDocument` với Extended JSON.
2. `db:map:legacy` đọc riêng 11 collection catalog từ MongoDB để xây kế hoạch ánh xạ, không ghi nguồn hoặc PostgreSQL.
3. `db:map:legacy -- --verify` thử kế hoạch trên PostgreSQL nhúng: chạy toàn bộ migration, insert theo quan hệ và chạy lại để kiểm tra trùng ID.
4. Khi PostgreSQL thật sẵn sàng, `db:map:legacy -- --apply` đọc bảng trung gian và tạo catalog có quan hệ.

Chế độ apply yêu cầu `LEGACY_SOURCE_DATABASE` trong `backend/.env` khớp tên nguồn đã nhập. Toàn bộ catalog được ghi trong một transaction. ID UUID được tạo xác định từ tên database, collection và Mongo ID; các nguồn khác nhau không dùng chung ID.
Import catalog là create-only: chạy lại không tạo bản trùng và không ghi đè chỉnh sửa của admin. Khi nguồn thay đổi sau lần nhập đầu, cần workflow đối chiếu riêng; không tự đồng bộ hoặc xóa catalog.

## Các bảng đích

| Collection nguồn | Bảng đích | Quy tắc |
|---|---|---|
| categories | TourCategory | Giữ tên, slug, status và ID nguồn |
| tours | Tour | Liên kết category; giữ start_location, duration nếu có và hotel_id chưa giải được |
| places | CatalogPlace | Giữ title/content; không suy ra destination, tọa độ, phí vé hoặc thời lượng |
| services | CatalogService | Giữ type, unit, basePrice và status; chưa chuyển thành Hotel/Restaurant của planner |
| trips | TourDeparture | Lịch khởi hành tour; giữ timestamp, giá và sức chứa; không tạo personal Trip |
| trips.services | DepartureService | Giữ giá snapshot và quantity riêng, không thay bằng giá catalog hiện tại |
| itineraries | TourDay | Giữ day_number và meal_note; không tự suy ra ngày cụ thể hay giờ |
| itinerary_details | TourStop | Giữ loại, nội dung, thứ tự và place nếu có |
| tour_images, place_images | CatalogImage | Chỉ nhận URL HTTPS hợp lệ; liên kết đúng tour/place |
| descriptions | TourSection | Giữ nội dung bao gồm, không bao gồm và điều khoản |
| sales | TourDiscount | Giữ tỷ lệ giảm giá, không tự áp dụng lần nữa vào giá trip |

User, booking, login history và thông tin thanh toán chỉ được giữ trong bảng trung gian, không vào catalog hoặc AI context. Blog/home/favorite/comment chưa có mapping nghiệp vụ trong bước này.

## Các quy tắc chưa thể suy ra

- `per_room` không khẳng định phòng/đêm; `per_meal` không khẳng định mỗi người; `per_day` không khẳng định mỗi xe. Giữ nguyên unit nguồn.
- `TourDeparture.basePriceVnd` và `salePriceVnd` giữ nguyên số nguồn, không tự xác định giá/người hay giá/nhóm. Các số thập phân dùng Decimal(65,30), không tự làm tròn khi nhập.
- `TourDeparture` và `CatalogService` đều `needsReview=true`. Tour và place chưa có Destination được xác nhận. Không cấp trực tiếp các bản ghi này cho planner/budget engine trước khi hoàn thiện thông tin.
- `hotel_id` trong tour không có collection hotel tương ứng. Giữ `legacyHotelId` và cảnh báo, không nối sang một service có tên gần giống.
- Status `inactive`, `closed`, `full`, `deleted` được giữ nguyên; không tự bật lại hoặc quyết định availability chỉ từ status. Chưa có rule tính tồn chỗ/đóng lịch theo ngày hiện tại.
- Timestamp nguồn được giữ nguyên. Chưa chuyển lịch khởi hành thành ngày/giờ tại địa phương vì chưa xác nhận quy ước timezone của web cũ.
- Nội dung văn bản/HTML được giữ nguyên. Khi làm UI/API cần render an toàn và kiểm tra quyền truy cập.

## Dữ liệu cần xử lý

Mapper không sửa nguồn. Giá/quantity âm, ngày đảo ngược, sức chứa sai và parent reference bị mất khiến bản ghi bị bỏ qua ở catalog, nhưng dữ liệu gốc vẫn giữ tại `LegacyDocument` sau bước nhập.
Ngày tour/thứ tự stop bị trùng được giữ lại cùng cảnh báo để không mất nội dung. Cần admin rà soát trước khi dùng làm itinerary mẫu cho AI.
Nếu một service trong lịch khởi hành không tồn tại, chỉ bỏ qua dòng service đó; departure vẫn giữ và chưa đủ điều kiện dùng tính giá tự động.

Báo cáo mỗi lần chạy nằm tại `backend/reports/legacy-mapping.json` (gitignored), gồm số lượng nguồn/đích và issue theo ID, không có tài liệu thô hay chuỗi kết nối. Không tự đăng báo cáo lên public endpoint.

## Kết quả kiểm tra ngày 07/10/2026

Đã xem trước và kiểm tra toàn bộ kế hoạch bằng PGlite: 17 categories, 56 tours, 57 places, 159 services, 160 departures, 923 dòng service, 151 days, 538 stops, 147 images, 138 sections và 10 discounts.
Có 1 lịch khởi hành không hợp lệ, 2 service reference mất, 9 bản ghi tham chiếu tour mất, 35 stop tham chiếu itinerary mất. Có 23 tour với hotel_id chưa giải được, 8 tour thiếu duration, 2 day và 31 stop bị trùng thứ tự.
Đây là kết quả ở thời điểm đọc, không phải khẳng định dữ liệu nguồn luôn giữ nguyên. Chưa chạy apply lên PostgreSQL thật.

## Lệnh chạy trong PowerShell

Hiện tại, chưa cần Docker:

```powershell
npm run db:map:legacy
npm.cmd run db:map:legacy -- --verify
npm run test:legacy
npm run test:database
```

Sau khi có Docker/PostgreSQL:

```powershell
docker compose up -d database
npm run db:deploy
npm.cmd run db:import:mongo -- --apply
npm.cmd run db:map:legacy -- --apply
```
