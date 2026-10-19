import type { ReadyPlan, TourSuggestion } from "./planner";

export const itineraryPeriods = [
  { key: "morning", label: "Buổi sáng", hint: "Bắt đầu ngày mới", symbol: "◔" },
  { key: "afternoon", label: "Buổi chiều", hint: "Tiếp tục khám phá", symbol: "☀" },
  { key: "evening", label: "Buổi tối", hint: "Khép lại một ngày", symbol: "☾" },
] as const;

export function formatTripDate(value: string) {
  // Date-only values have no time zone: never convert through the viewer's local midnight.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function groupDayActivities(day: ReadyPlan["days"][number]) {
  return itineraryPeriods.map((period) => ({ ...period, activities: day.activities.filter((activity) => activity.period === period.key) }));
}

export function departureComparison(quote: TourSuggestion) {
  if (quote.requestedStartDate === null) return "Lịch sắp khởi hành";
  if (quote.dayDifference === 0) return "Đúng ngày bạn chọn";
  return `${quote.dayDifference < 0 ? "Sớm" : "Muộn"} hơn ${Math.abs(quote.dayDifference)} ngày`;
}
