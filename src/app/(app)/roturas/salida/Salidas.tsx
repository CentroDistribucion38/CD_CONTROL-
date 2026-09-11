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
 * verificador, validación— y CADA UNA VIVE EN SU PROPIA PANTALLA, porque
 * son tres personas distintas y cada una trabaja en un sitio distinto.
 * Con los tres botones en una sola hoja, la misma persona tocaba dos y
 * la base le contestaba que no: la regla estaba bien, la pantalla la
 * convertía en un regaño.
 *
 * Esta pantalla es la de la SUPERVISORA: solo enseña lo que todavía se
 * está pesando. Lo cerrado ya no es suyo.
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
  const [placa, setPlaca] = useState("");
  const [obs, setObs] = useState("");
  const [mandando, setMandando] = useState(false);
  const [ver, setVer] = useState<"abiertas" | "todas">("abiertas");

  const lista = salidas.filter((s) =>
    ver === "todas" ? true : s.estado === "abierta");

  /* Se limpia igual que en la base —fuera espacios y guiones, todo en
     mayúsculas— para que lo que se ve mientras se escribe sea lo que va
     a quedar guardado. Si la pantalla dejara "abc-123" y la base
     guardara "ABC123", el primer reclamo sería por qué no aparece la
     placa que alguien juró haber escrito. */
  const placaLimpia = placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  async function abrir() {
    setMandando(true);
    const { data, error } = await supabase.rpc("salida_abrir", {
      p_placa: placaLimpia,
      p_observacion: obs.trim() || null,
    });
    setMandando(false);
    if (error) { avisar.mal(error.message); return }
    const fila = Array.isArray(data) ? data[0] : data;
    setAbriendo(false); setPlaca(""); setObs("");
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
          <option value="abiertas">Las que estoy pesando</option>
          <option value="todas">Todas, incluidas las que ya salieron</option>
        </select>
      </div>

      {abriendo && (
        <section className="caja">
          <div className="cab"><div><h2>Abrir una salida</h2>
            <p>
              El código lo pone el sistema. La placa es obligatoria: es lo que amarra el vidrio
              al camión que se lo llevó, y por lo que se busca el día que haya un reclamo.
            </p>
          </div></div>
          <div className="panel" style={{ margin: 12 }}>
            <label htmlFor="placa">Placa del camión</label>
            <input id="placa" value={placa} autoFocus
                   onChange={(e) => setPlaca(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter" && placaLimpia.length >= 5) abrir() }}
                   placeholder="ABC123"
                   style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: ".08em" }} />
            {placa && placaLimpia.length < 5 && (
              <span style={{ fontSize: 12.5, color: "var(--rt-mal)" }}>
                Una placa lleva al menos cinco caracteres. Van {placaLimpia.length}.
              </span>
            )}
            {placaLimpia.length >= 5 && placaLimpia !== placa.toUpperCase() && (
              /* Se enseña lo que va a quedar guardado ANTES de guardarlo.
                 Normalizar en silencio es la manera más rápida de que
                 alguien jure que escribió otra cosa. */
              <span style={{ fontSize: 12.5, color: "var(--rt-gris)" }}>
                Se va a guardar como <b>{placaLimpia}</b>.
              </span>
            )}

            <label htmlFor="obs">Observación (opcional)</label>
            <input id="obs" value={obs} onChange={(e) => setObs(e.target.value)}
                   placeholder="Destino, transportadora, o lo que haya que anotar" />
            <div className="acciones-panel">
              <button type="button" className="btn si"
                      disabled={mandando || placaLimpia.length < 5} onClick={abrir}>
                {mandando ? "Abriendo…"
                  : placaLimpia.length < 5 ? "Falta la placa" : "Abrir y empezar a pesar"}
              </button>
              <button type="button" className="btn plano"
                      onClick={() => { setAbriendo(false); setPlaca(""); setObs("") }}>
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
      </section>

      {/* Las salidas van FUERA de la caja del encabezado: cada una es su
          propia tarjeta. Metidas dentro se leen como renglones de una
          tabla, y una salida es una cosa con la que se trabaja, no una
          fila que se consulta. */}
      <div className="filas">
          {lista.length === 0 && (
            <div className="caja"><div className="vacio">
              <b>Sin salidas</b>
              {salidas.length
                ? "No hay ninguna abierta. Cambia el filtro para ver las que ya salieron."
                : "Todavía no se ha abierto ninguna salida de vidrio."}
            </div></div>
          )}

          {lista.map((s) => (
            <div key={s.id} className={"fila" + (s.estado === "anulada" ? " gris" : "")}>
              <div className="cod">{s.codigo}</div>

              <div>
                <div className="tit">
                  <span className="placa">{s.placa}</span>
                  {s.tolvas} tolva{s.tolvas === 1 ? "" : "s"} · {kilos(s.neto_kg)} kg netos
                </div>
                <div className="meta">
                  <span className="eti">{s.estado.toUpperCase()}</span>
                  <span>abierta {fecha(s.creada_en)} por {quien(nombres, s.creada_por)}</span>
                  {s.observacion && <span>{s.observacion}</span>}
                </div>
                <div className="meta">
                  {/* CUÁL falta, no cuántas van. "2 de 3" obliga a ir a
                      mirar; el nombre de la etapa ya dice a quién hay
                      que ir a buscar. */}
                  <span>
                    {!s.supervisora_en ? "Falta cerrar y enviar a verificación"
                      : !s.verificador_en ? "En Verificación, esperando"
                      : !s.validador_en ? "En Validación, esperando el aval"
                      : "Las tres firmas puestas"}
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
    </>
  );
}
