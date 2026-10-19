import { notFound } from "next/navigation";
import { ApiLab } from "./api-lab";
export default async function AdminToolsPage({ searchParams }: { searchParams: Promise<{ tourId?: string | string[] }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const tourId = typeof query.tourId === "string" ? query.tourId.slice(0, 100) : "";
  return <ApiLab key={tourId} initialTourId={tourId} />;
}
