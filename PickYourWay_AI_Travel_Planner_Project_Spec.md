# PickYourWay AI — Full-stack AI Travel Planning Platform

> **Project concept:** Nền tảng lập kế hoạch du lịch thông minh cho phép người dùng mô tả nhu cầu bằng ngôn ngữ tự nhiên. AI Travel Agent phân tích yêu cầu, chủ động gọi các công cụ/API phù hợp, lấy dữ liệu thật từ hệ thống, xây dựng lịch trình theo ngày, tính và tối ưu ngân sách, sau đó cho phép người dùng tiếp tục chỉnh sửa chuyến đi bằng hội thoại.

---

## 1. Tổng quan dự án

### 1.1. Tên dự án
**PickYourWay AI — AI Travel Planner**

### 1.2. Định hướng
PickYourWay AI không phải là một chatbot du lịch chỉ gửi câu hỏi sang Gemini/OpenAI và hiển thị đoạn văn do model sinh ra. Đây là một **Full-stack AI application** trong đó AI đóng vai trò điều phối (orchestrator/agent), còn dữ liệu về khách sạn, nhà hàng, tour, giá, địa điểm, thời tiết... đến từ database và API thật.

Mục tiêu là để người dùng có thể nói:

> “Tôi muốn đi Đà Nẵng 4 ngày 3 đêm từ TP.HCM, ngân sách 8 triệu/người, đi 2 người, thích biển, ăn uống và không muốn lịch trình quá dày.”

Hệ thống hiểu yêu cầu, tìm dữ liệu phù hợp, lập một kế hoạch có cấu trúc, tính chi phí, kiểm tra ngân sách và cho phép người dùng tiếp tục nói:

> “Ngày 2 đi nhiều quá, giảm bớt giúp tôi.”

hoặc:

> “Đổi khách sạn rẻ hơn nhưng vẫn gần biển.”

AI phải hiểu **trip hiện tại**, chỉ thay đổi phần cần thiết, gọi lại tool khi cần và cập nhật dữ liệu chuyến đi.

---

## 2. Vấn đề dự án giải quyết

Việc tự lập một chuyến đi thường yêu cầu người dùng phải mở nhiều website khác nhau để tìm:

- Điểm đến.
- Khách sạn.
- Nhà hàng.
- Địa điểm vui chơi.
- Phương tiện di chuyển.
- Giá dịch vụ.
- Thời tiết.
- Khoảng cách giữa các địa điểm.
- Tổng ngân sách.
- Kinh nghiệm du lịch.

PickYourWay AI gom các bước đó vào một workflow duy nhất. Người dùng chỉ cần mô tả nhu cầu; hệ thống chuyển nhu cầu thành dữ liệu có cấu trúc, truy xuất nguồn dữ liệu phù hợp và tạo kế hoạch có thể lưu, chỉnh sửa và chia sẻ.

---

## 3. Đối tượng sử dụng

### Traveler / User
Người muốn tìm điểm đến, khám phá dịch vụ và tạo chuyến đi cá nhân hóa.

### Admin
Quản lý dữ liệu nội bộ như destination, hotel, restaurant, attraction, tour, transportation, review và knowledge base.

### AI Travel Agent
Thành phần thông minh có nhiệm vụ hiểu yêu cầu, lựa chọn tool, tổng hợp dữ liệu và đề xuất kế hoạch. Agent **không phải nguồn dữ liệu chính**.

---

# 4. Nguyên tắc quan trọng nhất của AI

## 4.1. AI không tự bịa dữ liệu nghiệp vụ

Không nên làm như sau:

```text
User → Gemini/OpenAI → "Khách sạn ABC giá 650.000đ"
```

nếu hệ thống không có bằng chứng rằng khách sạn và mức giá đó tồn tại.

Luồng đúng:

```text
User
  ↓
AI Travel Agent
  ↓
Tool Calling
  ↓
Database / External API / RAG
  ↓
Verified Context
  ↓
AI Reasoning
  ↓
Structured Itinerary
```

