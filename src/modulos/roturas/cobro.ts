import type { Rotura } from "./datos";

/**
 * LO QUE SE LE COBRA AL OPERADOR LOGÍSTICO.
 *
 * «que la persona sepa, de acuerdo a lo que se ha ido a cobro, cuánto
 *  es.»
 *
 * ---------------------------------------------------------------------
 * LA REGLA, que la puso Cristian y que es al revés de lo que suponía el
 * código de antes:
 *
 *     ROTA         solo el envase. Al OL se le cobra reponer la botella.
 *     CONTAMINADA  el envase Y el producto. Un envase contaminado no se
 *                  lava ni vuelve a la línea: se descarta con el líquido.
 *
 * Las dos cuentas las hace la base —viven en `v_roturas`— porque de ahí
 * salen los precios del maestro y porque una cuenta de plata repetida en
 * dos sitios es una cuenta que algún día va a dar dos números. Aquí solo
 * se SUMA lo que corresponde y se reparte por causa.
 *
 * ---------------------------------------------------------------------
 * SE SUMA LO QUE ESTÁ A COBRO, NO LO QUE TIENE VISTO BUENO. No es lo
 * mismo: una rotura que el OL objetó y que después se resolvió a su
 * favor tiene visto bueno y NO se cobra. Sumar el filtro entero daría
 * una cifra más grande y más cómoda que nadie podría defender en la
 * reunión del mes.
 *
 * Y LO QUE NO SE PUEDE CALCULAR SE CUENTA APARTE, no se suma como cero.
 * Si a un material le falta el precio en el maestro su cobro viene nulo;
 * contarlo como cero daría un total corto con cara de exacto, que es la
 * peor clase de número. Se dice cuántas son y eso manda a arreglar el
 * maestro.
 */

export type Cobro = {
  /** Las que de verdad se van a cobrar: etapa 'cobro'. */
  aCobro: number;
  /** De esas, las que tienen precio y por tanto entran en la suma. */
  cobrables: number;
  /** Y las que no: al material le falta el precio en el maestro. */
  sinPrecio: number;
  total: number;
  /** Partido en las dos formas de cobrar, que no cuestan lo mismo. */
  rotas: number;
  contaminadas: number;
  /** De mayor a menor, que es como se lee. */
  porCausa: { nombre: string; grupo: "asumida" | "no_asumida"; valor: number }[];
};

const num = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0 };

export function medirCobro(lista: Rotura[]): Cobro {
  /* LA ANULADA NO SE COBRA, aunque su etapa diga otra cosa: anular es
     decir que esa rotura no debió existir. */
  const aCobro = lista.filter((r) => r.etapa === "cobro" && r.estado !== "anulada");
  const cobrables = aCobro.filter((r) => r.cobro_total != null);

  const porCausa = [...new Map(cobrables.map((r) => [r.causa_nombre, r])).values()]
    .map((r) => ({
      nombre: r.causa_nombre,
      grupo: r.grupo,
      valor: cobrables.filter((x) => x.causa_nombre === r.causa_nombre)
        .reduce((s, x) => s + num(x.cobro_total), 0),
    }))
    .sort((a, b) => b.valor - a.valor);

  return {
    aCobro: aCobro.length,
    cobrables: cobrables.length,
    sinPrecio: aCobro.length - cobrables.length,
    total: cobrables.reduce((s, r) => s + num(r.cobro_total), 0),
    rotas: cobrables.reduce((s, r) => s + num(r.cobro_rotas), 0),
    contaminadas: cobrables.reduce((s, r) => s + num(r.cobro_contaminadas), 0),
    porCausa,
  };
}
