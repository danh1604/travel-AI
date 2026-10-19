import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin-shell";
export const metadata: Metadata = { title: "Quản trị | PickYourWay" };
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell development={process.env.NODE_ENV !== "production"}>{children}</AdminShell>;
}
