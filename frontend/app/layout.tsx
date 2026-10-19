import type { Metadata, Viewport } from "next";
import { Bagel_Fat_One, Onest } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { themeInitScript } from "@/components/ThemeProvider";
import "./globals.css";

const display = Bagel_Fat_One({ subsets: ["latin"], weight: "400", variable: "--font-bagel", display: "swap" });
const body = Onest({ subsets: ["latin"], variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Daemon · a little spirit for every Chog", template: "%s · Daemon" },
  description:
    "Wake the Daemon inside your Chog. It saves, earns, sulks and celebrates, and it travels with your Chog wherever it goes. Live on Monad.",
  openGraph: {
    title: "Daemon · a little spirit for every Chog",
    description: "Wake the Daemon inside your Chog. It earns while you sleep, and anyone can cheer it on.",
    images: ["/media/hero-jelly.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#7a5af0",
  width: "device-width",
  initialScale: 1,
};

/** Marks the document as JS-capable so reveal-on-scroll elements start hidden (and stay visible without JS). */
const jsMarker = `document.documentElement.classList.add('js')`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: jsMarker }} />
      </head>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
