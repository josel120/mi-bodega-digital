// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "../components/BottomNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mi Bodega Digital",
  description: "Cuaderno de ventas y fiados para bodegas",
  manifest: "/manifest.json",
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
      </body>
    </html>
  );
}
