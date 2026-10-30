"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* LAS PLANILLAS, EDITABLES SOLO EN LA PLANILLA.
   El fiscal puede cambiar el módulo y las estibas, el saldo y las cajas de cada uno de la pareja; la planilla rehace sola el total de cada
   uno, la diferencia y los totales de la hoja. Esos cambios son SOLO de lo que se imprime: no tocan el conteo ni el inventario real.
   Se guardan en este navegador (por inventario) para que no se pierdan al recargar. */

export type Lado = { estibas: number; saldo: number; cajas: number };
export type FilaP = { modulo: string; sku: string; material: string; udsCaja: number | null; detalle: string; ol: Lado | null; bav: Lado | null };
export type HojaP = {
  numero: number; calle: string; grupo: string; olNombre: string; bavNombre: string; sentidoOl: string; sentidoBav: string;
  filas: FilaP[]; blancos: string[]; conConteo: boolean; np: number;
};
type Campo = "e" | "s" | "c";
type Cant = { e: string; s: string; c: string };
type Aj = { modulo?: string; ol?: Cant; bav?: Cant };

const FILAS = 18;
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const txt = (v: number) => (v ? String(v) : "");
const num = (t: string | undefined) => { const n = Number((t ?? "").replace(/[^\d]/g, "")); return Number.isFinite(n) ? n : 0 };
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const cantDe = (l: Lado | null): Cant | null => (l ? { e: txt(l.estibas), s: txt(l.saldo), c: txt(l.cajas) } : null);
const hay = (c: Cant | null | undefined) => !!c && (c.e !== "" || c.s !== "" || c.c !== "");