Giá khách sạn, tour, vé, dịch vụ và dữ liệu có cấu trúc phải đến từ database/API. AI chịu trách nhiệm hiểu nhu cầu, lựa chọn dữ liệu, reasoning, tối ưu và diễn giải.

---

# 5. Ba nguồn dữ liệu chính

## 5.1. Database của PickYourWay

Đây là nguồn dữ liệu mà hệ thống kiểm soát trực tiếp.

Ví dụ các collection/table:

```text
users
destinations
hotels
restaurants
attractions
tours
transportations
services
reviews
trips
trip_days
trip_activities
user_preferences
```

Ví dụ một attraction:

```json
{
  "name": "VinWonders Phú Quốc",
  "type": "attraction",
  "province": "Kiên Giang",
  "price": 950000,
  "durationHours": 6,
  "tags": ["family", "entertainment"]
}
```

Database phù hợp với:

- Giá tour/dịch vụ nội bộ.
- Hotel.
- Restaurant.
- Attraction.
- Transportation do hệ thống quản lý.
- User.
- Saved trip.
- Review.
- User preference.

## 5.2. External APIs

Dùng cho dữ liệu động hoặc dữ liệu không nên tự duy trì thủ công.

Ví dụ:

- Weather API → dự báo thời tiết.
- Maps/Places API → tọa độ, địa điểm, khoảng cách, route, giờ mở cửa hoặc rating nếu API hỗ trợ.
- Các API travel khác → có thể bổ sung về sau nếu có nguồn dữ liệu phù hợp.

Ví dụ:

```text
getWeather("Da Nang", "2026-10-12")
```

trả:

```json
{
  "condition": "rain",
  "temperature": 25,
  "rainProbability": 80
}
```

AI có thể dựa vào kết quả này để điều chỉnh hoạt động ngoài trời.

## 5.3. RAG / Knowledge Base

RAG dùng cho dữ liệu dạng văn bản, không phải thay thế database.

Ví dụ nguồn:

```text
PhuQuocTravelGuide.pdf
DaNangGuide.md
TravelTips.docx
Blog articles
Policies
Destination descriptions
```

Pipeline:

```text
Document
  ↓
Parser
  ↓
Chunking
  ↓
Embedding
  ↓
Vector Database
  ↓
Semantic Search
  ↓
Relevant Context
  ↓
LLM
```

RAG phù hợp với:

- Kinh nghiệm du lịch.
- Đặc sản.
- Văn hóa địa phương.
- Travel tips.
- Bài blog.
- Chính sách.
- Nội dung hướng dẫn dài.

### Phân chia trách nhiệm

| Dữ liệu | Nguồn |
|---|---|
| Giá tour | Database/API |
| Giá dịch vụ | Database/API |
| Hotel | Database/API |
| Restaurant | Database/API |
| Attraction | Database/API |
| Thời tiết | External API |
| Maps / route | External API |
| Lịch trình đã lưu | Database |
| User preference | Database |
| Kinh nghiệm du lịch | RAG |
| Blog / travel guide | RAG |
| Chính sách | RAG |

---

# 6. Kiến trúc tổng thể

```text
                         PICKYOURWAY AI
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
         EXPLORE          AI PLANNER         MY TRIPS
            │                 │                 │
    Destination/Hotel     Natural Language     Saved Trips
    Restaurant/Tour           Input                │
            │                 ↓                 Edit/Share
            │          AI TRAVEL AGENT
            │                 │
            │       ┌─────────┼──────────┐
            │       ↓         ↓          ↓
            │   DATABASE   EXTERNAL     RAG
            │               APIs      VECTOR DB
            │       │         │          │
            └───────┴─────────┼──────────┘
                              ↓
                       ITINERARY ENGINE
                              │
                  ┌───────────┼───────────┐
                  ↓           ↓           ↓
                Budget       Map        Weather
                  │
                  ↓
              Optimization
```

Một stack tham khảo:

```text
Frontend       Next.js + TypeScript + Tailwind CSS
Backend        Next.js API / Node.js API
Database       PostgreSQL + Prisma (hoặc tiếp tục MongoDB nếu phù hợp)
Vector DB      pgvector / Qdrant
AI             Gemini hoặc OpenAI
Auth           Auth.js / JWT
Maps           Google Maps / Mapbox
Weather        Weather API
Storage        Cloudinary / object storage
Deployment     Vercel + managed database
Optional       Docker + background jobs / queue
```

