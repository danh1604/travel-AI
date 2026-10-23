import { DestinationDetailView } from "@/components/destination-detail";

export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DestinationDetailView slug={slug} />;
}
