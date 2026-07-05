import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

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
    <html lang="en">
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
