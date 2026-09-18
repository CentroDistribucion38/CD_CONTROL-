/* =====================================================================
   EL REGISTRO DE MÓDULOS, PROBADO CON EL CÓDIGO DE VERDAD.

   Roturas se mudó dentro de Quiebra y sus direcciones NO cambiaron. Eso
   deja el registro en una forma que antes no tenía: un módulo cuyas
   secciones viven en DOS raíces distintas —/quiebra/… y /roturas/…— y
   cuyas ramas no son prefijo de sus propias pantallas.

   Ahí es donde se rompen las dos funciones que deciden qué se ve:

     moduloPorRuta(ruta)  → en qué módulo estoy. Si falla, la pantalla se
                            queda SIN RIEL y sin migas: en la app
                            instalada no hay botón de atrás que salve.
     ramaDeRuta(m, ruta)  → en qué submódulo. Si falla, el riel muestra
                            las ramas en vez de las pantallas, o al revés.

   SE IMPORTA EL ARCHIVO DE VERDAD —compilado con esbuild, que ya está en
   el proyecto— y no una copia de su lógica. Una prueba que reimplementa
   lo que prueba solo demuestra que dos copias están de acuerdo.
   ===================================================================== */
import { build } from "esbuild";
import { unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

const salida = ".arnes/_registro.mjs";
await build({
  entryPoints: ["src/modulos/registro.ts"],
  outfile: salida,
  format: "esm",
  bundle: false,
  logLevel: "silent",
});
const { MODULOS, moduloPorRuta, ramaDeRuta, rutasRegistradas } =
  await import(pathToFileURL(salida).href + "?t=" + Date.now());
unlinkSync(salida);

const fallas = [];
const qb = MODULOS.find((m) => m.id === "quiebra");

/* ---------- 1. ROTURAS YA NO ES UN MÓDULO APARTE ---------- */
if (MODULOS.some((m) => m.id === "roturas"))
  fallas.push("Roturas sigue siendo un módulo aparte: tenía que quedar dentro de Quiebra");

/* ---------- 2. TRES RAMAS, Y LAS PANTALLAS DE ROTURAS ADENTRO ---------- */
const ids = (qb.ramas ?? []).map((r) => r.id).join(",");
if (ids !== "envase,en-sitio,salida")
  fallas.push(`las ramas de Quiebra son «${ids}» y tenían que ser envase,en-sitio,salida`);

for (const r of ["/roturas/en-sitio", "/roturas/salida", "/roturas/salida/tolvas"]) {
  if (!qb.secciones.some((s) => s.ruta === r))
    fallas.push(`${r} no quedó dentro de Quiebra`);
}

/* ---------- 3. NINGUNA SECCIÓN SIN RAMA (salvo las ocultas) ----------
   Una sección visible sin rama, en un módulo con ramas, no sale en
   ningún sitio: el riel solo lista las de la rama en la que uno está.
   Sería una pantalla registrada a la que no lleva ningún enlace. */
for (const s of qb.secciones) {
  if (!s.oculto && !s.rama)
    fallas.push(`la sección «${s.nombre}» (${s.ruta}) no dice a qué rama pertenece: no saldría en el menú`);
  if (s.rama && !qb.ramas.some((r) => r.id === s.rama))
    fallas.push(`la sección «${s.nombre}» apunta a la rama «${s.rama}», que no existe`);
}

/* ---------- 3b. A DÓNDE LLEVA CADA RAMA ----------
   Dos cosas que no se ven leyendo el registro y que dejan el riel
   dando vueltas:

   · UNA RAMA NO PUEDE APUNTAR A LA BIFURCACIÓN. Si la ruta de la rama
     es la del módulo, tocar «Envase» en el riel devuelve a la pantalla
     de escoger rama — un enlace a donde ya estás. La primera versión de
     esta prueba no lo cazaba: con la rama declarada así, TODAS las
     demás comprobaciones seguían en verde porque ramaDeRuta resuelve
     igual por sección. Salía bien y el menú quedaba en bucle.

   · Y TIENE QUE LLEVAR A UNA PANTALLA SUYA. Una rama que entra por una
     pantalla de otra rama mete a la persona en el submódulo
     equivocado, con el riel de ese otro. */
for (const r of qb.ramas ?? []) {
  if (r.ruta === qb.ruta)
    fallas.push(`la rama «${r.nombre}» entra por ${r.ruta}, que es la propia bifurcación: `
      + "tocarla en el riel devolvería a la pantalla de escoger");
  const suyas = qb.secciones.filter((s) => s.rama === r.id).map((s) => s.ruta);
  if (!suyas.includes(r.ruta))
    fallas.push(`la rama «${r.nombre}» entra por ${r.ruta}, que no es ninguna de sus pantallas `
      + `(${suyas.join(", ")})`);
}

/* ---------- 4. LAS DIRECCIONES DE ROTURAS NO SE MOVIERON ----------
   Es lo único que de verdad no se podía tocar: los permisos están
   guardados en la base como el TEXTO de la ruta. */
for (const s of qb.secciones) {
  if (/^\/quiebra\/roturas/.test(s.ruta))
    fallas.push(`${s.ruta}: las direcciones de Roturas no debían cambiar — los permisos `
      + "están guardados como texto y la gente perdería la pantalla en silencio");
}

/* ---------- 5. EN QUÉ MÓDULO ESTOY ---------- */
for (const ruta of ["/quiebra", "/quiebra/tablero", "/quiebra/diario", "/quiebra/rotura/maestro",
                    "/roturas", "/roturas/en-sitio", "/roturas/en-sitio/visto-bueno",
                    "/roturas/salida", "/roturas/salida/tolvas", "/roturas/salida/verificacion"]) {
  const m = moduloPorRuta(ruta);
  if (m?.id !== "quiebra")
    fallas.push(`moduloPorRuta("${ruta}") dio «${m?.id ?? "nada"}»: esa pantalla se quedaría sin riel`);
}

/* ---------- 6. EN QUÉ RAMA ESTOY ----------
   Es la parte nueva y la que más fácil se rompe: las pantallas de envase
   son /quiebra/tablero, /quiebra/diario, /quiebra/importar y
   /quiebra/rotura, y lo único que comparten es /quiebra — que es la
   ruta del MÓDULO. Si la rama se declarara con ese prefijo, la
   bifurcación caería dentro de su propia rama y no habría dónde
   escoger. */
const ESPERADO = {
  "/quiebra": null,                       // la bifurcación: se ven las ramas
  "/quiebra/tablero": "envase",
  "/quiebra/diario": "envase",
  "/quiebra/importar": "envase",
  "/quiebra/rotura": "envase",
  "/quiebra/rotura/tablero": "envase",
  "/quiebra/rotura/maestro": "envase",
  "/roturas/en-sitio": "en-sitio",
  "/roturas/en-sitio/maestro": "en-sitio",
  "/roturas/salida": "salida",
  "/roturas/salida/tolvas": "salida",
  "/roturas/salida/analisis": "salida",
};
for (const [ruta, esperada] of Object.entries(ESPERADO)) {
  const r = ramaDeRuta(qb, ruta)?.id ?? null;
  if (r !== esperada)
    fallas.push(`ramaDeRuta("${ruta}") dio «${r ?? "ninguna"}» y esperaba «${esperada ?? "ninguna"}»`);
}

/* ---------- 7. EL TABLERO YA NO ES /quiebra ---------- */
if (qb.secciones.some((s) => s.ruta === "/quiebra"))
  fallas.push("/quiebra sigue registrada como sección: ahora es la bifurcación, no una pantalla");
if (!rutasRegistradas().includes("/quiebra/tablero"))
  fallas.push("/quiebra/tablero no está registrada");

/* ---------- 8. LA PORTADA VIEJA DE ROTURAS SIGUE REGISTRADA Y OCULTA ----
   Oculta para que no salga dos veces en el menú; registrada para que no
   pierda su casilla en /admin/roles — quitarla dejaría la fila de
   permiso que cada rol ya tiene sobre «/roturas» sin forma de verse ni
   de cambiarse. */
const vieja = qb.secciones.find((s) => s.ruta === "/roturas");
if (!vieja) fallas.push("/roturas se borró del registro: su permiso se quedaría sin casilla en /admin/roles");
else if (!vieja.oculto) fallas.push("/roturas quedó visible en el menú: sería la bifurcación dicha dos veces");

console.log(fallas.length
  ? fallas.map((f) => "✗ " + f).join("\n")
  : "✓ QUIEBRA · el registro: Roturas quedó dentro, con sus direcciones intactas, "
    + "cada pantalla sabe en qué módulo y en qué submódulo está, y la bifurcación no cae dentro de ninguna rama.");
if (fallas.length) process.exitCode = 1;
