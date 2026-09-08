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

import { useEffect, useState } from "react";

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
               "agosto","septiembre","octubre","noviembre","diciembre"];

/** Los últimos doce meses, más "todo". */
function opcionesMes() {
  const hoy = new Date();
  const out: { v: string; t: string }[] = [{ v: "", t: "Todo el histórico" }];
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ v, t: `${MESES[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

export function BotonExportar({ mes: fijo }: { mes?: string }) {
  const opciones = opcionesMes();
  const [mes, setMes] = useState(fijo ?? opciones[1]?.v ?? "");
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
    ...(mes ? { mes } : {}),
    ...(fotos ? {} : { fotos: "no" }),
  })}`;

  return (
    <div className="ex-caja">
      <label className="ex-mes">
        <span>Exportar</span>
        <select value={mes} onChange={(e) => setMes(e.target.value)}>
          {opciones.map((o) => <option key={o.v || "todo"} value={o.v}>{o.t}</option>)}
        </select>
      </label>
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
