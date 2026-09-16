/* =====================================================================
   EL BLOQUE DEL 80/20 SE LEE EN UNA REUNIÓN

   LO QUE PASÓ. El párrafo que interpreta el pareto decía cosas como
   «y diez frentes a la vez no son un plan» y «Cámbialo aquí arriba y lo
   ves». Cristian lo vio y lo dijo en una línea: eso no es redacción para
   un informe. Tiene razón — ese texto se lee en voz alta en una reunión
   y se pega en un correo, y un informe que le habla de tú al lector o
   que depende de que alguien haga clic no se puede citar.

   Y HABÍA ALGO PEOR QUE EL TONO: el rótulo decía «El 20 % que más
   rompe» SIEMPRE. Pero el grupo nunca baja de dos elementos, así que
   con cuatro líneas las dos primeras son el 50 % del universo y el
   informe llamaba «20 %» a la mitad. Un número mal rotulado en un
   informe es peor que ningún número, porque nadie lo va a volver a
   comprobar.

   QUÉ SE COMPRUEBA
     · Que no vuelvan los coloquialismos ni el trato de tú.
     · Que ningún rótulo fijo afirme un porcentaje que se calcula.
     · Que el párrafo cierre con una recomendación: un análisis que
       describe y no concluye deja el trabajo a medias.
   ===================================================================== */
import { readFileSync } from "node:fs";

const ruta = new URL("../src/app/(app)/quiebra/rotura/tablero/page.tsx", import.meta.url);
const src = readFileSync(ruta, "utf8");

/* Solo el bloque del 80/20: el resto del archivo son comentarios, y los
   comentarios de este proyecto sí hablan de tú a quien los lee. Lo que
   se audita es lo que SALE EN PANTALLA. */
const ini = src.indexOf('{paretoDatos.length >= 3 && und > 0 && (() => {');
const fin = src.indexOf('<ol className="rl-8020-lista">', ini);
if (ini < 0 || fin < 0) {
  console.error("No se encontró el bloque de lectura en el tablero. ¿Se renombró .rl-lect?");
  process.exit(1);
}
/* El bloque tal como está escrito, para mirar los rótulos; y su texto
   pelado —sin código ni etiquetas— para auditar cómo está redactado.
   Lo que se audita es lo que SALE EN PANTALLA, no el archivo. */

const crudo = src.slice(ini, fin);

/* SE QUITAN LOS COMENTARIOS, Y SOLO LOS COMENTARIOS.

   La primera versión quitaba TODO lo que va entre llaves, con el
   argumento de que en JSX las llaves son código. Y se comió justo lo que
   venía a auditar: el párrafo entero vive dentro de un
   `{A.seCumple ? (…) : (…)}`, así que el arnés quedó leyendo una cadena
   vacía y dando el visto bueno a cualquier cosa. Probado poniendo la
   frase prohibida a propósito: no la vio.

   Lo que sí hay que quitar son los comentarios, porque el de este mismo
   bloque NOMBRA las frases prohibidas para explicar por qué no van —sin
   quitarlo, el arnés se caza a sí mismo—. Se cuentan llaves porque un
   comentario lleva llaves adentro y un reemplazo simple se come media
   frase.

   El resto se deja tal cual, y lo que evita cazar código son las reglas:
   el signo de exclamación se busca PEGADO A UNA LETRA, que es como
   aparece en la prosa y nunca como aparece en una negación. */
function sinComentarios(t) {
  let out = "", i = 0;
  while (i < t.length) {
    if (t.startsWith("{/*", i)) {
      let hondo = 1; i += 1;
      while (i < t.length && hondo > 0) {
        if (t[i] === "{") hondo++;
        else if (t[i] === "}") hondo--;
        i++;
      }
      out += " ";
      continue;
    }
    /* Y los comentarios normales de JavaScript: el texto de los tres
       puntos se arma ARRIBA del JSX, en objetos, así que la mitad del
       bloque es código y lleva sus propias explicaciones. */
    if (t.startsWith("/*", i)) {
      const cierra = t.indexOf("*/", i + 2);
      i = cierra < 0 ? t.length : cierra + 2;
      out += " ";
      continue;
    }
    out += t[i++];
  }
  return out;
}
const bloque = sinComentarios(crudo);

const fallas = [];

/* ---- 1. El tono ---- */
const PROHIBIDO = [
  [/no son un plan/i, "coloquialismo"],
  [/\bcámbialo\b|\bmíralo\b|\blo ves\b|\baquí arriba\b/i, "le habla de tú al lector o lo manda a hacer clic"],
  [/\bosea\b|\bo sea que\b/i, "muletilla"],
  [/\bun montón\b|\bun poco\b|\bmuchísim/i, "cantidad sin cifra"],
  [/\bno pasa nada\b|\bla verdad\b|\bhonestamente\b/i, "registro de conversación"],
  [/\p{L}!/u, "signo de exclamación"],
  [/\bmete la mano\b|\bmeterle mano\b/i, "coloquialismo"],
];
for (const [re, por] of PROHIBIDO) {
  const m = bloque.match(re);
  if (m) fallas.push(`«${m[0]}» — ${por}`);
}

/* ---- 2. Los rótulos que afirman un porcentaje ----
   Un rótulo escrito a mano no puede decir «el 20 %» cuando ese 20 % es
   una cuenta que cambia con los datos. Se permite «el 80 %», que sí es
   la constante de la regla. */
for (const m of crudo.matchAll(/<(?:p|span) className="rl-lect-(?:ojo|rec)?[^"]*">([^<{]*)</g)) {
  const rot = m[1].trim();
  const pct = rot.match(/\b(\d+)\s*%/);
  if (pct && pct[1] !== "80")
    fallas.push(`el rótulo «${rot}» afirma un ${pct[1]} % que en realidad se calcula`);
}

/* ---- 3. Que concluya ----
   Las dos ramas —se cumple y no se cumple— tienen que terminar en una
   recomendación. Describir sin concluir deja el trabajo a medias, y es
   justo lo que diferencia un informe de una lista de cifras. */
/* Las tres salidas —concentra, no concentra pero otra dimensión sí, y
   no concentra en ninguna— tienen que terminar en una recomendación.
   Ahora la recomendación es un objeto con `que:`, así que se cuentan
   esos. */
const recomienda = (crudo.match(/que:/g) ?? []).length;
if (recomienda < 3)
  fallas.push(`solo ${recomienda} de los tres desenlaces tienen recomendación; ` +
              "concentra, no concentra pero otra dimensión sí, y no concentra en ninguna");

if (fallas.length) {
  console.error("REDACCIÓN DEL BLOQUE 80/20:\n" +
    fallas.map((f) => " · " + f).join("\n") +
    "\n\nEste párrafo se lee en una reunión y se pega en un correo.");
  process.exit(1);
}

console.log("Bloque del 80/20: registro de informe, rótulos sin porcentajes inventados,");
console.log(`y ${recomienda} recomendaciones — una por cada desenlace.`);
