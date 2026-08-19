import type { Metadata } from "next";
import {
  Anybody,
  DM_Mono,
  DM_Sans,
  Nanum_Pen_Script,
  Space_Mono,
} from "next/font/google";
import { StoreHydration } from "@/lib/data/store";
import "./globals.css";

/* The app half (docs/SPEC.md §1.1). */
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

/* The marketing half (docs/SPEC-MARKETING.md §M1.1). Anybody carries a width
   axis, which the poster wordmarks stretch — so it is requested explicitly. */
const anybody = Anybody({
  variable: "--font-anybody",
  subsets: ["latin"],
  axes: ["wdth"],
});
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});
const nanumPen = Nanum_Pen_Script({
  variable: "--font-nanum-pen",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: {
    default: "Greptile",
    template: "%s | Greptile",
  },
  description: "AI code review — frontend clone",
};

/** Sets data-theme before first paint so a reload never flashes. SPEC §1.3.
 *  Only the app half reads it; the marketing half is a fixed light palette. */
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);else document.documentElement.setAttribute("data-theme","dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${dmSans.variable} ${dmMono.variable} ${anybody.variable} ${spaceMono.variable} ${nanumPen.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* No fixed height here: the app group re-imposes it, the marketing
          group scrolls the document. docs/SPEC-MARKETING.md §M12.2. */}
      <body>
        <StoreHydration />
        {children}
      </body>
    </html>
  );
}
