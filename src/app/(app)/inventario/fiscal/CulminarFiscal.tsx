"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";

/* ===================================================================
   CULMINAR EL FISCAL (o UNA PAREJA), SIN HUECOS

   «Para poder culminar debe mostrarme qué quedó pendiente.»

   Al tocar el botón se le pregunta a la base qué falta (`inv_fiscal_pendientes`):
     · si queda algún módulo sin aprobar o en validación, NO se culmina: la ventana lista hoja,
       calle, módulo y quién sigue contando, para que se resuelva antes;
     · si todo está aprobado, la ventana pide la confirmación y culmina: lo aprobado pasa a La base,
       se comprueba que quedó igual y las parejas ven «Finalizado» en Contar.
   Culminar NUNCA aprueba nada por su cuenta.
   Con `hoja` culmina solo esa pareja; sin `hoja`, todo el fiscal.
   =================================================================== */
type Fila = { hoja: number; calle: string | null; modulo: string | null; motivo: string; personas: string | null; bloquea: boolean };

const sql = (m: string) => /inv_fiscal_(pendientes|cerrar)|schema cache|does not exist|no existe la funci/i.test(m)
  ? "Falta correr 2026-11-fiscal-culminar.sql en Supabase." : traducirError(m);

export function CulminarFiscal({ fiscalId, hoja, clase = "btn", alHacer, deshabilitado }: {
  fiscalId: string;
  /** Una sola pareja. Sin esto se culmina todo el fiscal. */
  hoja?: { id: string; numero: number };
  clase?: string;
  /** Se llama cuando se culminó, para que la pantalla recargue. */
  alHacer: () => void | Promise<void>;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  const titulo = hoja ? `Culminar la hoja ${hoja.numero}` : "Culminar el fiscal";

  async function mirar() {
    setError(null); setOcupado(true);
    const { data, error: e } = await createClient().rpc("inv_fiscal_pendientes", { p_fiscal: fiscalId, p_hoja: hoja?.id ?? null });
    setOcupado(false);
    if (e) { setError(sql(e.message)); setFilas([]); return }
    setFilas((data ?? []) as Fila[]);
  }
  function abrir() { setHecho(null); setFilas(null); setAbierto(true); void mirar() }
  async function cerrarVentana() { const fueHecho = hecho !== null; setAbierto(false); if (fueHecho) await alHacer() }

  useEffect(() => {
    if (!abierto) return;
    const atras = document.activeElement as HTMLElement | null;
    cerrar.current?.focus();
    const sobre = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") void cerrarVentana() };
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = sobre; atras?.focus?.() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, hecho]);

  async function culminar() {
    setError(null); setOcupado(true);
    const sb = createClient();
    const r = hoja
      ? await sb.rpc("inv_fiscal_cerrar_hoja", { p_hoja: hoja.id })
      : await sb.rpc("inv_fiscal_cerrar_todo", { p_fiscal: fiscalId });
    setOcupado(false);
    if (r.error) { setError(sql(r.error.message)); await mirar(); return }
    if (hoja) { setHecho(`Hoja ${hoja.numero} finalizada. Lo aprobado pasó a La base y la pareja ya no puede cambiar nada.`); return }
    const fila = (Array.isArray(r.data) ? r.data[0] : r.data) as { cerradas?: number } | null;
    const n = fila?.cerradas ?? 0;
    setHecho(`${n === 1 ? "1 hoja finalizada" : `${n} hojas finalizadas`}. Todo lo aprobado pasó a La base y las parejas ven «Finalizado».`);
  }

  const bloquean = (filas ?? []).filter((f) => f.bloquea);
  const avisos = (filas ?? []).filter((f) => !f.bloquea);

  return (
    <>
      <button type="button" className={clase} disabled={deshabilitado} onClick={abrir}
              title={hoja ? "Culmina esta pareja si todo lo contado está aprobado" : "Culmina todo el fiscal si no queda nada pendiente"}>
        {hoja ? "Culminar esta hoja" : "Culminar fiscal"}
      </button>
      {abierto && (
        <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="cu-titulo"
             onClick={(e) => { if (e.target === e.currentTarget) void cerrarVentana() }}>
          <div className={"cf-caja cu-caja" + (bloquean.length > 0 && !hecho ? " peligro" : "")}>
            <p className="cu-ojo">INVENTARIO FISCAL · {hoja ? `HOJA ${hoja.numero}` : "TODAS LAS HOJAS"}</p>
            <h2 id="cu-titulo">{hecho ? "Finalizado" : bloquean.length > 0 ? "Todavía no se puede culminar" : titulo}</h2>

            {hecho ? (
              <p className="cu-ok" role="status">{hecho}</p>
            ) : filas === null ? (
              <p className="cu-nota" role="status">Revisando qué falta…</p>
            ) : (
              <>
                {bloquean.length > 0 ? (
                  <>
                    <p className="cu-nota">Resuelve esto y vuelve a intentarlo. Culminar no aprueba nada por su cuenta.</p>
                    <div className="cu-tabla" role="table" aria-label="Lo que falta por aprobar">
                      <div className="cu-fila cu-cab" role="row"><span>Hoja</span><span>Módulo</span><span>Estado</span><span>Quién</span></div>
                      {bloquean.map((f, i) => (
                        <div className="cu-fila" role="row" key={`${f.hoja}-${f.modulo}-${i}`}>
                          <span><b>{f.hoja}</b>{f.calle ? <small> · calle {f.calle}</small> : null}</span>
                          <span className="cu-mod">{f.modulo}</span>
                          <span className={"cu-est " + (f.motivo === "En validación" ? "val" : "sin")}>{f.motivo}</span>
                          <span className="cu-quien">{f.personas ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="cu-nota">
                    {hoja
                      ? <>Todo lo contado en la hoja {hoja.numero} está aprobado. Al culminar, pasa a La base, se comprueba que quedó igual y la pareja ya no puede anotar ni cambiar nada.</>
                      : <>Todo lo contado está aprobado. Al culminar, pasa a La base, se comprueba que quedó igual y todas las parejas ven «Finalizado» y no pueden cambiar nada.</>}
                  </p>
                )}
                {avisos.length > 0 && (
                  <div className="cu-aviso" role="note">
                    <b>{avisos.length === 1 ? "Una hoja no tiene ningún renglón" : `${avisos.length} hojas no tienen ningún renglón`}</b>
                    <span>{avisos.map((f) => `Hoja ${f.hoja}${f.personas ? ` (${f.personas})` : ""}`).join(" · ")}. Se culminan vacías.</span>
                  </div>
                )}
              </>
            )}

            {error && <p className="cu-mal" role="alert">{error}</p>}

            <div className="cf-botones">
              {hecho ? (
                <button type="button" className="cf-btn" ref={cerrar} onClick={() => void cerrarVentana()}>Listo</button>
              ) : (
                <>
                  <button type="button" className="cf-btn plano" ref={cerrar} onClick={() => void cerrarVentana()}>{bloquean.length > 0 ? "Entendido" : "Cancelar"}</button>
                  {bloquean.length > 0 && <button type="button" className="cf-btn plano" disabled={ocupado} onClick={() => void mirar()}>{ocupado ? "Revisando…" : "Volver a revisar"}</button>}
                  {filas !== null && bloquean.length === 0 && (
                    <button type="button" className="cf-btn" disabled={ocupado} onClick={() => void culminar()}>{ocupado ? "Culminando…" : hoja ? "Culminar la hoja" : "Culminar el fiscal"}</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
