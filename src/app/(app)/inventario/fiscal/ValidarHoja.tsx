"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULOS_DE_LA_HOJA } from "@/modulos/inventario/modulos-hoja";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import type { FilaCruce } from "@/modulos/inventario/fiscal-cruce";

/* ===================================================================
   VALIDAR Y APROBAR LAS UBICACIONES DE UNA HOJA (lo hace el fiscal)

   1. Escoge las ubicaciones con diferencia y las MANDA A VALIDAR: las dos personas de la hoja
      reciben «revisa esta ubicación» (sin el número de su pareja). Cada vez que lo hace, la
      ubicación entra en una ronda nueva.
   2. Cada persona responde: «está bien» o vuelve a contar (lo nuevo reemplaza lo suyo).
   3. Cuando las dos respondieron, el cruce se actualiza solo y el fiscal APRUEBA con un clic.
      Si una persona no respondió, solo se aprueba forzando (se avisa antes).
   =================================================================== */
export type RevisionBD = {
  hoja_id: string; numero: number; ubicacion_id: string; ubicacion: string; estado: "A_VALIDAR" | "APROBADA";
  ronda: number; nota: string | null; ol_envio: boolean; bavaria_envio: boolean; pedido_en: string | null; aprobado_en: string | null;
};

/** Lo que ya está en La base de esta hoja (inv_fiscal_consolidados). */
export type ConsolidadoBD = { hoja_id: string; numero: number; conteo: string; ubicaciones: number; renglones: number; cajas: number | string; enviado_en: string | null };

/* La validación es por CALLE Y MÓDULO (A01), nunca por lado: el lado es muy perceptivo y delataría dónde está cada cosa.
   Un módulo junta sus dos lados; el SQL expande al aprobar/validar. */
type Ub = { id: string | null; clave: string; dif: boolean; renglones: number; revs: RevisionBD[]; rev?: RevisionBD };
const orden = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });
export const moduloDe = (clave: string) => clave.replace(/_(IZQ|DER)$/i, "");

