# Dữ liệu tham khảo từ website du lịch

Đợt bổ sung ngày 18/10/2026 có **29 địa điểm, 5 điểm đến, 7 trang nguồn**: Đà Lạt (8), Đà Nẵng (7), Phú Quốc (4), Hội An (6), Huế (4).

File: `backend/resources/travel-guides.json`. Đây là dữ liệu tham khảo được chọn và tóm tắt ngắn từ các trang công khai, không phải bản sao bài viết, ảnh, đánh giá khách hàng hoặc cơ sở dữ liệu khách sạn của website khác.

| Nguồn | URL |
|---|---|
| Traveloka — Đà Lạt | https://www.traveloka.com/vi-vn/destination/area/da-lat-10010169 |
| Traveloka — Sơn Trà/Đà Nẵng | https://www.traveloka.com/vi-vn/hotel/vietnam/city/son-tra-10010303 |
| Traveloka — Phú Quốc | https://www.traveloka.com/vi-vn/activities/vietnam/city/phu-quoc-10011570 |
| Traveloka — Hội An | https://www.traveloka.com/vi-vn/activities/vietnam/city/hoi-an-10010308 |
| Vietnam Tourism — Đà Lạt | https://vietnam.travel/places-to-go/south-central-coast-central-highlands/dalat |
| Vietnam Tourism — Huế | https://vietnam.travel/things-to-do/hue-itinerary |
| Vietnam Tourism — Đà Nẵng | https://vietnam.travel/things-to-do/da-nang-travel-guides |

## Cách sử dụng

- Mở `/explore/guides` từ Explore hoặc Planner để xem/lọc toàn bộ dữ liệu và đọc nguồn.
- API: `GET /api/explore/guides?destination=Hue`; bỏ query để xem tất cả. Có kiểm tra tham số, hỗ trợ tên điểm đến không dấu.
- Planner kết hợp lịch trình tour nội bộ với tối đa 12 điểm tham khảo khớp điểm đến. Khi chưa có tour nhưng có điểm tham khảo, vẫn lập lịch được từ các điểm này. Không giả tạo tour hoặc lịch khởi hành từ bài hướng dẫn.
- Mỗi hoạt động nguồn ngoài có URL/nhà xuất bản/ngày đối chiếu, `tourId=null`, `dayNumber=null`, chi phí chưa biết. UI có link đọc nguồn thay cho link tour nội bộ. Lịch đã lưu giữ lại thông tin nguồn này khi chỉnh sửa.
- `priceVnd` và `openingHours` đều null. Các điểm là ý tưởng cần xác minh thực tế, có `needsReview=true`; ngày `checkedAt` là ngày đối chiếu trang, không phải cam kết dữ liệu giá/tình trạng dịch vụ cập nhật trực tiếp.

## Cập nhật tiếp

Hiện chưa tự động đồng bộ hoặc crawl hàng loạt. Để bổ sung, đọc và đối chiếu trang nguồn; thêm một bản ghi ngắn có ID ổn định, điểm đến, tên, mô tả tự diễn đạt, tags, sourceId và ngày kiểm tra. Không chép toàn văn, ảnh hoặc thông tin người dùng. URL nguồn HTTPS chỉ chấp nhận Traveloka/Vietnam Tourism và bỏ tracking/query. Giá/giờ mở cửa chỉ thêm khi có nguồn và quy trình xác minh riêng.

Không gọi website ngoài mỗi lần khách tạo lịch nên không thêm chi phí API, không phụ thuộc website phản hồi tại thời điểm tạo lịch. File được đóng gói trong image backend; dữ liệu tour nghiệp vụ production vẫn ở PostgreSQL. Đây là truy xuất dữ liệu có cấu trúc, chưa phải RAG/pgvector.

Kiểm tra: `npm run test:guides`.
