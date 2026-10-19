import { createAIClient } from "@pickyourway/ai-services";
import { env } from "../config/env.js";

export function getAIClient() {
  if (!env.AI_BASE_URL || !env.AI_API_KEY || !env.AI_MODEL) {
    throw new Error("Configure AI_BASE_URL, AI_API_KEY and AI_MODEL before using AI features.");
  }
  return createAIClient({ baseURL: env.AI_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL });
}
