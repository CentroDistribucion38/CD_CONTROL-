"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { moduloPorRuta } from "@/modulos/registro";
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
      <main className="sh-main">{children}</main>
    </div>
  );
}
