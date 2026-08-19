import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Umu Emily Birthday Reminder",
  description: "Birthday reminder system for Umu Emily Grandchildren WhatsApp Group",
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
