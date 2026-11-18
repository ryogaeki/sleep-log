import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./analysis.css";
import "./journal.css";
import "./refinements.css";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const rounded = localFont({ src: [{ path: "../../public/fonts/zen-maru-gothic-medium.woff2", weight: "500" }, { path: "../../public/fonts/zen-maru-gothic-bold.woff2", weight: "700" }], style: "normal", display: "swap", variable: "--font-rounded" });
export const metadata: Metadata = {
  title: "Sleep Log — 睡眠記録",
  description: "睡眠の日時・種類・ノートの記録と、睡眠時間の集計・分析。",
  icons: {
    icon: `${basePath}/icon.svg`,
    apple: [{ url: `${basePath}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f8fc" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="ja" className={rounded.variable}><body><a href="#main-content" className="skip-link">本文へ移動</a>{children}</body></html>; }
