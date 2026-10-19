"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ReadyPlan, TourSuggestion } from "@/lib/planner";
import { departureComparison, formatTripDate, groupDayActivities } from "@/lib/itinerary-presentation";

const money = (value: string | number) => `${new Intl.NumberFormat("vi-VN").format(Number(value))} ₫`;
const weatherMessages = {
  not_configured: "Dự báo thời tiết hiện chưa sẵn sàng. Bạn nên kiểm tra lại gần ngày đi.",
  outside_forecast: "Chưa có dự báo cho ngày đi. Bạn vẫn có thể tạo lịch trình và xem tour gần ngày đã chọn; thời tiết sẽ cần kiểm tra lại gần ngày đi.",
  unavailable: "Chưa lấy được thời tiết. Lịch trình chưa được kiểm tra theo dự báo.",
  available: "Dự báo chỉ áp dụng cho các ngày hiển thị bên dưới.",
};
function download(plan: ReadyPlan) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "pickyourway-itinerary.json"; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Itinerary({ plan, actions }: { plan: ReadyPlan; actions?: ReactNode }) {
  return <div className="space-y-5">
    <header className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-orange-50/50 p-6 text-emerald-950 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Lịch trình gợi ý</p>
      <h2 className="display-type mt-3 text-3xl">{plan.constraints.destination}</h2>
      <p className="mt-3 text-sm">{plan.constraints.days} ngày · {plan.constraints.people} người{plan.constraints.startDate ? ` · Từ ${formatTripDate(plan.constraints.startDate)}` : " · Chưa chọn ngày đi"}</p>
      <p className="mt-3 text-sm">Ngân sách nhóm: {money(plan.budget.totalBudgetVnd)}</p>
      {plan.manualEdit && <p className="mt-3 text-xs text-emerald-700">Đã chỉnh sửa thủ công {new Date(plan.manualEdit.updatedAt).toLocaleString("vi-VN")}</p>}
      <p className="mt-2 text-xs leading-6 text-emerald-800">Lịch trình tham khảo · Chi phí ăn, ở và di chuyển chưa được tính đầy đủ.</p>
      <details className="mt-4 text-xs text-emerald-800"><summary className="cursor-pointer">Tải bản dữ liệu lịch trình</summary><button className="mt-3 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-950" onClick={() => download(plan)}>Tải lịch trình JSON</button></details>
      {actions}
    </header>
    <nav aria-label="Chuyển nhanh đến ngày trong lịch trình" className="flex flex-wrap gap-2 rounded-2xl border border-stone-200 bg-white p-3">
      {plan.days.map((day) => <a key={day.dayNumber} href={`#itinerary-day-${day.dayNumber}`} className="rounded-2xl border border-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700">Ngày {day.dayNumber}{day.date && <span className="mt-1 block text-xs font-normal text-stone-500">{formatTripDate(day.date)}</span>}</a>)}
    </nav>
    {plan.days.map((day) => <section id={`itinerary-day-${day.dayNumber}`} key={day.dayNumber} className="scroll-mt-24 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-5 py-4"><h3 className="font-semibold text-emerald-950">Ngày {day.dayNumber}{day.date ? ` · ${formatTripDate(day.date)}` : ""}</h3><span className="text-xs text-stone-500">{day.activities.length} hoạt động gợi ý</span></header>
      {day.note && <p className="whitespace-pre-line px-5 pt-4 text-sm leading-6 text-emerald-900">Ghi chú: {day.note}</p>}
      <div className="space-y-5 p-4 sm:p-5">{groupDayActivities(day).map((period) => <section key={period.key} aria-label={`Ngày ${day.dayNumber} · ${period.label}`} className="rounded-xl border border-stone-100 p-4">
        <h4 className="flex items-center gap-2 font-semibold text-emerald-900"><span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">{period.symbol}</span>{period.label}<span className="ml-auto text-xs font-normal text-stone-500">{period.activities.length} hoạt động</span></h4>
        {!period.activities.length ? <p className="mt-3 text-sm leading-6 text-stone-500">Chưa có hoạt động được gợi ý cho buổi này. Bạn có thể dành thời gian nghỉ hoặc tự bổ sung kế hoạch.</p> : <ol className="mt-3 divide-y divide-stone-100">{period.activities.map((activity) => <li key={activity.ref} className="py-4 first:pt-0 last:pb-0">
          <h5 className="text-base font-semibold">{activity.title}</h5>
          {activity.placeName && <p className="mt-2 text-sm text-emerald-800">{activity.placeName}</p>}
          <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-stone-600">{activity.content}</p>
          {activity.note && <p className="mt-3 whitespace-pre-line text-sm text-emerald-900">Ghi chú: {activity.note}</p>}
          <p className="mt-3 text-xs leading-5 text-stone-500">Thời gian trong buổi là gợi ý · Chi phí riêng chưa xác nhận</p>
          {activity.source.url ? <a href={activity.source.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-emerald-800 underline">Nguồn tham khảo: {activity.source.tourName}{activity.source.checkedAt ? ` · Kiểm tra ${formatTripDate(activity.source.checkedAt)}` : ""}</a> : <Link href={`/explore/tours/${activity.source.tourId}`} className="mt-3 inline-block text-xs font-semibold text-emerald-800 underline">Nguồn: {activity.source.tourName} · Ngày {activity.source.dayNumber}</Link>}
        </li>)}</ol>}
      </section>)}</div>
    </section>)}
    <TourSuggestions quotes={plan.packageQuotes} />
    <details className="rounded-xl border border-amber-200 bg-amber-50 p-5" open><summary className="cursor-pointer text-sm font-semibold">Thông tin cần xác nhận trước chuyến đi</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">{plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <h3 className="font-semibold">Thời tiết</h3><p className="mt-2 text-sm leading-6 text-stone-600">{weatherMessages[plan.weather.status]}</p>
      {plan.weather.days.length > 0 && <><p className="mt-3 text-xs text-stone-500">Địa điểm API trả về: {plan.weather.location}</p><div className="mt-3 grid gap-3 sm:grid-cols-3">{plan.weather.days.map((day) => <div key={day.date} className="rounded-xl bg-stone-50 p-4 text-sm"><p className="font-semibold">{day.date}</p><p className="mt-2">{day.condition}</p><p className="mt-2">{day.minC}–{day.maxC} °C · Mưa {day.rainChance}%</p></div>)}</div></>}
      <a className="mt-4 inline-block text-xs text-emerald-800 underline" href="https://www.weatherapi.com/" target="_blank" rel="noreferrer">Weather data by WeatherAPI.com</a>
    </section>
    <details className="text-xs leading-6 text-stone-500"><summary className="cursor-pointer">Thông tin tạo lịch trình</summary><p className="mt-2">AI đã phản hồi · Model: {plan.evidence.model} · Nguồn: {plan.evidence.catalogSource === "snapshot" ? "catalog local" : "PostgreSQL"} · {new Date(plan.generatedAt).toLocaleString("vi-VN")}</p></details>
  </div>;
}

export function TourSuggestions({ quotes }: { quotes: TourSuggestion[] }) {
  return <section className="rounded-2xl border border-emerald-200 bg-white p-6">
    <h3 className="text-lg font-semibold">Tour khởi hành gần ngày bạn chọn</h3>
    <p className="mt-2 text-sm leading-6 text-stone-600">Sắp theo độ gần ngày đi, gồm lịch sớm hoặc muộn hơn. Khi gần bằng nhau, ưu tiên lịch từ ngày bạn chọn trở đi. Đây là lịch tour thực tế; kế hoạch AI vẫn giữ ngày bạn yêu cầu.</p>
    {!quotes.length ? <p className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-stone-600">Chưa có lịch khởi hành đang mở phù hợp cho nhóm tại điểm đến này. Bạn vẫn có thể tham khảo kế hoạch AI, hoặc liên hệ để xác nhận lịch mới.</p> :
      <ol className="mt-4 space-y-4">{quotes.map((quote, index) => <li key={quote.departureId} className="rounded-xl bg-emerald-50 p-4">
        <p className="mb-2 text-xs font-semibold text-emerald-800">{index === 0 ? quote.requestedStartDate === null ? "Sắp khởi hành" : "Gần nhất" : `Lựa chọn ${index + 1}`} · {departureComparison(quote)}</p>
        <Link href={`/explore/tours/${quote.tourId}`} className="text-sm font-semibold text-emerald-900 underline">{quote.tourName}</Link>
        <dl className="my-3 grid gap-3 rounded-lg bg-white p-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-stone-500">Ngày bạn muốn đi</dt><dd className="mt-1 font-semibold">{quote.requestedStartDate ? formatTripDate(quote.requestedStartDate) : "Chưa chọn ngày"}</dd></div><div><dt className="text-xs text-stone-500">Tour khởi hành thực tế</dt><dd className="mt-1 font-semibold text-emerald-900">{formatTripDate(quote.startsOn)}</dd></div></dl>
        <p className="mt-2 text-sm">Kết thúc: {formatTripDate(quote.endsOn)} · {quote.durationDays} ngày</p>
        <p className="mt-2 text-sm">{quote.perPersonVnd !== null ? `${money(quote.perPersonVnd)}/người${quote.totalVnd !== null ? ` · Cả nhóm: ${money(quote.totalVnd)}` : " · Nhập số người để tính giá tour cho nhóm."}` : "Giá chưa được xác nhận VNĐ/người — cần liên hệ báo giá."}</p>
        <p className="mt-2 text-xs text-stone-600">{quote.availableSeats === null ? "Số chỗ chưa được xác nhận; cần kiểm tra trước khi đặt." : `Còn ${quote.availableSeats} chỗ theo dữ liệu hiện tại.`}</p>
        {quote.withinBudget !== null && <p className="mt-2 text-xs text-stone-600">{quote.withinBudget ? "Giá tour gốc trong ngân sách nhóm." : "Giá tour gốc vượt ngân sách nhóm."}</p>}
      </li>)}</ol>}
    <p className="mt-4 text-xs leading-6 text-stone-500">Giá tour gốc không phải tổng chi phí của lịch trình AI. Gợi ý này chưa giữ chỗ hoặc xác nhận đặt tour.</p>
  </section>;
}