export function ValidarHoja({ hojaId, numero, calle, filas, revs, consol, puedeEditar, ol, bavaria, onCambio }: {
  hojaId: string | null; numero: number; calle?: string; filas: FilaCruce[]; revs: RevisionBD[]; consol?: ConsolidadoBD | null; puedeEditar: boolean;
  ol: string; bavaria: string; onCambio: () => Promise<void>;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState("");
  const [todas, setTodas] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [forzar, setForzar] = useState<Ub[] | null>(null);
  const router = useRouter();
  const [nueva, setNueva] = useState("");
  const [seguro, setSeguro] = useState(false);

  const ubs = useMemo<Ub[]>(() => {
    const porClave = new Map<string, Ub>();
    for (const f of filas) {
      const m = moduloDe(f.ubicacion);
      const u = porClave.get(m) ?? { id: f.ubicacionId ?? null, clave: m, dif: false, renglones: 0, revs: [] };
      u.renglones++;
      if (f.estado !== "COINCIDE") u.dif = true;
      if (!u.id && f.ubicacionId) u.id = f.ubicacionId;
      porClave.set(m, u);
    }
    for (const r of revs.filter((x) => x.numero === numero)) {
      const m = moduloDe(r.ubicacion);
      const u = porClave.get(m) ?? { id: r.ubicacion_id, clave: m, dif: false, renglones: 0, revs: [] };
      if (!u.id) u.id = r.ubicacion_id;
      u.revs.push(r);
      porClave.set(m, u);
    }
    /* Estado del módulo = lo que dicen sus lados juntos. */
    for (const u of porClave.values()) {
      if (u.revs.length === 0) continue;
      const abiertas = u.revs.filter((r) => r.estado === "A_VALIDAR");
      if (abiertas.length === 0) { u.rev = u.revs[0]; continue }
      u.rev = {
        ...abiertas[0],
        ronda: Math.max(...abiertas.map((r) => r.ronda)),
        ol_envio: abiertas.every((r) => r.ol_envio),
        bavaria_envio: abiertas.every((r) => r.bavaria_envio),
        nota: abiertas.find((r) => r.nota)?.nota ?? null,
      };
    }
    return [...porClave.values()].sort((a, b) => orden(a.clave, b.clave));
  }, [filas, revs, numero]);

  const estado = (u: Ub): "aprobada" | "validando" | "difiere" | "coincide" =>
    u.rev?.estado === "APROBADA" ? "aprobada" : u.rev?.estado === "A_VALIDAR" ? "validando" : u.dif ? "difiere" : "coincide";
  const TEXTO = { aprobada: "Aprobada", validando: "En validación", difiere: "Difiere", coincide: "Coincide" } as const;

  const nAprobadas = ubs.filter((u) => estado(u) === "aprobada").length;
  const visibles = ubs.filter((u) => todas || estado(u) !== "coincide");
  const coincidenSinAprobar = ubs.filter((u) => estado(u) === "coincide");
  const marcadas = ubs.filter((u) => sel.has(u.clave));

  const alternar = (c: string) => setSel((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n });
  const marcar = (f: (u: Ub) => boolean) => setSel(new Set(ubs.filter(f).map((u) => u.clave)));

  async function correr(fn: "inv_fiscal_validar" | "inv_fiscal_aprobar", lista: Ub[], extra: Record<string, unknown>, listo: string) {
    setMal(null); setOk(null);
    const ids = lista.map((u) => u.id).filter((x): x is string => !!x);
    if (!hojaId || ids.length === 0 || ids.length !== lista.length) { setMal("No se pudo identificar la hoja o alguna ubicación. Actualiza la pantalla e intenta de nuevo."); return }
    setOcupado(true);
    const { error } = await createClient().rpc(fn, { p_hoja: hojaId, p_ubicaciones: ids, ...extra });
    setOcupado(false);
    if (error) { setMal(traducirError(error.message)); return }
    setOk(listo);
    setSel(new Set()); setForzar(null);
    if (fn === "inv_fiscal_validar") setNota("");
    /* Al aprobar, lo aprobado y coincidente se manda solo a La base (si falta el SQL de consolidar, se aprueba igual). */
    if (fn === "inv_fiscal_aprobar") {
      const c = await consolidar();
      if (c) setOk(`${listo} ${c}`);
    }
    await onCambio();
  }

  /** Manda a La base lo aprobado y coincidente de esta hoja. Devuelve el mensaje, o null si falta el SQL. */
  async function consolidar(): Promise<string | null> {
    if (!hojaId) return null;
    const { data, error } = await createClient().rpc("inv_fiscal_consolidar", { p_hoja: hojaId });
    if (error) {
      if (/inv_fiscal_consolidar|schema cache|does not exist|no existe la funci/i.test(error.message)) return null;
      if (/no hay nada que consolidar/i.test(error.message)) return "Todavía no hay nada aprobado que coincida para mandar a La base.";
      setMal(traducirError(error.message)); return null;
    }
    const r = ((data ?? []) as { ubicaciones: number; renglones: number; sin_consolidar: number; conteo: string }[])[0];
    if (!r) return null;
    return `En La base (${r.conteo}): ${r.ubicaciones} ${r.ubicaciones === 1 ? "ubicación" : "ubicaciones"}, ${r.renglones} ${r.renglones === 1 ? "renglón" : "renglones"}.` +
      (r.sin_consolidar > 0 ? ` ${r.sin_consolidar} aprobada${r.sin_consolidar === 1 ? "" : "s"} no se mandó porque aún difiere.` : "");
  }
  async function consolidarYa() {
    setMal(null); setOk(null); setOcupado(true);
    const m = await consolidar();
    setOcupado(false);
    setOk(m ?? "Falta correr 2026-10-fiscal-consolidar.sql en Supabase.");
    await onCambio();
  }

  const validar = () => correr("inv_fiscal_validar", marcadas, { p_nota: nota.trim() || null },
    `${marcadas.length} ${marcadas.length === 1 ? "ubicación enviada" : "ubicaciones enviadas"} a validar. Las dos personas ya la ven en Contar.`);

  function aprobar(lista: Ub[], forzando = false) {
    const faltan = lista.filter((u) => u.rev?.estado === "A_VALIDAR" && !(u.rev.ol_envio && u.rev.bavaria_envio));
    if (faltan.length > 0 && !forzando) { setForzar(faltan); return }
    void correr("inv_fiscal_aprobar", lista, { p_forzar: forzando },
      `${lista.length} ${lista.length === 1 ? "ubicación aprobada" : "ubicaciones aprobadas"}.`);
  }

  /* SIGUIENTE CALLE: solo cuando no queda nada por validar ni con diferencia sin aprobar. */
  const hayAbierto = ubs.some((u) => ["difiere", "validando"].includes(estado(u)));
  const otras = Object.keys(MODULOS_DE_LA_HOJA).filter((c) => c !== (calle ?? ""));
  async function siguienteCalle() {
    setMal(null); setOk(null);
    if (!hojaId || !nueva) { setMal("Escoge la calle a la que pasan."); return }
    setOcupado(true);
    const { error } = await createClient().rpc("inv_fiscal_siguiente_calle", { p_hoja: hojaId, p_calle: nueva });
    setOcupado(false);
    if (error) { setMal(traducirError(error.message)); return }
    setOk(`La hoja pasó a la calle ${nueva}. Las dos personas la ven reabierta en Contar.`);
    setSeguro(false); setNueva("");
    await onCambio();
    router.refresh();
  }

  const quien = (u: Ub) => {
    if (u.rev?.estado !== "A_VALIDAR") return null;
    const r = u.rev;
    return (
      <small className="vv-resp">
        Ronda {r.ronda} · {ol || "Operador"} {r.ol_envio ? "✓ respondió" : "… falta"} · {bavaria || "Bavaria"} {r.bavaria_envio ? "✓ respondió" : "… falta"}
      </small>
    );
  };

  return (
    <div className="vv">
      <header className="vv-cab">
        <b>Validar y aprobar</b>
        <span>{nAprobadas} de {ubs.length} {ubs.length === 1 ? "ubicación aprobada" : "ubicaciones aprobadas"}</span>
      </header>

      {puedeEditar && (
        <div className="vv-barra">
          <div className="vv-sel" role="group" aria-label="Marcar ubicaciones">
            <button type="button" className="btn plano" onClick={() => marcar((u) => estado(u) === "difiere")}>Marcar las que difieren</button>
            <button type="button" className="btn plano" onClick={() => marcar((u) => estado(u) === "validando" && !!u.rev?.ol_envio && !!u.rev?.bavaria_envio)}>Marcar las ya respondidas</button>
            {sel.size > 0 && <button type="button" className="btn plano" onClick={() => setSel(new Set())}>Quitar marcas</button>}
          </div>
          <label className="vv-nota"><span>Nota para las dos personas (opcional)</span>
            <input value={nota} maxLength={200} placeholder="Ej. revisen la estiba del fondo" onChange={(e) => setNota(e.target.value)} />
          </label>
          <div className="vv-acc">
            <button type="button" className="btn" disabled={ocupado || marcadas.length === 0} onClick={validar}>
              Mandar a validar{marcadas.length > 0 ? ` (${marcadas.length})` : ""}
            </button>
            <button type="button" className="btn" disabled={ocupado || marcadas.length === 0} onClick={() => aprobar(marcadas)}>
              Aprobar{marcadas.length > 0 ? ` (${marcadas.length})` : ""}
            </button>
            {coincidenSinAprobar.length > 0 && (
              <button type="button" className="btn plano" disabled={ocupado} onClick={() => aprobar(coincidenSinAprobar)}>
                Aprobar las {coincidenSinAprobar.length} que coinciden
              </button>
            )}
          </div>
        </div>
      )}

      {forzar && (
        <div className="cl-mal vv-forzar" role="alert">
          <p>Todavía falta la respuesta de alguna persona en {forzar.map((u) => u.clave).join(", ")}. Lo normal es avisarle antes. ¿Aprobar de todos modos?</p>
          <div className="cl-botones">
            <button type="button" className="btn plano mal" disabled={ocupado} onClick={() => aprobar(marcadas, true)}>Sí, aprobar sin su respuesta</button>
            <button type="button" className="btn plano" onClick={() => setForzar(null)}>No, esperar</button>
          </div>
        </div>
      )}
      {mal && <p className="cl-mal" role="alert">{mal}</p>}
      {ok && <p className="cl-ok" role="status">{ok}</p>}

      <ul className="vv-lista">
        {visibles.map((u) => {
          const e = estado(u);
          return (
            <li key={u.clave} className={"vv-fila " + e}>
              {puedeEditar ? (
                <label className="vv-chk"><input type="checkbox" checked={sel.has(u.clave)} onChange={() => alternar(u.clave)} /><b>{u.clave}</b></label>
              ) : <b className="vv-chk">{u.clave}</b>}
              <i className={"vv-e " + e}>{TEXTO[e]}</i>
              {quien(u)}
              {u.rev?.estado === "A_VALIDAR" && u.rev.nota && <small className="vv-resp">Nota: {u.rev.nota}</small>}
            </li>
          );
        })}
        {visibles.length === 0 && <li className="vv-fila"><span>Todas las ubicaciones coinciden.</span></li>}
      </ul>
      {puedeEditar && !hayAbierto && ubs.length > 0 && (
        <div className="vv-sig">
          <b>Siguiente calle{calle ? ` · ahora está en la calle ${calle}` : ""}</b>
          <p>Esta hoja ya no tiene diferencias sin aprobar. Si la pareja sigue con otra calle, la misma hoja cambia de calle y las dos personas la ven reabierta para contar. Lo de esta calle se conserva.</p>
          <div className="vv-acc">
            <select value={nueva} onChange={(e) => { setNueva(e.target.value); setSeguro(false) }} aria-label="Calle a la que pasan">
              <option value="">Escoge la calle…</option>
              {otras.map((c) => <option key={c} value={c}>Calle {c}</option>)}
            </select>
            {!seguro ? (
              <button type="button" className="btn" disabled={ocupado || !nueva} onClick={() => setSeguro(true)}>Pasar a la siguiente calle</button>
            ) : (
              <>
                <button type="button" className="btn" disabled={ocupado} onClick={siguienteCalle}>Sí, pasar a la calle {nueva}</button>
                <button type="button" className="btn plano" onClick={() => setSeguro(false)}>No</button>
              </>
            )}
          </div>
        </div>
      )}
      {(consol || nAprobadas > 0) && (
        <div className="vv-sig vv-base">
          <b>En La base{consol ? ` · ${consol.conteo}` : ""}</b>
          <p>{consol
            ? `${consol.ubicaciones} ${consol.ubicaciones === 1 ? "ubicación" : "ubicaciones"} · ${consol.renglones} ${consol.renglones === 1 ? "renglón" : "renglones"} · ${Number(consol.cajas).toLocaleString("es-CO")} cajas. Es un solo conteo de la hoja (no uno por persona): lo aprobado que coincide entre las dos.`
            : "Todavía no se manda nada. Al aprobar, lo aprobado que coincide entre las dos personas pasa solo a La base, como un solo conteo de la hoja."}
            {ubs.some((u) => estado(u) === "aprobada" && u.dif) && " Una ubicación aprobada que aún difiere no se manda hasta que coincida."}</p>
          {puedeEditar && <div className="vv-acc"><button type="button" className="btn plano" disabled={ocupado || nAprobadas === 0} onClick={consolidarYa}>Actualizar La base ahora</button></div>}
        </div>
      )}
      {ubs.some((u) => estado(u) === "coincide") && (
        <button type="button" className="btn plano vv-todas" aria-pressed={todas} onClick={() => setTodas(!todas)}>
          {todas ? "Ocultar las que coinciden" : `Ver también las ${ubs.filter((u) => estado(u) === "coincide").length} que coinciden`}
        </button>
      )}
    </div>
  );
}
