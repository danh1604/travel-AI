// Development/demo catalogue. Prices are illustrative, flagged source=DEMO and
// shown as such in the UI; they are not quotes from any real provider.
const note = " (dữ liệu demo, giá minh họa chưa xác nhận)";
const dest = (slug: string, name: string, province: string, latitude: number, longitude: number, description: string, tags: string[]) =>
  ({ slug, name, province, latitude, longitude, tags, description: description + note });
const hotel = (destination: string, slug: string, name: string, priceVnd: string, address: string, tags: string[], roomCapacity = 2) =>
  ({ destination, slug, name, priceVnd, address, tags, roomCapacity, costUnit: "PER_ROOM_NIGHT", latitude: null, longitude: null, description: `Giá mỗi phòng/đêm, tối đa ${roomCapacity} khách${note}` });
const restaurant = (destination: string, slug: string, name: string, priceVnd: string, address: string, tags: string[], foodOptions: string[]) =>
  ({ destination, slug, name, priceVnd, address, tags, foodOptions, costUnit: "PER_PERSON", latitude: null, longitude: null, description: `Giá ước tính một bữa/người${note}` });
const attraction = (destination: string, slug: string, name: string, priceVnd: string, durationMinutes: number, isIndoor: boolean, address: string, tags: string[]) =>
  ({ destination, slug, name, priceVnd, durationMinutes, isIndoor, address, tags, costUnit: "PER_PERSON", latitude: null, longitude: null, description: `Giá vé/người${note}` });
const transport = (destination: string, slug: string, name: string, departure: string, mode: string, priceVnd: string, costUnit: string, capacity: number, durationMinutes: number) =>
  ({ destination, slug, name, departure, mode, priceVnd, costUnit, capacity, durationMinutes, description: `Thời gian và giá chỉ mang tính minh họa${note}` });

export const demoDestinations = [
  dest("da-nang", "Đà Nẵng", "Đà Nẵng", 16.0544, 108.2022, "Thành phố biển với bãi Mỹ Khê, Ngũ Hành Sơn và ẩm thực miền Trung", ["biển", "ẩm thực", "gia đình"]),
  dest("da-lat", "Đà Lạt", "Lâm Đồng", 11.9404, 108.4583, "Cao nguyên mát mẻ, đồi thông, cà phê và hoa", ["thiên nhiên", "cà phê", "thư giãn"]),
  dest("phu-quoc", "Phú Quốc", "Kiên Giang", 10.2899, 103.984, "Đảo ngọc với bãi tắm, hải sản và hoàng hôn", ["biển", "nghỉ dưỡng", "hải sản"]),
];

