import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cookies } from "next/headers";
import { COOKIE_TEMA, leerTema } from "@/lib/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Control de Seguros · Mary Iancarina",
    template: "%s · Mary Iancarina",
  },
  description: "Control de seguros, activos y siniestros — Mary Iancarina, C.A.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const tema = leerTema((await cookies()).get(COOKIE_TEMA)?.value);
  return (
    <html lang="es" data-tema={tema === "sistema" ? undefined : tema} className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
