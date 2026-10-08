"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { useConfirmar } from "@/components/Confirmar";
import { traducirError } from "@/lib/errores";
import { hojaBaja, leerBaja, type FilaBaja, type LecturaBaja } from "@/modulos/casco/baja";
import type { MaterialCasco, SitioCasco } from "@/modulos/casco/datos";

/**
 * CASCO DE VIDRIO · REGISTRAR — UNA BAJA (y, más adelante, un MOVIMIENTO).
 *
 * «Si es una baja, es la hoja de baja, donde la cantidad la tenemos en unidades: de acuerdo al maestro
 *  con los factores, la convertimos en estibas. Cuando yo importe esa baja se me refleja mi tabla con
 *  la relación en estibas.»
 *
 * EL ORDEN ES: se escoge el archivo → se VE qué hará cada fila (a qué tabla, a qué columna, cuántas
 * estibas) → se aplica. Nada se guarda hasta apretar «Aplicar a Control». Importar a ciegas es como
 * entran los datos que después nadie sabe de dónde salieron.
 *
 * LAS ESTIBAS QUE SE VEN AQUÍ SON UNA AYUDA. Las que se guardan las calcula la base con el mismo maestro
 * (`casco_registrar_bajas`), y es la base la que evita sumar dos veces una fila que ya entró.
 */

type Tipo = "baja" | "movimiento";
type Vista = FilaBaja & {
  sitio: SitioCasco | null;
  columna: string;            // a qué columna de Control se suma
  estibas: number | null;
  problema: string | null;    // por qué NO se puede aplicar (sin factor, sin tabla…)
  yaEsta: boolean;            // ya se registró antes
};
type Entrada = {
  id: string; fecha: string; fecha_sap: string | null; centro: string; ubicacion: string; ubicacion_nombre: string; sku: string;
  descripcion: string; unidades: number; estibas: number; destino: string; texto: string | null;
  documento: string | null; clase: string | null;
};
type Resultado = {
  aplicadas: number; repetidas: number; futuras: number;
  sin_factor: string[]; sin_sitio: string[]; sin_columna: string[];
};

const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const corto = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

