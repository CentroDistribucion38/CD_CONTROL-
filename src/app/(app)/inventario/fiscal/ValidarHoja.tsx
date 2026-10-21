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

type Ub = { id: string | null; clave: string; dif: boolean; renglones: number; rev?: RevisionBD };
const orden = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

export function ValidarHoja({ hojaId, numero, calle, filas, revs, puedeEditar, ol, bavaria, onCambio }: {
  hojaId: string | null; numero: number; calle?: string; filas: FilaCruce[]; revs: RevisionBD[]; puedeEditar: boolean;
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
      const u = porClave.get(f.ubicacion) ?? { id: f.ubicacionId ?? null, clave: f.ubicacion, dif: false, renglones: 0 };
      u.renglones++;
      if (f.estado !== "COINCIDE") u.dif = true;
      if (!u.id && f.ubicacionId) u.id = f.ubicacionId;
      porClave.set(f.ubicacion, u);
    }
    const rv = new Map(revs.filter((r) => r.numero === numero).map((r) => [r.ubicacion, r]));
    for (const [k, r] of rv) {
      const u = porClave.get(k);
      if (u) u.rev = r;
      else porClave.set(k, { id: r.ubicacion_id, clave: k, dif: false, renglones: 0, rev: r });
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
      {ubs.some((u) => estado(u) === "coincide") && (
        <button type="button" className="btn plano vv-todas" aria-pressed={todas} onClick={() => setTodas(!todas)}>
          {todas ? "Ocultar las que coinciden" : `Ver también las ${ubs.filter((u) => estado(u) === "coincide").length} que coinciden`}
        </button>
      )}
    </div>
  );
}
