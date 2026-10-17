"use client";

import { Fragment, useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CuadreFabrica, LineaConsolidado, Reasignacion } from "@/modulos/inventario/balance";
import { Consolidado } from "./Consolidado";
import { Reasignaciones } from "./Reasignaciones";
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
  cuadre_fabrica?: CuadreFabrica | null;
};

/* ------------------------------------------------------------------ */
/*  CONSTANTES                                                         */
/* ------------------------------------------------------------------ */
/** Las 5 hojas fijas + la de "Otros estados" (dinámica). */
/* El almacén de SAP de cada hoja (como en Pasivos): Fábrica = AG18, Bodega 38 = AG22; Extrasucio solo existe en AG22 (Bodega 38). */
const HOJAS_FIJAS: { estado: string; alcance: string | null; label: string; alm?: string }[] = [
  { estado: "BAJA",        alcance: "SORTING",    label: "Baja · Fábrica",     alm: "AG18" },
  { estado: "BAJA",        alcance: "PRESORTING",  label: "Baja · Bodega 38",   alm: "AG22" },
  { estado: "LAVADO",      alcance: "SORTING",    label: "Lavado · Fábrica",   alm: "AG18" },
  { estado: "LAVADO",      alcance: "PRESORTING",  label: "Lavado · Bodega 38", alm: "AG22" },
  { estado: "EXTRASUCIO",  alcance: "PRESORTING",  label: "Extrasucio · Bodega 38", alm: "AG22" },
];

/** Estados que YA tienen su propia pestaña — los "otros" son el resto. */
const ESTADOS_FIJOS = new Set(["BAJA", "LAVADO", "EXTRASUCIO"]);

const ESTADOS_DESTINO = ["BAJA", "LAVADO", "EXTRASUCIO"] as const;

/** Lo que de «otros estados» DEBERÍA ir a pasivo: OTROS y MAL ESTADO (lo sano —RETORNO, NUEVO, VACÍO…— no es pasivo). */
const PARA_PASIVO = /OTRO|MAL ?ESTADO/i;
/** Fábrica (AG18): NADA de lo contado puede quedar fuera del pasivo → ahí se muestra todo lo que no sea BAJA/LAVADO/EXTRASUCIO.
 *  Bodega 38 (AG22): con el interruptor, solo OTROS y MAL ESTADO (lo sano no es pasivo). */
const fueraDePasivo = (f: { estado: string; alcance: string }, soloPasivo: boolean) =>
  !ESTADOS_FIJOS.has(f.estado) && (f.alcance === "SORTING" || !soloPasivo || PARA_PASIVO.test(f.estado));
