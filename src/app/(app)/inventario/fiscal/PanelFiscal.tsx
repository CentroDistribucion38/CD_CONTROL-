"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/errores";
import {
  avanceDesdeBD, estadoHoja, filaDesdeBD, ordenarCruce, puedeCruzar, resumenCruce, textoEquipo, titularCruce,
  type AvanceBD, type AvanceHoja, type FilaCruce, type FilaCruceBD, type ResumenCruce,
} from "@/modulos/inventario/fiscal-cruce";
import type { HojaForm } from "@/modulos/inventario/fiscal";

/* ===================================================================
   EL PANEL DEL FISCAL · una tarjeta por pareja, en vivo

   El fiscal ve todas las hojas a la vez y cómo va cada pareja SIN ver lo que contó
   cada persona (el conteo sigue a ciegas):
     · gris   — sin empezar
     · ámbar  — contando, o ya terminó una y se espera a la otra
     · verde  — COMPLETADA: las dos terminaron y todo coincide
     · rojo   — las dos terminaron y HAY DIFERENCIAS: dice en qué ubicaciones
   Solo cuando las dos personas terminaron se cruza la hoja (la base no deja antes).
   Se actualiza sola cada 15 segundos mientras la pantalla está a la vista.
   =================================================================== */
type Resultado = { filas: FilaCruce[] } | { error: string };
type Filtro = "todas" | "dif" | "ok" | "proceso";
type Tipo = "sin" | "proceso" | "ok" | "dif";

/** Las ubicaciones con diferencia, con cuántos renglones no coinciden en cada una. */
export function ubicacionesConDiferencia(filas: FilaCruce[]): { ubicacion: string; renglones: number }[] {
  const m = new Map<string, number>();
  for (const f of filas) if (f.estado !== "COINCIDE") m.set(f.ubicacion, (m.get(f.ubicacion) ?? 0) + 1);
  return [...m].map(([ubicacion, renglones]) => ({ ubicacion, renglones }))
    .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
}

const MAX_UBICACIONES = 8;

