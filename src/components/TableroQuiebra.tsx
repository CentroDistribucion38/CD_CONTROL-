"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Baja, Produccion, Meta, Carga } from "@/modulos/quiebra/datos";

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio",
                     "agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS_SEM = ["L","M","M","J","V","S","D"];

/**
 * El color va atado al NOMBRE de la causal, no a su posición: si mañana una
 * causal sube o baja en el ranking, no se le cambia el color debajo.
 */
const COLOR_CAUSAL: Record<string, string> = {
  "Sorting distribución": "#E4002B",
  "Presorting": "#B8001F",
  "Rotura máquina": "#8E0018",
  "Sorting envase": "#E9A81F",
  "Lavado / extrasucio": "#C58A12",
  "Otros": "#9AA9BB",
  "Rotura depósito": "#C6D0DC",
};
const OTRO_COLOR = "#7E8CA0";
const color = (c: string) => COLOR_CAUSAL[c] ?? OTRO_COLOR;

const nf = new Intl.NumberFormat("es-CO");
const pf = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : (v * 100).toFixed(d).replace(".", ",") + "%";
const mesDe = (f: string) => Number(f.slice(5, 7));

/* --------- fechas como texto AAAA-MM-DD: sin líos de zona horaria --------- */
const aTexto = (a: number, m: number, d: number) =>
  `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const partes = (f: string) => ({
  a: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)) - 1, d: Number(f.slice(8, 10)),
});
const bonita = (f: string) => {
  const { a, m, d } = partes(f);
  return `${d} ${MESES[m].toLowerCase()} ${a}`;
};
const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
/** 0 = lunes, para que la semana empiece como se lee aquí. */
const primerDia = (a: number, m: number) => (new Date(Date.UTC(a, m, 1)).getUTCDay() + 6) % 7;

type Props = {
  bajas: Baja[];
  produccion: Produccion[];
  metas: Meta[];
  ultimaCarga: Carga | null;
  esEditor: boolean;
};

export function TableroQuiebra({ bajas, produccion, metas, ultimaCarga, esEditor }: Props) {
  /* ------------------------ catálogos ------------------------ */
  const causales = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bajas) m.set(b.causal, (m.get(b.causal) ?? 0) + Number(b.cantidad));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }, [bajas]);

  const almacenes = useMemo(
    () => [...new Set(bajas.map((b) => b.almacen).filter(Boolean))].sort() as string[],
    [bajas]
  );
  const lineas = useMemo(
    () => [...new Set(produccion.map((p) => p.linea).filter((l) => l != null))]
      .sort((a, b) => Number(a) - Number(b)) as number[],
    [produccion]
  );

  const [minF, maxF] = useMemo(() => {
    const f = [...bajas.map((b) => b.fecha), ...produccion.map((p) => p.fecha)].sort();
    return [f[0] ?? "", f[f.length - 1] ?? ""];
  }, [bajas, produccion]);

  /* ------------------------ filtros ------------------------ */
  const [desde, setDesde] = useState(minF);
  const [hasta, setHasta] = useState(maxF);
  const [almacen, setAlmacen] = useState("");
  const [linea, setLinea] = useState("");
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());

  const metaDe = (m: number) => metas.find((x) => x.mes === m)?.meta ?? 0.016;

  const bj = useMemo(
    () => bajas.filter((b) =>
      b.fecha >= desde && b.fecha <= hasta &&
      (almacen === "" || b.almacen === almacen) &&
      !apagadas.has(b.causal)
    ),
    [bajas, desde, hasta, almacen, apagadas]
  );
  const pr = useMemo(
    () => produccion.filter((p) =>
      p.fecha >= desde && p.fecha <= hasta && (linea === "" || String(p.linea) === linea)
    ),
    [produccion, desde, hasta, linea]
  );

  const perdida = bj.reduce((a, b) => a + Number(b.cantidad), 0);
  const total = pr.reduce((a, p) => a + Number(p.cantidad), 0);
  const pct = total > 0 ? perdida / total : null;

  const prodMes = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of pr) m.set(mesDe(p.fecha), (m.get(mesDe(p.fecha)) ?? 0) + Number(p.cantidad));
    return m;
  }, [pr]);
  const perdMes = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of bj) m.set(mesDe(b.fecha), (m.get(mesDe(b.fecha)) ?? 0) + Number(b.cantidad));
    return m;
  }, [bj]);

  // La meta del período se pondera por producción: un mes que produjo poco no
  // puede pesar igual que uno que produjo el triple.
  const meta = useMemo(() => {
    let a = 0, t = 0;
    for (const [m, v] of prodMes) { a += v * metaDe(m); t += v; }
    return t ? a / t : 0.016;
  }, [prodMes, metas]);

  const exceso = Math.round(total * ((pct ?? 0) - meta));
  const sobre = pct != null && pct > meta;
  const pp = ((pct ?? 0) - meta) * 100;
  const parcial = apagadas.size > 0 || almacen !== "" || linea !== "";

  if (bajas.length === 0 && produccion.length === 0) {
    return (
      <div className="qb">
        <div className="vacio-total">
          <h2>Todavía no hay datos cargados</h2>
          <p>
            El tablero se arma con las hojas <b>BAJA MB51</b> y <b>ZPREC</b> del
            maestro. Importa el archivo y aparece solo.
          </p>
          {esEditor ? (
            <Link href="/quiebra/importar">Importar el maestro</Link>
          ) : (
            <p>Pídele a un supervisor que lo importe.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="qb">
      {/* Solo sale en el papel: el PDF no lleva la barra de la app. */}
      <div className="hoja-impresa">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-b.png" alt="" />
        <div>
          <b>CD38 · CONTROL</b>
          <span>Centro de Distribución 38 · Bavaria BAQ</span>
        </div>
        <div className="sello-fecha">
          Quiebra de envase<br />
          {bonita(desde)} — {bonita(hasta)}
        </div>
      </div>

      {/* ---------------- Encabezado ---------------- */}
      <section className="cabeza" data-parte="cabeza">
        <div className="texto">
          <div className="ojo">ENVASE RETORNABLE · AG01</div>
          <h1>Quiebra de envase</h1>
          <p className="sub">
            Rotura medida contra la producción del período.
            {ultimaCarga && <> Datos del {bonita(ultimaCarga.desde)} al {bonita(ultimaCarga.hasta)}.</>}
            {esEditor && <> <Link href="/quiebra/importar">Actualizar</Link></>}
          </p>
        </div>
        <div className="lado-derecho">
        <AccionesInforme
          armar={() => construirInforme({
            desde, hasta,
            filtros: resumenFiltros(almacen, linea, causales, apagadas),
          })}
        />
        <div className={"kpi" + (sobre ? "" : " bajo")}>
          <div className="corte" />
          <div className="rot">QUIEBRA DEL PERÍODO</div>
          <div className="num">{pf(pct)}</div>
          <div className="pie">
            <span>Meta <b>{pf(meta)}</b>{parcial ? " · filtrado" : ""}</span>
            <span className="delta">
              {pp >= 0 ? "+" : "−"}{Math.abs(pp).toFixed(2).replace(".", ",")} pp{" "}
              {sobre ? "sobre" : "bajo"} la meta
            </span>
          </div>
        </div>
        </div>
      </section>

      {/* ---------------- Filtros ---------------- */}
      <section className="filtros">
        <div className="arriba">
          <div className="sel">
            <label>Período</label>
            <Calendario
              desde={desde} hasta={hasta} minF={minF} maxF={maxF}
              aplicar={(d, h) => { setDesde(d); setHasta(h); }}
            />
          </div>

          <div className="sel">
            <label>Almacén</label>
            <Desplegable
              valor={almacen} cambiar={setAlmacen}
              opciones={[{ v: "", t: "Todos" }, ...almacenes.map((a) => ({ v: a, t: a }))]}
            />
          </div>

          <div className="sel">
            <label>Línea</label>
            <Desplegable
              valor={linea} cambiar={setLinea}
              opciones={[{ v: "", t: "Todas" },
                         ...lineas.map((l) => ({ v: String(l), t: `Línea ${l}` }))]}
            />
          </div>

          <button
            className="limpiar"
            onClick={() => {
              setDesde(minF); setHasta(maxF); setAlmacen(""); setLinea(""); setApagadas(new Set());
            }}
          >
            Restablecer
          </button>
        </div>

        <div className="causales">
          <span className="rot">Causales</span>
          {causales.map((c) => {
            const on = !apagadas.has(c);
            return (
              <button
                key={c}
                className={"chip" + (on ? "" : " off")}
                aria-pressed={on}
                onClick={() => {
                  const n = new Set(apagadas);
                  // nunca se apagan todas: el tablero quedaría en cero sin explicación
                  if (on && apagadas.size < causales.length - 1) n.add(c);
                  else n.delete(c);
                  setApagadas(n);
                }}
              >
                <i style={{ background: color(c) }} />
                {c}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------- Cifras ---------------- */}
      <section className="cifras" data-parte="cifras">
        <div className="cifra">
          <div className="rot">ENVASE PRODUCIDO</div>
          <div className="n">{nf.format(total)}</div>
          <div className="u">unidades</div>
        </div>
        <div className="cifra">
          <div className="rot">ENVASE ROTO</div>
          <div className="n">{nf.format(perdida)}</div>
          <div className="u">neto de reversos</div>
        </div>
        <div className={"cifra " + (exceso > 0 ? "alerta" : "buena")}>
          <div className="rot">{exceso > 0 ? "EXCESO SOBRE META" : "MARGEN BAJO LA META"}</div>
          <div className="n">{nf.format(Math.abs(exceso))}</div>
          <div className="u">
            {exceso > 0 ? "unidades por encima de lo permitido" : "unidades por debajo de lo permitido"}
          </div>
        </div>
      </section>

      {/* ---------------- Fila 1 ---------------- */}
      <section className="tarjetas" data-parte="graficos1">
        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>Quiebra mensual contra meta</h2>
              <p>Porcentaje sobre la producción del mes</p>
            </div>
          </div>
          <div className="cuerpo">
            <GraficoMes prodMes={prodMes} perdMes={perdMes} metaDe={metaDe} />
            <div className="leyenda abajo">
              <span><i style={{ background: "#0B4EA2" }} /> Bajo meta</span>
              <span><i style={{ background: "#E4002B" }} /> Sobre meta</span>
              <span><i className="meta" /> Meta del mes</span>
            </div>
          </div>
        </div>

        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>De dónde sale la quiebra</h2>
              <p>Participación en el período</p>
            </div>
          </div>
          <div className="cuerpo doble">
            <div className="parte">
              <div className="rotulo">Por causal</div>
              <Barras
                datos={causales.map((c) => ({
                  nom: c,
                  v: bj.filter((b) => b.causal === c).reduce((a, b) => a + Number(b.cantidad), 0),
                  col: color(c),
                }))}
                total={perdida}
              />
            </div>
            <div className="parte abajo-parte">
              <div className="rotulo">Por almacén</div>
              <Barras
                datos={almacenes.map((a) => ({
                  nom: a,
                  v: bj.filter((b) => b.almacen === a).reduce((x, b) => x + Number(b.cantidad), 0),
                  col: "#E4002B",
                })).sort((x, y) => y.v - x.v)}
                total={perdida}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Fila 2 ---------------- */}
      <section className="tarjetas dos" data-parte="graficos2">
        <TarjetaDia bajas={bj} prod={pr} meta={meta} />

        <div className="tarjeta">
          <div className="cab">
            <div>
              <h2>Composición mes a mes</h2>
              <p>Unidades rotas por causal</p>
            </div>
          </div>
          <div className="cuerpo">
            <GraficoApilado bajas={bj} causales={causales} />
            <div className="leyenda abajo">
              {causales.filter((c) => !apagadas.has(c)).map((c) => (
                <span key={c}><i style={{ background: color(c) }} /> {c}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Fila 3 ---------------- */}
      <section className="tarjetas pareja" data-parte="tablas">
        <div className="tarjeta">
          <div className="cab"><div><h2>Quiebra por envase</h2><p>Top 8 del período</p></div></div>
          <div className="cuerpo tabla">
            <TablaMateriales bajas={bj} total={perdida} />
          </div>
        </div>

        <div className="tarjeta">
          <div className="cab"><div><h2>Detalle mensual</h2><p>Producción, quiebra y meta</p></div></div>
          <div className="cuerpo tabla">
            <TablaMes prodMes={prodMes} perdMes={perdMes} metaDe={metaDe} />
          </div>
        </div>
      </section>

      <p className="nota-pie">
        {nf.format(bj.length)} de {nf.format(bajas.length)} movimientos de baja y{" "}
        {nf.format(pr.length)} de {nf.format(produccion.length)} órdenes de producción dentro
        del filtro actual. La quiebra es neta: los reversos con cantidad positiva restan.
      </p>
    </div>
  );
}

/* ==================== Desplegable ==================== */
function Desplegable({ valor, cambiar, opciones }: {
  valor: string;
  cambiar: (v: string) => void;
  opciones: { v: string; t: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useAfuera(caja, () => setAbierto(false));

  const actual = opciones.find((o) => o.v === valor)?.t ?? opciones[0]?.t ?? "";

  return (
    <div className="desplegable" ref={caja}>
      <button
        type="button"
        className="disparo"
        aria-expanded={abierto}
        aria-haspopup="listbox"
        onClick={() => setAbierto((a) => !a)}
      >
        <span className="txt">{actual}</span>
        <svg className="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {abierto && (
        <div className="opciones" role="listbox">
          {opciones.map((o) => (
            <button
              key={o.v}
              type="button"
              role="option"
              aria-selected={o.v === valor}
              className={o.v === valor ? "elegida" : ""}
              onClick={() => { cambiar(o.v); setAbierto(false); }}
            >
              <svg className="tic" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
              {o.t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== Calendario de rango ==================== */
function Calendario({ desde, hasta, minF, maxF, aplicar }: {
  desde: string; hasta: string; minF: string; maxF: string;
  aplicar: (d: string, h: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ini, setIni] = useState(desde);
  const [fin, setFin] = useState(hasta);
  const [ancla, setAncla] = useState(() => partes(hasta || maxF || minF));
  const caja = useRef<HTMLDivElement>(null);
  useAfuera(caja, () => setAbierto(false));

  useEffect(() => { setIni(desde); setFin(hasta); }, [desde, hasta, abierto]);

  const hoy = maxF; // "hoy" del negocio es el último día con datos
  const atajos: { t: string; d: () => [string, string] }[] = [
    { t: "Todo el histórico", d: () => [minF, maxF] },
    { t: "Este año", d: () => [`${partes(maxF).a}-01-01`, maxF] },
    { t: "Este mes", d: () => {
        const { a, m } = partes(maxF);
        return [aTexto(a, m, 1), maxF];
      } },
    { t: "Mes pasado", d: () => {
        const { a, m } = partes(maxF);
        const am = m === 0 ? a - 1 : a, mm = m === 0 ? 11 : m - 1;
        return [aTexto(am, mm, 1), aTexto(am, mm, diasDelMes(am, mm))];
      } },
    { t: "Últimos 30 días", d: () => {
        const { a, m, d } = partes(maxF);
        const x = new Date(Date.UTC(a, m, d - 29));
        return [aTexto(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()), maxF];
      } },
  ];

  function tocar(f: string) {
    // Primer toque abre un rango nuevo; el segundo lo cierra.
    if (!ini || (ini && fin)) { setIni(f); setFin(""); return; }
    if (f < ini) { setFin(ini); setIni(f); } else setFin(f);
  }

  const listo = ini && fin;

  return (
    <div className="calendario" ref={caja}>
      <button
        type="button"
        className="disparo ancho"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <svg className="ico" viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
          <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
        </svg>
        <span className="txt">{bonita(desde)} — {bonita(hasta)}</span>
        <svg className="flecha" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {abierto && (
        <div className="panel" role="dialog" aria-label="Elegir período">
          <div className="cal-cuerpo">
            <div className="atajos">
              {atajos.map((a) => {
                const [d, h] = a.d();
                return (
                  <button
                    key={a.t}
                    type="button"
                    className={ini === d && fin === h ? "on" : ""}
                    onClick={() => { setIni(d); setFin(h); setAncla(partes(h)); }}
                  >
                    {a.t}
                  </button>
                );
              })}
            </div>

            <div className="meses">
              {[0, 1].map((k) => {
                const m = (ancla.m - 1 + k + 12) % 12;
                const a = ancla.a + Math.floor((ancla.m - 1 + k) / 12);
                return (
                  <Mes
                    key={k}
                    anio={a} mes={m}
                    ini={ini} fin={fin} hoy={hoy} minF={minF} maxF={maxF}
                    primero={k === 0} segundo={k === 1}
                    mover={(paso) => {
                      const nm = ancla.m + paso;
                      setAncla({ a: ancla.a + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12, d: 1 });
                    }}
                    tocar={tocar}
                  />
                );
              })}
            </div>
          </div>

          <div className="cal-pie">
            <div className="resumen">
              {listo ? (
                <>Del <b>{bonita(ini)}</b> al <b>{bonita(fin)}</b></>
              ) : (
                <>Elige el día en que termina</>
              )}
            </div>
            <div className="btns">
              <button className="cancelar" onClick={() => setAbierto(false)}>Cancelar</button>
              <button
                className="aplicar"
                disabled={!listo}
                onClick={() => { if (listo) { aplicar(ini, fin); setAbierto(false); } }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Mes({ anio, mes, ini, fin, hoy, minF, maxF, primero, segundo, mover, tocar }: {
  anio: number; mes: number; ini: string; fin: string; hoy: string;
  minF: string; maxF: string; primero: boolean; segundo: boolean;
  mover: (paso: number) => void; tocar: (f: string) => void;
}) {
  const hueco = primerDia(anio, mes);
  const dias = diasDelMes(anio, mes);

  return (
    <div className={"mes" + (segundo ? " segundo" : "")}>
      <div className="mes-cab">
        {primero ? (
          <button type="button" aria-label="Mes anterior" onClick={() => mover(-1)}>
            <svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6" /></svg>
          </button>
        ) : <span className="hueco" />}
        <div className="titulo-mes">{MESES_LARGO[mes]} {anio}</div>
        {segundo ? (
          <button type="button" aria-label="Mes siguiente" onClick={() => mover(1)}>
            <svg viewBox="0 0 24 24"><path d="M10 6l6 6-6 6" /></svg>
          </button>
        ) : <span className="hueco" />}
      </div>

      <div className="semana">
        {DIAS_SEM.map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <div className="dias">
        {Array.from({ length: hueco }).map((_, i) => <span key={"h" + i} />)}
        {Array.from({ length: dias }).map((_, i) => {
          const f = aTexto(anio, mes, i + 1);
          const fuera = f < minF || f > maxF;
          const punta = f === ini || (!!fin && f === fin);
          const dentro = !!fin && f > ini && f < fin;
          const clases = [
            fuera ? "fuera" : "",
            punta ? "punta" : "",
            dentro ? "dentro" : "",
            f === ini ? "inicio" : "",
            fin && f === fin ? "fin" : "",
            f === hoy ? "hoy" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={f}
              type="button"
              className={clases}
              disabled={fuera}
              onClick={() => tocar(f)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Cierra un panel cuando se toca por fuera o se aprieta Escape. */
function useAfuera(ref: React.RefObject<HTMLElement | null>, cerrar: () => void) {
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clic);
      document.removeEventListener("keydown", tecla);
    };
  }, [ref, cerrar]);
}

/* ==================== Barras horizontales ==================== */
function Barras({ datos, total }: {
  datos: { nom: string; v: number; col: string }[];
  total: number;
}) {
  const max = Math.max(1, ...datos.map((d) => d.v));
  return (
    <>
      {datos.map((d) => (
        <div className="fila" key={d.nom}>
          <div className="nom" title={d.nom}>{d.nom}</div>
          <div className="pista">
            <div
              className="relleno"
              style={{ width: `${Math.max(0, (d.v / max) * 100)}%`, background: d.col }}
            />
          </div>
          <div className="pct">{total > 0 ? pf(d.v / total, 1) : "—"}</div>
        </div>
      ))}
      {!datos.length && <p className="nota-pie">Sin datos con este filtro.</p>}
    </>
  );
}

/* ==================== Gráfico mensual ==================== */
function GraficoMes({ prodMes, perdMes, metaDe }: {
  prodMes: Map<number, number>; perdMes: Map<number, number>; metaDe: (m: number) => number;
}) {
  const W = 720, H = 300, m = { t: 20, r: 12, b: 32, l: 64 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const meses = [...prodMes.keys()].sort((a, b) => a - b);
  const filas = meses.map((mm) => {
    const prod = prodMes.get(mm) ?? 0, perd = perdMes.get(mm) ?? 0;
    return { mm, prod, perd, pct: prod ? perd / prod : 0, meta: metaDe(mm) };
  });
  const max = Math.max(0.01, ...filas.map((f) => Math.max(f.pct, f.meta))) * 1.16;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const paso = iw / Math.max(1, filas.length);
  const an = Math.min(34, paso * 0.42);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico g-mes" role="img"
         aria-label="Quiebra mensual contra la meta">
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (max * i) / 4;
        return (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="rejilla" />
            <text x={m.l - 10} y={y(v) + 4} className="eje" textAnchor="end">{pf(v, 1)}</text>
          </g>
        );
      })}
      {filas.map((f, i) => {
        const cx = m.l + paso * i + paso / 2;
        const alto = Math.max(2, m.t + ih - y(f.pct));
        const encima = f.pct > f.meta;
        return (
          <g key={f.mm}>
            <rect x={cx - an / 2} y={y(f.pct)} width={an} height={alto}
                  fill={encima ? "#E4002B" : "#0B4EA2"}>
              <title>{`${MESES[f.mm - 1]}\nQuiebra ${pf(f.pct)} · Meta ${pf(f.meta)}\n${nf.format(f.perd)} de ${nf.format(f.prod)} und`}</title>
            </rect>
            <text x={cx} y={y(f.pct) - 8} className="val" textAnchor="middle">{pf(f.pct, 2)}</text>
            <line x1={cx - an / 2 - 8} x2={cx + an / 2 + 8} y1={y(f.meta)} y2={y(f.meta)} className="meta" />
            <text x={cx} y={H - 14} className="eje" textAnchor="middle">{MESES[f.mm - 1]}</text>
          </g>
        );
      })}
      {!filas.length && (
        <text x={W / 2} y={H / 2} className="eje" textAnchor="middle">Sin datos con este filtro</text>
      )}
    </svg>
  );
}

/* ==================== Día a día ==================== */
function TarjetaDia({ bajas, prod, meta }: { bajas: Baja[]; prod: Produccion[]; meta: number }) {
  const pd = new Map<string, number>(), ld = new Map<string, number>();
  for (const p of prod) pd.set(p.fecha, (pd.get(p.fecha) ?? 0) + Number(p.cantidad));
  for (const b of bajas) ld.set(b.fecha, (ld.get(b.fecha) ?? 0) + Number(b.cantidad));
  const dias = [...new Set([...pd.keys(), ...ld.keys()])].sort();
  const filas = dias.map((f) => {
    const p = pd.get(f) ?? 0, q = ld.get(f) ?? 0;
    return { f, prod: p, perd: q, pct: p ? q / p : 0 };
  });

  // Percentil 95: unos pocos días de producción mínima disparan porcentajes
  // enormes y aplastan el resto. Los que se salen van al tope con una punta.
  const orden = filas.map((x) => x.pct).sort((a, b) => a - b);
  const p95 = orden[Math.min(orden.length - 1, Math.floor(orden.length * 0.95))] || 0.01;
  const max = Math.max(meta * 1.6, p95) * 1.12 || 0.01;
  const fuera = filas.filter((x) => x.pct > max).length;

  const W = 1000, H = 250, m = { t: 14, r: 12, b: 28, l: 88 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const y = (v: number) => m.t + ih - (Math.min(v, max) / max) * ih;
  const paso = iw / Math.max(1, filas.length);
  const an = Math.max(1.6, Math.min(12, paso * 0.62));

  // Una marca por mes: con 250 días, una etiqueta por día es ilegible.
  const marcas = filas.map((x, i) => ({ ...x, i }))
    .filter((x, i, arr) => i === 0 || x.f.slice(5, 7) !== arr[i - 1].f.slice(5, 7));

  return (
    <div className="tarjeta">
      <div className="cab">
        <div>
          <h2>Día a día</h2>
          <p>
            {filas.length} días del período
            {fuera > 0 && <> · {fuera} día{fuera > 1 ? "s" : ""} por encima de la escala</>}
          </p>
        </div>
      </div>
      <div className="cuerpo">
        <svg viewBox={`0 0 ${W} ${H}`} className="grafico g-dia" role="img" aria-label="Quiebra diaria">
          {[0, 1, 2, 3, 4].map((i) => {
            const v = (max * i) / 4;
            return (
              <g key={i}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="rejilla" />
                <text x={m.l - 10} y={y(v) + 4} className="eje" textAnchor="end">
                  {pf(v, 1)}{i === 4 ? "+" : ""}
                </text>
              </g>
            );
          })}
          {!!filas.length && (
            <line x1={m.l} x2={W - m.r} y1={y(meta)} y2={y(meta)} className="meta" />
          )}
          {filas.map((x, i) => {
            const px = m.l + paso * i + (paso - an) / 2;
            const corta = x.pct > max, yv = y(x.pct);
            return (
              <g key={x.f}>
                <rect x={px} y={yv} width={an} height={Math.max(1.2, m.t + ih - yv)}
                      fill={x.pct > meta ? "#E4002B" : "#0B4EA2"}>
                  <title>{`${x.f}\nQuiebra ${pf(x.pct)}${corta ? " (fuera de escala)" : ""}\n${nf.format(x.perd)} de ${nf.format(x.prod)} und`}</title>
                </rect>
                {corta && (
                  <path d={`M${px - 2} ${yv} L${px + an / 2} ${yv - 7} L${px + an + 2} ${yv} Z`}
                        fill="#E4002B" />
                )}
              </g>
            );
          })}
          {marcas.map((x) => (
            <text key={x.f} x={m.l + paso * x.i + paso / 2} y={H - 10}
                  className="eje" textAnchor="middle">
              {x.f.slice(8)}/{x.f.slice(5, 7)}
            </text>
          ))}
          {!filas.length && (
            <text x={W / 2} y={H / 2} className="eje" textAnchor="middle">Sin datos con este filtro</text>
          )}
        </svg>
        <div className="leyenda abajo">
          <span><i style={{ background: "#0B4EA2" }} /> Bajo meta</span>
          <span><i style={{ background: "#E4002B" }} /> Sobre meta</span>
          <span><i className="meta" /> Meta</span>
        </div>
      </div>
    </div>
  );
}

/* ==================== Composición apilada ==================== */
function GraficoApilado({ bajas, causales }: { bajas: Baja[]; causales: string[] }) {
  const W = 620, H = 290, m = { t: 14, r: 10, b: 30, l: 66 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const meses = [...new Set(bajas.map((b) => mesDe(b.fecha)))].sort((a, b) => a - b);
  const cs = causales.filter((c) => bajas.some((b) => b.causal === c));

  const mat = meses.map((mm) =>
    cs.map((c) => bajas
      .filter((b) => mesDe(b.fecha) === mm && b.causal === c)
      .reduce((a, b) => a + Number(b.cantidad), 0))
  );
  const tot = mat.map((f) => f.reduce((a, b) => a + Math.max(0, b), 0));
  const max = Math.max(1, ...tot) * 1.12;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const paso = iw / Math.max(1, meses.length), an = Math.min(34, paso * 0.56);

  const etiqueta = (v: number) =>
    v >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + "M" : Math.round(v / 1e3) + "k";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico g-apilado" role="img"
         aria-label="Composición mensual por causal">
      {[0, 1, 2, 3].map((i) => {
        const v = (max * i) / 3;
        return (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="rejilla" />
            <text x={m.l - 10} y={y(v) + 4} className="eje" textAnchor="end">{etiqueta(v)}</text>
          </g>
        );
      })}
      {meses.map((mm, i) => {
        const x = m.l + paso * i + (paso - an) / 2;
        let ac = 0;
        return (
          <g key={mm}>
            {cs.map((c, j) => {
              const v = mat[i][j];
              if (v <= 0) return null;
              const y0 = y(ac + v), h = Math.max(1, y(ac) - y0 - 1.5);
              ac += v;
              return (
                <rect key={c} x={x} y={y0} width={an} height={h} fill={color(c)}>
                  <title>{`${MESES[mm - 1]} · ${c}\n${nf.format(v)} und`}</title>
                </rect>
              );
            })}
            <text x={x + an / 2} y={H - 10} className="eje" textAnchor="middle">{MESES[mm - 1]}</text>
          </g>
        );
      })}
      {!meses.length && (
        <text x={W / 2} y={H / 2} className="eje" textAnchor="middle">Sin datos con este filtro</text>
      )}
    </svg>
  );
}

/* ==================== Tablas ==================== */
function TablaMateriales({ bajas, total }: { bajas: Baja[]; total: number }) {
  const map = new Map<string, { den: string; v: number }>();
  for (const b of bajas) {
    const k = b.material ?? "—";
    const a = map.get(k) ?? { den: b.denominacion ?? k, v: 0 };
    a.v += Number(b.cantidad);
    map.set(k, a);
  }
  const top = [...map.entries()].filter((x) => x[1].v > 0)
    .sort((a, b) => b[1].v - a[1].v).slice(0, 8);
  const mx = top[0]?.[1].v ?? 1;

  return (
    <table>
      <thead>
        <tr>
          <th>Envase</th>
          <th className="num">Unidades</th>
          <th className="num">Part.</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {top.map(([cod, x]) => (
          <tr key={cod}>
            <td>
              <div className="nom">{x.den}</div>
              <div className="cod">{cod}</div>
            </td>
            <td className="num">{nf.format(x.v)}</td>
            <td className="num">{total > 0 ? pf(x.v / total, 1) : "—"}</td>
            <td className="mini">
              <div className="pista">
                <div className="relleno" style={{ width: `${(x.v / mx) * 100}%` }} />
              </div>
            </td>
          </tr>
        ))}
        {!top.length && <tr><td className="vacio" colSpan={4}>Sin datos con este filtro</td></tr>}
      </tbody>
    </table>
  );
}

function TablaMes({ prodMes, perdMes, metaDe }: {
  prodMes: Map<number, number>; perdMes: Map<number, number>; metaDe: (m: number) => number;
}) {
  const meses = [...prodMes.keys()].sort((a, b) => a - b);
  return (
    <table>
      <thead>
        <tr>
          <th>Mes</th>
          <th className="num">Producción</th>
          <th className="num">Quiebra</th>
          <th className="num">%</th>
          <th className="num">Meta</th>
        </tr>
      </thead>
      <tbody>
        {meses.map((mm) => {
          const p = prodMes.get(mm) ?? 0, q = perdMes.get(mm) ?? 0;
          const pc = p ? q / p : 0, mt = metaDe(mm), encima = pc > mt;
          return (
            <tr key={mm}>
              <td className="mes">{MESES[mm - 1]}</td>
              <td className="num">{nf.format(p)}</td>
              <td className="num">{nf.format(q)}</td>
              <td className={"num " + (encima ? "sobre" : "bajo")}>
                {encima ? "▲" : "▼"} {pf(pc)}
              </td>
              <td className="num meta">{pf(mt)}</td>
            </tr>
          );
        })}
        {!meses.length && <tr><td className="vacio" colSpan={5}>Sin datos con este filtro</td></tr>}
      </tbody>
    </table>
  );
}

/* ==================== Informe: PDF y copiar ==================== */

/** Los bloques del tablero que van al informe, en orden. */
const PARTES = ["cabeza", "cifras", "graficos1", "graficos2", "tablas"];

type Foto = { url: string; an: number; al: number };

/**
 * Fotografía cada bloque del tablero. Se hace sobre lo que está en pantalla
 * a propósito: así el informe SIEMPRE coincide con lo que la persona está
 * viendo, con sus filtros, y no puede desfasarse de una copia aparte.
 *
 * Durante la captura se ensancha el contenido a 1900px: si se rasteriza tal
 * cual en un celular, el PDF sale con la versión apilada y las gráficas
 * ilegibles.
 */
async function fotografiar(): Promise<Foto[]> {
  const html2canvas = (await import("html2canvas")).default;
  document.body.classList.add("capturando");
  // Un respiro para que el navegador aplique el ancho antes de medir.
  await new Promise((r) => setTimeout(r, 150));

  const salida: Foto[] = [];
  try {
    for (const nombre of PARTES) {
      const el = document.querySelector<HTMLElement>(`[data-parte="${nombre}"]`);
      if (!el) continue;
      const lienzo = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#FFFFFF",
        logging: false,
        useCORS: true,
        windowWidth: 2000,
        width: el.getBoundingClientRect().width,
        onclone: (doc) =>
          doc.querySelectorAll(".acciones-informe").forEach((e) => e.remove()),
      });
      salida.push({ url: lienzo.toDataURL("image/png"), an: lienzo.width, al: lienzo.height });
    }
  } finally {
    document.body.classList.remove("capturando");
  }
  return salida;
}

/** Una línea que dice con qué filtros se sacó el informe. */
function resumenFiltros(
  almacen: string, linea: string, causales: string[], apagadas: Set<string>
): string {
  const fuera = causales.filter((c) => apagadas.has(c));
  return (
    `Almacén ${almacen || "Todos"} · Línea ${linea ? `Línea ${linea}` : "Todas"} · ` +
    (fuera.length ? `Causales excluidas: ${fuera.join(", ")}` : "Todas las causales")
  );
}

function selloFecha(): string {
  const f = new Date();
  return (
    "Generado " +
    f.toLocaleDateString("es-CO") +
    " " +
    f.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
  );
}

/**
 * Dos formas de sacar el tablero de la pantalla:
 *
 *  · Generar PDF — arma un A4 horizontal paginado, con encabezado en cada
 *    página (marca, período y filtros) y numeración al pie. Se descarga
 *    directo, sin pasar por el diálogo de impresión.
 *
 *  · Copiar informe — deja el tablero en el portapapeles listo para pegar
 *    en un correo. Es el formato en que de verdad se manda esto a diario.
 */
/* ---------- Composición de las hojas ----------
   Las hojas se dibujan una sola vez y sirven para las dos salidas: el PDF
   mete cada hoja como página y el portapapeles pega esas mismas imágenes.
   Así lo que se descarga y lo que se pega son idénticos, no dos armados
   parecidos que pueden separarse con el tiempo. */

/** A4 horizontal a 6 px por milímetro: nítido al imprimir y liviano al pegar. */
const PX_MM = 6;
const HOJA = { ancho: 297 * PX_MM, alto: 210 * PX_MM, margen: 10 * PX_MM };

const TIPO = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => mal(new Error("no cargó " + url));
    im.src = url;
  });
}

/**
 * Reparte los bloques del tablero en hojas A4 y devuelve cada hoja como
 * imagen, con el encabezado repetido y el pie numerado.
 */
async function componerHojas(fotos: Foto[], enc: string[]): Promise<string[]> {
  const { ancho, alto, margen: M } = HOJA;
  const util = ancho - M * 2;
  const yInicio = M + 84;
  const yTope = alto - M - 30;

  let logo: HTMLImageElement | null = null;
  try { logo = await cargarImagen("/marca/logo-b.png"); } catch { /* sin logo se sigue */ }

  // 1. repartir: un bloque no se parte a la mitad entre dos hojas
  const hojas: { im: HTMLImageElement; y: number; alto: number }[][] = [];
  let actual: { im: HTMLImageElement; y: number; alto: number }[] = [];
  let y = yInicio;

  for (const f of fotos) {
    const im = await cargarImagen(f.url);
    const h = (f.al / f.an) * util;
    if (y + h > yTope && actual.length) { hojas.push(actual); actual = []; y = yInicio; }
    actual.push({ im, y, alto: h });
    y += h + 24;
  }
  if (actual.length) hojas.push(actual);
  if (!hojas.length) return [];

  // 2. dibujar
  const sello = selloFecha() + " · CONTROL";
  return hojas.map((bloques, i) => {
    const c = document.createElement("canvas");
    c.width = ancho;
    c.height = alto;
    const g = c.getContext("2d")!;

    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, ancho, alto);

    // --- encabezado
    if (logo) g.drawImage(logo, M, M - 6, 51, 51);
    g.fillStyle = "#04203F";
    g.font = `700 26px ${TIPO}`;
    g.textBaseline = "alphabetic";
    g.fillText(enc[0], M + 66, M + 22);
    g.fillStyle = "#5B6B7F";
    g.font = `400 17px ${TIPO}`;
    g.fillText(enc[1], M + 66, M + 46);
    g.fillStyle = "#E4002B";
    g.fillRect(M, M + 60, util, 3);

    // --- bloques
    for (const b of bloques) g.drawImage(b.im, M, b.y, util, b.alto);

    // --- pie
    g.fillStyle = "#8C98A8";
    g.font = `400 16px ${TIPO}`;
    g.textAlign = "left";
    g.fillText(sello, M, alto - M - 4);
    g.textAlign = "right";
    g.fillText(`Página ${i + 1} de ${hojas.length}`, ancho - M, alto - M - 4);
    g.textAlign = "left";

    return c.toDataURL("image/png");
  });
}

function AccionesInforme({ armar }: { armar: () => { enc: string[]; nombre: string } }) {
  const [estado, setEstado] = useState<"" | "listo" | "mal">("");
  const [aviso, setAviso] = useState("");
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    if (!estado) return;
    const t = setTimeout(() => setEstado(""), 3600);
    return () => clearTimeout(t);
  }, [estado]);

  function fallo(msg: string) {
    setAviso(msg);
    setEstado("mal");
  }

  /** Prepara las hojas una sola vez y las guarda para las dos salidas. */
  async function prepararHojas(enc: string[]): Promise<string[]> {
    const fotos = await fotografiar();
    if (!fotos.length) throw new Error("no se pudo leer el tablero");
    const hojas = await componerHojas(fotos, enc);
    if (!hojas.length) throw new Error("no se pudo componer el informe");
    return hojas;
  }

  async function generarPdf() {
    setGenerando(true);
    try {
      const { enc, nombre } = armar();
      const hojas = await prepararHojas(enc);

      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      hojas.forEach((hoja, i) => {
        if (i > 0) pdf.addPage();
        // La hoja ya trae encabezado y pie dibujados: entra completa.
        pdf.addImage(hoja, "PNG", 0, 0, 297, 210, undefined, "FAST");
      });
      pdf.save(nombre);

      setAviso(`PDF de ${hojas.length} hoja${hojas.length > 1 ? "s" : ""} generado.`);
      setEstado("listo");
    } catch (e) {
      // Si el navegador no puede rasterizar, al menos queda la impresión del
      // navegador, que usa los estilos de papel de quiebra.css.
      fallo("No se pudo armar el PDF. Se abrirá la impresión del navegador.");
      setTimeout(() => window.print(), 900);
      void e;
    }
    setGenerando(false);
  }

  return (
    <>
      <div className="acciones-informe">
        <button type="button" className="accion" onClick={generarPdf} disabled={generando}>
          <svg viewBox="0 0 24 24">
            <path d="M8 3.5h5.5L18 8v12.5H6V3.5z" />
            <path d="M13.5 3.5V8H18" />
            <path d="M9.5 15.5h5M9.5 12.5h3" />
          </svg>
          {generando ? "Generando…" : "Generar PDF"}
        </button>
      </div>

      {estado && (
        <div className={"qb-aviso-copia" + (estado === "mal" ? " mal" : "")} role="status">
          <svg viewBox="0 0 24 24">
            {estado === "listo"
              ? <path d="M5 12.5l4.5 4.5L19 7" />
              : <path d="M6 6l12 12M18 6L6 18" />}
          </svg>
          {aviso}
        </div>
      )}
    </>
  );
}

type DatosInforme = {
  desde: string; hasta: string;
  filtros: string;
};

/** Encabezado que se repite en cada hoja, y el nombre del archivo. */
function construirInforme(d: DatosInforme): { enc: string[]; nombre: string } {
  const periodo = `${bonita(d.desde)} — ${bonita(d.hasta)}`;
  return {
    enc: [
      "Quiebra de envase · Ag01",
      `Centro de Distribución 38 · Bavaria BAQ · ${periodo} · ${d.filtros}`,
    ],
    nombre: `quiebra-ag01-${d.desde}-a-${d.hasta}.pdf`,
  };
}