---

# 7. Chức năng chính

## 7.1. Authentication & User Profile

Người dùng có thể:

- Đăng ký.
- Đăng nhập.
- Đăng xuất.
- Quản lý profile.
- Xem lịch sử chuyến đi.
- Lưu sở thích du lịch.

User preference có thể chứa:

```json
{
  "budgetLevel": "medium",
  "travelStyle": "relaxed",
  "interests": ["food", "beach"],
  "foodRestrictions": ["seafood"],
  "preferredTransport": ["flight", "car"],
  "hotelPreferences": ["near beach", "quiet"]
}
```

---

## 7.2. Explore

Website vẫn cần một phần web truyền thống để người dùng khám phá dữ liệu mà không cần chat với AI.

```text
Explore
├── Destinations
├── Hotels
├── Restaurants
├── Attractions
├── Tours
└── Travel Guides
```

Ví dụ trang Đà Nẵng:

```text
ĐÀ NẴNG

Popular places
🏖 Mỹ Khê Beach
⛰ Ngũ Hành Sơn
🌉 Cầu Rồng
🎡 Bà Nà Hills

Food
🍜 Mì Quảng
🍜 Bún chả cá
🥩 Bánh tráng cuốn thịt heo
```

Mục tiêu của module này là vừa tạo trải nghiệm khám phá, vừa thể hiện kỹ năng full-stack CRUD/search/filter của dự án.

---

# 8. AI Travel Planner — chức năng trung tâm

## 8.1. Input bằng ngôn ngữ tự nhiên

User:

> “Tôi muốn đi Đà Nẵng 4 ngày 3 đêm từ TP.HCM, ngân sách 8 triệu/người, đi 2 người, thích biển, ăn uống và không muốn lịch trình quá dày.”

AI chuyển thành structured request:

```json
{
  "departure": "TP.HCM",
  "destination": "Đà Nẵng",
  "days": 4,
  "nights": 3,
  "people": 2,
  "budgetPerPerson": 8000000,
  "interests": ["beach", "food"],
  "travelStyle": "relaxed"
}
```

Nếu thiếu thông tin quan trọng, Agent có thể hỏi lại thay vì đoán.

Ví dụ:

> “Bạn dự định đi vào ngày nào? Mình cần ngày đi để kiểm tra thời tiết và xây lịch phù hợp.”

---

## 8.2. Tool Calling

Agent có thể được cấp các tool như:

```text
searchHotels()
searchRestaurants()
searchAttractions()
searchTours()
searchTransportation()
getWeather()
calculateRoute()
searchTravelKnowledge()
getCurrentTrip()
updateTrip()
```

Không phải câu hỏi nào cũng gọi tất cả tool.

### Ví dụ 1
User:

> “Khách sạn dưới 1 triệu ở Đà Nẵng?”

Agent gọi:

```text
searchHotels(destination="Da Nang", maxPrice=1000000)
```

### Ví dụ 2
User:

> “Ngày mai Đà Nẵng có mưa không?”

Agent gọi:

```text
getWeather(destination="Da Nang", date="tomorrow")
```

### Ví dụ 3
User:

> “Đà Nẵng có món đặc sản gì?”

Agent có thể dùng knowledge search/RAG.

### Ví dụ 4
User:

> “Lên kế hoạch Đà Nẵng 4 ngày, ngân sách 8 triệu.”

Agent cần kết hợp nhiều tool và sau đó chạy logic lập lịch/tính ngân sách.

---

# 9. Itinerary Generation

Kết quả không nên chỉ là một đoạn chat. Nó phải được lưu thành dữ liệu có cấu trúc và render thành UI.

Ví dụ:

