import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://umuemily.vercel.app"),
  title: "Umu Emily Grandchildren",
  description: "United by Blood, Strengthened by Love.",
  openGraph: {
    title: "Umu Emily Grandchildren",
    description: "United by Blood, Strengthened by Love.",
    url: "https://umuemily.vercel.app",
    siteName: "Umu Emily Grandchildren",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-whatsapp-bg text-slate-900 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
