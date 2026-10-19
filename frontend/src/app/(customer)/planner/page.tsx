import { Planner } from "@/components/planner";
export default async function PlannerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const destination = typeof q.destination === "string" ? q.destination.slice(0, 100) : "";
  const prompt = typeof q.prompt === "string" ? q.prompt.slice(0, 2000) : "";
  return <Planner key={`${destination}:${prompt}`} initialDestination={destination} initialPrompt={prompt} />;
}
