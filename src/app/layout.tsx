import type { Metadata, Viewport } from "next";
import { RegistrarSW } from "@/components/RegistrarSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "CONTROL",
  description: "Plataforma modular de gestión operativa · Centro de Distribución 38",
  applicationName: "CONTROL",
  // Para que en iPhone/iPad "Agregar a pantalla de inicio" abra sin la
  // barra de Safari y con el nombre corto.
  appleWebApp: {
    capable: true,
    title: "CONTROL",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#04203F",
  width: "device-width",
  initialScale: 1,
  // La bodega usa el celular con guantes: que puedan hacer zoom si necesitan.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
