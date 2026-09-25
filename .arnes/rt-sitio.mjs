/* =====================================================================
   ROTURA EN SITIO — el formulario de verdad, en Chromium.

   Tres cosas pedidas, y ninguna se puede dar por buena escribiéndola:

   1. EL EER NO PIDE MATERIAL. «Si en EER no es material, ¿para qué
      está? Quita ese campo de allí porque no me deja continuar.» Se
      comprueba que el campo NO esté en EER, que SÍ esté en producto
      terminado, y —lo que de verdad importaba— que en EER el botón de
      Siguiente quede ENCENDIDO sin haber escogido nada más.

   2. EL PROCESO HABILITA LAS CAUSAS. Sin proceso no hay causas que
      tocar; con proceso salen las siete, dos de ellas no asumidas.

   3. EL ÁREA, DEL MAESTRO Y COMO DESPLEGABLE. Las trece, en el orden
      del maestro, y obligatoria: sin ella el botón no manda.

   Y dos más que son del rediseño:

   0. REGISTRAR ES UN SOLO MÓDULO. Mientras se registra no puede haber
      titular, ni cifras, ni filtros, ni lista: el formulario y nada
      más. Y Cancelar devuelve la pantalla de consulta con todo eso.

   4. NO ES OTRA PANTALLA DEL NAVEGADOR. El formulario no puede estar en
      `position: fixed`: vive en el flujo de la página, arriba del
      todo y del ancho de la pantalla.

   5. NADA SE SALE a 1440 / 820 / 390 / 360, y lo que se toca mide
      44 px o más.

     node .arnes/rt-sitio.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

/* UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE. Ya pasó dos veces en este
   proyecto: la mutación SE DETECTA, y dos pasos después el script
   revienta por otra cosa —un selector que ya no existe, un click sobre
   algo que no está— y no imprime nada. Ni verde ni roja es lo único que
   de verdad no sirve: parece que no se probó. */
const caerse = (e) => {
  if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)) }
  console.log("✗ el arnés no pudo terminar: " + ((e && e.message) || e));
  process.exit(1);
};
process.on("uncaughtException", caerse);
process.on("unhandledRejection", caerse);

writeFileSync(R(".arnes/_nav-rt.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);

/* La base de mentiras ANOTA lo que se le manda: es la única forma de
   comprobar que en EER se manda el color y no un material inventado. */
writeFileSync(R(".arnes/_supa-rt.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    /* EL MAESTRO DE OPERARIOS DE MENTIRA: un solo PIN bueno. Un PIN
       apagado y uno inventado contestan IGUAL —lista vacía—, que es lo
       que hace la función de verdad: si el apagado contestara distinto,
       el maestro se podría ir adivinando de a cuatro dígitos desde la
       pantalla de registrar. */
    if (f === "operario_por_pin") {
      return a.p_pin === "4021"
        ? { data: [{ id: "o-1", nombre: "Genesis Visbal", empresa: "Easy", turno: "B" }], error: null }
        : { data: [], error: null };
    }
    return { data: [{ id: "id-1", codigo: "RB-0099", exige_foto: false }], error: null };
  },
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  from: () => ({ insert: async () => ({ error: null }) }),
});`);

writeFileSync(R(".arnes/_rt-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { EnSitio } from "../src/app/(app)/roturas/en-sitio/EnSitio";

const materiales = [
  { clave: "EER-AMBAR", nombre: "Envase retornable ámbar", tipo: "eer", color: "ambar", botellas_x_empaque: null, familia: "Ret", en_sitio: true, activo: true, orden: 1 },
  { clave: "EER-FLINT", nombre: "Envase retornable flint", tipo: "eer", color: "flint", botellas_x_empaque: null, familia: "Ret", en_sitio: true, activo: true, orden: 2 },
  { clave: "EER-GREEN", nombre: "Envase retornable green", tipo: "eer", color: "green", botellas_x_empaque: null, familia: "Ret", en_sitio: false, activo: true, orden: 3 },
  /* DOS ÁMBAR A PROPÓSITO. Es el caso que obliga a que EER tenga su
     desplegable: con uno solo, la base puede traducir color → material
     sin equivocarse; con dos, escoge uno EN SILENCIO y el informe del
     mes reparte el vidrio en el formato que no era. */
  { clave: "EER-AMBAR-750", nombre: "Envase retornable ámbar 750", tipo: "eer", color: "ambar", botellas_x_empaque: null, familia: "Ret", en_sitio: false, activo: true, orden: 4 },
  { clave: "PT-COST-330", nombre: "Cerveza Costeña 330 ml", tipo: "producto_terminado", color: null, botellas_x_empaque: 30, familia: "Ret", en_sitio: true, activo: true, orden: 11 },
  /* UNA LATA, UN PET Y UNO SIN FAMILIA. Sin ellos, «en producto no
     sale ni PET ni lata» pasaría sin probar nada — y el de la familia
     nula comprueba lo contrario: que un dato que falta NO esconde el
     material. */
  { clave: "PT-LATA-330", nombre: "Costeña Lta 330cc X 24", tipo: "producto_terminado", color: null, botellas_x_empaque: 24, familia: "Lata", en_sitio: false, activo: true, orden: 13 },
  { clave: "PT-PET-600", nombre: "Pony Malta Pet 600cc X 12", tipo: "producto_terminado", color: null, botellas_x_empaque: 12, familia: "Pet", en_sitio: false, activo: true, orden: 14 },
  /* CON MAYÚSCULAS Y ESPACIOS: el maestro lo escribe «Lata», pero el
     día que alguien lo cargue como « LATA » el filtro tiene que seguir
     funcionando. */
  { clave: "PT-LATA-269", nombre: "Aguila Lta 269cc X 30", tipo: "producto_terminado", color: null, botellas_x_empaque: 30, familia: " LATA ", en_sitio: false, activo: true, orden: 15 },
  { clave: "PT-SIN-FAM", nombre: "Producto sin familia puesta", tipo: "producto_terminado", color: null, botellas_x_empaque: 20, familia: null, en_sitio: false, activo: true, orden: 16 },
  /* Y DOS DE PRODUCTO TERMINADO, para que «no deja seguir sin escoger
     material» siga midiendo algo: con uno solo vendría puesto y la
     comprobación pasaría sola. */
  { clave: "PT-COST-175", nombre: "Envase Costeña 175R", tipo: "producto_terminado", color: null, botellas_x_empaque: 24, familia: "Tw", en_sitio: true, activo: true, orden: 12 },
  /* Y CIEN MÁS, porque el maestro de inventario trae 494 y un
     desplegable de siete no prueba lo que pasa con 494. */
  ...Array.from({ length: 100 }, (_, i) => ({
    clave: "PT-" + (2000 + i), nombre: "Aguila Cero Lta 355Cc X " + (i + 1),
    tipo: "producto_terminado", color: null, botellas_x_empaque: 24,
    /* LOS CIEN NO ESTÁN MARCADOS: son el «resto del maestro» que
       tiene que salir al escribir y NO de entrada. */
    familia: "Tw", en_sitio: false, activo: true, orden: 100 + i,
  })),
];
/* LOS ENVASES SIN COLOR: es como llega el maestro de inventario el
   primer día —el SQL no puede adivinar de qué color es cada vidrio— y
   es el caso que dejaba el desplegable de EER vacío y el registro
   trabado. */
const sinColor = materiales.map((m: any) =>
  m.tipo === "eer" ? { ...m, color: null } : m);
const procesos = [
  { clave: "lineas", nombre: "Líneas", activo: true, orden: 1 },
  { clave: "t1", nombre: "T1", activo: true, orden: 2 },
  { clave: "traspaso", nombre: "Traspaso", activo: true, orden: 3 },
  { clave: "maquila", nombre: "Maquila", activo: true, orden: 4 },
  { clave: "sorting", nombre: "Sorting", activo: true, orden: 5 },
  { clave: "sin_identificar", nombre: "Sin identificar", activo: true, orden: 6 },
  { clave: "otro", nombre: "Otro", activo: true, orden: 9 },
];
/* Las trece del maestro, en el orden del maestro. */
const areas = [
  ["bahias_t1","Bahías T1",1],["tandem_lineas","Tándem Líneas",2],["traspasos","Traspasos",3],
  ["maquila","Maquila",4],["antiguo_patio_t2","Antiguo Patio T2",5],["sorting","Sorting",6],
  ["plazoleta","Plazoleta",7],["calle_a","Calle A",10],["calle_b","Calle B",11],
  ["calle_c","Calle C",12],["calle_d","Calle D",13],["calle_e","Calle E",14],
  ["estanteria","Estantería",20],
].map(([clave, nombre, orden]: any) => ({ clave, nombre, activo: true, orden }));
/* Las siete que se pidieron: cinco asumidas y dos no. */
const causas = [
  ["estibas_malas","Estibas en mal estado","asumida",false,1],
  ["mal_arrumado","Módulo mal arrumado","asumida",false,2],
  ["condiciones","Condiciones del sitio","asumida",false,3],
  ["comportamiento","Comportamiento del personal","asumida",false,4],
  ["falla_montacarga","Falla mecánica del montacargas","asumida",false,5],
  ["falla_maquinas","Falla de las máquinas","no_asumida",true,10],
  ["falla_depa","Falla del pallet DEPA","no_asumida",true,11],
].map(([clave, nombre, grupo, exige_foto, orden]: any) =>
  ({ clave, nombre, grupo, exige_foto, activo: true, orden }));

const roturas = [1, 2, 3].map((i) => ({
  id: "r" + i, codigo: "RB-000" + i, material: "EER-AMBAR",
  material_nombre: "Envase retornable ámbar", tipo: "eer", color: "ambar",
  unidades: i * 4, contaminadas: null, botellas: null,
  unidades_liquido: 0, unidades_vidrio: i * 4,
  proceso: "lineas", proceso_nombre: "Líneas",
  area: "plazoleta", area_nombre: "Plazoleta",
  causa: "estibas_malas", causa_nombre: "Estibas en mal estado",
  grupo: "asumida", exige_foto: false, descripcion: null,
  lat: null, lng: null, precision_m: null,
  estado: "esperando", esperando: true, cuenta: false,
  reportada_por: "u1", reportada_en: "2026-09-23T12:00:00Z",
  decidida_por: null, decidida_en: null, nota_decision: null,
  fotos: 0, le_falta_foto: false, minutos: 30,
}));

createRoot(document.getElementById("r")!).render(
  <EnSitio esperando={3} roturas={roturas as any} nombres={{ u1: "Genesis Visbal" }}
           materiales={((window as any).SINCOLOR ? sinColor : materiales) as any}
           materialesDe={(window as any).DE ?? "inventario"}
           procesos={procesos as any}
           areas={areas as any} causas={causas as any} puedeEditar />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_rt-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-rt.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-rt.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css   = readFileSync(R("src/app/(app)/roturas/roturas.css"), "utf8");
const glob  = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (ancho = 1440, tema = "", alto = 900) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
    <div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>window.DE="inventario";window.SINCOLOR=false</script>
    <script>${js}</script></body></html>`);
  /* La pantalla abre REGISTRANDO, así que lo primero que existe es el
     formulario, no las cifras. */
  await pg.waitForSelector(".rt-rep");
  await pg.evaluate(() => { window.llamadas = [] });
};
/* LA PANTALLA ABRE CON EL FORMULARIO PUESTO: quien puede editar entra a
   «Registrar» y ya está registrando. Abrir ya no es tocar el «+».

   Y AHORA ABRE EN EL PASO 0 —«la primera pregunta que debe salir, antes
   de iniciar, es rotura reportada por OPM o encontrada»—, así que
   «abrir» incluye contestarla. Se contesta «Me la encontré», que es la
   que no pide PIN: todo lo que se mide más abajo es del material y del
   proceso, y hacerlo pasar por el PIN en cada prueba sería medir el PIN
   catorce veces y el resto una. El PIN tiene su propia sección. */
