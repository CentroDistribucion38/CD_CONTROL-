"use client";

/**
 * TIEMPOS GPS · LÍNEA DE TIEMPO DEL DÍA (B) Y CALOR DE ESPERA POR HORA (C).
 *   · Una fila por vehículo: los bloques de color son el tiempo dentro de cada zona; los grises, en tránsito entre
 *     zonas; con borde rojo y rayas, los que pasaron bastante de lo normal. Tocar un bloque escoge el vehículo y,
 *     si en ese momento tenía un viaje con seguimiento, muestra su recorrido en el mapa.
 *   · El calor: cuánto se espera en cada zona según la hora en que entra el vehículo, contra lo normal.
 */
import type { FilaTiempo } from "@/modulos/traspasos/gps/seguimiento";
import { duracion } from "@/modulos/traspasos/gps/motor";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" });
const horaCo = (ms: number) => new Date(ms - 5 * 3600_000).getUTCHours();

export function LineaTiempo({ filas, desde, hasta, ahora, rango, zonas, alTocar }: {
  filas: (FilaTiempo & { nombre: string })[]; desde: string; hasta: string; ahora: string; rango: string;
  zonas: { nombre: string; color: string }[];
  alTocar: (vehiculo: string, ini: string, fin: string) => void;
}) {
  const a = Date.parse(desde), b = Date.parse(hasta), largo = Math.max(1, b - a);
  const pc = (iso: string) => Math.max(0, Math.min(100, ((Date.parse(iso) - a) / largo) * 100));
  /* marcas cada 2 horas, en hora de Colombia */
  const marcas: { x: number; t: string }[] = [];
  const primera = Math.ceil(a / 3600_000) * 3600_000;
  for (let t = primera; t <= b; t += 3600_000) if (horaCo(t) % 2 === 0) marcas.push({ x: ((t - a) / largo) * 100, t: String(horaCo(t)).padStart(2, "0") });
  const nowX = pc(ahora), hayAhora = Date.parse(ahora) > a && Date.parse(ahora) < b;
  const usadas = zonas.filter((z) => filas.some((f) => f.bloques.some((k) => k.tipo === "zona" && k.zona === z.nombre)));

  return (
    <section className="tg-linea" aria-label="Línea de tiempo del día por vehículo">
      <header>
        <h2>Línea de tiempo · {rango === "hoy" ? "hoy" : "últimas 24 horas"}</h2>
        <div className="tg-linea-ley">
          {usadas.map((z) => <span key={z.nombre}><i style={{ background: z.color }} />{z.nombre}</span>)}
          <span><i style={{ background: "#c9ced4" }} />en tránsito</span>
          <span><i className="larga" />pasó de lo normal</span>
        </div>
      </header>
      {filas.length === 0 ? <p className="tg-vacio">Todavía ningún vehículo ha pasado por una zona en este periodo.</p> : (
        <div className="tg-linea-cuerpo">
          <div className="tg-linea-eje"><span />
            <div>{marcas.map((m) => <em key={m.x} style={{ left: `${m.x}%` }}>{m.t}</em>)}</div>
          </div>
          {filas.map((f) => {
            const largas = f.bloques.filter((k) => k.larga).length;
            const visitas = f.bloques.filter((k) => k.tipo === "zona").length;
            return (
              <div key={f.vehiculo} className="tg-linea-fila">
                <span className="tg-linea-et"><b>{f.nombre}</b><small>{visitas} {visitas === 1 ? "visita" : "visitas"}{largas ? <em> · {largas} larga{largas === 1 ? "" : "s"}</em> : null}</small></span>
                <div className="tg-linea-pista">
                  {marcas.map((m) => <i key={m.x} className="tg-linea-guia" style={{ left: `${m.x}%` }} />)}
                  {f.bloques.map((k, i) => {
                    const x = pc(k.ini), w = Math.max(0.25, pc(k.fin) - x);
                    const que = k.tipo === "zona" ? `En ${k.zona}` : k.zona ? `En tránsito hacia ${k.zona}` : "En tránsito";
                    const t = `${que} · ${hhmm(k.ini)} → ${k.abierto ? "ahora" : hhmm(k.fin)} · ${duracion(k.segundos)}${k.larga ? " · pasó de lo normal" : ""}`;
                    return (
                      <button key={i} type="button" className={"tg-bloque " + k.tipo + (k.larga ? " larga" : "") + (k.abierto ? " abierto" : "")}
                        style={{ left: `${x}%`, width: `${w}%`, background: k.tipo === "zona" ? k.color : undefined }}
                        title={t} aria-label={`${f.nombre}: ${t}`} onClick={() => alTocar(f.vehiculo, k.ini, k.fin)} />
                    );
                  })}
                  {hayAhora && <i className="tg-linea-ahora" style={{ left: `${nowX}%` }} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CalorEspera({ calor, normales, colores }: {
  calor: Map<string, (number | null)[]>; normales: Map<string, { normal: number | null; n: number }>; colores: Map<string, string>;
}) {
  const filas = [...calor].sort((x, y) => x[0].localeCompare(y[0], "es"));
  /* solo las horas con alguna visita, de la primera a la última, para no dejar columnas vacías */
  const con = Array.from({ length: 24 }, (_, h) => filas.some(([, v]) => v[h] != null));
  const h0 = con.indexOf(true), h1 = 23 - [...con].reverse().indexOf(true);
  if (h0 < 0) return null;
  const horas = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
  const clase = (s: number | null, n: number | null) => s == null ? "nada" : !n ? "sin" : s <= n ? "ok" : s <= n * 1.5 ? "medio" : "alto";

  return (
    <section className="tg-linea tg-calor" aria-label="Espera por hora de entrada">
      <header>
        <h2>Espera por hora de entrada</h2>
        <div className="tg-linea-ley">
          <span><i className="ok" />normal o menos</span><span><i className="medio" />hasta 1,5 × normal</span><span><i className="alto" />más de 1,5 ×</span><span><i className="sin" />aún sin normal</span>
        </div>
      </header>
      <div className="tg-calor-caja">
        <table>
          <thead><tr><th>Zona</th>{horas.map((h) => <th key={h}>{String(h).padStart(2, "0")}</th>)}<th>Normal</th></tr></thead>
          <tbody>
            {filas.map(([z, v]) => {
              const n = normales.get(z)?.normal ?? null;
              return (
                <tr key={z}>
                  <td><i className="tg-sw" style={{ background: colores.get(z) }} />{z}</td>
                  {horas.map((h) => {
                    const s = v[h];
                    return <td key={h} className={clase(s, n)} title={s == null ? `${z} · ${h}:00 · sin entradas` : `${z} · entraron a las ${h}:00 · esperaron ${duracion(s)} en promedio${n ? ` (normal ${duracion(n)})` : ""}`}>{s == null ? "" : Math.round(s / 60)}</td>;
                  })}
                  <td className="nrm">{n ? `${Math.round(n / 60)} min` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tg-nota">Minutos de espera promedio de los vehículos que entraron a la zona en esa hora, en el periodo escogido arriba. «Normal» es la mediana de los últimos 14 días.</p>
    </section>
  );
}
