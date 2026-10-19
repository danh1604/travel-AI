import Link from "next/link";
export default function TourNotFound() {
  return <main className="mx-auto max-w-3xl px-6 py-24"><p className="eyebrow">CHUYẾN ĐI CHƯA CÓ SẴN</p><h1 className="display-type mt-4 text-4xl">Không tìm thấy tour này</h1><p className="mt-5 text-stone-600">Tour có thể đã ngừng hiển thị hoặc đường dẫn không còn hợp lệ.</p><Link className="button-primary mt-7 inline-flex" href="/explore">Khám phá các tour khác →</Link></main>;
}