const abrir = async () => {
  await pg.waitForSelector(".rt-rep");
  if (await pg.isVisible(".rt-rep .rp-origen")) {
    await pg.click(".rt-rep .rp-origen button:has-text('Me la encontré')");
    await pg.click(".rt-rep .pie button.si");
  }
  await pg.waitForSelector(".rt-rep .cel-step");
};
const llamadas = () => pg.evaluate(() => window.llamadas ?? []);

/* ---------------------------------------------------------------------
   0 · REGISTRAR ES LA CONSOLA DE TRASPASOS: formulario + contexto

   «El registro debe ser un solo módulo, no puede haber más cosas» y
   «mira el diseño del registro de Traspasos, quiero algo chévere
   también para eso» son la misma cosa dicha dos veces: lo que sobraba
   era la PANTALLA DE CONSULTA metida debajo —las cuatro cifras, los
   filtros y la lista entera—, no el contexto al lado, que en Traspasos
   existe y es justo lo que le gusta.

   Así que aquí se exige la consola: cabecera con su KPI, formulario a
   la izquierda, contexto a la derecha. Y se prohíbe lo otro.
   ------------------------------------------------------------------ */
await monta();
ok(await pg.isVisible(".rt-rep"),
   "al entrar no sale el formulario: la pantalla se llama Registrar y obliga a tocar el «+»");

/* ESTA VA DE PRIMERA A PROPÓSITO, antes de cualquier click. Si el paso 0
   desaparece, todo lo que sigue se cae por su cuenta —el botón de abajo
   deja de decir «Cancelar», el click se queda esperando treinta
   segundos— y el arnés acaba muriéndose de un timeout que no explica
   nada. Puesta aquí, la razón de verdad queda escrita ANTES del
   accidente. */
ok(await pg.isVisible(".rt-rep .rp-origen"),
   "la pantalla no abre preguntando de dónde salió la rotura: abre en el material, y esa pregunta va antes de iniciar");

/* LA CABECERA DICE REGISTRAR, no «Lo que se rompió»: es la pantalla de
   registrar, y su titular tiene que decirlo. */
ok(/Registrar/i.test(await pg.textContent(".cabeza h1")),
   `el titular de la pantalla de registro dice «${await pg.textContent(".cabeza h1")}»`);
ok(await pg.isVisible(".cabeza .kpi"), "falta el KPI de la cabecera, como en Traspasos");
for (const c of ["consola", "hoy-cifra", "hoy"]) {
  ok((await pg.$$(`.rt .${c}`)).length > 0,
     `falta «${c}»: el registro tiene que ser la consola de Traspasos, no el formulario suelto`);
}

/* Y NADA DE LA PANTALLA DE CONSULTA. Eso es lo que sobraba. */
for (const [sel, que] of [
    [".cifras", "las cuatro cifras"],
    [".filtros", "los filtros"],
    [".filas", "la lista entera de roturas"],
    [".mas", "el botón «+»"]]) {
  ok((await pg.$$(sel)).length === 0,
     `registrando todavía sale ${que}: eso es la pantalla de consulta, no el registro`);
}

/* ES UN PANEL, NO UNA VENTANA: no lleva barra negra ni aspa de cerrar.
   «Separemos este registro de seleccionar la X: debe ser un panel como
   el modulo de registro de Traspasos.» */
ok((await pg.$$(".rt-rep .barra")).length === 0,
   "el formulario sigue con la barra negra de ventana");
ok((await pg.$$eval(".rt-rep button", (b) => b.filter((x) => /✕|×/.test(x.textContent)).length)) === 0,
   "el formulario sigue con el aspa de cerrar: se sale por Cancelar");
ok(await pg.isVisible(".rt-rep > .cab h2"),
   "el panel no tiene la cabecera con titulo, como «Viaje nuevo» en Traspasos");

/* Y CANCELAR DEVUELVE LA PANTALLA DE CONSULTA, con todo lo que se
   quitó. No se pierde nada: se separa. Se prueba desde el paso 0, que
   es donde abre y donde el botón dice «Cancelar». */
await pg.click(".rt-rep .pie button:has-text('Cancelar')");
await pg.waitForSelector(".cifras");
ok(!(await pg.isVisible(".rt-rep")), "Cancelar no cierra el formulario");
for (const [sel, que] of [
    [".cabeza", "el titular"], [".cifras", "las cifras"],
    [".filtros", "los filtros"], [".filas", "la lista"], [".mas", "el «+»"]]) {
  ok(await pg.isVisible(sel), `al cerrar el formulario no volvió ${que}`);
}
ok(/Lo que se rompió/i.test(await pg.textContent(".cabeza h1")),
   "al cerrar, el titular sigue diciendo Registrar: esa ya es la pantalla de consulta");
ok((await pg.$$(".rt .consola")).length === 0,
   "la consola del registro se quedó puesta en la pantalla de consulta");
await pg.click(".mas");
await abrir();

/* EL MISMO VOCABULARIO QUE TRASPASOS, clase por clase. «Lo quiero como
   el modulo de Traspasos.» No es un parecido de ojo: las clases del
   formulario de viajes tienen que existir en este. */
