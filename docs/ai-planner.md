# AI Planner

Mở http://localhost:3000/planner, đăng nhập rồi nhập yêu cầu, ví dụ:

> Đi Đà Nẵng 3 ngày, nhóm 2 người, tổng ngân sách 12 triệu, thích biển, lịch trình thư giãn.

AI đọc mô tả và hiển thị lại điểm đến, số ngày, số người, tổng ngân sách, ngày đi và nhịp độ để sửa. Giá trị nhập vào ô riêng được ưu tiên. Nếu thiếu điểm đến/số ngày/số người/ngân sách, hệ thống hỏi bổ sung. Ngày đi có thể để trống; không tự đoán ngày hoặc thời tiết.

## Cấu hình backend

Điền các biến **trong `backend/.env`** (không đưa key vào frontend hoặc git):

```dotenv
AI_BASE_URL=https://<provider-host>/v1
AI_API_KEY=<key>
AI_MODEL=<model-id>
WEATHER_API_KEY=<WeatherAPI.com-key>
```

Provider cần hỗ trợ **Chat Completions function/tool calling**, `tool_choice` chỉ định function và `max_completion_tokens`. Base URL phải có đúng prefix provider yêu cầu; không thêm `/chat/completions`. Dùng model tiết kiệm có tool calling của provider bạn chọn. Không tự đổi provider hoặc dùng key dự phòng.

Chế độ `npm run dev` theo dõi `backend/.env` và tự khởi động lại backend khi file thay đổi. Nếu đang chạy tiến trình dev cũ từ trước thay đổi này, dừng rồi chạy lại `npm run dev` một lần. Sau khi backend nạp lại cấu hình, tải lại trang Planner để cập nhật trạng thái. Production cần restart backend sau khi sửa env. Nếu sửa `ai-services` trong lúc dev, chạy `npm run build --workspace @pickyourway/ai-services` để backend dùng code mới. Giao diện báo rõ nếu chưa cấu hình AI; không giả lập kết quả khi thiếu key/provider lỗi.

