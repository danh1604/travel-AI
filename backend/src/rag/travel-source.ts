import { getAuthRepository } from "../auth/repository.js";
import type { TravelKnowledge } from "./corpus.js";

let cache: { at: number; value: TravelKnowledge } | undefined;
/** Active destinations and services from the backend database, cached briefly because every chat turn rebuilds the corpus. */
export async function loadTravelKnowledge(ttlMs = 60_000): Promise<TravelKnowledge> {
  if (cache && Date.now() - cache.at < ttlMs) return cache.value;
  const repository = await getAuthRepository();
  const summaries = await repository.travelDestinations();
  const details = await Promise.all(summaries.map((d) => repository.travelDestination(d.slug)));
  const value = details.filter((d): d is NonNullable<typeof d> => Boolean(d)).map(({ destination, hotels, restaurants, attractions, transportations }) => ({ destination, hotels, restaurants, attractions, transportations }));
  cache = { at: Date.now(), value };
  return value;
}
