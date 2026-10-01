/* LA FICHA DE TOTALES DEL BORRADOR.
 *
 * Para comparar un conteo contra otro (o contra el sistema) lo primero que se
 * mira es el gran total: cuántas estibas hay en general, cuántas cajas y
 * cuántas unidades. Aquí se calcula, sin pantalla.
 *
 *   cajas    = suma de total_cajas (lo que ya trae cada renglón).
 *   estibas  = cajas ÷ cajas por estiba, renglón por renglón (con decimales:
 *              «33,3 estibas»). Se usa el factor del renglón y, si no trae, el
 *              del material. Sin factor no hay cómo convertir: ese renglón no
 *              suma estibas y se cuenta en `sinFactor` para que la pantalla lo diga.
 *   unidades = cajas × unidades por caja del material. Sin ese dato, el renglón
 *              no suma unidades y se cuenta en `sinUnidades`.
 *
 * Producto y envase se separan: sumar cajas de cerveza con cascos vacíos en un
 * solo número no se parece a nada que haya en el piso.
 */
export type RenglonTotal = {
  codigo: string;
  tipo_material: "PRODUCTO" | "ENVASE";
  total_cajas: number | string;
  factor_estibado: number | string | null;
};
export type MaterialTotal = { sku: string; unidades_por_caja: number | null; cajas_por_estiba: number | null };

export type Totales = {
  renglones: number; cajas: number; estibas: number; unidades: number;
  sinFactor: number; sinUnidades: number;
};
export type FichaTotales = { general: Totales; producto: Totales; envase: Totales };

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const vacio = (): Totales => ({ renglones: 0, cajas: 0, estibas: 0, unidades: 0, sinFactor: 0, sinUnidades: 0 });

export function totalesDelConteo(renglones: RenglonTotal[], materiales: MaterialTotal[]): FichaTotales {
  const porSku = new Map(materiales.map((m) => [m.sku, m]));
  const f: FichaTotales = { general: vacio(), producto: vacio(), envase: vacio() };
  for (const r of renglones) {
    const mat = porSku.get(r.codigo);
    const cajas = num(r.total_cajas) ?? 0;
    const factor = num(r.factor_estibado) ?? mat?.cajas_por_estiba ?? null;
    const porCaja = mat?.unidades_por_caja ?? null;
    for (const t of [f.general, r.tipo_material === "ENVASE" ? f.envase : f.producto]) {
      t.renglones += 1;
      t.cajas += cajas;
      if (factor != null && factor > 0) t.estibas += cajas / factor; else t.sinFactor += 1;
      if (porCaja != null && porCaja > 0) t.unidades += cajas * porCaja; else t.sinUnidades += 1;
    }
  }
  return f;
}
