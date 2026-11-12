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
/* UN MOVIMIENTO es lo que se aplicó de una vez: una o varias líneas (un código cada una) con la misma cantidad a los dos lados. Se guarda cuánto se movió en
   cada renglón para poder deshacerlo o editarlo sin tocar el original. */
type UniAj = "estibas" | "cajas" | "unidades";
type LineaAj = { cod: string; op: "quitar" | "sumar"; n: string; uni: UniAj };
type LineaMov = { cod: string; material: string; op: "quitar" | "sumar"; n: number; uni: UniAj; delta: number; filas: { h: number; i: number; du: number }[] };
type Mov = { id: string; ts: number; lineas: LineaMov[] };
const LINEA0 = (cod = ""): LineaAj => ({ cod, op: "quitar", n: "", uni: "cajas" });

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
  /* AJUSTE A AMBOS LADOS: quitar o sumar cantidades a uno o varios códigos, igual al operador logístico y a Bavaria. */
  const [lineas, setLineas] = useState<LineaAj[]>([LINEA0()]);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [ajMsg, setAjMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [ajAbierto, setAjAbierto] = useState(false);
  /* En pantalla ancha las modificaciones van en su columna a la derecha y siempre abiertas; en pantalla angosta siguen siendo el desplegable de arriba. */
  const [ancho, setAncho] = useState(false);
  const [pest, setPest] = useState<"ajustar" | "movs" | "cambios">("ajustar");
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1600px)");
    const al = () => setAncho(mq.matches);
    al(); mq.addEventListener("change", al);
    return () => mq.removeEventListener("change", al);
  }, []);
  /* Ver el conteo ORIGINAL (solo lectura) sin perder los movimientos: siguen guardados. */
  const [verOrig, setVerOrig] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState("");
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
    if (Object.keys(aj).length) setGuardadoEn(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }));
  }, [aj, clave, listo]);
  const claveMov = `planilla-movimientos-${fiscalId}`;
  useEffect(() => {
    try { const t = localStorage.getItem(claveMov); if (t) setMovs(JSON.parse(t) as Mov[]) } catch { /* igual */ }
  }, [claveMov]);
  useEffect(() => {
    if (!listo) return;
    try { if (movs.length) localStorage.setItem(claveMov, JSON.stringify(movs)); else localStorage.removeItem(claveMov) } catch { /* igual */ }
  }, [movs, claveMov, listo]);

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
  const ocupCon = (x: Record<string, Aj>, h: HojaP, f: FilaP, i: number) => {
    const a = x[k(h.numero, i)];
    return { modulo: a?.modulo ?? f.modulo, ol: a?.ol ?? cantDe(f.ol), bav: a?.bav ?? cantDe(f.bav) };
  };
  /* Lo que se ve: con los movimientos y ajustes, o el ORIGINAL si se pidió verlo. */
  const ocup = (h: HojaP, f: FilaP, i: number) => ocupCon(verOrig ? {} : aj, h, f, i);
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
  /* LO PRINCIPAL SON UNIDADES; debajo, lo mismo en cajas (+ sueltas) para leerlo como en la planilla. */
  const cel = (u: number, upc: number, hay: boolean) => {
    if (!hay) return "—";
    const p = partir(u, upc);
    return <><b>{nf.format(u)} un.</b><small className="cj">{textoCantidad(p.cajas, p.unidades)}</small></>;
  };
  const celDif = (u: number, upc: number) => {
    if (u === 0) return <><b>0 un.</b></>;
    const p = partir(u, upc);
    return <><b>{signo(u)} un.</b><small className="cj">{[p.cajas ? `${signo(p.cajas)} cajas` : "", p.unidades ? `${signo(p.unidades)} un.` : ""].filter(Boolean).join(" ")}</small></>;
  };
  /* Un total de unidades exactas vuelve a partirse en estibas + cajas + sueltas, como se escribe en la planilla. */
  const aCant = (u: number, f: FilaP): Cant => {
    if (u <= 0) return { e: "", s: "", c: "0", u: "" };
    const cajas = f.upc ? Math.floor(u / f.upc) : u;
    const sueltas = f.upc ? u % f.upc : 0;
    const e = f.udsCaja ? Math.floor(cajas / f.udsCaja) : 0;
    return { e: txt(e), s: "", c: txt(cajas - e * (f.udsCaja ?? 0)), u: txt(sueltas) };
  };
  const info = useMemo(() => {
    const m = new Map<string, { material: string; upc: number; udsCaja: number | null }>();
    for (const h of hojas) for (const f of h.filas) if (!m.has(f.sku)) m.set(f.sku, { material: f.material, upc: f.upc ?? 1, udsCaja: f.udsCaja });
    return m;
  }, [hojas]);

  /* Los renglones que vuelven a ser iguales al original dejan de contar como ajuste. */
  const limpiar = (x: Record<string, Aj>) => {
    const y: Record<string, Aj> = {};
    for (const [key, a] of Object.entries(x)) {
      const [hn, ii] = key.split(":").map(Number);
      const h = hojas.find((q) => q.numero === hn), f = h?.filas[ii];
      if (!h || !f) { y[key] = a; continue }
      const b: Aj = { ...a };
      if (b.ol && cuenta(b.ol, f)?.u === cuenta(cantDe(f.ol), f)?.u) delete b.ol;
      if (b.bav && cuenta(b.bav, f)?.u === cuenta(cantDe(f.bav), f)?.u) delete b.bav;
      if (b.modulo !== undefined && b.modulo === f.modulo) delete b.modulo;
      if (b.ol || b.bav || b.modulo !== undefined) y[key] = b;
    }
    return y;
  };

  /* QUITAR: se va tomando de los renglones del código en orden (el primero hasta donde alcance, luego el siguiente), lo mismo de cada lado.
     SUMAR: se agrega al primer renglón. Si no alcanza, no se toca nada. */
  const planear = (base: Record<string, Aj>, cod: string, op: "quitar" | "sumar", delta: number): { aj: Record<string, Aj>; filas: { h: number; i: number; du: number }[] } | { error: string } => {
    const filas: { h: HojaP; f: FilaP; i: number; uO: number; uB: number; tO: boolean; tB: boolean }[] = [];
    for (const h of hojas) h.filas.forEach((f, i) => {
      if (f.sku !== cod) return;
      const o = ocupCon(base, h, f, i), a = cuenta(o.ol, f), b = cuenta(o.bav, f);
      filas.push({ h, f, i, uO: a?.u ?? 0, uB: b?.u ?? 0, tO: !!a, tB: !!b });
    });
    if (!filas.length) return { error: `El código ${cod} no está en las hojas que estás viendo.` };
    const sig: Record<string, Aj> = {};
    const mov: { h: number; i: number; du: number }[] = [];
    if (op === "quitar") {
      let falta = delta;
      for (const r of filas) {
        if (falta <= 0) break;
        if (!r.tO || !r.tB) continue;
        const t = Math.min(falta, r.uO, r.uB);
        if (t <= 0) continue;
        const key = k(r.h.numero, r.i);
        sig[key] = { ...(base[key] ?? {}), ol: aCant(r.uO - t, r.f), bav: aCant(r.uB - t, r.f) };
        mov.push({ h: r.h.numero, i: r.i, du: -t });
        falta -= t;
      }
      if (falta > 0) return { error: `${cod}: no alcanza, en los renglones con los dos lados solo hay ${nf.format(delta - falta)} un. para quitar.` };
    } else {
      const r = filas.find((x) => x.tO && x.tB) ?? filas[0];
      const key = k(r.h.numero, r.i);
      sig[key] = { ...(base[key] ?? {}), ol: aCant(r.uO + delta, r.f), bav: aCant(r.uB + delta, r.f) };
      mov.push({ h: r.h.numero, i: r.i, du: delta });
    }
    return { aj: { ...base, ...sig }, filas: mov };
  };

  /* Varias líneas (códigos) a la vez: si una falla, no se aplica ninguna. */
  const aplicarLineas = (base: Record<string, Aj>, ls: LineaAj[]): { aj: Record<string, Aj>; lineas: LineaMov[] } | { error: string } => {
    let cur = base;
    const out: LineaMov[] = [];
    for (const l of ls) {
      const inf = info.get(l.cod);
      if (!l.cod || !inf) return { error: "Escoge el código en cada renglón." };
      const n = num(l.n);
      if (n <= 0) return { error: `${l.cod}: escribe la cantidad (un número mayor que cero).` };
      if (l.uni === "estibas" && !inf.udsCaja) return { error: `${l.cod} no tiene cajas por estiba: usa cajas.` };
      const delta = n * (l.uni === "unidades" ? 1 : l.uni === "cajas" ? inf.upc : inf.upc * (inf.udsCaja ?? 0));
      const r = planear(cur, l.cod, l.op, delta);
      if ("error" in r) return r;
      cur = r.aj;
      out.push({ cod: l.cod, material: inf.material, op: l.op, n, uni: l.uni, delta, filas: r.filas });
    }
    return { aj: cur, lineas: out };
  };

  /* Deshacer un movimiento: se devuelve en cada renglón lo que se movió. */
  const revertir = (base: Record<string, Aj>, mov: Mov) => {
    const x = { ...base };
    for (const l of mov.lineas) for (const fl of l.filas) {
      const h = hojas.find((q) => q.numero === fl.h), f = h?.filas[fl.i];
      if (!h || !f) continue;
      const key = k(fl.h, fl.i), o = ocupCon(x, h, f, fl.i), a = cuenta(o.ol, f), b = cuenta(o.bav, f);
      x[key] = { ...(x[key] ?? {}), ol: aCant(Math.max(0, (a?.u ?? 0) - fl.du), f), bav: aCant(Math.max(0, (b?.u ?? 0) - fl.du), f) };
    }
    return limpiar(x);
  };
  const textoLinea = (l: LineaMov) => `${l.op === "quitar" ? "−" : "+"}${nf.format(l.n)} ${l.uni} · ${l.cod}`;

  function ajustar() {
    const ls = lineas.filter((l) => l.cod || l.n);
    if (!ls.length) { setAjMsg({ ok: false, t: "Escoge un código y escribe la cantidad." }); return }
    const previa = editando ? movs.find((m) => m.id === editando) : undefined;
    const base = previa ? revertir(aj, previa) : aj;
    const r = aplicarLineas(base, ls);
    if ("error" in r) { setAjMsg({ ok: false, t: `${r.error} No cambié nada.` }); return }
    setAj(limpiar(r.aj));
    const nuevo: Mov = { id: previa?.id ?? crypto.randomUUID(), ts: previa?.ts ?? Date.now(), lineas: r.lineas };
    setMovs(previa ? movs.map((m) => (m.id === previa.id ? nuevo : m)) : [...movs, nuevo]);
    setLineas([LINEA0()]); setEditando(null);
    setAjMsg({ ok: true, t: `${previa ? "Guardé los cambios" : "Aplicado a ambos lados"}: ${r.lineas.map(textoLinea).join("  ·  ")}` });
  }
  function deshacer(m: Mov) {
    setAj(revertir(aj, m));
    setMovs(movs.filter((x) => x.id !== m.id));
    if (editando === m.id) { setEditando(null); setLineas([LINEA0()]) }
    setAjMsg({ ok: true, t: `Deshecho: ${m.lineas.map(textoLinea).join("  ·  ")}. Vuelve a como estaba.` });
  }
  function editar(m: Mov) {
    setPest("ajustar");
    setEditando(m.id);
    setLineas(m.lineas.map((l) => ({ cod: l.cod, op: l.op, n: String(l.n), uni: l.uni })));
    setAjAbierto(true); setAjMsg(null);
  }
  const hora = (t: number) => new Date(t).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
  /* Unidades de un código (las dos pareja) con un juego de ajustes dado: para mostrar ORIGINAL, cambios y ACTUAL. */
  const sumaCod = (x: Record<string, Aj>) => {
    let ol = 0, bav = 0;
    for (const h of hojas) h.filas.forEach((f, i) => {
      if (f.sku !== cod) return;
      const o = ocupCon(x, h, f, i);
      ol += cuenta(o.ol, f)?.u ?? 0; bav += cuenta(o.bav, f)?.u ?? 0;
    });
    return { ol, bav };
  };
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
      disabled={c === "u" && !f.upc} readOnly={verOrig} value={valorDe(ocup(h, f, i)[que], c)} onChange={(e) => poner(h, i, f, que, c, e.target.value)} /></td>
  );

  /* LOS CAMBIOS: cada renglón que se tocó, con lo original y lo de ahora en unidades, para verlo sin recorrer la planilla. */
  const cambiosLista = hojas.flatMap((h) => h.filas.flatMap((f, i) => {
    if (!aj[k(h.numero, i)]) return [];
    const a = ocupCon({}, h, f, i), b = ocupCon(aj, h, f, i);
    const ou = (c: Cant | null) => cuenta(c, f)?.u ?? 0;
    const o1 = ou(a.ol), o2 = ou(a.bav), n1 = ou(b.ol), n2 = ou(b.bav);
    if (o1 === n1 && o2 === n2 && a.modulo === b.modulo) return [];
    return [{ id: k(h.numero, i), hoja: h.numero, sku: f.sku, detalle: f.detalle, material: f.material, o1, o2, n1, n2 }];
  }));

  return (
    <div className="pl">
      <div className="pl-barra">
        <div className="pl-barra-t">
          <b>{nombre}</b>
          <span>{fechaTexto} · {hojas.length} {hojas.length === 1 ? "planilla" : "planillas"} · {totalPaginas} {totalPaginas === 1 ? "página" : "páginas"} carta horizontal</span>
        </div>
        <span className="pl-filtro" aria-label="Hojas">
            <Link href={`/inventario/fiscal/planillas?fiscal=${fiscalId}`} className={!soloHoja ? "on" : ""}>Todas</Link>
            {todas.map((n) => <Link key={n} href={`/inventario/fiscal/planillas?fiscal=${fiscalId}&hoja=${n}`} className={soloHoja === n ? "on" : ""}>Hoja {n}</Link>)}
          </span>
        <div className="pl-barra-b">
          <div className="pl-cod" title="Deja solo los renglones de un código y suma lo que contó cada uno">
            <small>Código</small>
            <Selector valor={cod} onCambiar={(v) => { setCod(v); setAjMsg(null); if (v) { setAjAbierto(true); setLineas((ls) => ls.map((l, n) => (n === 0 && !l.cod ? { ...l, cod: v } : l))) } }} vacio="Todos los códigos" ariaLabel="Filtrar por código"
                      opciones={[{ valor: "", etiqueta: "Todos los códigos" }, ...codigos]} />
          </div>
          <div className="pl-ver" role="group" aria-label="Qué planilla ver">
            <button type="button" className={!verOrig ? "on" : ""} onClick={() => setVerOrig(false)} title="La planilla con tus ajustes y movimientos: aquí escribes y editas">Mi planilla{cambios > 0 ? " (modificada)" : ""}</button>
            <button type="button" className={verOrig ? "on" : ""} onClick={() => setVerOrig(true)} title="Lo que contaron los dos, sin ningún cambio tuyo (solo lectura)">Planilla original</button>
          </div>
          {cambios > 0 && <button type="button" className="pl-restablecer" onClick={() => dlg.current?.showModal()}>Quitar mis ajustes ({cambios})</button>}
          <button type="button" className="pl-imprimir" onClick={() => window.print()}>Imprimir o guardar en PDF</button>
        </div>
      </div>
      {verOrig && <p className="pl-orig-ban">Estás viendo el conteo <b>ORIGINAL</b> (solo lectura). Tus movimientos y ajustes siguen guardados: toca «Mi planilla» para volver a ella y editarla.</p>}
      {cambios > 0 && !verOrig && <p className="pl-guard">Guardado en este navegador{guardadoEn ? ` · ${guardadoEn}` : ""}. Puedes cerrar y volver: lo encuentras igual. El conteo original no se toca.</p>}
      <dialog ref={dlg} className="pl-dlg" aria-label="Quitar los ajustes de la planilla">
        <div className="pl-dlg-cab"><p>Planillas · ajustes</p><h2>Quitar mis ajustes</h2></div>
        <div className="pl-dlg-cuerpo">
          <p>Todo vuelve a lo que contaron los dos. Se borran los {cambios} {cambios === 1 ? "renglón ajustado" : "renglones ajustados"} de la planilla; el conteo y el inventario real no cambian.</p>
          <div className="pl-dlg-acc">
            <button type="button" className="pl-dlg-no" onClick={() => dlg.current?.close()}>No, dejarlos</button>
            <button type="button" className="pl-dlg-si" onClick={() => { setAj({}); setMovs([]); setEditando(null); setLineas([LINEA0()]); setVerOrig(false); dlg.current?.close() }}>Sí, quitar mis ajustes</button>
          </div>
        </div>
      </dialog>
      <div className="pl-cuerpo">
        <aside className="pl-der" aria-label="Modificaciones de la planilla" data-tab={pest}>
          <div className="pl-tabs" role="tablist" aria-label="Modificaciones">
            <button type="button" role="tab" aria-selected={pest === "ajustar"} className={pest === "ajustar" ? "on" : ""} onClick={() => setPest("ajustar")}>Ajustar</button>
            <button type="button" role="tab" aria-selected={pest === "movs"} className={pest === "movs" ? "on" : ""} onClick={() => setPest("movs")}>Movimientos{movs.length > 0 && <i>{movs.length}</i>}</button>
            <button type="button" role="tab" aria-selected={pest === "cambios"} className={pest === "cambios" ? "on" : ""} onClick={() => setPest("cambios")}>Cambios{cambiosLista.length > 0 && <i>{cambiosLista.length}</i>}</button>
          </div>
        <details className="pl-ajs" open={ancho || ajAbierto} onToggle={(e) => setAjAbierto((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Modificaciones · ajustar a ambos lados{movs.length > 0 && <em>{movs.length} {movs.length === 1 ? "movimiento" : "movimientos"}</em>}</summary>
          <div className="pl-pane p-aj">
          <form className="pl-aj" onSubmit={(e) => { e.preventDefault(); if (!verOrig) ajustar() }}>
            <p className="pl-aj-n">La misma cantidad al operador logístico y a Bavaria: la diferencia no cambia. Agrega todos los códigos que necesites y se aplican juntos.</p>
            {verOrig && <p className="pl-aj-m mal">Estás viendo el original: vuelve a «Mi planilla» para ajustar.</p>}
            {editando && <p className="pl-aj-ed">Editando un movimiento. Cambia lo que necesites y toca «Guardar cambios».</p>}
            {lineas.map((l, n) => {
              const inf = info.get(l.cod);
              const cambia = (c: Partial<LineaAj>) => setLineas((ls) => ls.map((x, j) => (j === n ? { ...x, ...c } : x)));
              return (
                <div className="pl-aj-c" key={n}>
                  <Selector valor={l.cod} vacio="Código…" className="pl-aj-cod" ariaLabel="Código a ajustar"
                            onCambiar={(v) => cambia({ cod: v, uni: l.uni === "estibas" && !info.get(v)?.udsCaja ? "cajas" : l.uni })}
                            opciones={codigos} />
                  <div className="pl-seg" role="group" aria-label="Quitar o sumar">
                    <button type="button" className={l.op === "quitar" ? "on" : ""} onClick={() => cambia({ op: "quitar" })}>Quitar</button>
                    <button type="button" className={l.op === "sumar" ? "on" : ""} onClick={() => cambia({ op: "sumar" })}>Sumar</button>
                  </div>
                  <input inputMode="numeric" value={l.n} placeholder="Cantidad" aria-label="Cantidad a ajustar"
                         onChange={(e) => cambia({ n: e.target.value.replace(/[^\d]/g, "") })} />
                  <Selector valor={l.uni} onCambiar={(v) => cambia({ uni: v as UniAj })} className="pl-aj-u"
                            opciones={[
                              ...(!inf || inf.udsCaja ? [{ valor: "estibas", etiqueta: "estibas" }] : []),
                              { valor: "cajas", etiqueta: "cajas" },
                              ...(!inf || inf.upc > 1 ? [{ valor: "unidades", etiqueta: "unidades" }] : []),
                            ]} />
                  {inf && <span className="pl-aj-i">{inf.material}</span>}
                  {lineas.length > 1 && <button type="button" className="pl-aj-x" aria-label="Quitar este renglón" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== n))}>×</button>}
                </div>
              );
            })}
            <div className="pl-aj-pie">
              <button type="button" className="pl-aj-mas" onClick={() => setLineas((ls) => [...ls, LINEA0()])}>+ Agregar código</button>
              <button type="submit" className="pl-aj-ok" disabled={verOrig}>{editando ? "Guardar cambios" : `Aplicar a ambos lados${lineas.length > 1 ? ` (${lineas.length} códigos)` : ""}`}</button>
              {editando && <button type="button" className="pl-aj-des" onClick={() => { setEditando(null); setLineas([LINEA0()]) }}>Cancelar edición</button>}
            </div>
            {ajMsg && <p className={"pl-aj-m" + (ajMsg.ok ? "" : " mal")} role="status">{ajMsg.t}</p>}
          </form>
          </div>
          <div className="pl-pane p-mv">
          <div className="pl-movs">
            <small>MOVIMIENTOS</small>
            {movs.length === 0 && <p>Todavía no hay movimientos. Lo que apliques queda aquí: puedes editarlo o deshacerlo cuando quieras, y el original siempre se puede ver.</p>}
            {movs.map((m, n) => (
              <div key={m.id} className={"pl-mov" + (editando === m.id ? " ed" : "")}>
                <b>{n + 1}</b>
                <div>
                  <span>{hora(m.ts)}</span>
                  {m.lineas.map((l, j) => <p key={j}>{textoLinea(l)} <em>({nf.format(l.delta)} un. a cada lado · {l.material})</em></p>)}
                </div>
                <button type="button" disabled={verOrig} onClick={() => editar(m)}>Editar</button>
                <button type="button" disabled={verOrig} onClick={() => deshacer(m)}>Deshacer</button>
              </div>
            ))}
          </div>
          </div>
          <div className="pl-pane p-cb">
            <div className="pl-movs">
              <small>CAMBIOS · ORIGINAL CONTRA MI PLANILLA (unidades)</small>
              {cambiosLista.length === 0 && <p>Todavía no hay renglones cambiados. Lo que ajustes o escribas en la planilla aparece aquí, y en la planilla queda resaltado.</p>}
              {cambiosLista.length > 0 && (
                <table className="pl-cmb">
                  <thead><tr><th>Código</th><th>Original<br />OL / Bav</th><th>Mi planilla<br />OL / Bav</th><th>Dif.</th></tr></thead>
                  <tbody>
                    {cambiosLista.map((c) => (
                      <tr key={c.id}>
                        <td><b>{c.sku}</b><small>Hoja {c.hoja} · {c.detalle || c.material}</small></td>
                        <td>{nf.format(c.o1)} / {nf.format(c.o2)}</td>
                        <td><b>{nf.format(c.n1)} / {nf.format(c.n2)}</b></td>
                        <td className="mal">{c.n1 - c.o1 === c.n2 - c.o2 ? signo(c.n1 - c.o1) : `${signo(c.n1 - c.o1)} / ${signo(c.n2 - c.o2)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </details>
          <details className="pl-ayuda-d"><summary>Cómo se usa</summary>
            <p className="pl-ayuda">Puedes escribir sobre el módulo y sobre estiba, caja y unidades de cada uno: la planilla rehace sola la diferencia y los totales de la hoja. Con <b>‹</b> o <b>›</b> pasas el conteo de un lado al otro. En el recuadro rojo puedes escribir el nombre de la familia en vez del número de hoja. Los ajustes son solo de esta planilla: el conteo y el inventario real no cambian.</p>
          </details>
        </aside>
        <div className="pl-izq">
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
                      <td className="n">{cel(uOl, sub.upc, hayOl)}</td>
                      <td className="n">{cel(uBav, sub.upc, hayBav)}</td>
                      <td className={"n" + (d !== 0 ? " mal" : "")}>{hayOl && hayBav ? celDif(d, sub.upc) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td><td className="n">{sub.t.r}</td>
                  <td className="n">{cel(sub.t.ol, sub.upc, true)}</td><td className="n">{cel(sub.t.bav, sub.upc, true)}</td>
                  <td className={"n" + (sub.t.ol !== sub.t.bav ? " mal" : "")}>{celDif(sub.t.ol - sub.t.bav, sub.upc)}</td>
                </tr>
              </tfoot>
            </table>
            {(() => {
              const o = sumaCod({}), c = sumaCod(aj);
              return (
                <table className="pl-orig">
                  <thead><tr><th>Este código, en total</th><th className="n ol">Operador logístico</th><th className="n bv">Bavaria</th></tr></thead>
                  <tbody>
                    <tr><td>Original (lo que contaron)</td><td className="n">{cel(o.ol, sub.upc, true)}</td><td className="n">{cel(o.bav, sub.upc, true)}</td></tr>
                    <tr><td>Cambios (movimientos y ediciones)</td><td className="n">{celDif(c.ol - o.ol, sub.upc)}</td><td className="n">{celDif(c.bav - o.bav, sub.upc)}</td></tr>
                    <tr className="act"><td>Actual</td><td className="n">{cel(c.ol, sub.upc, true)}</td><td className="n">{cel(c.bav, sub.upc, true)}</td></tr>
                  </tbody>
                </table>
              );
            })()}
            <p>Salen solo los renglones de este código; los ajustes que escribas se suman al momento. Para imprimir, la planilla sale completa.{soloHoja ? " Estás viendo una sola hoja: para comparar entre hojas, escoge «Todas»." : ""}</p>
          </section>
        )}
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
            return { uT_ol: t.uT_ol + (a?.u ?? 0), uT_bav: t.uT_bav + (b?.u ?? 0), ol: t.ol + (a?.cajas ?? 0), bav: t.bav + (b?.cajas ?? 0), uOl: t.uOl + (a?.sueltas ?? 0), uBav: t.uBav + (b?.sueltas ?? 0),
                     dc: t.dc + partir((a?.u ?? 0) - (b?.u ?? 0), f.upc ?? 1).cajas, du: t.du + partir((a?.u ?? 0) - (b?.u ?? 0), f.upc ?? 1).unidades };
          }, { uT_ol: 0, uT_bav: 0, ol: 0, bav: 0, uOl: 0, uBav: 0, dc: 0, du: 0 });
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
                        <tr key={i} className={(cod && f.sku !== cod ? "pl-oc" : "") + (!verOrig && aj[k(h.numero, i)] ? " pl-mod" : "") || undefined}>
                          <td className="m e"><input readOnly={verOrig} value={o.modulo} onChange={(e) => poner(h, i, f, "modulo", null, e.target.value)} aria-label={`Módulo de ${f.sku}`} /></td>
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
                          <td className="pl-nop ig"><button type="button" disabled={verOrig} title="Pasar lo de Bavaria al operador logístico" onClick={() => igualar(h, i, f, false)}>‹</button><button type="button" disabled={verOrig} title="Pasar lo del operador logístico a Bavaria" onClick={() => igualar(h, i, f, true)}>›</button></td>
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
                  <span>Total de la hoja · unidades (y cajas)</span>
                  <b>Operador logístico {nf.format(tot.uT_ol)} un.<i> · {nf.format(tot.ol)} cajas{tot.uOl > 0 ? ` + ${nf.format(tot.uOl)} un.` : ""}</i></b>
                  <b>Bavaria {nf.format(tot.uT_bav)} un.<i> · {nf.format(tot.bav)} cajas{tot.uBav > 0 ? ` + ${nf.format(tot.uBav)} un.` : ""}</i></b>
                  <b className={tot.uT_ol !== tot.uT_bav ? "mal" : ""}>Diferencia {tot.uT_ol === tot.uT_bav ? "0 un." : `${signo(tot.uT_ol - tot.uT_bav)} un.`}</b>
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
      </div>
    </div>
  );
}
