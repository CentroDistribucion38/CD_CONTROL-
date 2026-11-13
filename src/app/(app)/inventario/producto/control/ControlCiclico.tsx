"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";
import { diaColombia } from "@/modulos/inventario/corte";
import { fechaConDia, separarHistorial, textoCuando } from "@/modulos/inventario/fiscal";
import {
  avanceDesdeBD, filaDesdeBD, ordenarCruce, resumenCruce, unidOl, unidBavaria, difUnid, upcFila, TEXTO_FILA,
  type AvanceBD, type AvanceHoja, type FilaCruce, type FilaCruceBD,
} from "@/modulos/inventario/fiscal-cruce";
import { Ico } from "../../fiscal/PanelFiscal";
import { SelectorInventario } from "../../fiscal/SelectorInventario";
import type { FiscalBD, Persona } from "../../fiscal/Fiscal";

/* ===================================================================
   CONTROL CÍCLICO — SEGUIR EL CÍCLICO Y EXPORTAR LOS CONTEOS

   «Como el fiscal, que pueda esos tres (Plan, Control, Historial), pero cíclico, que pueda exportar los conteos.»
   El Plan cíclico arma; aquí se sigue: cada hoja con su pareja, lo que lleva cada uno, si el cruce coincide y si
   ya enviaron el conteo. El cruce se abre por hoja (solo lo que no coincide). El Excel trae todo: resumen, cruce,
   por código y cada renglón contado. Quien edita puede reabrir una hoja enviada.
   =================================================================== */

/** Un renglón de `inv_ciclico_detalle`. */
type Detalle = {
  hoja: number; equipo: string; persona: string | null; ubicacion: string; sku: string; material: string; familia: string | null;
  estibas: number | string | null; saldo: number | string | null; cajas: number | string | null; unidades: number | string | null;
  cajas_por_estiba: number | null; unidades_por_caja: number | null; total_unidades: number | string | null; nota: string | null; contado_en: string | null;
};
type Estado = { clase: "sin-empezar" | "contando" | "una-termino" | "lista"; texto: string };

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: unknown) => Number(v) || 0;
const cant = (cajas: number | null, sueltas: number | null | undefined) =>
  cajas == null ? "—" : `${nf.format(cajas)}${Number(sueltas ?? 0) > 0 ? ` + ${nf.format(Number(sueltas))} un.` : ""}`;
function dif(f: FilaCruce): string {
  const u = difUnid(f), upc = upcFila(f);
  if (u === 0) return "0";
  const a = Math.abs(u), c = Math.floor(a / upc), s = a % upc;
  return `${u > 0 ? "+" : "-"}${nf.format(c)}${s > 0 ? ` + ${nf.format(s)} un.` : ""}`;
}

/** El ícono de copiar (dos hojas). */
const IcoCopiar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" /><path d="M5 15H3V3h12v2" />
  </svg>
);
const IcoListo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" aria-hidden="true"><path d="m4 12 5 5L20 6" /></svg>
);

/** Copia al portapapeles; si el navegador no deja (http, permisos), con el método viejo. */
async function alPortapapeles(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true } catch { /* sigue con el viejo */ }
  try {
    const t = document.createElement("textarea");
    t.value = texto; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok;
  } catch { return false }
}

/* ===================================================================
   COPIAR EL CONTEO — «un ícono de copiar que abra un toolbox donde pueda copiar el SKU y luego la cantidad, en
   unidades: renglón 1, primero el código y luego la cantidad, cada uno. Que en el celular quede perfecto: solo
   SKU y cantidad, no importa la ubicación: totalizas todo.»
   Por código, todo sumado (todas las ubicaciones, y todas las hojas o la que se escoja), en UNIDADES. Cada valor es
   un botón que copia; lo ya copiado queda marcado para no perder el renglón. «Copiar todo» copia código y cantidad
   separados por tabulación (se pega directo en Excel).
   =================================================================== */
