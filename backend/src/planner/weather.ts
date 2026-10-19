import { z } from "zod";

export type WeatherResult = {
  status: "available" | "not_configured" | "outside_forecast" | "unavailable";
  location?: string;
  days: { date: string; condition: string; minC: number; maxC: number; rainChance: number }[];
};
const forecastSchema = z.object({
  location: z.object({ name: z.string(), country: z.string() }),
  forecast: z.object({ forecastday: z.array(z.object({ date: z.string(), day: z.object({
    mintemp_c: z.number(), maxtemp_c: z.number(), daily_chance_of_rain: z.coerce.number().min(0).max(100), condition: z.object({ text: z.string() }),
  }) })) }),
});
export const vietnamDate = (instant: number) => new Date(instant + 7 * 3600_000).toISOString().slice(0, 10);
export function createWeatherTool(key: string, request: typeof fetch = fetch, clock = Date.now) {
  const cache = new Map<string, { expires: number; data: WeatherResult }>();
  return async (destination: string, startDate: string | null, days: number, signal: AbortSignal): Promise<WeatherResult> => {
    const empty = (status: WeatherResult["status"]): WeatherResult => ({ status, days: [] });
    if (!key) return empty("not_configured");
    const today = vietnamDate(clock());
    const offset = startDate ? (Date.parse(startDate) - Date.parse(today)) / 86400_000 : -1;
    if (offset < 0 || offset > 2) return empty("outside_forecast");
    const cacheKey = `${today}:${destination.toLocaleLowerCase("vi")}`;
    const cached = cache.get(cacheKey);
    let data = cached && cached.expires > clock() ? cached.data : undefined;
    if (!data) {
      try {
        const url = new URL("https://api.weatherapi.com/v1/forecast.json");
        url.search = new URLSearchParams({ key, q: destination, days: "3", lang: "vi", aqi: "no", alerts: "no" }).toString();
        const response = await request(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) return empty("unavailable");
        const raw = forecastSchema.parse(await response.json());
        data = { status: "available", location: `${raw.location.name}, ${raw.location.country}`, days: raw.forecast.forecastday.map(({ date, day }) => ({ date, condition: day.condition.text, minC: day.mintemp_c, maxC: day.maxtemp_c, rainChance: day.daily_chance_of_rain })) };
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { expires: clock() + 30 * 60_000, data });
      } catch { return empty("unavailable"); }
    }
    const end = new Date(Date.parse(startDate!) + (days - 1) * 86400_000).toISOString().slice(0, 10);
    const matching = data.days.filter((day) => day.date >= startDate! && day.date <= end);
    return { ...data, status: matching.length ? "available" : "outside_forecast", days: matching };
  };
}
