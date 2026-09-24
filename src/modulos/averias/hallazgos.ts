/**
 * LOS HALLAZGOS DE AVERÍAS — lo que el informe dice sin que nadie lo
 * escriba a mano.
 *
 * «Haz con averías algo brutal y sobre todo profesional, con hallazgos
 *  y todo en el informe.»
 *
 * ---------------------------------------------------------------------
 * QUÉ ES UN HALLAZGO AQUÍ, Y QUÉ NO
 * ---------------------------------------------------------------------
 * Un hallazgo NO es una cifra. «36 cajas este mes» es una cifra: ya está
 * en el tablero y no le dice a nadie qué hacer. Un hallazgo es una cifra
 * MÁS la comparación que la vuelve accionable:
 *
 *   cifra     «22 cajas en la calle A»
 *   hallazgo  «el 61 % de las cajas está en la calle A, y dos tercios de
 *              esas son avería de depósito y no de transporte — eso es
 *              del sitio, no del viaje»
 *
 * Por eso cada hallazgo lleva LA CUENTA QUE LO SOSTIENE (`cuenta`): sin
 * ella, un informe que afirma cosas es un informe que hay que creerle.
 *
 * ---------------------------------------------------------------------
 * SE CALCULAN AQUÍ, EN UNA FUNCIÓN PURA, Y NO EN EL PDF
 * ---------------------------------------------------------------------
 * Entra una lista, sale otra. Así se pueden medir sin navegador y sin
 * generar un PDF: un arnés les pasa averías conocidas y comprueba que el
 * hallazgo diga lo que tiene que decir. Dentro del dibujo, la única
 * forma de comprobarlo sería leer el papel — y una conclusión mal sacada
 * se lee perfectamente normal.
 *
 * ---------------------------------------------------------------------
 * NINGÚN HALLAZGO SE INVENTA CUANDO NO HAY DE DÓNDE
 * ---------------------------------------------------------------------
 * Cada regla tiene un PISO: un porcentaje sobre cuatro cajas no es una
 * concentración, es el azar. Si no hay material, el hallazgo no sale —y
 * un informe con dos hallazgos ciertos vale más que uno con seis
 * rellenos.
 */

export type Causal = "transporte" | "deposito" | "contaminado";

export const CAUSAL_NOMBRE: Record<Causal, string> = {
  transporte: "Avería transporte",
  deposito:   "Avería depósito",
  contaminado:"Producto contaminado",
};

export type Averia = {
  codigo: string;
  /** El día en que se registró, AAAA-MM-DD. */
  fecha: string;
  /** «A03 · M12». La calle es lo que va antes del primer separador. */
  ubicacion: string;
  producto_codigo: string;
  producto: string;
  cajas: number;
  unidades: number;
  /** AAAA-MM-DD, o null si el producto no vence. */
  vence: string | null;
  causal: Causal;
  reporto: string;
  /** El número de SAP. Vacío = todavía cuenta en el inventario. */
  documento: string | null;
  /** Cuándo llegó el documento, para medir cuánto tarda la baja. */
  documento_en: string | null;
};

export type Hallazgo = {
  /** `alto` va en rojo y primero: es plata o es riesgo. */
  peso: "alto" | "medio" | "dato";
  /** La cifra que encabeza: «61 %», «2», «11 días». */
  cifra: string;
  /** Una línea. Lo que pasa. */
  dice: string;
  /** Una línea más. Por qué importa o qué hacer. */
  porque: string;
  /** La cuenta que lo sostiene, para que no haya que creerle. */
  cuenta: string;
};

const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);
/** LA CALLE ES LA LETRA, no el módulo. «A03 · M12» es la calle A, y
 *  agrupar por «A03» reparte las averías de una misma calle en tantos
 *  grupos como módulos tenga: ninguno llega al 40 % y la concentración
 *  —el hallazgo que más vale de este informe— no sale nunca. */
const calleDe = (u: string) => (u.trim().match(/^[A-Za-z]+/)?.[0] ?? u).toUpperCase();
const dias = (a: string, b: string) =>
  Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 86400_000);

