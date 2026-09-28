import type { Rotura } from "./datos";
import type { Cobro } from "./cobro";

/**
 * LAS CONCLUSIONES DEL INFORME DE EN SITIO.
 *
 * UN INFORME QUE EMPIEZA POR UNA TABLA OBLIGA A CADA QUIEN A SACAR SUS
 * PROPIAS CONCLUSIONES — y cada quien saca otra. Aquí van primero, en
 * orden de peso, y con LA CUENTA QUE LAS SOSTIENE al lado: un informe
 * que afirma cosas sin mostrar de dónde salen es un informe al que hay
 * que creerle.
 *
 * ---------------------------------------------------------------------
 * ES UNA FUNCIÓN PURA Y NO TEXTO DENTRO DEL PDF, por la misma razón que
 * el Sankey vive aparte: UNA CONCLUSIÓN MAL SACADA SE LEE PERFECTAMENTE
 * NORMAL EN UN PAPEL BONITO. Aquí se puede medir sin generar un PDF, que
 * es lo único que permite comprobar que dice lo correcto — y sobre todo,
 * que dice lo correcto AL REVÉS: las dos conclusiones que más fácil se
 * sacan volteadas son «la causa que más cuesta» y «quién la asume».
 *
 * ---------------------------------------------------------------------
 * NO SE INVENTAN CUANDO NO HAY DE DÓNDE
 * ---------------------------------------------------------------------
 * Un 60 % sobre cinco unidades no es una concentración, es el azar. Cada
 * hallazgo tiene un piso de datos y por debajo de él no sale. Un informe
 * de un día flojo que afirma seis cosas es un informe que nadie va a
 * volver a creer cuando afirme la que importa.
 */

