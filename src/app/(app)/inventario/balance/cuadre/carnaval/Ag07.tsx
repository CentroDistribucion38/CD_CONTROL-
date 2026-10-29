import "./carnaval.css";
import { misPermisos } from "@/lib/permisos";
import { hoyCO } from "@/modulos/carnaval/logica";
import { faltaTabla, productosYCorte, RUTA_CUADRE, saldosA, SQL_FALTA, ultimosMovimientos } from "@/modulos/carnaval/datos";
import { Hojas } from "./Hojas";
import { Control } from "./Control";
import { Registro } from "./Registro";

/**
 * AG07 · CARNAVAL, DENTRO DEL CUADRE SAP — el envase vacío de Peldar por pallets.
 *   Control:  el inventario por código (pallets, unidades, HL, total), a cualquier día.
 *   Registro: el archivo diario de Peldar (suma), los trasiegos (resta) y los ajustes (±).
 * Mismos permisos que el Cuadre SAP.
 */
export async function Ag07({ sub, fecha: f }: { sub: "registro" | "control"; fecha?: string }) {
  const hoy = hoyCO();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(f ?? "") ? f! : hoy;
  const perm = await misPermisos();
  const pc = await productosYCorte();
  const s = pc.error || sub !== "control" ? null : await saldosA(fecha);
  const mv = pc.error || sub !== "registro" ? null : await ultimosMovimientos();
  const err = pc.error ?? s?.error ?? mv?.error ?? null;
  const error = err ? (faltaTabla(err) ? SQL_FALTA : err) : null;
  const filas = pc.productos.map((p) => ({ codigo: p.codigo, descripcion: p.descripcion, undPorPallet: p.und_por_pallet, cc: p.cc, pallets: s?.saldos.get(p.codigo) ?? 0 }));
  return (
    <div className="fe bal cs">
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · BALANCE · CUADRE SAP</p>
        <h1>Cuadre SAP</h1>
        <p className="sub">AG07 · Carnaval: envase vacío de Peldar por pallets. Control es lo que hay por código; Registro es donde se carga lo que entra y sale.</p>
      </div></section>
      <Hojas activa={sub} />
      {error ? <p className="cv-msg mal">{error}</p>
        : sub === "control" ? <Control fecha={fecha} hoy={hoy} filas={filas} />
        : <Registro productos={pc.productos} corte={pc.corte} hoy={hoy} puedeEditar={perm.puedeEditar(RUTA_CUADRE)} movimientos={mv?.filas ?? []} />}
    </div>
  );
}
