"use client";

/**
 * EXPORTAR — el botón.
 *
 * Es un enlace y no un fetch a propósito: el navegador sabe bajar
 * archivos, sabe mostrar el progreso y sabe dónde guardarlos. Armar el
 * blob en JavaScript para después provocar la descarga sería reimplantar
 * peor algo que ya funciona — y en el celular, además, tendría que caber
 * en memoria.
 *
 * Lo único que sí hace falta en JavaScript es AVISAR que está trabajando:
 * bajar veinte viajes con sus sesenta fotos toma segundos, y un botón que
 * no reacciona se toca tres veces.
 */

import { useEffect, useMemo, useState } from "react";
import { Rango, type Dia } from "./seguimiento/Rango";
import { mesCompleto } from "@/modulos/sider/comun";

export function BotonExportar({ mes: fijo, dias = [] }: {
  /** Un rango fijo, cuando quien llama ya sabe cuál (Seguimiento). */
  mes?: string;
  /** Los días que de verdad tienen viajes, para apagar los vacíos. */
  dias?: Dia[];
}) {
  /* EL RANGO ARRANCA EN EL ÚLTIMO MES CON DATOS, no en el mes de hoy.
     Con el mes de hoy, un 2 de octubre sin viajes todavía ofrecía
     exportar un archivo vacío. */
  const inicial = useMemo(() => {
    if (fijo) return mesCompleto(fijo);
    const ultimo = dias.length ? dias[dias.length - 1].fecha : null;
    if (!ultimo) {
      const h = new Date();
      return mesCompleto(`${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`);
    }
    return mesCompleto(ultimo.slice(0, 7));
  }, [fijo, dias]);

  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  /* "Todo el histórico" no es un rango: es la ausencia de uno, y por eso
     va aparte y no como una opción más del calendario. Un calendario que
     tuviera que representar "todo" tendría que inventarse una fecha de
     inicio. */
  const [todo, setTodo] = useState(false);
  const [fotos, setFotos] = useState(true);
  const [bajando, setBajando] = useState(false);

  /* No hay forma de saber cuándo terminó una descarga iniciada por un
     enlace, así que el aviso se apaga por tiempo. Mentir en el otro
     sentido —dejarlo "bajando" para siempre— sería peor. */
  useEffect(() => {
    if (!bajando) return;
    const t = setTimeout(() => setBajando(false), 6000);
    return () => clearTimeout(t);
  }, [bajando]);

  const url = `/api/sider/exportar?${new URLSearchParams({
    ...(todo ? {} : { desde, hasta }),
    ...(fotos ? {} : { fotos: "no" }),
  })}`;

  return (
    <div className="ex-caja">
      <div className="ex-mes">
        <span className="ex-rot">Exportar</span>
        {todo ? (
          <button type="button" className="ex-todo on" onClick={() => setTodo(false)}>
            Todo el histórico
            <em>cambiar</em>
          </button>
        ) : (
          <Rango
            desde={desde}
            hasta={hasta}
            dias={dias}
            alElegir={(d, h) => { setDesde(d); setHasta(h) }}
          />
        )}
      </div>
      {!todo && (
        <button type="button" className="ex-todo" onClick={() => setTodo(true)}>
          Todo el histórico
        </button>
      )}
      <label className="ex-fotos" title="Sin fotos el archivo pesa mucho menos">
        <input type="checkbox" checked={fotos} onChange={(e) => setFotos(e.target.checked)} />
        <span>con fotos</span>
      </label>
      <a className="btn ex-btn" href={url} onClick={() => setBajando(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="ic">
          <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                fill="none" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {bajando ? "Armando el archivo…" : "Excel"}
      </a>
    </div>
  );
}
