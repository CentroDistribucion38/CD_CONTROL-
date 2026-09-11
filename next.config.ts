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
  /* El export de Sider ABRE public/plantillas/sider.xlsx en el servidor.
     Vercel solo empaqueta los archivos que ve importados, y una ruta
     armada con path.join no se ve: sin esto la exportación revienta en
     producción y funciona en local, que es la peor combinación. */
  outputFileTracingIncludes: {
    "/api/sider/exportar": ["./public/plantillas/**", "./public/marca/**"],
  },

  /* CUÁNTO LE DURA AL NAVEGADOR LO QUE YA TRAJO.
     Todas las pantallas consultan en vivo (force-dynamic), y para esas
     Next guarda CERO por defecto: volver a una sección que se acaba de
     mirar la vuelve a pedir entera al servidor, y adelantarla al pasar
     el mouse no servía de nada porque lo adelantado se botaba antes de
     usarlo.

     Treinta segundos es la ventana de ir y volver —entro a Seguimiento,
     miro, vuelvo a Certificar—, no la de quedarse. Pasados los treinta
     se vuelve a consultar sola.

     Y no deja ver datos viejos después de escribir: cada pantalla que
     guarda algo llama a router.refresh(), que bota esta memoria. Lo que
     alcanza a quedar guardado es lo que uno acaba de VER, no lo que
     acaba de cambiar. */
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