export const demoServices = {
  hotels: [
    hotel("da-nang", "dn-khach-san-bien-tiet-kiem", "Khách sạn Biển Xanh", "450000", "Gần biển Mỹ Khê, Đà Nẵng", ["gần biển", "tiết kiệm"]),
    hotel("da-nang", "dn-khach-san-yen-tinh", "Khách sạn Yên Tĩnh", "750000", "Đường ven biển, Đà Nẵng", ["gần biển", "yên tĩnh"]),
    hotel("da-nang", "dn-khach-san-thoai-mai", "Khách sạn Thoải Mái", "1100000", "Trung tâm Đà Nẵng", ["gần biển", "tiện nghi"], 3),
    hotel("da-lat", "dl-nha-nghi-doi-thong", "Nhà nghỉ Đồi Thông", "380000", "Gần chợ Đà Lạt", ["tiết kiệm", "trung tâm"]),
    hotel("da-lat", "dl-homestay-suong-mai", "Homestay Sương Mai", "650000", "Đồi Cù, Đà Lạt", ["yên tĩnh", "view đẹp"]),
    hotel("phu-quoc", "pq-khach-san-bai-sao", "Khách sạn Bãi Sao", "820000", "Bãi Sao, Phú Quốc", ["gần biển", "nghỉ dưỡng"]),
    hotel("phu-quoc", "pq-resort-hoang-hon", "Resort Hoàng Hôn", "1850000", "Dương Đông, Phú Quốc", ["gần biển", "cao cấp"], 3),
  ],
  restaurants: [
    restaurant("da-nang", "dn-mi-quang-ba-mua", "Mì Quảng Bà Mua", "60000", "Hải Châu, Đà Nẵng", ["đặc sản", "bình dân"], ["thịt"]),
    restaurant("da-nang", "dn-bun-cha-ca", "Bún chả cá Phố", "55000", "Thanh Khê, Đà Nẵng", ["đặc sản", "bình dân"], ["hải sản"]),
    restaurant("da-nang", "dn-nha-hang-hai-san", "Nhà hàng Hải Sản Biển", "250000", "Sơn Trà, Đà Nẵng", ["hải sản", "nhóm bạn"], ["hải sản"]),
    restaurant("da-nang", "dn-quan-chay-sen", "Quán chay Sen", "90000", "Hải Châu, Đà Nẵng", ["ăn chay"], ["chay"]),
    restaurant("da-lat", "dl-banh-trang-nuong", "Bánh tráng nướng Chợ Đêm", "30000", "Chợ đêm Đà Lạt", ["ăn vặt", "bình dân"], ["thịt", "chay"]),
    restaurant("da-lat", "dl-lau-ga-la-e", "Lẩu gà lá é", "140000", "Phường 1, Đà Lạt", ["đặc sản", "nhóm bạn"], ["thịt"]),
    restaurant("phu-quoc", "pq-goi-ca-trich", "Gỏi cá trích Bãi Vòng", "180000", "Bãi Vòng, Phú Quốc", ["đặc sản", "hải sản"], ["hải sản"]),
    restaurant("phu-quoc", "pq-bun-quay", "Bún quậy Kiên Giang", "70000", "Dương Đông, Phú Quốc", ["đặc sản", "bình dân"], ["thịt", "hải sản"]),
  ],
  attractions: [
    attraction("da-nang", "dn-bai-bien-my-khe", "Bãi biển Mỹ Khê", "0", 120, false, "Sơn Trà, Đà Nẵng", ["biển", "thư giãn"]),
    attraction("da-nang", "dn-bao-tang-cham", "Bảo tàng Điêu khắc Chăm", "60000", 90, true, "Hải Châu, Đà Nẵng", ["văn hóa", "trong nhà"]),
    attraction("da-nang", "dn-ngu-hanh-son", "Ngũ Hành Sơn", "40000", 150, false, "Ngũ Hành Sơn, Đà Nẵng", ["thiên nhiên", "tâm linh"]),
    attraction("da-nang", "dn-lop-nau-an", "Lớp học nấu ăn miền Trung", "350000", 150, true, "Hải Châu, Đà Nẵng", ["ẩm thực", "trong nhà"]),
    attraction("da-lat", "dl-thung-lung-tinh-yeu", "Thung lũng Tình Yêu", "100000", 120, false, "Phường 8, Đà Lạt", ["thiên nhiên", "gia đình"]),
    attraction("da-lat", "dl-ga-da-lat", "Ga Đà Lạt", "10000", 60, true, "Phường 10, Đà Lạt", ["văn hóa", "trong nhà"]),
    attraction("da-lat", "dl-doi-che-cau-dat", "Đồi chè Cầu Đất", "50000", 150, false, "Xuân Trường, Đà Lạt", ["thiên nhiên", "cà phê"]),
    attraction("phu-quoc", "pq-bai-sao", "Tắm biển Bãi Sao", "0", 180, false, "An Thới, Phú Quốc", ["biển", "thư giãn"]),
    attraction("phu-quoc", "pq-tau-lan-san-ho", "Tour lặn ngắm san hô", "450000", 240, false, "An Thới, Phú Quốc", ["biển", "trải nghiệm"]),
    attraction("phu-quoc", "pq-nha-thung-nuoc-mam", "Nhà thùng nước mắm", "0", 60, true, "Dương Đông, Phú Quốc", ["văn hóa", "trong nhà"]),
  ],
  transportations: [
    transport("da-nang", "dn-bay-hcm-da-nang", "Vé bay TP.HCM – Đà Nẵng", "TP.HCM", "FLIGHT", "2100000", "PER_PERSON_ROUND_TRIP", 1, 90),
    transport("da-nang", "dn-bay-ha-noi-da-nang", "Vé bay Hà Nội – Đà Nẵng", "Hà Nội", "FLIGHT", "1900000", "PER_PERSON_ROUND_TRIP", 1, 85),
    transport("da-nang", "dn-taxi-noi-thanh", "Xe 4 chỗ trong thành phố", "Đà Nẵng", "CAR", "180000", "PER_VEHICLE_TRIP", 4, 30),
    transport("da-lat", "dl-bay-hcm-da-lat", "Vé bay TP.HCM – Đà Lạt", "TP.HCM", "FLIGHT", "1500000", "PER_PERSON_ROUND_TRIP", 1, 55),
    transport("da-lat", "dl-xe-giuong-nam", "Xe giường nằm TP.HCM – Đà Lạt", "TP.HCM", "BUS", "600000", "PER_PERSON_ROUND_TRIP", 1, 420),
    transport("phu-quoc", "pq-bay-hcm-phu-quoc", "Vé bay TP.HCM – Phú Quốc", "TP.HCM", "FLIGHT", "2400000", "PER_PERSON_ROUND_TRIP", 1, 65),
    transport("phu-quoc", "pq-xe-may-thue", "Thuê xe máy theo ngày", "Phú Quốc", "MOTORBIKE", "150000", "PER_VEHICLE_TRIP", 2, 60),
  ],
};
