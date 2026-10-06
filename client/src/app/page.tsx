export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-700">PickYourWay AI</p>
      <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-6xl">Chuyến đi theo cách của bạn.</h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Khám phá điểm đến, lên lịch trình cá nhân hóa và quản lý ngân sách cho chuyến đi tiếp theo.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ["Explore", "Khám phá điểm đến và dịch vụ du lịch."],
          ["AI Planner", "Lên kế hoạch từ nhu cầu của bạn."],
          ["My Trips", "Lưu và quản lý các chuyến đi."],
        ].map(([title, description]) => (
          <section key={title} className="rounded-2xl border border-emerald-100 bg-white p-6">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm text-slate-500">Các tính năng đang được xây dựng.</p>
    </main>
  );
}
