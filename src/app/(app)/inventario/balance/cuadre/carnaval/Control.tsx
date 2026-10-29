"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { hl, redondear, unidades } from "@/modulos/carnaval/logica";

type Fila = { codigo: string; descripcion: string; undPorPallet: number; cc: number; pallets: number };
/* `pallets` que llega es el físico; aquí se le restan los que todavía no tienen entrada de mercancía (no están en SAP). */

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const ent = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/**
 * EL INVENTARIO POR CÓDIGO (como la hoja INVENTARIO del Excel): CÓDIGO · DESCRIPCIÓN · CARNAVAL (pallets) · HL · UNID (por pallet) · TOTAL (unidades).
 * Se puede ver a cualquier día: es la suma de los movimientos hasta ese día.
 */
export function Control({ fecha, hoy, filas, pendientes, faltaSql }: { fecha: string; hoy: string; filas: Fila[]; pendientes: Record<string, number>; faltaSql: boolean }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [soloConSaldo, setSolo] = useState(true);

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
          <thead><tr><th>Código</th><th>Descripción</th><th className="r">Carnaval (pallets)</th><th className="r" title="Pallets que llegaron pero todavía no tienen fecha de ingreso ni entrada de mercancía: no están en SAP y se restan">Sin entrada (EM)</th><th className="r">HL</th><th className="r">Und por pallet</th><th className="r">Total (unidades)</th></tr></thead>
          <tbody>
            {visibles.length === 0 && <tr><td colSpan={7}>No hay saldo en Carnaval a esta fecha.</td></tr>}
            {visibles.map((f) => (
              <tr key={f.codigo} className={f.pallets === 0 ? "cero" : ""}>
                <td><code>{f.codigo}</code></td>
                <td>{f.descripcion}</td>
                <td className={`r ${f.pallets < 0 ? "cv-neg" : ""}`}>{nf.format(f.pallets)}</td>
                <td className="r" title={f.sinEM ? `Físicamente hay ${nf.format(f.fisico)}; ${nf.format(f.sinEM)} no tienen entrada de mercancía` : undefined}>{f.sinEM ? <span className="cv-sinem">−{nf.format(f.sinEM)}</span> : ""}</td>
                <td className="r">{nf.format(f.hl)}</td>
                <td className="r">{ent.format(f.undPorPallet)}</td>
                <td className="r">{ent.format(f.unidades)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2}>TOTAL</td><td className="r">{nf.format(tot.pallets)}</td><td className="r">{tot.sinEM ? `−${nf.format(tot.sinEM)}` : ""}</td><td className="r">{nf.format(tot.hl)}</td><td /><td className="r">{ent.format(tot.unidades)}</td></tr></tfoot>
        </table>
      </div>
      {faltaSql && <p className="cv-msg mal">Falta correr supabase/migraciones/2026-10-carnaval-cuadre-sap.sql en Supabase para saber qué pallets no tienen entrada de mercancía.</p>}
      <p className="cv-nota">Los pallets sin entrada de mercancía (el archivo de Peldar los trae sin fecha de ingreso o sin «Entrada de Mercancía») no están en SAP: se restan aquí y se ven en la columna «Sin entrada». Para que se actualicen, vuelve a subir el archivo de Peldar en Registro.</p>
      <p className="cv-nota">Pallets = lo que suman los movimientos hasta ese día (inicial + ingresos de Peldar − trasiegos ± ajustes). Unidades = pallets × unidades por pallet. HL = unidades × cc ÷ 100.000. Un pallet negativo aparece en rojo: algo salió sin haber entrado.</p>
    </>
  );
}
