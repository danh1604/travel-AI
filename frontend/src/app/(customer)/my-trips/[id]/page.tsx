import { MyTrips } from "@/components/my-trips";
export default async function SavedTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MyTrips key={id} tripId={id} />;
}
