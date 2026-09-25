/* =====================================================================
   NINGÚN COLOR SE QUEDA SIN RESOLVER.

   ---------------------------------------------------------------------
   POR QUÉ ESTO EXISTE
   ---------------------------------------------------------------------
   `var(--lo-que-sea)` se lee exactamente igual esté declarado o no. Si
   no lo está, la propiedad no se aplica: un fondo se queda
   TRANSPARENTE, un color se queda heredado. Sin error, sin aviso en
   consola, y muchas veces solo se nota en un tema.

   Ya pasó tres veces en este proyecto:
     · `--c-papel-m` en el buscador compartido: la lista de materiales
       salió encima del formulario dejando ver los botones y el
       contador atravesados con el texto. En el teléfono era ilegible.
     · `--c-grupo-txt` en el maestro compartido: el texto del grupo se
       quedaba con el color heredado.
     · `--rt-fondo` en la tabla de salidas: el hover no hacía nada. Y
       roturas.css ya avisaba DOS VECES en sus comentarios de que ese
       token no existe — y aun así se volvió a colar.

   No se puede ver leyendo el código. Se ve contando.

   ---------------------------------------------------------------------
   QUÉ CUENTA COMO DECLARADO
   ---------------------------------------------------------------------
   Un token declarado en cualquier CSS del proyecto, o puesto desde el
   código con un estilo en línea —`"--acento": …`, que es como la
   portada le da su color a cada módulo—. Lo que lleva respaldo
   —`var(--x, #fff)`— no se mira: ese ya tiene qué usar si falta.

     node .arnes/css-tokens.mjs
   ===================================================================== */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

const lista = (patron) =>
  execSync(`find ${R("src")} -name "${patron}"`, { encoding: "utf8" })
    .trim().split("\n").filter(Boolean);

const css = lista("*.css");
const codigo = [...lista("*.tsx"), ...lista("*.ts")];

/* DÓNDE SE DECLARAN: en cualquier CSS, o desde el código con un estilo
   en línea — así es como la portada le pone su color a cada módulo. */
const declarados = new Set();
for (const f of css) {
  for (const m of readFileSync(f, "utf8").matchAll(/(--[a-z0-9-]+)\s*:/g)) declarados.add(m[1]);
}
for (const f of codigo) {
  for (const m of readFileSync(f, "utf8").matchAll(/"(--[a-z0-9-]+)"\s*:/g)) declarados.add(m[1]);
}

/* DÓNDE SE USAN SIN RESPALDO. Con respaldo no hace falta mirarlo: si
   el token falta, ya tiene qué usar. */
const usos = new Map();
for (const f of css) {
  /* FUERA LOS COMENTARIOS: este proyecto explica cada regla, y las
     explicaciones de estos mismos errores mencionan los tokens rotos.
     Sin quitarlas, el arnés se pondría rojo leyendo su propia
     historia. Ya me mordió tres veces por otros motivos. */
  const s = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of s.matchAll(/var\((--[a-z0-9-]+)\s*\)/g)) {
    if (declarados.has(m[1])) continue;
    const corto = f.replace(R("src"), "src");
    usos.set(m[1], [...(usos.get(m[1]) ?? []), corto]);
  }
}

console.log(`${css.length} hojas de estilo · ${declarados.size} tokens declarados`);
for (const [token, donde] of usos) {
  fallas.push(`${token} no está declarado en ninguna parte y se usa ${donde.length} vez/veces ` +
              `(${[...new Set(donde)].join(", ")}): ahí el color no resuelve y la propiedad ` +
              "no se aplica — un fondo se queda transparente, sin error y sin aviso");
}

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log(`✓ Los ${declarados.size} tokens que se usan sin respaldo están declarados: ningún ` +
            "color se queda sin resolver.");
