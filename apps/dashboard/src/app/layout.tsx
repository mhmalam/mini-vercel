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
          <Link href="/" className="brand">
            mini-vercel
          </Link>
          <span className="tagline">control plane</span>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
