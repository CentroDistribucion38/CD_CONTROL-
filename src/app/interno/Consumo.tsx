"use client";

import { useMemo, useRef, useState } from "react";
import type { Medida, Panel } from "@/modulos/consumo/datos";
import { fBytes, nf } from "@/modulos/consumo/formato";
import { salir } from "./actions";
import { COL, Columnas, Cuota, Dona, Linea } from "./graficas";

const ETIQUETA = { ok: "Holgado", atencion: "Atención", alto: "Casi al tope", sin: "Sin tope" } as const;
type Vista = "dash" | "det";
type Serv = "todos" | "Supabase" | "Vercel";

const partir = (t: string) => { const i = t.lastIndexOf(" "); return i < 0 ? [t, ""] : [t.slice(0, i), t.slice(i + 1)]; };
const diaCorto = (iso: string) => String(Number(iso.slice(8, 10)));

export function Consumo({ panel: p }: { panel: Panel }) {
  const [vista, setVista] = useState<Vista>("dash");
  const [serv, setServ] = useState<Serv>("todos");
  const [aviso, setAviso] = useState("");
  const tablero = useRef<HTMLDivElement>(null);
  const s = p.supabase, v = p.vercel;
  const verS = serv !== "Vercel", verV = serv !== "Supabase";

  const hora = new Date(p.generado).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });
  const mes = new Date(p.generado).toLocaleDateString("es-CO", { timeZone: "America/Bogota", month: "long", year: "numeric" });

  const mSup = p.medidas.filter((m) => m.fuente === "Supabase");
  const mVer = p.medidas.filter((m) => m.fuente === "Vercel");
  const bd = mSup.find((m) => m.id === "bd"), alm = mSup.find((m) => m.id === "alm"), usr = mSup.find((m) => m.id === "usr");
  const peor = mSup.reduce<Medida | null>((a, m) => (a && (a.pct ?? 0) >= (m.pct ?? 0) ? a : m), null);

  // ---- historial: una foto por día; las consultas por día salen de restar un día con el anterior
  const h = useMemo(() => {
    const fotos = p.fotos;
    const hoyISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(p.generado));
    const dias: string[] = [];
    for (let i = 29; i >= 0; i--) dias.push(new Date(new Date(hoyISO + "T12:00:00Z").getTime() - i * 864e5).toISOString().slice(0, 10));
    const por = new Map(fotos.map((f) => [f.dia, f]));
    const consultas = dias.map((d, i) => {
      const a = por.get(d), b = por.get(dias[i - 1] ?? "");
      if (!a || !b || a.llamadas == null || b.llamadas == null) return null;
      const x = a.llamadas - b.llamadas; return x >= 0 ? x : null;
    });
    const con = consultas.filter((x): x is number => x != null);
    const prom = con.length ? con.reduce((t, x) => t + x, 0) / con.length : null;
    const dbs = fotos.map((f) => f.db), alms = fotos.map((f) => f.alm);
    const crece = fotos.length >= 2 ? (fotos[fotos.length - 1].db - fotos[0].db) / Math.max(1, (new Date(fotos[fotos.length - 1].dia).getTime() - new Date(fotos[0].dia).getTime()) / 864e5) : null;
    return { dias, consultas, con, prom, dbs, alms, crece, n: fotos.length };
  }, [p.fotos, p.generado]);

  // ---- textos de la franja «Lo que dice hoy»
  const b0 = s.buckets?.[0], t0 = s.tablas?.[0], c0 = s.consultas?.[0];
  const pctAlm = b0 && s.storageBytes ? (b0.bytes / s.storageBytes) * 100 : null;
  const pctTab = t0 && s.dbBytes ? (t0.bytes / s.dbBytes) * 100 : null;

  async function copiar() {
    if (!tablero.current) return;
    setAviso("Armando la imagen…");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const lienzo = await html2canvas(tablero.current, { backgroundColor: "#ececec", scale: 2, useCORS: true });
      const blob: Blob | null = await new Promise((r) => lienzo.toBlob(r, "image/png"));
      if (!blob) throw new Error("sin imagen");
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); setAviso("Imagen copiada. Pégala donde quieras."); }
      catch { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `consumo-${p.generado.slice(0, 10)}.png`; a.click(); setAviso("Este navegador no deja copiar: se descargó la imagen."); }
    } catch { setAviso("No pude armar la imagen. Prueba con Informe PDF."); }
    setTimeout(() => setAviso(""), 5000);
  }

  const [vn, vu] = partir(v.ok && v.costoMes != null ? `US$ ${nf(2).format(v.costoMes)}` : "");
  const proyV = mVer[0]?.proyeccion;

  return (
    <div className="ci-pag">
      <header className="ci-top">
        <div>
          <p className="ci-ojo">Sistema · uso interno</p>
          <h1>Consumo de la plataforma</h1>
          <p className="ci-sub">{mes} · día {p.diaDelMes} de {p.diasDelMes} · actualizado {hora}</p>
        </div>
        <div className="ci-acc">
          <button className="ci-btn" type="button" onClick={copiar}>Copiar imagen</button>
          <button className={`ci-btn osc${vista === "dash" ? " on" : ""}`} type="button" onClick={() => setVista("dash")}>Dashboard</button>
          <button className={`ci-btn osc${vista === "det" ? " on" : ""}`} type="button" onClick={() => setVista("det")}>Detalle</button>
          <button className="ci-btn osc" type="button" onClick={() => window.print()}>Informe PDF</button>
          <a className="ci-btn osc" href="/interno">Actualizar</a>
          <form action={salir}><button className="ci-btn osc" type="submit">Cerrar y salir</button></form>
        </div>
      </header>
      {aviso && <p className="ci-toast" role="status">{aviso}</p>}

      <div className="ci-chips" role="group" aria-label="Filtros">
        <span className="ci-lbl">Mes</span><span className="ci-chip on">{mes}</span>
        <span className="ci-lbl">Servicio</span>
        {(["todos", "Supabase", "Vercel"] as Serv[]).map((x) => <button key={x} type="button" className={`ci-chip${serv === x ? " on" : ""}`} onClick={() => setServ(x)}>{x === "todos" ? "Todos" : x}</button>)}
        <span className="ci-lbl">Planes</span><span className="ci-chip">Supabase {p.planSupabase.toUpperCase()}</span><span className="ci-chip">Vercel {p.planVercel.toUpperCase()}</span>
      </div>

      {/* ============ DASHBOARD ============ */}
      <div ref={tablero} className={`ci-vista ci-dash${vista === "dash" ? "" : " oculta"}`}>
        <div className="ci-kpis">
          {verS && (
            <div className="ci-k hero">
              <p className="ci-t">Uso del plan Supabase {p.planSupabase.toUpperCase()}</p>
              {peor ? <><p className="ci-n">{nf(peor.pct! < 10 ? 1 : 0).format(peor.pct!)}<small>%</small></p>
                <p className="ci-m"><span className={`ci-pill ${peor.nivel}`}>{ETIQUETA[peor.nivel]}</span>{peor.titulo.toLowerCase()}</p></>
                : <p className="ci-m">{s.error ?? "Sin datos de Supabase."}</p>}
              <div className="ci-spk">{h.dbs.length >= 2 ? <Linea datos={h.dbs} color="#FFC300" trazo="#FFC300" w={380} h={50} /> : null}</div>
            </div>
          )}
          {verS && bd && (
            <div className="ci-k"><p className="ci-t">Base de datos</p><p className="ci-n">{partir(bd.usado)[0]}<small>{partir(bd.usado)[1]}</small></p>
              <p className="ci-m">de {bd.limite}{h.crece != null && h.crece > 0 ? ` · crece ~${fBytes(h.crece)} por día` : ""}</p></div>
          )}
          {verS && alm && (
            <div className="ci-k"><p className="ci-t">Almacenamiento</p><p className="ci-n">{partir(alm.usado)[0]}<small>{partir(alm.usado)[1]}</small></p>
              <p className="ci-m">de {alm.limite}{s.storageObjetos ? ` · ${nf().format(s.storageObjetos)} archivos` : ""}</p>
              {b0 && pctAlm != null && <p className="ci-m">{nf(0).format(pctAlm)} % es el balde <b>{b0.bucket}</b></p>}</div>
          )}
          {verV && (
            <div className="ci-k"><p className="ci-t">Vercel · {p.planVercel === "pro" ? "costo del mes" : "uso del mes"}</p>
              {v.ok ? (p.planVercel === "pro"
                ? <><p className="ci-n">{vn}<small>{vu}</small></p><p className="ci-m">de US$ 20 de crédito del plan Pro</p>{proyV && <p className="ci-m">Fin de mes: <b>{proyV}</b></p>}</>
                : <><p className="ci-n">{mVer[0] ? nf(0).format(mVer[0].pct ?? 0) : "—"}<small>%</small></p><p className="ci-m">{mVer[0]?.titulo ?? "Sin consumo registrado"}</p></>)
                : <><p className="ci-n sin">Sin datos</p><p className="ci-m">{v.error}</p></>}
            </div>
          )}
        </div>

        {verS && <div className="ci-insight">
          <div><span>Cómo va el mes</span>{peor ? <>Estás usando <b>{nf(peor.pct! < 10 ? 1 : 0).format(peor.pct!)} %</b> de lo más ajustado de tu plan de Supabase ({peor.titulo.toLowerCase()}). {peor.nivel === "ok" ? "Nada se va a pasar de aquí al fin de mes." : "Conviene mirarlo."}</> : "Sin datos de Supabase."}</div>
          <div><span>Lo que más pesa</span>{pctAlm != null && b0 ? <><b>Las fotos y archivos</b>: el balde «{b0.bucket}» es el {nf(0).format(pctAlm)} % del almacenamiento. </> : null}{c0 ? <>La consulta más lenta en total tiene <b>{nf().format(c0.llamadas)}</b> llamadas y <b>{nf(0).format(c0.segTotal)} s</b>.</> : null}</div>
          <div><span>Para vigilar</span>{t0 && pctTab != null ? <>La tabla <b>{t0.tabla}</b> es la más grande de la base ({fBytes(t0.bytes)}, {nf(0).format(pctTab)} %). Si crece rápido, se limpia o se archiva.</> : "Sin datos."}</div>
        </div>}

        <div className="ci-row r2">
          {verS && (
            <div className="ci-card"><h3><i />Consultas a la base por día · últimos 30 días</h3>
              <div className="ci-leg"><span><i style={{ background: COL.lav }} />Consultas</span>{h.prom != null && <span style={{ color: COL.rojo }}><i style={{ background: COL.rojo, height: 2 }} />Promedio</span>}</div>
              {h.con.length >= 1 ? <Columnas datos={h.consultas} etiquetas={h.dias.map(diaCorto)} hoy={29} prom={h.prom} />
                : <p className="ci-vacio">Esta curva se arma con una foto por día. {p.fotosError ? p.fotosError : `Llevas ${h.n} día${h.n === 1 ? "" : "s"} guardado${h.n === 1 ? "" : "s"}: mañana aparece la primera barra.`}</p>}
            </div>
          )}
          {verS && (
            <div className="ci-card"><h3><i />De qué está hecho el almacenamiento</h3>
              {s.ok && s.buckets?.length ? (() => {
                const tot = s.storageBytes ?? 0, top = s.buckets.slice(0, 3), otros = Math.max(0, tot - top.reduce((t, b) => t + b.bytes, 0));
                const cols = [COL.baja, COL.lav, COL.ext, "#9A9A9A"];
                const partes = [...top.map((b, i) => ({ v: b.bytes, c: cols[i] })), { v: otros, c: cols[3] }];
                const [cn, cu] = partir(fBytes(tot));
                return <><Dona partes={partes} centro={cn} sub={cu} />
                  <ul className="ci-lista">{top.map((b, i) => <li key={b.bucket}><i style={{ background: cols[i] }} />{b.bucket} · {fBytes(b.bytes)}</li>)}{otros > 0 && <li><i style={{ background: cols[3] }} />otros · {fBytes(otros)}</li>}</ul></>;
              })() : <p className="ci-vacio">Sin datos de almacenamiento.</p>}
            </div>
          )}
        </div>

        {verS && (
          <div className="ci-row r3">
            {[bd, alm, usr].map((m, i) => m && (
              <div className="ci-card ci-res" key={m.id}><h3><i style={{ background: [COL.lav, COL.baja, COL.ext][i] }} />{m.titulo}</h3>
                <div className="ci-res-top"><b>{m.usado}</b><span className={`ci-pc ${m.nivel}`}>{nf(m.pct! < 10 ? 1 : 0).format(m.pct!)} %</span></div>
                <Cuota pct={m.pct ?? 0} />
                <p className="ci-lg"><span>0</span><span>{m.limite} del plan</span></p>
                {m.id === "bd" && <Linea datos={h.dbs} color="#FFE08A" trazo="#C89A00" />}
                {m.id === "alm" && <Linea datos={h.alms} color="#E6CF98" trazo={COL.baja} />}
                {m.id === "usr" && s.peticiones && <p className="ci-nota">{nf().format(s.peticiones.total)} peticiones a la API en 30 días: {nf().format(s.peticiones.rest)} de datos, {nf().format(s.peticiones.auth)} de sesiones.</p>}
              </div>
            ))}
          </div>
        )}

        <div className="ci-row r4">
          {verS && c0 && (
            <div className="ci-card"><h3><i />La consulta que más tiempo de base se lleva</h3>
              <div className="ci-tres"><div><b>{nf().format(c0.llamadas)}</b><small>llamadas</small></div><div><b>{nf(0).format(c0.segTotal)} s</b><small>tiempo total</small></div><div><b>{nf(0).format(c0.msMedio)} ms</b><small>cada una</small></div></div>
              <p className="ci-q">{c0.q}</p></div>
          )}
          {verV && (
            <div className="ci-card"><h3><i />Vercel · lo que más pesa</h3>
              {v.ok && v.servicios?.length ? <div className="ci-tres">{v.servicios.slice(0, 3).map((x) => <div key={x.servicio}><b>{nf(x.cantidad > 100 ? 0 : 1).format(x.cantidad)} <em>{x.unidad}</em></b><small>{x.servicio}</small></div>)}</div>
                : <p className="ci-vacio">{v.ok ? "Vercel no registra consumo este mes." : v.error}</p>}
              {v.ok && !!v.proyectos?.length && <p className="ci-nota">Por proyecto: {v.proyectos.slice(0, 3).map((x) => `${x.proyecto} US$ ${nf(2).format(x.efectivo)}`).join(" · ")}</p>}
            </div>
          )}
        </div>
        <p className="ci-pie">Fuentes: API de gestión de Supabase y facturación de Vercel · solo lectura. La curva diaria se arma con una foto por día, guardada en la tabla privada consumo_foto.</p>
      </div>

      {/* ============ DETALLE ============ */}
      <div className={`ci-vista ci-det${vista === "det" ? "" : " oculta"}`}>
        {(!s.ok || !v.ok) && (
          <section className="ci-aviso" role="status">
            {!s.ok && <p><b>Supabase:</b> {s.error}</p>}
            {!v.ok && <p><b>Vercel:</b> {v.error}</p>}
          </section>
        )}
        {p.fotosError && <section className="ci-aviso" role="status"><p>{p.fotosError} {p.fotosError.includes("consumo_foto") ? "Corre en Supabase el archivo 2026-10-consumo-fotos.sql." : ""}</p></section>}
        {p.lecturas.length > 0 && <section className="ci-lect"><h2>Lo que más pesa</h2><ol>{p.lecturas.map((t, i) => <li key={i}>{t}</li>)}</ol></section>}

        {p.medidas.length > 0 && (
          <section><h2>Uso frente a lo que incluye el plan</h2>
            <div className="ci-rej">{p.medidas.filter((m) => (m.fuente === "Supabase" ? verS : verV)).map((m) => (
              <div key={m.id} className={`ci-med ${m.nivel}`}>
                <div className="ci-med-cab"><span className="ci-fuente">{m.fuente}</span><b>{m.titulo}</b><span className="ci-estado">{ETIQUETA[m.nivel]}</span></div>
                <div className="ci-med-cifra"><b>{m.usado}</b>{m.limite && <small> de {m.limite}</small>}{m.pct != null && <em>{nf(m.pct < 10 ? 1 : 0).format(m.pct)} %</em>}</div>
                <Cuota pct={m.pct ?? 0} proy={m.proyeccionPct} />
                {m.proyeccion && <p className="ci-proy">A este ritmo, al cerrar el mes: <b>{m.proyeccion}</b></p>}
              </div>))}</div>
            <p className="ci-nota">La rayita roja es hacia dónde iría el mes si sigue este ritmo. Supabase no entrega por API la «salida de datos» (egress): se ve en su panel, Usage.</p>
          </section>
        )}

        {verS && s.ok && s.peticiones && (
          <section><h2>Peticiones a la API de Supabase (últimos 30 días)</h2>
            <div className="ci-fichas">
              <div><b>{nf().format(s.peticiones.total)}</b><small>en total</small></div><div><b>{nf().format(s.peticiones.rest)}</b><small>datos (REST)</small></div>
              <div><b>{nf().format(s.peticiones.auth)}</b><small>sesiones (Auth)</small></div><div><b>{nf().format(s.peticiones.storage)}</b><small>archivos (Storage)</small></div>
              <div><b>{nf().format(s.peticiones.realtime)}</b><small>tiempo real</small></div>
            </div></section>
        )}

        {verS && (
          <div className="ci-dos">
            {s.ok && !!s.tablas?.length && <section className="ci-tab"><h2>Tablas más pesadas</h2><table><thead><tr><th>Tabla</th><th className="r">Peso</th><th className="r">Filas aprox.</th></tr></thead><tbody>{s.tablas.map((t) => <tr key={t.tabla}><td>{t.tabla}</td><td className="r">{fBytes(t.bytes)}</td><td className="r">{nf().format(t.filas)}</td></tr>)}</tbody></table></section>}
            {s.ok && !!s.buckets?.length && <section className="ci-tab"><h2>Archivos guardados</h2><table><thead><tr><th>Balde</th><th className="r">Archivos</th><th className="r">Peso</th></tr></thead><tbody>{s.buckets.map((b) => <tr key={b.bucket}><td>{b.bucket}</td><td className="r">{nf().format(b.objetos)}</td><td className="r">{fBytes(b.bytes)}</td></tr>)}</tbody></table></section>}
          </div>
        )}

        {verS && s.ok && !!s.consultas?.length && (
          <section className="ci-tab"><h2>Consultas que más tiempo de base consumen</h2>
            <p className="ci-nota">Acumulado desde el último reinicio de las estadísticas de Postgres.</p>
            <div className="ci-scroll"><table><thead><tr><th>Consulta</th><th className="r">Llamadas</th><th className="r">Tiempo total</th><th className="r">Cada una</th></tr></thead>
              <tbody>{s.consultas.map((c, i) => <tr key={i}><td className="ci-q">{c.q}</td><td className="r">{nf().format(c.llamadas)}</td><td className="r">{nf().format(c.segTotal)} s</td><td className="r">{nf().format(c.msMedio)} ms</td></tr>)}</tbody></table></div></section>
        )}

        {verV && v.ok && !!v.servicios?.length && (
          <div className="ci-dos">
            <section className="ci-tab"><h2>Vercel · consumo del mes por servicio</h2><div className="ci-scroll"><table><thead><tr><th>Servicio</th><th className="r">Consumido</th><th className="r">Costo</th></tr></thead><tbody>{v.servicios.slice(0, 14).map((x, i) => <tr key={i}><td>{x.servicio}</td><td className="r">{nf(1).format(x.cantidad)} {x.unidad}</td><td className="r">US$ {nf(2).format(x.efectivo)}</td></tr>)}</tbody></table></div></section>
            {!!v.proyectos?.length && <section className="ci-tab"><h2>Vercel · por proyecto</h2><table><thead><tr><th>Proyecto</th><th className="r">Costo del mes</th></tr></thead><tbody>{v.proyectos.map((x) => <tr key={x.proyecto}><td>{x.proyecto}</td><td className="r">US$ {nf(2).format(x.efectivo)}</td></tr>)}</tbody></table></section>}
          </div>
        )}
        <p className="ci-pie">Proyecto Supabase: {p.ref ?? "—"} · Esta pantalla no guarda copia en el equipo y se cierra sola a los 30 minutos.</p>
      </div>
    </div>
  );
}