/** Agrupa y ordena de mayor a menor por cajas. */
function porClave<T extends string>(av: Averia[], clave: (a: Averia) => T) {
  const m = new Map<T, { cajas: number; unidades: number; n: number }>();
  for (const a of av) {
    const k = clave(a);
    const x = m.get(k) ?? { cajas: 0, unidades: 0, n: 0 };
    m.set(k, { cajas: x.cajas + a.cajas, unidades: x.unidades + a.unidades, n: x.n + 1 });
  }
  return [...m.entries()].sort((p, q) => q[1].cajas - p[1].cajas);
}

export function hallazgos(av: Averia[], hoy: string): Hallazgo[] {
  const out: Hallazgo[] = [];
  const cajas = av.reduce((t, a) => t + a.cajas, 0);
  if (av.length === 0) return out;

  /* ---- 1. DÓNDE SE CONCENTRA, Y SI ES DEL SITIO O DEL VIAJE ----
     El piso es 10 cajas y 3 averías: un 60 % sobre dos averías no dice
     nada del sitio, dice que hubo dos averías. */
  const calles = porClave(av, (a) => calleDe(a.ubicacion));
  if (calles.length > 1 && cajas >= 10 && av.length >= 3) {
    const [calle, d] = calles[0];
    const p = pct(d.cajas, cajas);
    if (p >= 40) {
      const enEsa = av.filter((a) => calleDe(a.ubicacion) === calle);
      const dep = enEsa.filter((a) => a.causal === "deposito").reduce((t, a) => t + a.cajas, 0);
      const pDep = pct(dep, d.cajas);
      out.push({
        peso: p >= 55 ? "alto" : "medio",
        cifra: `${p} %`,
        dice: `${p} de cada 100 cajas averiadas están en la calle ${calle}`,
        /* LA SEGUNDA LÍNEA ES LA QUE VALE: concentrarse en un sitio no
           dice nada si la causa es el transporte —el camión no es de la
           calle—. Si la causa es depósito, el problema SÍ es del sitio. */
        porque: pDep >= 50
          ? `y ${pDep} % de esas son avería de depósito, no de transporte: el problema es del sitio, no del viaje`
          : `pero solo ${pDep} % son de depósito: llega averiado, no se avería ahí`,
        cuenta: `${d.cajas} de ${cajas} cajas · ${enEsa.length} averías · ${dep} cajas de depósito`,
      });
    }
  }

  /* ---- 2. LO QUE SIGUE CONTANDO EN EL INVENTARIO ----
     Es el hallazgo de plata: una avería sin documento de baja es
     producto que ya no existe y que el sistema sigue contando. */
  const sinDoc = av.filter((a) => !a.documento);
  if (sinDoc.length > 0) {
    const cjs = sinDoc.reduce((t, a) => t + a.cajas, 0);
    const uds = sinDoc.reduce((t, a) => t + a.unidades, 0);
    const vieja = sinDoc.map((a) => dias(a.fecha, hoy)).sort((x, z) => z - x)[0];
    out.push({
      peso: vieja >= 7 ? "alto" : "medio",
      cifra: `${sinDoc.length}`,
      dice: `${sinDoc.length} aver${sinDoc.length === 1 ? "ía" : "ías"} sin documento de baja`,
      porque: `son ${cjs} cajas (${uds} unidades) que ya no existen y que el inventario sigue contando` +
              (vieja >= 7 ? `; la más vieja lleva ${vieja} días esperando` : ""),
      cuenta: `${sinDoc.map((a) => a.codigo).slice(0, 6).join(", ")}` +
              (sinDoc.length > 6 ? ` y ${sinDoc.length - 6} más` : ""),
    });
  }

  /* ---- 3. CUÁNTO TARDA LA BAJA ----
     Solo con las que YA tienen documento: promediar las pendientes
     daría un número que baja solo cuando alguien deja de registrar. */
  const conDoc = av.filter((a) => a.documento && a.documento_en);
  if (conDoc.length >= 3) {
    const ds = conDoc.map((a) => dias(a.fecha, a.documento_en!)).sort((x, z) => x - z);
    const prom = ds.reduce((t, x) => t + x, 0) / ds.length;
    const peor = ds[ds.length - 1];
    out.push({
      peso: peor >= 10 ? "medio" : "dato",
      cifra: `${prom.toFixed(1).replace(".", ",")} días`,
      dice: "es lo que tarda en promedio una avería en darse de baja en SAP",
      porque: peor >= 10
        ? `la más lenta tardó ${peor} días: mientras tanto el inventario contaba producto que no estaba`
        : `entre ${ds[0]} y ${peor} días`,
      cuenta: `${conDoc.length} averías con documento`,
    });
  }

  /* ---- 4. LO QUE VA A VENCER ESTANDO YA AVERIADO ----
     Doble pérdida y, sobre todo, una fecha: después no se puede
     reclamar a nadie. */
  const porVencer = av.filter((a) => a.vence && dias(hoy, a.vence) >= 0 && dias(hoy, a.vence) <= 30);
  if (porVencer.length > 0) {
    const cjs = porVencer.reduce((t, a) => t + a.cajas, 0);
    const pronto = porVencer.map((a) => dias(hoy, a.vence!)).sort((x, z) => x - z)[0];
    out.push({
      peso: pronto <= 7 ? "alto" : "medio",
      cifra: `${cjs}`,
      dice: `${cjs} cajas averiadas vencen dentro de 30 días`,
      porque: `la más próxima vence en ${pronto} día${pronto === 1 ? "" : "s"}: después de esa fecha ya no se le reclama a nadie`,
      cuenta: porVencer.map((a) => `${a.codigo} vence ${a.vence}`).slice(0, 4).join(" · "),
    });
  }

  /* ---- 5. LA CAUSAL QUE MANDA ----
     Cada causal se le reclama a alguien distinto: transporte al
     transportador, depósito a la operación, contaminado a calidad. */
  const causales = porClave(av, (a) => a.causal);
  if (cajas >= 10 && causales.length > 1) {
    const [c, d] = causales[0];
    const p = pct(d.cajas, cajas);
    if (p >= 45) {
      out.push({
        peso: "dato",
        cifra: `${p} %`,
        dice: `la causal que más pesa es «${CAUSAL_NOMBRE[c]}»`,
        porque: c === "transporte"
          ? "se le reclama al transportador, y para eso la foto tiene que estar"
          : c === "deposito"
          ? "es de la operación del centro: manipulación, apilado o estibado"
          : "es de calidad, y no se arregla moviendo estibas",
        cuenta: `${d.cajas} de ${cajas} cajas · ${d.n} averías`,
      });
    }
  }

  /* ---- 6. EL PRODUCTO QUE MÁS SE AVERÍA ---- */
  const prods = porClave(av, (a) => a.producto);
  if (prods.length > 2 && cajas >= 10) {
    const [nombre, d] = prods[0];
    const p = pct(d.cajas, cajas);
    if (p >= 35) {
      out.push({
        peso: "dato",
        cifra: `${p} %`,
        dice: `«${nombre}» concentra ${p} % de las cajas averiadas`,
        porque: "si un solo producto pesa tanto, mirar su estiba y su sitio antes que el resto",
        cuenta: `${d.cajas} cajas en ${d.n} averías`,
      });
    }
  }

  /* ---- 7. QUIÉN REPORTA, QUE NO ES QUIÉN CAUSA ----
     Un solo reportante en un centro de tres turnos no quiere decir que
     los otros turnos no rompan: quiere decir que no reportan. */
  const gente = porClave(av, (a) => a.reporto);
  if (av.length >= 5 && gente.length === 1) {
    out.push({
      peso: "medio",
      cifra: "1",
      dice: `todas las averías del período las reportó una sola persona (${gente[0][0]})`,
      porque: "en un centro de varios turnos eso casi nunca significa que los demás no rompan: significa que no reportan",
      cuenta: `${av.length} averías, un solo reportante`,
    });
  }

  /* LOS DE PESO ALTO PRIMERO. Un informe que empieza por un dato de
     color y esconde la plata en el cuarto renglón es un informe que se
     lee hasta el segundo. */
  const orden = { alto: 0, medio: 1, dato: 2 };
  return out.sort((a, b) => orden[a.peso] - orden[b.peso]);
}
