"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";
import { traducirError } from "@/lib/errores";
import type { MaterialCasco, SitioCasco } from "@/modulos/casco/datos";

/**
 * CASCO DE VIDRIO · REGISTRAR · MOVIMIENTO.
 *
 * La hoja «Movimiento» del Excel: FECHA · ALM ORIGEN · ALM RECEPTOR // CLIENTE · MATERIAL · DESCRIPCIÓN ·
 * CANTIDAD (EST) · N° ENTREGA · PLACA. Aquí se llena igual, con desplegables:
 *
 *   · los almacenes y el cliente salen de un MAESTRO que se edita (agregar, cambiar, borrar);
 *   · el código del material trae la descripción del maestro;
 *   · la fecha viene en hoy y se puede cambiar.
 *
 * QUÉ HACE CADA LÍNEA EN CONTROL (lo decide la base, `casco_movimiento_registrar`; aquí solo se anuncia):
 *   · sale de un almacén con tabla de Control → se RESTA de esa tabla;
 *   · llega a un almacén con tabla de Control → se SUMA a esa tabla;
 *   · el cliente no tiene tabla: lo que se le despacha solo se resta del origen;
 *   · si «Descuenta inventario» está apagada, el movimiento se REGISTRA y no toca Control.
 */

type Item = {
  id: string; tipo: "origen" | "receptor" | "cliente"; codigo: string | null; nombre: string;
  ubicacion: string | null; orden: number | null; descuenta: boolean;
};
type Linea = {
  k: number; origen_id: string; destino_id: string; sku: string; estibas: string;
  entrega: string; placa: string; afecta: boolean;
};
type Mov = {
  id: string; fecha: string; origen: string; destino: string; sku: string; descripcion: string; estibas: number;
  entrega: string | null; placa: string | null; afecta: boolean; ubic_origen: string | null; ubic_destino: string | null;
};

const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const corto = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const FILTROS_VACIOS = { desde: "", hasta: "", origen: "", destino: "", efecto: "", texto: "" };
const TITULOS = { origen: "Almacén origen", receptor: "Almacén receptor", cliente: "Cliente" } as const;
let contador = 1;

