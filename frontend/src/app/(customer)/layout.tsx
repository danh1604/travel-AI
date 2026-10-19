import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { AssistantWidget } from "@/components/assistant-widget";
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <><AppShell>{children}</AppShell><AssistantWidget /></>;
}
