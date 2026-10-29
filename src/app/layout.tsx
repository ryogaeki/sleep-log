import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./analysis.css";
export const metadata: Metadata = { title: "Sleep Log — わたしの睡眠記録", description: "夜の睡眠も、昼寝も、寝落ちも。いつでも何回でも、あなたのペースで残せる睡眠記録。", icons:{icon:`${process.env.NEXT_PUBLIC_BASE_PATH??""}/icon.svg`}, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f8fc" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="ja"><body><a href="#main-content" className="skip-link">本文へ移動</a>{children}</body></html>; }
