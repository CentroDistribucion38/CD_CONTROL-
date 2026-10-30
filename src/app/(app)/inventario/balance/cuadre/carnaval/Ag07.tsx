import "./carnaval.css";
import { misPermisos } from "@/lib/permisos";
import { cuadreInventario07, cuadrePallets07, hoyCO } from "@/modulos/carnaval/logica";
import { balanceoGuardadoAg07, contextoAuto, diasConInventario, factoresSku, faltaTabla, hojaBase, maestroSku, inventarioDe, partidasCarnaval, pendientesEM, productosYCorte, RUTA_CUADRE, saldosA, SQL_FALTA, ultimosMovimientos, zexiAg07 } from "@/modulos/carnaval/datos";
import { Hojas } from "./Hojas";
import { Control } from "./Control";
import { Registro } from "./Registro";
import { Inventario } from "./Inventario";
import { CuadreAg07 } from "./CuadreAg07";

/**
 * AG07 · CARNAVAL, DENTRO DEL CUADRE SAP — el envase vacío de Peldar por pallets.
 *   Control:  el inventario por código (pallets, unidades, HL, total), a cualquier día.
 *   Registro: el archivo diario de Peldar (suma), los trasiegos (resta) y los ajustes (±).
 *   Inventario: la hoja de existencias del día, viva (pallets y casco se traen solos; lo demás se actualiza a mano).
 * Mismos permisos que el Cuadre SAP.
 */
export async function Ag07({ sub, fecha: f, guardado: verGuardado = false }: { sub: "registro" | "control" | "inventario" | "cuadre"; fecha?: string; guardado?: boolean }) {
  const hoy = hoyCO();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(f ?? "") ? f! : hoy;
  const perm = await misPermisos();
  const pc = await productosYCorte();
  const s = pc.error ? null : await saldosA(sub === "control" || sub === "cuadre" ? fecha : hoy);
  const em = pc.error || (sub !== "control" && sub !== "cuadre") ? null : await pendientesEM(fecha);
  const zx = pc.error || sub !== "cuadre" ? null : await zexiAg07(fecha);
  const mv = pc.error || sub !== "registro" ? null : await ultimosMovimientos();
  const inv = pc.error || (sub !== "inventario" && sub !== "cuadre") ? null : await inventarioDe(fecha);
  const dias = pc.error || sub !== "inventario" ? [] : await diasConInventario();
  const base = pc.error || (sub !== "inventario" && sub !== "cuadre") || inv?.fila ? null : await hojaBase(fecha);
  const pt = pc.error || sub !== "cuadre" ? null : await partidasCarnaval(fecha);
  const gb = pc.error || sub !== "cuadre" ? null : await balanceoGuardadoAg07(fecha);
  const fac = pc.error || sub !== "cuadre" ? null : await factoresSku();
  const maestro = pc.error || (sub !== "inventario" && sub !== "cuadre") ? [] : await maestroSku();
  const auto = pc.error || sub !== "inventario" ? null : await contextoAuto(fecha);
  const err = pc.error ?? s?.error ?? mv?.error ?? inv?.error ?? auto?.error ?? em?.error ?? (zx?.error && !/carnaval_zexi|schema cache|does not exist/i.test(zx.error) ? zx.error : null) ?? null;
  const error = err ? (faltaTabla(err) ? SQL_FALTA : err) : null;
  const filas = pc.productos.map((p) => ({ codigo: p.codigo, descripcion: p.descripcion, undPorPallet: p.und_por_pallet, cc: p.cc, pallets: s?.saldos.get(p.codigo) ?? 0 }));
  return (
    <div className="fe bal cs">
      <section className="cabeza"><div>
        <p className="ojo">INVENTARIO · BALANCE · CUADRE SAP</p>
        <h1>Cuadre SAP</h1>
        <p className="sub">AG07 · Carnaval: envase vacío de Peldar por pallets. Registro es donde se carga lo que entra y sale; Control es lo que hay por código; Inventario es la hoja de existencias del día; Cuadre SAP AG07 lo compara con SAP.</p>
      </div></section>
      <Hojas activa={sub} />
      {error ? <p className="cv-msg mal">{error}</p>
        : sub === "inventario" && auto ? <Inventario key={`${fecha}-${inv?.fila?.actualizado_en ?? "nuevo"}`} fecha={fecha} hoy={hoy} guardado={inv?.fila ?? null} base={base} dias={dias} puedeEditar={perm.puedeEditar(RUTA_CUADRE)} maestro={maestro} ctx={auto.ctx} />
        : sub === "cuadre" && verGuardado && gb?.snap ? <CuadreAg07 key="congelado" fecha={fecha} hoy={hoy} puedeEditar={false} congelado={{ en: gb.en, nombre: gb.nombre }} zexi={gb.snap.zexi} faltaSql={false}
            filas={gb.snap.filas1} hojaDe={gb.snap.hojaDe} hojaGuardada={gb.snap.hojaGuardada} inventario={gb.snap.filas2}
            guardado={{ en: gb.en, nombre: gb.nombre }} partidas={gb.snap.partidas} faltaSqlPartidas={false} codigos={[]} />
        : sub === "cuadre" ? <CuadreAg07 fecha={fecha} hoy={hoy} puedeEditar={perm.puedeEditar(RUTA_CUADRE)} zexi={zx?.zexi ? { archivo: zx.zexi.archivo, actualizado_en: zx.zexi.actualizado_en } : null} faltaSql={!!em?.faltaSql}
            filas={cuadrePallets07(pc.productos, s?.saldos ?? new Map(), em?.pendientes ?? new Map(), zx?.zexi?.filas ?? [], pt?.partidas ?? [])}
            hojaDe={inv?.fila ? inv.fila.fecha : base ? base.fecha : null} hojaGuardada={!!inv?.fila}
            inventario={(inv?.fila || base) && zx?.zexi ? cuadreInventario07((inv?.fila?.secciones ?? base!.secciones), zx.zexi.filas, fac?.factores ?? new Map(), new Map(maestro.map((m) => [m.codigo, m.descripcion])), pt?.partidas ?? []) : []}
            guardado={gb} partidas={pt?.partidas ?? []} faltaSqlPartidas={!!pt?.faltaSql} codigos={maestro} />
        : sub === "control" ? <Control fecha={fecha} hoy={hoy} filas={filas} pendientes={Object.fromEntries(em?.pendientes ?? [])} faltaSql={!!em?.faltaSql} />
        : <Registro productos={pc.productos} corte={pc.corte} hoy={hoy} puedeEditar={perm.puedeEditar(RUTA_CUADRE)} movimientos={mv?.filas ?? []} saldos={Object.fromEntries(s?.saldos ?? [])} />}
    </div>
  );
}