/* Las del paso 1. */
for (const c of ["cuerpo-f", "linea-campos", "rot-campo", "seg", "conteo",
                 "cel-step", "campo-suelto"]) {
  ok((await pg.$$(`.rt-rep .${c}`)).length > 0,
     `falta la clase «${c}» en el paso 1: el formulario tiene que ser el mismo de Traspasos, no uno parecido`);
}
/* Y las de la version vieja no pueden quedar vivas: CSS y marcado de
   algo que ya no existe es lo que hace que el proximo arnes mida lo
   que no esta en la pantalla. */
for (const c of ["opciones", "vidrios", "contador", "dos-col", "barra"]) {
  ok((await pg.$$(`.rt-rep .${c}`)).length === 0,
     `quedo viva la clase vieja «${c}»`);
}

/* =====================================================================
   0bis · LA PRIMERA PREGUNTA, ANTES DE TODO

   «La primera pregunta que debe salir, antes de iniciar, es rotura
   reportada por OPM o encontrada. Como validación colocaré el PIN a
   cada OPM, que ese será como la clave para que en el informe oculto
   tengamos hora, turno, fecha, nombre del operador.»

   LO QUE SE MIDE AQUÍ ES LA PANTALLA, no la base. La base ya tiene su
   arnés —seis frenos, seis mutaciones— y ya frena la «encontrada con
   PIN» con una función y un CHECK. Pero que la base rechace no es lo
   mismo que que la pantalla funcione: si la pantalla manda un PIN
   debajo de una encontrada, lo que ve quien registra es la rotura
   guardándose bien y un error críptico, o nada.
   ===================================================================== */
