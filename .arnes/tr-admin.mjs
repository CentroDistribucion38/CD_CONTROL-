/* =====================================================================
   EN TRÁNSITO — CORREGIR Y ANULAR DESDE LA TARJETA

   «Ayúdame a poder eliminar/anular los vehículos en tránsito del
    registro, o sea el super admin que pueda editar, eliminar, borrar.»

   Un vehículo que se digitó dos veces, o que nunca salió, se quedaba en
   «en camino» para siempre: ensuciaba la cifra de arriba y las horas
   del más viejo, y arreglarlo obligaba a salir a Fuente principal y
   buscar la placa entre casi doscientas filas.

   LO QUE HAY QUE SOSTENER, y nada de esto se puede dar por bueno
   leyendo el código:

   1. LOS BOTONES SOLO SALEN PARA QUIEN MANDA. Esconderlos no es el
      candado —el candado está en la base, que comprueba `manda()`—,
      pero un botón que sale y da error al tocarlo es peor que no tener
      botón.

   2. LLAMAN A LAS FUNCIONES QUE YA EXISTEN, con los nombres y los
      parámetros exactos. Un `p_motivo` mal escrito no revienta el
      build: revienta en la cara de quien está anulando.

   3. ANULAR EXIGE MOTIVO. La base lo exige; si la pantalla deja mandar
      sin él, el único resultado posible es un error.

   4. AL QUE LLEGÓ Y ESPERA REVISIÓN AI NO SE LE OFRECE CORREGIR: esa
      tarjeta está pidiendo que alguien cuente la muestra, y corregirle
      las estibas ahí es cambiar el dato justo antes de contrastarlo.

     node .arnes/tr-admin.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

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

writeFileSync(R(".arnes/_nav-tr.ts"),
  `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);

/* LA BASE DE MENTIRAS ANOTA LO QUE SE LE MANDA. Es la única forma de
   comprobar que se llama a `sider_viaje_anular` con `p_motivo` y no a
   una función inventada con otro nombre: el build no lo mira, porque
   el nombre de una RPC es una cadena de texto. */