```text
🇻🇳 ĐÀ NẴNG
4 ngày 3 đêm
2 người
Ngân sách: 16.000.000đ

━━━━━━━━━━━━━━━━━━
DAY 1

08:00
✈ TP.HCM → Đà Nẵng

10:30
🏨 Check-in Hotel ABC

12:00
🍜 Mì Quảng
~150.000đ / 2 người

14:00
🏖 Biển Mỹ Khê
Miễn phí

18:30
🍤 Dinner
━━━━━━━━━━━━━━━━━━
DAY 2
...
```

Một activity nên có dữ liệu như:

```json
{
  "day": 1,
  "startTime": "14:00",
  "type": "attraction",
  "referenceId": "place_123",
  "name": "Mỹ Khê Beach",
  "estimatedCost": 0,
  "estimatedDurationMinutes": 120,
  "latitude": 0,
  "longitude": 0,
  "source": "database"
}
```

Điều này cho phép hệ thống tính budget, vẽ map, chỉnh sửa từng activity và tránh phụ thuộc vào text do AI sinh.

---

# 10. Budget Planner & Optimization

## 10.1. Tính ngân sách

Ví dụ:

```text
Ngân sách             16.000.000đ

✈ Di chuyển            4.200.000đ
🏨 Khách sạn            4.500.000đ
🍜 Ăn uống              2.300.000đ
🎟 Vui chơi             2.000.000đ
🚕 Di chuyển nội bộ     1.000.000đ
────────────────────────────────
Tổng                   14.000.000đ
Còn lại                 2.000.000đ
```

Tổng tiền nên được tính bằng code/backend từ các item đã chọn, không yêu cầu LLM tự cộng tiền.

## 10.2. Khi vượt ngân sách

```text
⚠️ Kế hoạch hiện tại vượt ngân sách 1.350.000đ.

AI Suggestions

→ Đổi Hotel A → Hotel B
  Tiết kiệm 900.000đ

→ Đổi Restaurant A → Restaurant B
  Tiết kiệm 350.000đ

→ Bỏ activity X
  Tiết kiệm 250.000đ
```

Agent có thể tìm phương án thay thế bằng cách gọi lại tool với constraint giá thấp hơn.

Ví dụ:

```text
searchHotels(
  destination="Da Nang",
  maxPrice=700000,
  tags=["near beach"]
)
```

AI sau đó so sánh các lựa chọn và giải thích trade-off.

---

# 11. Conversational Trip Editing

Sau khi trip được tạo, conversation phải gắn với `tripId` hiện tại.

User:

> “Ngày 2 đi nhiều quá, giảm bớt giúp tôi.”

Agent cần:

1. Lấy trip hiện tại.
2. Xác định Day 2.
3. Kiểm tra số activity/thời gian di chuyển.
4. Đề xuất activity nên bỏ hoặc di chuyển.
5. Chỉ cập nhật Day 2 khi user đồng ý hoặc khi UX cho phép auto-update.
6. Tính lại budget/route nếu có thay đổi.

Không nên regenerate toàn bộ trip một cách vô thức.

### Ví dụ đổi khách sạn

User:

> “Đổi khách sạn rẻ hơn nhưng vẫn gần biển.”

Agent:

```text
getCurrentTrip(tripId)
        ↓
read current hotel
        ↓
searchHotels(destination="Da Nang", maxPrice=<current price>, tags=["near beach"])
        ↓
rank alternatives
```

UI:

```text
Hotel hiện tại
1.100.000đ/night

↓

Hotel XYZ
650.000đ/night

Tiết kiệm cho 3 đêm: 1.350.000đ
```

Sau khi đổi, backend cập nhật trip và tính lại tổng ngân sách.

---

# 12. AI Memory / Personalization

Có hai loại context cần phân biệt:

### Trip context
Thông tin chỉ thuộc chuyến đi hiện tại:

- Destination.
- Budget.
- Number of people.
- Current hotel.
- Activities.
- Dates.

### User preference
Sở thích có thể áp dụng cho các chuyến sau:

- Không ăn hải sản.
- Thích lịch trình thư giãn.
- Ưu tiên hotel gần biển.
- Thường chọn mức ngân sách trung bình.

Ví dụ user từng lưu:

```json
{
  "foodRestrictions": ["seafood"]
}
```

Sau đó hỏi:

> “Tìm nhà hàng tối nay.”

