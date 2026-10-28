"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import type { CierrePasivos, FilaPasivo, NuevaFila } from "@/modulos/pasivos/datos";
import { Rango } from "../../../sider/seguimiento/Rango";
import { borrarFilas, descartarFilas, descuentoEstandar, guardarDiaPasivos, subirArchivo, traerDelBalance } from "./actions";
import { DESCUENTO_ESTANDAR } from "@/modulos/pasivos/excluidos";
import { Confirmar } from "./Confirmar";

/**
 * PASIVOS · LA BASE. Lo de la hoja DATA de BLOQUEADOS.xlsx: se filtra por fechas (el calendario de
 * Traspasos), estado, causal, almacén y código; arriba la suma de lo filtrado; se trae del balance y se
 * sube el archivo plano de la baja proyectada y la rotura de línea.
 */
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v: number | null | undefined) => (v == null ? "—" : nf0.format(v));
const n2 = (v: number | null | undefined) => (v == null ? "—" : nf2.format(v));
const plata = (v: number | null | undefined) => (v == null ? "—" : "$ " + nf0.format(v));
const ddmmaaaa = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const ORIGEN: Record<string, string> = { balance: "Balance", archivo: "Archivo", manual: "Manual", historico: "Excel" };

/* ------------------------- leer la plantilla ------------------------- */
function aDia(v: unknown): string | null {
  if (typeof v === "number" && v > 20000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const t = String(v ?? "").trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const aNumero = (v: unknown) => {
  if (typeof v === "number") return v;
  const t = String(v ?? "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return t === "" ? NaN : Number(t);
};
type Leida = { filas: NuevaFila[]; malas: { fila: number; por: string }[]; hoja: string };
function leerLibro(buf: ArrayBuffer): Leida {
  const libro = XLSX.read(buf, { type: "array" });
  const hoja = libro.SheetNames.find((h) => sinTilde(h) === "PASIVOS") ?? libro.SheetNames[0];
  const m = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[hoja], { header: 1, raw: true, defval: null });
  const iCab = m.findIndex((r) => (r ?? []).some((c) => sinTilde(String(c ?? "")) === "CODIGO") && (r ?? []).some((c) => sinTilde(String(c ?? "")) === "FECHA"));
  if (iCab < 0) return { filas: [], malas: [{ fila: 0, por: "No encontré la fila de títulos (FECHA, ESTADO, CAUSAL, CODIGO, UNIDADES, ALMACEN)." }], hoja };
  const cab = (m[iCab] ?? []).map((c) => sinTilde(String(c ?? "")));
  const col = (n: string) => cab.indexOf(n);
  const c = { fecha: col("FECHA"), estado: col("ESTADO"), causal: col("CAUSAL"), codigo: col("CODIGO"), unidades: col("UNIDADES"), almacen: col("ALMACEN"), nota: col("NOTA") };
  const filas: NuevaFila[] = []; const malas: Leida["malas"] = [];
  for (let i = iCab + 1; i < m.length; i++) {
    const r = m[i] ?? [];
    if (r.every((x) => x == null || String(x).trim() === "")) continue;
    const fecha = aDia(r[c.fecha]);
    const codigo = String(r[c.codigo] ?? "").trim().replace(/\.0+$/, "");
    const unidades = aNumero(r[c.unidades]);
    const estado = sinTilde(String(r[c.estado] ?? "")), causal = sinTilde(String(r[c.causal] ?? "")), almacen = sinTilde(String(r[c.almacen] ?? ""));
    const falta = [!fecha && "fecha", !estado && "estado", !causal && "causal", !codigo && "código", !Number.isFinite(unidades) && "unidades", !almacen && "almacén"].filter(Boolean);
    if (falta.length) { malas.push({ fila: i + 1, por: `falta o está mal: ${falta.join(", ")}` }); continue }
    filas.push({ fecha: fecha!, estado, causal, codigo, unidades, almacen, nota: c.nota >= 0 ? String(r[c.nota] ?? "").trim() || null : null });
  }
  return { filas, malas, hoja };
}

export function Pasivos({ filas, error, desde, hasta, dias, diasConteo, codigos, puedeEditar, cierres, faltaCierres, vista: vistaInicial = "base" }: {
  filas: FilaPasivo[]; error: string | null; desde: string; hasta: string; dias: string[];
  diasConteo: string[]; codigos: string[]; puedeEditar: boolean;
  cierres: CierrePasivos[]; faltaCierres: boolean; vista?: "base" | "historico";
}) {
  const router = useRouter();
  const [cargando, startCarga] = useTransition();
  const [pending, start] = useTransition();
  const [estados, setEstados] = useState<Set<string>>(new Set());
  const [causal, setCausal] = useState("");
  const [almacen, setAlmacen] = useState("");
  const [q, setQ] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "mal"; texto: string } | null>(null);
  const [diaBal, setDiaBal] = useState(diasConteo[0] ?? "");
  const [leida, setLeida] = useState<(Leida & { archivo: string }) | null>(null);
  /* DOS HOJAS: la base y el histórico de los días guardados. La escogida queda en la dirección. */
  const [vista, setVista] = useState<"base" | "historico">(vistaInicial);
  const [histAlm, setHistAlm] = useState<"" | "AG18" | "AG22">("");
  const irA = (v: "base" | "historico") => {
    setVista(v);
    try { const u = new URL(window.location.href); if (v === "historico") u.searchParams.set("vista", v); else u.searchParams.delete("vista"); window.history.replaceState(null, "", u) } catch { /* nada */ }
  };
  const unDia = desde === hasta ? desde : null;
  const cierreDelDia = unDia ? cierres.find((c) => c.fecha === unDia) ?? null : null;
  const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  /* LA CASILLA DEL DESCUENTO ESTÁNDAR (3500005 · AG22): marcada = hay ese renglón manual en negativo ese día. */
  const DE = DESCUENTO_ESTANDAR;
  const descuento = unDia ? filas.find((f) => f.fecha === unDia && f.codigo === DE.codigo && f.almacen === DE.almacen && f.origen === "manual" && (f.nota ?? "").startsWith(DE.nota)) ?? null : null;
  const [valorDesc, setValorDesc] = useState(String(DE.unidades));
  const unidades3500005 = unDia ? filas.filter((f) => f.fecha === unDia && f.codigo === DE.codigo && f.almacen === DE.almacen && f !== descuento && !f.descartada).reduce((t, f) => t + f.unidades, 0) : 0;
  function cambiarDescuento(poner: boolean) {
    if (!unDia) return;
    const v = Number(valorDesc.replace(/\D/g, ""));
    if (poner && !(v > 0)) { setAviso({ tipo: "mal", texto: "El valor a descontar debe ser un número mayor que cero." }); return }
    setAviso(null);
    start(async () => {
      const r = await descuentoEstandar(unDia, poner ? v : null);
      if ("error" in r && r.error) { setAviso({ tipo: "mal", texto: r.error }); return }
      setAviso({ tipo: "ok", texto: poner ? `Descontadas ${n0(v)} u a ${DE.codigo} en ${DE.almacen} el ${ddmmaaaa(unDia)}.` : `Se quitó el descuento de ${DE.codigo} en ${DE.almacen}.` });
      router.refresh();
    });
  }
  function guardarDia() {
    if (!unDia) return;
    setAviso(null);
    start(async () => {
      const r = await guardarDiaPasivos(unDia);
      if ("error" in r && r.error) { setAviso({ tipo: "mal", texto: r.error }); return }
      setAviso({ tipo: "ok", texto: `Base del ${ddmmaaaa(unDia)} guardada en el histórico (${"filas" in r ? r.filas : 0} filas). Siguiente paso: el Cuadre SAP de AG18 y de AG22.` });
      router.refresh();
    });
  }

  const listaEstados = useMemo(() => [...new Set(filas.map((f) => f.estado))].sort(), [filas]);
  const listaCausales = useMemo(() => [...new Set(filas.filter((f) => !estados.size || estados.has(f.estado)).map((f) => f.causal))].sort(), [filas, estados]);
  const listaAlmacenes = useMemo(() => [...new Set(filas.map((f) => f.almacen))].sort(), [filas]);

  const qs = sinTilde(q).split(/[\s,;]+/).filter(Boolean);
  const vistas = useMemo(() => filas.filter((f) =>
    (!estados.size || estados.has(f.estado)) && (!causal || f.causal === causal) && (!almacen || f.almacen === almacen) &&
    (!qs.length || qs.some((t) => f.codigo.includes(t) || sinTilde(f.descripcion).includes(t)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [filas, estados, causal, almacen, q]);

  /* Lo descartado se ve pero NO suma ni resta. */
  const suman = useMemo(() => vistas.filter((f) => !f.descartada), [vistas]);
  const nDescartadas = vistas.length - suman.length;
  const tot = useMemo(() => suman.reduce((t, f) => ({
    unidades: t.unidades + f.unidades, cajas: t.cajas + (f.cajas ?? 0), hl: t.hl + (f.hl ?? 0), costo: t.costo + (f.costo ?? 0),
  }), { unidades: 0, cajas: 0, hl: 0, costo: 0 }), [suman]);
  const sinMaestro = suman.filter((f) => f.sin_maestro).length;

  const ir = (d: string, h: string) => startCarga(() => router.push(`/inventario/balance/pasivos?desde=${d}&hasta=${h}`));
  const hayFiltro = estados.size > 0 || !!causal || !!almacen || !!q;
  const limpiar = () => { setEstados(new Set()); setCausal(""); setAlmacen(""); setQ("") };
  const alternar = (s: Set<string>, v: string) => { const x = new Set(s); if (x.has(v)) x.delete(v); else x.add(v); return x };

  function traer() {
    if (!diaBal) return;
    setAviso(null);
    start(async () => {
      const r = await traerDelBalance(diaBal);
      if ("error" in r && r.error) { setAviso({ tipo: "mal", texto: r.error }); return }
      const sf = ("sinFactor" in r && r.sinFactor?.length ? ` Sin factor de caja (no entraron): ${r.sinFactor.join(", ")}.` : "")
        + ("excluidos" in r && r.excluidos?.length ? ` No van en Pasivos (envases nuevos / estiba): ${r.excluidos.join(", ")}.` : "")
        + ("quitoDescuento" in r && r.quitoDescuento ? ` Se quitó el descuento estándar de ${DE.codigo} de esta base: el Balance ya lo resta.` : "");
      setAviso({ tipo: "ok", texto: `Del balance del ${ddmmaaaa(diaBal)}: ${"filas" in r ? r.filas : 0} filas (reemplazan lo que se había traído ese día).${sf}` });
      if (diaBal < desde || diaBal > hasta) ir(diaBal, diaBal);
    });
  }
  async function leerArchivo(f: File) {
    setAviso(null);
    try { setLeida({ ...leerLibro(await f.arrayBuffer()), archivo: f.name }) }
    catch (e) { setAviso({ tipo: "mal", texto: "No pude abrir el archivo: " + (e instanceof Error ? e.message : String(e)) }) }
  }
  const desconocidos = useMemo(() => leida ? [...new Set(leida.filas.map((f) => f.codigo).filter((c) => !codigos.includes(c)))] : [], [leida, codigos]);
  function subir() {
    if (!leida?.filas.length) return;
    start(async () => {
      const r = await subirArchivo(JSON.stringify(leida.filas), leida.archivo);
      if ("error" in r && r.error) { setAviso({ tipo: "mal", texto: r.error }); return }
      const fs = leida.filas.map((x) => x.fecha).sort();
      setAviso({ tipo: "ok", texto: `${"filas" in r ? r.filas : 0} filas de «${leida.archivo}» cargadas.${"excluidos" in r && r.excluidos?.length ? ` No se subieron (envases nuevos / estiba): ${r.excluidos.join(", ")}.` : ""}` });
      setLeida(null);
      ir(fs[0], fs[fs.length - 1]);
    });
  }
  function borrar() {
    const ids = vistas.filter((f) => marcadas.has(f.id)).map((f) => f.id);
    if (!ids.length) { setConfirmaBorrar(false); return }
    start(async () => {
      const r = await borrarFilas(JSON.stringify(ids));
      setConfirmaBorrar(false);
      if ("error" in r && r.error) { setAviso({ tipo: "mal", texto: r.error }); return }
      setMarcadas(new Set()); setAviso({ tipo: "ok", texto: `${ids.length} filas borradas.` });
    });
  }
  function descartar(poner: boolean) {
    const ids = vistas.filter((f) => marcadas.has(f.id) && !!f.descartada !== poner).map((f) => f.id);
    if (!ids.length) { setAviso({ tipo: "mal", texto: poner ? "Las marcadas ya están descartadas." : "Las marcadas no están descartadas." }); return }
    start(async () => {
      const r = await descartarFilas(JSON.stringify(ids), poner);
      if ("error" in r && r.error) { setAviso({ tipo: "mal", texto: r.error }); return }
      setMarcadas(new Set());
      setAviso({ tipo: "ok", texto: poner ? `${ids.length} fila${ids.length === 1 ? "" : "s"} descartada${ids.length === 1 ? "" : "s"}: se ven en la base pero ya no suman.` : `${ids.length} fila${ids.length === 1 ? "" : "s"} reactivada${ids.length === 1 ? "" : "s"}: vuelven a sumar.` });
      router.refresh();
    });
  }
  const marcadasVistas = vistas.filter((f) => marcadas.has(f.id));
  const todasMarcadas = vistas.length > 0 && marcadasVistas.length === vistas.length;

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE · PASIVOS</p>
          <h1>Pasivos · Base</h1>
          <p className="sub">
            Lo de la hoja DATA de BLOQUEADOS.xlsx. Entra del <b>balance</b> (la diferencia en unidades de cada hoja) y del
            <b> archivo plano</b> (baja proyectada y rotura de línea). Descripción, caja, HL, cajas y costo salen del Maestro de Pasivos.
          </p>
        </div>
      </section>

      <nav className="bal-tabs pas-hojas" role="tablist" aria-label="Hojas de Pasivos">
        <button type="button" role="tab" aria-selected={vista === "base"} className={`bal-tab ${vista === "base" ? "activa" : ""}`} onClick={() => irA("base")}>
          <span className="bal-tab-label">Base</span>
        </button>
        <button type="button" role="tab" aria-selected={vista === "historico"} className={`bal-tab ${vista === "historico" ? "activa" : ""}`} onClick={() => irA("historico")}>
          <span className="bal-tab-label">Histórico</span>
          {cierres.length > 0 && <span className="bal-tab-n" title="días guardados">{cierres.length}</span>}
        </button>
      </nav>

      {vista === "historico" && (
        <HistoricoPasivos cierres={cierres} falta={faltaCierres} histAlm={histAlm} setHistAlm={setHistAlm}
          abrir={(d) => { irA("base"); ir(d, d) }} />
      )}

      {vista === "base" && (<>
      {/* ---- GUARDAR EL DÍA: cuando ya se subió todo, se guarda y se pasa al Cuadre SAP ---- */}
      {puedeEditar && (
        <div className={"pas-guardar" + (cierreDelDia ? " hecho" : "")}>
          <div>
            <b>{unDia ? `Base del ${ddmmaaaa(unDia)}` : "Escoge un solo día para guardarlo"}</b>
            <small>{!unDia ? "El guardado es por día: en Fechas, escoge un solo día."
              : cierreDelDia ? `✓ Guardada ${cuando(cierreDelDia.cerrado_en)}${cierreDelDia.cerrado_nombre ? ` · ${cierreDelDia.cerrado_nombre}` : ""}. Si cambias algo, vuelve a guardar.`
              : "Cuando ya subiste todo (balance y archivo plano), guárdala: queda en el histórico y sigues con el Cuadre SAP."}</small>
          </div>
          <div className="pas-guardar-acc">
            <button type="button" className="btn" disabled={!unDia || pending || faltaCierres} onClick={guardarDia}
                    title={faltaCierres ? "Falta correr supabase/migraciones/2026-10-pasivos-cierres.sql" : undefined}>
              {cierreDelDia ? "Volver a guardar" : "Guardar el día"}
            </button>
            {unDia && cierreDelDia && (<>
              <a className="btn plano" href={`/inventario/balance/cuadre?fecha=${unDia}&alm=AG18`}>Cuadre SAP · AG18 →</a>
              <a className="btn plano" href={`/inventario/balance/cuadre?fecha=${unDia}&alm=AG22`}>Cuadre SAP · AG22 →</a>
            </>)}
          </div>
        </div>
      )}
      {faltaCierres && puedeEditar && <p className="bal-conso-aviso mal">Para guardar el día falta correr supabase/migraciones/2026-10-pasivos-cierres.sql en Supabase.</p>}

      {/* ---- EL DESCUENTO ESTÁNDAR DE 3500005 EN AG22 ---- */}
      {puedeEditar && unDia && (
        <div className={"pas-desc" + (descuento ? " on" : "")}>
          <label className="pas-desc-chk">
            <input type="checkbox" checked={!!descuento} disabled={pending} onChange={(e) => cambiarDescuento(e.target.checked)} />
            <span>
              <b>Descontar a {DE.codigo} en {DE.almacen}</b>
              <small>{descuento
                ? `Descontado: ${n0(Math.abs(descuento.unidades))} u (renglón manual ${DE.estado} · ${DE.causal}). Quedan ${n0(unidades3500005 + descuento.unidades)} u de ${n0(unidades3500005)}.`
                : `Tiene ${n0(unidades3500005)} u en ${DE.almacen} este día. El Balance ya le resta ${n0(DE.unidades)} u (5.692 cajas) como ajuste automático: marcar esto lo restaría otra vez.`}</small>
            </span>
          </label>
          <span className="pas-desc-val">
            <input inputMode="numeric" value={valorDesc} onChange={(e) => setValorDesc(e.target.value)} aria-label="Unidades a descontar"
                   onBlur={() => { if (descuento && Number(valorDesc.replace(/\D/g, "")) !== Math.abs(descuento.unidades)) cambiarDescuento(true) }} />
            <small>unidades</small>
          </span>
        </div>
      )}

      {/* ---- ENTRADAS ---- */}
      {puedeEditar && (
        <div className="pas-entradas">
          <div className="pas-caja">
            <h3>Traer del balance</h3>
            <p>Las hojas Baja/Lavado/Extrasucio de Fábrica y Bodega 38 del día escogido, más lo bloqueado contado en las calles EXPORTACION (AG17) y BTS (AG16), en unidades. Si ya se había traído ese día, se reemplaza.</p>
            <div className="pas-fila">
              <div className="sd bal-cal">
                <Rango rotulo="Día del balance" desde={diaBal} hasta={diaBal}
                       dias={diasConteo.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))} alElegir={(d) => setDiaBal(d)} />
              </div>
              <button type="button" className="btn" disabled={!diaBal || pending} onClick={traer}>{pending ? "Trayendo…" : "Traer"}</button>
            </div>
          </div>
          <div className="pas-caja">
            <h3>Subir archivo plano</h3>
            <p>Baja proyectada y rotura de línea. Solo FECHA, ESTADO, CAUSAL, CODIGO, UNIDADES y ALMACEN; lo demás lo calcula el sistema.</p>
            <div className="pas-fila">
              <label className="btn plano pas-archivo">
                Escoger archivo
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void leerArchivo(f); e.target.value = "" }} />
              </label>
              <a className="pas-plantilla" href="/plantillas/pasivos-plantilla.xlsx" download>Descargar plantilla</a>
            </div>
            {leida && (
              <div className="pas-previa">
                <p><b>{leida.archivo}</b> · hoja {leida.hoja}: <b>{leida.filas.length}</b> filas listas
                  {leida.malas.length > 0 && <> · <span className="mal">{leida.malas.length} con error</span></>}
                  {desconocidos.length > 0 && <> · <span className="mal">{desconocidos.length} código{desconocidos.length === 1 ? "" : "s"} sin maestro ({desconocidos.slice(0, 6).join(", ")}{desconocidos.length > 6 ? "…" : ""})</span></>}
                </p>
                {leida.malas.slice(0, 5).map((x) => <p key={x.fila} className="mal">Fila {x.fila}: {x.por}</p>)}
                <div className="pas-fila">
                  <button type="button" className="btn" disabled={!leida.filas.length || pending} onClick={subir}>{pending ? "Subiendo…" : `Subir ${leida.filas.length} filas`}</button>
                  <button type="button" className="btn plano" onClick={() => setLeida(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {aviso && <p className={`bal-conso-aviso ${aviso.tipo}`} role="status">{aviso.texto}</p>}
      {error && <p className="bal-conso-aviso mal">No se pudo leer la base: {error}</p>}

      {/* ---- FILTROS ---- */}
      <div className="bal-conso-filtros pas-filtros">
        <div className="sd bal-cal">
          <Rango rotulo="Fechas" desde={desde} hasta={hasta} dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))} alElegir={ir} />
        </div>
        <div className="bal-conso-grupo">
          <span>Estado</span>
          <div className="bal-chips">
            {listaEstados.map((e) => <button key={e} type="button" className={estados.has(e) ? "on" : ""} aria-pressed={estados.has(e)} onClick={() => { setEstados(alternar(estados, e)); setCausal("") }}>{e}</button>)}
          </div>
        </div>
        <label className="pas-sel"><span>Causal</span>
          <select value={causal} onChange={(e) => setCausal(e.target.value)}>
            <option value="">Todas</option>
            {listaCausales.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="bal-conso-grupo">
          <span>Almacén</span>
          <div className="bal-chips">
            {["", ...listaAlmacenes].map((a) => <button key={a || "todos"} type="button" className={almacen === a ? "on" : ""} onClick={() => setAlmacen(a)}>{a || "Todos"}</button>)}
          </div>
        </div>
        <label className="bal-conso-q"><span>Código o material</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="3500005 · marron 330…" />
        </label>
        {hayFiltro && <button type="button" className="btn plano" onClick={limpiar}>Restablecer</button>}
        {cargando && <em className="pas-trae">Trayendo…</em>}
      </div>

      {/* ---- LA SUMA DE LO FILTRADO ---- */}
      <div className="pas-tarjetas">
        <div className="pas-t total"><span>Unidades</span><b>{n0(tot.unidades)}</b><i>{suman.length} fila{suman.length === 1 ? "" : "s"}{nDescartadas > 0 ? ` · ${nDescartadas} descartada${nDescartadas === 1 ? "" : "s"} (no suman)` : ""}</i></div>
        <div className="pas-t"><span>Cajas</span><b>{n0(tot.cajas)}</b></div>
        <div className="pas-t"><span>HL</span><b>{n2(tot.hl)}</b></div>
        <div className="pas-t"><span>Costo</span><b>{plata(tot.costo)}</b>{sinMaestro > 0 && <i className="mal">{sinMaestro} sin maestro (sin costo)</i>}</div>
      </div>

      {marcadasVistas.length > 0 && puedeEditar && (
        <div className="pas-barra" role="toolbar" aria-label="Qué hacer con las filas marcadas">
          <div className="pas-barra-n">
            <b>{marcadasVistas.length}</b>
            <span>{marcadasVistas.length === 1 ? "fila marcada" : "filas marcadas"}</span>
          </div>
          <div className="pas-barra-acc">
            <button type="button" className="pb descartar" disabled={pending} onClick={() => descartar(true)} title="Se quedan a la vista pero no suman ni restan">Descartar</button>
            {marcadasVistas.some((f) => f.descartada) && <button type="button" className="pb reactivar" disabled={pending} onClick={() => descartar(false)} title="Vuelven a sumar">Reactivar</button>}
            <button type="button" className="pb borrar" disabled={pending} onClick={() => setConfirmaBorrar(true)}>Borrar</button>
          </div>
          <button type="button" className="pb-quitar" onClick={() => setMarcadas(new Set())}>Quitar marcas</button>
        </div>
      )}

      {/* ---- LA HOJA ---- */}
      <div className="bal-tabla-wrap">
        <table className="bal-tabla bal-hoja pas-tabla">
          <thead>
            <tr>
              {puedeEditar && <th className="bal-col-chk"><input type="checkbox" aria-label="Marcar todas" checked={todasMarcadas} onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set(vistas.map((f) => f.id)))} /></th>}
              <th>Fecha</th><th>Estado</th><th>Causal</th><th>Caja</th><th>Código</th><th>Descripción</th>
              <th className="r">Unidades</th><th>Almacén</th><th className="r">HL</th><th className="r">Cajas</th><th className="r">Costo</th><th>Origen</th>
            </tr>
          </thead>
          <tbody>
            {vistas.map((f) => (
              <tr key={f.id} className={(marcadas.has(f.id) ? "marcada" : f.sin_maestro && !f.descartada ? "con-alerta" : "") + (f.descartada ? " descartada" : "")}>
                {puedeEditar && <td className="bal-col-chk"><input type="checkbox" aria-label={`Marcar ${f.codigo}`} checked={marcadas.has(f.id)} onChange={() => setMarcadas(alternar(marcadas, f.id))} /></td>}
                <td className="mono">{ddmmaaaa(f.fecha)}</td>
                <td>{f.estado}</td>
                <td>{f.causal}</td>
                <td className="mono">{f.caja ?? "—"}</td>
                <td className="mono">{f.codigo}</td>
                <td>{f.descripcion}{f.descartada && <span className="pas-desc-tag">DESCARTADA · no suma</span>}{f.sin_maestro && <span className="pas-sin"> · no está en el maestro</span>}</td>
                <td className={`r ${f.unidades < 0 ? "bal-dif" : ""}`}>{n0(f.unidades)}</td>
                <td>{f.almacen}</td>
                <td className="r">{n2(f.hl)}</td>
                <td className="r">{n0(f.cajas)}</td>
                <td className="r">{plata(f.costo)}</td>
                <td><span className={`pas-origen ${f.origen}`} title={f.archivo ?? f.nota ?? undefined}>{ORIGEN[f.origen] ?? f.origen}</span>{f.origen === "balance" && f.nota && <small className="pas-nota">{f.nota}</small>}</td>
              </tr>
            ))}
            {vistas.length === 0 && <tr><td colSpan={puedeEditar ? 13 : 12} className="bal-sin-filas">No hay pasivos en estas fechas con esos filtros.</td></tr>}
          </tbody>
          {vistas.length > 1 && (
            <tfoot>
              <tr>
                <td colSpan={puedeEditar ? 7 : 6}><b>Total</b></td>
                <td className="r"><b>{n0(tot.unidades)}</b></td><td></td>
                <td className="r"><b>{n2(tot.hl)}</b></td><td className="r"><b>{n0(tot.cajas)}</b></td><td className="r"><b>{plata(tot.costo)}</b></td><td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {confirmaBorrar && marcadasVistas.length > 0 && (() => {
        const n = marcadasVistas.length;
        const suma = marcadasVistas.filter((f) => !f.descartada);
        const u = suma.reduce((t, f) => t + f.unidades, 0), cj = suma.reduce((t, f) => t + (f.cajas ?? 0), 0);
        return (
          <Confirmar cabecera="BORRAR DE LA BASE" titulo={`¿Borrar ${n} fila${n === 1 ? "" : "s"} de la base?`} textoConfirmar={`Borrar ${n} fila${n === 1 ? "" : "s"}`}
                     ocupado={pending} alConfirmar={borrar} alCancelar={() => setConfirmaBorrar(false)}>
            <ul className="pas-conf-lista">
              {marcadasVistas.slice(0, 8).map((f) => (
                <li key={f.id}><span className="c">{f.codigo}</span><span>{f.descripcion} · {f.estado} · {f.almacen}</span><span className="u">{n0(f.unidades)} u</span></li>
              ))}
              {n > 8 && <li className="mas"><i>y {n - 8} más…</i></li>}
            </ul>
            <p className="pas-conf-resumen"><span>Unidades que dejan de sumar<b>{n0(u)}</b></span><span>Cajas<b>{n0(cj)}</b></span></p>
            <p className="pas-conf-nota">Esto <b>no se puede deshacer</b>. Si solo no quieres que sumen, cancela y usa <b>Descartar</b>: se quedan a la vista y las puedes reactivar.</p>
          </Confirmar>
        );
      })()}
      </>)}
    </>
  );
}

/**
 * LA HOJA «HISTÓRICO»: un renglón por cada día guardado, con lo de AG18 y AG22 (o solo el almacén
 * escogido), sus causales, y los atajos a la base de ese día y al Cuadre SAP de cada almacén.
 */
function HistoricoPasivos({ cierres, falta, histAlm, setHistAlm, abrir }: {
  cierres: CierrePasivos[]; falta: boolean; histAlm: "" | "AG18" | "AG22"; setHistAlm: (a: "" | "AG18" | "AG22") => void; abrir: (dia: string) => void;
}) {
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const largo = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (falta) return <p className="bal-conso-aviso mal">Falta correr supabase/migraciones/2026-10-pasivos-cierres.sql en Supabase para guardar el histórico.</p>;
  if (!cierres.length) return <p className="bal-sin-filas pas-hvacio">Todavía no hay días guardados. En la hoja <b>Base</b>, escoge un día, sube todo y dale <b>Guardar el día</b>.</p>;
  const de = (c: CierrePasivos) => (histAlm ? c.resumen.almacenes[histAlm] : c.resumen.total) ?? { filas: 0, unidades: 0, cajas: 0, hl: 0, costo: 0 };
  return (
    <>
      <div className="bal-chips pas-halm" role="group" aria-label="Almacén">
        {(["", "AG18", "AG22"] as const).map((a) => (
          <button key={a || "todos"} type="button" className={histAlm === a ? "on" : ""} aria-pressed={histAlm === a} onClick={() => setHistAlm(a)}>{a || "Todos"}</button>
        ))}
      </div>
      <div className="bal-tabla-wrap">
        <table className="bal-tabla bal-hoja pas-hist">
          <thead>
            <tr>
              <th>Día</th><th>Guardado</th>{!histAlm && <><th className="r">AG18 · unidades</th><th className="r">AG22 · unidades</th></>}
              <th className="r">Filas</th><th className="r">Unidades</th><th className="r">Cajas</th><th className="r">HL</th><th className="r">Costo</th>
              <th>Causales</th><th></th>
            </tr>
          </thead>
          <tbody>
            {cierres.filter((c) => !histAlm || c.resumen.almacenes[histAlm]).map((c) => {
              const s = de(c);
              const causales = histAlm ? Object.entries(c.resumen.almacenes[histAlm]?.causales ?? {})
                : Object.entries(c.resumen.almacenes).flatMap(([a, x]) => Object.entries(x.causales).map(([k, v]) => [`${a} ${k}`, v] as [string, number]));
              return (
                <tr key={c.fecha}>
                  <td><b>{largo(c.fecha)}</b></td>
                  <td>{cuando(c.cerrado_en)}<small className="pas-hq">{c.cerrado_nombre ?? ""}</small></td>
                  {!histAlm && <><td className="r">{n0(c.resumen.almacenes.AG18?.unidades ?? 0)}</td><td className="r">{n0(c.resumen.almacenes.AG22?.unidades ?? 0)}</td></>}
                  <td className="r">{n0(s.filas)}</td>
                  <td className="r"><b>{n0(s.unidades)}</b></td>
                  <td className="r">{n0(s.cajas)}</td>
                  <td className="r">{n2(s.hl)}</td>
                  <td className="r">{plata(s.costo)}</td>
                  <td className="pas-hcaus">{causales.sort((x, y) => x[0].localeCompare(y[0])).map(([k, v]) => <span key={k}>{k} <b>{n0(v)}</b></span>)}</td>
                  <td className="pas-hacc">
                    <button type="button" className="btn plano" onClick={() => abrir(c.fecha)}>Ver base</button>
                    {(!histAlm || histAlm === "AG18") && <a className="btn plano" href={`/inventario/balance/cuadre?fecha=${c.fecha}&alm=AG18`}>Cuadre AG18</a>}
                    {(!histAlm || histAlm === "AG22") && <a className="btn plano" href={`/inventario/balance/cuadre?fecha=${c.fecha}&alm=AG22`}>Cuadre AG22</a>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
