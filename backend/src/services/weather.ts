import { env } from "../config/env.js";

export const weatherConfig = {
  provider: env.WEATHER_PROVIDER,
  baseURL: "https://api.weatherapi.com/v1",
  apiKey: env.WEATHER_API_KEY,
};

// Forecast integration and cache will be added with the weather module.
