"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOMBRE_INFORME_AI, OJO_AI, archivoInformeAi, construirInformeAi, imagenesAi, type DatosInformeAi } from "@/modulos/sider/informe-ai-doc";
import { useRouter } from "next/navigation";
import type { PorDefecto, PorSocio, PorOrigen, PorEnvase, PorDia } from "@/modulos/sider/informe-ai";
import type { ParetoFila } from "@/modulos/sider/cierre-ai";
import { ParetoLienzo } from "./ParetoLienzo";
import { copiarPng, descargarPng, fijarColores } from "@/modulos/roturas/captura";
import type { Revision } from "@/modulos/sider/ai";
import { NOMBRE_TIPO, type TipoRevision } from "@/modulos/sider/comun";
import { CierreAi } from "./CierreAi";
import { TurnosAi } from "./TurnosAi";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x: number) => nf2.format(x * 100) + " %";
const dia = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });

type Datos = {
  revisiones: Revision[];
  defectos: PorDefecto[];
  socios: PorSocio[];
  semanas: unknown[];
  origenes: PorOrigen[];
  envases: PorEnvase[];
  dias: PorDia[];
  total: {
    revisiones: number; recibidas: number; revisadas: number; defectos: number;
    otros: number; no_abono: number; hl: number; socios: number;
    importadas: number; indice: number;
    defectos_hoja: number; hl_hoja: number; pct_hoja: number;
  };
  porRevision: Map<string, Record<string, { pct: number; hl: number }>>;
};

/**
 * EL INFORME DE LA REVISIÓN AI.
 *
 * «Quitar del informe de AI todo lo de cobro y abono: solo dejar unidades revisadas, unidades en
 *  mal estado y %AI. Más bien dejar la tabla de %AI por origen.»
 *
 * TRES CIFRAS, LA SEMANA Y EL ORIGEN. %AI = unidades en mal estado / unidades revisadas, sumadas
 * (no el promedio de los porcentajes de cada revisión). La tabla de abajo es el detalle de cada
 * revisión, para cuando haya que mirar una fila concreta.
 *
 * TODO VA EN UN SOLO TONO: las barras miden magnitud, y para magnitud el color es uno solo.
 */
