import type { MetadataRoute } from "next";

/**
 * Con esto el navegador ofrece "Instalar app" / "Agregar a pantalla de
 * inicio". Una vez instalada, CONTROL abre a pantalla completa, sin la
 * barra del navegador, como cualquier app del celular.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CD38",
    short_name: "CD38",
    description: "Plataforma operativa del CD38 — Bavaria BAQ",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#04203F",
    theme_color: "#04203F",
    lang: "es-CO",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
