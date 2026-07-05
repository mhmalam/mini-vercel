import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

// Geist — Vercel's own typeface. For a project called mini-vercel, wearing
// the real thing's font is the point.
const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

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
      <head>
        {/* set the theme before first paint — no flash of the wrong mode */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`,
          }}
        />
      </head>
      <body>
        <header className="site">
          <div className="site-inner">
            <Link href="/" className="brand">
              mini-vercel
            </Link>
            <span className="tagline">control plane</span>
            <span className="site-side">single-box PaaS · self-hosted</span>
            <ThemeToggle />
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
