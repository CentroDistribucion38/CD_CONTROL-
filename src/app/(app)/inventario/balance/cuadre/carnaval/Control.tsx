"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { hl, redondear, unidades } from "@/modulos/carnaval/logica";
import { useAvisos } from "@/components/Aviso";
import { movimientoSuperadmin } from "./actions";

type Fila = { codigo: string; descripcion: string; undPorPallet: number; cc: number; pallets: number };
/* `pallets` que llega es el físico; aquí se le restan los que todavía no tienen entrada de mercancía (no están en SAP). */

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const ent = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/**
 * EL INVENTARIO POR CÓDIGO (como la hoja INVENTARIO del Excel): CÓDIGO · DESCRIPCIÓN · CARNAVAL (pallets) · HL · UNID (por pallet) · TOTAL (unidades).
 * Se puede ver a cualquier día: es la suma de los movimientos hasta ese día.
 */
export function Control({ fecha, hoy, filas, pendientes, faltaSql, superadmin = false }: { fecha: string; hoy: string; filas: Fila[]; pendientes: Record<string, number>; faltaSql: boolean; superadmin?: boolean }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [soloConSaldo, setSolo] = useState(true);
  /* Solo el superadministrador: «+ Código o cantidad» arriba y «±» en cada código. */
  const [mover, setMover] = useState<string | null>(null);

  const calc = useMemo(() => filas.map((f) => {
    const sinEM = redondear(pendientes[f.codigo] ?? 0), fisico = f.pallets, pallets = redondear(fisico - sinEM);
    return { ...f, fisico, sinEM, pallets, unidades: unidades(pallets, f.undPorPallet), hl: hl(pallets, f.undPorPallet, f.cc) };
  }), [filas, pendientes]);
  const visibles = calc.filter((f) => !soloConSaldo || f.pallets !== 0 || f.sinEM !== 0);
  const tot = calc.reduce((t, f) => ({ pallets: t.pallets + f.pallets, unidades: t.unidades + f.unidades, hl: t.hl + f.hl, sinEM: t.sinEM + f.sinEM }), { pallets: 0, unidades: 0, hl: 0, sinEM: 0 });

  async function excel() {
    const XLSX = await import("xlsx");
    const datos = [
      ["CODIGO", "DESCRIPCIÓN", "CARNAVAL (PALLETS)", "SIN ENTRADA DE MERCANCÍA", "HL", "UNID POR PALLET", "TOTAL UNIDADES"],
      ...calc.filter((f) => f.pallets !== 0 || f.sinEM !== 0).map((f) => [Number(f.codigo) || f.codigo, f.descripcion, f.pallets, f.sinEM, redondear(f.hl, 4), f.undPorPallet, f.unidades]),
      [null, "TOTAL", tot.pallets, tot.sinEM, redondear(tot.hl, 4), null, tot.unidades],
    ];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(datos), "AG07 Carnaval");
    XLSX.writeFile(libro, `AG07_Carnaval_${fecha}.xlsx`);
  }

  return (
    <>
      <div className="cv-barra">
        <label>Inventario al día
          <input type="date" className="cv-fecha" value={fecha} max={hoy} disabled={pend}
                 onChange={(e) => e.target.value && start(() => router.push(`/inventario/balance/cuadre?alm=AG07&sub=control&fecha=${e.target.value}`))} />
        </label>
        {fecha !== hoy && <button type="button" className="cs-bt alt" onClick={() => start(() => router.push("/inventario/balance/cuadre?alm=AG07&sub=control"))}>Volver a hoy</button>}
        <label><input type="checkbox" checked={soloConSaldo} onChange={(e) => setSolo(e.target.checked)} /> Ocultar códigos en cero</label>
        <span className="grow" />
        {superadmin && <button type="button" className="cs-bt alt" onClick={() => setMover("")} title="Solo superadministrador">+ Código o cantidad</button>}
        <button type="button" className="cs-bt" onClick={excel}>Descargar Excel</button>
      </div>

      <div className="cv-cifras">
        <div className="cv-cif"><span>Pallets</span><b>{nf.format(tot.pallets)}</b></div>
        <div className="cv-cif"><span>Unidades</span><b>{ent.format(tot.unidades)}</b></div>
        <div className="cv-cif"><span>HL</span><b>{nf.format(tot.hl)}</b></div>
        <div className="cv-cif"><span>Sin entrada de mercancía</span><b>{nf.format(tot.sinEM)}</b></div>
        <div className="cv-cif"><span>Códigos con saldo</span><b>{calc.filter((f) => f.pallets !== 0).length}</b></div>
      </div>

      <div className="cv-tabla-cont">
        <table className="cv-tabla">
          <thead><tr><th>Código</th><th>Descripción</th><th className="r">Carnaval (pallets)</th><th className="r" title="Pallets que llegaron pero todavía no tienen fecha de ingreso ni entrada de mercancía: no están en SAP y se restan">Sin entrada (EM)</th><th className="r">HL</th><th className="r">Und por pallet</th><th className="r">Total (unidades)</th>{superadmin && <th />}</tr></thead>
          <tbody>
            {visibles.length === 0 && <tr><td colSpan={superadmin ? 8 : 7}>No hay saldo en Carnaval a esta fecha.</td></tr>}
            {visibles.map((f) => (
              <tr key={f.codigo} className={f.pallets === 0 ? "cero" : ""}>
                <td><code>{f.codigo}</code></td>
                <td>{f.descripcion}</td>
                <td className={`r ${f.pallets < 0 ? "cv-neg" : ""}`}>{nf.format(f.pallets)}</td>
                <td className="r" title={f.sinEM ? `Físicamente hay ${nf.format(f.fisico)}; ${nf.format(f.sinEM)} no tienen entrada de mercancía` : undefined}>{f.sinEM ? <span className="cv-sinem">−{nf.format(f.sinEM)}</span> : ""}</td>
                <td className="r">{nf.format(f.hl)}</td>
                <td className="r">{ent.format(f.undPorPallet)}</td>
                <td className="r">{ent.format(f.unidades)}</td>
                {superadmin && <td className="r"><button type="button" className="cv-mas" onClick={() => setMover(f.codigo)} title={`Sumar o restar pallets a ${f.codigo}`} aria-label={`Sumar o restar pallets a ${f.codigo}`}>±</button></td>}
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2}>TOTAL</td><td className="r">{nf.format(tot.pallets)}</td><td className="r">{tot.sinEM ? `−${nf.format(tot.sinEM)}` : ""}</td><td className="r">{nf.format(tot.hl)}</td><td /><td className="r">{ent.format(tot.unidades)}</td>{superadmin && <td />}</tr></tfoot>
        </table>
      </div>
      {mover !== null && <MovimientoSuper codigo={mover} fecha={fecha} hoy={hoy} filas={calc} cerrar={() => setMover(null)} />}
      {faltaSql && <p className="cv-msg mal">Falta correr supabase/migraciones/2026-10-carnaval-cuadre-sap.sql en Supabase para saber qué pallets no tienen entrada de mercancía.</p>}
      <p className="cv-nota">Los pallets sin entrada de mercancía (el archivo de Peldar los trae sin fecha de ingreso o sin «Entrada de Mercancía») no están en SAP: se restan aquí y se ven en la columna «Sin entrada». Para que se actualicen, vuelve a subir el archivo de Peldar en Registro.</p>
      <p className="cv-nota">Pallets = lo que suman los movimientos hasta ese día (inicial + ingresos de Peldar − trasiegos ± ajustes). Unidades = pallets × unidades por pallet. HL = unidades × cc ÷ 100.000. Un pallet negativo aparece en rojo: algo salió sin haber entrado.</p>
    </>
  );
}

/**
 * SUPERADMINISTRADOR · agregar un código o una cantidad. Se escoge el código (o «Código nuevo»: código, descripción,
 * unidades por pallet y cc), si se suman o se restan pallets, cuántos, el día y por qué. Queda como AJUSTE en Registro.
 */
function MovimientoSuper({ codigo, fecha, hoy, filas, cerrar }: {
  codigo: string; fecha: string; hoy: string; filas: (Fila & { pallets: number })[]; cerrar: () => void;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [pend, start] = useTransition();
  const [cod, setCod] = useState(codigo || "");
  const [esNuevo, setEsNuevo] = useState(false);
  const [nuevo, setNuevo] = useState({ codigo: "", descripcion: "", und: "", cc: "" });
  const [signo, setSigno] = useState<1 | -1>(1);
  const [pal, setPal] = useState("");
  const [dia, setDia] = useState(fecha);
  const [nota, setNota] = useState("");
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [cerrar]);
  const aNum = (t: string) => Number(t.replace(/\s/g, "").replace(",", "."));
  const codigoFinal = esNuevo ? nuevo.codigo.trim() : cod;
  const yaExiste = esNuevo && filas.find((f) => f.codigo === nuevo.codigo.trim());
  const f = esNuevo ? null : filas.find((x) => x.codigo === cod);
  const undPP = esNuevo ? aNum(nuevo.und) : f?.undPorPallet ?? 0;
  const cc = esNuevo ? aNum(nuevo.cc) : f?.cc ?? 0;
  const n = aNum(pal), mov = Number.isFinite(n) ? signo * Math.abs(n) : NaN;
  const antes = f?.pallets ?? 0, despues = redondear(antes + (Number.isFinite(mov) ? mov : 0));
  const falta = !codigoFinal ? "Escoge el código." : yaExiste ? `El ${nuevo.codigo.trim()} ya existe: escógelo en la lista.`
    : esNuevo && !nuevo.descripcion.trim() ? "Escribe la descripción." : esNuevo && !(undPP > 0) ? "Escribe las unidades por pallet."
    : esNuevo && !(cc > 0) ? "Escribe el cc." : !(Math.abs(n) > 0) ? "Escribe los pallets." : despues < 0 ? `No alcanza: hay ${nf.format(antes)} pallets.`
    : nota.trim().length < 3 ? "Escribe por qué." : null;
  const guardar = () => start(async () => {
    const r = await movimientoSuperadmin({ fecha: dia, codigo: codigoFinal, pallets: mov, nota,
      nuevo: esNuevo ? { descripcion: nuevo.descripcion, und_por_pallet: undPP, cc } : null });
    if (r.error) { avisar.mal(r.error); return }
    avisar.bien(`${r.creado ? `Código ${codigoFinal} creado y ` : ""}${mov > 0 ? "sumados" : "restados"} ${nf.format(Math.abs(mov))} pallets.`);
    router.refresh(); cerrar();
  });
  return (
    <div className="cf-velo" role="dialog" aria-modal="true" aria-labelledby="cv-su-t" onClick={(e) => { if (e.target === e.currentTarget) cerrar() }}>
      {avisos}
      <div className="cf-caja cv-su">
        <h2 id="cv-su-t">Agregar código o cantidad <small>superadministrador</small></h2>
        <label className="cv-su-c"><span>Código</span>
          <select value={esNuevo ? "__nuevo" : cod} onChange={(e) => { if (e.target.value === "__nuevo") setEsNuevo(true); else { setEsNuevo(false); setCod(e.target.value) } }} autoFocus={!codigo}>
            <option value="">— escoge —</option>
            {filas.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.descripcion} ({nf.format(x.pallets)} pallets)</option>)}
            <option value="__nuevo">＋ Código nuevo (no está en la lista)…</option>
          </select>
        </label>
        {esNuevo && (
          <div className="cv-su-g">
            <label><span>Código</span><input value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })} placeholder="412671" inputMode="numeric" autoFocus /></label>
            <label className="ancho"><span>Descripción</span><input value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} placeholder="Envase …" /></label>
            <label><span>Unidades por pallet</span><input value={nuevo.und} onChange={(e) => setNuevo({ ...nuevo, und: e.target.value })} inputMode="numeric" placeholder="4.347" /></label>
            <label><span>cc (ml)</span><input value={nuevo.cc} onChange={(e) => setNuevo({ ...nuevo, cc: e.target.value })} inputMode="numeric" placeholder="330" /></label>
          </div>
        )}
        <div className="cv-su-g">
          <div className="ancho cv-su-seg" role="group" aria-label="Sumar o restar">
            <button type="button" aria-pressed={signo === 1} onClick={() => setSigno(1)}>+ Sumar pallets</button>
            <button type="button" aria-pressed={signo === -1} onClick={() => setSigno(-1)}>− Restar pallets</button>
          </div>
          <label><span>Pallets</span><input value={pal} onChange={(e) => setPal(e.target.value)} inputMode="decimal" placeholder="0" autoFocus={!!codigo} /></label>
          <label><span>Día del movimiento</span><input type="date" value={dia} max={hoy} onChange={(e) => setDia(e.target.value)} /></label>
          <label className="ancho"><span>Por qué</span><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: código que faltaba en el maestro; conteo físico" /></label>
        </div>
        {codigoFinal && Math.abs(n) > 0 && (
          <p className="cv-su-prev">
            <b>{codigoFinal}</b>: {nf.format(antes)} → <b>{nf.format(despues)}</b> pallets
            {undPP > 0 && <> · {ent.format(unidades(despues, undPP))} unidades</>}{undPP > 0 && cc > 0 && <> · {nf.format(hl(despues, undPP, cc))} HL</>}
            <small> desde el {dia.split("-").reverse().join("/")} · queda como AJUSTE en Registro</small>
          </p>
        )}
        <div className="cf-botones">
          <button type="button" className="cf-btn plano" onClick={cerrar}>Cancelar</button>
          <button type="button" className="cf-btn" disabled={pend || !!falta} title={falta ?? undefined} onClick={guardar}>{pend ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
