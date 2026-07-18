import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "OptiDoerApp — Notes · Calendar · Reminders",
  description: "Notes + Calendar + Reminders, with AI natural-language event creation (MVP).",
  manifest: "/manifest.webmanifest",
  applicationName: "OptiDoer",
  appleWebApp: {
    capable: true,
    title: "OptiDoer",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#3366f5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
