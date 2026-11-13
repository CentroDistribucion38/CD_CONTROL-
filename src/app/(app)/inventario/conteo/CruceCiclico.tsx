"use client";

import { useState } from "react";
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
   en unidades exactas, sin la fecha. Lo que no coincide va primero; lo que coincide se puede abrir.
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

export function CruceCiclico({ hojaId, numero, equipo }: { hojaId: string; numero: number; equipo: string }) {
  const [filas, setFilas] = useState<FilaCruce[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);

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

  const r = filas ? resumenCruce(filas) : null;
  const vistas = (filas ?? []).filter((f) => verTodo || f.estado !== "COINCIDE");

  return (
    <section className="cc" aria-label={`Cruce de la hoja ${numero}`}>
      <div className="cc-cab">
        <div>
          <p className="cc-ojo">CRUCE CON TU PAREJA · HOJA {numero}</p>
          <h2>{r ? titularCruce(r) : "Cruza lo que llevan contado los dos"}</h2>
          <p className="cc-sub">
            {r ? <>Cruzado a las {hora}. Operador logístico contra Bavaria, por sitio y código, sin la fecha. Tú eres {equipo || "de la pareja"}.</>
              : <>Cualquiera de los dos puede cruzar, cuando quiera: trae lo que van contando hasta ahora. Lo que no coincida, revísenlo en el sitio y corríjanlo.</>}
          </p>
        </div>
        <button type="button" className="btn grande" disabled={cargando} onClick={cruzar}>
          {cargando ? "Cruzando…" : filas ? "Volver a cruzar" : "Cruzar ahora"}
        </button>
      </div>

      {mal && <p className="cc-mal" role="alert">{mal}</p>}

      {r && r.total > 0 && (
        <>
          <ul className="cc-cifras">
            <li><b>{r.total}</b><span>renglones</span></li>
            <li className="ok"><b>{r.coinciden}</b><span>coinciden</span></li>
            <li className={r.difieren ? "mal" : ""}><b>{r.difieren}</b><span>difieren</span></li>
            <li className={r.soloOl ? "mal" : ""}><b>{r.soloOl}</b><span>solo el operador</span></li>
            <li className={r.soloBavaria ? "mal" : ""}><b>{r.soloBavaria}</b><span>solo Bavaria</span></li>
          </ul>
          <div className="cc-tabla-caja">
            <table className="cc-t">
              <thead>
                <tr><th>Sitio</th><th>Código</th><th>Material</th><th className="n">Operador</th><th className="n">Bavaria</th><th className="n">Diferencia</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {vistas.length === 0 && (
                  <tr><td colSpan={7} className="cc-vacio">Todo coincide hasta ahora.</td></tr>
                )}
                {vistas.map((f, i) => (
                  <tr key={`${f.ubicacion}|${f.sku}|${f.estadoEnvase ?? ""}|${i}`} className={f.estado === "COINCIDE" ? "ok" : "mal"}>
                    <td><b>{f.ubicacion}</b></td>
                    <td>{f.sku}</td>
                    <td>{f.material}{f.estadoEnvase ? ` · ${f.estadoEnvase}` : ""}{f.averia ? " · AVERÍA" : ""}{f.pnc ? " · PNC" : ""}</td>
                    <td className="n">{cant(f.cajasOl, f.sueltasOl)}</td>
                    <td className="n">{cant(f.cajasBavaria, f.sueltasBavaria)}</td>
                    <td className="n"><b>{dif(f)}</b></td>
                    <td>{TEXTO_FILA[f.estado]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.coinciden > 0 && (
            <button type="button" className="fe-mini cc-ver" onClick={() => setVerTodo((v) => !v)}>
              {verTodo ? "Ver solo lo que no coincide" : `Ver también lo que coincide (${r.coinciden})`}
            </button>
          )}
        </>
      )}
      {r && r.total === 0 && <p className="cc-sub">Ninguno de los dos ha anotado nada todavía en esta hoja.</p>}
    </section>
  );
}
