const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
const topics = [
  { name: "biển", pattern: /\b(?:bien|beach)\b/ },
  { name: "leo núi", pattern: /\b(?:leo nui|trekking)\b/ },
  { name: "văn hóa", pattern: /\b(?:van hoa|di san|lich su)\b/ },
  { name: "thiên nhiên", pattern: /\b(?:thien nhien|nature)\b/ },
  { name: "ẩm thực", pattern: /\b(?:am thuc|an uong|food)\b/ },
  { name: "cà phê", pattern: /\b(?:ca phe|cafe|coffee)\b/ },
];

export function plannerPreferences(prompt: string) {
  const wanted = new Set<string>(), excluded = new Set<string>();
  for (const clause of fold(prompt).split(/[,;.!?]|\b(?:nhung|ma|thay vao do)\b/)) {
    for (const topic of topics) {
      const match = topic.pattern.exec(clause); if (!match) continue;
      const prefix = clause.slice(0, match.index);
      const negative = /\b(?:khong (?!biet\b|chi\b)(?:(?:muon|thich|di|chon|tham quan|co)\s+)*|tranh\s+|bo\s+)$/.test(prefix);
      if (negative) { wanted.delete(topic.name); excluded.add(topic.name); }
      else { excluded.delete(topic.name); wanted.add(topic.name); }
    }
  }
  // The chatbot's handoff explicitly labels discarded preferences; don't revive them.
  for (const match of fold(prompt).matchAll(/khong chon trai nghiem:\s*([^/.\n]*)/g)) {
    for (const topic of topics) if (topic.pattern.test(match[1])) { wanted.delete(topic.name); excluded.add(topic.name); }
  }
  return { wanted: [...wanted], excluded: [...excluded],
    notes: /\b(?:ba me|bo me|nguoi lon tuoi|tre nho|tre em|it di chuyen|it di bo)\b/.test(fold(prompt))
      ? "Khách nêu nhu cầu gia đình hoặc hạn chế di chuyển: ưu tiên lịch thoáng; chưa có bằng chứng về khả năng tiếp cận, không cam kết phù hợp thể lực hoặc trẻ nhỏ." : null };
}

export function preferenceScore(preferences: ReturnType<typeof plannerPreferences>, text: string) {
  return topics.filter((topic) => preferences.wanted.includes(topic.name) && topic.pattern.test(fold(text))).length;
}
export function excludedActivity(preferences: ReturnType<typeof plannerPreferences>, title: string) {
  return topics.some((topic) => preferences.excluded.includes(topic.name) && topic.pattern.test(fold(title)));
}
export const dailyActivityLimit = (style: "relaxed" | "balanced" | "active") => ({ relaxed: 3, balanced: 4, active: 6 })[style];
