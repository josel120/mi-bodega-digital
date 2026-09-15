// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "../components/BottomNav";
import ServiceWorkerRegister from "../components/ServiceWorkerRegister";

const inter = Inter({ subsets: ["latin"] });

// En producción la app vive bajo /mi-bodega-digital en GitHub Pages.
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Mi Bodega Digital",
  description: "Cuaderno de ventas y fiados para bodegas",
  applicationName: "Mi Bodega Digital",
  manifest: `${BP}/manifest.json`,
  icons: {
    icon: [
      { url: `${BP}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${BP}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: `${BP}/icons/apple-touch-icon.png`, sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Mi Bodega Digital",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {/* Contenido de la página */}
        {children}

        {/* Navegación Inferior Móvil */}
        <BottomNav />

        {/* Instalación y arranque sin internet */}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
