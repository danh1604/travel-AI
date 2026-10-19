import { createPlannerAI, PlannerAIError, type PlannerAI } from "@pickyourway/ai-services";
import { env } from "../config/env.js";
import { loadCatalog } from "../catalog/repository.js";
import type { CatalogSnapshot, TourDetail } from "../catalog/contracts.js";
import { constraintsSchema, constraintsParameters, selectedPlan, selectionParameters, type PlannerRequest, type Constraints, type PlanSelection } from "./contracts.js";
import { createWeatherTool, vietnamDate, type WeatherResult } from "./weather.js";
import { loadGuides, type TravelGuide } from "../catalog/guides.js";
import { dailyActivityLimit, excludedActivity, plannerPreferences, preferenceScore } from "./preferences.js";

const fold = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
type Stop = TourDetail["days"][number]["stops"][number];
type SourceStop = { ref: string; tour?: TourDetail; guide?: TravelGuide; sourceDay: number; stop: Stop };
export type PlannerStage = "understanding" | "searching" | "weather" | "building" | "validating";
function matchingTours(catalog: CatalogSnapshot, destination: string) {
  const terms = fold(destination).replace(/\b(thanh pho|tinh|tp)\b/g, "").match(/[a-z0-9]+/g) ?? [];
  if (!terms.length) return [];
  return catalog.tours.filter((tour) => {
    const words = new Set(fold([tour.name, ...tour.days.flatMap((d) => d.stops.flatMap((s) => [s.placeName ?? "", s.title]))].join(" ")).match(/[a-z0-9]+/g) ?? []);
    return terms.every((term) => words.has(term));
  });
}
export function findCandidates(catalog: CatalogSnapshot, destination: string, days: number, priorityTourIds: string[] = []) {
  const rank = (id: string) => { const index = priorityTourIds.indexOf(id); return index < 0 ? priorityTourIds.length : index; };
  return matchingTours(catalog, destination).filter((tour) => tour.days.some((d) => d.stops.length > 0))
    .sort((a, b) => rank(a.id) - rank(b.id) || Math.abs((a.durationDays ?? 99) - days) - Math.abs((b.durationDays ?? 99) - days) || a.id.localeCompare(b.id)).slice(0, 6);
}
export function sourceStops(tours: TourDetail[]) {
  const refs = new Map<string, SourceStop>();
  // Bound context per tour so a single long tour cannot consume all tokens.
  const counts = new Map<string, number>();
  tours.forEach((tour, t) => tour.days.slice().sort((a, b) => a.dayNumber - b.dayNumber).forEach((day, d) => {
    day.stops.slice().sort((a, b) => a.position - b.position).slice(0, 5).forEach((stop, s) => {
      if ((counts.get(tour.id) ?? 0) >= 16) return;
      counts.set(tour.id, (counts.get(tour.id) ?? 0) + 1);
      const ref = `t${t}d${d}s${s}`;
      refs.set(ref, { ref, tour, sourceDay: day.dayNumber, stop });
    });
  }));
  return refs;
}
export function resolveSelection(selection: PlanSelection, constraints: Constraints, refs: Map<string, SourceStop>) {
  const days = constraints.days!;
  if (selection.days.length !== days) throw new PlannerAIError("ai_invalid_output");
  const seen = new Set<string>(), seenPlaces = new Set<string>();
  const periodOrder = { morning: 0, afternoon: 1, evening: 2 };
  let activityCount = 0;
  const result = selection.days.map((day, index) => {
    // Some source rows describe a whole day. A model may place the same row in
    // several periods; merge those slots instead of rejecting a grounded plan.
    const dayRefs = new Set<string>();
    const activities = day.activities.filter(({ ref }) => { if (dayRefs.has(ref)) return false; dayRefs.add(ref); return true; });
    if (day.dayNumber !== index + 1 || activities.length > dailyActivityLimit(constraints.style)) throw new PlannerAIError("ai_invalid_output");
    let lastPeriod = -1;
    return {
      dayNumber: day.dayNumber,
      date: constraints.startDate ? new Date(Date.parse(constraints.startDate) + index * 86400_000).toISOString().slice(0, 10) : null,
      activities: activities.map((activity) => {
        const source = refs.get(activity.ref);
        if (!source || seen.has(activity.ref) || periodOrder[activity.period] < lastPeriod) throw new PlannerAIError("ai_invalid_output");
        // Revisiting a beach/place on another day is legitimate. Distinct source
        // refs are still required, and duplicate places within one day are rejected.
        const placeKey = `day${day.dayNumber}:${fold(source.stop.placeName || source.stop.title).trim()}`;
        if (seenPlaces.has(placeKey)) throw new PlannerAIError("ai_invalid_output");
        seen.add(activity.ref); seenPlaces.add(placeKey); lastPeriod = periodOrder[activity.period]; activityCount++;
        return { ref: activity.ref, period: activity.period, title: source.stop.title, content: source.stop.content.slice(0, 4000), placeName: source.stop.placeName,
          costVnd: null, source: source.guide ? { tourId: null, tourName: source.guide.source.name, dayNumber: null, needsReview: true, url: source.guide.source.url, checkedAt: source.guide.checkedAt } : { tourId: source.tour!.id, tourName: source.tour!.name, dayNumber: source.sourceDay, needsReview: source.tour!.needsReview } };
      }),
    };
  });
  if (!activityCount) throw new PlannerAIError("ai_invalid_output");
  return result;
}
export function packageQuotes(tours: TourDetail[], constraints: Constraints, now: number) {
  const requestedStartDate = constraints.startDate ?? vietnamDate(now);
  return tours.flatMap((tour) => tour.departures.filter((d) => d.status === "open" && Date.parse(d.startsAt) > now
    && Date.parse(d.endsAt) >= Date.parse(d.startsAt)
    && (d.availableSeats === null || d.availableSeats >= constraints.people!)
  ).map((d) => {
    const startsOn = vietnamDate(Date.parse(d.startsAt)), endsOn = vietnamDate(Date.parse(d.endsAt));
    const price = d.priceConfirmed && /^\d{1,12}$/.test(d.sourcePriceVnd) ? d.sourcePriceVnd : null;
    const total = price === null ? null : BigInt(price) * BigInt(constraints.people!);
    return { tourId: tour.id, tourName: tour.name, departureId: d.id, startsOn, endsOn,
      durationDays: Math.round((Date.parse(endsOn) - Date.parse(startsOn)) / 86400_000) + 1,
      requestedStartDate: constraints.startDate, dayDifference: Math.round((Date.parse(startsOn) - Date.parse(requestedStartDate)) / 86400_000),
      availableSeats: d.availableSeats, perPersonVnd: price, totalVnd: total?.toString() ?? null,
      withinBudget: constraints.budgetVnd === null || total === null ? null : total <= BigInt(constraints.budgetVnd) };
  })).sort((a, b) => Math.abs(a.dayDifference) - Math.abs(b.dayDifference)
    || Number(a.dayDifference < 0) - Number(b.dayDifference < 0)
    || Math.abs(a.durationDays - constraints.days!) - Math.abs(b.durationDays - constraints.days!)
    || a.startsOn.localeCompare(b.startsOn) || a.departureId.localeCompare(b.departureId)).slice(0, 3);
}
export function createPlannerService(deps: {
  ai: PlannerAI; catalog: () => Promise<CatalogSnapshot>;
  weather: (destination: string, startDate: string | null, days: number, signal: AbortSignal) => Promise<WeatherResult>;
  clock?: () => number;
  guides?: (destination: string) => Promise<TravelGuide[]>;
}) {
  return async (request: PlannerRequest, signal: AbortSignal, progress?: (stage: PlannerStage) => void) => {
    const now = (deps.clock ?? Date.now)();
    const explicit = constraintsSchema.safeParse({ destination: request.destination, days: request.days, people: request.people, budgetVnd: request.budgetVnd, startDate: request.startDate ?? null, style: request.style ?? "balanced" });
    const hasDateInNote = !request.startDate && /ngày\s*\d|tháng|hôm|ngày mai|tuần|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}|tomorrow|weekend|next week/i.test(request.prompt);
    const complete = request.style !== undefined && !hasDateInNote && explicit.success && explicit.data.destination !== null && explicit.data.days !== null && explicit.data.people !== null && explicit.data.budgetVnd !== null;
    if (!complete) progress?.("understanding");
    const parsed = complete ? explicit : constraintsSchema.safeParse(await deps.ai.call("search_tours", "Phân tích yêu cầu thành bộ lọc catalog. Trường nhập riêng ưu tiên hơn mô tả. Thiếu dữ liệu trả null. Mặc định style balanced.", constraintsParameters, { today: vietnamDate(now), request }, signal));
    if (!parsed.success) throw new PlannerAIError("ai_invalid_output");
    // Explicit form values are authoritative, regardless of what the LLM extracted.
    const constraints = constraintsSchema.parse({ ...parsed.data, ...Object.fromEntries(Object.entries(request).filter(([key, value]) => key !== "prompt" && value !== undefined)) });
    const questions: string[] = [];
    if (!constraints.destination) questions.push("Bạn muốn đến đâu?");
    if (!constraints.days) questions.push("Bạn dự định đi bao nhiêu ngày (1–14 ngày)?");
    if (!constraints.people) questions.push("Nhóm của bạn có bao nhiêu người?");
    if (!constraints.budgetVnd) questions.push("Tổng ngân sách cả nhóm là bao nhiêu VNĐ?");
    if (questions.length) return { status: "needs_input" as const, constraints, questions };
    if (constraints.startDate && constraints.startDate < vietnamDate(now)) return { status: "needs_input" as const, constraints, questions: ["Ngày đi đã qua. Bạn muốn khởi hành ngày nào?"] };
    progress?.("searching");
    const catalog = await deps.catalog();
    // Match dates deterministically across all destination matches, before limiting AI context.
    const quotes = packageQuotes(matchingTours(catalog, constraints.destination!), constraints, now);
    const candidates = findCandidates(catalog, constraints.destination!, constraints.days!, quotes.map((q) => q.tourId));
    const preferences = plannerPreferences(request.prompt);
    const guides = (await (deps.guides?.(constraints.destination!) ?? Promise.resolve([]))).filter((guide) => !excludedActivity(preferences, guide.name))
      .sort((a, b) => preferenceScore(preferences, `${b.name} ${b.tags.join(" ")} ${b.description}`) - preferenceScore(preferences, `${a.name} ${a.tags.join(" ")} ${a.description}`));
    if (!candidates.length && !guides.length) return { status: "no_data" as const, constraints, packageQuotes: quotes, questions: ["Chưa có lịch trình nguồn phù hợp với điểm đến này. Hãy thử điểm đến khác trong Explore hoặc bổ sung lịch trình tour ở Admin."] };
    const refs = sourceStops(candidates);
    guides.slice(0, 12).forEach((guide, index) => {
      const ref = `g${index}`;
      refs.set(ref, { ref, guide, sourceDay: 0, stop: { id: guide.id, type: "visit", title: guide.name, content: guide.description, position: index, placeName: guide.name } });
    });
    for (const [ref, source] of refs) if (excludedActivity(preferences, `${source.stop.title} ${source.stop.placeName ?? ""}`)) refs.delete(ref);
    if (!refs.size) return { status: "no_data" as const, constraints, packageQuotes: quotes, questions: ["Mình chưa có hoạt động nguồn phù hợp sau khi bỏ những trải nghiệm bạn không muốn. Bạn có thể chọn điểm đến khác hoặc điều chỉnh nhu cầu nếu muốn; hệ thống không tự thêm hoạt động ngoài nguồn."] };
    progress?.("weather");
    const weather = await deps.weather(constraints.destination!, constraints.startDate, constraints.days!, signal);
    // Constrain provider output to real references and the exact requested number of days.
    const parameters = structuredClone(selectionParameters);
    Object.assign(parameters.properties.days, { minItems: constraints.days, maxItems: constraints.days });
    Object.assign(parameters.properties.days.items.properties.dayNumber, { minimum: 1, maximum: constraints.days });
    Object.assign(parameters.properties.days.items.properties.activities, { maxItems: dailyActivityLimit(constraints.style) });
    Object.assign(parameters.properties.days.items.properties.activities.items.properties.ref, { enum: [...refs.keys()] });
    progress?.("building");
    const raw = await deps.ai.call("build_itinerary", "Chọn ref thật từ catalog theo sở thích người dùng. Đủ số ngày, dayNumber liên tiếp từ 1. Không lặp ref hoặc địa điểm tham quan. Nếu một ref đã mô tả cả ngày, chỉ chọn MỘT lần, không lặp lại ở sáng/chiều/tối và không ép đủ 3 buổi. Bữa ăn/nghỉ ngơi/di chuyển không có địa điểm cụ thể được lặp tên ở các ngày khác nhau, dùng các ref nguồn khác nhau. Thư giãn tối đa 3 hoạt động/ngày, còn lại tối đa 6. Các buổi theo thứ tự morning, afternoon, evening. Được để ngày trống nếu thiếu dữ liệu, không bịa. Ưu tiên giữ thứ tự lịch trình nguồn và nhóm địa điểm cùng tour. Luôn tạo lịch theo ngày khách yêu cầu dù ngày đó xa, không trùng tour hoặc chưa có dự báo. Thiếu thời tiết KHÔNG phải lý do để từ chối lập lịch. Chỉ điều chỉnh vì mưa khi có dự báo đúng ngày. Không tự suy luận khoảng cách.", parameters, {
      constraints, preferences: request.prompt, resolvedPreferences: preferences, weather,
      planningRules: { maxActivitiesPerDay: dailyActivityLimit(constraints.style), distribution: "Ưu tiên phân bổ hoạt động cho các ngày trước khi dồn nhiều hoạt động vào một ngày. Không để ngày đầu quá dày, ngày sau trống nếu vẫn có nguồn để phân bổ. Ưu tiên sở thích còn hiệu lực, không khôi phục điều khách đã bỏ. Hạn chế tham quan lại cùng địa điểm ở các ngày khác nhau trừ khi khách muốn. Không tự thêm bữa ăn/khách sạn nếu không có ref. Không gán giờ mở cửa, khoảng cách, di chuyển hay tính phù hợp cho gia đình khi nguồn chưa xác nhận. Khi thiếu nguồn, để trống và báo rõ thay vì bịa hoặc lặp địa điểm cho đủ." },
      stops: Array.from(refs.values()).sort((a, b) => preferenceScore(preferences, `${b.stop.title} ${b.stop.content}`) - preferenceScore(preferences, `${a.stop.title} ${a.stop.content}`)).map(({ ref, tour, guide, sourceDay, stop }) => ({ ref, sourceName: (tour?.name ?? guide!.source.name).slice(0, 200), sourceDay, sourceType: guide ? "external_guide" : "tour", type: stop.type, title: stop.title.slice(0, 200), placeName: stop.placeName?.slice(0, 200), content: stop.content.slice(0, 500) })),
    }, signal);
    progress?.("validating");
    const selection = selectedPlan.safeParse(raw);
    if (!selection.success) throw new PlannerAIError("ai_invalid_output");
    const days = resolveSelection(selection.data, constraints, refs);
    const warnings = ["Đây là lịch trình gợi ý từ tour nguồn, chưa phải đặt tour hoặc xác nhận dịch vụ.", "Chưa có giá riêng cho từng hoạt động, lưu trú, ăn uống và di chuyển; chưa thể tính tổng chi phí hoặc xác nhận chuyến đi nằm trong ngân sách.", "Các buổi là đề xuất. Chưa xác minh giờ mở cửa, khoảng cách và thời gian di chuyển."];
    if (env.CATALOG_SOURCE === "snapshot") warnings.push("Đang dùng catalog local để thử nghiệm; cần rà soát dữ liệu nguồn trước khi đi thực tế.");
    if (days.some((d) => !d.activities.length)) warnings.push("Một số ngày chưa đủ dữ liệu hoạt động; cần bổ sung trước khi sử dụng.");
    if (preferences.excluded.length) warnings.push(`Đã lọc hoạt động có tên/địa điểm khớp trải nghiệm bạn bỏ: ${preferences.excluded.join(", ")}. Bộ lọc từ khóa chưa xác minh mọi nội dung chi tiết của tour nguồn.`);
    if (preferences.notes) warnings.push("Bạn có nhu cầu gia đình hoặc hạn chế di chuyển. Cần xác minh điều kiện tham quan, bậc thang và khả năng tiếp cận trực tiếp trước khi đi.");
    if (days.some((d) => d.activities.some((a) => a.source.tourId !== null && a.source.needsReview))) warnings.push("Có nội dung tour nguồn đang chờ quản trị viên rà soát.");
    if (days.some((d) => d.activities.some((a) => "url" in a.source))) warnings.push("Có điểm tham khảo từ website ngoài; cần xác minh lại giá vé, giờ mở cửa và điều kiện tham quan trước khi đi.");
    return { status: "ready" as const, generatedAt: new Date(now).toISOString(), constraints, days, weather, budget: { totalBudgetVnd: String(constraints.budgetVnd), itineraryTotalVnd: null, complete: false }, packageQuotes: quotes, warnings,
      evidence: { ai: "responded" as const, model: env.AI_MODEL, tools: ["search_tours", "build_itinerary"], catalogSource: env.CATALOG_SOURCE, modelCalls: complete ? 1 : 2 } };
  };
}
export const generatePlan = createPlannerService({ ai: createPlannerAI({ baseURL: env.AI_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL }), catalog: loadCatalog, weather: createWeatherTool(env.WEATHER_API_KEY), guides: loadGuides });
