import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import BrandSplash from "@/components/BrandSplash";

export const metadata: Metadata = {
  title: "AD Pulse — Система учёта материалов",
  description: "B2B система управления и учёта материалов",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AD Pulse",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#111111",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased overflow-x-hidden">
        <BrandSplash />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