type LineaCopiar = { sku: string; material: string; unidades: number };
function CopiarConteo({ f, lineas, cargando, error, cerrar }: {
  f: FiscalBD; lineas: Detalle[] | null; cargando: boolean; error: string | null; cerrar: () => void;
}) {
  const [hoja, setHoja] = useState<number | null>(null);
  const [equipo, setEquipo] = useState<"BAVARIA" | "OL">("BAVARIA");
  const [copiado, setCopiado] = useState<Record<string, true>>({});
  const [ultimo, setUltimo] = useState<string | null>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [cerrar]);

  const filas: LineaCopiar[] = useMemo(() => {
    const m = new Map<string, LineaCopiar>();
    for (const l of lineas ?? []) {
      if ((l.equipo === "BAVARIA" ? "BAVARIA" : "OL") !== equipo) continue;
      if (hoja != null && l.hoja !== hoja) continue;
      const x = m.get(l.sku) ?? { sku: l.sku, material: l.material, unidades: 0 };
      x.unidades += n(l.total_unidades);
      m.set(l.sku, x);
    }
    return [...m.values()].filter((x) => x.unidades !== 0).sort((a, b) => a.sku.localeCompare(b.sku, "es", { numeric: true }));
  }, [lineas, equipo, hoja]);
  const total = filas.reduce((t, x) => t + x.unidades, 0);
  const hechos = filas.filter((x) => copiado[`${x.sku}|c`] && copiado[`${x.sku}|u`]).length;

  async function copiar(clave: string, texto: string) {
    if (await alPortapapeles(texto)) { setCopiado((c) => ({ ...c, [clave]: true })); setUltimo(`Copiado: ${texto}`) }
    else setUltimo("El navegador no dejó copiar. Mantén presionado el número y cópialo a mano.");
  }
  const cambiar = (fn: () => void) => { fn(); setCopiado({}); setUltimo(null) };

  return (
    <div className="cy-modal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <div className="cy-caja" role="dialog" aria-modal="true" aria-labelledby="cy-copiar-t">
        {/* LA BARRA DE SIEMPRE: banda negra con el sello, el título y la X (como las ventanas de la app). */}
        <header className="cy-cab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cy-logo" src="/marca/logo-b.png" alt="Bavaria" /><span className="cy-sep" aria-hidden />
          <div className="cy-tit">
            <div className="cy-ojo">COPIAR CONTEO · EN UNIDADES</div>
            <h2 id="cy-copiar-t">{f.nombre}</h2>
          </div>
          <button type="button" className="cy-x" onClick={cerrar} aria-label="Cerrar" title="Cerrar (Esc)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="cy-cuerpo">
          <div className="cy-filtros">
            <div className="cy-seg" role="group" aria-label="Quién contó">
              <button type="button" className={equipo === "BAVARIA" ? "on" : ""} onClick={() => cambiar(() => setEquipo("BAVARIA"))}>Bavaria</button>
              <button type="button" className={equipo === "OL" ? "on" : ""} onClick={() => cambiar(() => setEquipo("OL"))}>Operador</button>
            </div>
            {f.hojas.length > 1 && (
              <div className="cy-seg" role="group" aria-label="Hoja">
                <button type="button" className={hoja == null ? "on" : ""} onClick={() => cambiar(() => setHoja(null))}>Todas</button>
                {f.hojas.map((h) => (
                  <button key={h.numero} type="button" className={hoja === h.numero ? "on" : ""} onClick={() => cambiar(() => setHoja(h.numero))}>Hoja {h.numero}</button>
                ))}
              </div>
            )}
          </div>
          {cargando && <p className="cy-nota">Trayendo lo contado…</p>}
          {error && <p className="cl-mal" role="alert">{error}</p>}
          {!cargando && !error && (
            <>
              <div className="cy-resumen">
                <span><b>{filas.length}</b> {filas.length === 1 ? "código" : "códigos"} · <b>{nf.format(total)}</b> unidades{filas.length > 0 && <> · {hechos} de {filas.length} copiados</>}</span>
                {filas.length > 0 && (
                  <button type="button" className="btn plano" onClick={() => copiar("todo", filas.map((x) => `${x.sku}\t${x.unidades}`).join("\n"))}>
                    {copiado.todo ? <IcoListo /> : <IcoCopiar />} Copiar todo
                  </button>
                )}
              </div>
              {filas.length === 0 ? <p className="cy-nota">{equipo === "BAVARIA" ? "Bavaria" : "El operador"} todavía no ha contado nada{hoja != null ? ` en la hoja ${hoja}` : ""}.</p> : (
                <ol className="cy-lista">
                  {filas.map((x, i) => {
                    const c = !!copiado[`${x.sku}|c`], u = !!copiado[`${x.sku}|u`];
                    return (
                      <li key={x.sku} className={c && u ? "listo" : ""}>
                        <span className="cy-i">{i + 1}</span>
                        <button type="button" className={"cy-v" + (c ? " ok" : "")} onClick={() => copiar(`${x.sku}|c`, x.sku)} title={x.material}>
                          <small>SKU</small><b>{x.sku}</b>{c ? <IcoListo /> : <IcoCopiar />}
                        </button>
                        <button type="button" className={"cy-v n" + (u ? " ok" : "")} onClick={() => copiar(`${x.sku}|u`, String(x.unidades))}>
                          <small>Unidades</small><b>{nf.format(x.unidades)}</b>{u ? <IcoListo /> : <IcoCopiar />}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>
        <footer className="cy-pie">
          <span className="cy-ultimo" role="status">{ultimo ?? "Toca el código y luego la cantidad: cada uno se copia solo."}</span>
          <button type="button" className="btn" onClick={cerrar}>Cerrar</button>
        </footer>
      </div>
    </div>
  );
}

export function ControlCiclico({ personas, ciclicos, cerradasIniciales, ahora, puedeEditar, modo = "control" }: {
  personas: Persona[]; ciclicos: FiscalBD[];
  /** Por id de hoja: cuándo se envió el conteo (cerrada_en). */
  cerradasIniciales: Record<string, string>;
  ahora: string; puedeEditar: boolean;
  /** «control» = lo vigente; «historial» = los cíclicos que ya pasaron. */
  modo?: "control" | "historial";
}) {
  const hoy = diaColombia(ahora);
  const nombre = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas]);
  const { vigentes, historial } = useMemo(() => separarHistorial(ciclicos, hoy), [ciclicos, hoy]);
  const todos = modo === "historial" ? historial : vigentes;
  const [selId, setSelId] = useState<string | null>(null);
  const sel = todos.find((f) => f.id === selId) ?? todos[0] ?? null;

  const [pedir, dialogo] = useConfirmar();
  const [avance, setAvance] = useState<Record<number, AvanceHoja>>({});
  const [cruces, setCruces] = useState<Record<number, FilaCruce[]>>({});
  const [cerradas, setCerradas] = useState<Record<string, string>>(cerradasIniciales);
  const [cargando, setCargando] = useState(false);
  const [hora, setHora] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [verTodo, setVerTodo] = useState(false);
  const [armando, setArmando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /* EL TOOLBOX DE COPIAR: lo contado (inv_ciclico_detalle) se trae al abrirlo. */
  const [copiar, setCopiar] = useState<{ lineas: Detalle[] | null; cargando: boolean; error: string | null } | null>(null);
  const cerrarCopiar = useCallback(() => setCopiar(null), []);
  async function abrirCopiar(f: FiscalBD) {
    setCopiar({ lineas: null, cargando: true, error: null });
    const det = await createClient().rpc("inv_ciclico_detalle", { p_fiscal: f.id });
    setCopiar({ lineas: det.error ? null : ((det.data ?? []) as Detalle[]), cargando: false,
      error: det.error ? (/inv_ciclico_detalle|schema cache|does not exist/i.test(det.error.message) ? "Falta correr supabase/migraciones/2026-11-producto-ciclico-control.sql en Supabase." : det.error.message) : null });
  }

  /* EL CRUCE DE CADA HOJA, AL ABRIR Y CON «ACTUALIZAR»: lo que van contando los dos hasta ahora. */
  const cargar = useCallback(async (f: FiscalBD | null) => {
    if (!f) return;
    setCargando(true); setMal(null);
    const sb = createClient();
    const ids = Object.entries(f.hojaIds ?? {}).map(([num, id]) => ({ num: Number(num), id }));
    const [av, hs, ...cr] = await Promise.all([
      sb.rpc("inv_fiscal_avance"),
      sb.from("inv_fiscal_hojas").select("id, cerrada_en").eq("fiscal_id", f.id),
      ...ids.map((h) => sb.rpc("inv_ciclico_cruce", { p_hoja: h.id })),
    ]);
    if (!av.error) {
      const m: Record<number, AvanceHoja> = {};
      for (const a of (av.data ?? []) as AvanceBD[]) if (a.fiscal_id === f.id) m[a.numero] = avanceDesdeBD(a);
      setAvance(m);
    } else setAvance(f.avance ?? {});
    if (!hs.error) {
      setCerradas((c) => {
        const x = { ...c };
        for (const h of (hs.data ?? []) as { id: string; cerrada_en: string | null }[]) { if (h.cerrada_en) x[h.id] = h.cerrada_en; else delete x[h.id] }
        return x;
      });
    }
    const m: Record<number, FilaCruce[]> = {};
    let error: string | null = null;
    cr.forEach((r, i) => {
      if (r.error) error = r.error.message;
      else m[ids[i].num] = ordenarCruce(((r.data ?? []) as FilaCruceBD[]).map(filaDesdeBD));
    });
    setCruces(m);
    if (error) setMal(error);
    setHora(new Date().toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }));
    setCargando(false);
  }, []);
  useEffect(() => { setAbierta(null); setCruces({}); setAvance(sel?.avance ?? {}); void cargar(sel) }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviadaDe = (f: FiscalBD, numero: number) => { const id = f.hojaIds?.[numero]; return id ? cerradas[id] ?? null : null };
  const estadoDe = (f: FiscalBD, numero: number): Estado => {
    if (enviadaDe(f, numero)) return { clase: "lista", texto: "Conteo enviado" };
    const filas = cruces[numero];
    if (!filas || filas.length === 0) return { clase: "sin-empezar", texto: "Sin contar" };
    const r = resumenCruce(filas);
    if (r.conDiferencia > 0) return { clase: "contando", texto: `${r.conDiferencia} por cruzar` };
    return { clase: "una-termino", texto: "Todo coincide · falta enviar" };
  };

  async function reabrir(f: FiscalBD, numero: number) {
    const id = f.hojaIds?.[numero];
    if (!id) return;
    const ok = await pedir({
      titulo: `¿Reabrir la hoja ${numero}?`,
      dice: <>La pareja vuelve a poder anotar, corregir y cruzar. Cuando todo coincida, la envían otra vez.</>,
      confirmar: "Reabrir la hoja",
    });
    if (!ok) return;
    const { error } = await createClient().rpc("inv_ciclico_reabrir", { p_hoja: id });
    if (error) { setMal(/inv_ciclico_reabrir|schema cache|does not exist/i.test(error.message) ? "Falta correr supabase/migraciones/2026-11-producto-ciclico-control.sql en Supabase." : error.message); return }
    setCerradas((c) => { const x = { ...c }; delete x[id]; return x });
    setAviso(`Hoja ${numero} reabierta.`);
  }

  /* EL EXCEL DE LOS CONTEOS: resumen por hoja, el cruce, por código y cada renglón que se anotó. */
  async function exportar(f: FiscalBD) {
    setArmando(true); setMal(null); setAviso(null);
    try {
      const sb = createClient();
      const det = await sb.rpc("inv_ciclico_detalle", { p_fiscal: f.id });
      if (det.error) throw new Error(/inv_ciclico_detalle|schema cache|does not exist/i.test(det.error.message)
        ? "Para exportar los conteos falta correr supabase/migraciones/2026-11-producto-ciclico-control.sql en Supabase." : det.error.message);
      const lineas = (det.data ?? []) as Detalle[];
      const familiaDe = new Map(lineas.map((l) => [l.sku, l.familia ?? ""]));
      const XLSX = await import("xlsx");
      const libro = XLSX.utils.book_new();
      const hoja = (filas: Record<string, unknown>[], nombreHoja: string, anchos: number[]) => {
        const ws = XLSX.utils.json_to_sheet(filas);
        ws["!cols"] = anchos.map((w) => ({ wch: w }));
        if (filas.length) ws["!autofilter"] = { ref: ws["!ref"] as string };
        XLSX.utils.book_append_sheet(libro, ws, nombreHoja);
      };

      hoja(f.hojas.map((h) => {
        const r = cruces[h.numero] ? resumenCruce(cruces[h.numero]) : null;
        const av = avance[h.numero];
        const env = enviadaDe(f, h.numero);
        return {
          HOJA: h.numero, FAMILIAS: (h.familias ?? []).join(" + "),
          "OPERADOR LOGÍSTICO": h.ol ? nombre.get(h.ol) ?? "" : "", "RENGLONES OL": av?.olRenglones ?? 0,
          BAVARIA: h.bavaria ? nombre.get(h.bavaria) ?? "" : "", "RENGLONES BAVARIA": av?.bavariaRenglones ?? 0,
          "RENGLONES CRUZADOS": r?.total ?? 0, COINCIDEN: r?.coinciden ?? 0, "NO COINCIDEN": r?.conDiferencia ?? 0,
          ESTADO: estadoDe(f, h.numero).texto,
          "ENVIADO": env ? new Date(env).toLocaleString("es-CO") : "",
        };
      }), "RESUMEN", [6, 16, 24, 13, 24, 17, 18, 11, 13, 26, 20]);

      const cruce = f.hojas.flatMap((h) => (cruces[h.numero] ?? []).map((x) => ({ h: h.numero, x })));
      hoja(cruce.map(({ h, x }) => ({
        HOJA: h, SITIO: x.ubicacion, "CÓDIGO": x.sku, MATERIAL: x.material, FAMILIA: familiaDe.get(x.sku) ?? "",
        "OL (UN.)": unidOl(x) ?? "", "BAVARIA (UN.)": unidBavaria(x) ?? "", "DIFERENCIA (UN.)": difUnid(x),
        "OL (CAJAS)": cant(x.cajasOl, x.sueltasOl), "BAVARIA (CAJAS)": cant(x.cajasBavaria, x.sueltasBavaria),
        ESTADO: TEXTO_FILA[x.estado],
      })), "CRUCE", [6, 12, 10, 34, 10, 10, 13, 15, 14, 16, 18]);

      /* POR CÓDIGO: lo de todas las hojas junto, OL contra Bavaria, en unidades. */
      const porCodigo = new Map<string, { material: string; ol: number; ba: number; upc: number }>();
      for (const l of lineas) {
        const g = porCodigo.get(l.sku) ?? { material: l.material, ol: 0, ba: 0, upc: n(l.unidades_por_caja) || 1 };
        if (l.equipo === "BAVARIA") g.ba += n(l.total_unidades); else g.ol += n(l.total_unidades);
        porCodigo.set(l.sku, g);
      }
      hoja([...porCodigo.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true })).map(([sku, g]) => ({
        "CÓDIGO": sku, MATERIAL: g.material, FAMILIA: familiaDe.get(sku) ?? "", "UN./CAJA": g.upc,
        "OL (UN.)": g.ol, "BAVARIA (UN.)": g.ba, "DIFERENCIA (UN.)": g.ol - g.ba,
        "OL (CAJAS)": Math.round((g.ol / g.upc) * 100) / 100, "BAVARIA (CAJAS)": Math.round((g.ba / g.upc) * 100) / 100,
      })), "POR CÓDIGO", [10, 34, 10, 9, 10, 13, 15, 11, 15]);

      hoja(lineas.map((l) => ({
        HOJA: l.hoja, EQUIPO: l.equipo === "BAVARIA" ? "Bavaria" : "Operador logístico", PERSONA: l.persona ?? "",
        SITIO: l.ubicacion, "CÓDIGO": l.sku, MATERIAL: l.material, FAMILIA: l.familia ?? "",
        ESTIBAS: n(l.estibas), CAJAS: n(l.saldo) + n(l.cajas), "UNIDADES SUELTAS": n(l.unidades),
        "TOTAL UNIDADES": n(l.total_unidades),
        "TOTAL CAJAS": Math.round((n(l.total_unidades) / (n(l.unidades_por_caja) || 1)) * 100) / 100,
        NOTA: l.nota ?? "", HORA: l.contado_en ? new Date(l.contado_en).toLocaleString("es-CO") : "",
      })), "CONTEOS", [6, 18, 22, 12, 10, 34, 10, 8, 8, 15, 14, 12, 20, 20]);

      XLSX.writeFile(libro, `conteos-ciclico-${f.fecha}.xlsx`);
      setAviso(`Excel listo: ${lineas.length} renglones contados de ${new Set(lineas.map((l) => l.hoja)).size} de ${f.hojas.length} hojas.`);
    } catch (e) {
      setMal(e instanceof Error && e.message ? e.message : "No se pudo armar el Excel de los conteos.");
    } finally { setArmando(false) }
  }

  const vista = (f: FiscalBD) => {
    const est = f.hojas.map((h) => estadoDe(f, h.numero));
    const cifras = [
      { v: f.hojas.length, et: f.hojas.length === 1 ? "hoja" : "hojas" },
      { v: est.filter((e) => e.clase === "contando").length, et: "con diferencias", tono: "proceso" },
      { v: est.filter((e) => e.clase === "una-termino").length, et: "coinciden · falta enviar" },
      { v: est.filter((e) => e.texto === "Conteo enviado").length, et: "conteos enviados", tono: "ok" },
    ];
    const equipo = (id: string, et: string, renglones: number | undefined) => (
      <div className="fi-eq">
        <span className="fi-eq-et">{et}</span>
        {id ? <><span className="fi-quien">{nombre.get(id) ?? "—"}</span><small className="fi-sub">{renglones ?? 0} {renglones === 1 ? "renglón" : "renglones"}</small></>
          : <em className="fi-falta">Falta asignar</em>}
      </div>
    );
    return (
      <section key={f.id} className="vf fi-plan" aria-label={`Control del cíclico ${f.nombre}`}>
        <header className="vf-cab">
          <div className="vf-tit">
            <p className="vf-ojo">Control cíclico</p>
            <h2>{f.nombre}</h2>
            <p className="vf-meta">
              <Ico n="calendario" tam={15} /> {fechaConDia(f.fecha)} · {textoCuando(hoy, f.fecha)}
              <span className={"vf-tag " + (f.estado === "abierto" ? "abierto" : "cerrado")}>{f.estado === "abierto" ? "Abierto" : "Cerrado"}</span>
              {f.publicado && <span className="vf-tag visible"><Ico n="ojo" tam={12} /> Visible en Contar</span>}
            </p>
          </div>
          <div className="vf-acc">
            <button type="button" className="btn plano" disabled={cargando} onClick={() => cargar(f)} title={hora ? `Actualizado a las ${hora}` : undefined}>
              <Ico n="refrescar" tam={16} /> {cargando ? "Actualizando…" : "Actualizar"}
            </button>
            <button type="button" className="btn plano" onClick={() => abrirCopiar(f)} title="Código y cantidad en unidades, totalizado, para copiar uno por uno">
              <IcoCopiar /> Copiar conteo
            </button>
            <button type="button" className="btn plano fi-excel" disabled={armando} onClick={() => exportar(f)}
                    title="Un Excel con el resumen por hoja, el cruce, el total por código y cada renglón contado">
              <Ico n="bajar" tam={16} /> {armando ? "Armando el Excel…" : "Exportar conteos"}
            </button>
            <Link href="/inventario/producto/ciclico" className="btn plano"><Ico n="lapiz" tam={16} /> Ir al Plan cíclico</Link>
          </div>
        </header>
        <div className="vf-parejas">
          <ul className="fi-cifras" aria-label="Resumen del cíclico">
            {cifras.map((c) => <li key={c.et} className={c.tono ?? ""}><b>{c.v}</b><span>{c.et}</span></li>)}
          </ul>
          <ol className="fi-filas">
            {f.hojas.map((h, i) => {
              const e = est[i];
              const filas = cruces[h.numero] ?? [];
              const vistas = filas.filter((x) => verTodo || x.estado !== "COINCIDE");
              const enviada = e.texto === "Conteo enviado";
              return (
                <li key={h.numero} className="cy-hoja">
                  <div className={"fi-fila " + e.clase}>
                    <div className="fi-num"><small>Hoja</small><b>{h.numero}</b>{(h.familias?.length ?? 0) > 0 && <span className="fi-calle fi-fams-ver">{h.familias!.join(" + ")}</span>}</div>
                    {equipo(h.ol, "Operador logístico", avance[h.numero]?.olRenglones)}
                    {equipo(h.bavaria, "Bavaria", avance[h.numero]?.bavariaRenglones)}
                    <div className="cy-acc">
                      <i className={"fi-av " + e.clase}>{e.texto}</i>
                      {filas.length > 0 && (
                        <button type="button" className="fe-mini" onClick={() => { setAbierta(abierta === h.numero ? null : h.numero); setVerTodo(false) }}>
                          {abierta === h.numero ? "Cerrar cruce" : "Ver cruce"}
                        </button>
                      )}
                      {enviada && puedeEditar && f.estado === "abierto" && (
                        <button type="button" className="fe-mini" onClick={() => reabrir(f, h.numero)}>Reabrir</button>
                      )}
                    </div>
                  </div>
                  {abierta === h.numero && (
                    <div className="cy-cruce">
                      <table className="cc-t">
                        <thead><tr><th>Sitio</th><th>Código</th><th>Material</th><th className="n">Operador</th><th className="n">Bavaria</th><th className="n">Dif.</th><th>Estado</th></tr></thead>
                        <tbody>
                          {vistas.length === 0 && <tr><td colSpan={7} className="cc-vacio">Todo coincide.</td></tr>}
                          {vistas.map((x, k) => (
                            <tr key={`${x.ubicacion}|${x.sku}|${k}`} className={x.estado === "COINCIDE" ? "ok" : "mal"}>
                              <td><b>{x.ubicacion}</b></td><td>{x.sku}</td><td>{x.material}</td>
                              <td className="n">{cant(x.cajasOl, x.sueltasOl)}</td><td className="n">{cant(x.cajasBavaria, x.sueltasBavaria)}</td>
                              <td className="n"><b>{dif(x)}</b></td><td>{TEXTO_FILA[x.estado]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filas.some((x) => x.estado === "COINCIDE") && filas.some((x) => x.estado !== "COINCIDE") && (
                        <button type="button" className="fe-mini cc-ver" onClick={() => setVerTodo((v) => !v)}>
                          {verTodo ? "Ver solo lo que no coincide" : "Ver también lo que coincide"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    );
  };

  return (
    <>
      {dialogo}
      <section className="cabeza fi-cabeza">
        <div>
          <p className="ojo">INVENTARIO · PRODUCTO · CÍCLICO</p>
          <h1>{modo === "historial" ? "Historial cíclico" : "Control cíclico"}</h1>
          <p className="sub">
            {modo === "historial"
              ? "Los cíclicos que ya pasaron, con el mismo detalle: cada hoja, su cruce y el Excel de los conteos."
              : <>Cómo va cada hoja: lo que lleva cada uno, si el cruce coincide y si ya <b>enviaron el conteo</b>. Desde aquí se exportan los conteos a Excel.</>}
          </p>
        </div>
      </section>
      {aviso && <p className="cl-ok" role="status">{aviso}</p>}
      {mal && <p className="cl-mal" role="alert">{mal}</p>}
      {ciclicos.length === 0 && (
        <p className="fe-vacio">Todavía no hay ningún inventario cíclico. Se arma en el <Link href="/inventario/producto/ciclico">Plan cíclico</Link>.</p>
      )}
      {modo === "historial" && ciclicos.length > 0 && historial.length === 0 && (
        <p className="fe-vacio">Todavía no hay cíclicos anteriores. Cuando pasen unos días, el Control cíclico los manda aquí.</p>
      )}
      {(modo === "historial" ? todos.length > 0 : todos.length > 1) && (
        <SelectorInventario actual={sel?.id ?? null} escoger={setSelId}
          items={todos.map((f) => ({ id: f.id, nombre: f.nombre, fecha: fechaConDia(f.fecha), cuando: textoCuando(hoy, f.fecha), abierto: f.estado === "abierto" }))} />
      )}
      {sel && vista(sel)}
      {sel && copiar && <CopiarConteo f={sel} lineas={copiar.lineas} cargando={copiar.cargando} error={copiar.error} cerrar={cerrarCopiar} />}
      {modo === "control" && historial.length > 0 && (
        <p className="cl-nota" role="note">Los cíclicos anteriores ({historial.length}) están en el <Link href="/inventario/producto/historial">Historial cíclico</Link>.</p>
      )}
    </>
  );
}
