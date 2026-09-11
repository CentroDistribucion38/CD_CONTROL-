"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Salida } from "@/modulos/roturas/datos";
import { fecha, kilos, quien } from "../comunes";

/**
 * LAS SALIDAS DE VIDRIO — lo que se pesa, en KILOS.
 *
 * Una salida es un camión: se van pesando tolvas, y cuando está completo
 * se firma. Las tres firmas van en cadena y en orden —supervisora,
 * verificador, facturador— porque quien digita no verifica: es la regla
 * que evita que el mismo par de manos pese, apruebe y facture.
 *
 * El neto NO se guarda en ninguna parte: sale de sumar las tolvas cada
 * vez que se mira. Un neto guardado queda desfasado de su bruto el día
 * que alguien corrija uno de los dos, y la salida diría un número que no
 * sale de sus propias tolvas.
 */
export function Salidas({ salidas, nombres, puedeAbrir }: {
  salidas: Salida[];
  nombres: Record<string, string>;
  puedeAbrir: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [avisar, avisos] = useAvisos();

  const [abriendo, setAbriendo] = useState(false);
  const [obs, setObs] = useState("");
  const [mandando, setMandando] = useState(false);
  const [ver, setVer] = useState<"abiertas" | "todas">("abiertas");

  const lista = salidas.filter((s) =>
    ver === "todas" ? true : s.estado === "abierta");

  async function abrir() {
    setMandando(true);
    const { data, error } = await supabase.rpc("salida_abrir", {
      p_observacion: obs.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    const fila = Array.isArray(data) ? data[0] : data;
    setAbriendo(false); setObs("");
    /* Se entra derecho a pesar. Quien abre una salida está al lado de la
       báscula con la primera tolva ya montada: devolverlo a la lista
       para que busque la que acaba de crear es un paso de más. */
    router.push(`/roturas/salida/${fila?.id}`);
  }

  return (
    <>
      {avisos}

      <div className="filtros">
        <select value={ver} onChange={(e) => setVer(e.target.value as "abiertas" | "todas")}>
          <option value="abiertas">Solo las abiertas</option>
          <option value="todas">Todas</option>
        </select>
      </div>

      {abriendo && (
        <section className="caja">
          <div className="cab"><div><h2>Abrir una salida</h2>
            <p>El código lo pone el sistema. La observación es para el camión o el destino.</p>
          </div></div>
          <div className="panel" style={{ margin: 12 }}>
            <label htmlFor="obs">Observación (opcional)</label>
            <input id="obs" value={obs} onChange={(e) => setObs(e.target.value)}
                   placeholder="Camión de Peldar, placa XXX-000" />
            <div className="acciones-panel">
              <button type="button" className="btn si" disabled={mandando} onClick={abrir}>
                {mandando ? "Abriendo…" : "Abrir y empezar a pesar"}
              </button>
              <button type="button" className="btn plano" onClick={() => setAbriendo(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="caja">
        <div className="cab">
          <div>
            <h2>{lista.length} salida{lista.length === 1 ? "" : "s"}</h2>
            <p>
              El neto sale de sumar las tolvas, siempre. No hay ningún total guardado que pueda
              quedar desfasado de sus propias tolvas.
            </p>
          </div>
          {puedeAbrir && !abriendo && (
            <button type="button" className="btn si" onClick={() => setAbriendo(true)}>
              Abrir una salida
            </button>
          )}
        </div>

        <div className="rueda">
          {lista.length === 0 && (
            <div className="vacio">
              <b>Sin salidas</b>
              {salidas.length
                ? "No hay ninguna abierta. Cambia el filtro para ver las cerradas."
                : "Todavía no se ha abierto ninguna salida de vidrio."}
            </div>
          )}

          {lista.map((s) => (
            <div key={s.id} className={"fila" + (s.estado === "anulada" ? " gris" : "")}>
              <div className="cod">{s.codigo}</div>

              <div>
                <div className="tit">
                  {s.tolvas} tolva{s.tolvas === 1 ? "" : "s"} · {kilos(s.neto_kg)} kg netos
                </div>
                <div className="meta">
                  <span className="eti">{s.estado.toUpperCase()}</span>
                  <span>·</span>
                  <span>abierta {fecha(s.creada_en)} por {quien(nombres, s.creada_por)}</span>
                  {s.observacion && <><span>·</span><span>{s.observacion}</span></>}
                </div>
                <div className="meta">
                  {/* Las tres firmas como cadena y no como "2 de 3": lo
                      que importa no es cuántas van, es CUÁL falta. */}
                  <span>
                    Supervisora {s.supervisora_en ? "✓" : "—"} ·
                    {" "}Verificador {s.verificador_en ? "✓" : "—"} ·
                    {" "}Facturador {s.facturador_en ? "✓" : "—"}
                  </span>
                </div>
              </div>

              <div className="der">
                <span className={"eti " + (s.completa ? "cuenta" : "esperando")}>
                  {s.completa ? "COMPLETA" : `${s.firmas} DE 3 FIRMAS`}
                </span>
                <Link href={`/roturas/salida/${s.id}`} className="btn">
                  {s.estado === "abierta" ? "Pesar" : "Ver"}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
