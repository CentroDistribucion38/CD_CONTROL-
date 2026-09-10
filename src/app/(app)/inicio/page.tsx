import Link from "next/link";
import { misPermisos, entradaDe } from "@/lib/permisos";
import { PieApp } from "@/components/PieApp";

export const dynamic = "force-dynamic";

/**
 * Portada: el selector de módulos. Es lo primero que ve la gente al entrar,
 * así que no lleva menú lateral ni resúmenes — solo las puertas de entrada,
 * grandes y sin que haya que leer nada para saber dónde tocar.
 *
 * Los módulos salen de src/modulos/registro.ts; aquí no hay ninguna lista
 * escrita a mano.
 */
export default async function PortadaPage() {
  /* Los módulos que este rol puede ver: si no puede entrar a ninguna de
     sus pantallas, la tarjeta no se dibuja. Antes se leía el rol aquí y
     se comparaba contra una lista en el código; ahora los permisos son
     datos y se resuelven en un solo sitio. */
  const permisos = await misPermisos();
  const modulos = permisos.modulos;

  return (
    <div className="sh-portada">
      <div className="sh-titulo">
        <h1>Selecciona el módulo con el que vas a trabajar</h1>
        <p className="sh-firma">Centro de Distribución 38 · Bavaria BAQ</p>
      </div>

      <div className={"sh-mosaico" + (modulos.length === 1 ? " uno" : "")}>
        {modulos.map((m) => {
          // Si no se definieron etiquetas, se muestran las primeras secciones.
          const etiquetas =
            m.etiquetas ?? m.secciones.slice(0, 2).map((s) => s.nombre);

          return (
            <Link
              key={m.id}
              /* No m.ruta: cada módulo decide con qué pantalla se abre, y
                 entradaDe() comprueba que esta persona pueda verla. */
              href={entradaDe(m, permisos)}
              className="sh-modulo"
              style={
                {
                  /* El color del módulo, con el del tema por delante. El
                     registro queda como RESPALDO: un módulo nuevo que
                     nadie haya pintado en globals.css se ve fuera de
                     tono, no invisible. */
                  "--acento": `var(--c-mod-${m.id}, ${m.acento})`,
                  /* La flecha va emparejada con el color, no calculada
                     aquí: desde que el color lo pone el tema, este código
                     ya no sabe cuál es y adivinaría. El oro es claro y
                     una flecha blanca encima no se lee. */
                  "--flecha": `var(--c-mod-${m.id}-txt, ${
                    esClaro(m.acento) ? "#04203F" : "#fff"
                  })`,
                } as React.CSSProperties
              }
            >
              <div className="sh-riel" />
              <div className="sh-cinta" />
              <div className="sh-codigo">{m.eyebrow}</div>
              <h2>{m.nombre}</h2>

              {etiquetas.length > 0 && (
                <div className="sh-datos">
                  {etiquetas.map((e) => (
                    <span key={e}>{e}</span>
                  ))}
                </div>
              )}

              <div className="sh-abrir">
                Abrir módulo
                <i>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12h13M12 5l7 7-7 7" />
                  </svg>
                </i>
              </div>
            </Link>
          );
        })}
      </div>

      <PieApp />
    </div>
  );
}

/** Luminancia aproximada, para decidir el color de la flecha. */
function esClaro(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}
