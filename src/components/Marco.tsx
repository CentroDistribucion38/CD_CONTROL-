"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { moduloPorRuta, seccionExacta } from "@/modulos/registro";
import { Navegacion } from "./Navegacion";

/**
 * Cuerpo de la app: el riel de módulos a la izquierda y el contenido a la
 * derecha.
 *
 * El riel vive colapsado en 64px y se abre al pasar el mouse. Quien trabaja
 * todo el turno en la misma pantalla puede anclarlo: la elección se guarda
 * en el navegador del equipo, no en el perfil, porque es propia de ESE
 * equipo — el monitor grande de la oficina y la tablet de piso no piden lo
 * mismo aunque entre la misma persona.
 */
export function Marco({ permitidas, children }: {
  /** Las rutas que esta persona puede ver, resueltas en el layout. */
  permitidas: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hayModulo = !!moduloPorRuta(pathname);
  /* UNA PANTALLA CERRADA NO SE ABRE ESCRIBIENDO LA DIRECCIÓN. El menú
     esconde lo que no toca, pero la dirección se puede teclear o venir de
     un enlace guardado, y la mayoría de pantallas no revisan el permiso
     por su cuenta. Aquí, en el cuerpo que envuelve a todas, se dice que
     no es para su rol. (Quien protege los DATOS sigue siendo la base.) */
  const cerrada = (() => {
    const e = seccionExacta(pathname);
    if (!e || permitidas.includes(e.seccion.ruta)) return null;
    const otra = e.modulo.secciones.find((x) => !x.oculto && permitidas.includes(x.ruta));
    return { nombre: e.seccion.nombre, modulo: e.modulo.nombre, otra };
  })();
  const [anclado, setAnclado] = useState(false);

  useEffect(() => {
    try {
      setAnclado(localStorage.getItem("cd38.menu.anclado") === "si");
    } catch {
      // Navegador con el almacenamiento bloqueado: se queda sin anclar.
    }
  }, []);

  function alternar() {
    setAnclado((a) => {
      const n = !a;
      try { localStorage.setItem("cd38.menu.anclado", n ? "si" : "no"); } catch {}
      return n;
    });
  }

  return (
    <div className={"sh-marco" + (hayModulo ? "" : " sin-riel") + (anclado ? " anclado" : "")}>
      {hayModulo && <Navegacion permitidas={permitidas} anclado={anclado} alternar={alternar} />}
      <main className="sh-main">
        {cerrada ? (
          <section className="sh-cerrada" role="alert">
            <h1>Esta pantalla no es para tu rol</h1>
            <p>
              <b>{cerrada.modulo} · {cerrada.nombre}</b> la ve quien la tiene asignada en{" "}
              <b>Administración → Roles</b>. Si la necesitas, pídela ahí.
            </p>
            <div className="sh-cerrada-botones">
              {cerrada.otra && <Link href={cerrada.otra.ruta} className="btn-primario">Ir a {cerrada.otra.nombre}</Link>}
              <Link href="/inicio" className="btn-secundario">Volver al inicio</Link>
            </div>
          </section>
        ) : children}
      </main>
    </div>
  );
}
