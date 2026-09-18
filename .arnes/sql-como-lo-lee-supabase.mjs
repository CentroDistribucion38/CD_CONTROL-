/* =====================================================================
   LOS ARCHIVOS SQL, LEÍDOS COMO LOS LEE EL EDITOR DE SUPABASE.

   PostgreSQL lee un archivo entero y entiende perfectamente dónde
   empieza y dónde acaba un bloque. El editor de Supabase NO: parte el
   texto en sentencias antes de mandarlo, y para saber dónde acaba un
   bloque anónimo CUENTA los delimitadores de dólar.

   Ahí está la trampa, y me costó dos intentos fallidos en producción:

     -- Aquí el UPDATE va dentro de un solo `do $$`.     ← en un COMENTARIO

   Postgres ignora esa línea. El editor no: le cuenta el delimitador, se
   le invierte el estado, y cuando llega al bloque de verdad cree que lo
   está CERRANDO. Resultado: el `declare` queda en una sentencia y el
   cuerpo en otra, y revienta con

     ERROR: 42P01: relation "v_ya" does not exist

   —el nombre de una variable, tratado como si fuera una tabla—. Un
   mensaje que no se parece en nada a la causa, sobre un archivo que en
   psql corre perfecto. Por eso esto existe: es el error que NO se ve
   probando donde yo pruebo.

   SE COMPRUEBAN DOS COSAS EN TODOS LOS .sql DEL PROYECTO:

   1. Que ningún delimitador de bloque aparezca dentro de un comentario.
   2. Que al trocear el archivo contando esos delimitadores —como hace el
      editor— cada trozo quede completo: los `declare`/`begin` no pueden
      acabar en una sentencia distinta de su cuerpo.

   Y NO SE NOMBRA AQUÍ TAMPOCO. Este archivo arma el delimitador con
   String.fromCharCode para no tenerlo escrito: un arnés que contiene
   justo lo que prohíbe no puede comprobarse a sí mismo.
   ===================================================================== */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const S = String.fromCharCode(36);                 // el signo
const D = S + S;                                   // el delimitador sin nombre

/* UN DELIMITADOR PUEDE LLEVAR NOMBRE: el signo, unas letras, el signo. El
   proyecto ya usa varios así, y el que abre tiene que ser el mismo que
   cierra. La primera versión de este arnés solo entendía el delimitador
   SIN nombre y acusó de «bloque partido» a dos archivos que llevan meses
   corriendo bien — el arnés equivocándose sobre el código, que es la
   forma más rápida de que se deje de creer en él. */
const ABRE = new RegExp("\\" + S + "[A-Za-z_][A-Za-z0-9_]*\\" + S + "|\\" + S + "\\" + S);
const delimitadorEn = (t, i) => {
  if (t.startsWith(D, i)) return D;
  const m = ABRE.exec(t.slice(i, i + 40));
  return m && m.index === 0 ? m[0] : null;
};

const archivos = [
  ...globSync("supabase/**/*.sql"),
  ...globSync(".arnes/*.sql"),
].sort();

const fallas = [];

/** Recorre el texto marcando en qué está: comentario de línea, comentario
 *  de bloque, cadena, o código. Es lo mínimo para saber si un
 *  delimitador está donde debe. */
function recorrer(t) {
  const marcas = [];
  let i = 0, enLinea = false, enBloque = 0, enCadena = false;
  while (i < t.length) {
    if (!enLinea && !enBloque && !enCadena && t.startsWith("--", i)) { enLinea = true; i += 2; continue }
    if (!enLinea && !enCadena && t.startsWith("/*", i)) { enBloque++; i += 2; continue }
    if (enBloque && t.startsWith("*/", i)) { enBloque--; i += 2; continue }
    if (enLinea && t[i] === "\n") { enLinea = false; i++; continue }
    if (!enLinea && !enBloque && t[i] === "'") { enCadena = !enCadena; i++; continue }
    const d = delimitadorEn(t, i);
    if (d) {
      marcas.push({ pos: i, tag: d, dentro: enLinea ? "un comentario de línea"
                            : enBloque ? "un comentario de bloque"
                            : enCadena ? "una cadena" : null });
      i += d.length; continue;
    }
    i++;
  }
  return marcas;
}

const linea = (t, pos) => t.slice(0, pos).split("\n").length;

for (const f of archivos) {
  const t = readFileSync(f, "utf8");
  const marcas = recorrer(t);

  /* 1. NINGUNO DENTRO DE UN COMENTARIO. */
  for (const m of marcas.filter((x) => x.dentro)) {
    fallas.push(`${f}:${linea(t, m.pos)}: hay un delimitador de bloque dentro de ${m.dentro}. `
      + "Postgres lo ignora, pero el editor de Supabase lo cuenta y parte el archivo por "
      + "donde no debe. Nómbralo de otra forma en el texto.");
  }

  /* 2. Y QUE CADA NOMBRE VENGA EN PAREJAS. Uno impar deja un bloque sin
        cerrar, y el editor se lleva por delante todo lo que venga
        después. Se cuenta por NOMBRE: abrir con uno y cerrar con otro es
        no cerrarlo. */
  const porNombre = new Map();
  for (const m of marcas.filter((x) => !x.dentro))
    porNombre.set(m.tag, (porNombre.get(m.tag) ?? 0) + 1);
  for (const [tag, n] of porNombre) {
    if (n % 2 !== 0)
      fallas.push(`${f}: el delimitador «${tag}» aparece ${n} veces, un número impar: alguno se quedó sin pareja`);
  }

  /* 3. TROCEAR COMO TROCEA EL EDITOR, y mirar los trozos.
        Un trozo que empieza por `declare` o que trae un `declare` sin su
        `begin` es un bloque partido — exactamente lo que pasó. */
  let abierto = null, trozo = "", trozos = [];
  for (let i = 0; i < t.length; i++) {
    const d = delimitadorEn(t, i);
    if (d && (abierto === null || abierto === d)) {
      abierto = abierto === null ? d : null;
      trozo += d; i += d.length - 1; continue;
    }
    if (!abierto && t[i] === ";") { trozos.push(trozo); trozo = ""; continue }
    trozo += t[i];
  }
  trozos.push(trozo);

  for (const tr of trozos) {
    /* Se mira el trozo SIN comentarios: un `declare` dentro de una
       explicación no es un bloque partido. */
    const limpio = tr.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
    const tieneDeclare = /(^|\s)declare(\s|$)/i.test(limpio);
    const tieneBegin = /(^|\s)begin(\s|$)/i.test(limpio);
    const tieneEnd = /(^|\s)end(\s|;|$)/i.test(limpio);
    if (tieneDeclare && !(tieneBegin && tieneEnd)) {
      fallas.push(`${f}: al trocear como lo hace el editor queda un pedazo con «declare» `
        + "separado de su cuerpo. Es el bloque partido: el editor va a ejecutar las "
        + "líneas sueltas como SQL normal y las variables se van a leer como tablas.");
      break;
    }
  }
}

console.log(`Revisados ${archivos.length} archivos SQL.`);
if (fallas.length) {
  for (const f of fallas) console.log("✗ " + f);
  process.exitCode = 1;
} else {
  console.log("✓ Todos se trocean igual en psql y en el editor de Supabase: "
    + "ningún delimitador de bloque suelto en un comentario, y ningún bloque partido.");
}