writeFileSync(R(".arnes/_supa-tr.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => {
    (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
    if ((window as any).FALLA) return { data: null, error: { message: (window as any).FALLA } };
    return { data: null, error: null };
  },
  storage: { from: () => ({ upload: async () => ({ error: null }),
                            createSignedUrl: async () => ({ data: null, error: null }) }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
                 insert: async () => ({ error: null }) }),
});`);

writeFileSync(R(".arnes/_tr-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Transito } from "../src/app/(app)/sider/transito/Transito";

const base = {
  planta: "P01", cd_origen: "CD Unión Apartado", sku: "3500887",
  descripcion: "BOTELLA FLINT 1000R", clase: "EER",
  estibas: 30, sider: 0.83, cajas: 1080, unidades: 14040, hl: 140.4,
  estado: "en_transito", importado: false, faltan_factores: false,
  observacion: null, motivo_anulacion: null, anulado_en: null, anulado_por: null,
  salida_en: "2026-09-10T12:41:00Z", llegada_en: null, en_camino: "357:00:00",
  fotos_salida: 3, fotos_llegada: 0,
  creado_por: "u1", salida_direccion: "Avenida Carrera 38",
  requiere_ai: false, ai_pendiente: false, ai_motivo: null,
  ai_pedido_por: null, ai_pedido_en: null,
};
const viajes = [
  { ...base, id: "v1", placa: "JGY577" },
  { ...base, id: "v2", placa: "JYN245", cd_origen: "CD OL Curumani",
    sku: "3501226", descripcion: "BOTELLA MARRON 250 CC", estibas: 20, sider: 0.56 },
  /* EL QUE LLEGÓ Y ESPERA QUE ALGUIEN CUENTE LA MUESTRA. A este no se
     le ofrece corregir: cambiarle las estibas justo antes de
     contrastarlas es cambiar el dato que se va a contrastar. */
  { ...base, id: "v3", placa: "KKL900", requiere_ai: true, ai_pendiente: true,
    llegada_en: "2026-09-24T10:00:00Z" },
  /* UN SEGUNDO ANULABLE EN EL MISMO CD QUE KKL900. Sin él, ese grupo
     tenía un anulable y un pendiente de muestra, y el «todos» del CD
     —que solo aparece con dos o más— no se podía medir. Con los tres
     juntos se comprueba lo que de verdad importa: que «los 2» escoja
     DOS y deje fuera al que espera la muestra. */
  { ...base, id: "v4", placa: "LMN321" },
];
const origenes = [
  { planta: "P01", cd_origen: "CD Unión Apartado" },
  { planta: "P02", cd_origen: "CD OL Curumani" },
  { planta: "P03", cd_origen: "CD La Arenosa" },
];
const skus = [
  { sku: "3500887", descripcion: "BOTELLA FLINT 1000R" },
  { sku: "3501226", descripcion: "BOTELLA MARRON 250 CC" },
];
/* LOS MAESTROS DE LA REVISIÓN AI, para poder ABRIRLA y medirla. En
   nulo, la pantalla no pinta el formulario y el camino de pasos —donde
   estaba el defecto— no existiría nunca en el arnés.
   SIN COMILLAS INVERTIDAS EN ESTE COMENTARIO: vive dentro de una
   plantilla, y una sola la cierra antes de tiempo. */
const maestrosAi = { falta: false,
  defectos: [ { clave: "rota", nombre: "Rota o despicado", cobra: true, orden: 1, activo: true },
              { clave: "faltante", nombre: "Faltante", cobra: true, orden: 2, activo: true } ],
  envases: [ { clave: "CB320", descripcion: "Costeña Bacana 320 R", litros: 0.32, activo: true } ],
  socios: [ { clave: "bdc", nombre: "Bebidas De La Costa S.A.S", activo: true } ],
  canales: [ { clave: "socios", nombre: "Socios", activo: true } ] };

createRoot(document.getElementById("r")!).render(
  <Transito viajes={viajes as any} nombres={{ u1: "arenosa" }}
            esEditor esAdmin={false}
            manda={(window as any).MANDA !== false}
            origenes={origenes} skus={skus}
            maestrosAi={maestrosAi as any} trabados={1} sinEvidencia={0}
            cabeza={<div className="cabeza"><h1>En tránsito</h1></div>} />);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_tr-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "next/navigation": R(".arnes/_nav-tr.ts"),
    "@/lib/supabase/client": R(".arnes/_supa-tr.ts"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css   = readFileSync(R("src/app/(app)/sider/sider.css"), "utf8");
const ai    = readFileSync(R("src/modulos/sider/ai.css"), "utf8");
const glob  = readFileSync(R("src/app/globals.css"), "utf8");
const shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();

const monta = async (manda = true, ancho = 1440, alto = 1000) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${PREFLIGHT}${glob}${shell}${css}${ai}</style></head>
    <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
    <div class="sd tr-pantalla" id="r"></div></main></div></div>
    <script>window.MANDA=${manda ? "true" : "false"}</script>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".sd .tr-botones");
  await pg.evaluate(() => { window.llamadas = []; window.FALLA = null });
};
const llamadas = () => pg.evaluate(() => window.llamadas ?? []);
/* La tarjeta de una placa concreta, para no medir la del vecino. */
const tarjeta = (placa) => `.sd .tr-vh:has(.placa:text-is("${placa}"))`;

/* =====================================================================
   1 · QUIEN NO MANDA NO VE LOS BOTONES

   Esconderlos NO es el candado —ese está en la base—, pero un botón que
   sale y da error al tocarlo enseña a la gente que la aplicación falla.
   ===================================================================== */
await monta(false);
{
  const t = await pg.textContent(".sd");
  ok(!/Corregir/.test(t), "a quien no administra le sale «Corregir» en el tránsito");
  ok(!/Anular/.test(t), "a quien no administra le sale «Anular» en el tránsito");
  /* Y LO DE SIEMPRE SIGUE AHÍ: quitarle los botones al que no manda no
     puede llevarse por delante certificar la llegada, que es de quien
     recibe. */
  ok(/Certificar llegada/.test(t),
     "esconder los botones de administrador se llevó por delante «Certificar llegada»");
}

/* =====================================================================
   2 · QUIEN MANDA LOS VE, Y NO EN LA TARJETA QUE ESPERA LA MUESTRA
   ===================================================================== */
await monta(true);
{
  const t = await pg.textContent(".sd");
  ok(/Corregir/.test(t), "al administrador no le sale «Corregir»");
  ok(/Anular/.test(t), "al administrador no le sale «Anular»");

  /* EN EL QUE LLEGÓ Y ESPERA LA MUESTRA: SE PUEDE ANULAR, NO CORREGIR.

     ESTO ESTUVO MAL UNA VERSIÓN. Se le escondía la franja entera, y el
     resultado fue lo contrario de lo que se pidió: los vehículos que
     llevan semanas trabados en «en camino» —los que de verdad estorban
     en la cifra de arriba— eran los únicos que no se podían quitar.

     Corregir sí se esconde, y por lo de siempre: cambiarle las estibas
     justo antes de contrastarlas con la muestra es tocar el dato que se
     va a contrastar. Anular no tiene nada que ver con eso. */
  const conAi = await pg.textContent(tarjeta("KKL900"));
  ok(!/Corregir/.test(conAi),
     "al vehículo que llegó y espera la revisión AI se le ofrece corregir: eso cambia el dato " +
     "justo antes de contrastarlo con la muestra");
  ok(/Anular/.test(conAi),
     "al vehículo que llegó y espera la muestra no se le deja anular, y es justo el que lleva " +
     "semanas trabado en «en camino»");
  ok(await pg.isVisible(`${tarjeta("KKL900")} .tr-marca input`),
     "el que espera la muestra no se puede ni escoger: queda fuera de la limpieza en lote");
}

/* =====================================================================
   3 · ANULAR: EXIGE MOTIVO Y LLAMA A LA FUNCIÓN QUE EXISTE

   El nombre de una RPC es una cadena de texto: el build no la mira. Si
   estuviera mal escrita, el error saldría en la cara de quien anula.
   ===================================================================== */
{
  await pg.click(`${tarjeta("JGY577")} button:has-text('Anular')`);
  await pg.waitForSelector(".sd .vj-caja");
  const cuadro = await pg.textContent(".sd .vj-caja");
  ok(/JGY577/.test(cuadro), `el cuadro de anular no dice de qué placa habla: «${cuadro.slice(0, 60)}»`);
  /* SE DICE QUE NO SE BORRA, Y AQUÍ. Quien vino buscando «eliminar»
     tiene que enterarse en el momento de que la evidencia se queda, o
     va a seguir buscando por otro lado. */
  ok(/no se borra/.test(cuadro),
     "el cuadro no aclara que anular no borra: quien buscaba eliminar se queda con la duda");

  /* SIN MOTIVO NO SE MANDA. La base lo exige; dejar mandar aquí solo
     puede terminar en un error. */
  ok(await pg.isDisabled(".sd .vj-caja button:has-text('Anular el viaje')"),
     "deja anular sin escribir el motivo, y la base lo va a rechazar");

  /* Y SE DICE QUÉ FALTA. Un botón apagado que no explica nada se lee
     como que la aplicación está rota: «¿por qué no me deja eliminar?»
     delante de un botón pálido y un campo vacío. Esto pasó de verdad. */
  ok(await pg.isVisible(".sd .vj-falta"),
     "el botón está apagado y la pantalla no dice qué falta: se lee como que la aplicación falló");
  const falta0 = await pg.textContent(".sd .vj-falta");
  ok(/por qué se anula/.test(falta0),
     `no se nombra el campo que falta: «${falta0}»`);
  ok(/obligatorio/i.test(await pg.textContent(".sd .vj-motivo-campo span")),
     "el campo del motivo no se marca como obligatorio");

  await pg.fill(".sd .vj-caja .vj-motivo-campo input", "abc");
  ok(await pg.isDisabled(".sd .vj-caja button:has-text('Anular el viaje')"),
     "con tres letras de motivo ya deja anular: «abc» no explica nada en tres meses");
  /* Y CON ALGO ESCRITO EL MENSAJE CAMBIA: repetir «falta escribir» con
     «abc» ya puesto hace pensar que lo escrito no se guardó. */
  const falta3 = await pg.textContent(".sd .vj-falta");
  ok(/un poco más/.test(falta3),
     `con tres letras escritas el aviso sigue diciendo «${falta3}»`);

  /* Y CUANDO YA ALCANZA, EL AVISO SE VA. Un aviso que se queda puesto
     con el botón ya encendido deja dudando de si se puede tocar. */
  await pg.fill(".sd .vj-caja .vj-motivo-campo input", "Se digitó dos veces");
  ok(!(await pg.isVisible(".sd .vj-falta")),
     "con el motivo ya escrito sigue el aviso de que falta algo");
  ok(!(await pg.isDisabled(".sd .vj-caja button:has-text('Anular el viaje')")),
     "con el motivo escrito el botón sigue apagado");

  await pg.fill(".sd .vj-caja .vj-motivo-campo input", "Se digitó dos veces");
  await pg.click(".sd .vj-caja button:has-text('Anular el viaje')");
  await pg.waitForTimeout(120);

  const l = await llamadas();
  ok(l.length === 1, `se mandaron ${l.length} llamadas al anular y debe ser una: ${JSON.stringify(l)}`);
  ok(l[0]?.f === "sider_viaje_anular",
     `se llamó a «${l[0]?.f}» y la función que existe es «sider_viaje_anular»`);
  ok(l[0]?.a?.p_id === "v1", `se anuló el viaje «${l[0]?.a?.p_id}» y se tocó el botón de JGY577 (v1)`);
  ok(l[0]?.a?.p_motivo === "Se digitó dos veces",
     `el motivo llegó como ${JSON.stringify(l[0]?.a?.p_motivo)}: la base lo exige y lo guarda con el nombre`);
}

/* =====================================================================
   4 · EL ERROR DE LA BASE SE ENSEÑA, NO SE TRAGA

   Si la base rechaza —porque el rol no manda de verdad, o porque el
   viaje ya no existe—, el cuadro tiene que quedarse abierto y DECIRLO.
   Cerrarse como si hubiera funcionado es la peor de las salidas: el
   vehículo sigue ahí y nadie sabe por qué.
   ===================================================================== */
await monta(true);
{
  await pg.evaluate(() => { window.FALLA = "Solo quien administra la plataforma puede anular un viaje." });
  await pg.click(`${tarjeta("JGY577")} button:has-text('Anular')`);
  await pg.fill(".sd .vj-caja .vj-motivo-campo input", "Prueba del rechazo");
  await pg.click(".sd .vj-caja button:has-text('Anular el viaje')");
  await pg.waitForTimeout(150);
  ok(await pg.isVisible(".sd .vj-caja"),
     "la base rechazó y el cuadro se cerró igual: parece que se anuló y el vehículo sigue ahí");
  const err = await pg.textContent(".sd .vj-mal").catch(() => "");
  ok(/administra la plataforma/.test(err),
     `no se enseña lo que contestó la base: «${err}»`);
}

/* =====================================================================
   5 · CORREGIR: DESPLEGABLES DEL MAESTRO, NO CAMPO LIBRE

   La base valida la planta y el material contra el maestro. Un campo
   de texto a mano solo puede acabar en «Ese CD de origen no está en el
   maestro» después de haber escrito todo.
   ===================================================================== */
await monta(true);
{
  await pg.click(`${tarjeta("JGY577")} button:has-text('Corregir')`);
  await pg.waitForSelector(".sd .vj-campos");

  const sel = await pg.$$(".sd .vj-campos select");
  ok(sel.length === 2,
     `el cuadro de corregir trae ${sel.length} desplegables y el origen y el material tienen ` +
     "que serlo: la base los valida contra el maestro");

  /* Y VIENEN PUESTOS CON LO QUE EL VIAJE YA TIENE. Un cuadro que abre
     en blanco obliga a volver a escoger lo que no se venía a cambiar, y
     ahí es donde se cambia sin querer. */
  const puestos = await pg.$$eval(".sd .vj-campos select", (e) => e.map((x) => x.value));
  ok(puestos[0] === "P01" && puestos[1] === "3500887",
     `el cuadro abre con ${JSON.stringify(puestos)} en vez de lo que el viaje ya tenía`);
  const placa = await pg.inputValue(".sd .vj-campos input");
  ok(placa === "JGY577", `la placa abre como «${placa}» en vez de la del viaje`);

  /* LA COMA DECIMAL. Aquí se escribe «0,83»; `Number("0,83")` es NaN y
     la base contesta un mensaje sobre las estibas que no dice nada del
     teclado. */
  await pg.fill(".sd .vj-campos label:has(span:text-is('Estibas')) input", "12,5");
  await pg.click(".sd .vj-caja button:has-text('Guardar la corrección')");
  await pg.waitForTimeout(120);

  const l = await llamadas();
  ok(l[0]?.f === "sider_viaje_editar",
     `se llamó a «${l[0]?.f}» y la función que existe es «sider_viaje_editar»`);
  ok(l[0]?.a?.p_estibas === 12.5,
     `«12,5» llegó a la base como ${JSON.stringify(l[0]?.a?.p_estibas)}: la coma no se cambió por punto`);
  ok(l[0]?.a?.p_id === "v1" && l[0]?.a?.p_planta === "P01" && l[0]?.a?.p_sku === "3500887",
     `los demás campos llegaron mal: ${JSON.stringify(l[0]?.a)}`);
}

/* =====================================================================
   6 · ESCOGER VARIOS Y ANULARLOS DE UNA

   «No me deja seleccionar los viajes para eliminar.»

   Cuando una importación se metió dos veces son ocho o diez vehículos,
   y anularlos de uno en uno es abrir y cerrar el mismo cuadro diez
   veces escribiendo el mismo motivo.
   ===================================================================== */
await monta(true);
{
  /* LA BARRA NO EXISTE HASTA QUE HAY ALGO ESCOGIDO: una barra vacía
     permanente se come 56 px del teléfono todo el día sin decir nada. */
  ok(!(await pg.isVisible(".sd .tr-barra")),
     "la barra de lo escogido sale sin haber escogido nada");

  await pg.click(`${tarjeta("JGY577")} .tr-marca input`);
  await pg.waitForSelector(".sd .tr-barra");
  ok(/1 viaje escogido/.test(await pg.textContent(".sd .tr-barra")),
     `la barra no dice cuántos van: «${await pg.textContent(".sd .tr-barra")}»`);

  await pg.click(`${tarjeta("JYN245")} .tr-marca input`);
  const b = await pg.textContent(".sd .tr-barra");
  ok(/2 viajes escogidos/.test(b), `con dos escogidos la barra dice «${b}»`);

  /* SE NOMBRAN LAS PLACAS EN EL CUADRO. Anular «2 viajes» sin decir
     cuáles es pedir una firma en blanco: con las casillas es fácil
     marcar una de más de un barrido, y la última oportunidad de verlo
     es aquí. */
  await pg.click(".sd .tr-barra .tr-adm.mal");
  await pg.waitForSelector(".sd .vj-caja");
  const cuadro = await pg.textContent(".sd .vj-caja");
  ok(/JGY577/.test(cuadro) && /JYN245/.test(cuadro),
     `el cuadro no nombra las placas que se van a anular: «${cuadro.slice(0, 120)}»`);
  ok(/no se borran/.test(cuadro),
     "en plural se perdió el aviso de que no se borran");

  await pg.fill(".sd .vj-caja .vj-motivo-campo input", "La importación se metió dos veces");
  await pg.click(".sd .vj-caja button:has-text('Anular los 2')");
  await pg.waitForTimeout(200);

  /* UNA LLAMADA POR VIAJE, CON EL MISMO MOTIVO. La función de la base
     es de uno; lo que no puede pasar es que se mande una sola y se
     quede un viaje sin anular. */
  const l = await llamadas();
  ok(l.length === 2, `se mandaron ${l.length} llamadas y hay 2 escogidos: ${JSON.stringify(l.map((x) => x.a?.p_id))}`);
  ok(l.every((x) => x.f === "sider_viaje_anular"),
     `alguna llamada no fue a sider_viaje_anular: ${JSON.stringify(l.map((x) => x.f))}`);
  ok(l.every((x) => x.a?.p_motivo === "La importación se metió dos veces"),
     "el motivo no llegó igual en las dos: se guarda uno por viaje y tienen que decir lo mismo");
  const ids = l.map((x) => x.a?.p_id).sort();
  ok(ids[0] === "v1" && ids[1] === "v2",
     `se anularon ${JSON.stringify(ids)} y los escogidos eran v1 y v2`);

  /* Y LA SELECCIÓN SE LIMPIA. Dejarla puesta después de anular hace
     que la barra siga diciendo «2 escogidos» de dos viajes que ya no
     están en la lista. */
  ok(!(await pg.isVisible(".sd .tr-barra")),
     "después de anular, la barra sigue con los viajes escogidos que ya no existen");
}

/* EL «TODOS» DEL CD. El caso que trae a alguien aquí es una
   importación metida dos veces, y eso llega por CD entero. */
await monta(true);
{
  const cab = ".sd .tr-grupo:has(:text-is('CD Unión Apartado')) .tr-grupo-cab .tr-marca input";
  ok(await pg.isVisible(cab), "el grupo con dos vehículos no ofrece escogerlos todos");
  await pg.click(cab);
  await pg.waitForSelector(".sd .tr-barra");
  const b = await pg.textContent(".sd .tr-barra");
  /* SOLO UNO: en ese CD hay dos tarjetas, pero KKL900 está esperando la
     muestra y a esa no se le ofrece anular en ninguna parte. Si el
     «todos» la metiera, la barra diría 2 y el cuadro nombraría una
     placa que no se puede anular. */
  ok(/3 viajes escogidos/.test(b),
     `«los del CD» escogió ${b.trim()}: en ese CD hay 3 y entran los 3, incluido el de la muestra`);

  /* Y EL CUADRO AVISA DE LO QUE CUESTA ANULAR AL DE LA MUESTRA.
     Anularlo cierra la revisión sin contar, y al socio se le abona todo
     lo que mandó: eso es plata, y quien anula tiene que saberlo ANTES,
     no enterarse el mes que viene. */
  await pg.click(".sd .tr-barra .tr-adm.mal");
  await pg.waitForSelector(".sd .vj-caja");
  const q = await pg.textContent(".sd .vj-caja");
  ok(/KKL900/.test(q), `el cuadro no nombra al que espera la muestra: «${q.slice(0, 140)}»`);
  ok(/nadie contó su muestra/.test(q) && /se le abona todo/.test(q),
     `el cuadro no avisa de lo que cuesta anular al de la muestra: «${q.slice(0, 200)}»`);
  await pg.click(".sd .vj-caja button:has-text('Cancelar')");

  /* Y CON NINGUNO DE LA MUESTRA, ESE AVISO NO SALE. Un aviso que sale
     siempre deja de querer decir algo a la semana. */
  await pg.click(`${tarjeta("KKL900")} .tr-marca input`);
  await pg.click(".sd .tr-barra .tr-adm.mal");
  await pg.waitForSelector(".sd .vj-caja");
  ok(!/nadie contó su muestra/.test(await pg.textContent(".sd .vj-caja")),
     "el aviso de la muestra sale aunque no haya ninguno esperando muestra");
  await pg.click(".sd .vj-caja button:has-text('Cancelar')");
  /* SE VUELVE A MARCAR EL QUE SE QUITÓ, para que el grupo esté otra vez
     completo: si no, el «todos» de abajo ya no está en «todos puestos»
     y tocarlo marcaría en vez de desmarcar. */
  await pg.click(`${tarjeta("KKL900")} .tr-marca input`);

  /* EL RÓTULO NO SE INVIERTE. Con todos marcados decía «Ninguno», y
     junto a una casilla encendida eso se lee como que no hay ninguno
     escogido. */
  ok(/Los 3/.test(await pg.textContent(".sd .tr-grupo:has(:text-is('CD Unión Apartado')) .tr-grupo-cab .tr-marca")),
     "el rótulo del «todos» se invierte al marcarlo y contradice a su propia casilla");

  /* Y SE DESESCOGEN CON EL MISMO TOQUE. */
  await pg.click(cab);
  ok(!(await pg.isVisible(".sd .tr-barra")),
     "tocar «Ninguno» no quita la selección del CD");
}

/* EL ENLACE A LOS ANULADOS. Al anular, la tarjeta se esfuma de esta
   lista y sin un camino a dónde fue hay que salir a Fuente principal y
   armar el filtro a mano justo después de que la pantalla acaba de
   decir que el viaje está allá. La cabecera la dibuja el servidor, así
   que aquí se comprueba la dirección que se construye, no el enlace. */
{
  const dir = "/sider?estado=anulado";
  const fp = readFileSync(R("src/app/(app)/sider/transito/page.tsx"), "utf8");
  ok(fp.includes(dir),
     "En tránsito no ofrece a dónde fueron los anulados: hay que armar el filtro a mano");
  const pg2 = readFileSync(R("src/app/(app)/sider/page.tsx"), "utf8");
  ok(/searchParams/.test(pg2),
     "Fuente principal no lee el estado de la dirección: el enlace llegaría sin filtrar");
  const vj = readFileSync(R("src/app/(app)/sider/Viajes.tsx"), "utf8");
  ok(/estadoInicial/.test(vj) && /ESTADOS.includes/.test(vj),
     "el estado de la dirección no se valida contra los del desplegable: un valor cualquiera " +
     "dejaría la lista vacía con un filtro que no se puede leer");
}

/* QUIEN NO MANDA NO PUEDE ESCOGER. Sin esto, el candado del botón
   estaría puesto y el de la casilla no, que es la misma puerta. */
await monta(false);
ok((await pg.$$(".sd .tr-marca")).length === 0,
   "a quien no administra le salen las casillas para escoger viajes");

/* =====================================================================
   7 · EL CAMINO DE PASOS DE LA REVISIÓN SE VE

   «Arregla esto que no se ve nada.»

   `.sd.tr-pantalla` le pone alto fijo a la pantalla para que ruede la
   LISTA por dentro. El formulario de la revisión vive en ese mismo
   marco y no tiene nada que rodar: en una columna flex de alto fijo, un
   hijo que no cabe SE ENCOGE, y el camino de pasos —que tiene
   `overflow:auto`— se encogía por debajo de su contenido hasta quedar
   en 14 px, que es lo que mide su propia barra de desplazamiento. Los
   tres círculos seguían ahí, de 59 px, dentro de una caja de 14.

   ESTO NO SE VE LEYENDO EL CSS. Los colores resuelven, los textos están
   en el DOM y los botones miden lo que deben; lo único que delata el
   defecto es comparar el alto de la caja con el de lo que lleva dentro.
   ===================================================================== */
await monta(true);
{
  await pg.click(`${tarjeta("KKL900")} button:has-text('Hacer la revisión AI')`);
  await pg.waitForSelector(".sd .ct-pasos", { timeout: 5000 });
  const m = await pg.evaluate(() => {
    const ol = document.querySelector(".sd .ct-pasos");
    const r = ol.getBoundingClientRect();
    const hijos = [...ol.querySelectorAll("li button")]
      .map((b) => Math.round(b.getBoundingClientRect().height));
    const circ = [...ol.querySelectorAll("li button i")]
      .map((i) => Math.round(i.getBoundingClientRect().height));
    return { alto: Math.round(r.height), hijos, circ,
             nombres: [...ol.querySelectorAll("li button span")].map((s) => s.textContent) };
  });
  ok(m.hijos.length >= 2,
     `el camino de pasos trae ${m.hijos.length} pasos: la revisión tiene al menos «Dónde» y «Fotos»`);
  /* LA CAJA TIENE QUE CABERLE A LO QUE LLEVA DENTRO. Es la
     comprobación entera: con el alto fijo encogiéndola, esto daba
     14 contra 59. */
  const masAlto = Math.max(...m.hijos);
  ok(m.alto >= masAlto,
     `el camino de pasos mide ${m.alto} px de alto y sus botones ${masAlto}: está aplastado y ` +
     "en la pantalla se ve una tira gris vacía");
  ok(m.circ.every((h) => h >= 20),
     `los círculos de los pasos miden ${JSON.stringify(m.circ)} px`);
  ok(m.nombres.some((n) => /Dónde/.test(n ?? "")),
     `los pasos no dicen su nombre: ${JSON.stringify(m.nombres)}`);

  /* Y LO DE ABAJO TAMPOCO SE APLASTA. El aviso y la tarjeta del
     formulario están en la misma columna y se encogían igual. */
  const tarj = await pg.evaluate(() => {
    const t = document.querySelector(".sd .tarjeta");
    if (!t) return null;
    return { alto: Math.round(t.getBoundingClientRect().height),
             dentro: Math.round(t.scrollHeight) };
  });
  ok(tarj && tarj.alto >= tarj.dentro - 2,
     `la tarjeta del formulario mide ${tarj?.alto} px y su contenido ${tarj?.dentro}: está recortada`);
}

/* =====================================================================
   8 · NADA SE SALE, Y LOS BOTONES SE TOCAN
   ===================================================================== */
console.log("");
for (const [nombre, ancho] of [["pc", 1440], ["tab", 820], ["cel", 390], ["360", 360]]) {
  await monta(true, ancho, 1400);
  const fuera = await pg.evaluate((w) => {
    const mal = [];
    document.querySelectorAll(".sd *").forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width && (r.right > w + 1 || r.left < -1)) mal.push((e.className || e.tagName) + " → " + Math.round(r.right));
    });
    return mal.slice(0, 3);
  }, ancho);
  ok(fuera.length === 0, `a ${ancho}px se sale del ancho: ${JSON.stringify(fuera)}`);

  /* EL CUADRO DE ANULAR TAMPOCO SE SALE, y es el que de verdad se abre
     en el teléfono: el de corregir se usa sentado. */
  await pg.click(`${tarjeta("JGY577")} button:has-text('Anular')`);
  await pg.waitForSelector(".sd .vj-caja");
  const c = await pg.$eval(".sd .vj-caja", (e) => { const r = e.getBoundingClientRect();
    return { d: r.right, i: r.left } });
  ok(c.d <= ancho + 1 && c.i >= -1,
     `a ${ancho}px el cuadro de anular se sale: de ${Math.round(c.i)} a ${Math.round(c.d)}`);
  const bot = await pg.$$eval(".sd .vj-caja button",
    (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)).filter((h) => h < 44));
  ok(bot.length === 0, `a ${ancho}px hay botones de ${JSON.stringify(bot)} px en el cuadro de anular`);
  console.log(`${nombre.padEnd(5)} ${String(ancho).padStart(4)}px  ${fuera.length ? "SE SALE" : "bien"}`);
}

await monta(true);
await pg.click(`${tarjeta("JGY577")} button:has-text('Anular')`);
await pg.waitForSelector(".sd .vj-caja");
await pg.screenshot({ path: ".arnes/tr-anular.png" });
/* Y CON UNA LETRA ESCRITA, que es el otro mensaje. */
await pg.fill(".sd .vj-caja .vj-motivo-campo input", "ab");
await pg.screenshot({ path: ".arnes/tr-anular-corto.png" });
await monta(true);
await pg.screenshot({ path: ".arnes/tr-admin.png" });
/* CON DOS ESCOGIDOS, para ver la barra y las casillas encendidas. */
await pg.click(`${tarjeta("JGY577")} .tr-marca input`);
await pg.click(`${tarjeta("LMN321")} .tr-marca input`);
await pg.waitForSelector(".sd .tr-barra");
await pg.screenshot({ path: ".arnes/tr-escogidos.png" });
/* Y EL CUADRO CON EL DE LA MUESTRA DENTRO, que es el caso nuevo. */
await pg.click(`${tarjeta("KKL900")} .tr-marca input`);
await pg.click(".sd .tr-barra .tr-adm.mal");
await pg.waitForSelector(".sd .vj-caja");
await pg.screenshot({ path: ".arnes/tr-anular-muestra.png" });
await monta(true, 390, 1400);
await pg.click(`${tarjeta("JGY577")} .tr-marca input`);
await pg.waitForSelector(".sd .tr-barra");
await pg.screenshot({ path: ".arnes/tr-escogidos-cel.png" });

await nav.close();
console.log("");
if (fallas.length) {
  console.log("FALLAS:");
  fallas.forEach((f) => console.log(" · " + f));
  process.exit(1);
}
console.log("✓ En tránsito: corregir y anular solo para quien manda, el que espera la muestra se " +
  "puede anular (avisando lo que cuesta) pero no corregir, anular exige motivo de verdad y llama a sider_viaje_anular con su p_motivo, " +
  "corregir usa los desplegables del maestro y manda «12,5» como 12.5, el rechazo de la base se " +
  "enseña sin cerrar el cuadro, y nada se sale en los cuatro anchos.");
