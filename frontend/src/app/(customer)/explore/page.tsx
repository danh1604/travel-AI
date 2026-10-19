import { Suspense } from "react";
import ExploreClient from "./explore-client";
export default function ExplorePage() {
  return <Suspense fallback={<p className="mx-auto max-w-6xl px-6 py-16" role="status">Đang tải danh sách tour…</p>}><ExploreClient /></Suspense>;
}
