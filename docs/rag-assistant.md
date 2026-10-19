# Trợ lý du lịch ở góc phải

Nút **Hỏi trợ lý du lịch** hiện trên các trang khách hàng; không hiện trong Admin. Khách chưa đăng nhập vẫn hỏi được. Có câu hỏi mẫu, nguồn tham khảo, gợi ý hỏi tiếp, nút dừng và nút mở Planner với điểm đến/mô tả đã điền. Chưa tự tạo hoặc đặt chuyến đi khi bấm liên kết; khách kiểm tra biểu mẫu và bấm Tạo lịch trình.

Hội thoại chỉ giữ trong bộ nhớ frontend (tối đa 20 tin), tiếp tục khi chuyển trang nội bộ và xóa khi đổi tài khoản hoặc tải lại trang. Bấm **Bắt đầu lại** để xóa cuộc trò chuyện. Không lưu transcript vào database/localStorage. Không gửi email, session hoặc lịch riêng cho chatbot.

## RAG đang chạy

Lời chào, cảm ơn, tạm biệt, giới thiệu và xác nhận ngắn được xử lý trước truy xuất bằng mẫu hội thoại trong `backend/resources/conversation-knowledge.json`. Không cần database hoặc gọi AI, trả `mode: conversation`, `retrieval: none` và không gắn nguồn giả. Chỉ nhận diện toàn bộ câu xã giao: “chào bạn, tôi muốn đi Huế” vẫn đi qua luồng tư vấn có nguồn. Đây là bổ sung tri thức và hướng dẫn hội thoại, không phải huấn luyện lại model.

File này chứa các ví dụ giọng điệu cho AI: xưng mình/bạn, ghi nhận nhu cầu, hỏi một câu mỗi lượt và tránh hỏi lại số ngày/số người khách đã nêu. Ví dụ không được coi là bằng chứng về địa điểm. `conversation.ts` tổng hợp nhu cầu hiện tại từ tối đa bốn tin trước cùng câu mới: số ngày/người (chữ số hoặc một đến mười), sở thích còn chọn/đã bỏ, điểm đến, so sánh, nhịp độ, người đi cùng và ngân sách khách nêu. Thông tin khách nêu không phải bằng chứng về giá hoặc tính phù hợp thực tế của dịch vụ.

Câu “không đi biển nữa” loại biển khỏi sở thích và câu truy xuất; “không đi Huế nữa” loại nguồn của điểm đến này cả ở câu nối tiếp. Chọn lại rõ tên có thể bỏ loại trừ. So sánh nhiều điểm đến chưa tạo liên kết Planner tới một nơi tự chọn. “Bắt đầu lại” xóa trạng thái nhu cầu trước trong cửa sổ lịch sử. Số ngày cùng điểm đến hoặc sở thích là đủ để yêu cầu AI đưa 1–2 lựa chọn có nguồn; không đợi khách trả lời toàn bộ bộ câu hỏi. Followup hỏi lại số ngày/người đã biết bị lọc. Câu chỉ trỏ như “chọn cái đầu” được hỏi lại tên, vì API hiện chỉ nhận lịch sử tin của khách, không có danh sách lựa chọn đáng tin từ lượt trả lời trước.

Khi mở Planner, mô tả chứa bản tổng hợp nhu cầu hiện tại, gồm mục đã loại được ghi rõ, thay vì ghép nguyên nhu cầu cũ như còn hiệu lực. Khách vẫn kiểm tra biểu mẫu trước khi tạo. Bộ nhận biết dùng quy tắc, chưa hiểu mọi phủ định, tên địa điểm ngoài corpus, cách viết số, hay thay đổi nhu cầu phức tạp. AI vẫn nhận lịch sử thô cùng trạng thái tổng hợp để hỗ trợ diễn đạt; không có huấn luyện lại model, lưu hồ sơ hoặc thêm lượt gọi AI cho bước xử lý này.

FAQ bổ sung: lần đầu lên kế hoạch, đi cùng gia đình, phạm vi đặt/giữ chỗ và đổi ý. Chỉ mục tự cập nhật khi corpus đổi; không cần nhập database thủ công.

