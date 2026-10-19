import { readFileSync } from "node:fs";
import { z } from "zod";
import { normalize } from "./retrieve.js";

export const conversationKnowledge = z.object({
  greeting: z.string(), thanks: z.string(), farewell: z.string(), identity: z.string(), acknowledge: z.string(),
  followups: z.array(z.string()).max(3),
  styleExamples: z.array(z.object({ user: z.string(), assistant: z.string() })),
}).parse(JSON.parse(readFileSync(new URL("../../resources/conversation-knowledge.json", import.meta.url), "utf8")));

// Match whole social messages only: "chào bạn, mình muốn đi Huế" is a travel query.
export function socialIntent(message: string) {
  const text = normalize(message).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:(?:xin )?chao(?: ban| em| anh| chi| ad| bot)?|hello(?: ban| there)?|hi(?: ban)?|helo|alo|hey)(?: nhe| nha| a| oi)*$/.test(text)) return "greeting";
  if (/^(?:(?:cam on|camon)(?: ban| nhieu| rat nhieu| bot)?|thanks?(?: you)?|thank you|thank you so much)(?: nhe| nha| a)*$/.test(text)) return "thanks";
  if (/^(?:tam biet(?: ban)?|bye(?: bye)?|hen gap lai)(?: nhe| nha| a)*$/.test(text)) return "farewell";
  if (/^(?:ban la ai|ban ten (?:la )?gi|ban (?:co the )?(?:lam|giup) duoc gi|gioi thieu (?:ve )?ban)(?: nhi| nhe| a)*$/.test(text)) return "identity";
  if (/^(?:ok(?:ay)?|oke|oki|duoc(?: roi)?|dong y|vang|uh|um|da)(?: nhe| nha| a)*$/.test(text)) return "acknowledge";
  return null;
}

const interestNames = ["biển", "thiên nhiên", "văn hóa", "ẩm thực", "nghỉ dưỡng", "cà phê", "leo núi"];
const numberWords: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
const clauses = (text: string) => normalize(text).split(/[,;.!?]|\b(?:nhung|ma|thay vao do|con|minh muon|toi muon|doi sang|chuyen sang)\b/).map((part) => part.trim()).filter(Boolean);
function negated(part: string, at: number) {
  const prefix = part.slice(0, at);
  return /\b(?:khong (?!biet\b|ro\b|chi\b|nhung\b)|chang\s|bo (?!me\b)|tranh\s|chan\s|huy\s)/.test(prefix);
}

