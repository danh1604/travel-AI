import { API_URL, ApiError } from "./api";
export type AssistantReply = {
  answer: string; sources: { id: string; title: string; url: string; kind: string; excerpt: string }[];
  mode: "ai" | "source" | "clarify" | "conversation"; followups: string[];
  planner: { destination: string; prompt: string; url: string } | null;
};
export async function askAssistant(message: string, history: string[], signal: AbortSignal): Promise<AssistantReply> {
  const response = await fetch(`${API_URL.replace(/\/$/, "")}/assistant/chat`, { method: "POST", cache: "no-store", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, history: history.slice(-4) }), signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) });
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body.code);
  return body.data;
}
export function assistantError(error: unknown) {
  if (error instanceof ApiError && error.status === 429) return "Trợ lý đang nhận nhiều yêu cầu. Bạn chờ một chút rồi thử lại nhé.";
  return "Chưa kết nối được trợ lý. Bạn có thể thử lại hoặc mở Planner để tạo lịch trực tiếp.";
}
