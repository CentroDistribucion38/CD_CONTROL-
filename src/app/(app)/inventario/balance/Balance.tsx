"use client";

import { useState, useMemo, useTransition } from "react";
import { reclasificar, quitarReclasificacion } from "./actions";

/* ------------------------------------------------------------------ */
/*  TIPOS                                                              */
/* ------------------------------------------------------------------ */
type Bloque = {
  fecha: string;
  estado: string;
  alcance: string;
  renglones: number;
  con_alerta: number;
  fisico_cajas: number;
  estibas_casco: number;
  dif_cajas: number;
  unidades: number | null;
};

type Fila = {
  fecha: string;
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
  { estado: "EXTRASUCIO",  alcance: "PRESORTING",  label: "Extrasucio" },
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
export function Balance({
  bloques,
  detalle,
  error,
}: {
  bloques: Bloque[];
  detalle: Fila[];
  error: string | null;
}) {
  /* La fecha más reciente que haya en los datos. */
  const fechas = useMemo(() => {
    const s = new Set<string>();
    for (const b of bloques) s.add(b.fecha);
    for (const f of detalle) s.add(f.fecha);
    return [...s].sort().reverse();
  }, [bloques, detalle]);

  const [fecha, setFecha] = useState(fechas[0] ?? "");
  const [hojaIdx, setHojaIdx] = useState(0);
  const [reclas, setReclas] = useState<Fila | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  /* Detectar si hay filas con estados "otros" (RETORNO, NUEVO, OTROS,
     LLENO, VACÍO, etc.) para mostrar la pestaña extra. */
  const hayOtros = useMemo(
    () => detalle.some((f) => f.fecha === fecha && !ESTADOS_FIJOS.has(f.estado)),
    [detalle, fecha],
  );

  /* La lista completa de hojas: las 5 fijas + "Otros estados" si hay. */
  const HOJAS = useMemo(() => {
    const h = [...HOJAS_FIJAS];
    if (hayOtros) h.push({ estado: "__OTROS__", alcance: null, label: "Otros estados" });
    return h;
  }, [hayOtros]);

  const hoja = HOJAS[hojaIdx] ?? HOJAS[0];
  const esOtros = hoja.estado === "__OTROS__";

  /* Bloque resumen de la hoja activa. */
  const bloque = useMemo(
    () => {
      if (esOtros) {
        /* Calcular resumen a mano para los "otros". */
        const filas = detalle.filter((f) => f.fecha === fecha && !ESTADOS_FIJOS.has(f.estado));
        if (!filas.length) return undefined;
        return {
          fecha,
          estado: "__OTROS__",
          alcance: "",
          renglones: filas.length,
          con_alerta: filas.filter((f) => f.alerta).length,
          fisico_cajas: filas.reduce((s, f) => s + f.fisico_cajas, 0),
          estibas_casco: filas.reduce((s, f) => s + f.estibas_casco, 0),
          dif_cajas: filas.reduce((s, f) => s + f.dif_cajas, 0),
          unidades: filas.reduce((s, f) => s + (f.unidades ?? 0), 0),
        } as Bloque;
      }
      return bloques.find(
        (b) =>
          b.fecha === fecha &&
          b.estado === hoja.estado &&
          b.alcance === hoja.alcance,
      );
    },
    [bloques, detalle, fecha, hoja, esOtros],
  );

  /* Filas de la hoja activa. */
  const filas = useMemo(
    () => {
      if (esOtros) {
        return detalle.filter((f) => f.fecha === fecha && !ESTADOS_FIJOS.has(f.estado));
      }
      return detalle.filter(
        (f) =>
          f.fecha === fecha &&
          f.estado === hoja.estado &&
          f.alcance === hoja.alcance,
      );
    },
    [detalle, fecha, hoja, esOtros],
  );

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
      fd.set("fecha", fecha);
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
      fd.set("id", String(f.reclasificacion_id));
      await quitarReclasificacion(fd);
    });
  }

  return (
    <>
      {/* ---- CABECERA ---- */}
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE</p>
          <h1>Balance de materiales</h1>
          <p className="sub">
            Cruce del último conteo físico contra el casco de vidrio.
            {fecha && (
              <>
                {" "}
                Fecha del conteo: <b>{fecha}</b>.
              </>
            )}
          </p>
        </div>
        {fechas.length > 1 && (
          <select
            className="bal-sel-fecha"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          >
            {fechas.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
      </section>

      {error && (
        <p className="aviso-error" style={{ padding: "1rem", color: "var(--fe-mal)" }}>
          Error: {error}
        </p>
      )}

      {!fecha && !error && (
        <p style={{ padding: "2rem 1rem", opacity: 0.5 }}>
          No hay datos de balance. Verifica que hayas corrido el conteo y el
          casco.
        </p>
      )}

      {fecha && (
        <>
          {/* ---- PESTAÑAS ---- */}
          <nav className="bal-tabs" role="tablist">
            {HOJAS.map((h, i) => {
              const k = `${h.estado}|${h.alcance ?? "ALL"}`;
              const esOtrosTab = h.estado === "__OTROS__";
              /* Para la pestaña "otros" calculamos el badge a mano. */
              const b = esOtrosTab
                ? (() => {
                    const fs = detalle.filter((f) => f.fecha === fecha && !ESTADOS_FIJOS.has(f.estado));
                    return fs.length ? { renglones: fs.length, con_alerta: fs.filter((f) => f.alerta).length } : null;
                  })()
                : bloques.find(
                    (bl) =>
                      bl.fecha === fecha &&
                      bl.estado === h.estado &&
                      bl.alcance === h.alcance,
                  );
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={i === hojaIdx}
                  className={`bal-tab ${i === hojaIdx ? "activa" : ""}`}
                  onClick={() => setHojaIdx(i)}
                >
                  <span className="bal-tab-label">{h.label}</span>
                  {b && (
                    <span className="bal-tab-badge">
                      {b.renglones}
                      {b.con_alerta > 0 && (
                        <span className="bal-tab-alerta">
                          {" "}
                          · {b.con_alerta}
                          <svg viewBox="0 0 16 16" width="11" height="11">
                            <path
                              d="M8 1l7 13H1z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinejoin="round"
                            />
                            <line x1="8" y1="6" x2="8" y2="9" stroke="currentColor" strokeWidth="1.4" />
                            <circle cx="8" cy="11" r=".7" fill="currentColor" />
                          </svg>
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* ---- RESUMEN DEL BLOQUE ---- */}
          {bloque && (
            <div className="bal-resumen-bloque">
              <span>
                <b>{n(bloque.fisico_cajas)}</b> cajas físicas
              </span>
              <span>
                <b>{n(bloque.estibas_casco)}</b> estibas casco
              </span>
              <span className={bloque.dif_cajas ? "bal-dif" : ""}>
                dif <b>{n(bloque.dif_cajas)}</b> cajas
              </span>
              {bloque.con_alerta > 0 && (
                <span className="bal-alertas">
                  {bloque.con_alerta} alertas
                </span>
              )}
            </div>
          )}

          {/* ---- TABLA ---- */}
          {filas.length > 0 && (
            <div className="bal-tabla-wrap">
              <table className="bal-tabla">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Material</th>
                    <th className="r">Físico (cajas)</th>
                    <th className="r">Estibas casco</th>
                    <th className="r">Cajas casco</th>
                    <th className="r">Ajuste</th>
                    <th className="r">Dif cajas</th>
                    <th className="r">Unidades</th>
                    <th>Alerta</th>
                    <th className="bal-col-acc"></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={i} className={f.alerta ? "con-alerta" : ""}>
                      <td className="mono">{f.codigo}</td>
                      <td>{f.material ?? "—"}</td>
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
                {filas.length > 1 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2}>
                        <b>Total</b>
                      </td>
                      <td className="r">
                        <b>
                          {n(filas.reduce((s, f) => s + f.fisico_cajas, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(filas.reduce((s, f) => s + f.estibas_casco, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(filas.reduce((s, f) => s + f.cajas_casco, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(filas.reduce((s, f) => s + f.ajuste_cajas, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(filas.reduce((s, f) => s + f.dif_cajas, 0))}
                        </b>
                      </td>
                      <td className="r">
                        <b>
                          {n(
                            filas.reduce(
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

          {filas.length === 0 && (
            <p className="bal-sin-filas">
              {esOtros
                ? "No hay envases con otros estados para reclasificar en esta fecha."
                : <>No hay renglones de <b>{hoja.estado}</b> en{" "}
                    <b>{hoja.alcance === "SORTING" ? "Fábrica (AG18)" : "Bodega 38 (AG22)"}</b>{" "}
                    para esta fecha.</>}
            </p>
          )}
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
