"use client";

/**
 * EL CIERRE DEL TURNO —y el del día entero.
 *
 * «Que en el tablero de control pueda tener un icono y visualizar el
 * cierre por turno o del día.»  Y después: «así las quiero ya», con la
 * maqueta — banda negra con el sello, la franja del acento con el
 * porcentaje y la cinta, los avisos, y las dos tablas.
 *
 * QUÉ ES Y QUÉ NO ES. Esto MIRA, no cierra: nadie firma nada ni queda
 * nada congelado en la base. Es la foto de cómo quedó el turno en el
 * momento en que se abre, para leerla en la reunión, imprimirla o
 * mandarla. Por eso arriba dice la hora a la que se armó: si mañana
 * alguien registra un viaje de este turno, la cifra cambia — y una foto
 * sin hora se vuelve una cifra que nadie puede ubicar.
 *
 * LAS CIFRAS NO SE VUELVEN A CALCULAR AQUÍ. Llegan las mismas filas que
 * la pantalla ya está pintando y se suman igual. Si esta ficha hiciera
 * su propia cuenta, bastaría un redondeo distinto para que el cierre y
 * el tablero dijeran cosas distintas del mismo turno, y a partir de ahí
 * nadie le cree a ninguno de los dos.
 *
 * LOS VIAJES SE PIDEN AL ABRIR, no al cargar el tablero. El tablero se
 * queda puesto en la oficina refrescándose cada dos minutos; traer los
 * viajes del rango en cada refresco sería pagar una consulta grande
 * todo el día para algo que se abre tres veces.
 *
 * EL CELULAR NO ES LA MISMA PÁGINA ENCOGIDA. Las dos tablas se vuelven
 * acordeones cerrados y los viajes, tarjetas: lo que se mira de pie es
 * el porcentaje y los avisos, y el detalle se abre solo si alguien lo
 * busca. Abajo queda fija la barra con lo que se hace desde ahí.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Control, Viaje } from "@/modulos/traspasos/datos";
import { HORARIO } from "@/modulos/traspasos/formato";

type Props = {
  /** Las mismas filas que el tablero está pintando, ya filtradas. */
  filas: Control[];
  desde: string;
  hasta: string;
  /** El turno del cierre, o null para el día (o el rango) entero. */
  turno: string | null;
  rotulo: string;
  cerrar: () => void;
};

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const ddmm = (f: string) => f.slice(8, 10) + "/" + f.slice(5, 7);
/** Un nombre largo no cabe en la columna: «Génesis Visbal» → «G. Visbal». */
const corto = (n: string) => {
  const p = n.trim().split(/\s+/);
  return p.length > 1 ? `${p[0][0]}. ${p[p.length - 1]}` : n;
};