await monta();
{
  /* 1. SALE PRIMERO Y NO SE PUEDE SALTAR. */
  ok(await pg.isVisible(".rt-rep .rp-origen"),
     "la pantalla no abre preguntando de dónde salió la rotura: abre en el material");
  ok((await pg.$$(".rt-rep .cel-step")).length === 0,
     "el contador de unidades ya está a la vista en la primera pregunta: los pasos se encimaron");
  ok(await pg.isDisabled(".rt-rep .pie button.si"),
     "deja pasar sin contestar quién la reportó");
  ok(/Falta decir quién la reportó/i.test(await pg.textContent(".rt-rep .pie button.si")),
     "el botón se queda apagado y mudo en la primera pregunta");

  /* 2. EL PIN SOLO SALE SI LA REPORTÓ UN OPM. Una encontrada no lleva
     operario: pedirle el PIN sería pedirle que ponga a alguien en un
     reporte que nadie hizo. */
  await pg.click(".rt-rep .rp-origen button:has-text('Me la encontré')");
  ok((await pg.$$(".rt-rep .rp-pin")).length === 0,
     "en «me la encontré» igual pide el PIN de un operario que no reportó nada");
  ok(!(await pg.isDisabled(".rt-rep .pie button.si")),
     "con «me la encontré» contestada el botón sigue apagado y no falta nada más");

  await pg.click(".rt-rep .rp-origen button:has-text('La reportó un OPM')");
  ok(await pg.isVisible(".rt-rep .rp-pin input"), "al decir que la reportó un OPM no pide el PIN");
  ok(await pg.isDisabled(".rt-rep .pie button.si"),
     "con OPM escogido y sin PIN ya deja seguir");

  /* 3. NO BASTA CON TECLEAR CUATRO DÍGITOS: TIENE QUE SALIR EL NOMBRE.
     Cuatro dígitos con guante se equivocan, y un PIN que nadie confirma
     acaba firmando lo que registró otro. El fixture contesta vacío al
     PIN que no existe. */
  const teclear = async (v) => {
    await pg.evaluate((val) => {
      const el = document.querySelector(".rt-rep .rp-pin input");
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      set.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, v);
  };
  await teclear("9999");
  await pg.waitForSelector(".rt-rep .rp-mal", { timeout: 2000 }).catch(() => {});
  ok(await pg.isVisible(".rt-rep .rp-mal"),
     "un PIN que no existe no dice nada: se queda callado y la persona lo teclea tres veces");
  ok(await pg.isDisabled(".rt-rep .pie button.si"),
     "deja seguir con un PIN que la base no reconoció");

  await teclear("4021");
  await pg.waitForSelector(".rt-rep .rp-quien", { timeout: 2000 }).catch(() => {});
  ok(/Genesis Visbal/i.test((await pg.textContent(".rt-rep .rp-quien")) ?? ""),
     "con un PIN bueno no sale el NOMBRE del operario: no hay cómo saber si se tecleó mal");
  ok(!(await pg.isDisabled(".rt-rep .pie button.si")),
     "con el operario confirmado el botón sigue apagado");

  /* 4. CAMBIAR A «ENCONTRADA» BORRA EL PIN. Es la regla que la base
     sostiene con un CHECK; aquí se exige que la PANTALLA no llegue a
     mandarlo, porque un CHECK que salta es un error que ve el usuario. */
  await pg.click(".rt-rep .rp-origen button:has-text('Me la encontré')");
  await pg.click(".rt-rep .rp-origen button:has-text('La reportó un OPM')");
  ok((await pg.inputValue(".rt-rep .rp-pin input")) === "",
     "al pasar por «me la encontré» el PIN se quedó escrito: vuelve a quedar alguien puesto");

  /* 5. Y LO QUE SE CONTESTÓ LLEGA A LA BASE. Sin esto, todo lo de
     arriba es una pantalla bonita que no guarda nada — que es
     exactamente lo que pasó con la primera entrega. */
  await teclear("4021");
  await pg.waitForSelector(".rt-rep .rp-quien", { timeout: 2000 }).catch(() => {});
  await pg.click(".rt-rep .pie button.si");
  await pg.waitForSelector(".rt-rep .cel-step");
  await pg.click(".rt-rep .seg button:has-text('EER')");
  await pg.click(".rt-rep .seg.vidrio button.flint");
  await pg.click(".rt-rep .pie button.si");
  await pg.waitForSelector("#rt-area");
  await pg.click(".rt-rep .chips button:has-text('Líneas')");
  await pg.selectOption("#rt-area", "plazoleta");
  await pg.click(".rt-rep .chips.causas button:has-text('Estibas en mal estado')");
  await pg.click(".rt-rep .pie button.si");
  await pg.waitForFunction(
    () => (window.llamadas ?? []).some((l) => l.f === "rotura_marcar_origen"),
    null, { timeout: 3000 }).catch(() => {});
  const o = (await llamadas()).find((x) => x.f === "rotura_marcar_origen");
  ok(!!o, "la rotura se guardó SIN decir de dónde salió: la pregunta no llega a la base");
  ok(o?.a?.p_origen === "opm", `se mandó el origen «${o?.a?.p_origen}» y era «opm»`);
  ok(o?.a?.p_pin === "4021", `no se mandó el PIN del operario: ${JSON.stringify(o?.a?.p_pin)}`);
  /* Y VA DESPUÉS DE REGISTRAR, con el id de la rotura. Si fuera al
     revés no habría a qué pegarle el origen. */
  const reg = (await llamadas()).findIndex((x) => x.f === "rotura_registrar");
  const org = (await llamadas()).findIndex((x) => x.f === "rotura_marcar_origen");
  ok(reg >= 0 && org > reg, "el origen se marca antes de que la rotura exista");
  ok(o?.a?.p_id === "id-1", `el origen no va pegado al id de la rotura: ${o?.a?.p_id}`);
}

/* Y LA ENCONTRADA NO MANDA PIN. */
await monta();
{
  await pg.click(".rt-rep .rp-origen button:has-text('Me la encontré')");
  await pg.click(".rt-rep .pie button.si");
  await pg.waitForSelector(".rt-rep .cel-step");
  await pg.click(".rt-rep .seg button:has-text('EER')");
  await pg.click(".rt-rep .seg.vidrio button.flint");
  await pg.click(".rt-rep .pie button.si");
  await pg.waitForSelector("#rt-area");
  await pg.click(".rt-rep .chips button:has-text('Líneas')");
  await pg.selectOption("#rt-area", "plazoleta");
  await pg.click(".rt-rep .chips.causas button:has-text('Estibas en mal estado')");
  await pg.click(".rt-rep .pie button.si");
  await pg.waitForFunction(
    () => (window.llamadas ?? []).some((l) => l.f === "rotura_marcar_origen"),
    null, { timeout: 3000 }).catch(() => {});
  const o = (await llamadas()).find((x) => x.f === "rotura_marcar_origen");
  ok(o?.a?.p_origen === "encontrada", `en «me la encontré» se mandó «${o?.a?.p_origen}»`);
  ok(o?.a?.p_pin === null,
     `en una encontrada se mandó un PIN: ${JSON.stringify(o?.a?.p_pin)} — eso pone a alguien en un reporte que no hizo`);
}

/* ---------------------------------------------------------------------
   1 · EL EER TAMBIÉN PIDE MATERIAL, Y FILTRADO POR EL COLOR

   «En sitio, en EER debe aparecer también el desplegable del material.»

   UN DÍA NO LO PIDIÓ, y el argumento era bueno mientras fue cierto: el
   color ES el material, uno por color, y la base traduce. Deja de ser
   cierto en cuanto el maestro tiene dos ámbar —330 y 750—: entonces la
   traducción escoge el primero por orden EN SILENCIO, nadie lo ve en la
   pantalla, y el informe del mes reparte el vidrio en el formato que no
   era. Por eso el fixture de arriba tiene dos ámbar.

   LO QUE SE MIDE NO ES QUE EL CAMPO ESTÉ: es que la lista traiga SOLO
   los del color escogido, que cambie al cambiar el color, y que cuando
   hay uno solo venga puesto — si hay que abrir un desplegable de un
   renglón para escoger lo único que se podía escoger, el campo es un
   toque cobrado por nada y la gente lo va a odiar.
   ------------------------------------------------------------------ */
await monta();
await abrir();
await pg.click(".rt-rep .seg button:has-text('EER')");
ok(await pg.isVisible("#rt-mat"), "en EER no aparece el campo del material");
ok(await pg.isVisible(".rt-rep .seg.vidrio"),
   "en EER no está el color del vidrio, que es lo que acota la lista");

/* LO QUE OFRECE EL CAMPO SE LEE ABRIÉNDOLO, no leyendo `option`s: ya no
   es un `<select>`. Se abre, se leen los códigos y se cierra. */
const ofrece = async () => {
  await pg.click("#rt-mat");
  await pg.waitForSelector(".rt-rep .bl-lista", { timeout: 2000 }).catch(() => {});
  const v = await pg.$$eval(".rt-rep .bl-op span", (e) => e.map((x) => x.textContent.trim()));
  /* SE CIERRA Y SE ESPERA A QUE VUELVA EL CAMPO.
     Mientras la lista está abierta, `#rt-mat` NO EXISTE: el botón se
     cambia por el campo de escribir, que no lleva id. Si esto seguía
     sin esperar, la comprobación siguiente le preguntaba a un elemento
     que todavía no había vuelto y el arnés se ponía rojo una de cada
     tres corridas, siempre en otro sitio. Un arnés que falla a veces se
     acaba ignorando siempre. */
  await pg.keyboard.press("Escape");
  await pg.waitForSelector("#rt-mat", { timeout: 4000 });
  return v;
};
const puesto = async () => (await pg.textContent("#rt-mat")) ?? "";

/* ÁMBAR: hay dos, así que no puede venir puesto ninguno y hay que
   escoger. Es justo el caso por el que el campo existe. */
await pg.click(".rt-rep .seg.vidrio button.ambar");
{
  const op = await ofrece();
  ok(op.length === 2 && op.every((c) => c.startsWith("EER-AMBAR")),
     `en ámbar la lista trae ${JSON.stringify(op)} y debería traer solo los ámbar`);
  ok(/Escribe para buscar/.test(await puesto()),
     "con dos ámbar ya viene uno escogido: eso es escoger por quien está mirando la estiba");
  ok(await pg.isDisabled(".rt-rep .pie button.si"),
     "con dos ámbar deja seguir sin decir cuál era: la base va a adivinar");
}

/* FLINT: hay uno solo, así que viene puesto y no hay que tocar nada. */
await pg.click(".rt-rep .seg.vidrio button.flint");
{
  const op = await ofrece();
  ok(op.length === 1 && op[0] === "EER-FLINT",
     `al cambiar a flint la lista quedó en ${JSON.stringify(op)}: no se filtró por el color nuevo`);
  /* SE ESPERA A QUE SE ACOMODE: el material lo pone un efecto, que
     corre DESPUÉS del render — y en una máquina cargada esos dos
     segundos de tope se quedaban cortos y el arnés se ponía rojo por
     lentitud, no por un error de la pantalla. Un arnés que falla a
     veces se acaba ignorando siempre. */
  const ok1 = await pg.waitForFunction(
    () => /EER-FLINT/.test(document.querySelector("#rt-mat")?.textContent ?? ""),
    null, { timeout: 8000 }).then(() => true, () => false);
  if (!ok1) console.log("DEBUG flint:", JSON.stringify(await pg.evaluate(() => {
    const e = document.querySelector("#rt-mat");
    return { hay: !!e, tag: e?.tagName, txt: e?.textContent, val: e?.value };
  })));
  ok(ok1, "con un solo flint no viene puesto: obliga a abrir una lista de un renglón");
  ok(!(await pg.isDisabled(".rt-rep .pie button.si")),
     "en flint el botón de Siguiente está apagado y no hay nada más que escoger");
}

/* Y NO SE QUEDA UN MATERIAL DE OTRO COLOR. Volver a ámbar tiene que
   soltar el flint: si quedara puesto se mandaría un ámbar marcado como
   flint, y en la pantalla las dos cosas se ven igual de bien. */
await pg.click(".rt-rep .seg.vidrio button.ambar");
ok(/Escribe para buscar/.test(await puesto()),
   "al volver a ámbar se quedó puesto el material del flint");

/* ---------------------------------------------------------------------
   1b · EN PRODUCTO NO SALE NI PET NI LATA

   «En quiebra en sitio, que en materiales, en producto, no salga ni PET
    ni lata.»

   EN SITIO SE REGISTRA LO QUE SE ROMPE COMO VIDRIO. La lata se abolla y
   el PET se revienta, pero ninguno de los dos entra en el análisis de
   vidrio por color ni sale por la tolva — y tenerlos en el desplegable
   es ofrecer un camino que después no cuadra con nada.

   SE FILTRA POR LA FAMILIA DEL MAESTRO —`Lata`, `Pet`, `Ret`, `Tw`— y
   no por el nombre: buscar «Lta» en el texto dejaría fuera lo que
   alguien escriba distinto mañana y dentro lo que lleve esas letras por
   casualidad.

   TRES COSAS, Y LAS TRES IMPORTAN:
     · que la lata y el PET NO salgan,
     · que lo que SÍ es vidrio siga saliendo,
     · y que un producto SIN familia puesta tampoco se esconda:
       esconder algo por un dato que falta es cómo alguien se queda sin
       poder registrar una rotura que sí pasó, y sin saber por qué.
   ------------------------------------------------------------------ */
{
  await monta();
  await abrir();
  await pg.click(".rt-rep .seg button:has-text('Producto')");
  await pg.click("#rt-mat");
  await pg.waitForSelector(".rt-rep .bl-lista", { timeout: 2000 }).catch(() => {});
  /* SE LEEN LAS CLAVES Y NO LOS NOMBRES: el nombre de la lata lleva
     «Lta» y el del vidrio no, así que comparar nombres probaría el
     fixture en vez del filtro. */
  const claves = await pg.$$eval(".rt-rep .bl-op span", (e) => e.map((x) => x.textContent.trim()));

  ok(claves.length > 0, "el desplegable de producto salió vacío");
  ok(!claves.includes("PT-LATA-330"), "sale una LATA en el desplegable de producto de en sitio");
  ok(!claves.includes("PT-PET-600"), "sale un PET en el desplegable de producto de en sitio");
  ok(!claves.includes("PT-LATA-269"),
     "una lata cargada como « LATA » se volvió a colar: el filtro no aguanta mayúsculas ni espacios");
  ok(claves.includes("PT-COST-330") && claves.includes("PT-COST-175"),
     `el filtro se llevó por delante el vidrio: ${claves.slice(0, 4).join(", ")}`);
  /* EL DE FAMILIA NULA SE BUSCA, porque de entrada solo salen los
     marcados. Lo que se comprueba sigue siendo lo mismo: que un dato
     que falta —la familia— no lo tape. */
  await pg.fill(".rt-rep .bl-teclea", "PT-SIN-FAM");
  await pg.waitForTimeout(80);
  const sinFam = await pg.$$eval(".rt-rep .bl-op span", (e) => e.map((x) => x.textContent.trim()));
  ok(sinFam.includes("PT-SIN-FAM"),
     "un producto SIN familia puesta se escondió: un dato que falta no puede tapar un material");
  await pg.fill(".rt-rep .bl-teclea", "");
  await pg.waitForTimeout(60);

  /* Y BUSCANDO «lata» TAMPOCO APARECE. El buscador filtra sobre lo que
     le dieron, así que si esto encontrara algo querría decir que la
     lata sí estaba en la lista y solo no se veía de entrada. */
  await pg.fill(".rt-rep .bl-teclea", "lta");
  await pg.waitForTimeout(80);
  const buscando = await pg.$$eval(".rt-rep .bl-op span", (e) => e.map((x) => x.textContent.trim()));
  ok(!buscando.some((c) => c.startsWith("PT-LATA")),
     `buscando «lta» aparece una lata: ${buscando.slice(0, 3).join(", ")}`);
}

/* ---------------------------------------------------------------------
   1c · EL DESPLEGABLE ARRANCA CON LOS POCOS, NO CON LOS CIENTOS

   «Que en el desplegable se vea esto —cada uno corresponde a producto o
    EER— pero si busco los demás que aparezcan; es para que el scroll no
    sea extenso.»

   EL MAESTRO TIENE 494 MATERIALES porque es el maestro de TODO lo que
   entra y sale del CD. En sitio se rompen unos cincuenta, y abrir ese
   desplegable con los 494 es bajar treinta pantallazos de pie y con
   guante para encontrar el mismo de siempre.

   LAS DOS MITADES IMPORTAN IGUAL:
     · de entrada salen SOLO los marcados,
     · y escribiendo aparecen TODOS.
   La segunda es la que evita el daño: esconder un material sería
   impedir registrar una rotura que de verdad pasó, y eso es peor que un
   scroll largo. Por eso se comprueba que uno NO marcado aparezca al
   buscarlo por su código.
   ------------------------------------------------------------------ */
{
  await monta();
  await abrir();
  await pg.click(".rt-rep .seg button:has-text('Producto')");
  await pg.click("#rt-mat");
  await pg.waitForSelector(".rt-rep .bl-lista", { timeout: 2000 }).catch(() => {});

  const deEntrada = await pg.$$eval(".rt-rep .bl-op span", (e) => e.map((x) => x.textContent.trim()));
  /* DOS: los dos productos de vidrio marcados. Los cien «Tw» y el de
     familia nula están sin marcar y no deben salir todavía. */
  ok(deEntrada.length === 2,
     `el desplegable arranca con ${deEntrada.length} y deben ser los 2 marcados: ` +
     "con los cientos, el scroll vuelve a ser el de antes");
  ok(deEntrada.includes("PT-COST-330") && deEntrada.includes("PT-COST-175"),
     `no salen los marcados de entrada: ${deEntrada.join(", ")}`);
  ok(!deEntrada.includes("PT-2000"),
     "salió de entrada uno que NO está marcado: la marca no está filtrando");

  /* Y SE DICE QUE HAY MÁS. Sin ese renglón, quien no encuentre el suyo
     va a creer que no está en el maestro y va a dejar de registrar. */
  const nada = await pg.textContent(".rt-rep .bl-lista");
  ok(/salen al escribir|más/i.test(nada),
     "no se dice que hay más materiales ni cómo llegar a ellos");
  await pg.screenshot({ path: ".arnes/rt-sitio-corta.png" });

  /* LA OTRA MITAD: escribiendo aparecen todos. */
  await pg.fill(".rt-rep .bl-teclea", "PT-2050");
  await pg.waitForTimeout(80);
  const buscado = await pg.$$eval(".rt-rep .bl-op span", (e) => e.map((x) => x.textContent.trim()));
  ok(buscado.includes("PT-2050"),
     `un material sin marcar no aparece ni buscándolo por su código: ${buscado.join(", ")}`);

  /* EN EER **NO** SE APLICA LA LISTA CORTA, y esta comprobación es la
     que lo sostiene.

     Allí la lista ya es corta: el color del vidrio la deja en uno o
     dos. Aplicando además la marca desaparecía el segundo ámbar —el
     maestro tiene un 330 y un 750— y ese es justo el caso por el que
     EER tiene desplegable: con dos del mismo color la base escoge el
     primero EN SILENCIO y el informe del mes reparte el vidrio en el
     formato que no era. Resolver un scroll que no existe a cambio de
     reabrir ese agujero es un mal negocio. */
  await pg.keyboard.press("Escape");
  await pg.click(".rt-rep .seg button:has-text('EER')");
  await pg.click("#rt-mat");
  await pg.waitForSelector(".rt-rep .bl-lista", { timeout: 2000 }).catch(() => {});
  const eerEntrada = await pg.$$eval(".rt-rep .bl-op span", (e) => e.map((x) => x.textContent.trim()));
  ok(eerEntrada.includes("EER-AMBAR") && eerEntrada.includes("EER-AMBAR-750"),
     `en EER se escondió uno de los dos ámbar: ${eerEntrada.join(", ")} — con dos del mismo ` +
     "color, esconder uno hace que la base escoja el otro en silencio");
}

/* Y en producto terminado el campo sigue donde estaba, y sigue pidiéndose. */
await pg.click(".rt-rep .seg button:has-text('Producto terminado')");
ok(await pg.isVisible("#rt-mat"),
   "en producto terminado desapareció el Material, y ahí sí hace falta");
ok(/Escribe para buscar/.test(await puesto()),
   "al pasar de EER a producto terminado se quedó puesto un envase retornable");
ok(await pg.isDisabled(".rt-rep .pie button.si"),
   "en producto terminado deja seguir sin escoger material");

/* ---------------------------------------------------------------------
   1b · «BOTELLAS ROTAS ADENTRO» SE FUE

   Proponía todas las botellas del empaque y pedía corregirlas a mano.
   Nadie las contaba: el número propuesto se quedaba tal cual, así que
   no medía nada — solo alargaba el registro con un contador que siempre
   decía lo mismo.
   ------------------------------------------------------------------ */
/* SE ESCOGE ESCRIBIENDO, como se escoge de verdad desde que son 494. */
const escogerMat = async (texto, cod) => {
  await pg.click("#rt-mat");
  await pg.waitForSelector(".rt-rep .bl-teclea");
  await pg.evaluate((v) => {
    const el = document.querySelector(".rt-rep .bl-teclea");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
  }, texto);
  await pg.click(`.rt-rep .bl-op:has(span:text-is("${cod}"))`);
};
await escogerMat("Costeña 330", "PT-COST-330");
{
  const txt = await pg.textContent(".rt-rep");
  ok(!/Botellas rotas adentro/i.test(txt),
     "en producto terminado sigue saliendo «Botellas rotas adentro»");
  ok(!/caben \d/i.test(txt),
     "sigue saliendo el «caben N» del contador de botellas");
}

/* ---------------------------------------------------------------------
   2 · EL PROCESO HABILITA LAS CAUSAS · 3 · EL ÁREA
   ------------------------------------------------------------------ */
await monta();
await abrir();
await pg.click(".rt-rep .seg button:has-text('EER')");
await pg.click(".rt-rep .seg.vidrio button.flint");
/* SE TECLEA COMO SE TECLEA DE VERDAD, y no con `fill`.
   `fill` pone el valor en el DOM y dispara el evento, pero en un campo
   controlado por React el rastreador de valor puede no ver el cambio y
   entonces el DOM dice 15 y el componente sigue en 0: la pantalla se ve
   bien y el botón se queda apagado sin motivo. Costó media hora
   encontrarlo. Esto usa el setter nativo, que es lo que hace el
   navegador cuando una persona escribe. */
await pg.evaluate(() => {
  const el = document.querySelector(".rt-rep .cel-step input");
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(el, "15");
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
ok(!(await pg.isDisabled(".rt-rep .pie button.si")),
   "con material, color y 15 unidades el botón de Siguiente sigue apagado");
await pg.click(".rt-rep .pie button.si");
await pg.waitForSelector("#rt-area");

ok((await pg.$$(".rt-rep .chips.causas button")).length === 0,
   "las causas salen sin haber escogido proceso");
ok(await pg.isVisible(".rt-rep .nota.espera"),
   "sin proceso no dice que hay que escogerlo primero: el paso se ve vacío y ya");

const areas = await pg.$$eval("#rt-area option", (o) => o.map((x) => x.textContent.trim()));
ok(areas.length === 14, `el desplegable de Área trae ${areas.length - 1} áreas y tienen que ser 13`);
ok(areas[1] === "Bahías T1" && areas[13] === "Estantería",
   `las áreas no vienen en el orden del maestro: ${areas.slice(1, 4)} … ${areas[13]}`);

/* Y las del paso 2. */
for (const c of ["chips", "campo-suelto", "rot-campo"]) {
  ok((await pg.$$(`.rt-rep .${c}`)).length > 0, `falta la clase «${c}» en el paso 2`);
}

await pg.click(".rt-rep .chips button:has-text('Líneas')");
const causas = await pg.$$eval(".rt-rep .chips.causas button", (b) => b.map((x) => x.textContent.trim()));
ok(causas.length === 7, `con proceso salen ${causas.length} causas y tienen que ser 7`);
ok(causas[0] === "Estibas en mal estado" && causas.includes("Falla del pallet DEPA"),
   `las causas no son las que se pidieron: ${causas.join(" | ")}`);
ok((await pg.$$(".rt-rep .chips.causas button.roja")).length === 2,
   "las no asumidas no son exactamente dos (máquinas y pallet DEPA)");

/* EL BOTÓN DICE QUÉ FALTA, en vez de quedarse apagado y mudo. */
ok(/Falta el área/.test(await pg.textContent(".rt-rep .pie button.si")),
   "sin área el botón no dice que falta el área");
await pg.selectOption("#rt-area", "plazoleta");
await pg.click(".rt-rep .chips.causas button:has-text('Estibas en mal estado')");
ok(/Enviar a ABI/.test(await pg.textContent(".rt-rep .pie button.si")),
   "con proceso, área y causa el botón todavía dice que falta algo");

/* Y SE MANDAN LOS DOS: EL MATERIAL ESCOGIDO Y EL COLOR.
   La función prefiere el material cuando llega —«quien ya lo sabe no
   tiene por qué dejar de decirlo»— y cae al color solo si el maestro no
   tiene ninguno de ese color. Mandar solo el color dejaba a la base
   eligiendo entre dos ámbar en silencio, que es lo que esto vino a
   quitar. Y ya no viaja ninguna botella: ese contador se fue. */
await pg.click(".rt-rep .pie button.si");
await pg.waitForFunction(() => (window.llamadas ?? []).some((l) => l.f === "rotura_registrar"));
const l = (await llamadas()).find((x) => x.f === "rotura_registrar");
ok(l.a.p_material === "EER-FLINT", `en EER no se mandó el material escogido: ${l.a.p_material}`);
ok(l.a.p_color === "flint", `en EER no se mandó el color escogido: ${l.a.p_color}`);
ok(l.a.p_botellas === null, `todavía se mandan botellas de adentro: ${l.a.p_botellas}`);
ok(l.a.p_area === "plazoleta", `no se mandó el área: ${l.a.p_area}`);
ok(l.a.p_unidades === 15, `no se mandaron las unidades: ${l.a.p_unidades}`);

/* ---------------------------------------------------------------------
   4 · NO ES OTRA PANTALLA
   ------------------------------------------------------------------ */
await monta();
await abrir();
const sitio = await pg.evaluate(() => {
  const r = document.querySelector(".rt-rep");
  const cs = getComputedStyle(r), b = r.getBoundingClientRect();
  return {
    posicion: cs.position, ancho: Math.round(b.width),
    anchoPagina: document.documentElement.clientWidth,
    arriba: Math.round(b.top),
  };
});
ok(sitio.posicion !== "fixed",
   "el formulario sigue en position:fixed — sigue siendo otra pantalla del navegador");
ok(sitio.ancho < sitio.anchoPagina,
   `el formulario ocupa todo el ancho de la ventana (${sitio.ancho} de ${sitio.anchoPagina})`);
ok(sitio.arriba < 520,
   `el formulario queda demasiado abajo: hay que bajar la pantalla para llegar a él (${sitio.arriba} px)`);

/* ---------------------------------------------------------------------
   4bis · EN EL COMPUTADOR, DOS COLUMNAS Y A TODO EL ANCHO
   ------------------------------------------------------------------ */
await monta(1440);
await abrir();
const anchos = await pg.evaluate(() => {
  const r = document.querySelector(".rt-rep").getBoundingClientRect();
  /* Contra SU COLUMNA de la consola: a la derecha va el contexto, así
     que el formulario no mide la pantalla entera —mide su mitad—. */
  const c = document.querySelector(".rt .consola > *").getBoundingClientRect();
  const cols = [...document.querySelectorAll(".rt-rep .linea-campos:first-of-type > *")]
    .map((e) => Math.round(e.getBoundingClientRect().top));
  return { form: Math.round(r.width), pagina: Math.round(c.width),
           izq: Math.round(r.left), izqPagina: Math.round(c.left), cols };
});
ok(Math.abs(anchos.form - anchos.pagina) < 4,
   `el formulario no llena su columna de la consola (${anchos.form} contra ${anchos.pagina})`);
ok(Math.abs(anchos.izq - anchos.izqPagina) < 4,
   `el formulario no arranca donde arranca su columna (${anchos.izq} contra ${anchos.izqPagina})`);

/* Y LA CONSOLA ES DE DOS COLUMNAS EN EL COMPUTADOR: el contexto AL
   LADO, no debajo. Debajo es exactamente lo que se quitó. */
const consola = await pg.evaluate(() => {
  const f = document.querySelector(".rt-rep").getBoundingClientRect();
  const a = document.querySelector(".rt .hoy-cifra").getBoundingClientRect();
  return { alLado: a.left > f.right - 2, mismaAltura: Math.abs(a.top - f.top) < 4 };
});
ok(consola.alLado, "el contexto quedó DEBAJO del formulario y no al lado");
ok(consola.mismaAltura, "el contexto no arranca a la misma altura que el formulario");

/* NI PEGADO NI ENCIMADO. «Quedó pegado»: el KPI de la cabecera y la
   tarjeta oscura del panel comparten la columna derecha, uno encima
   del otro, y sin aire entre ellos se leen como un solo bloque roto. */
const aire = await pg.evaluate(() => {
  const k = document.querySelector(".rt .cabeza .kpi").getBoundingClientRect();
  const t = document.querySelector(".rt .hoy-cifra").getBoundingClientRect();
  return { hueco: Math.round(t.top - k.bottom), mismaColumna: Math.abs(t.right - k.right) < 4 };
});
ok(aire.mismaColumna, "el KPI y la tarjeta del panel no están alineados en la misma columna");
ok(aire.hueco >= 14,
   `el KPI y la tarjeta del panel quedaron pegados: ${aire.hueco} px de aire entre los dos`);
ok(anchos.cols.length === 2, `esperaba dos columnas y hay ${anchos.cols.length}`);
ok(anchos.cols[0] === anchos.cols[1],
   `las dos columnas no arrancan a la misma altura (${anchos.cols})`);

/* ---------------------------------------------------------------------
   4quater · EN EL CELULAR, SOLO LO QUE SE VA A REGISTRAR

   «En el celular la idea es que solo se vea lo que se va a registrar,
   que no se vea nada más para que la vista no confunda.»

   En el computador el contexto va AL LADO y no estorba. En el celular
   todo se apila, así que sería tres pantallazos antes del primer
   campo. Se mide que NO esté, no que esté escondido detrás: un bloque
   con `visibility: hidden` sigue ocupando el sitio.
   ------------------------------------------------------------------ */
await monta(390);
await abrir();
for (const [sel, que] of [
    [".cabeza", "el titular y el KPI"],
    [".rt .hoy-cifra", "la tarjeta del día"],
    [".rt .hoy", "la lista de hoy"]]) {
  const alto = await pg.evaluate((s) => {
    const e = document.querySelector(s);
    return e ? Math.round(e.getBoundingClientRect().height) : 0;
  }, sel);
  ok(alto === 0, `en el celular todavía se ve ${que} (${alto} px de alto)`);
}
/* Y el formulario arranca arriba del todo: lo primero que se ve al
   entrar es el primer campo, no algo que haya que pasar. */
const arribaCel = await pg.evaluate(() =>
  Math.round(document.querySelector(".rt-rep").getBoundingClientRect().top));
ok(arribaCel < 60, `en el celular el formulario arranca en ${arribaCel} px, no arriba del todo`);

/* En el computador, en cambio, el contexto SÍ está. */
await monta(1440);
await abrir();
ok(await pg.isVisible(".rt .hoy-cifra"),
   "en el computador se perdió el contexto del panel, que ahí sí cabe al lado");

/* Y en el celular se apilan: una debajo de otra, no media y media. */
await monta(390);
await abrir();
const apila = await pg.evaluate(() => {
  const c = [...document.querySelectorAll(".rt-rep .linea-campos:first-of-type > *")]
    .map((e) => e.getBoundingClientRect());
  return c.length === 2 && c[1].top >= c[0].bottom - 1;
});
ok(apila, "en el celular los dos campos de una línea no se apilan");

await monta(1440, "ambar", 1100);
await abrir();
await pg.screenshot({ path: ".arnes/rt-sitio-paso1.png" });
await monta(390, "ambar", 900);
await abrir();
await pg.screenshot({ path: ".arnes/rt-sitio-movil.png", fullPage: true });
await monta(1440, "ambar", 1100);
await abrir();
await pg.click(".rt-rep .seg button:has-text('EER')");
/* FLINT porque en el maestro de prueba hay UNO SOLO: el material viene
   puesto y se puede pasar de paso sin tocar el desplegable. En ámbar
   hay dos a propósito y ahí sí hay que escoger. */
await pg.click(".rt-rep .seg.vidrio button.flint");
await pg.click(".rt-rep .pie button.si");
await pg.waitForSelector("#rt-area");
await pg.click(".rt-rep .chips button:has-text('Líneas')");
await pg.screenshot({ path: ".arnes/rt-sitio-paso2.png" });

/* ---------------------------------------------------------------------
   4ter · EL ACENTO ES EL DEL TEMA, Y SE LEE EN LOS SIETE

   «Si en el tema de preferencia es ámbar, ¿qué hace el rojo ahí?
   Acuérdate de que los colores varían de acuerdo al tema.»

   Se comprueban dos cosas y las dos hacen falta:
     · que el acento del módulo sea --c-marca —el acento de la app, el
       mismo que usa Traspasos— y no --c-oro, que en los temas de
       Cristian es el rojo de MANCHA;
     · que la tinta que va encima se lea, porque cambiar el token de
       fondo sin mirar la pareja es la forma clásica de dejar una
       pantalla ilegible en dos de los siete temas.
   ------------------------------------------------------------------ */
{
  const TEMAS = ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
  for (const tema of TEMAS) {
    await monta(1440, tema, 1100);
    await abrir();
    const r = await pg.evaluate(() => {
      /* LOS TOKENS SE LEEN DESDE .rt, NO DESDE <html>. El atributo del
         tema vive en el armazón de la app —un div de por medio—, así
         que preguntarle a la raíz devuelve siempre el tema oficial y la
         comprobación pasaría o fallaría por la razón equivocada. */
      const val = (n) => getComputedStyle(document.querySelector(".rt"))
        .getPropertyValue(n).trim();
      const leer = (c) => {
        const m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
        if (m) return [1, 2, 3].map((i) => Number(m[i]) * 255);
        return (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      };
      const lum = (c) => { const [r, g, b] = c.map((v) => {
        const x = v / 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
        return .2126 * r + .7152 * g + .0722 * b; };
      const razon = (a, b) => { const [A, B] = [lum(leer(a)), lum(leer(b))].sort((x, y) => y - x);
        return Math.round(((A + .05) / (B + .05)) * 10) / 10; };
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      const acento = cs(".rt").getPropertyValue("--rt-oro").trim();
      const out = { marca: val("--c-marca"), oro: val("--c-oro"), acento };
      for (const [nom, sel] of [
          ["kpi-rot", ".rt .kpi .rot"], ["kpi-num", ".rt .kpi .num"],
          ["kpi-pie", ".rt .kpi .pie"],
          ["boton", ".rt-rep .pie button.si"],
          ["seg-on", ".rt-rep .seg button.on"]]) {
        const el = document.querySelector(sel);
        if (!el) continue;
        let caja = el;
        const pinta = (n) => { const c = getComputedStyle(n).backgroundColor;
          return c && c !== "transparent" && !/rgba\([^)]*,\s*0\s*\)/.test(c); };
        while (caja && caja !== document.documentElement && !pinta(caja)) caja = caja.parentElement;
        out[nom] = razon(getComputedStyle(el).color, getComputedStyle(caja).backgroundColor);
      }
      return out;
    });

    /* EL ACENTO TIENE QUE SER --c-marca. Comparar contra el token, no
       contra un color escrito a mano: así sigue valiendo el día que se
       cambie la paleta. */
    const mismo = (a, b) => a.replace(/\s/g, "").toLowerCase() === b.replace(/\s/g, "").toLowerCase();
    ok(mismo(r.acento, r.marca),
       `${tema || "oficial"}: el acento es ${r.acento} y tenía que ser --c-marca (${r.marca})`);
    if (r.oro && !mismo(r.marca, r.oro)) {
      ok(!mismo(r.acento, r.oro),
         `${tema || "oficial"}: el acento sigue colgando de --c-oro (${r.oro}), que es el rojo de mancha`);
    }

    const flojos = Object.entries(r).filter(([k, v]) => typeof v === "number" && v < 4.5);
    ok(flojos.length === 0,
       `${tema || "oficial"}: no se lee ${flojos.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    console.log(`${(tema || "oficial").padEnd(8)} acento ${r.acento.padEnd(9)} · ` +
      ["kpi-rot", "kpi-num", "kpi-pie", "boton", "seg-on"].map((k) => `${k} ${r[k]}`).join("  "));
  }
}

/* ---------------------------------------------------------------------
   4quinquies · SI EL DESPLEGABLE NO SALE DEL MAESTRO, SE DICE

   «¿Por qué en materiales no has tomado el listado de los materiales
    que están en el maestro de inventario?»

   Porque faltaba correr el SQL — y LA PANTALLA NO LO DECÍA. La función
   devolvía «esto no viene del inventario» y la pantalla lo tiraba a la
   basura: el desplegable seguía enseñando los pocos sembrados a mano,
   nadie sabía por qué, y parecía que la función no servía.

   Callarlo es lo que hace que nadie corra el SQL nunca, y mientras
   tanto quien registra una rotura de un producto que no está en la
   lista corta la registra CON OTRO.
   ------------------------------------------------------------------ */
for (const [de, dice] of [["sin_vista", /2026-09-roturas-maestro-unico/],
                          ["vacia", /Inventario . Maestro/]]) {
  await pg.setViewportSize({ width: 1440, height: 1100 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>window.DE=${JSON.stringify(de)}</script>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".rt-rep");
  const t = await pg.textContent(".rt");
  ok(/no está saliendo del maestro de inventario/i.test(t),
     `con «${de}» la pantalla no avisa que el desplegable no viene del inventario`);
  ok(dice.test(t), `con «${de}» no se dice QUÉ hacer para arreglarlo`);
}
/* Y cuando SÍ sale del inventario, no se avisa nada: un cartel que
   sale siempre deja de querer decir algo a la semana. */
await monta();
ok(!/no está saliendo del maestro/i.test(await pg.textContent(".rt")),
   "el aviso sale aunque el desplegable SÍ venga del maestro de inventario");

/* =====================================================================
   4sexies · EL MATERIAL SE BUSCA ESCRIBIENDO

   «Agregaste producto, perfecto, pero que yo pueda ir escribiendo y a
    la vez filtrando.»

   EL DESPLEGABLE PASÓ DE SIETE A 494. Un `<select>` nativo con 494 es
   una lista de treinta pantallazos donde solo se puede saltar tecleando
   el PRINCIPIO del nombre: quien busca «355» no encuentra nada.
   ===================================================================== */
await monta();
await abrir();
{
  ok((await pg.$$("select#rt-mat")).length === 0,
     "el material sigue siendo un <select> nativo: con 494 materiales eso es una lista de treinta pantallazos");
  ok(await pg.isVisible("#rt-mat"), "no está el campo del material");

  await pg.click("#rt-mat");
  await pg.waitForSelector(".rt-rep .bl-lista");
  ok(await pg.isVisible(".rt-rep .bl-teclea"),
     "al abrir el material no aparece dónde escribir");
  const teclear2 = async (v) => pg.evaluate((val) => {
    const el = document.querySelector(".rt-rep .bl-teclea");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);

  /* SE BUSCA EN CUALQUIER PARTE DEL TEXTO, no solo al principio: es la
     razón entera de haber cambiado el <select>. */
  await teclear2("355");
  const con355 = await pg.$$eval(".rt-rep .bl-op b", (b) => b.map((x) => x.textContent));
  ok(con355.length > 0 && con355.every((t) => /355/.test(t)),
     `buscar «355» —que va en la MITAD del nombre— trajo ${con355.length} y no todos lo tienen`);

  /* EL TOPE SE MIDE AQUÍ, EN LA BÚSQUEDA, y ya no al abrir: de entrada
     ahora solo salen los marcados —dos— y contar dos no prueba nada.
     Buscando «355» los que calzan son cien, que es el caso de verdad:
     cada letra tecleada repintaría cien renglones y el teléfono se
     cuelga medio segundo. */
  ok(con355.length <= 60,
     `se pintan ${con355.length} renglones de una: con 494 el teléfono se cuelga en cada letra`);
  ok(/más/.test(await pg.textContent(".rt-rep .bl-lista")),
     "no se dice cuántos quedan sin pintar: parece que la lista se acabó ahí");

  /* Y POR EL CÓDIGO, que es lo que está pegado en la estiba. */
  await teclear2("PT-COST-330");
  const porSku = await pg.$$eval(".rt-rep .bl-op span", (b) => b.map((x) => x.textContent));
  ok(porSku.includes("PT-COST-330"),
     `no se puede buscar por el código: ${JSON.stringify(porSku.slice(0, 3))}`);

  /* SIN TILDES: nadie teclea «Águila» con acento y con guante. */
  await teclear2("costena");
  ok((await pg.$$(".rt-rep .bl-op")).length > 0,
     "buscar sin tildes no encuentra «Costeña»");

  /* CUANDO NO HAY NINGUNO SE DICE, y con qué se buscó: una lista en
     blanco hace pensar que la pantalla se rompió. */
  await teclear2("zzzzz");
  ok(/Ninguno dice/.test(await pg.textContent(".rt-rep .bl-lista")),
     "sin resultados la lista se queda en blanco sin decir por qué");

  /* SE ESCOGE Y SE VE ESCOGIDO. */
  await teclear2("Costeña 330");
  await pg.click(".rt-rep .bl-op");
  ok((await pg.$$(".rt-rep .bl-lista")).length === 0, "al escoger no se cierra la lista");
  ok(/PT-COST-330/.test(await pg.textContent("#rt-mat")),
     `tras escoger, el campo dice «${await pg.textContent("#rt-mat")}»`);
  ok(!(await pg.isDisabled(".rt-rep .pie button.si")),
     "con material escogido el botón sigue apagado");
}

/* ---------------------------------------------------------------------
   4septies · SI NINGÚN ENVASE TIENE COLOR, NO SE FILTRA POR COLOR

   Los 32 envases del maestro de inventario nacen sin `color_vidrio`
   —el SQL no lo puede adivinar—. Filtrando por color, el desplegable
   de EER quedaba COMPLETAMENTE VACÍO y el registro trabado, sin una
   palabra que dijera por qué. Trabar el registro de una rotura que YA
   ocurrió por un maestro incompleto es perder el dato para siempre.
   ------------------------------------------------------------------ */
{
  await pg.setViewportSize({ width: 1440, height: 1100 });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="rt" id="r"></div></main></div></div>
    <script>window.DE="inventario";window.SINCOLOR=true</script>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".rt-rep");
  await abrir();
  await pg.click(".rt-rep .seg button:has-text('EER')");

  await pg.click("#rt-mat");
  await pg.waitForSelector(".rt-rep .bl-lista");
  const ops = (await pg.$$(".rt-rep .bl-op")).length;
  ok(ops > 0,
     "con los envases sin color el desplegable de EER queda VACÍO: el registro se traba y se pierde una rotura que ya ocurrió");
  await pg.keyboard.press("Escape");

  ok(/Ningún envase tiene el color/i.test(await pg.textContent(".rt-rep")),
     "no se avisa que ningún envase tiene color: callarlo es lo que hace que nadie lo llene nunca");
  ok(/Inventario . Maestro/.test(await pg.textContent(".rt-rep")),
     "no se dice DÓNDE se llena el color del vidrio");
}

/* ---------------------------------------------------------------------
   5 · LOS CUATRO ANCHOS, Y LO QUE SE TOCA
   ------------------------------------------------------------------ */
for (const [ancho, nombre] of [[1440, "pc"], [820, "tab"], [390, "cel"], [360, "360"]]) {
  await monta(ancho);

  /* EL PASO 0 SE MIDE EN SU PROPIO ANCHO, antes de pasarlo. Si solo se
     midiera lo de después, la primera pantalla —la única que TODOS ven,
     porque es obligatoria— sería la única sin medir. El PIN se cuenta
     aquí aunque sea un `input` y no un botón: es el campo más fácil de
     errar con guante de toda la pantalla. */
  await pg.click(".rt-rep .rp-origen button:has-text('La reportó un OPM')");
  {
    const p0 = await pg.evaluate(() => {
      const a = document.documentElement.clientWidth, fuera = [], chicos = [];
      for (const el of document.querySelectorAll(".rt-rep *")) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && (b.right > a + .5 || b.left < -.5)) fuera.push(el.className || el.tagName);
        if (["BUTTON", "SELECT", "INPUT"].includes(el.tagName) && b.height > 0 && b.height < 44)
          chicos.push((el.className || el.tagName) + " h=" + Math.round(b.height));
      }
      return { scroll: document.documentElement.scrollWidth, ancho: a,
               fuera: [...new Set(fuera)].slice(0, 4), chicos: [...new Set(chicos)].slice(0, 4) };
    });
    ok(p0.scroll <= p0.ancho + .5,
       `${nombre}: la primera pregunta desplaza la página a lo ancho (${p0.scroll} > ${p0.ancho})`);
    ok(!p0.fuera.length, `${nombre}: en la primera pregunta se sale ${p0.fuera.join(" | ")}`);
    ok(!p0.chicos.length,
       `${nombre}: en la primera pregunta no se alcanza con el dedo ${p0.chicos.join(" | ")}`);
    if (ancho === 390) await pg.screenshot({ path: ".arnes/rt-sitio-paso0.png", fullPage: true });
  }

  await abrir();
  await pg.click(".rt-rep .seg button:has-text('EER')");
  /* Flint: un solo material, viene puesto, se pasa de paso. */
  await pg.click(".rt-rep .seg.vidrio button.flint");
  await pg.click(".rt-rep .pie button.si");
  await pg.waitForSelector("#rt-area");
  await pg.click(".rt-rep .chips button:has-text('Líneas')");

  const r = await pg.evaluate(() => {
    const a = document.documentElement.clientWidth, fuera = [], chicos = [];
    for (const el of document.querySelectorAll(".rt-rep *")) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.right > a + .5 || b.left < -.5)) fuera.push(el.className || el.tagName);
      if ((el.tagName === "BUTTON" || el.tagName === "SELECT") && b.height > 0 && b.height < 44)
        chicos.push((el.className || el.tagName) + " h=" + Math.round(b.height));
    }
    const anchos = [...document.querySelectorAll(".rt-rep *")]
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      .map((e) => (e.className || e.tagName) + " " + e.scrollWidth + ">" + e.clientWidth);
    return { scroll: document.documentElement.scrollWidth, ancho: a,
             anchos: [...new Set(anchos)].slice(0, 5).join(" | "),
             fuera: [...new Set(fuera)].slice(0, 4), chicos: [...new Set(chicos)].slice(0, 4) };
  });
  ok(r.scroll <= r.ancho + .5, `${nombre}: la página se desplaza a lo ancho (${r.scroll} > ${r.ancho}) · ${r.anchos}`);
  ok(!r.fuera.length, `${nombre}: se sale ${r.fuera.join(" | ")}`);
  ok(!r.chicos.length, `${nombre}: no se alcanza con el dedo ${r.chicos.join(" | ")}`);
  await pg.screenshot({ path: `.arnes/rt-sitio-${nombre}.png`, fullPage: ancho < 900 });
  console.log(`${nombre.padEnd(4)} ${String(ancho).padStart(5)}px  ${r.fuera.length || r.chicos.length ? "MAL" : "bien"}`);
}

await nav.close();

if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\n✓ Rotura en sitio: la PRIMERA pregunta es de dónde salió —y el PIN solo sale si la reportó un OPM, y no deja seguir hasta que sale el NOMBRE—, Registrar es la consola de Traspasos —formulario y contexto al lado—, el EER pide material filtrado por el color (y puesto cuando solo hay uno), «botellas rotas adentro» se fue, en producto no sale ni PET ni lata, el proceso habilita las causas, y el área sale del maestro.");
