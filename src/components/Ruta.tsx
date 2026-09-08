"use client";

import { usePathname } from "next/navigation";
import { moduloPorRuta } from "@/modulos/registro";

/** Migas de pan de la barra: CONTROL › Módulo › Pantalla. */
export function Ruta() {
  const pathname = usePathname();
  const modulo = moduloPorRuta(pathname);
  const seccion = modulo?.secciones.find((s) => s.ruta === pathname);

  const flecha = (
    <svg className="sep" viewBox="0 0 24 24" fill="none" strokeWidth="2.2">
      <path d="M10 6l6 6-6 6" />
    </svg>
  );

  return (
    <div className="ruta">
      <span className="wm">CONTROL</span>
      {modulo && (
        <>
          {flecha}
          <span className="modulo">{modulo.nombre}</span>
        </>
      )}
      {seccion && (
        <>
          {flecha}
          <span className="hoja">{seccion.nombre}</span>
        </>
      )}
    </div>
  );
}
