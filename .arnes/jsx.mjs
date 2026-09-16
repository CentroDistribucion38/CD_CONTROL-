/* =====================================================================
   DOS COSAS QUE SE ESCAPAN A PRODUCCIÓN SIN QUE NADA CHISTE

   Las dos salieron el mismo día en la pantalla de tránsito, las dos las
   vio Cristian antes que cualquier herramienta, y las dos son válidas
   para `tsc`, para el `build` y para ESLint. Por eso están aquí: lo que
   ninguna herramienta ve hay que ir a buscarlo.

   ---------------------------------------------------------------------
   1) COMENTARIOS QUE SE PUBLICAN SOLOS

   LO QUE PASÓ. En la pantalla de tránsito salió impreso, encima de la
   lista y en letra grande, un comentario de veinte renglones que
   explicaba por qué la cinta de asuntos es negra. Cristian lo vio en
   producción.

   POR QUÉ. Dentro de JSX un comentario tiene que ir envuelto en llaves:

       {/* esto es un comentario *​/}      ← se borra al compilar
        /* esto es TEXTO *​/               ← sale en pantalla

   La segunda forma no es un error para nadie: `tsc` la acepta, el
   `build` la acepta, ESLint la acepta. Es texto válido dentro de un
   elemento, igual que si alguien hubiera escrito «hola». Por eso pasó
   entera hasta el navegador sin que nada chistara.

   CÓMO SE PERDIÓ LA LLAVE. El comentario estaba adentro de un
   `{cond && ( … )}` y ahí no puede ir de primer hijo; al sacarlo para
   arriba se movió el texto y se quedaron atrás las llaves. Es un error
   de dedo que ninguna herramienta ve.

   CÓMO SE CAZA. Un comentario de bloque que viene después de `}` o `>`
   —el final de una expresión o de una etiqueta— y antes de `{` o `<`
   está, con toda seguridad, entre hijos de JSX. Ahí las llaves no son
   opcionales. Fuera de JSX ese sándwich casi no ocurre, así que el
   control apunta a lo que falla sin estorbar al resto.

   ---------------------------------------------------------------------
   2) LOS CUADROS GRISES DEL NAVEGADOR

   `alert()`, `confirm()` y `prompt()` salen con el dominio encima
   —«cd-control-one.vercel.app dice»—, en gris, con botones que no son
   los de la plataforma y sin sitio para explicar nada. Enseñar eso en
   una reunión parece que la aplicación se rompió; Cristian lo dijo con
   esas palabras.

   La aplicación ya tiene los dos cuadros de la casa —`useConfirmar`
   pregunta antes, `useAvisos` cuenta después— y toda la plataforma los
   usa. Tránsito era la única pantalla que no. Este control es para que
   no vuelva a colarse uno.
   ===================================================================== */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("../src/", import.meta.url).pathname;

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

/* Se tapan las cadenas y los comentarios de línea antes de buscar, para
   que un `/*` que viva adentro de un texto —o de este mismo archivo, al
   explicarse— no cuente como comentario de verdad. */
function sinCadenas(s) {
  return s.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/gs, (m) => " ".repeat(m.length))
          .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/* Los comentarios de bloque, en blanco pero conservando los saltos de
   línea: así el número de línea que se informa sigue siendo el de
   verdad. */
function sinBloques(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

const fallas = [];
const cuadros = [];
for (const ruta of archivos(RAIZ)) {
  const crudo = readFileSync(ruta, "utf8");
  const limpio = sinCadenas(crudo);

  for (const m of limpio.matchAll(/\/\*[\s\S]*?\*\//g)) {
    const ini = m.index;
    const fin = ini + m[0].length;

    /* El carácter de verdad que hay antes y después, saltando espacios
       y saltos de línea. */
    let a = ini - 1; while (a >= 0 && /\s/.test(limpio[a])) a--;
    let d = fin;     while (d < limpio.length && /\s/.test(limpio[d])) d++;
    const antes = a >= 0 ? limpio[a] : "";
    const despues = d < limpio.length ? limpio[d] : "";

    /* Envuelto en llaves: correcto, se borra al compilar. */
    if (antes === "{") continue;

    if ((antes === "}" || antes === ">") && (despues === "{" || despues === "<")) {
      const linea = crudo.slice(0, ini).split("\n").length;
      const asomo = m[0].replace(/\s+/g, " ").slice(0, 60);
      fallas.push(`${ruta.replace(RAIZ, "src/")}:${linea} — ${asomo}…`);
    }
  }

  /* ===== LOS CUADROS DEL NAVEGADOR =====
     Se busca sobre el texto sin cadenas Y SIN COMENTARIOS. Lo segundo
     no es un detalle: la primera versión de este control se cazó a sí
     misma tres veces, porque los comentarios que explican por qué no se
     usa `prompt()` contienen la palabra `prompt()`. Un arnés que grita
     por su propia explicación se termina apagando, y apagado no sirve.

     Y con la mirada atrás `(?<![.\w])`, para no cazar `evento.prompt()`,
     que es la API de instalar la aplicación y no tiene nada que ver. */
  for (const m of sinBloques(limpio).matchAll(/(?<![.\w])(alert|confirm|prompt)\s*\(/g)) {
    const linea = crudo.slice(0, m.index).split("\n").length;
    cuadros.push(`${ruta.replace(RAIZ, "src/")}:${linea} — ${m[1]}()`);
  }
}

if (fallas.length) {
  console.error("COMENTARIOS QUE SE VAN A IMPRIMIR EN PANTALLA:\n" +
    fallas.map((f) => " · " + f).join("\n") +
    "\n\nFaltan las llaves: {/* … */} en vez de /* … */.");
}
if (cuadros.length) {
  console.error((fallas.length ? "\n" : "") + "CUADROS GRISES DEL NAVEGADOR:\n" +
    cuadros.map((c) => " · " + c).join("\n") +
    "\n\nVan con los cuadros de la casa: useConfirmar() para preguntar," +
    " useAvisos() para contar lo que pasó.");
}
if (fallas.length || cuadros.length) process.exit(1);

console.log(`Revisados ${archivos(RAIZ).length} archivos .tsx.`);
console.log("Ningún comentario se imprime en pantalla y ningún cuadro gris del navegador.");
