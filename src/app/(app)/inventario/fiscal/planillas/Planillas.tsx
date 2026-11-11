"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Selector } from "@/components/Selector";
import { aUnidades, partir, textoCantidad } from "@/modulos/inventario/unidades";

/* LAS PLANILLAS, EDITABLES SOLO EN LA PLANILLA.
   El fiscal puede cambiar el módulo y las estibas, el saldo y las cajas de cada uno de la pareja; la planilla rehace sola el total de cada
   uno, la diferencia y los totales de la hoja. Esos cambios son SOLO de lo que se imprime: no tocan el conteo ni el inventario real.
   Se guardan en este navegador (por inventario) para que no se pierdan al recargar. */

export type Lado = { estibas: number; saldo: number; cajas: number; unidades: number };
/** `upc` = unidades por caja del material (null = no se sabe: no hay unidades sueltas). */
export type FilaP = { modulo: string; sku: string; material: string; udsCaja: number | null; upc: number | null; detalle: string; ol: Lado | null; bav: Lado | null };
export type HojaP = {
  numero: number; calle: string; grupo: string; olNombre: string; bavNombre: string; sentidoOl: string; sentidoBav: string;
  filas: FilaP[]; blancos: string[]; conConteo: boolean; np: number;
};
type Campo = "e" | "s" | "c" | "u";
type Cant = { e: string; s: string; c: string; u?: string };
type Aj = { modulo?: string; ol?: Cant; bav?: Cant };

const FILAS = 18;
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const txt = (v: number) => (v ? String(v) : "");
const num = (t: string | undefined) => { const n = Number((t ?? "").replace(/[^\d]/g, "")); return Number.isFinite(n) ? n : 0 };
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const cantDe = (l: Lado | null): Cant | null => (l ? { e: txt(l.estibas), s: txt(l.saldo), c: txt(l.cajas), u: txt(l.unidades) } : null);
const hay = (c: Cant | null | undefined) => !!c && (c.e !== "" || c.s !== "" || c.c !== "" || (c.u ?? "") !== "");

