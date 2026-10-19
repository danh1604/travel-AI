import { notFound, redirect } from "next/navigation";

export default async function ApiLabPage({
  searchParams,
}: {
  searchParams: Promise<{ tourId?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tourId } = await searchParams;
  const initialTourId = typeof tourId === "string" ? tourId.slice(0, 100) : "";
  redirect(`/admin/tools${initialTourId ? `?${new URLSearchParams({ tourId: initialTourId })}` : ""}`);
}