Agent phải truyền constraint này vào search thay vì đề xuất nhà hàng hải sản.

---

# 13. Weather-aware Itinerary

Lịch ban đầu:

```text
DAY 2
09:00 🏖 Beach
14:00 🏞 Outdoor activity
18:00 🍜 Restaurant
```

Weather API báo:

```json
{
  "time": "14:00",
  "condition": "heavy_rain",
  "rainProbability": 85
}
```

Hệ thống có thể hiển thị:

```text
⚠️ Dự báo chiều thứ Bảy có mưa lớn.
```

AI đề xuất:

```text
Original
14:00 🏞 Outdoor activity

↓

Recommendation
14:00 🏛 Indoor attraction
```

Agent chỉ nên thay đổi sau khi có dữ liệu weather thực tế từ API.

---

# 14. Map & Route Optimization

Trip detail có thể chia UI thành:

```text
LEFT                       RIGHT
────────────               ─────────────
DAY 2                      Interactive Map
1. Hotel                   ● Hotel
   ↓ 2.1 km                │
2. Restaurant              ● Restaurant
   ↓ 3.5 km                │
3. Ngũ Hành Sơn            ● Attraction
   ↓ 6.2 km                │
4. Mỹ Khê Beach            ● Beach
```

Mục tiêu là tránh lịch trình kiểu:

```text
A → 20km → B → 18km → C → 25km → D
```

khi có thể sắp xếp:

```text
A → 2km → C → 3km → B → 4km → D
```

Việc tính distance/route nên do Maps API hoặc thuật toán backend thực hiện. AI dùng kết quả đó để lựa chọn hoặc giải thích phương án tốt hơn.

---

# 15. Save / Manage Trip

Dashboard:

```text
MY TRIPS

🇻🇳 Đà Nẵng
12 → 15 Oct 2026
4 Days
7.3M
Upcoming

🇻🇳 Phú Quốc
20 → 23 Dec 2026
4 Days
9.1M
Planning
```

Actions:

```text
View
Edit
Delete
Duplicate
Share
```

Trip có thể có status:

```text
draft
planning
upcoming
completed
cancelled
```

---

# 16. Share Trip

Người dùng có thể tạo public/share URL:

```text
/trip/da-nang-4-days-x8df21
```

Người nhận link có thể xem itinerary mà không cần đăng nhập nếu chủ trip cho phép public sharing.

Nâng cấp sau:

- Export PDF.
- Collaborative trip.
- Invite friend.
- Comment/vote activity.

---

# 17. Review System

Sau chuyến đi:

```text
Mỹ Khê Beach
⭐⭐⭐⭐⭐
"Biển đẹp nhưng khá đông."
```

Review được lưu vào database và có thể dùng để:

- Hiển thị social proof.
- Ranking địa điểm.
- Recommendation.
- Tạo dữ liệu tổng hợp cho AI sau này.

Không nên để LLM tự coi một review đơn lẻ là sự thật tuyệt đối.

---

# 18. Admin Dashboard

```text
ADMIN
│
├── Dashboard
├── Users
├── Destinations
├── Hotels
├── Restaurants
├── Attractions
├── Tours
├── Transportation
├── Reviews
├── Trips
└── AI Knowledge Base
```

Admin có thể:

- CRUD destination.
- CRUD hotel.
- CRUD restaurant.
- CRUD attraction.
- CRUD tour/service.
- Quản lý transportation.
- Moderate review.
- Quản lý user.
- Theo dõi trip statistics.
- Upload/update tài liệu Knowledge Base.

Module này rất quan trọng để dự án vẫn chứng minh năng lực **Full-stack**, không chỉ AI integration.

---

# 19. RAG Knowledge Base

Admin upload travel document.

Ví dụ:

```text
DaNangTravelGuide.pdf
```

Backend:

```text
Upload
  ↓
Extract text
  ↓
Clean text
  ↓
Chunk
  ↓
Embedding
  ↓
Vector DB
```

User hỏi:

> “Đi Đà Nẵng mùa nào đẹp?”

Search pipeline:

