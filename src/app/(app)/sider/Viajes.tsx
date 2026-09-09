"use client";

/**
 * LA TABLA DE VIAJES, CON FILTROS Y CORRECCIÓN.
 *
 * POR QUÉ SE FILTRA AQUÍ Y NO EN LA BASE
 * La pantalla ya trae los viajes cargados. Filtrar en el navegador es
 * instantáneo —se escribe una letra de la placa y la tabla responde—;
 * ir a la base sería una consulta por tecla y una espera por cada una.
 * El día que esto pase de unos miles de filas hay que mover el filtro a
 * la base, y ese día se nota: hoy son cientos.
 *
 * QUÉ SE PUEDE CORREGIR
 * Solo lo que alguien TECLEÓ: placa, origen, material, estibas y la
 * observación. Las cifras —sider, cajas, unidades, HL— se calculan al
 * leer, así que se arreglan solas al corregir el material o las
 * estibas. Las horas y las fotos NO se tocan: son la evidencia, y una
 * evidencia editable deja de ser evidencia.
 *
 * ELIMINAR ES ANULAR
 * El viaje se queda, en gris, con su motivo y con quién lo anuló, y
 * deja de contar en los KPI. Borrarlo de verdad se llevaría por delante
 * sus certificaciones y sus seis fotos, y nadie podría responder
 * después por qué falta ese volumen.
 *
 * El candado de verdad está en la base: sider_viaje_editar y
 * sider_viaje_anular comprueban manda() por su cuenta. Esconder el
 * botón aquí es comodidad, no seguridad.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
/* MESES_LARGO se toma de comun.ts y NO de datos.ts, que lo reexporta:
   datos.ts importa el cliente de Supabase de SERVIDOR, y arrastrarlo
   desde un componente "use client" revienta el build entero. */
import { MESES_LARGO, type Viaje } from "@/modulos/sider/comun";
import { OjoEvidencia } from "./Evidencia";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const hora = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      }) : "—";