export function Registrar({ sitios, materiales, puedeEditar, hoy }: {
  sitios: SitioCasco[]; materiales: MaterialCasco[]; puedeEditar: boolean; hoy: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const entrada = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<Tipo>("baja");
  /* EL DÍA DE CONTROL AL QUE SE SUMA lo escoge quien registra (por defecto, hoy). La fecha del Excel
     (Fe.contabilización) queda guardada aparte, pero no manda: cada día de Control guarda su propio saldo y
     una baja con fecha de hace dos semanas no cambiaría el Control de hoy. */
  const [diaControl, setDiaControl] = useState(hoy);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaBaja | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [yaEstan, setYaEstan] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "mal"; texto: string } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [hechas, setHechas] = useState<Entrada[] | null>(null);
  const [falla, setFalla] = useState<string | null>(null);

  const dato = useMemo(() => Object.fromEntries(materiales.map((m) => [m.sku, m])), [materiales]);
  const sinCentros = sitios.length > 0 && sitios.every((s) => !s.centro);

  const cargarHechas = useCallback(async () => {
    const { data, error } = await supabase.from("v_casco_bajas").select("*")
      .order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(200);
    if (error) { setFalla(traducirError(error.message)); setHechas([]); return }
    setFalla(null);
    setHechas((data ?? []) as Entrada[]);
  }, [supabase]);
  useEffect(() => { void cargarHechas() }, [cargarHechas]);

  /** Cuáles llaves del archivo ya están en el libro (la llave es única en todo el libro, sin importar el día). */
  const consultarYa = useCallback(async (filas: FilaBaja[]) => {
    const llaves = filas.map((f) => f.llave);
    const hay = new Set<string>();
    for (let i = 0; i < llaves.length; i += 100) {
      const { data } = await supabase.from("casco_bajas").select("llave").in("llave", llaves.slice(i, i + 100));
      for (const x of data ?? []) hay.add(String(x.llave));
    }
    setYaEstan(hay);
  }, [supabase]);

  /* ---------- LEER EL ARCHIVO ---------- */
  const leer = async (f: File) => {
    setLeyendo(true); setAviso(null); setResultado(null); setLectura(null); setArchivo(f.name);
    try {
      const libro = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const nombre = hojaBaja(libro.SheetNames);
      if (!nombre) {
        setLectura({ hoja: null, filas: [], descartadas: [], error: `El libro no trae una hoja «Baja». Trae: ${libro.SheetNames.join(", ")}.` });
        return;
      }
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null });
      const l = leerBaja(matriz, nombre);
      setLectura(l);
      if (l.filas.length) await consultarYa(l.filas);
    } catch (e) {
      setLectura({ hoja: null, filas: [], descartadas: [], error: "No pude abrir el archivo: " + (e instanceof Error ? e.message : String(e)) });
    } finally { setLeyendo(false) }
  };

  /* ---------- QUÉ HARÁ CADA FILA ---------- */
  const vista: Vista[] = useMemo(() => (lectura?.filas ?? []).map((f) => {
    const sitio = sitios.find((s) => s.centro === f.centro) ?? null;
    const m = dato[f.sku];
    const botellas = m?.botellas_estiba ?? null;
    const estibas = botellas ? Math.round((f.unidades / botellas) * 100) / 100 : null;
    let problema: string | null = null;
    if (!sitio) problema = `El almacén ${f.centro} no tiene tabla en Control`;
    else if (f.destino === "baja" && !sitio.baja_rotulo) problema = `${sitio.nombre} no tiene columna de baja`;
    else if (!m) problema = "El material no está en el maestro";
    else if (!botellas || !m.hl_estiba) problema = "Al maestro le falta botellas por estiba o HL";
    return {
      ...f, sitio, estibas, problema, yaEsta: yaEstan.has(f.llave),
      columna: f.destino === "baja" ? (sitio?.baja_rotulo ?? "baja") : "Inventario",
    };
  }), [lectura, sitios, dato, yaEstan]);

  const aplicables = vista.filter((v) => !v.problema && !v.yaEsta);
  const conProblema = vista.filter((v) => v.problema && !v.yaEsta);
  const repetidas = vista.filter((v) => v.yaEsta);

  const porSitio = useMemo(() => {
    const m = new Map<string, { nombre: string; inv: number; baja: number; rotuloBaja: string | null; filas: number }>();
    for (const v of aplicables) {
      const k = v.sitio!.clave;
      const x = m.get(k) ?? { nombre: v.sitio!.nombre, inv: 0, baja: 0, rotuloBaja: v.sitio!.baja_rotulo, filas: 0 };
      if (v.destino === "baja") x.baja += v.estibas ?? 0; else x.inv += v.estibas ?? 0;
      x.filas++;
      m.set(k, x);
    }
    return [...m.values()];
  }, [aplicables]);


  /* ---------- APLICAR ---------- */
  const aplicar = async () => {
    if (!aplicables.length || aplicando) return;
    const ok = await pedir({
      titulo: `¿Aplicar ${aplicables.length} fila${aplicables.length === 1 ? "" : "s"} de baja a Control?`,
      dice: (<>
        Se suman, en estibas, a las tablas de Control del <b>{corto(diaControl)}</b>.
        {repetidas.length > 0 && <> {repetidas.length} fila{repetidas.length === 1 ? "" : "s"} ya estaba{repetidas.length === 1 ? "" : "n"} registrada{repetidas.length === 1 ? "" : "s"} y no se suma{repetidas.length === 1 ? "" : "n"} otra vez.</>}
        {conProblema.length > 0 && <> {conProblema.length} no se pueden aplicar todavía y se quedan fuera.</>}
        {" "}Si te equivocas, cada fila se puede deshacer abajo.
      </>),
      confirmar: "Aplicar a Control", cancelar: "Cancelar",
    });
    if (!ok) return;
    setAplicando(true); setAviso(null); setResultado(null);
    const { data, error } = await supabase.rpc("casco_registrar_bajas", {
      p_fecha: diaControl,
      p_filas: aplicables.map((v) => ({
        fecha: v.fecha, centro: v.centro, sku: v.sku, unidades: v.unidades, texto: v.texto,
        documento: v.documento, clase: v.clase, llave: v.llave,
      })),
    });
    setAplicando(false);
    if (error) { setAviso({ tipo: "mal", texto: traducirError(error.message) }); return }
    const r = data as Resultado;
    setResultado(r);
    setAviso({ tipo: "ok", texto: `Listo: ${r.aplicadas} fila${r.aplicadas === 1 ? "" : "s"} sumada${r.aplicadas === 1 ? "" : "s"} a Control.` });
    // Ya quedaron en el libro: se marcan como registradas y se refresca la lista de abajo.
    setYaEstan((s) => new Set([...s, ...aplicables.map((v) => v.llave)]));
    void cargarHechas();
  };

  const deshacer = async (e: Entrada) => {
    const ok = await pedir({
      titulo: `¿Deshacer esta baja de ${e.sku}?`,
      dice: (<>
        <b>{e.descripcion}</b> · {corto(e.fecha)} · {e.ubicacion_nombre}. Se restan <b>{nf2.format(e.estibas)} estibas</b> de{" "}
        {e.destino === "baja" ? "la columna de baja" : "el inventario"} de Control ese día, y la fila sale de esta lista.
        Si después vuelves a importar el archivo, entra de nuevo.
      </>),
      confirmar: "Deshacer", cancelar: "Cancelar", peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("casco_quitar_baja", { p_id: e.id });
    if (error) { setAviso({ tipo: "mal", texto: traducirError(error.message) }); return }
    setAviso({ tipo: "ok", texto: `Se deshizo la baja de ${e.sku} del ${corto(e.fecha)}.` });
    void cargarHechas();
    // la llave de esa fila vuelve a estar libre: si el archivo sigue abierto se vuelve a mirar su estado
    if (lectura?.filas.length) await consultarYa(lectura.filas);
  };

  const deshacerTodas = async () => {
    if (!hechas?.length) return;
    const ok = await pedir({
      titulo: `¿Deshacer las ${hechas.length} bajas de la lista?`,
      dice: (<>
        Se restan sus estibas de Control, cada una en su día y su tabla, y salen de esta lista. Después puedes
        importar el archivo otra vez y escoger el día de Control correcto. Si una no se puede deshacer
        (por ejemplo porque la celda ya tiene menos estibas), no se deshace ninguna.
      </>),
      confirmar: `Deshacer las ${hechas.length}`, cancelar: "Cancelar", peligro: true,
    });
    if (!ok) return;
    const { data, error } = await supabase.rpc("casco_quitar_bajas", { p_ids: hechas.map((e) => e.id) });
    if (error) { setAviso({ tipo: "mal", texto: traducirError(error.message) }); return }
    setAviso({ tipo: "ok", texto: `Se deshicieron ${data ?? hechas.length} bajas.` });
    void cargarHechas();
    if (lectura?.filas.length) await consultarYa(lectura.filas);
  };

  const limpiar = () => {
    setLectura(null); setArchivo(null); setResultado(null); setAviso(null);
    if (entrada.current) entrada.current.value = "";
  };

  return (
    <>
      {dialogo}
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · CASCO DE VIDRIO · REGISTRAR</p>
          <h1>Registrar</h1>
          <p className="sub">
            Aquí entra lo que mueve el casco: una <b>baja</b> o un <b>movimiento</b>. Lo que registres se suma o se resta
            en <Link href="/inventario/casco">Control</Link>, y de Control sale el <Link href="/inventario/casco/tablero">tablero</Link>.
          </p>
        </div>
      </section>

      <div className="reg-tipos" role="group" aria-label="Qué vas a registrar">
        <button type="button" className="reg-tipo" aria-pressed={tipo === "baja"} onClick={() => setTipo("baja")}>
          <b>Baja</b>
          <span>La hoja «Baja» de SAP: viene en unidades y aquí se pasa a estibas con el maestro.</span>
        </button>
        <button type="button" className="reg-tipo" aria-pressed={tipo === "movimiento"} disabled
                title="Viene en el siguiente paso" onClick={() => setTipo("movimiento")}>
          <b>Movimiento</b>
          <span>Origen → receptor o cliente, con sus desplegables. Se arma después de la baja.</span>
          <em>Siguiente paso</em>
        </button>
      </div>

      {falla && <p className="cas-aviso mal">{falla}</p>}
      {sinCentros && (
        <p className="cas-aviso mal">
          Las tablas de Control todavía no tienen el código del almacén (AG22, AG18…). Corre en Supabase
          <b> supabase/migraciones/2026-10-casco-registrar-baja.sql</b> y recarga.
        </p>
      )}

      {tipo === "baja" && (
        <section className="cas-bloque">
          <header className="cas-bloque-cab">
            <div>
              <h2>Baja de SAP</h2>
              <p className="cas-nota">Escoge el Excel con la hoja «Baja». Primero se ve qué hará cada fila; nada se guarda hasta aplicar.</p>
            </div>
          </header>

          <ul className="reg-regla">
            <li>El <b>Texto cab.documento</b> manda: «BAJA LAVADO» va a <b>Lavado con baja</b> y «BAJA EXTRASUCIO» a <b>Extrasucio con baja</b>.</li>
            <li>Cualquier otro texto (sorting, presorting, rotura de máquina…) se <b>suma al inventario</b> del almacén de la fila.</li>
            <li>Cada fila va a la tabla de su <b>Almacén</b>, en el día de Control que escojas aquí abajo. Las unidades se dividen por las botellas por estiba del maestro.</li>
          </ul>

          <label className="cas-c reg-dia">
            <span>Sumar al Control del día</span>
            <input type="date" value={diaControl} max={hoy} disabled={aplicando}
                   onChange={(e) => { if (e.target.value) setDiaControl(e.target.value) }} />
          </label>

          <div className="reg-archivo">
            <input ref={entrada} type="file" accept=".xlsx,.xlsm,.xls" disabled={!puedeEditar || leyendo || aplicando}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f) }} />
            {archivo && <button type="button" className="btn" onClick={limpiar} disabled={aplicando}>Quitar archivo</button>}
          </div>
          {!puedeEditar && <p className="cas-nota">Tu rol puede ver las bajas pero no registrarlas.</p>}
          {leyendo && <p className="cas-nota">Leyendo el archivo…</p>}

          {lectura?.error && <p className="cas-aviso mal">{lectura.error}</p>}

          {lectura && !lectura.error && (
            <>
              <p className="cas-nota">
                <b>{archivo}</b> · hoja «{lectura.hoja}» · {lectura.filas.length} fila{lectura.filas.length === 1 ? "" : "s"} leída{lectura.filas.length === 1 ? "" : "s"}
                {lectura.descartadas.length > 0 && <> · {lectura.descartadas.length} descartada{lectura.descartadas.length === 1 ? "" : "s"}</>}
                {repetidas.length > 0 && <> · {repetidas.length} ya registrada{repetidas.length === 1 ? "" : "s"}</>}
              </p>

              {lectura.descartadas.length > 0 && (
                <details>
                  <summary>Ver las {lectura.descartadas.length} fila{lectura.descartadas.length === 1 ? "" : "s"} descartada{lectura.descartadas.length === 1 ? "" : "s"}</summary>
                  <ul className="reg-lista">
                    {lectura.descartadas.map((d) => <li key={d.fila}>Fila {d.fila}: {d.motivo}</li>)}
                  </ul>
                </details>
              )}

              {conProblema.length > 0 && (
                <p className="cas-aviso mal">
                  {conProblema.length} fila{conProblema.length === 1 ? "" : "s"} no se pueden aplicar todavía (están en rojo abajo).
                  Completa el maestro o la tabla y vuelve a importar el mismo archivo: lo que ya entró no se suma otra vez.
                </p>
              )}

              {porSitio.length > 0 && (
                <div className="reg-resumen">
                  {porSitio.map((x) => (
                    <div key={x.nombre} className="reg-sitio">
                      <span className="cas-rot">{x.nombre}</span>
                      <b>+{nf2.format(x.inv)} est.</b>
                      <i>al inventario · {x.filas} fila{x.filas === 1 ? "" : "s"}</i>
                      {x.baja > 0 && <i>+{nf2.format(x.baja)} est. a «{x.rotuloBaja}»</i>}
                    </div>
                  ))}
                </div>
              )}

              <div className="cas-tabla-caja reg-tabla-alta">
                <table className="cas-tabla">
                  <thead>
                    <tr>
                      <th>Fecha SAP</th><th>Tabla de Control</th><th>COD</th><th>Descripción</th><th>Texto</th>
                      <th>Va a</th><th className="n">Unidades</th><th className="n">Estibas</th><th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vista.map((v) => (
                      <tr key={v.llave} className={v.yaEsta ? "reg-fuera" : undefined}>
                        <td>{corto(v.fecha)}</td>
                        <td>{v.sitio?.nombre ?? v.centro}</td>
                        <td className="cod">{v.sku}</td>
                        <td>{dato[v.sku]?.nombre ?? v.descripcion}</td>
                        <td className="tex">{v.texto}</td>
                        <td><span className={"reg-etq" + (v.destino === "baja" ? " baja" : "")}>{v.columna}</span></td>
                        <td className="n">{nf0.format(v.unidades)}</td>
                        <td className="n est">{v.estibas != null ? nf2.format(v.estibas) : "—"}</td>
                        <td>
                          {v.yaEsta ? <span className="reg-etq ya">Ya registrada</span>
                            : v.problema ? <span className="reg-etq mal">{v.problema}</span>
                            : <span className="reg-etq">Lista</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="cas-pie-bloque">
                {aviso && <p className={"cas-aviso " + aviso.tipo} role="status">{aviso.texto}</p>}
                {resultado && (
                  <>
                    {resultado.repetidas > 0 && <p className="cas-nota">{resultado.repetidas} fila{resultado.repetidas === 1 ? "" : "s"} ya estaba{resultado.repetidas === 1 ? "" : "n"} y no se sumó otra vez.</p>}
                    {resultado.sin_factor.length > 0 && <p className="cas-aviso mal">Sin factor en el maestro: {resultado.sin_factor.join(", ")}. No se aplicaron.</p>}
                    {resultado.sin_sitio.length > 0 && <p className="cas-aviso mal">Almacén sin tabla en Control: {resultado.sin_sitio.join(", ")}.</p>}
                    {resultado.sin_columna.length > 0 && <p className="cas-aviso mal">Almacén sin columna de baja: {resultado.sin_columna.join(", ")}.</p>}
                    {resultado.futuras > 0 && <p className="cas-aviso mal">{resultado.futuras} fila(s) con fecha que todavía no llega: no se aplicaron.</p>}
                    {resultado.aplicadas > 0 && (
                      <p className="cas-nota"><Link href={`/inventario/casco?fecha=${diaControl}`}>Ver Control del {corto(diaControl)} →</Link></p>
                    )}
                  </>
                )}
                {puedeEditar && (
                  <button type="button" className="btn grande" disabled={!aplicables.length || aplicando} onClick={() => void aplicar()}>
                    {aplicando ? "Aplicando…"
                      : aplicables.length ? `Aplicar a Control (${aplicables.length} fila${aplicables.length === 1 ? "" : "s"})`
                      : "No hay filas nuevas para aplicar"}
                  </button>
                )}
              </div>
            </>
          )}

          {!lectura && aviso && <p className={"cas-aviso " + aviso.tipo} role="status">{aviso.texto}</p>}
        </section>
      )}

      {/* LO YA REGISTRADO: se puede deshacer fila por fila. */}
      <section className="cas-bloque">
        <header className="cas-bloque-cab">
          <div>
            <h2>Bajas registradas</h2>
            <p className="cas-nota">Las últimas {hechas ? hechas.length : "…"} que entraron a Control. Deshacer una resta sus estibas de la celda.</p>
          </div>
          {puedeEditar && !!hechas?.length && (
            <button type="button" className="btn" disabled={aplicando} onClick={() => void deshacerTodas()}>
              Deshacer las {hechas.length}
            </button>
          )}
        </header>
        <div className="cas-tabla-caja reg-tabla-alta">
          <table className="cas-tabla">
            <thead>
              <tr>
                <th>Control del</th><th>Tabla de Control</th><th>COD</th><th>Descripción</th><th>Texto</th><th>Va a</th>
                <th className="n">Unidades</th><th className="n">Estibas</th><th>Documento</th>{puedeEditar && <th className="x" />}
              </tr>
            </thead>
            <tbody>
              {hechas === null && <tr><td colSpan={10} className="cas-vacio">Cargando…</td></tr>}
              {hechas?.length === 0 && <tr><td colSpan={10} className="cas-vacio">Todavía no hay bajas registradas.</td></tr>}
              {hechas?.map((e) => (
                <tr key={e.id}>
                  <td>{corto(e.fecha)}</td>
                  <td>{e.ubicacion_nombre}</td>
                  <td className="cod">{e.sku}</td>
                  <td>{e.descripcion}</td>
                  <td className="tex">{e.texto}</td>
                  <td><span className={"reg-etq" + (e.destino === "baja" ? " baja" : "")}>{e.destino === "baja" ? "Con baja" : "Inventario"}</span></td>
                  <td className="n">{nf0.format(e.unidades)}</td>
                  <td className="n est">{nf2.format(e.estibas)}</td>
                  <td className="cod">{e.documento}</td>
                  {puedeEditar && (
                    <td className="x"><button type="button" aria-label={`Deshacer la baja de ${e.sku}`} title="Deshacer" onClick={() => void deshacer(e)}>×</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
