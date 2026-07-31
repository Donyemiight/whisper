import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Whisper — Confidential Cross-Chain Settlement",
  description:
    "Sealed-bid dark pool for FXRP ↔ native XRP on Flare. Privacy by TEE. Verifiable on-chain.",
  openGraph: {
    title: "Whisper — Private Cross-Chain Settlement on Flare",
    description: "The first private FXRP↔XRP settlement layer. Built on Flare Confidential Compute.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark`}>
      <body className="min-h-screen bg-ink-950 text-zinc-200 antialiased">{children}</body>
    </html>
  );
}