const ALMACEN_DE = (alcance: string) => (alcance === "SORTING" ? "Fábrica · AG18" : alcance === "PRESORTING" ? "Bodega 38 · AG22" : alcance);

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
  reasignaciones,
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
  /** La hoja «Reasignaciones»: el registro de los cambios de estado del día. */
  reasignaciones: Reasignacion[];
}) {
  const router = useRouter();
  const [cambiando, startCambio] = useTransition();
  const [hojaIdx, setHojaIdx] = useState(0);
  const [reclas, setReclas] = useState<Fila | null>(null);
  /** El material con la cuenta del cuadre de fábrica abierta. */
  const [verCuenta, setVerCuenta] = useState<string | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();
  /* «Otros estados»: por defecto SOLO lo que debe ir a pasivo (OTROS y MAL ESTADO), para saber qué falta reasignar. */
  const [soloPasivo, setSoloPasivo] = useState(true);

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
        return detalle.filter((f) => fueraDePasivo(f, soloPasivo))
          .sort((a, b) => (a.alcance === b.alcance ? 0 : a.alcance === "SORTING" ? -1 : 1) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }) || a.estado.localeCompare(b.estado));
      }
      return detalle.filter(
        (f) =>
          f.estado === hoja.estado &&
          (hoja.alcance === null || f.alcance === hoja.alcance),
      );
    },
    [detalle, hoja, esOtros, soloPasivo],
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
            El conteo del día que escojas (el mismo consolidado de la BD) contra el casco del día
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
                    const fs = detalle.filter((f) => fueraDePasivo(f, soloPasivo));
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
                  {h.alm && <span className={"bal-tab-alm" + (h.alm === "AG18" ? " a18" : h.alm === "AG22" ? " a22" : "")} title="Almacén en SAP">{h.alm}</span>}
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
            {/* Y DESPUÉS DEL CONSOLIDADO: el registro de lo que se reasignó. */}
            <button role="tab" aria-selected={hojaIdx === -2} className={`bal-tab ${hojaIdx === -2 ? "activa" : ""}`} onClick={(e) => { setHojaIdx(-2); e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" }) }}>
              <span className="bal-tab-label">Reasignaciones</span>
              <span className="bal-tab-n" title="cambios de estado">{reasignaciones.length}</span>
            </button>
          </nav>

          {hojaIdx === -2 ? <Reasignaciones lineas={reasignaciones} /> : hojaIdx < 0 ? <Consolidado lineas={consolidado} fecha={fecha} /> : (<>
          {/* ---- «OTROS ESTADOS»: qué se quedó por fuera del pasivo, por almacén ---- */}
          {esOtros && (
            <div className="bal-otros-barra">
              <label className="bal-otros-sw">
                <input type="checkbox" checked={soloPasivo} onChange={(e) => setSoloPasivo(e.target.checked)} />
                <b>Solo lo que debe ir a pasivo</b>
                <small>Fábrica: se muestra TODO lo que no sea baja/lavado/extrasucio · Bodega 38: solo OTROS y MAL ESTADO (RETORNO, NUEVO, VACÍO… son sanos){soloPasivo ? "" : " — apagado: se ve todo"}</small>
              </label>
              {(["SORTING", "PRESORTING"] as const).map((al) => {
                const rs = principales.filter((f) => f.alcance === al);
                const cj = rs.reduce((t, f) => t + f.fisico_cajas, 0);
                const un = rs.reduce((t, f) => t + (f.un_caja ? f.fisico_cajas * f.un_caja : 0), 0);
                return (
                  <span key={al} className={"bal-otros-chip" + (rs.length ? " hay" : "")}>
                    <b>{ALMACEN_DE(al)}</b> {rs.length ? <>{rs.length} {rs.length === 1 ? "renglón" : "renglones"} · {n(cj)} cajas · {n(un)} u por reasignar</> : "nada por reasignar — todo está en pasivo"}
                  </span>
                );
              })}
            </div>
          )}

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
                    {esOtros && <th>Estado</th>}
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
                  {principales.map((f, i) => {
                    const cf = f.cuadre_fabrica;
                    const llave = `${f.estado}|${f.alcance}|${f.codigo}`;
                    const abierta = !!cf && verCuenta === llave;
                    const nuevoAlm = esOtros && (i === 0 || principales[i - 1].alcance !== f.alcance);
                    const delAlm = nuevoAlm ? principales.filter((x) => x.alcance === f.alcance) : [];
                    return (
                    <Fragment key={i}>
                    {nuevoAlm && (
                      <tr className="g"><td colSpan={13}>
                        {ALMACEN_DE(f.alcance)} · {delAlm.length} {delAlm.length === 1 ? "material" : "materiales"} · {n(delAlm.reduce((t, x) => t + x.fisico_cajas, 0))} cajas
                      </td></tr>
                    )}
                    <tr className={(f.alerta ? "con-alerta" : "") + (abierta ? " bal-abierta" : "")}>
                      <td className="mono">
                        {cf ? (
                          <button type="button" className="bal-cod-bt" aria-expanded={abierta} title="Ver de dónde salen las estibas casco"
                                  onClick={() => setVerCuenta(abierta ? null : llave)}>{f.codigo}</button>
                        ) : f.codigo}
                      </td>
                      <td>{f.material ?? "—"}</td>
                      {esOtros && <td><b className={f.alcance === "SORTING" || PARA_PASIVO.test(f.estado) ? "bal-est-otro" : ""}>{f.estado}</b></td>}
                      <td className={`r ${f.cajas_estiba ? "" : "bal-falta"}`}>{f.cajas_estiba ? n(f.cajas_estiba) : "falta"}</td>
                      <td className={`r ${f.un_caja ? "" : "bal-falta"}`}>{f.un_caja ? n(f.un_caja) : "falta"}</td>
                      <td className="r">{n(f.fisico_cajas)}</td>
                      <td className="r">
                        {cf ? (
                          <span className="bal-est-cf">
                            {n(f.estibas_casco, 2)}
                            {/* EL OJITO: dice en una línea que aquí se agregó la diferencia; tocarlo abre la cuenta. */}
                            <button type="button" className="bal-ojo" aria-expanded={abierta}
                                    aria-label={`Ver la cuenta de las estibas casco de ${f.codigo}`}
                                    onClick={() => setVerCuenta(abierta ? null : llave)}>
                              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                                <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                <circle cx="12" cy="12" r="3.2" fill="currentColor" />
                              </svg>
                              <span className="bal-tip" role="tooltip">
                                <b>Casco: inventario + lavado con baja</b>
                                {n(cf.inventario, 2)} + {n(cf.lavado, 2)} = <b>{n(cf.estibas, 2)}</b>
                                <small>Pendiente por baja: {n(cf.conteo_estibas, 2)} contado − {n(cf.casco, 2)} = <b>{n(cf.diferencia, 2)}</b> est. Toca para ver la cuenta.</small>
                              </span>
                            </button>
                          </span>
                        ) : n(f.estibas_casco)}
                      </td>
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
                    {abierta && cf && (
                      <tr className="bal-cf-fila">
                        <td colSpan={12}>
                          <div className="bal-cf">
                            <p className="bal-cf-tit"><b>{f.codigo}</b> {f.material ?? ""} · estibas casco y pendiente por baja <span>(el Casco no se cambia: la cuenta se hace aquí; su Lavado con baja ya no se cuenta en Lavado · Fábrica)</span></p>
                            <ol>
                              <li><span>Estibas casco · Baja Fábrica</span>
                                <b>{n(cf.inventario, 2)} + {n(cf.lavado, 2)} = {n(cf.casco, 2)}</b>
                                <small>Inventario casco de vidrio + Lavado con baja · × {n(cf.factor)} = {n(f.cajas_casco)} cajas</small></li>
                              <li><span>Conteo · BAJA en Fábrica</span>
                                <b>{n(cf.conteo_estibas, 2)} est.</b>
                                <small>{n(cf.conteo_cajas)} cajas ÷ {n(cf.factor)} por estiba</small></li>
                              <li><span>La cuenta</span>
                                <b>{n(cf.conteo_estibas, 2)} − {n(cf.casco, 2)}</b>
                                <small>lo contado en BAJA menos las estibas casco</small></li>
                              <li className="res"><span>{cf.diferencia >= 0 ? "Pendiente por baja" : "Sobra en casco"}</span>
                                <b>{n(Math.abs(cf.diferencia), 2)} est.</b>
                                <small>× {n(cf.factor)} = {n(Math.abs(cf.diferencia) * cf.factor)} cajas (la Dif cajas)</small></li>
                            </ol>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
                {principales.length > 1 && (
                  <tfoot>
                    <tr>
                      <td colSpan={esOtros ? 5 : 4}>
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
                ? (soloPasivo ? "Nada por reasignar: todo lo contado en Fábrica está en BAJA, LAVADO o EXTRASUCIO, y en Bodega 38 no hay renglones en OTROS ni MAL ESTADO." : "No hay envases con otros estados para reclasificar.")
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