export function Informe({
  datos, opciones, filtro,
}: {
  datos: Datos;
  opciones: {
    socios: [string, string][]; envases: [string, string][]; canales: [string, string][];
    primera: string | null; ultima: string | null;
  };
  filtro: { desde?: string; hasta?: string; socio?: string; envase?: string; canal?: string; tipo?: string };
  esEditor: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [cierre, setCierre] = useState<{ dia: string; turnos: string[] } | null>(null);
  const tipoCierre = (filtro.tipo === "ai" || filtro.tipo === "sorting" ? filtro.tipo : "") as "ai" | "sorting" | "";
  const [orden, setOrden] = useState<"fecha" | "indice">("fecha");

  function filtrar(k: string, v: string) {
    const p = new URLSearchParams();
    for (const [kk, vv] of Object.entries({ ...filtro, [k]: v })) if (vv) p.set(kk, vv as string);
    router.push(`/sider/seguimiento/ai?${p.toString()}`);
  }

  const { total, origenes, revisiones } = datos;
  /* EL PARETO: de más a menos unidades en mal estado; cada uno con su parte del total en mal estado y el acumulado. */
  const pareto = (xs: { clave: string; nombre: string; unidades: number }[]): ParetoFila[] => {
    const malas = xs.reduce((a, x) => a + x.unidades, 0);
    let acum = 0;
    return [...xs].filter((x) => x.unidades > 0).sort((a, b) => b.unidades - a.unidades).map((x) => {
      acum += x.unidades;
      return { clave: x.clave, nombre: x.nombre, unidades: x.unidades, pct: total.revisadas > 0 ? x.unidades / total.revisadas : 0,
               pctDefectos: malas > 0 ? x.unidades / malas : 0, acumulado: malas > 0 ? acum / malas : 0 };
    });
  };
  /* Por causal: solo los estados que cuentan como «mal estado» (los que entran en el %AI). */
  const causales = pareto(datos.defectos.filter((d) => d.cobra).map((d) => ({ clave: d.clave, nombre: d.nombre, unidades: d.unidades })));
  const otrosCausal = datos.defectos.filter((d) => !d.cobra && d.unidades > 0);
  /* Los DRY son los socios (distribuidores); lo de T1 no tiene socio y no entra. */
  const conSocio = datos.socios.filter((x) => x.clave !== "—");
  const paretoSocios = pareto(conSocio.map((x) => ({ clave: x.clave, nombre: x.nombre, unidades: x.defectos })));
  const top5 = paretoSocios.slice(0, 5);
  const malasSocios = conSocio.reduce((a, x) => a + x.defectos, 0);
  const socioDe = new Map(conSocio.map((x) => [x.clave, x]));
  const paretoEnv = pareto(datos.envases.map((x) => ({ clave: x.envase, nombre: x.envase, unidades: x.malas })));
  const envDe = new Map(datos.envases.map((x) => [x.envase, x]));

  /* ---------- EL INFORME (Word · PDF) Y LA IMAGEN PARA COMPARTIR ---------- */
  const captura = useRef<HTMLDivElement>(null);
  const [haciendo, setHaciendo] = useState<"pdf" | "word" | "imagen" | null>(null);
  const [avisoInf, setAvisoInf] = useState<{ t: string; mal?: boolean } | null>(null);
  const nombreDe = (lista: [string, string][], v?: string) => (v ? lista.find((x) => x[0] === v)?.[1] ?? v : null);
  const textoFiltros = [
    filtro.tipo === "ai" ? "revisión certificada" : filtro.tipo === "sorting" ? "revisión normal" : "las dos revisiones",
    nombreDe(opciones.socios, filtro.socio) ? `socio ${nombreDe(opciones.socios, filtro.socio)}` : null,
    nombreDe(opciones.envases, filtro.envase) ? `envase ${nombreDe(opciones.envases, filtro.envase)}` : null,
    nombreDe(opciones.canales, filtro.canal) ? `canal ${nombreDe(opciones.canales, filtro.canal)}` : null,
  ].filter(Boolean).join(" · ");
  const desdeI = filtro.desde ?? datos.dias[0]?.dia ?? "", hastaI = filtro.hasta ?? datos.dias[datos.dias.length - 1]?.dia ?? "";
  const periodoTx = desdeI === hastaI ? dia(desdeI) : `${dia(desdeI)} al ${dia(hastaI)}`;

  async function informe(formato: "pdf" | "word") {
    setHaciendo(formato); setAvisoInf(null);
    try {
      let quien = "—";
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (user) { const { data: p } = await sb.from("perfiles").select("nombre, usuario").eq("id", user.id).maybeSingle(); quien = p?.nombre || p?.usuario || "—" }
      } catch { /* sin nombre */ }
      const ahora = new Date();
      const generado = ahora.toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" });
      const hoyLargo = ahora.toLocaleDateString("es-CO", { dateStyle: "long", timeZone: "America/Bogota" });
      const d: DatosInformeAi = {
        desde: desdeI, hasta: hastaI, filtros: textoFiltros, total,
        origenes, causales, otrosCausal: otrosCausal.map((x) => ({ nombre: x.nombre, unidades: x.unidades })),
        top5: top5.map((x) => ({ ...x, socio: socioDe.get(x.clave) })), malasSocios,
        envases: paretoEnv.map((x) => ({ ...x, env: envDe.get(x.clave) })), dias: datos.dias,
      };
      const titulo = NOMBRE_INFORME_AI;
      const bloques = construirInformeAi(d, { titulo, generado, quien }, imagenesAi(d));
      const comoDataUrl = async (url: string) => {
        try {
          const r = await fetch(url); if (!r.ok) return null;
          const b = await r.blob();
          return await new Promise<string | null>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(null); f.readAsDataURL(b) });
        } catch { return null }
      };
      const [logo, sello] = await Promise.all([comoDataUrl("/marca/logo-bavaria.png"), comoDataUrl("/marca/logo-b.png")]);
      const pie = `Período: ${periodoTx} · Informe %AI de la revisión de envase`;
      if (formato === "pdf") {
        const [{ jsPDF }, { dibujarCierre }] = await Promise.all([import("jspdf"), import("@/modulos/inventario/cierre-pdf")]);
        const doc = dibujarCierre(jsPDF, bloques, { pie, fechaPortada: hoyLargo, fechaHojas: periodoTx, ojoPortada: OJO_AI, ojo: OJO_AI, logo: logo ?? undefined, sello: sello ?? undefined });
        doc.save(archivoInformeAi(titulo, desdeI, hastaI, "pdf"));
      } else {
        const { armarWordCierre, aclararImagen } = await import("@/modulos/inventario/cierre-word");
        const agua = sello ? await aclararImagen(sello, 0.07) : null;
        const bytes = armarWordCierre(bloques, { pie, fechaHojas: periodoTx, ojo: OJO_AI, titulo: `${titulo} · ${periodoTx}`, logo: logo ?? undefined, sello: agua ?? undefined });
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
        const a = document.createElement("a"); a.href = url; a.download = archivoInformeAi(titulo, desdeI, hastaI, "docx");
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      setAvisoInf({ t: formato === "pdf" ? "PDF listo: quedó en tus descargas." : "Word listo: quedó en tus descargas." });
    } catch {
      setAvisoInf({ t: "No se pudo armar el informe. Recarga la página e intenta otra vez.", mal: true });
    } finally { setHaciendo(null) }
  }

  /* TODO EL INFORME COMO UNA IMAGEN, al portapapeles para pegarla en WhatsApp o en un correo (si el navegador no deja, se descarga). */
  async function copiarImagen() {
    if (!captura.current) return;
    setHaciendo("imagen"); setAvisoInf(null);
    const nodo = captura.current;
    /* La imagen se arma como promesa y se le pasa así al portapapeles: Safari (iPhone) solo deja
       copiar si la orden sale en el mismo toque, y armarla tarda. */
    const imagen = (async () => {
      const html2canvas = (await import("html2canvas")).default;
      const cv = await html2canvas(nodo, {
        backgroundColor: "#eef1f5", scale: 2, useCORS: true, logging: false,
        onclone: (docu) => {
          docu.querySelectorAll<HTMLElement>(".ia-cap-cab").forEach((e) => { e.style.display = "block" });
          /* Lo que html2canvas no dibuja bien: las cifras grandes con interlineado 1 se montan sobre
             el pie, y la marca de las filas vitales hecha con sombra sale como una raya suelta. */
          docu.querySelectorAll<HTMLElement>(".ia-hero .num").forEach((e) => { e.style.paddingBottom = "12px" });
          docu.querySelectorAll<HTMLElement>(".ia-vital td:first-child").forEach((e) => { e.style.boxShadow = "none"; e.style.borderLeft = "3px solid #04203f" });
          fijarColores(docu);
        },
      });
      /* El aire alrededor se pone en otro lienzo: si se le pone al recuadro, las gráficas no se encogen y se salen. */
      const m = 48, marco = document.createElement("canvas");
      marco.width = cv.width + m * 2; marco.height = cv.height + m * 2;
      const g = marco.getContext("2d");
      if (g) { g.fillStyle = "#eef1f5"; g.fillRect(0, 0, marco.width, marco.height); g.drawImage(cv, m, m) }
      return await new Promise<Blob>((ok, mal) => (g ? marco : cv).toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
    })();
    const nombre = `Informe AI ${desdeI === hastaI ? desdeI : `${desdeI} a ${hastaI}`}.png`;
    try {
      let copiada = false;
      try { copiada = await copiarPng(imagen) } catch { copiada = false }
      if (copiada) setAvisoInf({ t: "Imagen copiada: pégala donde quieras con Ctrl + V." });
      else { descargarPng(await imagen, nombre); setAvisoInf({ t: "Tu navegador no deja copiar imágenes: la descargué para que la compartas." }) }
    } catch {
      setAvisoInf({ t: "No se pudo armar la imagen. Intenta otra vez.", mal: true });
    } finally { setHaciendo(null) }
  }

  /* El tope de las barras nunca puede ser cero: `width: NaN%` se descarta y la barra se llena. */
  const topeOri = Math.max(0.0001, ...origenes.map((o) => o.indice));

  const tabla = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const xs = q === "" ? revisiones : revisiones.filter((r) =>
      `${r.placa} ${r.planta ?? ""} ${r.socio_nombre ?? ""} ${r.envase} ${r.zcl3 ?? ""} ${r.comentarios ?? ""}`
        .toLowerCase().includes(q));
    return [...xs].sort((a, b) =>
      orden === "fecha" ? b.fecha.localeCompare(a.fecha) : b.indice - a.indice);
  }, [revisiones, busca, orden]);

  return (
    <>
      {/* ---------- LOS FILTROS, EN UNA FILA ARRIBA ---------- */}
      <section className="ia-filtros">
        <label><span>Desde</span>
          <input type="date" value={filtro.desde ?? ""} min={opciones.primera ?? undefined}
                 max={opciones.ultima ?? undefined}
                 onChange={(e) => filtrar("desde", e.target.value)} /></label>
        <label><span>Hasta</span>
          <input type="date" value={filtro.hasta ?? ""} min={opciones.primera ?? undefined}
                 max={opciones.ultima ?? undefined}
                 onChange={(e) => filtrar("hasta", e.target.value)} /></label>
        <label><span>Revisión</span>
          <select value={filtro.tipo ?? ""} onChange={(e) => filtrar("tipo", e.target.value)}>
            <option value="">Todas</option>
            <option value="ai">Certificada</option>
            <option value="sorting">Normal</option>
          </select></label>
        <label><span>Socio</span>
          <select value={filtro.socio ?? ""} onChange={(e) => filtrar("socio", e.target.value)}>
            <option value="">Todos</option>
            {opciones.socios.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select></label>
        <label><span>Envase</span>
          <select value={filtro.envase ?? ""} onChange={(e) => filtrar("envase", e.target.value)}>
            <option value="">Todos</option>
            {opciones.envases.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select></label>
        <label><span>Canal</span>
          <select value={filtro.canal ?? ""} onChange={(e) => filtrar("canal", e.target.value)}>
            <option value="">Todos</option>
            {opciones.canales.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select></label>
      </section>

      {/* ---------- EL CIERRE POR TURNO Y POR DÍA, como el de Traspasos ---------- */}
      <TurnosAi ultima={opciones.ultima} tipo={tipoCierre} abrir={(dia, turnos) => setCierre({ dia, turnos })} />
      {cierre && <CierreAi ultima={opciones.ultima} tipoInicial={tipoCierre} diaInicial={cierre.dia} turnosInicial={cierre.turnos} cerrar={() => setCierre(null)} />}

      {total.revisiones === 0 ? (
        <section className="ia-vacio">
          <h2>No hay revisiones en ese rango</h2>
          <p>Suelta algún filtro o amplía las fechas.</p>
        </section>
      ) : (
        <>
          {/* ---------- EL INFORME: copiar como imagen, Word y PDF ---------- */}
          <div className="ia-acciones">
            <span>Informe del período · <b>{periodoTx}</b></span>
            {avisoInf && <em className={avisoInf.mal ? "mal" : ""} role="status">{avisoInf.t}</em>}
            <button type="button" className="ia-bt ico" onClick={() => void copiarImagen()} disabled={!!haciendo}
                    title="Copiar todo el informe como imagen para pegarlo y compartirlo" aria-label="Copiar imagen del informe">
              <svg viewBox="0 0 24 24" aria-hidden><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
              {haciendo === "imagen" ? "Copiando…" : "Copiar imagen"}
            </button>
            <button type="button" className="ia-bt" onClick={() => void informe("word")} disabled={!!haciendo}>{haciendo === "word" ? "Armando…" : "Word"}</button>
            <button type="button" className="ia-bt am" onClick={() => void informe("pdf")} disabled={!!haciendo}>{haciendo === "pdf" ? "Armando…" : "PDF"}</button>
          </div>

          <div className="ia-captura" ref={captura}>
          <div className="ia-cap-cab">
            <p>SIDER · INFORME %AI DE LA REVISIÓN DE ENVASE</p>
            <h2>%AI de la revisión de envase · {periodoTx}</h2>
            <small>{textoFiltros}</small>
          </div>
          {/* ---------- LAS TRES CIFRAS ----------
              %AI = suma de unidades en mal estado / suma de unidades revisadas. Promediar
              porcentajes le daría el mismo peso a una muestra de 200 que a una de 4.104. */}
          <section className="ia-cifras">
            <div className="ia-hero">
              <p className="rot">%AI DEL PERÍODO</p>
              <p className="num">{pct(total.indice)}</p>
              <p className="pie">
                {nf.format(total.defectos)} en mal estado de {nf.format(total.revisadas)} revisadas
                {" "}· {total.revisiones} revisiones
              </p>
            </div>
            <div className="ia-dato">
              <p className="rot">UNIDADES REVISADAS</p>
              <p className="num">{nf.format(total.revisadas)}</p>
              <p className="pie">en {total.revisiones} revisiones</p>
            </div>
            <div className="ia-dato">
              <p className="rot">UNIDADES EN MAL ESTADO</p>
              <p className="num">{nf.format(total.defectos)}</p>
              <p className="pie">de las revisadas</p>
            </div>
          </section>

          {/* ---------- %AI POR ORIGEN ---------- */}
          <section className="ia-caja">
            <div className="ia-caja-cab">
              <h2>%AI por origen (CD)</h2>
              <p>
                El CD de donde viene el camión, del %AI más alto al más bajo. Cada %AI es la suma
                de unidades en mal estado sobre la suma de revisadas de ese origen; «% del mal estado» es cuánto
                aporta ese origen a todo lo que salió en mal estado.
              </p>
            </div>
            <div className="ia-tabla">
              <table className="ia-origen">
                <thead>
                  <tr>
                    <th>Origen</th>
                    <th className="n">Revisiones</th>
                    <th className="n">Unid. revisadas</th>
                    <th className="n">Unid. en mal estado</th>
                    <th className="n">%AI</th>
                    <th className="n">% del mal estado</th>
                    <th className="ia-col-barra"><span className="sr">Barra del %AI</span></th>
                  </tr>
                </thead>
                <tbody>
                  {origenes.map((o) => (
                    <tr key={o.origen}>
                      <td><b>{o.origen}</b></td>
                      <td className="n">{nf.format(o.revisiones)}</td>
                      <td className="n">{nf.format(o.revisadas)}</td>
                      <td className="n">{nf.format(o.malas)}</td>
                      <td className="n destaca">{pct(o.indice)}</td>
                      <td className="n">{pct(total.defectos > 0 ? o.malas / total.defectos : 0)}</td>
                      <td className="ia-col-barra">
                        <span className="pista"><i style={{ width: `${(o.indice / topeOri) * 100}%` }} /></span>
                      </td>
                    </tr>
                  ))}
                  <tr className="ia-total">
                    <td>Total</td>
                    <td className="n">{nf.format(total.revisiones)}</td>
                    <td className="n">{nf.format(total.revisadas)}</td>
                    <td className="n">{nf.format(total.defectos)}</td>
                    <td className="n destaca">{pct(total.indice)}</td>
                    <td className="n">100,00 %</td>
                    <td className="ia-col-barra" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- PARETO POR CAUSAL (estado del envase) ---------- */}
          <section className="ia-caja">
            <div className="ia-caja-cab">
              <h2>Pareto por causal</h2>
              <p>
                Los estados que salen en mal estado, de más a menos unidades. «% del mal estado» es su parte de las
                {" "}{nf.format(total.defectos)} unidades en mal estado; «%AI» es cuánto pesa sobre las revisadas. Las barras oscuras son
                las que juntas llegan al 80 %.
              </p>
            </div>
            <div className="ia-pareto"><ParetoLienzo pareto={causales} /></div>
            <TablaPareto filas={causales} titulo="Causal" />
            {otrosCausal.length > 0 && (
              <p className="ia-mas">Contados pero fuera del %AI: {otrosCausal.map((d) => `${d.nombre} ${nf.format(d.unidades)}`).join(" · ")}.</p>
            )}
          </section>

          {/* ---------- TOP 5 DRY (socios) ---------- */}
          <section className="ia-caja">
            <div className="ia-caja-cab">
              <h2>Top 5 DRY por unidades en mal estado</h2>
              <p>
                Los socios (DRY) que más envase en mal estado mandan. Juntos son el{" "}
                <b>{pct(top5.length ? top5[top5.length - 1].acumulado : 0)}</b> de las {nf.format(malasSocios)} unidades en mal estado
                del canal Socios.
              </p>
            </div>
            <div className="ia-tabla">
              <table className="ia-origen">
                <thead>
                  <tr>
                    <th className="n">#</th><th>DRY (socio)</th>
                    <th className="n">Revisiones</th><th className="n">Unid. revisadas</th><th className="n">Unid. en mal estado</th>
                    <th className="n">% del mal estado</th><th className="n">% acumulado</th><th className="n">%AI</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((f, i) => {
                    const x = socioDe.get(f.clave);
                    return (
                      <tr key={f.clave}>
                        <td className="n">{i + 1}</td>
                        <td><b>{f.nombre}</b></td>
                        <td className="n">{nf.format(x?.revisiones ?? 0)}</td>
                        <td className="n">{nf.format(x?.revisadas ?? 0)}</td>
                        <td className="n">{nf.format(f.unidades)}</td>
                        <td className="n destaca">{pct(f.pctDefectos)}</td>
                        <td className="n">{pct(f.acumulado)}</td>
                        <td className="n">{pct(x && x.revisadas > 0 ? x.defectos / x.revisadas : 0)}</td>
                      </tr>
                    );
                  })}
                  {top5.length === 0 && <tr><td colSpan={8} className="nada">No hay revisiones del canal Socios en el rango.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- %AI POR REFERENCIA (SKU del envase) ---------- */}
          <section className="ia-caja">
            <div className="ia-caja-cab">
              <h2>%AI por referencia (SKU)</h2>
              <p>
                El pareto por envase: de más a menos unidades en mal estado, con su parte del total, el acumulado y su %AI
                (mal estado sobre revisadas de esa referencia).
              </p>
            </div>
            <div className="ia-pareto"><ParetoLienzo pareto={paretoEnv} /></div>
            <div className="ia-tabla">
              <table className="ia-origen">
                <thead>
                  <tr>
                    <th>Referencia</th><th className="n">Revisiones</th><th className="n">Unid. revisadas</th><th className="n">Unid. en mal estado</th>
                    <th className="n">% del mal estado</th><th className="n">% acumulado</th><th className="n">%AI</th>
                  </tr>
                </thead>
                <tbody>
                  {paretoEnv.map((f) => {
                    const x = envDe.get(f.clave);
                    return (
                      <tr key={f.clave} className={f.acumulado - f.pctDefectos < 0.8 ? "ia-vital" : undefined}>
                        <td><b>{f.clave}</b>{x?.nombre && x.nombre !== f.clave ? <small className="ia-sub"> {x.nombre}</small> : null}</td>
                        <td className="n">{nf.format(x?.revisiones ?? 0)}</td>
                        <td className="n">{nf.format(x?.revisadas ?? 0)}</td>
                        <td className="n">{nf.format(f.unidades)}</td>
                        <td className="n">{pct(f.pctDefectos)}</td>
                        <td className="n">{pct(f.acumulado)}</td>
                        <td className="n destaca">{pct(x?.indice ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- LA TENDENCIA, POR DÍA ---------- */}
          <TendenciaDia dias={datos.dias} promedio={total.indice} />
          </div>

          {/* ---------- REVISIÓN POR REVISIÓN ---------- */}
          <section className="ia-caja">
            <div className="ia-caja-cab con-busca">
              <div>
                <h2>Revisión por revisión</h2>
                <p>El detalle de cada revisión, para mirar una fila concreta.</p>
              </div>
              <div className="ia-herramientas">
                <label className="ia-busca">
                  <span className="sr">Buscar</span>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)}
                         placeholder="Placa, origen, socio…" />
                </label>
                <label className="ia-ordenar">
                  <span className="sr">Ordenar por</span>
                  <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)}>
                    <option value="fecha">Más reciente</option>
                    <option value="indice">%AI más alto</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="ia-tabla">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Placa</th><th>Revisión</th><th>Origen</th><th>Socio</th><th>Envase</th>
                    <th className="n">Unid. revisadas</th>
                    <th className="n">Unid. en mal estado</th>
                    <th className="n">%AI</th>
                  </tr>
                </thead>
                <tbody>
                  {tabla.slice(0, 200).map((r) => (
                    <tr key={r.id}>
                      <td>{dia(r.fecha)}</td>
                      <td><b>{r.placa}</b></td>
                      {/* LA CLASE VA CON LA PALABRA ESCRITA, no solo con color. */}
                      <td>
                        <span className={"ia-sello " + (((r.tipo ?? "ai") as TipoRevision) === "ai" ? "propio" : "normal")}>
                          {NOMBRE_TIPO[(r.tipo ?? "ai") as TipoRevision]}
                        </span>
                      </td>
                      <td>{(r.planta ?? "").trim() || "—"}</td>
                      <td>{r.socio_nombre ?? "—"}</td>
                      <td>{r.envase}</td>
                      <td className="n">{nf.format(r.revisadas)}</td>
                      <td className="n">{nf.format(r.defectos)}</td>
                      <td className="n destaca">{pct(r.indice)}</td>
                    </tr>
                  ))}
                  {tabla.length === 0 && (
                    <tr><td colSpan={9} className="nada">Nada coincide con «{busca.trim()}».</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="ia-mas">
              {tabla.length > 200
                ? <>Se muestran las 200 primeras de {tabla.length} — afina la búsqueda o el rango.</>
                : <>{tabla.length} revisión{tabla.length === 1 ? "" : "es"}.</>}
              {!filtro.tipo && (() => {
                const n = revisiones.filter((r) => (r.tipo ?? "ai") === "sorting").length;
                return n > 0
                  ? <> {revisiones.length - n} certificada{revisiones.length - n === 1 ? "" : "s"} y {n} normal{n === 1 ? "" : "es"}.</>
                  : null;
              })()}
            </p>
          </section>
        </>
      )}
    </>
  );
}

/** La tabla debajo de la gráfica del pareto: unidades, su parte del mal estado, el acumulado y el %AI sobre las revisadas. */
function TablaPareto({ filas, titulo }: { filas: ParetoFila[]; titulo: string }) {
  if (filas.length === 0) return <p className="ia-mas">No se encontraron unidades en mal estado.</p>;
  return (
    <div className="ia-tabla">
      <table className="ia-origen">
        <thead>
          <tr><th>{titulo}</th><th className="n">Unidades</th><th className="n">% del mal estado</th><th className="n">% acumulado</th><th className="n">%AI</th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className={f.acumulado - f.pctDefectos < 0.8 ? "ia-vital" : undefined}>
              <td><b>{f.nombre}</b></td>
              <td className="n">{nf.format(f.unidades)}</td>
              <td className="n destaca">{pct(f.pctDefectos)}</td>
              <td className="n">{pct(f.acumulado)}</td>
              <td className="n">{pct(f.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * LA TENDENCIA, POR DÍA. «Necesito gráfica de tendencia por día del AI.» Cada punto es un día: mal estado sobre revisadas
 * de ese día. La raya punteada es el %AI del período, para ver qué días quedan por encima. La escala arranca en cero.
 * Un día con pocas unidades revisadas sube y baja por azar: al pasar el mouse se ve cuántas revisiones lo sostienen.
 */
function TendenciaDia({ dias, promedio }: { dias: PorDia[]; promedio: number }) {
  const ANCHO = 1000, ALTO = 190, ABAJO = 26, ARRIBA = 16;
  if (dias.length < 2) {
    return (
      <section className="ia-caja">
        <div className="ia-caja-cab">
          <h2>Tendencia del %AI por día</h2>
          <p>Con un solo día no hay tendencia que dibujar. Amplía el rango de fechas.</p>
        </div>
      </section>
    );
  }
  const vals = dias.map((d) => d.indice);
  const max = Math.max(...vals, promedio);
  const techo = max > 0 ? max * 1.15 : 1;
  const x = (i: number) => (i / (dias.length - 1)) * ANCHO;
  const y = (v: number) => ARRIBA + (1 - v / techo) * (ALTO - ARRIBA - ABAJO);
  const linea = dias.map((d, i) => `${x(i).toFixed(1)},${y(d.indice).toFixed(1)}`).join(" ");
  const area = `M0,${ALTO - ABAJO} L${linea.replace(/ /g, " L")} L${ANCHO},${ALTO - ABAJO} Z`;
  const iPico = vals.indexOf(Math.max(...vals));
  const paso = Math.max(1, Math.ceil(dias.length / 10));
  const rotular = new Set([0, dias.length - 1, iPico, ...dias.map((_, i) => i).filter((i) => i % paso === 0)]);
  const sobre = dias.filter((d) => d.indice > promedio).length;
  return (
    <section className="ia-caja">
      <div className="ia-caja-cab">
        <h2>Tendencia del %AI por día</h2>
        <p>
          Cada punto es un día: unidades en mal estado sobre revisadas de ese día. La raya punteada es el %AI del período
          ({pct(promedio)}): {sobre} de {dias.length} días quedan por encima. Pasa el mouse por un punto para ver sus revisiones.
        </p>
      </div>
      <div className="ia-linea ia-linea-dia">
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" role="img"
             aria-label={`%AI por día, del ${dias[0].dia} al ${dias[dias.length - 1].dia}`}>
          <path className="area" d={area} />
          <line className="prom" x1={0} x2={ANCHO} y1={y(promedio)} y2={y(promedio)} />
          <polyline className="traza" points={linea} />
          {dias.map((d, i) => (
            <circle key={d.dia} className={i === iPico ? "punto pico" : d.indice > promedio ? "punto sobre" : "punto"}
                    cx={x(i)} cy={y(d.indice)} r={i === iPico ? 6 : 4}>
              <title>{`${dia(d.dia)} · ${pct(d.indice)} · ${nf.format(d.malas)} en mal estado de ${nf.format(d.revisadas)} · ${d.revisiones} revisiones`}</title>
            </circle>
          ))}
        </svg>
        <div className="ia-rotulos">
          {dias.map((d, i) => (
            <span key={d.dia} className={rotular.has(i) ? "on" : ""} style={{ left: `${(i / (dias.length - 1)) * 100}%` }}>
              {rotular.has(i) && <><b>{pct(d.indice)}</b><em>{dia(d.dia)}</em></>}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