export function Planillas({ fiscalId, nombre, fecha, fechaTexto, hoy, hojas, todas, soloHoja, aviso }: {
  fiscalId: string; nombre: string; fecha: string; fechaTexto: string; hoy: string;
  hojas: HojaP[]; todas: number[]; soloHoja: number; aviso: string | null;
}) {
  const clave = `planilla-ajustes-${fiscalId}`;
  const [aj, setAj] = useState<Record<string, Aj>>({});
  const [listo, setListo] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  /* El código por el que se filtra para ir comparando subtotales. Es solo de la pantalla: el papel sale completo. */
  const [cod, setCod] = useState("");
  /* El nombre de la familia de cada hoja (lo escribe el fiscal en el recuadro rojo); solo vive en esta planilla. */
  const claveNom = `planilla-familias-${fiscalId}`;
  const [fam, setFam] = useState<Record<number, string>>({});
  useEffect(() => {
    try { const t = localStorage.getItem(claveNom); if (t) setFam(JSON.parse(t) as Record<number, string>) } catch { /* igual */ }
  }, [claveNom]);
  function nombrar(n: number, v: string) {
    setFam((x) => {
      const y = { ...x, [n]: v };
      if (!v.trim()) delete y[n];
      try { if (Object.keys(y).length) localStorage.setItem(claveNom, JSON.stringify(y)); else localStorage.removeItem(claveNom) } catch { /* igual */ }
      return y;
    });
  }
  useEffect(() => {
    try { const t = localStorage.getItem(clave); if (t) setAj(JSON.parse(t) as Record<string, Aj>) } catch { /* sin almacenamiento: sigue sin guardar */ }
    setListo(true);
  }, [clave]);
  useEffect(() => {
    if (!listo) return;
    try { if (Object.keys(aj).length) localStorage.setItem(clave, JSON.stringify(aj)); else localStorage.removeItem(clave) } catch { /* igual */ }
  }, [aj, clave, listo]);

  /* El nombre con que se guarda el PDF: «Inventario fiscal <mes> <año> - Hoja N - <pareja>» (el navegador usa el título de la página). */
  useEffect(() => {
    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const [a, m] = fecha.split("-");
    const mes = `${MESES[Number(m) - 1] ?? ""} ${a}`.trim();
    const h = hojas.length === 1 ? hojas[0] : null;
    const pareja = h ? [h.olNombre, h.bavNombre].filter(Boolean).join(" y ") : "";
    const antes = document.title;
    const f = h ? (fam[h.numero] ?? "").trim() : "";
    document.title = h ? `Inventario fiscal ${mes} - ${f || `Hoja ${h.numero}`}${pareja ? ` - ${pareja}` : ""}` : `Inventario fiscal ${mes} - Planillas por pareja`;
    return () => { document.title = antes };
  }, [fecha, hojas, fam]);

  const k = (h: number, i: number) => `${h}:${i}`;
  const ocup = (h: HojaP, f: FilaP, i: number) => {
    const a = aj[k(h.numero, i)];
    return {
      modulo: a?.modulo ?? f.modulo,
      ol: a?.ol ?? cantDe(f.ol),
      bav: a?.bav ?? cantDe(f.bav),
    };
  };
  /* Lo contado de un lado en UNIDADES exactas (cajas × unidades por caja + sueltas) y partido otra vez en cajas + sueltas.
     Las unidades sueltas CUENTAN en el total, la diferencia y los totales de la hoja. */
  const cuenta = (c: Cant | null, f: FilaP): { cajas: number; sueltas: number; u: number } | null => {
    if (!hay(c)) return null;
    const upc = f.upc ?? 1;
    const cajas = num(c!.e) * (f.udsCaja ?? 0) + num(c!.s) + num(c!.c);
    const u = f.upc ? aUnidades(cajas, num(c!.u), upc) : cajas;
    const p = partir(u, upc);
    return { cajas: p.cajas, sueltas: p.unidades, u };
  };

  function poner(h: HojaP, i: number, f: FilaP, que: "modulo" | "ol" | "bav", campo: Campo | null, valor: string) {
    setAj((x) => {
      const o = ocup(h, f, i);
      const a: Aj = { ...(x[k(h.numero, i)] ?? {}) };
      if (que === "modulo") a.modulo = valor;
      else { const base = o[que] ?? { e: "", s: "", c: "", u: "" }; const v = valor.replace(/[^\d]/g, ""); a[que] = campo === "c" ? { ...base, c: v, s: "" } : { ...base, [campo!]: v } }
      return { ...x, [k(h.numero, i)]: a };
    });
  }
  function igualar(h: HojaP, i: number, f: FilaP, haciaBav: boolean) {
    setAj((x) => {
      const o = ocup(h, f, i);
      const a: Aj = { ...(x[k(h.numero, i)] ?? {}) };
      if (haciaBav) a.bav = o.ol ? { ...o.ol } : { e: "", s: "", c: "", u: "" }; else a.ol = o.bav ? { ...o.bav } : { e: "", s: "", c: "", u: "" };
      return { ...x, [k(h.numero, i)]: a };
    });
  }
  /* Los códigos que hay en las hojas que se ven, para escoger de la lista. */
  const codigos = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of hojas) for (const f of h.filas) if (!m.has(f.sku)) m.set(f.sku, f.material);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sku, material]) => ({ valor: sku, codigo: sku, etiqueta: material }));
  }, [hojas]);

  /* SUBTOTALES DEL CÓDIGO: por hoja y en total, de lo que contó cada uno (con los ajustes de la planilla), en unidades exactas. */
  const sub = (() => {
    if (!cod) return null;
    let upc = 1, material = "", udsCaja: number | null = null;
    const porHoja = hojas.flatMap((h) => {
      let renglones = 0, uOl = 0, uBav = 0, hayOl = false, hayBav = false;
      h.filas.forEach((f, i) => {
        if (f.sku !== cod) return;
        upc = f.upc ?? 1; material = f.material; udsCaja = f.udsCaja ?? udsCaja;
        const o = ocup(h, f, i);
        const a = cuenta(o.ol, f), b = cuenta(o.bav, f);
        renglones++;
        if (a) { uOl += a.u; hayOl = true }
        if (b) { uBav += b.u; hayBav = true }
      });
      return renglones ? [{ h, renglones, uOl, uBav, hayOl, hayBav }] : [];
    });
    const t = porHoja.reduce((x, r) => ({ r: x.r + r.renglones, ol: x.ol + r.uOl, bav: x.bav + r.uBav }), { r: 0, ol: 0, bav: 0 });
    return { porHoja, t, upc, material, udsCaja };
  })();
  const mostrar = (u: number, upc: number, hay: boolean) => { if (!hay) return "—"; const p = partir(u, upc); return textoCantidad(p.cajas, p.unidades) };
  const mostrarDif = (u: number, upc: number) => { if (u === 0) return "0"; const p = partir(u, upc); return [p.cajas ? signo(p.cajas) : "", p.unidades ? `${signo(p.unidades)} un.` : ""].filter(Boolean).join(" ") };
  const cambios = Object.keys(aj).length;
  const totalPaginas = hojas.reduce((t, h) => t + h.np, 0);
  /* «Cajas» es UNA sola columna: las cajas sueltas de la estiba incompleta (saldo) y las cajas a secas se suman y se ven juntas. */
  const valorDe = (x: Cant | null | undefined, c: Campo) => {
    if (!x) return "";
    if (c !== "c") return x[c] ?? "";
    return x.s === "" && x.c === "" ? "" : String(num(x.s) + num(x.c));
  };
  const campo = (h: HojaP, f: FilaP, i: number, que: "ol" | "bav", c: Campo, etiqueta: string) => (
    <td className="r e"><input inputMode="numeric" aria-label={`${etiqueta} · ${que === "ol" ? "operador logístico" : "Bavaria"} · ${f.sku}`}
      disabled={c === "u" && !f.upc} value={valorDe(ocup(h, f, i)[que], c)} onChange={(e) => poner(h, i, f, que, c, e.target.value)} /></td>
  );

  return (
    <div className="pl">
      <div className="pl-barra">
        <div className="pl-barra-t">
          <b>{nombre}</b>
          <span>{fechaTexto} · {hojas.length} {hojas.length === 1 ? "planilla" : "planillas"} · {totalPaginas} {totalPaginas === 1 ? "página" : "páginas"} carta horizontal</span>
          <span className="pl-filtro">
            <Link href={`/inventario/fiscal/planillas?fiscal=${fiscalId}`} className={!soloHoja ? "on" : ""}>Todas</Link>
            {todas.map((n) => <Link key={n} href={`/inventario/fiscal/planillas?fiscal=${fiscalId}&hoja=${n}`} className={soloHoja === n ? "on" : ""}>Hoja {n}</Link>)}
          </span>
        </div>
        <div className="pl-barra-b">
          <div className="pl-cod" title="Deja solo los renglones de un código y suma lo que contó cada uno">
            <small>Filtrar por código</small>
            <Selector valor={cod} onCambiar={setCod} vacio="Todos los códigos" ariaLabel="Filtrar por código"
                      opciones={[{ valor: "", etiqueta: "Todos los códigos" }, ...codigos]} />
          </div>
          {cambios > 0 && <button type="button" className="pl-restablecer" onClick={() => dlg.current?.showModal()}>Quitar mis ajustes ({cambios})</button>}
          <button type="button" className="pl-imprimir" onClick={() => window.print()}>Imprimir o guardar en PDF</button>
        </div>
      </div>
      <dialog ref={dlg} className="pl-dlg" aria-label="Quitar los ajustes de la planilla">
        <div className="pl-dlg-cab"><p>Planillas · ajustes</p><h2>Quitar mis ajustes</h2></div>
        <div className="pl-dlg-cuerpo">
          <p>Todo vuelve a lo que contaron los dos. Se borran los {cambios} {cambios === 1 ? "renglón ajustado" : "renglones ajustados"} de la planilla; el conteo y el inventario real no cambian.</p>
          <div className="pl-dlg-acc">
            <button type="button" className="pl-dlg-no" onClick={() => dlg.current?.close()}>No, dejarlos</button>
            <button type="button" className="pl-dlg-si" onClick={() => { setAj({}); dlg.current?.close() }}>Sí, quitar mis ajustes</button>
          </div>
        </div>
      </dialog>
      {sub && (
        <section className="pl-sub" aria-label={`Subtotales del código ${cod}`}>
          <header>
            <div><small>SUBTOTALES DEL CÓDIGO</small><b>{cod} · {sub.material}</b>{sub.udsCaja ? <span>{sub.udsCaja} cajas por estiba{sub.upc > 1 ? ` · ${sub.upc} un. por caja` : ""}</span> : null}</div>
            <button type="button" onClick={() => setCod("")}>Quitar filtro</button>
          </header>
          <table>
            <thead><tr><th>Hoja</th><th className="n">Renglones</th><th className="n ol">Operador logístico</th><th className="n bv">Bavaria</th><th className="n">Diferencia</th></tr></thead>
            <tbody>
              {sub.porHoja.map(({ h, renglones, uOl, uBav, hayOl, hayBav }) => {
                const d = hayOl && hayBav ? uOl - uBav : 0;
                return (
                  <tr key={h.numero}>
                    <td>{fam[h.numero]?.trim() || `Hoja ${h.numero}`}{h.calle ? <em> · Calle {h.calle}</em> : null}</td>
                    <td className="n">{renglones}</td>
                    <td className="n">{mostrar(uOl, sub.upc, hayOl)}</td>
                    <td className="n">{mostrar(uBav, sub.upc, hayBav)}</td>
                    <td className={"n" + (d !== 0 ? " mal" : "")}>{hayOl && hayBav ? mostrarDif(d, sub.upc) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td><td className="n">{sub.t.r}</td>
                <td className="n">{mostrar(sub.t.ol, sub.upc, true)}</td><td className="n">{mostrar(sub.t.bav, sub.upc, true)}</td>
                <td className={"n" + (sub.t.ol !== sub.t.bav ? " mal" : "")}>{mostrarDif(sub.t.ol - sub.t.bav, sub.upc)}</td>
              </tr>
            </tfoot>
          </table>
          <p>Salen solo los renglones de este código; los ajustes que escribas se suman al momento. Para imprimir, la planilla sale completa.{soloHoja ? " Estás viendo una sola hoja: para comparar entre hojas, escoge «Todas»." : ""}</p>
        </section>
      )}
      <p className="pl-ayuda">Puedes escribir sobre el módulo y sobre estiba, caja y unidades de cada uno: la planilla rehace sola la diferencia y los totales de la hoja. Con <b>‹</b> o <b>›</b> pasas el conteo de un lado al otro. En el recuadro rojo puedes escribir el nombre de la familia en vez del número de hoja. Los ajustes son solo de esta planilla: el conteo y el inventario real no cambian.</p>
      {aviso && <p className="pl-vacio">{aviso}</p>}
      {hojas.length === 0 && <p className="pl-vacio">Este inventario todavía no tiene hojas. Arma las parejas en el Plan fiscal.</p>}
      {hojas.flatMap((h) => Array.from({ length: h.np }, (_, p) => {
        const ultima = p === h.np - 1;
        const desde = p * FILAS;
        const trozo = h.conConteo ? h.filas.slice(desde, desde + FILAS) : [];
        const mods = !h.conConteo ? h.blancos.slice(desde, desde + FILAS) : [];
        const relleno = Math.max(0, FILAS - (h.conConteo ? trozo.length : mods.length));
        const tot = h.filas.reduce((t, f, i) => {
          const o = ocup(h, f, i);
          const a = cuenta(o.ol, f), b = cuenta(o.bav, f);
          return { ol: t.ol + (a?.cajas ?? 0), bav: t.bav + (b?.cajas ?? 0), uOl: t.uOl + (a?.sueltas ?? 0), uBav: t.uBav + (b?.sueltas ?? 0),
                   dc: t.dc + partir((a?.u ?? 0) - (b?.u ?? 0), f.upc ?? 1).cajas, du: t.du + partir((a?.u ?? 0) - (b?.u ?? 0), f.upc ?? 1).unidades };
        }, { ol: 0, bav: 0, uOl: 0, uBav: 0, dc: 0, du: 0 });
        const sinCod = !!cod && !trozo.some((f) => f.sku === cod);
        return (
          <section key={`${h.numero}-${p}`} className={`pl-pg${cod ? " pl-fil" : ""}${sinCod ? " pl-sin" : ""}`} aria-label={`Planilla hoja ${h.numero}, página ${p + 1} de ${h.np}`}>
            <div className="pl-hd">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/logo-bavaria.png" alt="Bavaria" />
              <div className="pl-tit"><b>PLANILLA DE CONTEO</b><span>Inventario fiscal</span></div>
              <label className={"pl-hoja" + (fam[h.numero] ? " con-nombre" : "")} title="Escribe aquí el nombre de la familia">
                <small>{fam[h.numero] ? "FAMILIA" : "HOJA"}</small>
                <input className="pl-fam" value={fam[h.numero] ?? ""} placeholder={String(h.numero)} maxLength={28}
                  size={Math.max(2, Math.min(18, (fam[h.numero] ?? "").length))} aria-label={`Nombre de la familia de la hoja ${h.numero}`}
                  onChange={(e) => nombrar(h.numero, e.target.value)} />
              </label>
            </div>
            <div className="pl-regla" />
            <div className="pl-meta">
              <div><small>Inventario</small><b>{nombre}</b></div>
              <div><small>Fecha</small><b>{fechaTexto}</b></div>
              <div><small>Grupo</small><b>{h.grupo}</b></div>
              <div><small>Calle</small><b>{h.calle ? `Calle ${h.calle}` : ""}</b></div>
              <div><small>Página</small><b>{p + 1} de {h.np}</b></div>
            </div>
            <div className="pl-par">
              <div><span><small>Contador · Operador logístico{h.sentidoOl ? ` · ${h.sentidoOl}` : ""}</small><b>{h.olNombre}</b></span><i /></div>
              <div><span><small>Contador · Bavaria{h.sentidoBav ? ` · ${h.sentidoBav}` : ""}</small><b>{h.bavNombre}</b></span><i /></div>
            </div>
            <div className="pl-tw">
              <table className="pl-t">
                <colgroup>
                  <col style={{ width: 72 }} /><col style={{ width: 84 }} /><col />
                  <col style={{ width: 46 }} />
                  <col style={{ width: 54 }} /><col style={{ width: 54 }} /><col style={{ width: 58 }} />
                  <col style={{ width: 54 }} /><col style={{ width: 54 }} /><col style={{ width: 58 }} />
                  <col style={{ width: 62 }} /><col className="pl-nop" style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr><th rowSpan={2}>Módulo</th><th rowSpan={2}>Código</th><th rowSpan={2}>Descripción</th><th rowSpan={2}>Uds caja</th>
                    <th colSpan={3} className="ol">Operador logístico</th><th colSpan={3} className="bv">Bavaria</th><th rowSpan={2}>Dif.</th><th rowSpan={2} className="pl-nop">Igualar</th></tr>
                  <tr><th className="ol" title="Estibas completas">Estiba</th><th className="ol" title="Cajas sueltas (incluye el saldo de la estiba incompleta)">Caja</th><th className="ol" title="Unidades sueltas: las que no completan una caja">Unidades</th>
                    <th className="bv" title="Estibas completas">Estiba</th><th className="bv" title="Cajas sueltas (incluye el saldo de la estiba incompleta)">Caja</th><th className="bv" title="Unidades sueltas: las que no completan una caja">Unidades</th></tr>
                </thead>
                <tbody>
                  {trozo.map((f, j) => {
                    const i = desde + j;
                    const o = ocup(h, f, i);
                    const cO = cuenta(o.ol, f), cB = cuenta(o.bav, f);
                    const dd = partir((cO?.u ?? 0) - (cB?.u ?? 0), f.upc ?? 1);
                    return (
                      <tr key={i} className={cod && f.sku !== cod ? "pl-oc" : undefined}>
                        <td className="m e"><input value={o.modulo} onChange={(e) => poner(h, i, f, "modulo", null, e.target.value)} aria-label={`Módulo de ${f.sku}`} /></td>
                        <td className="c"><button type="button" className="pl-codb" title={cod === f.sku ? "Quitar el filtro" : "Filtrar por este código"} onClick={() => setCod(cod === f.sku ? "" : f.sku)}>{f.sku}</button></td>
                        <td className="d">{f.material}{f.detalle && <em>{f.detalle}</em>}</td>
                        <td className="r">{f.udsCaja ?? ""}</td>
                        {campo(h, f, i, "ol", "e", "Estibas")}{campo(h, f, i, "ol", "c", "Cajas")}{campo(h, f, i, "ol", "u", "Unidades sueltas")}
                        {campo(h, f, i, "bav", "e", "Estibas")}{campo(h, f, i, "bav", "c", "Cajas")}{campo(h, f, i, "bav", "u", "Unidades sueltas")}
                        <td className={"r t" + (dd.cajas !== 0 || dd.unidades !== 0 ? " mal" : "")}>
                          {dd.cajas !== 0 || dd.unidades !== 0
                            ? <>{dd.cajas !== 0 ? signo(dd.cajas) : ""}{dd.unidades !== 0 && <small className="un">{signo(dd.unidades)} un.</small>}</>
                            : (cO != null && cB != null ? "0" : "")}
                        </td>
                        <td className="pl-nop ig"><button type="button" title="Pasar lo de Bavaria al operador logístico" onClick={() => igualar(h, i, f, false)}>‹</button><button type="button" title="Pasar lo del operador logístico a Bavaria" onClick={() => igualar(h, i, f, true)}>›</button></td>
                      </tr>
                    );
                  })}
                  {mods.map((m, j) => <tr key={`b${j}`} className={cod ? "pl-oc" : undefined}><td className="m">{m}</td>{Array.from({ length: 10 }, (_, c) => <td key={c} />)}<td className="pl-nop" /></tr>)}
                  {Array.from({ length: relleno }, (_, j) => <tr key={`r${j}`} className={cod ? "pl-oc" : undefined}><td className="m" />{Array.from({ length: 10 }, (_, c) => <td key={c} />)}<td className="pl-nop" /></tr>)}
                </tbody>
              </table>
            </div>
            {h.conConteo && ultima && (
              <div className="pl-tot">
                <span>Total de la hoja · cajas y unidades sueltas</span>
                <b>Operador logístico {nf.format(tot.ol)}{tot.uOl > 0 ? ` + ${nf.format(tot.uOl)} un.` : ""}</b><b>Bavaria {nf.format(tot.bav)}{tot.uBav > 0 ? ` + ${nf.format(tot.uBav)} un.` : ""}</b>
                <b className={tot.dc !== 0 || tot.du !== 0 ? "mal" : ""}>Diferencia {tot.dc === 0 && tot.du === 0 ? "0" : [tot.dc !== 0 ? signo(tot.dc) : "", tot.du !== 0 ? `${signo(tot.du)} un.` : ""].filter(Boolean).join(" ")}</b>
              </div>
            )}
            <div className="pl-pie">
              <div className="pl-firma"><span>Responsable OL</span></div>
              <div className="pl-firma"><span>Responsable Bavaria</span></div>
            </div>
            <div className="pl-mini">{nombre} · {fam[h.numero]?.trim() || `Hoja ${h.numero}`} · generada por CONTROL CD38 · {hoy}</div>
          </section>
        );
      }))}
    </div>
  );
}
