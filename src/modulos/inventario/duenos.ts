/** A quién pertenece un envase que no es de la casa: se reasigna a ANDINA o HEINEKEN (en el Balance) y su casco viene con ese «código», en estibas. */
export const DUENOS_ENVASE = ["ANDINA", "HEINEKEN"] as const;
export const esDueno = (e: string | null | undefined) => DUENOS_ENVASE.includes(String(e ?? "").trim().toUpperCase() as (typeof DUENOS_ENVASE)[number]);

type Prov = { codigo: string; material: string | null; ubicacion: string; cajas: number; cajas_estiba: number | null; estibas: number | null; un_caja: number | null; unidades: number | null };
export type PendienteSku = {
  codigo: string; material: string | null; un_caja: number | null; cajas_estiba: number | null;
  /** Lo contado de ese SKU reasignado al dueño. */
  cajas: number;
  /** Lo que queda pendiente de baja: la diferencia en estibas del dueño (contado − casco) repartida entre sus SKU de origen, en cajas enteras. */
  cajas_pend: number; unidades: number | null; ubicaciones: string[];
};

/** ANDINA / HEINEKEN no tienen factor: lo pendiente es la diferencia en estibas (contado − casco) llevada a cada SKU de origen con SU factor.
 *  Cada SKU aporta su parte de las estibas contadas (cajas ÷ cajas por estiba); su pendiente son cajas enteras y las unidades salen de ahí.
 *  Excel de «pendiente de baja» y «Traer del balance» de Pasivos usan esta misma cuenta, para que cuadren. */
export function pendientePorSku(f: { fisico_estibas?: number | null; dif_estibas?: number | null; provenientes?: Prov[] }): PendienteSku[] {
  const prov = f.provenientes ?? [];
  const fis = f.fisico_estibas ?? prov.reduce((t, x) => t + (x.estibas ?? 0), 0);
  const dif = f.dif_estibas ?? fis;
  const ratio = fis > 0 ? Math.min(1, Math.max(0, dif / fis)) : 0;
  const por = new Map<string, PendienteSku>();
  for (const x of prov) {
    const a = por.get(x.codigo) ?? { codigo: x.codigo, material: x.material, un_caja: x.un_caja, cajas_estiba: x.cajas_estiba, cajas: 0, cajas_pend: 0, unidades: null, ubicaciones: [] };
    a.cajas += x.cajas; if (!a.ubicaciones.includes(x.ubicacion)) a.ubicaciones.push(x.ubicacion);
    por.set(x.codigo, a);
  }
  for (const a of por.values()) {
    a.cajas_pend = Math.round(a.cajas * ratio);
    a.unidades = a.un_caja ? a.cajas_pend * a.un_caja : null;
  }
  return [...por.values()];
}
