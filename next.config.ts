import type { NextConfig } from "next";

/**
 * La versión es el commit con el que Vercel construyó el sitio. Se hornea
 * en el paquete que corre en el navegador; /api/version la lee en vivo del
 * despliegue actual. Cuando las dos dejan de coincidir es que subimos algo
 * nuevo, y ahí aparece el botón de actualizar.
 */
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VERSION: VERSION,
  },
};

export default nextConfig;
