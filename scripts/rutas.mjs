/**
 * Comprueba que toda ruta que promete el registro de módulos tenga su
 * página. Se ejecuta antes de construir.
 *
 * Por qué existe: se registraron "Certificar" y "En tránsito" antes de
 * escribir sus páginas, el menú las mostró, y quien las tocó se encontró
 * un 404 sin forma de saber si era una pantalla pendiente o la app rota.
 * Un enlace muerto no se puede distinguir de una falla desde afuera.
 */
import { readdirSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";

const registro = readFileSync("src/modulos/registro.ts", "utf8");

/* SE PARTE POR EL "id:" DEL MÓDULO, que va a cuatro espacios.
   Antes se partía por cualquier "{" seguido de "id:", y el día que un
   módulo estrenó submódulos —que también traen id— el corte cayó en
   medio del módulo: sus secciones quedaron dentro de un trozo sin
   "activo: true" y dejaron de revisarse. El guardián se quedó callado
   justo para el módulo más nuevo, que es donde más falta hacía. */
const activos = registro.split(/\n {4}id: "/).slice(1);

const rutas = new Set();
for (const bloque of activos) {
  if (!/\n {4}activo:\s*true/.test(bloque)) continue;
  for (const m of bloque.matchAll(/ruta:\s*"([^"]+)"/g)) rutas.add(m[1]);
}

const faltan = [];
for (const r of rutas) {
  const dir = `src/app/(app)${r}`;
  if (!existsSync(`${dir}/page.tsx`)) faltan.push(`${r}  →  falta ${dir}/page.tsx`);
}

if (faltan.length) {
  console.error("\n✖ El registro de módulos promete rutas que no existen:\n");
  for (const f of faltan) console.error("   " + f);
  console.error(
    "\n  Cada una es un enlace del menú que lleva a un 404. Crea la página," +
    "\n  o saca la sección del registro hasta que exista.\n"
  );
  process.exit(1);
}
console.log(`✓ Las ${rutas.size} rutas del registro tienen su página.`);
