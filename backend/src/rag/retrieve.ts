import { createHash } from "node:crypto";
export type KnowledgeDoc = { id: string; title: string; body: string; url: string; kind: "help" | "tour" | "guide" | "destination"; destinations: string[] };
export const normalize = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
const stopwords = new Set("toi minh muon di du lich la o co cho va the nao gi mot nhung ban khong cua voi duoc hay thi khi cach nen tai sao".split(" "));
export function tokens(text: string) { return (normalize(text).match(/[a-z0-9]+/g) ?? []).filter((v) => v.length > 1 && !stopwords.has(v)); }
export function expandQuery(text: string) {
  const q = normalize(text);
  const expansions: [RegExp, string][] = [[/beach|bien/, "bien beach"], [/food|an uong|am thuc/, "an uong food am thuc cho"], [/culture|van hoa|lich su/, "culture van hoa kien truc di san"], [/nature|thien nhien/, "nature thien nhien nui ho"], [/luu|save|chuyen di cua toi/, "luu save my trips"], [/khong biet|di dau|goi y|tu van/, "chon diem den bat dau goi y"], [/su dung|bat dau|huong dan/, "cach tao planner huong dan"], [/re hon|gia|ngan sach|chi phi/, "ngan sach gia chi phi"], [/mua|thoi tiet/, "thoi tiet du bao"], [/sua|doi ngay|chuyen hoat dong/, "chinh sua lich ngay"], [/tre em|gia dinh/, "family gia dinh"], [/thu gian|chill/, "relaxed thu gian"], [/hoi an/, "hoi an"], [/da nang/, "da nang"], [/phu quoc/, "phu quoc"], [/da lat/, "da lat"], [/hue/, "hue"]];
  return `${q} ${expansions.filter(([pattern]) => pattern.test(q)).map(([, value]) => value).join(" ")}`;
}
// Local feature hashing, not a paid semantic embedding model. Same version in index/query.
export const embeddingVersion = "lexical-hash-384-v2";
export function localEmbedding(text: string): number[] {
  const words = tokens(text), features = [...words, ...words.slice(1).map((w, i) => `${words[i]}_${w}`)];
  const vector = Array<number>(384).fill(0);
  for (const feature of features) { const hash = createHash("sha256").update(feature).digest(); vector[hash.readUInt32LE(0) % 384] += hash[4] & 1 ? 1 : -1; }
  const norm = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0));
  if (!norm) vector[0] = 1; else vector.forEach((v, i) => { vector[i] = Number((v / norm).toFixed(7)); });
  return vector;
}
export function lexicalRanking(docs: KnowledgeDoc[], query: string) {
  const terms = [...new Set(tokens(expandQuery(query)))];
  const corpus = docs.map((doc) => tokens(`${doc.title} ${doc.title} ${doc.body} ${doc.destinations.join(" ")}`));
  const avg = corpus.reduce((sum, words) => sum + words.length, 0) / Math.max(docs.length, 1);
  const frequencies = new Map(terms.map((term) => [term, corpus.filter((words) => words.includes(term)).length]));
  return docs.map((doc, index) => {
    const words = corpus[index]; let score = 0;
    for (const term of terms) { const tf = words.filter((w) => w === term).length; if (!tf) continue; const df = frequencies.get(term)!; score += Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)) * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * words.length / Math.max(avg, 1))); }
    return { doc, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));
}