export function Planillas({ fiscalId, nombre, fechaTexto, hoy, hojas, todas, soloHoja, aviso }: {
  fiscalId: string; nombre: string; fechaTexto: string; hoy: string;
  hojas: HojaP[]; todas: number[]; soloHoja: number; aviso: string | null;
}) {
  const clave = `planilla-ajustes-${fiscalId}`;
  const [aj, setAj] = useState<Record<string, Aj>>({});
  const [listo, setListo] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try { const t = localStorage.getItem(clave); if (t) setAj(JSON.parse(t) as Record<string, Aj>) } catch { /* sin almacenamiento: sigue sin guardar */ }
    setListo(true);
  }, [clave]);
  useEffect(() => {
    if (!listo) return;
    try { if (Object.keys(aj).length) localStorage.setItem(clave, JSON.stringify(aj)); else localStorage.removeItem(clave) } catch { /* igual */ }
  }, [aj, clave, listo]);

  const k = (h: number, i: number) => `${h}:${i}`;
  const ocup = (h: HojaP, f: FilaP, i: number) => {
    const a = aj[k(h.numero, i)];
    return {
      modulo: a?.modulo ?? f.modulo,
      ol: a?.ol ?? cantDe(f.ol),
      bav: a?.bav ?? cantDe(f.bav),
    };
  };
  const total = (c: Cant | null, uds: number | null) => (hay(c) ? num(c!.e) * (uds ?? 0) + num(c!.s) + num(c!.c) : null);

  function poner(h: HojaP, i: number, f: FilaP, que: "modulo" | "ol" | "bav", campo: Campo | null, valor: string) {
    setAj((x) => {
      const o = ocup(h, f, i);
      const a: Aj = { ...(x[k(h.numero, i)] ?? {}) };
      if (que === "modulo") a.modulo = valor;
      else { const base = o[que] ?? { e: "", s: "", c: "" }; a[que] = { ...base, [campo!]: valor.replace(/[^\d]/g, "") } }
      return { ...x, [k(h.numero, i)]: a };
    });
  }
  function igualar(h: HojaP, i: number, f: FilaP, haciaBav: boolean) {
    setAj((x) => {
      const o = ocup(h, f, i);
      const a: Aj = { ...(x[k(h.numero, i)] ?? {}) };
      if (haciaBav) a.bav = o.ol ? { ...o.ol } : { e: "", s: "", c: "" }; else a.ol = o.bav ? { ...o.bav } : { e: "", s: "", c: "" };
      return { ...x, [k(h.numero, i)]: a };
    });
  }
  const cambios = Object.keys(aj).length;
  const totalPaginas = hojas.reduce((t, h) => t + h.np, 0);
  const campo = (h: HojaP, f: FilaP, i: number, que: "ol" | "bav", c: Campo, etiqueta: string) => (
    <td className="r e"><input inputMode="numeric" aria-label={`${etiqueta} · ${que === "ol" ? "operador logístico" : "Bavaria"} · ${f.sku}`}
      value={ocup(h, f, i)[que]?.[c] ?? ""} onChange={(e) => poner(h, i, f, que, c, e.target.value)} /></td>
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
      <p className="pl-ayuda">Puedes escribir sobre el módulo y sobre estibas, saldo y cajas de cada uno: la planilla rehace sola el total y la diferencia. Con <b>‹</b> o <b>›</b> pasas el conteo de un lado al otro. Los ajustes son solo de esta planilla: el conteo y el inventario real no cambian.</p>
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
          return { ol: t.ol + (total(o.ol, f.udsCaja) ?? 0), bav: t.bav + (total(o.bav, f.udsCaja) ?? 0) };
        }, { ol: 0, bav: 0 });
        return (
          <section key={`${h.numero}-${p}`} className="pl-pg" aria-label={`Planilla hoja ${h.numero}, página ${p + 1} de ${h.np}`}>
            <div className="pl-hd">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/logo-bavaria.png" alt="Bavaria" />
              <div className="pl-tit"><b>PLANILLA DE CONTEO</b><span>Inventario fiscal</span></div>
              <div className="pl-hoja"><small>HOJA</small><b>{h.numero}</b></div>
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
                  <col style={{ width: 46 }} /><col style={{ width: 46 }} /><col style={{ width: 46 }} /><col style={{ width: 54 }} />
                  <col style={{ width: 46 }} /><col style={{ width: 46 }} /><col style={{ width: 46 }} /><col style={{ width: 54 }} />
                  <col style={{ width: 56 }} /><col className="pl-nop" style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr><th rowSpan={2}>Módulo</th><th rowSpan={2}>Código</th><th rowSpan={2}>Descripción</th><th rowSpan={2}>Uds caja</th>
                    <th colSpan={4} className="ol">Operador logístico</th><th colSpan={4} className="bv">Bavaria</th><th rowSpan={2}>Dif.</th><th rowSpan={2} className="pl-nop">Igualar</th></tr>
                  <tr><th className="ol">Est.</th><th className="ol">Saldo</th><th className="ol">Cajas</th><th className="ol">Total</th>
                    <th className="bv">Est.</th><th className="bv">Saldo</th><th className="bv">Cajas</th><th className="bv">Total</th></tr>
                </thead>
                <tbody>
                  {trozo.map((f, j) => {
                    const i = desde + j;
                    const o = ocup(h, f, i);
                    const tO = total(o.ol, f.udsCaja), tB = total(o.bav, f.udsCaja);
                    const d = (tO ?? 0) - (tB ?? 0);
                    return (
                      <tr key={i}>
                        <td className="m e"><input value={o.modulo} onChange={(e) => poner(h, i, f, "modulo", null, e.target.value)} aria-label={`Módulo de ${f.sku}`} /></td>
                        <td className="c">{f.sku}</td>
                        <td className="d">{f.material}{f.detalle && <em>{f.detalle}</em>}</td>
                        <td className="r">{f.udsCaja ?? ""}</td>
                        {campo(h, f, i, "ol", "e", "Estibas")}{campo(h, f, i, "ol", "s", "Saldo")}{campo(h, f, i, "ol", "c", "Cajas")}<td className="r t">{tO == null ? "" : nf.format(tO)}</td>
                        {campo(h, f, i, "bav", "e", "Estibas")}{campo(h, f, i, "bav", "s", "Saldo")}{campo(h, f, i, "bav", "c", "Cajas")}<td className="r t">{tB == null ? "" : nf.format(tB)}</td>
                        <td className={"r t" + (d !== 0 ? " mal" : "")}>{d !== 0 ? signo(d) : (tO != null && tB != null ? "0" : "")}</td>
                        <td className="pl-nop ig"><button type="button" title="Pasar lo de Bavaria al operador logístico" onClick={() => igualar(h, i, f, false)}>‹</button><button type="button" title="Pasar lo del operador logístico a Bavaria" onClick={() => igualar(h, i, f, true)}>›</button></td>
                      </tr>
                    );
                  })}
                  {mods.map((m, j) => <tr key={`b${j}`}><td className="m">{m}</td>{Array.from({ length: 12 }, (_, c) => <td key={c} />)}<td className="pl-nop" /></tr>)}
                  {Array.from({ length: relleno }, (_, j) => <tr key={`r${j}`}><td className="m" />{Array.from({ length: 12 }, (_, c) => <td key={c} />)}<td className="pl-nop" /></tr>)}
                </tbody>
              </table>
            </div>
            {h.conConteo && ultima && (
              <div className="pl-tot">
                <span>Total de la hoja · cajas</span>
                <b>Operador logístico {nf.format(tot.ol)}</b><b>Bavaria {nf.format(tot.bav)}</b>
                <b className={tot.ol - tot.bav !== 0 ? "mal" : ""}>Diferencia {tot.ol - tot.bav === 0 ? "0" : signo(tot.ol - tot.bav)}</b>
              </div>
            )}
            <div className="pl-pie">
              <div className="pl-firma"><span>Responsable OL</span></div>
              <div className="pl-firma"><span>Responsable Bavaria</span></div>
            </div>
            <div className="pl-mini">{nombre} · Hoja {h.numero} · generada por CONTROL CD38 · {hoy}</div>
          </section>
        );
      }))}
    </div>
  );
}
