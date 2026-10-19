import { AdminTourContent } from "@/components/admin-tour-content";

export default async function TourContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminTourContent key={id} id={id} />;
}
