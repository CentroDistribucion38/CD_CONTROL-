"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LineaConsolidado } from "@/modulos/inventario/balance";
import { Consolidado } from "./Consolidado";
import { Rango } from "../../sider/seguimiento/Rango";
import { reclasificar, quitarReclasificacion } from "./actions";

/* ------------------------------------------------------------------ */
/*  TIPOS                                                              */
/* ------------------------------------------------------------------ */
type Bloque = {
  estado: string;
  alcance: string;
  renglones: number;
  con_alerta: number;
  fisico_cajas: number;
  estibas_casco: number;
  cajas_casco: number;
  dif_cajas: number;
  unidades: number | null;
};

type Fila = {
  fecha: string | null;
  estado: string;
  alcance: string;
  codigo: string;
  material: string | null;
  ubicacion: string | null;
  cajas_estiba: number | null;
  un_caja: number | null;
  fisico_cajas: number;
  estibas_casco: number;
  cajas_casco: number;
  ajuste_cajas: number;
  ajuste_nota: string | null;
  calidad: string | null;
  dif_cajas: number;
  unidades: number | null;
  alerta: string | null;
  reclasificacion_id: number | null;
};

/* ------------------------------------------------------------------ */
/*  CONSTANTES                                                         */
/* ------------------------------------------------------------------ */
/** Las 5 hojas fijas + la de "Otros estados" (dinámica). */
const HOJAS_FIJAS: { estado: string; alcance: string | null; label: string }[] = [
  { estado: "BAJA",        alcance: "SORTING",    label: "Baja · Fábrica" },
  { estado: "BAJA",        alcance: "PRESORTING",  label: "Baja · Bodega 38" },
  { estado: "LAVADO",      alcance: "SORTING",    label: "Lavado · Fábrica" },
  { estado: "LAVADO",      alcance: "PRESORTING",  label: "Lavado · Bodega 38" },
  { estado: "EXTRASUCIO",  alcance: null,          label: "Extrasucio" },
];

/** Estados que YA tienen su propia pestaña — los "otros" son el resto. */
const ESTADOS_FIJOS = new Set(["BAJA", "LAVADO", "EXTRASUCIO"]);

const ESTADOS_DESTINO = ["BAJA", "LAVADO", "EXTRASUCIO"] as const;