export type Hallazgo = {
  /** Para probarlo sin depender de cómo esté redactado. */
  clave: string;
  /** La cifra grande de la izquierda. */
  cifra: string;
  /** Qué dice. */
  dice: string;
  /** Por qué importa. */
  porque: string;
  /** De dónde sale, en números. */
  cuenta: string;
  peso: "alto" | "medio" | "bajo";
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const plata = (n: number) => "$ " + nf.format(Math.round(n));

/* LOS PISOS. Por debajo de aquí no se concluye nada. */
const MIN_UNIDADES = 30;
/* TRES, Y NO UNA. Con una sola rotura en el período «esta causa es el
   100 %» es cierto y no dice nada: es la única que hay. Con tres ya se
   puede hablar de que una pesa más que las otras. */
const MIN_ROTURAS = 3;

/**
 * @param vivas   lo del filtro sin las anuladas — incluye lo que ABI devolvió.
 * @param cuentan las que cuentan: `vivas.filter(r => r.cuenta)`.
 * @param cobro   lo ya medido por `medirCobro(vivas)`.
 *
 * Las tres llegan de la pantalla YA CALCULADAS. Si esta función volviera
 * a filtrar por su cuenta, el día que cambie la regla de qué cuenta el
 * informe diría otra cosa que la pantalla y las dos se verían bien.
 */
export function hallazgosSitio(vivas: Rotura[], cuentan: Rotura[], cobro: Cobro): Hallazgo[] {
  const h: Hallazgo[] = [];

  const unidades = cuentan.reduce((s, r) => s + r.unidades_vidrio, 0);
  const contaminadas = cuentan.reduce((s, r) => s + (r.contaminadas ?? 0), 0);
  const movidas = unidades + contaminadas;
  const hayBase = movidas >= MIN_UNIDADES && cuentan.length >= MIN_ROTURAS;

  const suma = <T>(lista: T[], clave: (x: T) => string, valor: (x: T) => number) => {
    const m = new Map<string, number>();
    for (const x of lista) m.set(clave(x), (m.get(clave(x)) ?? 0) + valor(x));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  /* ===================================================================
     1 · LO QUE FALTA EN EL MAESTRO — VA PRIMERO
     -------------------------------------------------------------------
     Y va primero aunque no sea la cifra más grande: es el único hallazgo
     que dice que EL RESTO DEL INFORME ESTÁ CORTO. Leer el total de abajo
     sin saber esto es leer un número equivocado con cara de exacto.
     No tiene piso de datos: una sola ya rompe la cuenta.
     =================================================================== */
  if (cobro.sinPrecio > 0) {
    h.push({
      clave: "sin-precio",
      cifra: String(cobro.sinPrecio),
      dice: `${cobro.sinPrecio} rotura${cobro.sinPrecio === 1 ? "" : "s"} a cobro no se ` +
            `pueden valorar: al material le falta el precio en el maestro`,
      porque: "No entran en el total de este informe, así que la cifra que se le cobra al OL " +
              "está CORTA. Se arregla en Inventario → Maestro y el informe vuelve a cuadrar.",
      cuenta: `${cobro.cobrables} de ${cobro.aCobro} roturas a cobro tienen precio`,
      peso: "alto",
    });
  }

  /* ===================================================================
     2 · LA CAUSA QUE MÁS CUESTA NO SIEMPRE ES LA QUE MÁS ROMPE
     -------------------------------------------------------------------
     Es la conclusión que no se ve en ningún ranking de la pantalla, y la
     que cambia a qué se le mete la mano: una causa que rompe poco pero
     CONTAMINA cuesta el envase y el producto de cada unidad.
     =================================================================== */
  const porCausaU = suma(cuentan, (r) => r.causa_nombre,
                         (r) => r.unidades_vidrio + (r.contaminadas ?? 0));
  const topU = porCausaU[0];
  const topP = cobro.porCausa[0];

  if (hayBase && topU && topP && topU[0] !== topP.nombre && topP.valor > 0) {
    const uDeTop = porCausaU.find(([n]) => n === topP.nombre)?.[1] ?? 0;
    h.push({
      clave: "causa-cara",
      cifra: plata(topP.valor),
      dice: `La causa que más plata cuesta es «${topP.nombre}», y no la que más unidades rompe`,
      porque: `«${topU[0]}» mueve más unidades —${nf.format(topU[1])}— pero cuesta menos. ` +
              "Lo caro es contaminar: ahí se cobra el envase Y el producto de cada unidad.",
      cuenta: `«${topP.nombre}»: ${nf.format(uDeTop)} unidades y ${plata(topP.valor)} · ` +
              `«${topU[0]}»: ${nf.format(topU[1])} unidades`,
      peso: "alto",
    });
  } else if (hayBase && topU && pct(topU[1], movidas) >= 35) {
    /* SI SÍ ES LA MISMA, lo que vale es cuánto concentra. */
    const p = pct(topU[1], movidas);
    const laCausa = cuentan.find((r) => r.causa_nombre === topU[0]);
    h.push({
      clave: "causa-concentra",
      cifra: p + " %",
      dice: `«${topU[0]}» concentra el ${p} % de todo lo que se movió`,
      porque: laCausa?.grupo === "no_asumida"
        ? "Y es una causa que NO asume el OL: todas esas se van a discutir una por una."
        : "La asume el OL, así que es la que más rápido baja la cuenta si se ataca.",
      cuenta: `${nf.format(topU[1])} de ${nf.format(movidas)} unidades movidas`,
      peso: p >= 50 ? "alto" : "medio",
    });
  }

  /* ===================================================================
     3 · LAS CONTAMINADAS CUESTAN DISTINTO, Y POR ESO SE DICEN APARTE
     -------------------------------------------------------------------
     Son pocas unidades y mucha plata. Puestas dentro del total no se ve,
     y es justo lo que hay que enseñarle al OL para que las evite.
     =================================================================== */
  if (contaminadas > 0 && cobro.contaminadas > 0 && cobro.rotas > 0 && unidades > 0) {
    const pU = pct(contaminadas, movidas);
    const pP = pct(cobro.contaminadas, cobro.total);
    const caroCont = cobro.contaminadas / contaminadas;
    const caroRota = cobro.rotas / unidades;
    const veces = caroRota > 0 ? caroCont / caroRota : 0;
    if (pP >= pU + 8 && veces >= 1.2) {
      h.push({
        clave: "contaminadas-caras",
        cifra: pP + " %",
        dice: `Las contaminadas son el ${pU} % de las unidades y el ${pP} % de la plata`,
        porque: `Cada contaminada cuesta ${veces.toFixed(1)} veces lo que una rota: la rota paga ` +
                "el envase, la contaminada paga el envase y el producto porque no vuelve a la línea.",
        cuenta: `${nf.format(contaminadas)} contaminadas = ${plata(cobro.contaminadas)} · ` +
                `${nf.format(unidades)} rotas = ${plata(cobro.rotas)}`,
        peso: pP >= 50 ? "alto" : "medio",
      });
    }
  }

  /* ===================================================================
     4 · LO QUE SE DICE QUE NO FUE DEL OL
     =================================================================== */
  const noAsumidas = cuentan.filter((r) => r.grupo === "no_asumida")
    .reduce((s, r) => s + r.unidades_vidrio + (r.contaminadas ?? 0), 0);
  const pNo = pct(noAsumidas, movidas);
  if (hayBase && noAsumidas > 0 && pNo >= 10) {
    const sinFoto = cuentan.filter((r) => r.grupo === "no_asumida" && r.le_falta_foto).length;
    h.push({
      clave: "no-asumidas",
      cifra: pNo + " %",
      dice: `Un ${pNo} % de lo movido se dice que no fue del OL`,
      porque: sinFoto > 0
        ? `Todas esas exigen foto y ${sinFoto} no la tiene${sinFoto === 1 ? "" : "n"}. Sin foto no ` +
          "se le reclama a nadie: es la parte del cobro que se cae sola en la reunión."
        : "Todas exigen foto y todas la tienen. Son las que van a discutirse, y están soportadas.",
      cuenta: `${nf.format(noAsumidas)} de ${nf.format(movidas)} unidades movidas` +
              (sinFoto > 0 ? ` · ${sinFoto} sin foto` : ""),
      peso: pNo >= 25 || sinFoto > 0 ? "alto" : "medio",
    });
  }

  /* ===================================================================
     5 · EL PROCESO DONDE PASA
     -------------------------------------------------------------------
     El proceso no dice de quién fue —eso lo dice la causa— pero sí DÓNDE
     meter la mano. Si uno pesa el doble que el siguiente, el problema es
     del proceso y no del turno que le tocó ese día.
     =================================================================== */
  const porProceso = suma(cuentan, (r) => r.proceso_nombre,
                          (r) => r.unidades_vidrio + (r.contaminadas ?? 0));
  if (hayBase && porProceso.length >= 2) {
    const [p1, p2] = porProceso;
    const p = pct(p1[1], movidas);
    if (p1[1] >= p2[1] * 2 && p >= 35) {
      h.push({
        clave: "proceso",
        cifra: p + " %",
        dice: `«${p1[0]}» pesa más del doble que el siguiente proceso`,
        porque: "Cuando un proceso concentra así, el problema es del proceso —cómo se hace, con " +
                "qué equipo— y no del turno al que le tocó ese día.",
        cuenta: `${p1[0]}: ${nf.format(p1[1])} · ${p2[0]}: ${nf.format(p2[1])} unidades`,
        peso: "medio",
      });
    }
  }

  /* ===================================================================
     6 · LO QUE TODAVÍA NO SE PUEDE COBRAR
     -------------------------------------------------------------------
     Plata reclamada que aún no es plata. Va en el informe porque es lo
     único que explica por qué el total de arriba es menor de lo que la
     gente recuerda haber reportado.
     =================================================================== */
  const espera = vivas.filter((r) => r.etapa === "espera_ol");
  const desacuerdo = vivas.filter((r) => r.etapa === "desacuerdo");
  if (espera.length + desacuerdo.length > 0 && vivas.length >= MIN_ROTURAS) {
    const n = espera.length + desacuerdo.length;
    const enEspera = [...espera, ...desacuerdo]
      .reduce((s, r) => s + (Number(r.cobro_total) || 0), 0);
    h.push({
      clave: "sin-decidir",
      cifra: enEspera > 0 ? plata(enEspera) : String(n),
      dice: `${n} rotura${n === 1 ? "" : "s"} todavía sin decidir` +
            (enEspera > 0 ? `, por ${plata(enEspera)}` : ""),
      porque: desacuerdo.length > 0
        ? `${espera.length} esperan respuesta del OL y ${desacuerdo.length} están objetadas y las ` +
          "tiene que mirar ABI. Hasta que se decidan no entran en el total de este informe."
        : "Esperan respuesta del OL. Hasta que conteste no entran en el total de este informe.",
      cuenta: `${n} de ${vivas.length} roturas del período`,
      peso: n >= vivas.length / 2 ? "medio" : "bajo",
    });
  }

  /* ===================================================================
     7 · LO QUE ABI DEVOLVIÓ
     -------------------------------------------------------------------
     No mide roturas: mide cómo se está registrando. Un 20 % devuelto es
     una pantalla que se está llenando mal, y eso se arregla enseñando,
     no reclamando.
     =================================================================== */
  const devueltas = vivas.filter((r) => r.estado === "no_cuenta").length;
  const pDev = pct(devueltas, vivas.length);
  if (devueltas > 0 && vivas.length >= 10 && pDev >= 15) {
    h.push({
      clave: "devueltas",
      cifra: pDev + " %",
      dice: `ABI devolvió el ${pDev} % de lo reportado`,
      porque: "Eso no mide roturas, mide cómo se está registrando. Se arregla enseñando a llenar " +
              "la pantalla, no reclamándole al OL.",
      cuenta: `${devueltas} de ${vivas.length} roturas del período`,
      peso: pDev >= 30 ? "alto" : "medio",
    });
  }

  /* EL ORDEN ES EL PESO, y dentro del mismo peso el que ya traía. Lo
     alto primero: quien lee tres renglones y cierra el PDF tiene que
     haber leído lo que importa. */
  const orden = { alto: 0, medio: 1, bajo: 2 };
  return h.sort((a, b) => orden[a.peso] - orden[b.peso]);
}
