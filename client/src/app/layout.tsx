import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PickYourWay AI",
  description: "Lập kế hoạch du lịch theo cách của bạn.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
