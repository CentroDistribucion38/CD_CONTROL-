import type { Metadata, Viewport } from "next";
import { RegistrarSW } from "@/components/RegistrarSW";
import "./globals.css";

export const metadata: Metadata = {
  /**
   * El título de la ventana lo arma el navegador juntando el nombre de la
   * app (del manifest) con el título de la página. Si los dos dicen lo
   * mismo, no lo repite. Por eso los tres nombres van idénticos.
   */
  title: "CD38",
  description: "Plataforma modular de gestión operativa · Centro de Distribución 38",
  applicationName: "CD38",
  // Para que en iPhone/iPad "Agregar a pantalla de inicio" abra sin la
  // barra de Safari y con el nombre corto.
  appleWebApp: {
    capable: true,
    title: "CD38",
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