// Bounded, request-local preference state. It is not travel evidence or a user profile.
export function conversationContext(history: string[], message: string, destinations: string[] = []) {
  const messages = [...history, message].filter((text) => !socialIntent(text));
  const interests = new Set<string>(), excludedInterests = new Set<string>(), excludedDestinations = new Set<string>();
  let destination: string | null = null, comparison: string[] = [];
  let days: number | null = null, people: number | null = null;
  let style: string | null = null, companions: string | null = null, budget: string | null = null;
  for (const text of messages) {
    const normalized = normalize(text);
    const parts = clauses(text);
    if (/\b(?:bat dau lai|lam lai tu dau|bo het nhu cau cu)\b/.test(normalized)) {
      interests.clear(); excludedInterests.clear(); excludedDestinations.clear();
      destination = null; comparison = []; days = people = null; style = companions = budget = null;
    }
    if (/\b(?:doi diem den|noi khac|bo diem den cu|khong di nua)\b/.test(normalized)) {
      if (destination) excludedDestinations.add(destination);
      destination = null; comparison = [];
    }
    const positiveDestinations: string[] = [];
    for (const part of parts) {
      for (const match of part.matchAll(/\b(\d{1,2}|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\s*(ngay|nguoi|khach)\b/g)) {
        if (negated(part, match.index!)) continue;
        const value = Number(match[1]) || numberWords[match[1]];
        if (match[2] === "ngay" && value >= 1 && value <= 14) days = value;
        if (match[2] !== "ngay" && value >= 1 && value <= 50) people = value;
      }
      for (const name of interestNames) {
        const at = part.indexOf(normalize(name));
        if (at < 0) continue;
        if (negated(part, at)) { interests.delete(name); excludedInterests.add(name); }
        else { interests.add(name); excludedInterests.delete(name); }
      }
      const mentions = destinations.map((name) => ({ name, at: part.indexOf(normalize(name)) })).filter(({ at }) => at >= 0).sort((a, b) => a.at - b.at);
      for (const { name, at } of mentions) {
        if (negated(part, at)) {
          excludedDestinations.add(name); if (destination === name) destination = null;
          comparison = comparison.filter((d) => d !== name);
        } else {
          excludedDestinations.delete(name); destination = name; positiveDestinations.push(name);
        }
      }
      if (/\b(?:thu gian|thong tha|nhe nhang|it di chuyen|nghi nhieu)\b/.test(part)) style = negated(part, part.length) ? null : "thư giãn, ít di chuyển";
      else if (/\b(?:nhieu hoat dong|nang dong|di nhieu)\b/.test(part)) style = negated(part, part.length) ? null : "nhiều trải nghiệm";
      if (/\b(?:ba me|bo me|nguoi lon tuoi)\b/.test(part) && !negated(part, part.length)) companions = "đi cùng ba mẹ/người lớn tuổi";
      if (/\b(?:tre nho|tre em|em be)\b/.test(part) && !negated(part, part.length)) companions = "đi cùng trẻ nhỏ";
      const amount = part.match(/\b\d[\d.,]*\s*(?:trieu|nghin|vnd|dong)\b/);
      if (amount && !negated(part, amount.index!)) budget = amount[0];
    }
    if (positiveDestinations.length) comparison = positiveDestinations.length > 1 && /\b(?:so sanh|hay|hoac|giua)\b/.test(normalized) ? [...new Set(positiveDestinations)] : [];
    if (comparison.length > 1) destination = null;
  }
  const preferences = [destination ? `Điểm đến: ${destination}` : null, comparison.length ? `Đang cân nhắc: ${comparison.join(", ")}` : null,
    days ? `${days} ngày` : null, people ? `${people} người` : null, interests.size ? `Bạn thích ${[...interests].join(", ")}` : null,
    style ? `Nhịp độ: ${style}` : null, companions, budget ? `Ngân sách khách nêu: ${budget}` : null,
    excludedInterests.size ? `Không chọn trải nghiệm: ${[...excludedInterests].join(", ")}` : null,
    excludedDestinations.size ? `Không chọn điểm đến: ${[...excludedDestinations].join(", ")}` : null].filter((item): item is string => Boolean(item));
  const readyToRecommend = Boolean(days && (destination || interests.size || comparison.length));
  const nextQuestion = !interests.size && !destination && !comparison.length ? "Bạn thích ngắm thiên nhiên, khám phá văn hóa hay nghỉ ngơi thư giãn hơn?"
    : !days ? "Bạn dự định đi khoảng mấy ngày?" : !people ? "Chuyến này bạn đi mấy người nhỉ?"
    : !style ? "Bạn thích lịch thong thả hay muốn trải nghiệm nhiều hoạt động hơn?" : "Bạn muốn mình gợi ý lựa chọn phù hợp rồi cùng mở Planner nhé?";
  const cleanCurrent = clauses(message).filter((part) => !negated(part, part.length)).join(" ");
  const travelContext = [destination, ...comparison, interests.size ? `thích ${[...interests].join(" ")}` : null, style, companions].filter(Boolean).join(" ");
  // Product questions keep their exact query; travel followups use only still-active preferences.
  const isHelp = /\b(?:cach|luu|dang nhap|dang ky|mat khau|nut|su dung|thoi tiet|gia ve|gia tour|gia phong)\b/.test(normalize(message));
  return { days, people, destination, comparison, interests: [...interests], excludedInterests: [...excludedInterests], excludedDestinations: [...excludedDestinations],
    style, companions, budget, preferences, readyToRecommend, nextQuestion,
    retrievalQuery: isHelp ? message : `${cleanCurrent} ${travelContext}`.trim() || "chọn điểm đến tư vấn",
  };
}
