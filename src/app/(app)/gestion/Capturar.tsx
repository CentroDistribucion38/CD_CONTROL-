"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/components/Aviso";
import { conUnidad, diaCorto, estadoDe, etiquetaPeriodo, textoMeta, type Indicador, type Resultado, type Turno } from "@/modulos/gestion/semaforo";
import { guardarResultados } from "./actions";

/**
 * EL RESULTADO DE UNA CELDA, desde el tablero: se toca la casilla (indicador · día · turno) y se escribe el número.
 * Dice al instante si cumple o no la meta; al guardar, si son N seguidos sin cumplir, salta el disparador como siempre.
 * Dejarlo vacío y guardar borra lo que había.
 */
export function Capturar({ i, fecha, turno, r, cerrar }: { i: Indicador; fecha: string; turno?: Turno; r?: Resultado; cerrar: () => void }) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pend, start] = useTransition();
  const [valor, setValor] = useState(r ? String(r.valor).replace(".", ",") : "");
  const [nota, setNota] = useState(r?.comentario ?? "");
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [cerrar]);
  const txt = valor.trim().replace(/\s/g, "").replace(",", ".");
  const num = txt === "" ? null : Number(txt);
  const malo = txt !== "" && !Number.isFinite(num);
  const est = num != null && Number.isFinite(num) ? estadoDe(i, num) : null;
  const cuando = i.frecuencia === "dia" ? `${diaCorto(fecha)}${turno ? ` · turno ${turno.nombre.replace(/^Turno\s*/i, "")}` : ""}` : etiquetaPeriodo(fecha, i.frecuencia);

  const guardar = () => start(async () => {
    const res = await guardarResultados(fecha, turno?.id ?? null, [{ indicador_id: i.id, valor: num, comentario: nota }]);
    if (res.error) { avisar.mal(res.error); return }
    if (res.disparados) avisar.mal(`Saltó el disparador de ${i.codigo}: quedó en Ocurrencias para el 5W.`);
    else avisar.bien(num == null ? "Resultado borrado." : "Resultado guardado.");
    router.refresh(); cerrar();
  });

  return (
    <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="cp-t" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      {avisos}
      <div className="cf-caja cp-caja">
        <h2 id="cp-t">{i.codigo} · {cuando}</h2>
        <p className="cf-dice">{i.nombre} · meta <b>{textoMeta(i)}</b></p>
        <label className="cp-campo"><span>Resultado {i.unidad ? `(${i.unidad})` : ""}</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus placeholder="Vacío = sin dato"
                 onKeyDown={(e) => { if (e.key === "Enter" && !malo) { e.preventDefault(); guardar() } }} />
        </label>
        <p className={"cp-est " + (est ?? "sin")}>
          {malo ? "Escribe solo el número." : est === "verde" ? `Cumple · ${conUnidad(num, i)}` : est === "rojo" ? `No cumple · ${conUnidad(num, i)}` : r ? "Al guardar vacío se borra el resultado." : "Sin dato."}
        </p>
        <label className="cp-campo"><span>Comentario</span>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional: qué pasó" />
        </label>
        <div className="cf-botones">
          <button type="button" className="cf-btn plano" onClick={cerrar}>Cancelar</button>
          <button type="button" className="cf-btn" disabled={pend || malo || (num == null && !r)} onClick={guardar}>{pend ? "Guardando…" : num == null && r ? "Borrar resultado" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
