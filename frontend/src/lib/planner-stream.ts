import { ApiError } from "./api";
import type { PlannerResult } from "./planner";
export type PlannerStage = "understanding" | "searching" | "weather" | "building" | "validating" | "saving";
export const plannerStageLabels: Record<PlannerStage, string> = {
  understanding: "Đang đọc nhu cầu của bạn", searching: "Đang tìm tour và điểm tham khảo phù hợp", weather: "Đang kiểm tra dự báo cho ngày đi", building: "AI đang sắp xếp hoạt động theo ngày", validating: "Đang kiểm tra nguồn và lịch trình", saving: "Đang chuẩn bị bản nháp để bạn lưu",
};
export async function readPlannerStream(body: ReadableStream<Uint8Array>, onProgress?: (stage: PlannerStage) => void): Promise<PlannerResult> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = "", result: PlannerResult | undefined, bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > 2_000_000) throw new Error("Planner response too large");
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = event.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n");
        if (!data) continue;
        const parsed = JSON.parse(data);
        if (parsed.type === "error") throw new ApiError(503, parsed.code);
        if (parsed.type === "progress" && parsed.stage in plannerStageLabels) onProgress?.(parsed.stage);
        if (parsed.type === "result" && ["ready", "needs_input", "no_data"].includes(parsed.data?.status)) result = parsed.data;
      }
    }
    if (!result) throw new Error("Planner response incomplete");
    return result;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