export function PanelFiscal({ fiscalId, hojas, avanceInicial, quien, onDetalle, detalle, onCerrar }: {
  fiscalId: string;
  hojas: HojaForm[];
  avanceInicial: Record<number, AvanceHoja>;
  quien: (id: string) => string;
  onDetalle: (numero: number) => void;
  /** El cruce abierto (el detalle renglón por renglón), que dibuja la pantalla madre. */
  detalle: ReactNode;
  onCerrar: () => void;
}) {
  const [avance, setAvance] = useState<Record<number, AvanceHoja>>(avanceInicial);
  const [cruces, setCruces] = useState<Record<number, Resultado>>({});
  const [hora, setHora] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const nf = useMemo(() => new Intl.NumberFormat("es-CO"), []);

  const cargar = useCallback(async () => {
    const sb = createClient();
    const { data, error: e } = await sb.rpc("inv_fiscal_avance");
    if (e) return setError(traducirError(e.message));
    setError(null);
    const mias = ((data ?? []) as AvanceBD[]).filter((a) => a.fiscal_id === fiscalId);
    const av: Record<number, AvanceHoja> = {};
    for (const a of mias) av[a.numero] = avanceDesdeBD(a);
    setAvance(av);
    /* Solo se cruzan las hojas donde las dos terminaron. */
    const listas = mias.filter((a) => puedeCruzar(av[a.numero]));
    const res = await Promise.all(listas.map(async (a): Promise<[number, Resultado]> => {
      const r = await sb.rpc("inv_fiscal_cruce", { p_hoja: a.hoja_id });
      if (r.error) return [a.numero, { error: traducirError(r.error.message) }];
      return [a.numero, { filas: ordenarCruce(((r.data ?? []) as FilaCruceBD[]).map(filaDesdeBD)) }];
    }));
    setCruces(Object.fromEntries(res));
    setHora(new Date());
  }, [fiscalId]);

  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (!document.hidden) cargar() }, 15_000);
    return () => clearInterval(t);
  }, [cargar]);

  /* Lo que dice cada tarjeta. */
  const tarjetas = hojas.map((h) => {
    const av = avance[h.numero];
    const estado = av ? estadoHoja(av) : "sin-empezar";
    const cr = cruces[h.numero];
    const resumen: ResumenCruce | null = cr && "filas" in cr ? resumenCruce(cr.filas) : null;
    let tipo: Tipo = "sin";
    if (estado === "lista") tipo = resumen ? (resumen.conDiferencia === 0 ? "ok" : "dif") : "proceso";
    else if (estado !== "sin-empezar") tipo = "proceso";
    return { h, av, estado, cr, resumen, tipo };
  });
  const cuenta = {
    dif: tarjetas.filter((t) => t.tipo === "dif").length,
    ok: tarjetas.filter((t) => t.tipo === "ok").length,
    proceso: tarjetas.filter((t) => t.tipo === "proceso" || t.tipo === "sin").length,
  };
  const vistas = tarjetas.filter((t) => filtro === "todas" ? true : filtro === "dif" ? t.tipo === "dif" : filtro === "ok" ? t.tipo === "ok" : (t.tipo === "proceso" || t.tipo === "sin"));

  const texto = (t: (typeof tarjetas)[number]): string => {
    if (t.tipo === "ok") return "Completada · todo coincide";
    if (t.tipo === "dif") return "Con diferencias";
    if (t.estado === "lista") return "Cruzando…";
    if (t.estado === "una-termino") return t.av?.olTermino ? "Esperando a Bavaria" : "Esperando al operador";
    if (t.estado === "contando") return "Contando";
    return "Sin empezar";
  };

  const chip = (k: Filtro, et: string, n: number, clase = "") => (
    <button type="button" key={k} className={"fp-chip " + clase} aria-pressed={filtro === k} onClick={() => setFiltro(filtro === k && k !== "todas" ? "todas" : k)}>
      <b>{n}</b> {et}
    </button>
  );

  return (
    <section className="fp" aria-label="Panel del fiscal">
      <div className="fp-cab">
        <div>
          <b className="fp-tit">Panel del fiscal</b>
          <small className="fp-sub">
            {hora ? `Actualizado ${hora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · se renueva solo cada 15 s` : "Cargando…"}
          </small>
        </div>
        <div className="fp-acc">
          <button type="button" className="btn plano" onClick={cargar}>Actualizar ahora</button>
          <button type="button" className="btn plano" onClick={onCerrar}>Cerrar panel</button>
        </div>
      </div>
      {error && <p className="cl-mal" role="alert">{error}</p>}
      <div className="fp-resumen" role="group" aria-label="Filtrar las tarjetas">
        {chip("todas", tarjetas.length === 1 ? "pareja" : "parejas", tarjetas.length)}
        {chip("proceso", "en conteo", cuenta.proceso, "proceso")}
        {chip("ok", cuenta.ok === 1 ? "completada" : "completadas", cuenta.ok, "ok")}
        {chip("dif", cuenta.dif === 1 ? "con diferencias" : "con diferencias", cuenta.dif, "dif")}
      </div>
      <div className="fp-grid">
        {vistas.map((t) => {
          const ubic = t.cr && "filas" in t.cr && t.tipo === "dif" ? ubicacionesConDiferencia(t.cr.filas) : [];
          return (
            <article key={t.h.numero} className={"fp-card " + t.tipo}>
              <header className="fp-card-cab">
                <b>Hoja {t.h.numero}</b>
                <i className={"fp-estado " + t.tipo}>{texto(t)}</i>
              </header>
              <dl className="fp-pareja">
                <div><dt>Operador logístico</dt>
                  <dd>{t.h.ol ? quien(t.h.ol) : <em>sin asignar</em>}
                    {t.av && t.h.ol && <small>{textoEquipo(t.av.olRenglones, t.av.olTermino)}</small>}</dd></div>
                <div><dt>Bavaria</dt>
                  <dd>{t.h.bavaria ? quien(t.h.bavaria) : <em>sin asignar</em>}
                    {t.av && t.h.bavaria && <small>{textoEquipo(t.av.bavariaRenglones, t.av.bavariaTermino)}</small>}</dd></div>
              </dl>
              {t.tipo === "ok" && t.resumen && (
                <p className="fp-ok">{nf.format(t.resumen.total)} {t.resumen.total === 1 ? "renglón" : "renglones"} iguales.</p>
              )}
              {t.tipo === "dif" && t.resumen && (
                <div className="fp-dif">
                  <p className="fp-dif-tit">{titularCruce(t.resumen)}</p>
                  <p className="fp-dif-et">Ubicaciones con diferencia ({ubic.length})</p>
                  <ul className="fp-ubic">
                    {ubic.slice(0, MAX_UBICACIONES).map((u) => (
                      <li key={u.ubicacion}><b>{u.ubicacion}</b>{u.renglones > 1 && <small> · {u.renglones}</small>}</li>
                    ))}
                    {ubic.length > MAX_UBICACIONES && <li className="mas">+{ubic.length - MAX_UBICACIONES} más</li>}
                  </ul>
                </div>
              )}
              {t.cr && "error" in t.cr && <p className="cl-mal" role="alert">{t.cr.error}</p>}
              {(t.tipo === "ok" || t.tipo === "dif") && (
                <button type="button" className="btn plano fp-ver" onClick={() => onDetalle(t.h.numero)}>Ver detalle del cruce</button>
              )}
            </article>
          );
        })}
        {vistas.length === 0 && <p className="fe-vacio">No hay tarjetas con ese filtro.</p>}
      </div>
      {detalle}
    </section>
  );
}