```text
Question
  ↓
Embedding
  ↓
Vector Search
  ↓
Top relevant chunks
  ↓
LLM + retrieved context
  ↓
Answer + source
```

Nếu có thể, UI nên hiển thị source/citation để người dùng biết câu trả lời dựa trên tài liệu nào.

---

# 20. Ví dụ end-to-end hoàn chỉnh

## Step 1 — User request

> “Tôi ở TP.HCM, muốn đi Phú Quốc 4 ngày 3 đêm vào tháng 12, 2 người, tổng ngân sách 16 triệu. Tôi thích biển và đồ ăn, lịch trình thư giãn.”

## Step 2 — AI extraction

```json
{
  "departure": "Ho Chi Minh City",
  "destination": "Phu Quoc",
  "days": 4,
  "nights": 3,
  "people": 2,
  "totalBudget": 16000000,
  "interests": ["beach", "food"],
  "travelStyle": "relaxed"
}
```

Nếu chưa có ngày chính xác và chức năng cần weather/availability theo ngày, Agent hỏi thêm ngày đi.

## Step 3 — Agent planning

```text
searchTransportation()
searchHotels()
searchRestaurants()
searchAttractions()
searchTravelKnowledge()
getWeather()
```

## Step 4 — Backend data

Ví dụ dữ liệu đã được xác thực:

```json
{
  "hotel": {
    "id": "hotel_01",
    "name": "Sunset Beach Hotel",
    "pricePerNight": 850000
  },
  "transport": {
    "type": "flight",
    "pricePerPerson": 1450000
  },
  "restaurants": [
    {
      "id": "res_01",
      "name": "Restaurant A",
      "averagePricePerPerson": 250000
    }
  ]
}
```

## Step 5 — Generate itinerary

```text
PHÚ QUỐC — 4 NGÀY 3 ĐÊM

DAY 1
08:00  Flight TP.HCM → Phú Quốc
11:00  Check-in Sunset Beach Hotel
14:00  Beach
18:00  Dinner

DAY 2
...
```

## Step 6 — Budget engine

```text
Flights          2.900.000đ
Hotel            2.550.000đ
Food             3.000.000đ
Activities       2.400.000đ
Local transport  1.200.000đ
Other            1.000.000đ
─────────────────────────
Estimated total 13.050.000đ
Budget          16.000.000đ
Remaining        2.950.000đ
```

## Step 7 — User edits trip

User:

> “Ngày 2 tôi không muốn đi công viên nữa, đổi thành một ngày nhẹ nhàng và ăn ngon.”

Agent:

```text
getCurrentTrip()
  ↓
read Day 2
  ↓
searchRestaurants()
searchAttractions(tags=["relax", "food"])
  ↓
create Day 2 alternative
  ↓
recalculate budget
```

Chỉ Day 2 được thay đổi.

---

# 21. Agent behavior rules

Để project hoạt động đáng tin cậy, Travel Agent nên tuân thủ các rule:

1. **Không invent giá hoặc entity quan trọng** khi dữ liệu phải đến từ DB/API.
2. **Không tự tính toán tài chính bằng text generation** nếu backend có thể tính bằng code.
3. Khi thiếu constraint quan trọng, hỏi user thay vì đoán.
4. Chỉ gọi tool cần thiết cho request hiện tại.
5. Luôn ưu tiên dữ liệu có cấu trúc trước RAG đối với price/entity/filter.
6. Dùng RAG cho knowledge dạng văn bản.
7. Khi sửa trip, ưu tiên patch phần liên quan thay vì regenerate toàn bộ.
8. Sau mỗi thay đổi ảnh hưởng chi phí, chạy lại budget calculation.
9. Sau thay đổi location/activity, kiểm tra route nếu chức năng map đã được bật.
10. Không tự thực hiện action quan trọng ngoài phạm vi user yêu cầu.
11. Lưu output AI quan trọng thành structured data thay vì chỉ lưu message text.
12. Khi nguồn dữ liệu không đủ, nói rõ limitation thay vì hallucinate.

---

# 22. Gợi ý data model

Một mô hình đơn giản:

