import OpenAI from "openai";

export interface AIConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

// Called by the backend only; provider credentials never reach the frontend.
export function createAIClient(config: AIConfig): OpenAI {
  return new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, timeout: 30_000, maxRetries: 1 });
}

export interface TripConstraints {
  destination: string;
  departure?: string;
  startDate?: string;
  days: number;
  nights: number;
  people: number;
  totalBudget: number;
  interests: string[];
  travelStyle?: "relaxed" | "balanced" | "active";
}
