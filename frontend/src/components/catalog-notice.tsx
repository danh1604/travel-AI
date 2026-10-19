import type { CatalogMeta } from "@/lib/explore";
import { formatDate } from "@/lib/explore";

export function CatalogNotice({ meta }: { meta: CatalogMeta }) {
  return (
    <aside className="flex gap-4 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/60 px-5 py-4 text-sm leading-6 text-amber-950">
      <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
        i
      </span>
      <div>
        <p className="font-semibold">
          {meta.developmentData
            ? "Bản dữ liệu phát triển"
            : "Thông tin chuyến đi"}
          {meta.developmentData && meta.generatedAt
            ? ` · Cập nhật ${formatDate(meta.generatedAt)}`
            : ""}
        </p>
        <p className="text-amber-900/80">
          Giá có nhãn “VNĐ/người · Đã xác nhận” đã được Admin rà soát đơn vị tính.
          Các giá nguồn còn lại cần được xác nhận với đơn vị tổ chức trước khi
          dùng để lập ngân sách. Số chỗ hiện được cập nhật thủ công.
        </p>
      </div>
    </aside>
  );
}
