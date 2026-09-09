"use client";

/**
 * IMPORTAR — los dos archivos que entran a Sider.
 *
 *   ZLDE           lo que llegó a Barranquilla, según SAP.
 *   Base de Datos  los viajes que ya pasaron, de la hoja que se llenaba
 *                  a mano antes de que existiera esta app.
 *
 * Son la primera y la segunda tabla del seguimiento. La tercera sale de
 * las dos y no se importa.
 *
 * LO QUE LEE EL ARCHIVO vive en modulos/sider/deteccion.ts, aparte, para
 * poder correrlo contra el archivo de verdad en una prueba y comparar
 * los totales con el Excel. Aquí solo está la pantalla.
 *
 * Y NADA SE GUARDA HASTA QUE SE VE. Se muestra qué hoja leyó, qué
 * columna es cada cosa, cuántas líneas usó, cuántas descartó y por qué,
 * y el resultado por mes. Importar a ciegas es como entran los datos
 * malos que después nadie sabe de dónde salieron: los 514 millones de
 * hectolitros de la semana pasada se cacharon porque el número era
 * absurdo, no porque algo avisara.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { MESES_LARGO } from "@/modulos/sider/comun";
import {
  leerZlde, leerBase, limpia,
  type Hoja, type Maestro, type LecturaZlde, type LecturaBase,
} from "@/modulos/sider/deteccion";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const nombreMes = (m: string) =>
  `${MESES_LARGO[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

type Cual = "zlde" | "base";

export function Importar({ maestro, zldeCargado, importados }: {
  maestro: Maestro;
  zldeCargado: { mes: string; cd: number; hl: number }[];
  importados: { mes: string; viajes: number }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);

  const [cual, setCual] = useState<Cual>("zlde");
  const [archivo, setArchivo] = useState<string | null>(null);
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [zl, setZl] = useState<LecturaZlde | null>(null);
  const [bd, setBd] = useState<LecturaBase | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);
  const [verDescartes, setVerDescartes] = useState(false);

  /* Cambiar de pestaña NO borra el archivo: el libro de prueba trae las
     dos hojas, así que se sube una vez y se importan las dos cosas. */
  function relee(hs: Hoja[], c: Cual, planta?: string | null) {
    if (c === "zlde") setZl(leerZlde(hs, maestro, planta === undefined ? undefined : { plantaFiltro: planta }));
    else setBd(leerBase(hs, maestro));
  }

  async function leer(f: File) {
    setAviso(null);
    setArchivo(f.name);
    setLeyendo(true);
    setZl(null); setBd(null);
    try {
      const buf = await f.arrayBuffer();
      /* cellDates: el informe es mensual y la fecha decide en qué mes
         cae cada línea. Con el serial pelado hay que adivinar si 45870
         es una fecha o una cantidad. */
      const wb = XLSX.read(buf, { cellDates: true });
      const hs: Hoja[] = wb.SheetNames.map((n) => ({
        nombre: n,
        filas: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], {
          header: 1, blankrows: false, defval: null, raw: true,
        }),
      })).filter((h) => h.filas.length > 1);
      if (!hs.length) {
        setAviso({ mal: true, texto: "Ese archivo no tiene ninguna hoja con datos." });
        return;
      }
      setHojas(hs);
      setZl(leerZlde(hs, maestro));
      setBd(leerBase(hs, maestro));
    } catch {
      setAviso({ mal: true, texto: "No se pudo leer ese archivo. Tiene que ser .xlsx, .xls o .csv." });
    } finally {
      setLeyendo(false);
    }
  }

  /* ---------- ZLDE: resumen por mes ---------- */
  const porMesZlde = useMemo(() => {
    if (!zl) return [];
    const m = new Map<string, { cd: number; hl: number; vh: number; lineas: number }>();
    for (const f of zl.filas) {
      const a = m.get(f.mes) ?? { cd: 0, hl: 0, vh: 0, lineas: 0 };
      a.cd++; a.hl += f.hl; a.vh += f.vh; a.lineas += f.lineas;
      m.set(f.mes, a);
    }
    return [...m].map(([mes, v]) => ({ mes, ...v })).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [zl]);

  /* ---------- Base: resumen por mes ---------- */
  const porMesBase = useMemo(() => {
    if (!bd) return [];
    const m = new Map<string, { viajes: number; estibas: number; placas: Set<string> }>();
    for (const f of bd.filas) {
      const k = `${f.fecha.slice(0, 7)}-01`;
      const a = m.get(k) ?? { viajes: 0, estibas: 0, placas: new Set<string>() };
      a.viajes++; a.estibas += f.estibas; a.placas.add(f.placa);
      m.set(k, a);
    }
    return [...m].map(([mes, v]) => ({ mes, viajes: v.viajes, estibas: v.estibas, placas: v.placas.size }))
                 .sort((a, b) => a.mes.localeCompare(b.mes));
  }, [bd]);

  const conocidos = useMemo(
    () => new Set(maestro.origenes.map((o) => limpia(o.cd_origen))),
    [maestro.origenes]
  );

  /**
   * GUARDAR LAS DOS HOJAS DE UNA.
   *
   * Antes cada pestaña guardaba lo suyo, y guardar una sola es la mitad
   * del informe: con ZLDE cargado y la base sin cargar, el Real MTD sale
   * en cero y el % de certificación en 0,0% de punta a punta. Pasó, y
   * desde afuera parece que nadie certificó nada.
   *
   * Las dos son el MISMO archivo y el mismo mes, así que se guardan
   * juntas y se cuenta qué quedó de cada una. Si el libro solo trae una
   * de las dos hojas, se guarda esa y se dice cuál faltó.
   */
  const traduce = (m: string) =>
    /does not exist|schema cache|function/i.test(m)
      ? "Falta correr supabase/modulos/sider.sql en Supabase: creció con los dos importadores."
      : m;

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;
    const partes: string[] = [];
    const fallos: string[] = [];

    if (zl?.filas.length) {
      const { data, error } = await cli.rpc("sider_zlde_importar", { p_filas: zl.filas });
      if (error) fallos.push(`ZLDE: ${traduce(error.message)}`);
      else partes.push(
        `${data?.filas ?? 0} filas de ZLDE en ${(data?.meses ?? []).map(nombreMes).join(", ")}`
      );
    }
    if (bd?.filas.length) {
      const { data, error } = await cli.rpc("sider_viajes_importar", {
        p_filas: bd.filas.map((f) => ({
          fecha: f.fecha, planta: f.planta, sku: f.sku,
          estibas: f.estibas, placa: f.placa,
        })),
      });
      if (error) fallos.push(`Base de datos: ${traduce(error.message)}`);
      else partes.push(
        `${data?.filas ?? 0} viajes en ${(data?.meses ?? []).map(nombreMes).join(", ")}` +
        (data?.borrados ? ` (se reemplazaron ${data.borrados})` : "")
      );
    }

    setGuardando(false);
    if (fallos.length) { setAviso({ mal: true, texto: fallos.join(" · ") }); return; }
    setAviso({
      mal: false,
      texto: `Quedaron ${partes.join(" y ")}.` +
        (zl?.filas.length && bd?.filas.length
          ? " El seguimiento ya tiene las dos puntas."
          : " Ojo: este archivo solo traía una de las dos hojas, así que el informe " +
            "va a salir a medias hasta que entre la otra."),
    });
    router.refresh();
  }

  /* El botón guarda LAS DOS, así que se habilita si cualquiera de las
     dos leyó algo, no solo la pestaña que está abierta. */
  const cuantas = (zl?.filas.length ? 1 : 0) + (bd?.filas.length ? 1 : 0);
  const listo = cuantas > 0;
  const rotuloGuardar =
    cuantas === 2 ? "Guardar las dos hojas"
    : zl?.filas.length ? "Guardar ZLDE"
    : bd?.filas.length ? "Guardar la base"
    : "Guardar";

  return (
    <>
      {/* ---------- Qué se importa ---------- */}
      <div className="im-pes" role="tablist">
        {/* El visto dice que ESA hoja se encontró en el archivo y va a
            entrar al guardar. Las dos pestañas son para revisar lo que
            leyó de cada una, no dos importaciones distintas. */}
        <button type="button" role="tab" aria-selected={cual === "zlde"}
                className={cual === "zlde" ? "act" : ""}
                onClick={() => { setCual("zlde"); setAviso(null); }}>
          ZLDE {!!zl?.filas.length && <em>✓</em>}
          <span>{zl?.filas.length
            ? `${zl.filas.length} filas · ${nf.format(zl.filas.reduce((a, f) => a + f.hl, 0))} HL`
            : "lo que llegó, de SAP"}</span>
        </button>
        <button type="button" role="tab" aria-selected={cual === "base"}
                className={cual === "base" ? "act" : ""}
                onClick={() => { setCual("base"); setAviso(null); }}>
          Base de datos {!!bd?.filas.length && <em>✓</em>}
          <span>{bd?.filas.length
            ? `${bd.filas.length} viajes`
            : "los viajes que ya pasaron"}</span>
        </button>
      </div>

      {/* ---------- El archivo ----------
           La tarjeta grande solo existe ANTES de escoger. Con el archivo
           puesto se encoge a una barra: medido, la tarjeta se llevaba
           243 px de los 790 del portátil y la página quedaba 232 px más
           larga que la pantalla, que es justo lo que este módulo no
           puede hacer. Lo que se necesita después de subir es ver lo que
           leyó, no volver a leer para qué sirve el botón. */}
      <input ref={entrada} type="file" accept=".xlsx,.xls,.csv" hidden
             onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ""; }} />

      {!archivo || leyendo ? (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>{cual === "zlde" ? "El archivo de ZLDE" : "La hoja «Base de Datos»"}</h2>
              <p>
                {cual === "zlde"
                  ? <>El export de ZLDE tal como baja de SAP, con la columna <b>Cantidad</b>.
                      Los hectolitros no hacen falta en el archivo: se calculan del{" "}
                      <Link href="/sider/maestro">maestro</Link>, igual que la fórmula del
                      Excel. Se toma lo que va a <b>Barranquilla</b> y es <b>EER</b>.</>
                  : <>La hoja donde se llevaban los viajes a mano: origen, fecha, estibas,
                      placa y SKU. Entran marcados como <b>importados</b>: cuentan para el
                      Real MTD del seguimiento, pero no tienen fotos ni GPS y no se pueden
                      certificar.</>}
              </p>
            </div>
          </div>
          <div className="zl-suelta">
            <button type="button" className="ct-grande" disabled={leyendo}
                    onClick={() => entrada.current?.click()}>
              {leyendo ? "Leyendo el archivo…" : "Escoger el archivo"}
            </button>
            <p className="zl-ojo">
              El mismo archivo sirve para las dos pestañas. Busca las columnas por lo que
              TIENEN, no por cómo se llamen, y nada se guarda hasta que lo apruebes.
            </p>
          </div>
        </section>
      ) : (
        <div className="im-barra">
          <span className="im-arch" title={archivo}>{archivo}</span>
          <button type="button" className="btn plano" onClick={() => entrada.current?.click()}>
            Cambiar
          </button>
          {cual === "zlde" && zl && zl.cols.planta >= 0 && (
            <label>
              <span>llegó a</span>
              <select value={zl.planta ?? ""}
                      onChange={(e) => relee(hojas, "zlde", e.target.value || null)}>
                <option value="">todas las plantas</option>
                {zl.plantas.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="btn" disabled={!listo || guardando} onClick={guardar}>
            {guardando ? "Guardando…" : rotuloGuardar}
          </button>
        </div>
      )}

      {/* ================= ZLDE ================= */}
      {cual === "zlde" && zl && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Lo que va a quedar</h2>
              {/* DE DÓNDE SALE ESTE NÚMERO, siempre a la vista. Los 514
                  millones de hectolitros se cacharon porque el número era
                  absurdo; si hubieran sido cuatro veces más y no dos mil,
                  se guardaban. */}
              <p className="zl-deDonde">
                Hoja <b>«{zl.hoja}»</b> · CD <b>«{zl.nombresCol[zl.cols.cd]}»</b> ·
                material <b>«{zl.nombresCol[zl.cols.sku]}»</b> · cantidad{" "}
                <b>«{zl.nombresCol[zl.cols.cantidad]}»</b> · fecha{" "}
                <b>«{zl.nombresCol[zl.cols.fecha]}»</b> — de {nf0.format(zl.leidas)} líneas
                se usan <b>{nf0.format(zl.usadas)}</b>.
              </p>
            </div>
          </div>

          {!!zl.cdSueltos.length && (
            <p className="sg-aparte">
              <b>{zl.cdSueltos.length} nombre{zl.cdSueltos.length > 1 ? "s" : ""} de CD no
              está{zl.cdSueltos.length > 1 ? "n" : ""} en el maestro</b>: {zl.cdSueltos.join(" · ")}.
              Se guardan igual y el seguimiento los muestra marcados, pero no entran en
              ningún total hasta que el nombre coincida.
            </p>
          )}

          <div className="marco sg-marco im-tabla">
            <table>
              <thead>
                <tr>
                  <th>Mes</th><th className="num">CD</th><th className="num">Vehículos</th>
                  <th className="num">Hectolitros</th><th className="num">Líneas</th>
                </tr>
              </thead>
              <tbody>
                {porMesZlde.map((m) => (
                  <tr key={m.mes}>
                    <td>{nombreMes(m.mes)}</td>
                    <td className="num">{m.cd}</td>
                    <td className="num">{nf.format(m.vh)}</td>
                    <td className="num">{nf.format(m.hl)}</td>
                    <td className="num cod">{nf0.format(m.lineas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="im-detalle">
            <summary>
              Qué quedó por fuera ·{" "}
              {nf0.format(zl.leidas - zl.usadas)} líneas
            </summary>
            <ul className="im-lista">
              <li><b>{nf0.format(zl.descartes.noEer)}</b> líneas de cajas plásticas, barriles,
                estibas de madera o cilindros: el informe es de envase retornable.</li>
              {zl.descartes.otraPlanta > 0 && (
                <li><b>{nf0.format(zl.descartes.otraPlanta)}</b> líneas que no llegaron a{" "}
                  {zl.planta ?? "la planta escogida"}.</li>
              )}
              {zl.descartes.sinSku > 0 && (
                <li><b>{zl.descartes.sinSku}</b> líneas con un material que no está en el{" "}
                  <Link href="/sider/maestro">maestro</Link>: {zl.skusDesconocidos.join(", ")}.
                  Si alguno de esos viaja por sider, agrégalo con sus factores y vuelve a subir.</li>
              )}
            </ul>
          </details>

          <details className="im-detalle" open={verDescartes}
                   onToggle={(e) => setVerDescartes((e.target as HTMLDetailsElement).open)}>
            <summary>Ver los {zl.filas.length} renglones que se van a guardar</summary>
            <div className="marco sg-marco im-tabla">
              <table>
                <thead>
                  <tr><th>Mes</th><th>CD de origen</th><th className="num">Vh</th><th className="num">HL</th></tr>
                </thead>
                <tbody>
                  {zl.filas.map((f) => (
                    <tr key={`${f.mes}${f.cd_origen}`}>
                      <td className="cod">{nombreMes(f.mes)}</td>
                      <td className={conocidos.has(limpia(f.cd_origen)) ? undefined : "apagado"}>
                        {f.cd_origen}
                      </td>
                      <td className="num">{nf.format(f.vh)}</td>
                      <td className="num">{nf.format(f.hl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
        </section>
      )}

      {cual === "zlde" && !zl && !!hojas.length && !leyendo && (
        <div className="aviso mal">
          No encontré en ese libro ninguna hoja con material, cantidad y fecha. Un ZLDE
          tiene que traer al menos la columna del material y la de cantidad.
        </div>
      )}

      {/* ================= Base de Datos ================= */}
      {cual === "base" && bd && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Lo que va a quedar</h2>
              <p className="zl-deDonde">
                Hoja <b>«{bd.hoja}»</b> · origen <b>«{bd.nombresCol[bd.cols.origen]}»</b> ·
                fecha <b>«{bd.nombresCol[bd.cols.fecha]}»</b> · estibas{" "}
                <b>«{bd.nombresCol[bd.cols.estibas]}»</b> · placa{" "}
                <b>«{bd.nombresCol[bd.cols.placa]}»</b> · SKU{" "}
                <b>«{bd.nombresCol[bd.cols.sku]}»</b> — de {nf0.format(bd.leidas)} renglones
                entran <b>{nf0.format(bd.filas.length)}</b>. Las cajas, las unidades, los HL
                y el sider se calculan del maestro, como en la app.
              </p>
            </div>
          </div>

          {!!bd.descartadas.length && (
            <details className="im-detalle">
              <summary>
                {bd.descartadas.length} renglón{bd.descartadas.length > 1 ? "es" : ""} sin
                importar — ver cuáles y por qué
              </summary>
              <ul className="im-lista">
                {bd.descartadas.map((d) => (
                  <li key={d.fila}><b>Fila {d.fila}</b> · {d.motivo}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="marco sg-marco im-tabla">
            <table>
              <thead>
                <tr>
                  <th>Mes</th><th className="num">Viajes</th>
                  <th className="num">Placas</th><th className="num">Estibas</th>
                </tr>
              </thead>
              <tbody>
                {porMesBase.map((m) => (
                  <tr key={m.mes}>
                    <td>{nombreMes(m.mes)}</td>
                    <td className="num">{m.viajes}</td>
                    <td className="num">{m.placas}</td>
                    <td className="num">{nf.format(m.estibas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sg-aparte">
            Cargar reemplaza <b>los meses que trae el archivo</b>, y solo lo importado: un
            viaje certificado en la app, con sus fotos y su GPS, no lo toca un archivo.
          </p>
          {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
        </section>
      )}

      {cual === "base" && !bd && !!hojas.length && !leyendo && (
        <div className="aviso mal">
          No encontré en ese libro ninguna hoja de viajes. Tiene que traer el origen, la
          fecha, las estibas, la placa y el SKU, y el origen y el SKU tienen que existir en
          el <Link href="/sider/maestro">maestro</Link>.
        </div>
      )}

      {/* ---------- Lo que ya está cargado ---------- */}
      {!archivo && (
        <section className="tarjeta">
          <div className="cab">
            <div>
              <h2>Lo que ya está cargado</h2>
              <p>Volver a subir un mes lo reemplaza completo.</p>
            </div>
          </div>
          <div className="marco sg-marco im-tabla">
            <table>
              <thead>
                <tr>
                  <th>Mes</th><th className="num">CD en ZLDE</th>
                  <th className="num">HL recibido</th><th className="num">Viajes importados</th>
                </tr>
              </thead>
              <tbody>
                {mezcla(zldeCargado, importados).map((m) => (
                  <tr key={m.mes}>
                    <td>{nombreMes(m.mes)}</td>
                    <td className="num">{m.cd || <span className="apagado">—</span>}</td>
                    <td className="num">{m.hl ? nf.format(m.hl) : <span className="apagado">—</span>}</td>
                    <td className="num">{m.viajes || <span className="apagado">—</span>}</td>
                  </tr>
                ))}
                {!zldeCargado.length && !importados.length && (
                  <tr><td colSpan={4} className="apagado">Todavía no hay nada cargado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

/** Un renglón por mes con las dos cargas al lado: cuál falta se ve solo. */
function mezcla(
  zlde: { mes: string; cd: number; hl: number }[],
  imp: { mes: string; viajes: number }[]
) {
  const m = new Map<string, { mes: string; cd: number; hl: number; viajes: number }>();
  for (const z of zlde) m.set(z.mes, { mes: z.mes, cd: z.cd, hl: z.hl, viajes: 0 });
  for (const i of imp) {
    const a = m.get(i.mes) ?? { mes: i.mes, cd: 0, hl: 0, viajes: 0 };
    a.viajes = i.viajes;
    m.set(i.mes, a);
  }
  return [...m.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}
