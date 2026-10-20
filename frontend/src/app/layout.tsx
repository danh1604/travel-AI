import type { Metadata } from "next";
import { Be_Vietnam_Pro, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

const body = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const heading = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PickYourWay AI",
  description: "Lập kế hoạch du lịch theo cách của bạn.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${body.variable} ${heading.variable}`}>
      <body>
        {process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_URL?.trim() && <p role="status" className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-center text-sm leading-6 text-amber-900">Bản xem trước giao diện. Dữ liệu tour, tài khoản và AI sẽ hoạt động sau khi kết nối máy chủ.</p>}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
