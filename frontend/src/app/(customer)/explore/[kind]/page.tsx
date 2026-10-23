import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ServiceBrowser } from "@/components/service-browser";
import { isServiceKind } from "@/lib/travel";

export default async function ExploreServicesPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isServiceKind(kind)) notFound();
  return <Suspense fallback={<p className="mx-auto max-w-7xl px-6 py-16" role="status">Đang tải…</p>}><ServiceBrowser kind={kind} /></Suspense>;
}
