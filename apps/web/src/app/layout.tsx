import type { Metadata } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import { StoreHydration } from "@/lib/data/store";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Komodo",
    template: "%s | Komodo",
  },
  description: "Your team's pull request review queue",
};

/** Sets data-theme before first paint so a reload never flashes. SPEC §1.3. */
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);else document.documentElement.setAttribute("data-theme","dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${dmSans.variable} ${dmMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* No fixed height here: the app group re-imposes it. */}
      <body>
        <StoreHydration />
        {children}
      </body>
    </html>
  );
}
