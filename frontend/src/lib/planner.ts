import { API_URL, ApiError } from "./api";
import { readPlannerStream, type PlannerStage } from "./planner-stream";
export type PlannerConstraints = {
  destination: string | null; days: number | null; people: number | null; budgetVnd: number | null;
  startDate: string | null; style: "relaxed" | "balanced" | "active";
};
export type PlannerRequest = Partial<PlannerConstraints> & { prompt: string };
export type TourSuggestion = {
  tourId: string; tourName: string; departureId: string; startsOn: string; endsOn: string; durationDays: number;
  requestedStartDate: string | null; dayDifference: number; availableSeats: number | null;
  perPersonVnd: string | null; totalVnd: string | null; withinBudget: boolean | null;
};
export type ReadyPlan = {
  manualEdit?: { updatedAt: string };
  draftId?: string;
  status: "ready"; generatedAt: string; constraints: PlannerConstraints;
  days: { dayNumber: number; date: string | null; note?: string; activities: {
    note?: string;
    ref: string; period: "morning" | "afternoon" | "evening"; title: string; content: string; placeName: string | null; costVnd: null;
    source: { tourId: string | null; tourName: string; dayNumber: number | null; needsReview: boolean; url?: string; checkedAt?: string };
  }[] }[];
  weather: { status: "available" | "not_configured" | "outside_forecast" | "unavailable"; location?: string;
    days: { date: string; condition: string; minC: number; maxC: number; rainChance: number }[] };
  budget: { totalBudgetVnd: string; itineraryTotalVnd: null; complete: false };
  packageQuotes: TourSuggestion[];
  warnings: string[];
  evidence: { ai: "responded"; model: string; tools: string[]; catalogSource: string };
};
export type PlannerResult = ReadyPlan | { status: "needs_input" | "no_data"; constraints: PlannerConstraints; questions: string[]; packageQuotes?: TourSuggestion[] };
export async function generatePlan(input: PlannerRequest, signal: AbortSignal, onProgress?: (stage: PlannerStage) => void): Promise<PlannerResult> {
  // Planner has a separate timeout: ordinary catalog requests should stay fast.
  const response = await fetch(`${API_URL.replace(/\/$/, "")}/planner/generate`, {
    method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(input), signal: AbortSignal.any([signal, AbortSignal.timeout(110_000)]),
  });
  if (response.ok && response.headers.get("content-type")?.includes("text/event-stream") && response.body) return readPlannerStream(response.body, onProgress);
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body.code);
  return body.data;
}
export function plannerError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      login_required: "Bạn cần đăng nhập để tạo lịch trình.",
      ai_unconfigured: "Tính năng tạo lịch AI hiện chưa sẵn sàng. Bạn có thể xem các tour ở mục Khám phá và quay lại sau.",
      ai_unavailable: "Trợ lý AI đang tạm gián đoạn. Thông tin bạn nhập vẫn được giữ, hãy thử tạo lại sau ít phút nhé.",
      ai_invalid_output: "AI trả lịch trình chưa hợp lệ. Hệ thống chưa chấp nhận kết quả; hãy thử lại hoặc mô tả cụ thể hơn.",
      invalid_planner_request: "Kiểm tra dữ liệu: 1–14 ngày, 1–50 người, ngân sách là số nguyên VNĐ và ngày đi hợp lệ.",
      catalog_unavailable: "Chưa tải được dữ liệu tour. Bạn có thể kiểm tra mục Khám phá rồi thử tạo lại.",
      planner_rate_limit: "Bạn đã tạo nhiều yêu cầu. Vui lòng thử lại sau vài phút.",
      planner_busy: "Đang có yêu cầu được xử lý. Hãy chờ hoàn tất rồi thử lại.",
    };
    return messages[error.code ?? ""] ?? "Planner tạm thời chưa sẵn sàng. Vui lòng thử lại.";
  }
  return "Yêu cầu bị gián đoạn hoặc quá thời gian. Vui lòng kiểm tra kết nối rồi thử lại.";
}
