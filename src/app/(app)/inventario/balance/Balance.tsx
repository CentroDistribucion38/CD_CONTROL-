"use client";

import { useState, useMemo } from "react";

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
};

/* ------------------------------------------------------------------ */
/*  CONSTANTES                                                         */
/* ------------------------------------------------------------------ */
const BLOQUES_ORDEN: [string, string][] = [
  ["BAJA", "SORTING"],
  ["BAJA", "PRESORTING"],
  ["LAVADO", "SORTING"],
  ["LAVADO", "PRESORTING"],
  ["EXTRASUCIO", "PRESORTING"],
];

const LABEL: Record<string, string> = {
  SORTING: "Sorting (Fabrica)",
  PRESORTING: "Presorting (Bodega 38)",
};

/* ------------------------------------------------------------------ */
/*  FORMATO                                                            */
/* ------------------------------------------------------------------ */
function n(v: number | null | undefined, dec = 0): string {
  if (v == null) return "—";
  return v.toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
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
  /* La fecha mas reciente que haya en los datos. */
  const fechas = useMemo(() => {
    const s = new Set<string>();
    for (const b of bloques) s.add(b.fecha);
    for (const f of detalle) s.add(f.fecha);
    return [...s].sort().reverse();
  }, [bloques, detalle]);

  const [fecha, setFecha] = useState(fechas[0] ?? "");
  const [abierto, setAbierto] = useState<string | null>(null);

  /* Bloques de la fecha seleccionada. */
  const bFecha = useMemo(
    () => bloques.filter((b) => b.fecha === fecha),
    [bloques, fecha],
  );

  /* Detalle de la fecha seleccionada, indexado por estado|alcance. */
  const dFecha = useMemo(() => {
    const m: Record<string, Fila[]> = {};
    for (const f of detalle) {
      if (f.fecha !== fecha) continue;
      const k = `${f.estado}|${f.alcance}`;
      (m[k] ??= []).push(f);
    }
    return m;
  }, [detalle, fecha]);

  function bloqueData(estado: string, alcance: string) {
    return bFecha.find((b) => b.estado === estado && b.alcance === alcance);
  }

  return (
    <>
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · BALANCE</p>
          <h1>Balance de materiales</h1>
          <p className="sub">
            Cruce del ultimo conteo fisico contra el casco de vidrio.
            {fecha && <> Fecha del conteo: <b>{fecha}</b>.</>}
          </p>
        </div>
        {fechas.length > 1 && (
          <select value={fecha} onChange={(e) => { setFecha(e.target.value); setAbierto(null); }}>
            {fechas.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
      </section>

      {error && (
        <p className="aviso-error" style={{ padding: "1rem", color: "var(--rojo)" }}>
          Error: {error}
        </p>
      )}

      {!fecha && !error && (
        <p style={{ padding: "2rem 1rem", opacity: 0.5 }}>
          No hay datos de balance. Verifica que hayas corrido el conteo y el casco.
        </p>
      )}

      <div className="bal-grid">
        {BLOQUES_ORDEN.map(([estado, alcance]) => {
          const b = bloqueData(estado, alcance);
          const k = `${estado}|${alcance}`;
          const filas = dFecha[k] ?? [];
          const esAbierto = abierto === k;

          return (
            <div key={k} className={`bal-bloque ${esAbierto ? "abierto" : ""}`}>
              <button
                className="bal-titulo"
                onClick={() => setAbierto(esAbierto ? null : k)}
                aria-expanded={esAbierto}
              >
                <span className="bal-estado">{estado}</span>
                <span className="bal-alcance">{LABEL[alcance] ?? alcance}</span>
                {b && (
                  <span className="bal-resumen">
                    <span>{n(b.renglones)} materiales</span>
                    <span className={b.dif_cajas ? "bal-dif" : ""}>
                      dif {n(b.dif_cajas)} cajas
                    </span>
                    {b.con_alerta > 0 && (
                      <span className="bal-alertas">{b.con_alerta} alertas</span>
                    )}
                  </span>
                )}
                {!b && <span className="bal-vacio">Sin datos</span>}
                <span className="bal-flecha">{esAbierto ? "▲" : "▼"}</span>
              </button>

              {esAbierto && filas.length > 0 && (
                <div className="bal-tabla-wrap">
                  <table className="bal-tabla">
                    <thead>
                      <tr>
                        <th>Codigo</th>
                        <th>Material</th>
                        <th className="r">Fisico (cajas)</th>
                        <th className="r">Estibas casco</th>
                        <th className="r">Cajas casco</th>
                        <th className="r">Ajuste</th>
                        <th className="r">Dif cajas</th>
                        <th className="r">Unidades</th>
                        <th>Alerta</th>
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
                              <span className="bal-nota" title={f.ajuste_nota}> *</span>
                            )}
                          </td>
                          <td className={`r ${f.dif_cajas ? "bal-dif" : ""}`}>{n(f.dif_cajas)}</td>
                          <td className="r">{n(f.unidades)}</td>
                          <td className="bal-alerta-cel">{f.alerta ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    {filas.length > 1 && (
                      <tfoot>
                        <tr>
                          <td colSpan={2}><b>Total</b></td>
                          <td className="r"><b>{n(filas.reduce((s, f) => s + f.fisico_cajas, 0))}</b></td>
                          <td className="r"><b>{n(filas.reduce((s, f) => s + f.estibas_casco, 0))}</b></td>
                          <td className="r"><b>{n(filas.reduce((s, f) => s + f.cajas_casco, 0))}</b></td>
                          <td className="r"><b>{n(filas.reduce((s, f) => s + f.ajuste_cajas, 0))}</b></td>
                          <td className="r"><b>{n(filas.reduce((s, f) => s + f.dif_cajas, 0))}</b></td>
                          <td className="r"><b>{n(filas.reduce((s, f) => s + (f.unidades ?? 0), 0))}</b></td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {esAbierto && filas.length === 0 && (
                <p className="bal-sin-filas">No hay renglones en este bloque.</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