export function Movimiento({ sitios, materiales, puedeEditar, hoy }: {
  sitios: SitioCasco[]; materiales: MaterialCasco[]; puedeEditar: boolean; hoy: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const [items, setItems] = useState<Item[] | null>(null);
  const [movs, setMovs] = useState<Mov[] | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "mal"; texto: string } | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [fm, setFm] = useState(FILTROS_VACIOS);

  const dato = useMemo(() => Object.fromEntries(materiales.map((m) => [m.sku, m])), [materiales]);
  const origenes = useMemo(() => (items ?? []).filter((i) => i.tipo === "origen"), [items]);
  const receptores = useMemo(() => (items ?? []).filter((i) => i.tipo === "receptor"), [items]);
  const clientes = useMemo(() => (items ?? []).filter((i) => i.tipo === "cliente"), [items]);
  const porId = useMemo(() => Object.fromEntries((items ?? []).map((i) => [i.id, i])), [items]);
  const sitioPorClave = useMemo(() => Object.fromEntries(sitios.map((s) => [s.clave, s])), [sitios]);

  /* ---------- LEER ---------- */
  const cargarItems = useCallback(async () => {
    const { data, error } = await supabase.from("casco_mov_maestro").select("*").order("tipo").order("orden");
    if (error) { setFalla(traducirError(error.message)); setItems([]); return }
    setFalla(null);
    setItems((data ?? []) as Item[]);
  }, [supabase]);
  const cargarMovs = useCallback(async () => {
    const todas: Mov[] = [];
    for (let d = 0; d < 4000; d += 1000) {
      const { data, error } = await supabase.from("v_casco_movimientos").select("*")
        .order("fecha", { ascending: false }).order("creado_en", { ascending: false }).order("id").range(d, d + 999);
      if (error) { setMovs([]); return }
      todas.push(...((data ?? []) as Mov[]));
      if ((data?.length ?? 0) < 1000) break;
    }
    setMovs(todas);
  }, [supabase]);
  useEffect(() => { void cargarItems(); void cargarMovs() }, [cargarItems, cargarMovs]);

  /* ---------- LAS LÍNEAS ---------- */
  const nueva = useCallback((de?: Linea): Linea => {
    const origen_id = de?.origen_id ?? "";
    return {
      k: contador++, origen_id, destino_id: de?.destino_id ?? "", sku: "", estibas: "",
      entrega: de?.entrega ?? "", placa: de?.placa ?? "",
      afecta: de ? de.afecta : true,
    };
  }, []);
  useEffect(() => { if (items && lineas.length === 0) setLineas([nueva()]) }, [items, lineas.length, nueva]);

  const poner = (k: number, c: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.k === k ? { ...l, ...c } : l)));
  const escogerOrigen = (k: number, id: string) => poner(k, { origen_id: id, afecta: id ? porId[id]?.descuenta ?? true : true });

  /** Qué hará la línea en Control, dicho en palabras. */
  const efecto = (l: Linea) => {
    const o = porId[l.origen_id], d = porId[l.destino_id];
    const n = Number(l.estibas.replace(",", "."));
    if (!o || !d) return "";
    if (!l.afecta) return "Solo se registra: no mueve Control";
    const partes: string[] = [];
    if (o.ubicacion) partes.push(`${o.codigo ?? o.nombre} −${Number.isFinite(n) && n > 0 ? n : "N"}`);
    if (d.ubicacion) partes.push(`${d.codigo ?? d.nombre} +${Number.isFinite(n) && n > 0 ? n : "N"}`);
    return partes.length ? partes.join(" · ") : "No mueve Control (sin tabla)";
  };
  const problemaLinea = (l: Linea): string | null => {
    if (!l.origen_id) return "Falta el origen";
    if (!l.destino_id) return "Falta el receptor o el cliente";
    if (!l.sku.trim()) return "Falta el material";
    if (!dato[l.sku.trim()]) return "Ese código no está en el maestro";
    const n = Number(l.estibas.replace(",", "."));
    if (!(n > 0)) return "Falta la cantidad";
    const o = porId[l.origen_id], d = porId[l.destino_id];
    if (o?.ubicacion && o.ubicacion === d?.ubicacion) return "Origen y receptor son el mismo almacén";
    if (l.afecta && (o?.ubicacion || d?.ubicacion) && !dato[l.sku.trim()]?.hl_estiba) return "Al maestro le falta botellas por estiba o HL";
    return null;
  };

  const llenas = lineas.filter((l) => l.sku.trim() || l.estibas.trim() || l.origen_id || l.destino_id);
  const conProblema = llenas.filter((l) => problemaLinea(l));

  const registrar = async () => {
    if (!llenas.length || conProblema.length || guardando) return;
    const ok = await pedir({
      titulo: `¿Registrar ${llenas.length} movimiento${llenas.length === 1 ? "" : "s"}?`,
      dice: (<>
        Fecha <b>{corto(fecha)}</b>. Lo que sale de un almacén se resta en su tabla de Control y lo que llega se suma,
        salvo las líneas con «Descuenta inventario» apagada. Si una línea saca más de lo que hay, no entra ninguna.
        Cada movimiento se puede deshacer después.
      </>),
      confirmar: "Registrar", cancelar: "Cancelar",
    });
    if (!ok) return;
    setGuardando(true); setAviso(null);
    const { error } = await supabase.rpc("casco_movimiento_registrar", {
      p_fecha: fecha,
      p_filas: llenas.map((l) => ({
        origen_id: l.origen_id, destino_id: l.destino_id, sku: l.sku.trim(),
        estibas: Number(l.estibas.replace(",", ".")), entrega: l.entrega.trim(), placa: l.placa.trim(), afecta: l.afecta,
      })),
    });
    setGuardando(false);
    if (error) { setAviso({ tipo: "mal", texto: traducirError(error.message) }); return }
    setAviso({ tipo: "ok", texto: `Listo: ${llenas.length} movimiento${llenas.length === 1 ? "" : "s"} registrado${llenas.length === 1 ? "" : "s"} el ${corto(fecha)}.` });
    setLineas([nueva()]);
    void cargarMovs();
  };

  const quitar = async (m: Mov) => {
    const ok = await pedir({
      titulo: `¿Deshacer este movimiento de ${m.sku}?`,
      dice: (<>
        <b>{m.descripcion}</b> · {nf2.format(m.estibas)} est. · {m.origen} → {m.destino} · {corto(m.fecha)}.{" "}
        {m.afecta ? "Se revierte lo que movió en Control ese día." : "No movió Control; solo se quita del registro."}
      </>),
      confirmar: "Deshacer", cancelar: "Cancelar", peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("casco_movimiento_quitar", { p_id: m.id });
    if (error) { setAviso({ tipo: "mal", texto: traducirError(error.message) }); return }
    setAviso({ tipo: "ok", texto: "Se deshizo el movimiento." });
    void cargarMovs();
  };

  /* ---------- FILTROS DEL HISTORIAL ---------- */
  const nombresOrigen = useMemo(() => [...new Set((movs ?? []).map((m) => m.origen))].sort(), [movs]);
  const nombresDestino = useMemo(() => [...new Set((movs ?? []).map((m) => m.destino))].sort(), [movs]);
  const visibles = useMemo(() => {
    const q = sinTilde(fm.texto.trim());
    return (movs ?? []).filter((m) =>
      (!fm.desde || m.fecha >= fm.desde) && (!fm.hasta || m.fecha <= fm.hasta) &&
      (!fm.origen || m.origen === fm.origen) && (!fm.destino || m.destino === fm.destino) &&
      (!fm.efecto || (fm.efecto === "descuenta" ? m.afecta : !m.afecta)) &&
      (!q || sinTilde([m.sku, m.descripcion, m.entrega ?? "", m.placa ?? ""].join(" ")).includes(q)));
  }, [movs, fm]);
  const hayFiltro = JSON.stringify(fm) !== JSON.stringify(FILTROS_VACIOS);
  const totalEst = visibles.reduce((t, m) => t + m.estibas, 0);

  const descargar = () => {
    const filas = visibles.map((m) => ({
      "FECHA": m.fecha.split("-").reverse().map((x, i) => (i === 2 ? x : String(Number(x)))).join("/"),
      "ALM ORIGEN": m.origen, "ALM RECEPTOR // CLIENTE": m.destino, "MATERIAL": m.sku,
      "DESCRIPCION DEL MATERIAL": m.descripcion, "CANTIDAD (EST)": m.estibas,
      "N° ENTREGA": m.entrega ?? "", "PLACA": m.placa ?? "",
      "DESCUENTA INVENTARIO": m.afecta ? "SI" : "NO",
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja["!cols"] = [{ wch: 11 }, { wch: 28 }, { wch: 38 }, { wch: 10 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Movimiento");
    XLSX.writeFile(libro, `movimientos-casco-${hoy}.xlsx`);
  };

  /* ---------- EL MAESTRO DE LOS DESPLEGABLES ---------- */
  const guardarItem = async (i: Partial<Item> & { tipo: Item["tipo"] }) => {
    const { error } = await supabase.rpc("casco_mov_maestro_guardar", {
      p_id: i.id ?? null, p_tipo: i.tipo, p_codigo: i.codigo ?? "", p_nombre: i.nombre ?? "",
      p_ubicacion: i.ubicacion ?? "", p_descuenta: i.descuenta ?? true,
    });
    if (error) { setAviso({ tipo: "mal", texto: traducirError(error.message) }); return false }
    setAviso(null);
    await cargarItems();
    return true;
  };
  const borrarItem = async (i: Item) => {
    const ok = await pedir({
      titulo: `¿Borrar «${i.nombre}» de ${TITULOS[i.tipo].toLowerCase()}?`,
      dice: <>Sale del desplegable. Los movimientos que ya registraste con él no cambian: guardan el nombre tal como estaba.</>,
      confirmar: "Borrar", cancelar: "Cancelar", peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("casco_mov_maestro_borrar", { p_id: i.id });
    if (error) { setAviso({ tipo: "mal", texto: traducirError(error.message) }); return }
    setLineas((ls) => ls.map((l) => ({
      ...l, origen_id: l.origen_id === i.id ? "" : l.origen_id, destino_id: l.destino_id === i.id ? "" : l.destino_id,
    })));
    await cargarItems();
  };

  return (
    <>
      {dialogo}
      {falla && <p className="cas-aviso mal">{falla}</p>}
      <datalist id="reg-materiales">
        {materiales.map((m) => <option key={m.sku} value={m.sku}>{m.nombre}</option>)}
      </datalist>

      {/* ---------------- LAS LÍNEAS DE HOY ---------------- */}
      <section className="cas-bloque">
        <header className="cas-bloque-cab">
          <div>
            <h2>Registrar movimiento</h2>
            <p className="cas-nota">
              Una línea por material. Escoge el origen y el receptor o cliente; el código trae la descripción.
              AG22 o AG18 → AG07 resta del origen y suma a AG07; AG07 → cliente resta de AG07.
            </p>
          </div>
        </header>

        <label className="cas-c reg-dia">
          <span>Fecha del movimiento</span>
          <input type="date" value={fecha} max={hoy} disabled={!puedeEditar || guardando}
                 onChange={(e) => { if (e.target.value) setFecha(e.target.value) }} />
        </label>

        <div className="cas-tabla-caja reg-tabla-alta">
          <table className="cas-tabla reg-lineas">
            <thead>
              <tr>
                <th>Alm origen</th><th>Alm receptor // cliente</th><th>Material</th><th>Descripción</th>
                <th className="n">Cantidad (est)</th><th>N° entrega</th><th>Placa</th><th>Descuenta inventario</th><th />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => {
                const p = (l.origen_id || l.destino_id || l.sku || l.estibas) ? problemaLinea(l) : null;
                return (
                  <tr key={l.k}>
                    <td>
                      <select className="cas-txt" value={l.origen_id} disabled={!puedeEditar} onChange={(e) => escogerOrigen(l.k, e.target.value)}>
                        <option value="">Origen…</option>
                        {origenes.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="cas-txt" value={l.destino_id} disabled={!puedeEditar} onChange={(e) => poner(l.k, { destino_id: e.target.value })}>
                        <option value="">Receptor o cliente…</option>
                        {receptores.length > 0 && <optgroup label="Almacén receptor">{receptores.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</optgroup>}
                        {clientes.length > 0 && <optgroup label="Cliente">{clientes.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</optgroup>}
                      </select>
                    </td>
                    <td>
                      <input className="cas-txt reg-sku" list="reg-materiales" inputMode="numeric" placeholder="Código" value={l.sku}
                             disabled={!puedeEditar} onChange={(e) => poner(l.k, { sku: e.target.value })} />
                    </td>
                    <td className="tex">{dato[l.sku.trim()]?.nombre ?? <span className="reg-tenue">{l.sku.trim() ? "No está en el maestro" : "—"}</span>}</td>
                    <td className="n">
                      <input className="cas-txt reg-num" inputMode="decimal" placeholder="0" value={l.estibas}
                             disabled={!puedeEditar} onChange={(e) => poner(l.k, { estibas: e.target.value })} />
                    </td>
                    <td><input className="cas-txt reg-ent" value={l.entrega} disabled={!puedeEditar} onChange={(e) => poner(l.k, { entrega: e.target.value })} /></td>
                    <td><input className="cas-txt reg-placa" value={l.placa} disabled={!puedeEditar} onChange={(e) => poner(l.k, { placa: e.target.value.toUpperCase() })} /></td>
                    <td>
                      <label className="reg-chk">
                        <input type="checkbox" checked={l.afecta} disabled={!puedeEditar} onChange={(e) => poner(l.k, { afecta: e.target.checked })} />
                        <span>{l.afecta ? "Sí" : "No, solo registro"}</span>
                      </label>
                      <small className="reg-tenue">{efecto(l)}</small>
                      {p && <em className="cas-mal">{p}</em>}
                    </td>
                    <td className="x">
                      {puedeEditar && lineas.length > 1 && (
                        <button type="button" aria-label="Quitar esta línea" title="Quitar la línea" onClick={() => setLineas((ls) => ls.filter((x) => x.k !== l.k))}>×</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {puedeEditar && (
          <div className="reg-botones">
            <button type="button" className="btn" onClick={() => setLineas((ls) => [...ls, nueva(ls[ls.length - 1])])}>Agregar línea</button>
            <span className="cas-nota">La línea nueva copia origen, receptor, entrega y placa de la anterior.</span>
          </div>
        )}

        <div className="cas-pie-bloque">
          {aviso && <p className={"cas-aviso " + aviso.tipo} role="status">{aviso.texto}</p>}
          {puedeEditar ? (
            <button type="button" className="btn grande" disabled={!llenas.length || conProblema.length > 0 || guardando} onClick={() => void registrar()}>
              {guardando ? "Registrando…"
                : !llenas.length ? "Llena al menos una línea"
                : conProblema.length ? `Revisa ${conProblema.length} línea${conProblema.length === 1 ? "" : "s"}`
                : `Registrar ${llenas.length} movimiento${llenas.length === 1 ? "" : "s"}`}
            </button>
          ) : <p className="cas-nota">Tu rol puede ver los movimientos pero no registrarlos.</p>}
        </div>
      </section>

      {/* ---------------- EL MAESTRO DE LOS DESPLEGABLES ---------------- */}
      <section className="cas-bloque">
        <header className="cas-bloque-cab">
          <div>
            <h2>Desplegables</h2>
            <p className="cas-nota">
              Los almacenes y el cliente que ofrecen las líneas. Puedes agregar, cambiar y borrar. «Tabla de Control» dice a
              cuál de las cuatro tablas suma o resta ese almacén; el cliente no tiene.
            </p>
          </div>
        </header>
        {(["origen", "receptor", "cliente"] as const).map((t) => (
          <ListaMaestro key={t} tipo={t} items={(items ?? []).filter((i) => i.tipo === t)} sitios={sitios}
                        puedeEditar={puedeEditar} guardar={guardarItem} borrar={borrarItem} />
        ))}
      </section>

      {/* ---------------- EL HISTORIAL ---------------- */}
      <section className="cas-bloque">
        <header className="cas-bloque-cab">
          <div>
            <h2>Movimientos registrados</h2>
            <p className="cas-nota">
              {movs === null ? "Cargando…" : <>{visibles.length} de {movs.length} movimiento{movs.length === 1 ? "" : "s"} · <b>{nf2.format(totalEst)}</b> estibas</>}
            </p>
          </div>
          {visibles.length > 0 && <button type="button" className="btn" onClick={descargar}>Descargar Excel ({visibles.length})</button>}
        </header>

        <div className="reg-filtros">
          <label className="cas-c"><span>Desde</span><input type="date" value={fm.desde} onChange={(e) => setFm({ ...fm, desde: e.target.value })} /></label>
          <label className="cas-c"><span>Hasta</span><input type="date" value={fm.hasta} onChange={(e) => setFm({ ...fm, hasta: e.target.value })} /></label>
          <label className="cas-c"><span>Alm origen</span>
            <select value={fm.origen} onChange={(e) => setFm({ ...fm, origen: e.target.value })}>
              <option value="">Todos</option>{nombresOrigen.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="cas-c"><span>Receptor // cliente</span>
            <select value={fm.destino} onChange={(e) => setFm({ ...fm, destino: e.target.value })}>
              <option value="">Todos</option>{nombresDestino.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="cas-c"><span>Descuenta inventario</span>
            <select value={fm.efecto} onChange={(e) => setFm({ ...fm, efecto: e.target.value })}>
              <option value="">Todos</option><option value="descuenta">Sí</option><option value="registro">No, solo registro</option>
            </select>
          </label>
          <label className="cas-c reg-f-ancho"><span>Material, entrega o placa</span>
            <input type="search" placeholder="Código, nombre, N° de entrega, placa…" value={fm.texto} onChange={(e) => setFm({ ...fm, texto: e.target.value })} />
          </label>
          {hayFiltro && <button type="button" className="btn" onClick={() => setFm(FILTROS_VACIOS)}>Limpiar filtros</button>}
        </div>

        <div className="cas-tabla-caja reg-tabla-alta">
          <table className="cas-tabla">
            <thead>
              <tr>
                <th>Fecha</th><th>Alm origen</th><th>Alm receptor // cliente</th><th>Material</th><th>Descripción</th>
                <th className="n">Cantidad (est)</th><th>N° entrega</th><th>Placa</th><th>Efecto en Control</th>{puedeEditar && <th className="x" />}
              </tr>
            </thead>
            <tbody>
              {movs === null && <tr><td colSpan={10} className="cas-vacio">Cargando…</td></tr>}
              {movs?.length === 0 && <tr><td colSpan={10} className="cas-vacio">Todavía no hay movimientos registrados.</td></tr>}
              {movs && movs.length > 0 && visibles.length === 0 && <tr><td colSpan={10} className="cas-vacio">Ningún movimiento con esos filtros.</td></tr>}
              {visibles.map((m) => (
                <tr key={m.id}>
                  <td>{corto(m.fecha)}</td>
                  <td>{m.origen}</td>
                  <td>{m.destino}</td>
                  <td className="cod">{m.sku}</td>
                  <td>{m.descripcion}</td>
                  <td className="n est">{nf2.format(m.estibas)}</td>
                  <td className="cod">{m.entrega}</td>
                  <td className="cod">{m.placa}</td>
                  <td>
                    {!m.afecta ? <span className="reg-etq ya">Solo registro</span> : (
                      <span className="reg-etq">
                        {[m.ubic_origen && `${sitioPorClave[m.ubic_origen]?.centro ?? m.ubic_origen} −`,
                          m.ubic_destino && `${sitioPorClave[m.ubic_destino]?.centro ?? m.ubic_destino} +`].filter(Boolean).join(" · ") || "Sin tabla"}
                      </span>
                    )}
                  </td>
                  {puedeEditar && <td className="x"><button type="button" aria-label={`Deshacer el movimiento de ${m.sku}`} title="Deshacer" onClick={() => void quitar(m)}>×</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** UNA DE LAS TRES LISTAS DEL MAESTRO: ver, agregar, cambiar y borrar. */
function ListaMaestro({ tipo, items, sitios, puedeEditar, guardar, borrar }: {
  tipo: Item["tipo"]; items: Item[]; sitios: SitioCasco[]; puedeEditar: boolean;
  guardar: (i: Partial<Item> & { tipo: Item["tipo"] }) => Promise<boolean>; borrar: (i: Item) => Promise<void>;
}) {
  const [edit, setEdit] = useState<(Partial<Item> & { tipo: Item["tipo"] }) | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const conTabla = tipo !== "cliente";
  const nuevo = () => setEdit({ tipo, codigo: "", nombre: "", ubicacion: "", descuenta: true });
  const ok = async () => {
    if (!edit || ocupado) return;
    setOcupado(true);
    if (await guardar(edit)) setEdit(null);
    setOcupado(false);
  };
  return (
    <div className="reg-lista-maestro">
      <h3>{TITULOS[tipo]}</h3>
      <table className="cas-tabla reg-mini">
        <thead>
          <tr><th>Código</th><th>Nombre</th>{conTabla && <th>Tabla de Control</th>}{tipo === "origen" && <th>Descuenta por defecto</th>}<th /></tr>
        </thead>
        <tbody>
          {items.length === 0 && !edit && <tr><td colSpan={5} className="cas-vacio">Sin renglones. Agrega el primero.</td></tr>}
          {items.map((i) => edit?.id === i.id ? (
            <FilaEdicion key={i.id} edit={edit} setEdit={setEdit} sitios={sitios} tipo={tipo} ok={ok} ocupado={ocupado} />
          ) : (
            <tr key={i.id}>
              <td className="cod">{i.codigo}</td>
              <td>{i.nombre}</td>
              {conTabla && <td>{i.ubicacion ? sitios.find((s) => s.clave === i.ubicacion)?.nombre ?? i.ubicacion : <span className="reg-tenue">Ninguna</span>}</td>}
              {tipo === "origen" && <td>{i.descuenta ? "Sí" : "No, solo registro"}</td>}
              <td className="reg-acc">
                {puedeEditar && <>
                  <button type="button" className="btn" onClick={() => setEdit({ ...i })}>Editar</button>
                  <button type="button" className="btn reg-peligro" onClick={() => void borrar(i)}>Borrar</button>
                </>}
              </td>
            </tr>
          ))}
          {edit && !edit.id && <FilaEdicion edit={edit} setEdit={setEdit} sitios={sitios} tipo={tipo} ok={ok} ocupado={ocupado} />}
        </tbody>
      </table>
      {puedeEditar && !edit && <button type="button" className="btn" onClick={nuevo}>Agregar a {TITULOS[tipo].toLowerCase()}</button>}
    </div>
  );
}

function FilaEdicion({ edit, setEdit, sitios, tipo, ok, ocupado }: {
  edit: Partial<Item> & { tipo: Item["tipo"] }; setEdit: (e: (Partial<Item> & { tipo: Item["tipo"] }) | null) => void;
  sitios: SitioCasco[]; tipo: Item["tipo"]; ok: () => void; ocupado: boolean;
}) {
  return (
    <tr className="reg-edicion">
      <td><input className="cas-txt reg-cod" value={edit.codigo ?? ""} placeholder="Código" onChange={(e) => setEdit({ ...edit, codigo: e.target.value })} /></td>
      <td><input className="cas-txt reg-nom" value={edit.nombre ?? ""} placeholder="Nombre" autoFocus onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></td>
      {tipo !== "cliente" && (
        <td>
          <select className="cas-txt" value={edit.ubicacion ?? ""} onChange={(e) => setEdit({ ...edit, ubicacion: e.target.value })}>
            <option value="">Ninguna</option>
            {sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}
          </select>
        </td>
      )}
      {tipo === "origen" && (
        <td><label className="reg-chk"><input type="checkbox" checked={edit.descuenta ?? true} onChange={(e) => setEdit({ ...edit, descuenta: e.target.checked })} /><span>{edit.descuenta ?? true ? "Sí" : "No"}</span></label></td>
      )}
      <td className="reg-acc">
        <button type="button" className="btn" disabled={ocupado || !(edit.nombre ?? "").trim()} onClick={ok}>{ocupado ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="btn" disabled={ocupado} onClick={() => setEdit(null)}>Cancelar</button>
      </td>
    </tr>
  );
}