```text
User
 ├── UserPreference
 ├── Trip[]
 └── Review[]

Trip
 ├── ownerId
 ├── destinationId
 ├── departureLocation
 ├── startDate
 ├── endDate
 ├── people
 ├── budget
 ├── status
 ├── TripDay[]
 └── Conversation[]

TripDay
 ├── tripId
 ├── dayNumber
 ├── date
 └── TripActivity[]

TripActivity
 ├── type
 ├── referenceId
 ├── startTime
 ├── endTime
 ├── estimatedCost
 ├── notes
 └── source
```

Các entity travel:

```text
Destination
Hotel
Restaurant
Attraction
Tour
Transportation
Review
KnowledgeDocument
KnowledgeChunk
```

---

# 23. MVP nên làm trước

Không cần làm toàn bộ hệ thống ngay từ đầu.

## Version 1 — Portfolio MVP

### 1. Authentication
- Register/login/logout.
- User profile.

### 2. Explore
- Destination.
- Hotel.
- Restaurant.
- Attraction.
- Search/filter.

### 3. AI Travel Planner
- Natural-language request.
- Parse constraints.
- Generate structured itinerary.

### 4. Tool Calling
- `searchHotels()`.
- `searchRestaurants()`.
- `searchAttractions()`.
- `searchTransportation()`.

### 5. Budget Planner
- Calculate total.
- Breakdown cost.
- Detect over-budget.
- Suggest cheaper alternatives.

### 6. Trip Management
- Save.
- View.
- Edit.
- Delete.
- Share.

### 7. Admin Dashboard
- CRUD travel data.

Nếu 7 phần này chạy tốt, dự án đã đủ mạnh để demo.

---

# 24. Version 2 — AI nâng cao

Sau MVP mới bổ sung:

```text
RAG Knowledge Base
Weather API
Map / route
Conversational editing
AI memory / personalization
Recommendation ranking
Review-based recommendation
Export PDF
```

---

# 25. Version 3 — Advanced Agent System

Nếu muốn đẩy project xa hơn:

```text
Travel Planner Agent
        │
        ├── Destination Specialist
        ├── Hotel Search Agent
        ├── Food Agent
        ├── Route Optimizer
        └── Budget Optimizer
```

Tuy nhiên không nên dùng multi-agent chỉ để làm project trông phức tạp. Chỉ tách agent khi mỗi agent thực sự có trách nhiệm/tool/context khác nhau. Với MVP, một Travel Agent có tool calling thường là đủ.

---

# 26. Các màn hình nên có

```text
/
├── Home
├── Explore
│   ├── Destinations
│   ├── Hotels
│   ├── Restaurants
│   └── Attractions
│
├── AI Planner
│   ├── Create Trip
│   └── Planner Chat
│
├── Trip/:id
│   ├── Overview
│   ├── Itinerary
│   ├── Budget
│   ├── Map
│   └── AI Assistant
│
├── My Trips
├── Profile
│
└── Admin
    ├── Dashboard
    ├── Destinations
    ├── Hotels
    ├── Restaurants
    ├── Attractions
    ├── Tours
    ├── Transportation
    ├── Reviews
    └── Knowledge Base
```

---

# 27. Điều gì khiến project này tốt cho CV?

Project thể hiện đồng thời nhiều kỹ năng thay vì chỉ "AI API integration".

### Full-stack

- Authentication.
- Authorization / Admin.
- Database design.
- CRUD.
- Search/filter.
- API design.
- State management.
- File upload.
- Deployment.

### AI Engineering / AI Integration

- LLM integration.
- Prompt/structured output.
- Agent orchestration.
- Tool/function calling.
- RAG.
- Embeddings.
- Vector search.
- Context management.
- Guardrails against hallucination.

### Product / Business Logic

- Trip planning.
- Budget optimization.
- Weather-aware recommendations.
- Route optimization.
- Personalization.
- Trip management.

---

# 28. Cách giải thích khi phỏng vấn

Nếu interviewer hỏi:

> “AI trong project của em thực sự làm gì?”

Có thể trả lời theo ý sau:

