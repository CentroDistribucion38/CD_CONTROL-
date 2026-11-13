"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  filaDesdeBD, ordenarCruce, resumenCruce, titularCruce, TEXTO_FILA, difUnid, upcFila,
  type FilaCruce, type FilaCruceBD,
} from "@/modulos/inventario/fiscal-cruce";

/* ===================================================================
   EL CRUCE DEL CÍCLICO, DESDE CONTAR

   «En Contar solo se habilita el cíclico y cualquiera de los dos da clic para ir cruzando.»
   En el fiscal cruza el fiscal; en el cíclico lo hace la misma pareja, cuando quiera y las veces que quiera:
   cada clic trae lo que van contando los dos HASTA AHORA. Mismo criterio del fiscal: sitio + código (+ estado),
   en unidades exactas, sin la fecha.

   «Si se cruzan y todo coincide, que aparezca ENVIAR CONTEO; o si solo quiero cruzar para ver cómo voy, que le dé
   SEGUIR CONTANDO y se cierra el cruce. Para que no se vea nada denso.»
   Por eso aquí no vive una tabla abierta: una barra con «Cruzar». El resultado se abre solo al cruzar y se cierra
   con «Seguir contando». Si todo coincide, «Enviar conteo» cierra la hoja (ya no se anota más).
   =================================================================== */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** «12 cajas + 3 un.» / «—» si ese equipo no contó ahí. */
function cant(cajas: number | null, sueltas: number | null | undefined): string {
  if (cajas == null) return "—";
  const s = Number(sueltas ?? 0);
  return `${nf.format(cajas)}${s > 0 ? ` + ${nf.format(s)} un.` : ""}`;
}
/** La diferencia (OL − Bavaria) en cajas, con las unidades sueltas si las hay. */
function dif(f: FilaCruce): string {
  const u = difUnid(f), upc = upcFila(f);
  if (u === 0) return "0";
  const signo = u > 0 ? "+" : "-";
  const a = Math.abs(u), c = Math.floor(a / upc), s = a % upc;
  return `${signo}${nf.format(c)}${s > 0 ? ` + ${nf.format(s)} un.` : ""}`;
}

export function CruceCiclico({ hojaId, numero }: { hojaId: string; numero: number; equipo?: string }) {
  const router = useRouter();
  /** null = cerrado (solo la barra); con filas = el resultado del último cruce, abierto. */
  const [filas, setFilas] = useState<FilaCruce[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);

  async function cruzar() {
    setCargando(true); setMal(null);
    const { data, error } = await createClient().rpc("inv_ciclico_cruce", { p_hoja: hojaId });
    setCargando(false);
    if (error) {
      setMal(/inv_ciclico_cruce|schema cache|does not exist/i.test(error.message)
        ? "Falta correr supabase/migraciones/2026-11-producto-ciclico.sql en Supabase." : error.message);
      return;
    }
    setFilas(ordenarCruce(((data ?? []) as FilaCruceBD[]).map(filaDesdeBD)));
    setHora(new Date().toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }));
  }

  async function enviar() {
    setEnviando(true); setMal(null);
    const { error } = await createClient().rpc("inv_ciclico_enviar", { p_hoja: hojaId });
    setEnviando(false);
    if (error) {
      setMal(/inv_ciclico_enviar|schema cache|does not exist/i.test(error.message)
        ? "Para enviar el conteo falta correr supabase/migraciones/2026-11-producto-ciclico-control.sql en Supabase." : error.message);
      return;
    }
    setFilas(null);
    router.refresh();
  }

  const r = filas ? resumenCruce(filas) : null;
  const cuadra = !!r && r.total > 0 && r.conDiferencia === 0;
  /* Solo lo que NO coincide: lo que coincide no hay que mirarlo. */
  const pendientes = (filas ?? []).filter((f) => f.estado !== "COINCIDE");

  /* CERRADO: una barra sola, nada más. */
  if (!filas) {
    return (
      <section className="cc cc-barra" aria-label={`Cruce de la hoja ${numero}`}>
        <p className="cc-sub"><b>¿Cómo van?</b> Cruza lo que llevan contado los dos.</p>
        <button type="button" className="btn" disabled={cargando} onClick={cruzar}>{cargando ? "Cruzando…" : "Cruzar"}</button>
        {mal && <p className="cc-mal" role="alert">{mal}</p>}
      </section>
    );
  }

  return (
    <section className={"cc " + (cuadra ? "cc-cuadra" : "cc-falta")} aria-label={`Cruce de la hoja ${numero}`}>
      <p className="cc-ojo">CRUCE · HOJA {numero}{hora ? ` · ${hora}` : ""}</p>
      {cuadra ? (
        <>
          <h2>Todo coincide</h2>
          <p className="cc-sub">Los dos contaron lo mismo en {r!.total} {r!.total === 1 ? "renglón" : "renglones"}. Si ya terminaron la hoja, envíen el conteo; si les falta contar, sigan.</p>
        </>
      ) : r!.total === 0 ? (
        <>
          <h2>Todavía no hay nada que cruzar</h2>
          <p className="cc-sub">Ninguno de los dos ha anotado nada en esta hoja.</p>
        </>
      ) : (
        <>
          <h2>{titularCruce(r!)}</h2>
          <p className="cc-sub">{r!.coinciden} de {r!.total} coinciden. Revisen en el sitio lo que no coincide, corrijan y vuelvan a cruzar.</p>
          <div className="cc-tabla-caja">
            <table className="cc-t">
              <thead>
                <tr><th>Sitio</th><th>Código</th><th className="n">Operador</th><th className="n">Bavaria</th><th className="n">Dif.</th></tr>
              </thead>
              <tbody>
                {pendientes.map((f, i) => (
                  <tr key={`${f.ubicacion}|${f.sku}|${f.estadoEnvase ?? ""}|${i}`} className="mal" title={`${f.material} · ${TEXTO_FILA[f.estado]}`}>
                    <td><b>{f.ubicacion}</b></td>
                    <td>{f.sku}<small className="cc-mat">{f.material}</small></td>
                    <td className="n">{cant(f.cajasOl, f.sueltasOl)}</td>
                    <td className="n">{cant(f.cajasBavaria, f.sueltasBavaria)}</td>
                    <td className="n"><b>{dif(f)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {mal && <p className="cc-mal" role="alert">{mal}</p>}
      <div className="cc-botones">
        {cuadra && (
          <button type="button" className="btn" disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Enviar conteo"}</button>
        )}
        <button type="button" className={cuadra ? "btn plano" : "btn"} disabled={enviando} onClick={() => { setFilas(null); setMal(null) }}>Seguir contando</button>
      </div>
    </section>
  );
}
