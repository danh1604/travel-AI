import type { Metadata } from "next";
import { DestinationsList } from "@/components/destinations-list";

export const metadata: Metadata = { title: "Điểm đến | PickYourWay AI" };
export default function DestinationsPage() { return <DestinationsList />; }