/* ------------------------------------------------------------------ */
/*  FORMATO                                                            */
/* ------------------------------------------------------------------ */
function n(v: number | null | undefined, dec = 0): string {
  if (v == null) return "—";
  return v.toLocaleString("es-CO", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

/* ------------------------------------------------------------------ */
/*  COMPONENTE                                                         */
/* ------------------------------------------------------------------ */
const DIAS_SEM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «vie 10 oct 2026» */
const diaLargo = (f: string) => {
  const d = new Date(f + "T12:00:00Z");
  return `${DIAS_SEM[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export function Balance({
  bloques,
  detalle,
  error,
  fecha,
  dias,
  fechaCasco,
  diasCasco,
  consolidado,
}: {
  bloques: Bloque[];
  detalle: Fila[];
  error: string | null;
  /** El día del consolidado que se está mirando, y los días que tienen conteo enviado. */
  fecha: string | null;
  dias: string[];
  /** El día del casco que se cruza (se escoge aparte del conteo), y los días que tiene el casco. */
  fechaCasco: string | null;
  diasCasco: string[];
  /** La hoja «Consolidado»: todo lo contado el día, para filtrar y reasignar estados. */
  consolidado: LineaConsolidado[];
}) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const [hojaIdx, setHojaIdx] = useState(0);
  const [reclas, setReclas] = useState<Fila | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  /* Detectar si hay filas con estados "otros" (RETORNO, NUEVO, OTROS,
     LLENO, VACÍO, etc.) para mostrar la pestaña extra. */
  const hayOtros = useMemo(
    () => detalle.some((f) => !ESTADOS_FIJOS.has(f.estado)),
    [detalle],
  );

  /* La lista completa de hojas: las 5 fijas + "Otros estados" si hay. */
  const HOJAS = useMemo(() => {
    const h = [...HOJAS_FIJAS];
    if (hayOtros) h.push({ estado: "__OTROS__", alcance: null, label: "Otros estados" });
    return h;
  }, [hayOtros]);

  const hoja = HOJAS[hojaIdx] ?? HOJAS[0];
  const esOtros = hoja.estado === "__OTROS__";

  /* Filas de la hoja activa. */
  const filas = useMemo(
    () => {
      if (esOtros) {
        return detalle.filter((f) => !ESTADOS_FIJOS.has(f.estado));
      }
      return detalle.filter(
        (f) =>
          f.estado === hoja.estado &&
          (hoja.alcance === null || f.alcance === hoja.alcance),
      );
    },
    [detalle, hoja, esOtros],
  );

  /* «SI EL FÍSICO ESTÁ EN 0, QUE NO LO MUESTRE»: arriba solo lo contado; lo que está en el casco y no
     se contó va en una tabla aparte, abajo, como alerta para actualizar el casco. */
  const principales = useMemo(() => filas.filter((f) => f.fisico_cajas !== 0), [filas]);
  const sinFisico = useMemo(() => filas.filter((f) => f.fisico_cajas === 0), [filas]);
  const suma = (rs: Fila[], k: "fisico_cajas" | "estibas_casco" | "cajas_casco" | "ajuste_cajas" | "dif_cajas") =>
    rs.reduce((t, f) => t + (f[k] ?? 0), 0);
  const bloque = principales.length ? {
    fisico_cajas: suma(principales, "fisico_cajas"), estibas_casco: suma(principales, "estibas_casco"),
    cajas_casco: suma(principales, "cajas_casco"), dif_cajas: suma(principales, "dif_cajas"),
    con_alerta: principales.filter((f) => f.alerta).length,
  } : undefined;

  /* ---- handlers reclasificación ---- */
  function abrirReclas(f: Fila) {
    setReclas(f);
    setNuevoEstado(
      ESTADOS_DESTINO.find((e) => e !== f.estado) ?? ESTADOS_DESTINO[0],
    );
    setMotivo("");
  }

  function enviarReclas() {
    if (!reclas) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("codigo", reclas.codigo);
      fd.set("fecha", reclas.fecha ?? "");
      fd.set("estado_original", reclas.estado);
      fd.set("estado_nuevo", nuevoEstado);
      fd.set("motivo", motivo);
      await reclasificar(fd);
      setReclas(null);
    });
  }

  function quitarReclas(f: Fila) {
    if (!f.reclasificacion_id) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("codigo", f.codigo);
      fd.set("fecha", f.fecha ?? fecha ?? "");
      await quitarReclasificacion(fd);
    });
  }

  const tieneData = detalle.length > 0 || bloques.length > 0 || consolidado.length > 0;

  return (
    <>
      {/* ---- CABECERA ---- */}
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE</p>
          <h1>Balance de materiales</h1>
          <p className="sub">
            El conteo del día que escojas (el mismo consolidado de La base) contra el casco del día
            que escojas. Si un almacén no se guardó ese día, se toma su último guardado antes. Casco de
            vidrio: Bodega 38 cruza BAJA (Inventario) y EXTRASUCIO; Fábrica cruza BAJA (Inventario) y LAVADO (Lavado con baja).
          </p>
        </div>
        {/* «PUEDO TOMAR EL CONSOLIDADO DEL VIERNES O DE CUALQUIER DÍA QUE QUIERA.» */}
        {/* «YO ELIJO CUÁL CONTEO Y CUÁL CASCO TOMAR, DE FECHAS.» */}
        <div className="bal-dias">
          {/* CALENDARIO, COMO EN TRASPASOS: solo se pueden tocar los días que tienen conteo (o casco). */}
          <div className="sd bal-cal">
            <Rango rotulo="Conteo del día" desde={fecha ?? ""} hasta={fecha ?? ""}
                   dias={dias.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                   alElegir={(d) => startCambio(() => router.push(`/inventario/balance?fecha=${d}${fechaCasco ? `&casco=${fechaCasco}` : ""}`))} />
          </div>
          <div className="sd bal-cal">
            <Rango rotulo="Casco del día" desde={fechaCasco ?? ""} hasta={fechaCasco ?? ""}
                   dias={diasCasco.map((d) => ({ fecha: d, hl_zlde: 0, viajes: 1 }))}
                   alElegir={(d) => startCambio(() => router.push(`/inventario/balance?${fecha ? `fecha=${fecha}&` : ""}casco=${d}`))} />
          </div>
          {cambiando && <em>Trayendo…</em>}
        </div>
      </section>

      {error && (
        <p className="aviso-error" style={{ padding: "1rem", color: "var(--fe-mal)" }}>
          Error: {error}
        </p>
      )}

      {!tieneData && !error && (
        <p style={{ padding: "2rem 1rem", opacity: 0.5 }}>
          No hay datos de balance. Verifica que hayas corrido el conteo y el
          casco.
        </p>
      )}

      {tieneData && (
        <>
          {/* ---- PESTAÑAS ---- */}
          <nav className="bal-tabs" role="tablist" aria-label="Estados del casco">
            {HOJAS.map((h, i) => {
              const k = `${h.estado}|${h.alcance ?? "ALL"}`;
              const esOtrosTab = h.estado === "__OTROS__";
              /* Para la pestaña "otros" calculamos el badge a mano. */
              const b = esOtrosTab
                ? (() => {
                    const fs = detalle.filter((f) => !ESTADOS_FIJOS.has(f.estado));
                    return fs.length ? { renglones: fs.length, con_alerta: fs.filter((f) => f.alerta).length } : null;
                  })()
                : (() => {
                    /* EXTRASUCIO: alcance null → no filtrar por alcance. */
                    const match = bloques.find(
                      (bl) =>
                        bl.estado === h.estado &&
                        (h.alcance === null || bl.alcance === h.alcance),
                    );
                    return match ? { renglones: match.renglones, con_alerta: match.con_alerta } : null;
                  })();
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={i === hojaIdx}
                  className={`bal-tab ${i === hojaIdx ? "activa" : ""}`}
                  onClick={(e) => { setHojaIdx(i); e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" }) }}
                >
                  <span className="bal-tab-label">{h.label}</span>
                  {/* «QUE QUEDE ASÍ»: cuántos materiales en gris y, si hay, cuántos con alerta en rojo. */}
                  {b && <span className="bal-tab-n" title="materiales">{b.renglones}</span>}
                  {b && b.con_alerta > 0 && <span className="bal-tab-al" title="con alerta">{b.con_alerta}</span>}
                </button>
              );
            })}
            {/* AL FINAL, DESPUÉS DE «OTROS ESTADOS»: el consolidado, donde se reasignan los estados. */}
            <button role="tab" aria-selected={hojaIdx < 0} className={`bal-tab ${hojaIdx < 0 ? "activa" : ""}`} onClick={(e) => { setHojaIdx(-1); e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" }) }}>
              <span className="bal-tab-label">Consolidado</span>
              <span className="bal-tab-n" title="materiales">{consolidado.length}</span>
            </button>
          </nav>

          {hojaIdx < 0 ? <Consolidado lineas={consolidado} fecha={fecha} /> : (<>
          {/* ---- RESUMEN DEL BLOQUE ---- */}
          {bloque && (
            <div className="bal-resumen-bloque">
              <span>
                <b>{n(bloque.fisico_cajas)}</b> cajas físicas
              </span>
              <span>
                <b>{n(bloque.estibas_casco)}</b> estibas casco
              </span>
              <span>
                <b>{n(bloque.cajas_casco)}</b> cajas casco
              </span>
              <span className={bloque.dif_cajas ? "bal-dif" : ""}>
                dif <b>{n(bloque.dif_cajas)}</b> cajas
              </span>
              {bloque.con_alerta > 0 && (
                <span className="bal-alertas">
                  {bloque.con_alerta} alertas
                </span>
              )}
              {sinFisico.length > 0 && (
                <span className="bal-alertas">
                  {sinFisico.length} en casco sin contar (abajo)
                </span>
              )}
            </div>
          )}

          {/* ---- TABLA ---- */}
          {principales.length > 0 && (
            <div className="bal-tabla-wrap">
              <table className="bal-tabla bal-hoja">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Material</th>
                    <th className="r" title="Cajas por estiba (maestro)">Factor estiba</th>
                    <th className="r" title="Unidades por caja (maestro)">Factor caja</th>
                    <th className="r">Físico (cajas)</th>
                    <th className="r">Estibas casco</th>
                    <th className="r">Cajas casco</th>
                    <th className="r">Ajuste</th>
                    <th className="r">Dif cajas</th>
                    <th className="r" title="Dif cajas × factor caja">Dif unidades</th>
                    <th>Alerta</th>
                    <th className="bal-col-acc"></th>
                  </tr>
                </thead>
                <tbody>
                  {principales.map((f, i) => (
                    <tr key={i} className={f.alerta ? "con-alerta" : ""}>
                      <td className="mono">{f.codigo}</td>
                      <td>{f.material ?? "—"}</td>
                      <td className={`r ${f.cajas_estiba ? "" : "bal-falta"}`}>{f.cajas_estiba ? n(f.cajas_estiba) : "falta"}</td>
                      <td className={`r ${f.un_caja ? "" : "bal-falta"}`}>{f.un_caja ? n(f.un_caja) : "falta"}</td>
                      <td className="r">{n(f.fisico_cajas)}</td>
                      <td className="r">{n(f.estibas_casco)}</td>
                      <td className="r">{n(f.cajas_casco)}</td>
                      <td className="r">
                        {f.ajuste_cajas ? n(f.ajuste_cajas) : ""}
                        {f.ajuste_nota && (
                          <span className="bal-nota" title={f.ajuste_nota}>
                            {" "}
                            *
                          </span>
                        )}
                      </td>
                      <td className={`r ${f.dif_cajas ? "bal-dif" : ""}`}>
                        {n(f.dif_cajas)}
                      </td>
                      <td className="r">{n(f.unidades)}</td>
                      <td className="bal-alerta-cel">{f.alerta ?? ""}</td>
                      <td className="bal-col-acc">
                        {f.reclasificacion_id ? (
                          <button
                            className="bal-btn-reclas revert"
                            title="Quitar reclasificación"
                            onClick={() => quitarReclas(f)}
                            disabled={pending}
                          >
                            ↩
                          </button>
                        ) : (
                          <button
                            className="bal-btn-reclas"
                            title="Cambiar estado"
                            onClick={() => abrirReclas(f)}
                            disabled={pending}
                          >
                            ⇄
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {principales.length > 1 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4}>
                        <b>Total</b>
                      </td>
                      <td className="r">
                        <b>
                          {n(principales.reduce((s, f) => s + f.fisico_cajas, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(principales.reduce((s, f) => s + f.estibas_casco, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(principales.reduce((s, f) => s + f.cajas_casco, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(principales.reduce((s, f) => s + f.ajuste_cajas, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(principales.reduce((s, f) => s + f.dif_cajas, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(
                            principales.reduce(
                              (s, f) => s + (f.unidades ?? 0),
                              0,
                            ),
                          )}
                        </b>
                      </td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}


          {/* ---- EN CASCO Y SIN CONTAR: alerta para actualizar el casco ---- */}
          {sinFisico.length > 0 && (
            <section className="bal-pendientes">
              <h3>
                En casco y sin contar <span>{sinFisico.length}</span>
              </h3>
              <p>
                El casco del {fechaCasco ? diaLargo(fechaCasco) : "día"} tiene estas estibas, pero en el conteo del{" "}
                {fecha ? diaLargo(fecha) : "día"} no aparecen. Actualiza el casco (o revisa el conteo).
              </p>
              <div className="bal-tabla-wrap">
                <table className="bal-tabla bal-hoja">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Material</th>
                      <th className="r">Estibas casco</th>
                      <th className="r">Cajas casco</th>
                      <th className="r">Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinFisico.map((f, i) => (
                      <tr key={i} className="con-alerta">
                        <td className="mono">{f.codigo}</td>
                        <td>{f.material ?? "—"}</td>
                        <td className="r">{n(f.estibas_casco)}</td>
                        <td className="r">{n(f.cajas_casco)}</td>
                        <td className="r">{n(f.un_caja ? f.cajas_casco * f.un_caja : null)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {sinFisico.length > 1 && (
                    <tfoot>
                      <tr>
                        <td colSpan={2}><b>Total</b></td>
                        <td className="r"><b>{n(suma(sinFisico, "estibas_casco"))}</b></td>
                        <td className="r"><b>{n(suma(sinFisico, "cajas_casco"))}</b></td>
                        <td className="r"><b>{n(sinFisico.reduce((t, f) => t + (f.un_caja ? f.cajas_casco * f.un_caja : 0), 0))}</b></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          )}

          {filas.length === 0 && (
            <p className="bal-sin-filas">
              {esOtros
                ? "No hay envases con otros estados para reclasificar."
                : <>No hay renglones de <b>{hoja.estado}</b> en{" "}
                    <b>{hoja.alcance === "SORTING" ? "Fábrica (AG18)" : hoja.alcance === "PRESORTING" ? "Bodega 38 (AG22)" : "todas las ubicaciones"}</b>.</>}
            </p>
          )}
          </>)}
        </>
      )}

      {/* ---- MODAL RECLASIFICACIÓN ---- */}
      {reclas && (
        <div className="bal-modal-fondo" onClick={() => setReclas(null)}>
          <div className="bal-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Cambiar estado del envase</h3>
            <p className="bal-modal-cod">
              <b>{reclas.codigo}</b>
              {reclas.material && <> — {reclas.material}</>}
            </p>
            <p className="bal-modal-actual">
              Estado actual: <b>{reclas.estado}</b>
            </p>

            <label className="bal-modal-label">
              Mover a:
              <select
                value={nuevoEstado}
                onChange={(e) => setNuevoEstado(e.target.value)}
              >
                {ESTADOS_DESTINO.filter((e) => e !== reclas.estado).map(
                  (e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="bal-modal-label">
              Motivo (opcional):
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: estaba marcado como baja pero es lavado"
              />
            </label>

            <div className="bal-modal-acciones">
              <button
                className="bal-btn cancelar"
                onClick={() => setReclas(null)}
              >
                Cancelar
              </button>
              <button
                className="bal-btn confirmar"
                onClick={enviarReclas}
                disabled={pending}
              >
                {pending ? "Guardando…" : "Mover"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
