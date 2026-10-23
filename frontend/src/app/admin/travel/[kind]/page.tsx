import { notFound } from "next/navigation";
import { AdminTravel } from "@/components/admin-travel";
import { isTravelKind } from "@/lib/travel";

export default async function AdminTravelPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isTravelKind(kind)) notFound();
  return <AdminTravel key={kind} kind={kind} />;
}