function enCamino(iv: string | null): string {
  if (!iv) return "—";
  const m = iv.match(/(?:(\d+) days? )?(\d+):(\d+):/);
  if (!m) return iv;
  const d = Number(m[1] ?? 0), h = Number(m[2]), mi = Number(m[3]);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${mi} min`;
  return `${mi} min`;
}

type Origen = { planta: string; cd_origen: string };
type Sku = { sku: string; descripcion: string };

/** Lo que dice el sello de estado de una fila. */
function sello(v: Viaje) {
  if (v.estado === "anulado") return { cl: "anulado", txt: "anulado" };
  if (v.faltan_factores) return { cl: "falta", txt: "sin factores" };
  if (v.importado) return { cl: "importado", txt: "importado" };
  if (v.estado === "recibido") return { cl: "recibido", txt: "recibido" };
  return { cl: "transito", txt: "en tránsito" };
}

const VACIO = { placa: "", origen: "", material: "", estado: "" };

export function Viajes({ viajes, nombres, origenes, skus, manda, esEditor }: {
  viajes: Viaje[];
  nombres: Record<string, string>;
  origenes: Origen[];
  skus: Sku[];
  /** Administra la plataforma: puede corregir y anular. */
  manda: boolean;
  esEditor: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState(VACIO);
  /* Qué fila está abierta para corregir, y con qué valores. */
  const [edit, setEdit] = useState<null | {
    id: string; placa: string; planta: string; sku: string;
    estibas: string; observacion: string;
  }>(null);
  const [anular, setAnular] = useState<null | { v: Viaje; motivo: string }>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mal, setMal] = useState<string | null>(null);

  /* Las listas de los desplegables salen de LO QUE HAY en la tabla, no
     del maestro entero: un filtro que ofrece 16 orígenes cuando solo
     cinco tienen viajes hace buscar en una lista donde la mayoría de
     opciones no devuelve nada. */
  const listaOrigenes = useMemo(
    () => [...new Set(viajes.map((v) => v.cd_origen))].sort((a, b) => a.localeCompare(b, "es")),
    [viajes]
  );
  const listaMateriales = useMemo(
    () => [...new Set(viajes.map((v) => v.descripcion))].sort((a, b) => a.localeCompare(b, "es")),
    [viajes]
  );

  const filtrados = useMemo(() => {
    const p = f.placa.trim().toUpperCase();
    return viajes.filter((v) => {
      if (p && !v.placa.toUpperCase().includes(p)) return false;
      if (f.origen && v.cd_origen !== f.origen) return false;
      if (f.material && v.descripcion !== f.material) return false;
      if (f.estado) {
        /* "importado" y "sin factores" no son estados en la base: son
           condiciones de la fila. Se filtran igual porque es como se
           leen en pantalla, y filtrar por lo que NO se ve es peor. */
        if (f.estado === "importado" && !v.importado) return false;
        if (f.estado === "sin_factores" && !v.faltan_factores) return false;
        if (["en_transito", "recibido", "anulado"].includes(f.estado) && v.estado !== f.estado)
          return false;
      }
      return true;
    });
  }, [viajes, f]);

  const hayFiltro = f.placa.trim() !== "" || !!f.origen || !!f.material || !!f.estado;

  /* Los totales del pie son los de LO FILTRADO, y sin los anulados: un
     viaje anulado no movió envase. */
  const cuenta = useMemo(() => {
    const vivos = filtrados.filter((v) => v.estado !== "anulado");
    return {
      viajes: vivos.length,
      anulados: filtrados.length - vivos.length,
      hl: vivos.reduce((s, v) => s + Number(v.hl ?? 0), 0),
      sider: vivos.reduce((s, v) => s + Number(v.sider ?? 0), 0),
    };
  }, [filtrados]);

  async function guardar() {
    if (!edit) return;
    setMal(null); setOcupado(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("sider_viaje_editar", {
      p_id: edit.id,
      p_placa: edit.placa,
      p_planta: edit.planta,
      p_sku: edit.sku,
      p_estibas: Number(edit.estibas.replace(",", ".")),
      p_observacion: edit.observacion,
    });
    setOcupado(false);
    if (error) return setMal(error.message);
    setEdit(null);
    router.refresh();
  }

  async function confirmarAnular() {
    if (!anular) return;
    setMal(null); setOcupado(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("sider_viaje_anular", {
      p_id: anular.v.id, p_motivo: anular.motivo,
    });
    setOcupado(false);
    if (error) return setMal(error.message);
    setAnular(null);
    router.refresh();
  }

  async function devolver(v: Viaje) {
    setMal(null); setOcupado(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("sider_viaje_devolver", { p_id: v.id });
    setOcupado(false);
    if (error) return setMal(error.message);
    router.refresh();
  }

  const columnas = manda ? 14 : 13;

  return (
    <>
      {/* ---------- Los filtros ---------- */}
      <div className="vj-filtros">
        <label className="vj-buscar">
          <span>Placa</span>
          <input
            value={f.placa}
            placeholder="Escribe parte de la placa"
            onChange={(e) => setF({ ...f, placa: e.target.value })}
          />
        </label>
        <label>
          <span>CD origen</span>
          <select value={f.origen} onChange={(e) => setF({ ...f, origen: e.target.value })}>
            <option value="">Todos los orígenes</option>
            {listaOrigenes.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label>
          <span>Material</span>
          <select value={f.material} onChange={(e) => setF({ ...f, material: e.target.value })}>
            <option value="">Todos los materiales</option>
            {listaMateriales.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          <span>Estado</span>
          <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
            <option value="">Todos</option>
            <option value="en_transito">En tránsito</option>
            <option value="recibido">Recibido</option>
            <option value="importado">Importado</option>
            <option value="sin_factores">Sin factores</option>
            <option value="anulado">Anulado</option>
          </select>
        </label>
        <button type="button" className="btn plano" disabled={!hayFiltro}
                onClick={() => setF(VACIO)}>
          Limpiar
        </button>
      </div>

      {/* Cuántos quedan. Va arriba de la tabla y no debajo: con la tabla
          rodando dentro de su caja, un pie se queda fuera de la vista. */}
      <p className="vj-cuenta">
        {hayFiltro
          ? <><b>{nf.format(filtrados.length)}</b> de {nf.format(viajes.length)} viajes</>
          : <><b>{nf.format(viajes.length)}</b> viajes</>}
        {cuenta.viajes > 0 && <>
          {" · "}{nf.format(cuenta.hl)} HL{" · "}{nf2.format(cuenta.sider)} sider
        </>}
        {cuenta.anulados > 0 && <> · <span className="vj-anul">{cuenta.anulados} anulado{cuenta.anulados === 1 ? "" : "s"}, no cuentan</span></>}
      </p>

      {mal && <p className="vj-mal" role="alert">{mal}</p>}

      <div className="marco">
        <table>
          <thead>
            <tr>
              <th>Placa</th>
              <th>CD origen</th>
              <th>Material</th>
              <th className="num">Estibas</th>
              <th className="num">Sider</th>
              <th className="num">Cajas</th>
              <th className="num">Unidades</th>
              <th className="num">HL</th>
              <th>Salida</th>
              <th>Llegada</th>
              <th>Estado</th>
              <th>Quién</th>
              <th className="ojo-col">Evidencia</th>
              {manda && <th className="vj-acc-col">Corregir</th>}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((v) => {
              const s = sello(v);
              const anulado = v.estado === "anulado";
              const editando = edit?.id === v.id;
              return (
                <tr key={v.id} className={anulado ? "vj-nulo" : undefined}>
                  <td className="placa">{v.placa}</td>
                  <td>
                    <div>{v.cd_origen}</div>
                    <div className="cod">{MESES_LARGO[v.num_mes - 1]} {v.anio} · sem {v.semana}</div>
                  </td>
                  <td>
                    <div>{v.descripcion}</div>
                    <div className="cod">{v.sku}{v.tipo_envase ? ` · ${v.tipo_envase}` : ""}</div>
                  </td>
                  <td className="num">{nf2.format(v.estibas)}</td>
                  <td className="num">{nf2.format(v.sider)}</td>
                  <td className="num">{v.cajas == null ? "—" : nf.format(v.cajas)}</td>
                  <td className="num">{v.unidades == null ? "—" : nf.format(v.unidades)}</td>
                  <td className="num">{v.hl == null ? "—" : nf2.format(v.hl)}</td>
                  <td>
                    <div>{v.importado ? "—" : hora(v.salida_en)}</div>
                    <div className="cod">{v.importado ? "sin evidencia" : `${v.fotos_salida}/3 fotos`}</div>
                  </td>
                  <td>
                    <div>{v.importado ? "—" : hora(v.llegada_en)}</div>
                    <div className="cod">
                      {v.importado ? "sin evidencia"
                        : v.estado === "en_transito" ? enCamino(v.en_camino)
                        : `${v.fotos_llegada}/3 fotos`}
                    </div>
                    {/* La observación vive aquí, pegada a la llegada, que
                        es cuando se escribe: "llegó con dos estibas
                        menos" no significa nada al lado de la salida. */}
                    {v.observacion && <div className="vj-obs" title={v.observacion}>{v.observacion}</div>}
                  </td>
                  <td>
                    <span className={"sello " + s.cl}><i />{s.txt}</span>
                    {anulado && v.motivo_anulacion && (
                      <div className="cod vj-motivo">{v.motivo_anulacion}</div>
                    )}
                  </td>
                  <td>{v.creado_por ? nombres[v.creado_por] ?? "—" : "—"}</td>
                  <td className="ojo-col"><OjoEvidencia viaje={v} nombres={nombres} /></td>
                  {manda && (
                    <td className="vj-acc-col">
                      {anulado ? (
                        <button type="button" className="vj-mini" disabled={ocupado}
                                onClick={() => devolver(v)}>
                          Devolver
                        </button>
                      ) : (
                        <div className="vj-acciones">
                          <button type="button" className="vj-mini" disabled={ocupado || editando}
                                  onClick={() => setEdit({
                                    id: v.id, placa: v.placa, planta: v.planta, sku: v.sku,
                                    estibas: String(v.estibas), observacion: v.observacion ?? "",
                                  })}>
                            Corregir
                          </button>
                          <button type="button" className="vj-mini mal" disabled={ocupado}
                                  onClick={() => { setMal(null); setAnular({ v, motivo: "" }) }}>
                            Anular
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {/* La fila de corrección, justo debajo de la suya. Un modal
                taparía la tabla y con ella el contexto de lo que se está
                corrigiendo. */}
            {edit && filtrados.some((v) => v.id === edit.id) && (
              <tr className="vj-form">
                <td colSpan={columnas}>
                  <div className="vj-editor">
                    <p className="vj-rot">
                      Corregir lo que se tecleó
                      <em>Las cifras se recalculan solas. Las horas y las fotos no se tocan.</em>
                    </p>
                    <div className="vj-campos">
                      <label>
                        <span>Placa</span>
                        <input value={edit.placa} maxLength={12}
                               onChange={(e) => setEdit({ ...edit, placa: e.target.value.toUpperCase() })} />
                      </label>
                      <label>
                        <span>CD origen</span>
                        <select value={edit.planta}
                                onChange={(e) => setEdit({ ...edit, planta: e.target.value })}>
                          {origenes.map((o) => (
                            <option key={o.planta} value={o.planta}>{o.cd_origen}</option>
                          ))}
                        </select>
                      </label>
                      <label className="ancho">
                        <span>Material</span>
                        <select value={edit.sku}
                                onChange={(e) => setEdit({ ...edit, sku: e.target.value })}>
                          {skus.map((s) => (
                            <option key={s.sku} value={s.sku}>{s.descripcion} · {s.sku}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Estibas</span>
                        <input value={edit.estibas} inputMode="decimal"
                               onChange={(e) => setEdit({ ...edit, estibas: e.target.value })} />
                      </label>
                      <label className="ancho">
                        <span>Observación <em>(opcional)</em></span>
                        <input value={edit.observacion} maxLength={200}
                               placeholder="Llegó con dos estibas menos, sello roto…"
                               onChange={(e) => setEdit({ ...edit, observacion: e.target.value })} />
                      </label>
                    </div>
                    <div className="vj-botones">
                      <button type="button" className="btn" onClick={guardar} disabled={ocupado}>
                        {ocupado ? "Guardando…" : "Guardar la corrección"}
                      </button>
                      <button type="button" className="btn plano" onClick={() => setEdit(null)} disabled={ocupado}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {!filtrados.length && (
              <tr>
                <td className="vacio" colSpan={columnas}>
                  {viajes.length === 0 ? (
                    <>Todavía no hay viajes certificados.
                      {esEditor && <> <Link href="/sider/certificar">Certifica el primero</Link>.</>}</>
                  ) : (
                    <>Ningún viaje coincide con el filtro.{" "}
                      <button type="button" className="vj-enlace" onClick={() => setF(VACIO)}>
                        Quitar el filtro
                      </button></>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Anular ---------- */}
      {anular && (
        <div className="vj-velo" role="dialog" aria-modal="true"
             onClick={(e) => { if (e.target === e.currentTarget && !ocupado) setAnular(null) }}>
          <div className="vj-caja">
            <p className="vj-ojo">ANULAR UN VIAJE</p>
            <h3>{anular.v.placa} · {anular.v.cd_origen}</h3>
            <p className="vj-dice">
              El viaje <b>no se borra</b>: se queda en la lista marcado como anulado,
              con sus fotos y su ubicación, y deja de contar en los hectolitros y en
              el porcentaje de certificación. Se puede devolver.
            </p>
            <label className="vj-motivo-campo">
              <span>¿Por qué se anula?</span>
              <input value={anular.motivo} autoFocus maxLength={200}
                     placeholder="Se digitó dos veces, el vehículo no salió…"
                     onChange={(e) => setAnular({ ...anular, motivo: e.target.value })} />
              <em>En tres meses nadie va a acordarse. Queda guardado con tu nombre.</em>
            </label>
            {mal && <p className="vj-mal" role="alert">{mal}</p>}
            <div className="vj-botones">
              <button type="button" className="btn mal" onClick={confirmarAnular}
                      disabled={ocupado || anular.motivo.trim().length < 4}>
                {ocupado ? "Anulando…" : "Anular el viaje"}
              </button>
              <button type="button" className="btn plano" onClick={() => setAnular(null)} disabled={ocupado}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