Weather không bắt buộc để tạo lịch trình. Backend gọi HTTPS `forecast.json`, `days=3`, `lang=vi`; chỉ lấy các ngày thực tế thuộc chuyến đi trong response. Cache tối đa 100 điểm đến, 30 phút/điểm đến; chưa có ngày đi hoặc ngoài khoảng gần nhất thì không gọi API. Lỗi weather không làm hỏng planner. UI hiển thị địa điểm API trả về và credit WeatherAPI.com. Tham khảo [tài liệu WeatherAPI.com](https://www.weatherapi.com/docs/).

## Luồng xử lý

1. `POST /api/planner/generate` kiểm tra session, Origin, JSON và input.
2. Nếu khách đã điền đủ điểm đến/số ngày/số người/ngân sách/nhịp độ, backend dùng trực tiếp constraints và bỏ lượt AI phân tích. Nếu mô tả có dấu hiệu chứa ngày đi chưa nhập hoặc cần đọc nhịp độ, vẫn gọi `search_tours` để tránh mất thông tin. Backend kiểm tra schema và ưu tiên các ô nhập riêng.
3. Backend tìm tất cả tour active khớp điểm đến theo tên tour/điểm dừng, xếp lịch khởi hành gần ngày khách chọn rồi lấy tối đa 6 tour có lịch trình làm nguồn AI, ưu tiên tour được gợi ý. Không dùng nơi khởi hành làm điểm đến. Đọc từ catalog public của hệ thống, gồm thay đổi Admin đã lưu.
4. Truy xuất tối đa 16 điểm dừng/tour, mỗi đoạn nội dung gửi AI tối đa 500 ký tự. Không gửi user/email/session, MongoDB payload, giá vốn hoặc dữ liệu booking.
5. Lấy weather khi phù hợp. AI gọi function `build_itinerary` chọn ref nguồn theo ngày/buổi và sở thích.
6. Backend kiểm tra đủ số ngày, thứ tự ngày/buổi, ref có thật, không quá 3 hoạt động/ngày thư giãn hoặc 6 hoạt động/ngày còn lại. Nếu một ref nguồn mô tả cả ngày bị AI chọn ở nhiều buổi trong cùng ngày thì gộp thành một hoạt động; ref lặp sang ngày khác vẫn bị từ chối. Có thể quay lại cùng địa điểm ở ngày khác với ref nguồn riêng (ví dụ đi biển nhiều ngày); địa điểm trùng trong cùng ngày vẫn bị chặn. Toàn bộ tên/nội dung hiển thị lấy lại từ catalog, không dùng tên do AI tự sinh.
7. Backend giữ bản nháp riêng tư và trả `draftId`; render từng ngày, hoạt động, nguồn tour, thời tiết và thông tin cần xác nhận. Cho tải JSON hoặc bấm **Lưu vào My Trips** để lưu theo tài khoản, xem lại và xóa. Chi tiết: [saved-trips.md](saved-trips.md).

Planner local dùng working catalog/snapshot để thử nghiệm theo lựa chọn chưa dùng Docker. Production vẫn bắt buộc PostgreSQL theo cấu hình hiện có. Không có ngầm fallback khi database production lỗi. Planner dùng pipeline có giới hạn; chatbot RAG góc phải dùng chỉ mục pgvector riêng để tư vấn/hướng dẫn rồi chuyển nhu cầu sang Planner. Xem [rag-assistant.md](rag-assistant.md).

## Ngân sách và phạm vi

Dữ liệu cũ là tour, chưa có catalog hotel/restaurant/transportation với giá riêng đủ tin cậy. Vì vậy `budget.itineraryTotalVnd=null`, `complete=false`, chi phí activity là `null`, không phải 0 VNĐ. Hệ thống chưa xác nhận lịch trình AI nằm trong ngân sách và chưa tối ưu route/giờ mở cửa. Ngày chưa đủ hoạt động được đánh dấu cần bổ sung.

Phần **Tour khởi hành gần ngày bạn chọn** trả tối đa 3 departure `open`, chưa khởi hành, cùng điểm đến, xếp theo số ngày chênh lệch tuyệt đối với ngày yêu cầu theo UTC+7. Có thể sớm hoặc muộn hơn; nếu gần bằng nhau thì ưu tiên từ ngày yêu cầu trở đi, sau đó độ phù hợp số ngày và thứ tự ổn định. Không bắt buộc trùng ngày kết thúc hoặc số ngày tour. Không nhập ngày đi thì lấy các lịch sắp khởi hành gần nhất. Việc xếp lịch dùng toàn bộ tour khớp điểm đến trước khi giới hạn context AI, không chỉ 6 tour đầu.

UI ghi rõ ngày đi/về thực tế, thời lượng và sớm/muộn bao nhiêu ngày. **Ngày trong lịch trình AI vẫn giữ ngày khách yêu cầu**, không tự đổi sang ngày tour gợi ý. Ngày xa hoặc không có dự báo vẫn cho tạo kế hoạch. Nếu không còn lịch mở, hệ thống báo chưa có tour phù hợp, không bịa lịch mới; tour không đủ chỗ đã biết bị loại. Lịch chưa có số chỗ vẫn được gợi ý nhưng ghi rõ cần xác nhận.

Giá chỉ hiển thị/tính khi `priceConfirmed=true` và là số nguyên VNĐ hợp lệ. Các trường `perPersonVnd`, `totalVnd`, `withinBudget` trong `packageQuotes` có thể là `null`; không quy giá chưa xác minh thành 0. Mỗi gợi ý có thêm `startsOn`, `endsOn`, `durationDays`, `requestedStartDate`, `dayDifference` (âm=sớm hơn), `availableSeats` (null=chưa biết). Backend tính tổng giá tour gốc bằng BigInt và so với ngân sách. Giá này không phải giá của lịch trình AI đã thay đổi, không bao gồm chi phí ngoài gói và không giữ chỗ/đặt tour.

## API và giới hạn chi phí

- Khung **Tìm tour đang mở hoặc sắp khởi hành** phía trên Planner dùng `GET /api/explore/upcoming-departures`. Query optional: `destination` (tối đa 100 ký tự), `startDate` (YYYY-MM-DD), `people` (1–50), `days` (1–14). Không cần đăng nhập, không gọi AI, trả no-store và tối đa ba lịch đang mở có thời điểm khởi hành sau hiện tại. Bỏ lịch đóng/hết chỗ, ngày về trước ngày đi, và lịch thiếu chỗ đã biết. Số chỗ chưa xác nhận vẫn hiển thị có nhãn. Tìm điểm đến theo tên tour/điểm dừng, không dùng thành phố khởi hành. Sắp theo khoảng cách ngày đi, ưu tiên lịch từ ngày yêu cầu trở đi khi bằng nhau, rồi độ gần thời lượng. Không chọn ngày thì lấy lịch sắp khởi hành gần nhất.
- Kết quả có liên kết xem tour, ngày thực tế và giá VNĐ/người chỉ khi đã xác nhận; tổng nhóm chỉ tính khi nhập số người. Ngày/số ngày mong muốn dùng để sắp xếp, không cam kết đúng yêu cầu hay giữ chỗ. Catalog local hiển thị lưu ý đối chiếu dữ liệu; `checkedAt` là thời điểm tra cứu hệ thống, không phải thời điểm xác minh với nhà cung cấp. Không có lịch mới thì hiển thị trạng thái trống, không tạo lịch giả; quản trị viên cập nhật lịch khởi hành thật ở Admin.

- `GET /api/planner/status`: boolean trạng thái cấu hình AI/weather; không trả key hoặc URL provider.
- `POST /api/planner/generate`: session cookie hiện tại, Origin bằng `CLIENT_ORIGIN`, Content-Type JSON. Mặc định trả `{data:...}` với `status=needs_input|no_data|ready`. Frontend gửi `Accept:text/event-stream` để nhận SSE: `progress` với các bước thực tế từ backend, `result` có data (và draftId nếu ready), `error` có code. Sau khi headers SSE đã gửi, lỗi nằm trong event thay vì đổi HTTP status; client phải đọc đến event cuối. Proxy nên tắt buffering cho đường dẫn này.
- Input: `prompt` 5–2000 ký tự; optional `destination`, `days` 1–14, `people` 1–50, `budgetVnd` nguyên 1–1.000.000.000.000 (tổng nhóm), `startDate` YYYY-MM-DD, `style=relaxed|balanced|active`.
- Mỗi lần 1–2 AI calls, tối đa 4500 output tokens/call, không tự retry. Form đủ thông tin có thể giảm từ 2 calls xuống 1; `evidence.modelCalls` ghi số lượt dự kiến của luồng thành công. Schema tool giới hạn ref vào nguồn có thật, đúng số ngày và số hoạt động theo nhịp độ. Timeout mỗi call 45 giây, toàn request 100 giây; browser 110 giây. Ngắt chờ trong UI gửi abort và giữ kết quả trước, lỗi mới cũng không làm mất lịch cũ.
- Tối đa 10 requests/15 phút/IP, 1 request đang xử lý/user và 4 request đồng thời/process. Hạn mức/cache trong RAM, cần shared store nếu chạy nhiều backend process. Không dùng queue hoặc thêm dịch vụ trả phí.
- Errors: `login_required`, `invalid_planner_request`, `ai_unconfigured`, `ai_unavailable`, `ai_invalid_output`, `catalog_unavailable`, `planner_busy`, `planner_rate_limit`, `planner_unavailable`. Không trả provider raw errors chứa thông tin nhạy cảm.

## Kiểm tra

Planner tổng hợp sở thích/điều không muốn từ mô tả, bao gồm nhãn “Không chọn trải nghiệm” khi chuyển từ chatbot. Trước khi gọi AI lập lịch, bỏ các ref có tên hoặc địa điểm khớp chủ đề đã loại (biển, leo núi, văn hóa, thiên nhiên, ẩm thực, cà phê). Ưu tiên nguồn và điểm tham khảo khớp sở thích còn hiệu lực; giới hạn ngày là thư giãn 3, cân bằng 4, nhiều trải nghiệm 6 hoạt động. Schema gửi provider và kiểm tra kết quả dùng cùng giới hạn. Không tăng số lượt gọi AI.

AI được hướng dẫn phân bổ giữa các ngày trước khi dồn hoạt động, hạn chế tham quan lại, và không tự thêm nơi ăn/ở ngoài nguồn. Nhu cầu gia đình hoặc ít di chuyển được truyền riêng, kèm lưu ý chưa xác minh khả năng tiếp cận. Lọc sở thích là quy tắc từ khóa trên tên/địa điểm, không chứng minh mọi nội dung tour đã phù hợp; không ước lượng khoảng cách hoặc cam kết phù hợp thể lực. Nếu lọc hết nguồn, trả `no_data` trước bước thời tiết và gọi AI xây lịch. Khi còn ít nguồn, vẫn có thể có ngày trống và sẽ báo rõ.

Giao diện Planner có ba bước chia sẻ nhu cầu → xem lịch → lưu. Khi có kết quả, khung kết quả được focus và cuộn vào tầm nhìn, hỗ trợ màn hình nhỏ và bàn phím. Nút lưu nằm ngay phía trên lịch, hiển thị rõ chưa lưu/đang lưu/đã lưu. Mỗi ngày có ba buổi sáng–chiều–tối; hoạt động giữ thứ tự trong cùng buổi, nguồn và nội dung gốc. Buổi trống được ghi rõ, không tự thêm hoạt động. Có liên kết nhảy tới từng ngày; lịch được hiển thị trước tour, lưu ý và thời tiết. Trang lịch đã lưu dùng chung cách trình bày này.

Ngày khách chọn và ngày tour khởi hành được hiển thị riêng, định dạng dd/MM/yyyy và có nhãn sớm/đúng/muộn. Khi chưa chọn ngày, chỉ ghi lịch sắp khởi hành. Thông báo lỗi dành cho khách không chứa hướng dẫn cấu hình key/backend. Hủy chờ có thông báo và giữ kết quả trước nếu có. Các bước tiến độ vẫn dựa trên event thật từ backend, không dùng phần trăm giả.

```powershell
npm run test:ui
npm run test:planner
npm run test:trips
npm run build
npm run lint
```

Test dùng fake AI ở service và HTTP server OpenAI-compatible local ở adapter: không tốn token hoặc gọi weather thật. Kiểm tra schema, thiếu thông tin, input ưu tiên, refs bịa/lặp, ngày/buổi, giá tour, weather cache, quyền và xử lý lỗi provider. Phải cấu hình key thật để kiểm tra end-to-end với provider thực tế.
