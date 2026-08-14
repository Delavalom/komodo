import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";

/**
 * The judgement flow is set in a serif so the prose reads like writing rather
 * than UI chrome. Exposed as --font-serif and picked up by `font-serif`.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Komodo — AI Code Review",
  description: "AI-powered PR reviews backed by real GitHub tokens",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
