import { AdminDepartures } from "@/components/admin-departures";

export default async function DeparturesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminDepartures key={id} id={id} />;
}
