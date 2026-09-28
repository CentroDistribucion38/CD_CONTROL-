/**
 * EL PARETO — qué poco explica lo mucho.
 *
 * «El gráfico que sea un pareto de causa, área y OPM, que estén las 3.»
 *
 * ---------------------------------------------------------------------
 * UN PARETO NO ES UN RANKING CON LÍNEA ENCIMA
 * ---------------------------------------------------------------------
 * Un ranking dice cuál es el primero. Un Pareto contesta otra cosa:
 * CUÁNTAS HAY QUE ATACAR para tapar la mayor parte. Esa respuesta es un
 * número —«tres causas son el 80 %»— y es lo único que cambia lo que
 * alguien hace el lunes. Por eso aquí se calcula `hasta80`, y no se deja
 * que cada quien lo cuente a ojo en la gráfica.
 *
 * ---------------------------------------------------------------------
 * SE MIDE EN UNIDADES MOVIDAS, Y LA PLATA VIAJA AL LADO
 * ---------------------------------------------------------------------
 * Unidades movidas = rotas + contaminadas. Es lo que pasó físicamente, y
 * es la vara con la que se comparan tres cosas tan distintas como una
 * causa, un área y un operario.
 *
 * LA PLATA NO SIRVE DE VARA AQUÍ: a un material le puede faltar el
 * precio en el maestro —pasa, y por eso el informe lo cuenta aparte— y
 * entonces esa causa valdría cero y saldría la última, cuando puede ser
 * la primera. Un Pareto ordenado por un dato incompleto manda a atacar
 * lo que no es. Así que ordena por unidades y ENSEÑA la plata: las dos
 * columnas juntas son las que dejan decidir.
 *
 * ---------------------------------------------------------------------
 * LO QUE NO TIENE NOMBRE SE DICE
 * ---------------------------------------------------------------------
 * Una rotura sin área, o sin OPM porque se la encontraron sin dueño, no
 * se puede meter en «otros» con las chicas: «otros» quiere decir «varias
 * pequeñas» y esto quiere decir «no se sabe». Son dos cosas distintas y
 * la segunda es la que hay que ir a arreglar al registro.
 */

export type Barra = {
  nombre: string;
  /** Unidades movidas: rotas + contaminadas. */
  valor: number;
  /** Lo que se le cobra al OL por esas. Nulo si no se pudo calcular. */
  plata: number | null;
  /** Qué parte del total es esta barra. */
  pct: number;
  /** Cuánto llevan sumado ésta y las de antes. */
  acumulado: number;
  /** Ni «otros» ni «sin dato» son una causa, un área ni un operario. */
  clase: "normal" | "otros" | "sinDato";
};

export type Pareto = {
  barras: Barra[];
  total: number;
  /** Cuántas barras hacen falta para llegar al 80 %. Es LA respuesta. */
  hasta80: number;
  /** Cuántas se juntaron en «otros». */
  juntados: number;
};

type Fila = {
  nombre: string | null | undefined;
  valor: number;
  plata: number | null;
};

/**
 * @param filas lo ya desmenuzado por la pantalla: un renglón por rotura,
 *              con el nombre de la dimensión, sus unidades y su plata.
 * @param tope  cuántas barras se dibujan antes de juntar el resto.
 */
export function pareto(filas: Fila[], tope = 8): Pareto {
  const m = new Map<string, { valor: number; platas: (number | null)[] }>();
  for (const f of filas) {
    if (f.valor <= 0) continue;
    /* SIN NOMBRE NO ES «OTROS»: es «sin dato», y va aparte. */
    const k = (f.nombre ?? "").trim() || "\u0000sin";
    const a = m.get(k) ?? { valor: 0, platas: [] };
    a.valor += f.valor;
    a.platas.push(f.plata);
    m.set(k, a);
  }
  /* UNA SOLA PLATA QUE FALTE DEJA LA SUMA EN NULO. Media cifra con cara
     de entera es peor que ninguna: al material le falta el precio en el
     maestro, y eso es lo que hay que ir a arreglar. */
  const suma = (platas: (number | null)[]) =>
    platas.some((p) => p == null) ? null : platas.reduce((t: number, p) => t + (p ?? 0), 0);

  const total = [...m.values()].reduce((s, v) => s + v.valor, 0);
  if (total <= 0) return { barras: [], total: 0, hasta80: 0, juntados: 0 };

  const orden = [...m.entries()]
    .map(([k, v]) => ({
      nombre: k === "\u0000sin" ? "Sin dato" : k,
      valor: v.valor, plata: suma(v.platas),
      clase: (k === "\u0000sin" ? "sinDato" : "normal") as Barra["clase"],
    }))
    /* De mayor a menor, y ya está: quién va al final NO se decide aquí.
       «Sin dato» se aparta abajo y se vuelve a pegar de últimas, así que
       ordenarlo aquí además sería una defensa que no sostiene nada —y una
       defensa de mentira estorba, porque se cree que algo la cuida. */
    .sort((a, b) => b.valor - a.valor);

  /* SE JUNTA LA COLA, NO SE CORTA: cortarla cambiaría el total y el
     acumulado dejaría de llegar al 100 %. «Sin dato» nunca se junta. */
  const conNombre = orden.filter((x) => x.clase === "normal");
  const sinDato = orden.filter((x) => x.clase === "sinDato");
  let barras = conNombre;
  let juntados = 0;
  if (conNombre.length > tope) {
    const cola = conNombre.slice(tope - 1);
    juntados = cola.length;
    barras = [...conNombre.slice(0, tope - 1), {
      nombre: "Otros",
      valor: cola.reduce((s, x) => s + x.valor, 0),
      plata: cola.some((x) => x.plata == null)
        ? null : cola.reduce((s, x) => s + (x.plata ?? 0), 0),
      clase: "otros" as const,
    }];
  }

  let acum = 0;
  const conPct: Barra[] = [...barras, ...sinDato].map((x) => {
    acum += x.valor;
    return {
      nombre: x.nombre, valor: x.valor, plata: x.plata,
      pct: Math.round((x.valor / total) * 100),
      acumulado: Math.round((acum / total) * 100),
      clase: x.clase,
    };
  });

  /* CUÁNTAS HACEN FALTA PARA EL 80 %, que es la respuesta que se viene a
     buscar. Se cuenta sobre el acumulado real, no sobre los porcentajes
     redondeados: con ocho barras, ocho redondeos pueden dar 79 o 101. */
  let bruto = 0, hasta80 = 0;
  for (const b of [...barras, ...sinDato]) {
    bruto += b.valor; hasta80 += 1;
    if (bruto / total >= 0.8) break;
  }

  return { barras: conPct, total, hasta80, juntados };
}