> AI không trực tiếp đóng vai trò database và không tự tạo giá dịch vụ. Travel Agent phân tích yêu cầu ngôn ngữ tự nhiên của người dùng thành các constraint có cấu trúc, quyết định tool nào cần gọi, lấy hotel/restaurant/attraction/transport từ backend và dữ liệu động từ external API. Sau đó model sử dụng context đã được truy xuất để xây itinerary và đề xuất phương án. Các phép tính ngân sách được backend thực hiện để tránh sai số của LLM. Khi người dùng chỉnh một ngày hoặc đổi khách sạn, Agent lấy trip hiện tại và chỉ cập nhật phần liên quan thay vì tạo lại toàn bộ chuyến đi.

Đây là điểm khác biệt giữa project này và một chatbot chỉ gọi Gemini/OpenAI API.

---

# 29. Mô tả project có thể dùng trên CV

**PickYourWay AI — Full-stack AI Travel Planning Platform**

> Developed an AI-powered travel planning platform featuring AI Agent tool calling, personalized itinerary generation, budget optimization, structured trip management, external API integration, and RAG-based travel knowledge retrieval. Built the application as a full-stack system where the AI agent retrieves verified travel data through backend tools instead of generating critical pricing or service data autonomously.

Các keyword kỹ thuật có thể đưa vào CV khi đã thực sự implement:

```text
Next.js
TypeScript
REST API
PostgreSQL / MongoDB
Prisma
Gemini / OpenAI API
AI Agents
Tool Calling
RAG
Embeddings
Vector Database
Authentication
External APIs
Vercel
Docker
```

Không nên ghi RAG, multi-agent, Docker... vào CV nếu phiên bản deploy thực tế chưa sử dụng chúng.

---

# 30. Tiêu chí thành công của project

Một phiên bản portfolio tốt cần chứng minh được flow sau chạy end-to-end:

```text
1. User đăng nhập
        ↓
2. Nhập yêu cầu chuyến đi bằng tiếng Việt
        ↓
3. AI parse requirement
        ↓
4. Agent gọi backend tools
        ↓
5. Tools lấy dữ liệu thật
        ↓
6. Hệ thống tạo itinerary có cấu trúc
        ↓
7. Backend tính budget
        ↓
8. User lưu trip
        ↓
9. User yêu cầu AI chỉnh một phần trip
        ↓
10. Agent cập nhật đúng phần đó
        ↓
11. Budget được tính lại
        ↓
12. Trip mới được lưu và có thể share
```

Nếu flow trên hoạt động ổn định và UI tốt, project đã thể hiện rõ năng lực của một **Full-stack Developer có khả năng xây dựng AI-enabled product**, thay vì chỉ tích hợp một ô chat vào website.

---

# 31. Tóm tắt vision

```text
PICKYOURWAY AI

User natural-language request
          ↓
Understand constraints
          ↓
AI Travel Agent
          ↓
Choose tools
          ↓
┌────────────┬─────────────┬────────────┐
│ Database   │ External API│    RAG     │
│ price/data │ live data   │ knowledge  │
└────────────┴─────────────┴────────────┘
          ↓
Build structured itinerary
          ↓
Calculate budget
          ↓
Check weather / route
          ↓
Optimize
          ↓
Save Trip
          ↓
Conversational editing
          ↓
Share / Review
```

**Core principle:** AI là lớp reasoning và orchestration; backend/database/API là source of truth cho dữ liệu nghiệp vụ quan trọng.

---

## Kết luận

PickYourWay AI nên được xây như một sản phẩm du lịch full-stack có AI Agent ở trung tâm, không phải một chatbot được gắn thêm vào website. Điểm mạnh của dự án nằm ở việc kết hợp **web application thực tế + dữ liệu có cấu trúc + Agent/tool calling + RAG + external APIs + business logic về itinerary/budget**.

Đối với portfolio Fresher/Junior Full-stack, nên ưu tiên hoàn thiện MVP thật chắc, deploy được, có dữ liệu demo tốt và có một flow AI Agent end-to-end rõ ràng. Các chức năng nâng cao như RAG, weather-aware planning, map optimization, memory và multi-agent nên được thêm dần sau khi core flow đã ổn định.
