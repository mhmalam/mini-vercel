import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "mini-vercel",
  description: "Control plane dashboard for the mini-vercel deploy platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header className="site">
          <div className="site-inner">
            <Link href="/" className="brand">
              mini-vercel
            </Link>
            <span className="tagline">control plane</span>
            <span className="site-side">single-box PaaS · self-hosted</span>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
