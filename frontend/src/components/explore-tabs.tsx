import Link from "next/link";

const tabs = [
  { href: "/explore", label: "Tour", key: "tours" },
  { href: "/destinations", label: "Điểm đến", key: "destinations" },
  { href: "/explore/hotels", label: "Khách sạn", key: "hotels" },
  { href: "/explore/restaurants", label: "Nhà hàng", key: "restaurants" },
  { href: "/explore/attractions", label: "Điểm tham quan", key: "attractions" },
  { href: "/explore/transportations", label: "Phương tiện", key: "transportations" },
];
export function ExploreTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Loại dữ liệu khám phá" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} aria-current={tab.key === active ? "page" : undefined} className="admin-pill shrink-0 py-2 text-sm">
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
