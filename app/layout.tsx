import type { Metadata, Viewport } from "next";
import { Onest, Golos_Text, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

// «Каданс» type system — headings Onest, body Golos Text, numbers JetBrains
// Mono. All variable fonts (one woff2 each) with latin+cyrillic subsets.
const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-heading",
  display: "swap",
});
const golos = Golos_Text({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AD Pulse — Система учёта материалов",
  description: "B2B система управления и учёта материалов",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AD Pulse",
    startupImage: "/icon-512.png",
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0A0C10",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="icon" href="/icon-192.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/icon-192.png" sizes="192x192" />
      </head>
      <body className={`${onest.variable} ${golos.variable} ${jetbrains.variable} antialiased overflow-x-hidden`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
