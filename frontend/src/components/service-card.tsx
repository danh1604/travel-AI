import Link from "next/link";
import { formatDuration, formatPrice, kindLabels, modeLabels, sourceLabels, type ServiceKind, type TravelItem } from "@/lib/travel";
import { Icon } from "./icon";

function facts(kind: ServiceKind, item: TravelItem): string[] {
  if (kind === "hotels") return [`Tối đa ${item.roomCapacity} khách`];
  if (kind === "attractions") return [formatDuration(item.durationMinutes ?? 0), item.isIndoor ? "Trong nhà" : "Ngoài trời"];
  if (kind === "transportations") return [modeLabels[item.mode ?? ""] ?? "", `Từ ${item.departure}`, formatDuration(item.durationMinutes ?? 0), `Tối đa ${item.capacity} người`];
  return item.foodOptions ?? [];
}
export function ServiceCard({ kind, item }: { kind: ServiceKind; item: TravelItem }) {
  const info = facts(kind, item);
  return (
    <article className="card flex flex-col p-6 transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <span className="icon-bubble"><Icon name={kindLabels[kind].icon} className="h-5 w-5" /></span>
        {item.source !== "INTERNAL" && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">{sourceLabels[item.source]}</span>}
      </div>
      <h2 className="mt-4 text-lg font-semibold leading-snug">{item.name}</h2>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-500">
        <Icon name="pin" className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <Link href={`/destinations/${item.destinationSlug}`} className="shrink-0 hover:text-emerald-700">{item.destinationName}</Link>
        {item.address ? <span className="truncate">· {item.address}</span> : null}
      </p>
      {item.description && <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">{item.description}</p>}
      {info.length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5 text-xs text-stone-600">{info.map((entry) => <li key={entry} className="rounded-full bg-stone-100 px-2.5 py-1">{entry}</li>)}</ul>}
      {!!item.tags?.length && <ul className="mt-2 flex flex-wrap gap-1.5 text-xs text-emerald-800">{item.tags.map((tag) => <li key={tag} className="rounded-full bg-emerald-50 px-2.5 py-1">#{tag}</li>)}</ul>}
      <div className="mt-auto border-t border-dashed border-stone-200 pt-4">
        <p className="mt-4 text-[11px] text-stone-500">{kind === "hotels" ? "Giá từ" : "Giá tham khảo"}</p>
        <p className="text-lg font-bold text-emerald-700">{formatPrice(item)}</p>
        {item.source === "DEMO" && <p className="mt-1 text-[11px] text-stone-400">Giá minh họa, chưa xác nhận với đơn vị cung cấp.</p>}
      </div>
    </article>
  );
}
