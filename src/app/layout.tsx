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
  /* EL ENLACE AL MANIFIESTO, ESCRITO A MANO aunque Next lo ponga solo
     cuando existe app/manifest.ts. Sin este enlace el navegador NO
     ofrece instalar, y es un fallo que no da error en ninguna parte: la
     app funciona perfecto y simplemente nunca se puede instalar.
     Dejarlo dicho aquí cuesta una línea y lo saca de la lista de cosas
     que hay que ir a verificar cada vez. */
  manifest: "/manifest.webmanifest",
  // Para que en iPhone/iPad "Agregar a pantalla de inicio" abra sin la
  // barra de Safari y con el nombre corto.
  appleWebApp: {
    capable: true,
    title: "CD38",
    statusBarStyle: "black-translucent",
  },
  /* EL ÍCONO DE «AÑADIR A PANTALLA DE INICIO» EN iPHONE Y iPAD.
     Safari NO lee los íconos del manifiesto: si no encuentra un
     apple-touch-icon, recorta una foto de la página y la deja como
     ícono. Queda una miniatura borrosa de la pantalla de acceso en el
     escritorio del celular. */
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
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
