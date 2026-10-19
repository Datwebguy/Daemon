import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ContractsBanner } from "@/components/ContractsBanner";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { themeInitScript } from "@/components/ThemeProvider";
import "./globals.css";


export const metadata: Metadata = {
  title: "Daemon",
  description: "Turn your Chog into a yield-earning ERC-6551 account that anyone can compound and anyone can hype. Monad Testnet.",
};

export const viewport: Viewport = {
  themeColor: "#836ef9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <Providers>
          <Header />
          <ContractsBanner />
          <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-dim">
            Daemon on Monad Testnet (10143). No session keys, no executor, no admin over funds.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