1. Tạo corpus public: hướng dẫn sản phẩm trong `backend/resources/help-knowledge.json`, điểm tham khảo Traveloka/Vietnam Tourism, phần tóm tắt và tiêu đề hoạt động của catalog active. Không đọc `.env`, tài khoản, booking, LegacyDocument hoặc My Trips. Không lấy giá cũ trong nội dung hoạt động làm bằng chứng giá.
2. Mỗi đoạn tối đa 800 ký tự; tối đa 1.100 đoạn. ID tour-day dùng ID nguồn thay cho số ngày để xử lý dữ liệu legacy bị trùng dayNumber.
3. Chuẩn hóa tiếng Việt không dấu; mở rộng một số từ đồng nghĩa Anh–Việt. Tạo vector **feature hashing từ từ khóa/bigram 384 chiều** local, L2 normalize; không gọi API embedding. Phiên bản `lexical-hash-384-v2`; thay đổi tokenizer/stopword cần tăng version để lập lại chỉ mục.
4. Ghi vector vào bảng **KnowledgeChunk / pgvector** trong database hiện dùng: PGlite local có extension vector hoặc PostgreSQL production. Cập nhật chỉ mục bằng transaction khi fingerprint corpus thay đổi, có advisory lock khi nhiều process. Xóa chunk không còn trong corpus; không dùng bản tour đã ẩn làm fallback.
5. Truy xuất cosine qua pgvector, kết hợp BM25 tiếng Việt và tín hiệu điểm đến trong câu hỏi/lịch sử. Chỉ giữ kết quả có trùng từ khóa để giảm tác dụng của hash collision, tối đa 6 nguồn và giới hạn số đoạn cùng URL. Nếu câu hỏi đổi điểm đến thì ưu tiên điểm đến mới; câu so sánh có thể giữ nhiều điểm đến.
6. Hướng dẫn sử dụng sản phẩm có thể trả nguyên nội dung FAQ đã kiểm soát, không gọi LLM. Câu hỏi giá hiện tại/thời tiết trả hướng dẫn kiểm tra nguồn thay vì đoán. Nếu không có bằng chứng, hỏi thêm nhu cầu và không gọi AI.
7. Câu hỏi tư vấn khác gọi AI tối đa **1 lần, 1.100 output tokens**, không tự retry. AI chỉ nhận tối đa 4 câu hỏi trước của khách và nhóm nguồn liên quan; không tin câu trả lời cũ do browser cung cấp. Output có answer, citations, destination, followups và được kiểm tra schema/ID nguồn/điểm đến. URL hiển thị lấy từ metadata server, không lấy URL do model sinh.
8. Nếu provider lỗi, viện dẫn bịa hoặc trả giá cụ thể không có kiểm chứng, giao diện trả đoạn nguồn có nhãn tra cứu thay vì giả là câu trả lời AI. Không cam kết rằng kiểm tra trích dẫn tự động chứng minh hoàn toàn mọi câu do LLM viết; khách vẫn cần đối chiếu nguồn.

Đây là **RAG dùng truy xuất từ khóa + vector**, không phải embedding ngữ nghĩa từ mô hình học máy. Cách chọn này không thêm phí embedding và phù hợp corpus hiện nhỏ. Nếu thay bằng semantic embedding sau này, cần chọn model/dimension, version hóa và lập lại toàn bộ chỉ mục; không trộn vector khác model/dimension. pgvector đang dùng tìm kiếm chính xác, chưa cần HNSW cho corpus nhỏ.

## Cấu hình và triển khai

Dùng `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` sẵn có. Không cần key mới hoặc Docker ở local. Nếu thiếu key/provider lỗi, hướng dẫn nguồn vẫn dùng được; tư vấn AI chuyển sang đoạn tham khảo có nhãn. Không có fallback ngầm sang nhà cung cấp khác.

Local tự áp dụng migration `20261018000300_rag_knowledge` khi backend khởi tạo lại database. VPS/PostgreSQL cần `npm run db:deploy` trước khi chạy bản backend mới; extension pgvector phải có như migration ban đầu. KnowledgeChunk là dữ liệu dẫn xuất công khai, được lập lại từ catalog/hướng dẫn, không phải nơi lưu hội thoại.

API: `POST /api/assistant/chat`, JSON `{message,history?:string[]}`. Message 2–1.000 ký tự, history tối đa 4 câu hỏi, mỗi câu tối đa 1.000 ký tự. Origin phải bằng `CLIENT_ORIGIN`. Không cần session; cookie không được gửi từ widget. Rate limit 20 lần/15 phút/IP và tối đa 4 request đang xử lý/process. Giới hạn và cache trong RAM, cần shared store nếu scale nhiều process. Timeout request 55 giây, browser 60 giây. Response no-store, không ghi transcript vào log.

## Kiểm tra

`npm run test:rag` kiểm tra xã giao không cần database/AI, không chặn câu hỏi kèm lời chào/cảm ơn, nối tiếp nhu cầu và chuyển mô tả sang Planner; đồng thời kiểm tra vector local, truy xuất đúng hướng dẫn, lọc nguồn public, xử lý legacy trùng số ngày, pgvector thực trên PGlite, cập nhật chỉ mục, đổi điểm đến, fallback, chống ID nguồn/giá bịa và API khách chưa đăng nhập. Không gọi provider thật trong test.

Tham khảo toán tử cosine và mô hình truy vấn tại [tài liệu pgvector](https://github.com/pgvector/pgvector#querying).
