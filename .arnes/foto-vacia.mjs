/* =====================================================================
   NINGUNA PANTALLA SUBE EL ARCHIVO CRUDO.

   «La evidencia no subió, y sin ella la objeción no se sostiene:
    No content provided»

   ---------------------------------------------------------------------
   QUÉ ES «No content provided»
   ---------------------------------------------------------------------
   Es lo que contesta Supabase Storage cuando le llega un cuerpo VACÍO.
   Y llega vacío de verdad: en el iPhone, una foto que está en iCloud y
   todavía no se ha descargado se entrega al navegador como un `File` de
   CERO bytes. El nombre está —«image.jpg»—, el tamaño no.

   La pantalla se veía bien: la casilla decía «✓ image.jpg» en verde. Lo
   único que estaba mal era lo que iba dentro.

   ---------------------------------------------------------------------
   POR QUÉ ESTO SE MIDE LEYENDO EL CÓDIGO
   ---------------------------------------------------------------------
   El caso solo aparece con un archivo de cero bytes de un iPhone, y eso
   no se puede montar en un navegador de prueba. Lo que SÍ se puede
   comprobar es la regla: NINGUNA pantalla sube lo que salió del input;
   todas pasan por `sellar`, que lee el archivo, lo encoge y le quema la
   hora — y que ahora rechaza los de cero bytes con un mensaje en
   palabras.

   Tres pantallas lo hacían mal —el visto bueno del OL, levantar un
   hallazgo y la foto del después— y las tres subían la evidencia de
   algo que se discute. Esto se pone rojo si vuelve a pasar.

     node .arnes/foto-vacia.mjs
   ===================================================================== */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

/* LOS SITIOS SE BUSCAN, NO SE ESCRIBEN A MANO. Una lista escrita aquí
   se queda vieja el día que se agregue la cuarta pantalla que sube
   fotos, y el arnés diría verde sin haberla mirado. */
const archivos = execSync(
  `grep -rl "storage" --include=*.tsx --include=*.ts ${R("src")}`, { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);

console.log("archivo                                        sube");
let subidas = 0;
for (const ruta of archivos) {
  const crudo = readFileSync(ruta, "utf8");
  /* FUERA LOS COMENTARIOS ANTES DE MIRAR: este proyecto explica cada
     regla, y la explicación de este arreglo lleva escrito el error que
     se arregló. Ya me mordió tres veces. */
  const src = crudo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const ups = [...src.matchAll(/\.upload\(\s*([^,]+),\s*([^,)]+)/g)];
  for (const u of ups) {
    subidas++;
    const que = u[2].trim();
    const corto = ruta.replace(R("src"), "src");
    console.log(`${corto.slice(-45).padEnd(46)} ${que}`);
    /* LA REGLA ES EL TIPO, NO EL NOMBRE.
       La primera versión de esto exigía que la expresión terminara en
       `.blob`, y se puso roja con `p.foto` — que es un Blob de verdad:
       la cola de sin-señal guarda la foto YA SELLADA. Un arnés que se
       pone rojo con código correcto se acaba apagando, y entonces deja
       de avisar del que sí está mal.

       Así que lo que se comprueba es que lo subido esté DECLARADO como
       Blob: o la expresión acaba en `.blob`, o su nombre aparece en el
       archivo con tipo `Blob`. Un `File` del input no pasa ninguna de
       las dos. */
    const nombre = que.split(".").pop();
    const declaradoBlob = new RegExp(`\\b${nombre}\\??\\s*:\\s*Blob\\b`).test(src);
    ok(/\.blob$/.test(que) || declaradoBlob || que === "pdf",
       `${corto} sube «${que}», que no está declarado como Blob: si eso viene de un ` +
       "iPhone con la foto en iCloud son cero bytes y Supabase contesta " +
       "«No content provided»");
  }
}
ok(subidas >= 8, `solo se encontraron ${subidas} subidas: el buscador no está mirando bien`);

/* Y `sellar` TIENE QUE RECHAZAR EL ARCHIVO VACÍO. Sin esto, pasar por
   `sellar` no protegería de nada: dibujaría un lienzo en blanco y
   subiría un JPEG vacío, que es peor —ahí ya nadie se entera—. */
{
  const ev = readFileSync(R("src/lib/evidencia.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  ok(/archivo\.size === 0|archivo\.size <= 0|!archivo\.size/.test(ev),
     "`sellar` no comprueba que el archivo tenga contenido: un archivo de cero bytes " +
     "saldría como un JPEG en blanco y nadie se enteraría");
  ok(/onerror\s*=\s*\(\)\s*=>\s*mal\(new Error/.test(ev),
     "`sellar` pasa el evento de error tal cual: la pantalla mostraría «[object Event]»");
  ok(/tomada/.test(ev),
     "`sellar` no devuelve cuándo se tomó: la fecha del archivo es la del carrete, " +
     "que puede ser de hace un mes");
}

console.log("");
if (fallas.length) {
  fallas.forEach((f) => console.log("✘ " + f));
  console.log(`\n${fallas.length} problema(s).`);
  process.exit(1);
}
console.log(`✓ Las ${subidas} subidas de la plataforma mandan un blob ya preparado, y «sellar» ` +
            "rechaza el archivo vacío con un mensaje en palabras en vez de dejar que Supabase " +
            "conteste «No content provided».");