export function Cierre({ filas, desde, hasta, turno, rotulo, cerrar }: Props) {
  const [viajes, setViajes] = useState<Viaje[] | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [vacios, setVacios] = useState<number | null>(null);
  const [mal, setMal] = useState<string | null>(null);

  /* La hora en que se armó la foto. Se fija UNA vez, al abrir: si se
     recalculara en cada dibujo, la hora del papel iría cambiando
     mientras alguien lo lee. */
  const [armado] = useState(() => new Date());

  useEffect(() => {
    const corta = new AbortController();
    const p = new URLSearchParams({ desde, hasta });
    if (turno) p.set("turno", turno);
    fetch(`/api/traspasos/cierre?${p}`, { signal: corta.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `No se pudo (${r.status}).`);
        return r.json();
      })
      .then((j) => { setViajes(j.viajes ?? []); setNombres(j.nombres ?? {}); setVacios(j.vacios ?? 0) })
      .catch((e) => { if (e.name !== "AbortError") setMal(String(e.message ?? e)) });
    return () => corta.abort();
  }, [desde, hasta, turno]);

  /* Escape cierra. Es lo que la mano hace sola cuando algo se abre
     encima de lo que estaba mirando. */
  const alTeclear = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") cerrar() }, [cerrar]);
  useEffect(() => {
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [alTeclear]);

  const mias = useMemo(() => filas.filter((f) => !turno || f.turno === turno), [filas, turno]);
  const sum = (k: keyof Control) => mias.reduce((a, f) => a + (Number(f[k]) || 0), 0);
  const planeado = sum("planeado"), cumplido = sum("cumplido");
  const adheridos = sum("adheridos"), adicionales = sum("adicionales");
  const carga = sum("carga");
  const faltan = planeado - adheridos;
  const adherencia = planeado > 0 ? Math.round((adheridos / planeado) * 100) : null;
  const cumplimiento = planeado > 0 ? Math.round((cumplido / planeado) * 100) : null;

  /* LA CINTA REPARTE SOBRE EL PLAN, no sobre lo movido. Si se hicieron
     más de los planeados, el tramo de adicionales se recorta para que
     la cinta no se pase de largo: lo de más ya está dicho al lado. */
  const base = Math.max(planeado, 1);
  const pOk = Math.min(100, (adheridos / base) * 100);
  const pExtra = Math.min(100 - pOk, (adicionales / base) * 100);
  const pFalta = Math.max(0, 100 - pOk - pExtra);

  /* Por tipo, dentro de este turno: es lo que contesta «¿qué falló?».
     Un 70% no se arregla; un «casco 15 de 23» sí. */
  const tipos = useMemo(() => {
    const m = new Map<string, { nombre: string; orden: number; planeado: number; adheridos: number; adicionales: number; faltan: number }>();
    for (const f of mias) {
      const x = m.get(f.tipo) ?? { nombre: f.tipo_nombre ?? f.tipo, orden: f.tipo_orden ?? 99, planeado: 0, adheridos: 0, adicionales: 0, faltan: 0 };
      x.planeado += f.planeado; x.adheridos += f.adheridos;
      x.adicionales += f.adicionales; x.faltan += f.faltan;
      m.set(f.tipo, x);
    }
    return [...m.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  }, [mias]);

  const vivos = useMemo(() => (viajes ?? []).filter((v) => v.estado === "registrado"), [viajes]);

  /* LO QUE HAY QUE MIRAR. Solo lo que hay: un renglón que dice «0 sin
     orden de cargue» es un renglón que la gente aprende a saltarse, y
     el día que diga 3 tampoco lo va a leer. */
  const ojos = useMemo(() => {
    const l: { que: string; n: number; detalle: string; grave?: boolean }[] = [];
    const sinDoc = vivos.filter((v) => v.sin_documento).length;
    if (sinDoc) l.push({ que: "Sin orden de cargue", n: sinDoc, grave: true,
      detalle: "salió con carga y sin el papel del patio" });
    const sinPlan = mias.filter((f) => f.sin_planear).length;
    if (sinPlan) l.push({ que: sinPlan === 1 ? "Movido sin planear" : "Movidos sin planear", n: sinPlan,
      detalle: "el plan publicado no los pedía" });
    const tarde = vivos.filter((v) => v.atrasado).length;
    if (tarde) l.push({ que: tarde === 1 ? "Digitado después" : "Digitados después", n: tarde,
      detalle: "se registró días después de su fecha" });
    const anulados = (viajes ?? []).filter((v) => v.estado === "anulado").length;
    if (anulados) l.push({ que: anulados === 1 ? "Anulado" : "Anulados", n: anulados,
      detalle: "no suma en ninguna cifra" });
    if (faltan > 0) l.push({ que: "Sin salir", n: faltan, grave: true,
      detalle: "del plan, no se movieron" });
    return l;
  }, [vivos, viajes, mias, faltan]);

  const titulo = turno ? `Cierre del turno ${turno}` : desde === hasta ? "Cierre del día" : "Cierre del período";
  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
  const clase = (v: number | null) => (v == null ? "" : v >= 100 ? "bien" : v > 0 ? "medio" : "mal");
  const quien = (v: Viaje) => (v.registrado_por && nombres[v.registrado_por] ? corto(nombres[v.registrado_por]) : "—");
  const nVacios = vacios == null ? null : vacios;

  const pie = `Los vacíos y los anulados no entran en la adherencia. La foto es de las `
    + `${hhmm(armado.toISOString())}; si alguien registra algo después, el cierre cambia.`;

  /* Las dos tablas se dibujan igual arriba y dentro del acordeón: una
     sola función, para que no se arreglen por separado. */
  const filaTipo = (t: (typeof tipos)[number]) => {
    const p = t.planeado > 0 ? Math.round((t.adheridos / t.planeado) * 100) : null;
    return (
      <tr key={t.nombre}>
        <td><b>{t.nombre}</b></td>
        <td className="ci-num">{t.planeado || "—"}</td>
        <td className="ci-num">{t.adheridos || "—"}</td>
        <td className="ci-num">{t.adicionales || "—"}</td>
        <td className="ci-num">{t.faltan || "—"}</td>
        <td className="ci-num">
          <div className="ci-pctb">
            <i><span className={clase(p)} style={{ width: `${Math.min(p ?? 0, 100)}%` }} /></i>
            <b className={clase(p)}>{pct(p)}</b>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="tp-velo" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      <section className="tp-ci" role="dialog" aria-modal="true" aria-label={titulo}>

        {/* ─ LA BANDA NEGRA CON EL SELLO ─ */}
        <header className="tp-ci-cab">
          {/* El sello va tal cual, nunca recoloreado con el tema. */}
          <img src="/marca/logo-b.png" alt="" width={34} height={34} />
          <div className="ci-tit">
            <div className="ci-ojo">
              {turno ? `TURNO ${turno} · ${HORARIO[turno] ?? ""}` : "DÍA COMPLETO · LOS TRES TURNOS"}
            </div>
            <h2>{titulo}</h2>
            {/* LA HORA NO ES ADORNO: mientras alguien lee esto, otro puede
                estar registrando un viaje de este mismo turno. */}
            <div className="ci-f">
              {rotulo.replace(/^./, (c) => c.toUpperCase())} · foto de las {hhmm(armado.toISOString())}
            </div>
          </div>
          <div className="ci-der">
            <button type="button" className="tp-ci-bt" onClick={() => window.print()}>
              <svg viewBox="0 0 24 24"><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="7" rx="1.5" /><path d="M7 16h10v4H7z" /></svg>
              <span className="texto">Imprimir</span>
            </button>
            <button type="button" className="tp-ci-bt ico" onClick={cerrar} aria-label="Cerrar">
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </header>

        {/* ─ LA FRANJA DEL ACENTO: el porcentaje, la cinta y las cuatro ─ */}
        <div className="tp-ci-hero">
          <div className="ci-pct">
            <div className="ci-k">ADHERENCIA</div>
            <div className="ci-v">{pct(adherencia)}</div>
            <div className="ci-s">{nf.format(adheridos)} de {nf.format(planeado)} del plan</div>
          </div>
          <div className="ci-lado">
            <div className="ci-cinta" role="img"
                 aria-label={`${adheridos} del plan, ${adicionales} adicionales, ${faltan} sin salir`}>
              <i className="ci-ok" style={{ width: `${pOk}%` }} />
              <i className="ci-extra" style={{ width: `${pExtra}%` }} />
              <i className="ci-falta" style={{ width: `${pFalta}%` }} />
            </div>
            <div className="ci-ley">
              <span><i className="ci-ok" />{nf.format(adheridos)} cumplidos</span>
              <span><i className="ci-extra" />{nf.format(adicionales)} adicionales</span>
              <span><i className="ci-falta" />{nf.format(faltan)} sin salir</span>
            </div>
            <div className="ci-mini">
              <div><div className="ci-k">PLANEADOS</div><div className="ci-v">{nf.format(planeado)}</div></div>
              <div><div className="ci-k">CUMPLIMIENTO</div>
                <div className={"ci-v " + clase(cumplimiento)}>{pct(cumplimiento)}</div></div>
              <div><div className="ci-k">CARGA MOVIDA</div><div className="ci-v">{nf.format(carga)}</div></div>
              <div><div className="ci-k">SIN SALIR</div>
                <div className={"ci-v " + (faltan ? "mal" : "bien")}>{nf.format(faltan)}</div></div>
            </div>
          </div>
        </div>

        {/* ─ LOS AVISOS. Solo si hay algo que mirar ─ */}
        {ojos.length > 0 && (
          <div className="tp-ci-rev">
            <h3>Para mirar antes de darlo por bueno</h3>
            <div className="ci-g">
              {ojos.map((o) => (
                <div className={"ci-av" + (o.grave ? " mal" : "")} key={o.que}>
                  <div className="ci-n">{nf.format(o.n)}</div>
                  <b>{o.que}</b>
                  <span>{o.detalle}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─ EL DETALLE, A LO ANCHO ─ */}
        <div className="tp-ci-ancho">
          <div className="tp-ci-sec"><b>Por tipo de viaje</b><span>cumplido sobre planeado</span></div>
          {tipos.length === 0 ? (
            <p className="tp-ci-nada">Este turno no tiene plan ni viajes con carga.</p>
          ) : (
            <div className="tp-ci-scroll">
            <table className="tp-ci-t tp-ci-tipos">
              <thead>
                <tr><th>Tipo</th><th className="ci-num">Plan</th><th className="ci-num">Cumplido</th>
                  <th className="ci-num">Adicional</th><th className="ci-num">Faltan</th><th className="ci-num">Adherencia</th></tr>
              </thead>
              <tbody>{tipos.map(filaTipo)}</tbody>
            </table>
            </div>
          )}

          <div className="tp-ci-sec">
            <b>Los viajes</b>
            <span>
              {viajes == null ? "trayéndolos…"
                : `${vivos.length} registrado${vivos.length === 1 ? "" : "s"}`
                  + (nVacios ? ` · ${nVacios} vacío${nVacios === 1 ? "" : "s"} aparte` : "")}
            </span>
          </div>
          {mal ? <p className="tp-ci-mal" role="alert">{mal}</p>
            : viajes == null ? <p className="tp-ci-nada">Trayendo los viajes…</p>
            : viajes.length === 0 ? <p className="tp-ci-nada">No hay viajes registrados en este turno.</p>
            : (
              /* Con nueve columnas, en una tableta la tabla pide más de
                 800 px: se desliza DENTRO de su caja, nunca arrastrando
                 la ficha y dejando la X fuera de la pantalla. */
              <div className="tp-ci-scroll">
              <table className="tp-ci-t tp-ci-viajes">
                <thead>
                  <tr><th>Código</th>{desde !== hasta && <th>Fecha</th>}<th>Hora</th><th>Placa</th>
                    <th>Tipo</th><th>Ruta</th><th>Orden de cargue</th>
                    <th className="ci-num">Carga</th><th>Registró</th></tr>
                </thead>
                <tbody>
                  {viajes.map((v) => (
                    <tr key={v.id} className={v.estado === "anulado" ? "anulado" : undefined}>
                      <td className="ci-cod">
                        {v.codigo ?? "—"}
                        {v.estado === "anulado" && <span className="ci-eti mal">ANULADO</span>}
                        {v.vacio && <span className="ci-eti">VACÍO</span>}
                      </td>
                      {desde !== hasta && <td>{ddmm(v.fecha)}</td>}
                      <td>{v.hora ? hhmm(v.hora) : "—"}</td>
                      <td className="ci-cod">{v.placa ?? "—"}</td>
                      <td>{v.tipo_nombre ?? v.tipo ?? "—"}</td>
                      <td className="ci-ruta">
                        {(v.origen_nombre ?? v.origen ?? "—")} → {(v.destino_nombre ?? v.destino ?? "—")}
                      </td>
                      <td className={v.sin_documento ? "ci-sin" : "ci-cod"}>
                        {v.documento ?? (v.vacio ? "—" : "sin orden")}
                      </td>
                      <td className="ci-num">{v.carga == null ? "—" : nf.format(v.carga)}</td>
                      <td>{quien(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          <div className="tp-ci-fin">{pie}</div>
        </div>

        {/* ─ EL CELULAR: acordeones, tarjetas y la barra de abajo ─ */}
        <div className="tp-ci-movil">
          <details className="tp-ci-acor">
            <summary>Por tipo de viaje<em>{tipos.length} tipo{tipos.length === 1 ? "" : "s"} ›</em></summary>
            {tipos.length === 0
              ? <p className="tp-ci-nada">Sin plan ni viajes con carga.</p>
              : <div className="tp-ci-scroll"><table className="tp-ci-t tp-ci-tipos"><tbody>{tipos.map(filaTipo)}</tbody></table></div>}
          </details>

          <details className="tp-ci-acor">
            <summary>Los viajes<em>{viajes == null ? "…" : `${viajes.length} ›`}</em></summary>
            {mal ? <p className="tp-ci-mal" role="alert">{mal}</p>
              : viajes == null ? <p className="tp-ci-nada">Trayendo los viajes…</p>
              : viajes.length === 0 ? <p className="tp-ci-nada">No hay viajes en este turno.</p>
              : viajes.map((v) => (
                <div className={"vcard" + (v.estado === "anulado" ? " anulado" : "")} key={v.id}>
                  <div>
                    <div className="ci-c">{v.codigo ?? "—"} · {v.placa ?? "—"}</div>
                    <div className="ci-t2">{v.tipo_nombre ?? v.tipo ?? "—"}</div>
                    <div className="ci-r">
                      {(v.origen_nombre ?? v.origen ?? "—")} → {(v.destino_nombre ?? v.destino ?? "—")}
                      {v.hora && <> · {hhmm(v.hora)}</>}
                    </div>
                  </div>
                  <div className="ci-dcha">
                    <div className={"ci-oc" + (v.sin_documento ? " sin" : "")}>
                      {v.documento ?? (v.vacio ? "vacío" : "sin orden")}
                    </div>
                    <div className="ci-r">{v.carga == null ? "—" : nf.format(v.carga)} · {quien(v)}</div>
                  </div>
                </div>
              ))}
          </details>

          <div className="tp-ci-fin">{pie}</div>

          {/* LA BARRA DE ABAJO. «Cerrar» y no «Dar por bueno»: dar algo por
              bueno es un acto que deja rastro —quién y cuándo— y eso
              todavía no existe en la base. Un botón que promete cerrar y
              solo esconde la ficha es peor que no tenerlo. */}
          <div className="tp-ci-fija">
            <button type="button" className="ci-sec2" onClick={() => window.print()}>Imprimir</button>
            <button type="button" onClick={cerrar}>Cerrar</button>
          </div>
        </div>
      </section>
    </div>
  );
}
