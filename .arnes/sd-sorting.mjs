/* =====================================================================
   SIDER · SORTING — LAS PANTALLAS

   La base (`correr-sider-sorting.sh`) ya prueba que Sorting no se cuela en
   el cobro. Esto prueba lo que solo se ve MONTANDO la pantalla de verdad:

   1. QUE LA AI SIGA GUARDANDO COMO ANTES. `p_tipo` solo puede viajar
      cuando es Sorting: si viajara siempre, el formulario de la AI dejaría
      de funcionar en el instante de subir el código y ANTES de correr el
      SQL, porque Postgres rechaza un parámetro con nombre que la función
      vieja no conoce. Es el peor tipo de error: no se ve en ninguna
      captura, y rompe el cobro en el muelle.

   2. QUE UN SORTING NO LE HABLE DE PLATA A LOS MUCHACHOS. «Abono final
      SAP» y «No se abona» son cifras del socio: verlas les hace creer que
      lo que cuentan mueve dinero.

   3. QUE LA LISTA DE LOS MUCHACHOS DIGA LA VERDAD: cuántos esperan, cuáles
      llevan más de un día, y que sin permiso de edición no haya botones.

   4. QUE NADA SE SALGA DE LA PANTALLA en los cuatro anchos.

   5. QUE PEDIR SORTING EN TRÁNSITO LLAME A LO QUE DEBE, y que pedir la AI
      siga llamando a lo de siempre.

   6. QUE SE DISTINGA DE LA AI. El magenta quedó a 87 del morado —no llega a
      100—, así que el color NO puede ir solo: se comprueba la palabra.

   Los componentes son los REALES. Solo `supabase` y `next/navigation` son
   dobles, porque son lo único que necesita un servidor.

     node .arnes/sd-sorting.mjs
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

/* ---------- LOS DOS DOBLES ---------- */
writeFileSync(R(".arnes/_so-cliente.ts"), `
/* Registra cada rpc y responde lo que el caso pida. */
const w = window as any;
w.__rpc = []; w.__refresh = 0; w.__rpcFalla = null; w.__filas = {};
function constructor(vista: string) {
  const b: any = {
    select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
    then: (res: any) => res({ data: w.__filas[vista] ?? [], error: null }),
  };
  return b;
}
export function createClient() {
  return {
    rpc: async (n: string, a: any) => {
      w.__rpc.push({ n, a });
      return w.__rpcFalla ? { data: null, error: { message: w.__rpcFalla } } : { data: "ok", error: null };
    },
    from: (v: string) => constructor(v),
  };
}`);
writeFileSync(R(".arnes/_so-nav.ts"), `
export function useRouter() { return { refresh: () => { (window as any).__refresh++ }, push() {}, replace() {}, back() {} } }
export function usePathname() { return "/sider/sorting" }
export function useSearchParams() { return new URLSearchParams() }`);

/* `next/link` en un arnés es un <a> y nada más — PERO CON SUS ATRIBUTOS. La
   primera versión de este doble en otro arnés solo pasaba `href` y los
   hijos, y se comía el `className`: el enlace salía sin estilo y la
   comprobación de contraste lo saltaba en silencio. Un doble que pierde una
   propiedad hace que el arnés mida otra pantalla. */
writeFileSync(R(".arnes/_so-link.tsx"), `
export default function Link({ href, children, ...resto }: any) {
  return <a href={href} {...resto}>{children}</a>;
}`);

/* ---------- LOS DATOS ---------- */
writeFileSync(R(".arnes/_so-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Sorting, haceCuanto, esTarde } from "../src/app/(app)/sider/sorting/Sorting";
import { FormularioAi } from "../src/modulos/sider/FormularioAi";
import { Transito } from "../src/app/(app)/sider/transito/Transito";
import { Viajes } from "../src/app/(app)/sider/Viajes";
import { unirMarcasSorting } from "../src/modulos/sider/comun";
(window as any).__unir = unirMarcasSorting;

(window as any).__haceCuanto = haceCuanto;
(window as any).__esTarde = esTarde;

const AHORA = "2026-09-29T15:00:00.000Z";
const hace = (h: number) => new Date(Date.parse(AHORA) - h * 3600000).toISOString();

const maestros: any = {
  falta: false,
  defectos: [
    { clave: "rota", nombre: "Rota o despicado", cobra: true, orden: 1, activo: true },
    { clave: "faltante", nombre: "Faltante", cobra: true, orden: 2, activo: true },
    { clave: "hongo", nombre: "Hongo", cobra: false, orden: 3, activo: true },
  ],
  envases: [{ clave: "G175", descripcion: "Costeñita 175", litros: 0.175, activo: true }],
  socios: [{ clave: "logi", nombre: "Logisinú", activo: true }],
  canales: [{ clave: "socios", nombre: "Socios", activo: true }, { clave: "t1", nombre: "T1", activo: true }],
};

const pend = (n: number, h: number, o: any = {}) => ({
  viaje_id: "v" + n, placa: o.placa ?? "SOR00" + n, planta: "BAQ", sku: "3500887", estibas: 20 + n,
  fecha: "2026-09-28", llego_en: hace(h), sorting_pedido_en: hace(h + 5),
  sorting_pedido_por: "u1", pedido_nombre: o.pedido ?? "Cristian Padilla",
});
const det = (n: number, o: any = {}) => ({
  id: "v" + n, placa: "SOR00" + n, cd_origen: o.origen ?? "Apartadó", cd_destino: "Barranquilla",
  descripcion: o.desc ?? "Botella Costeña 175 cc", tipo_envase: "G175", sider: 12.5, cajas: 1440, hl: 25.2,
});
const hecho = (n: number, o: any = {}) => ({
  id: "r" + n, viaje_id: "v" + n, fecha: "2026-09-27", planta: "BAQ", placa: o.placa ?? "HEC00" + n,
  turno: "T2", envase: "G175", envase_nombre: o.env ?? "Costeñita 175",
  recibidas: 82080, revisadas: 4104, defectos: 48, indice: 0.011696, ediciones: o.ed ?? 0,
  revisado_por: "u2", revisado_en: hace(20 + n), comentarios: null, zcl3: null,
  canal: "t1", certificado: false, socio: null,
});

const casos: Record<string, any> = {
  normal: { puedeEditar: true, maestros,
    pendientes: [pend(1, 30), pend(2, 3), pend(3, 50, { placa: "SIN-DETALLE" })],
    detalle: [det(1), det(2)], hechos: [hecho(1), hecho(2, { ed: 2 }), hecho(3)] },
  largos: { puedeEditar: true, maestros,
    pendientes: [pend(1, 30, { placa: "ABC-1234-LARGA", pedido: "Nombre Muy Largo De Una Persona Con Apellidos Compuestos" })],
    detalle: [det(1, { origen: "Centro de distribución de Apartadó zona franca", desc: "Botella retornable Costeña 175 cc caja por veinticuatro unidades reforzada" })],
    hechos: [hecho(1, { placa: "XYZ-9999-LARGA", env: "Envase retornable de vidrio color ámbar de 175 centímetros cúbicos" })] },
  lectura: { puedeEditar: false, maestros: null,
    pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
  vacio: { puedeEditar: true, maestros, pendientes: [], detalle: [], hechos: [] },
  /* SIN PERMISO PERO CON LOS MAESTROS. En producción la página no los
     trae si no puedes editar, así que esta combinación no debería darse —
     y por eso mismo hay que probarla: el componente tiene que negarse
     POR SU CUENTA, no confiar en que la página nunca le pase nada. Con
     el fixture de «lectura» (sin permiso Y sin maestros) esa defensa
     quedaba sin probar: quitarla no cambiaba nada. */
  lecturaConMaestros: { puedeEditar: false, maestros,
    pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
};

const q = new URL(location.href).searchParams;
const m = q.get("m") ?? "sorting";
const c = q.get("c") ?? "normal";
const root = createRoot(document.getElementById("r")!);

if (m === "sorting") {
  const k = casos[c];
  root.render(<Sorting ahora={AHORA} pendientes={k.pendientes} detalle={k.detalle}
    hechos={k.hechos} nombres={{ u1: "Cristian Padilla", u2: "Muchacho Uno" }}
    maestros={k.maestros} puedeEditar={k.puedeEditar} />);
} else if (m === "form") {
  const viaje = { viaje_id: "vf", placa: "FRM001", planta: "BAQ", fecha: "2026-09-28", sku: "3500887",
                  llego_en: hace(2) };
  root.render(<FormularioAi viaje={viaje} revision={null} detalle={[]} defectos={maestros.defectos}
    envases={maestros.envases} socios={maestros.socios} canales={maestros.canales}
    alGuardar={() => { (window as any).__guardado = true }} alCancelar={() => {}}
    {...(c === "sorting" ? { tipo: "sorting" as const } : {})} />);
} else if (m === "viajes") {
  /* FUENTE PRINCIPAL: la marca de Sorting junto al estado. */
  const f = (n: number, o: any) => ({
    id: "f" + n, placa: "FUE00" + n, planta: "APA", cd_origen: "Apartadó", cd_destino: "Barranquilla",
    sku: "3500887", descripcion: "Botella Costeña 175 cc", tipo_envase: "G175", estibas: 20, sider: 12.5,
    cajas: 1440, unidades: 34560, hl: 25.2, estado: "recibido", en_camino: null, fotos_salida: 3,
    fotos_llegada: 3, salida_en: hace(30), llegada_en: hace(24), creado_por: "u1", creado_en: hace(30),
    fecha: "2026-09-28", num_mes: 9, semana: 39, anio: 2026, importado: false, faltan_factores: false,
    observacion: null, motivo_anulacion: null, ...o });
  const viajes = [f(1, {}), f(2, {}), f(3, {}), f(4, { estado: "en_transito" })];
  root.render(<Viajes viajes={viajes as any} nombres={{ u1: "Cristian Padilla" }} origenes={[]} skus={[]}
    manda={false} esEditor={false}
    sorting={c === "sinmarcas" ? {} : { f1: "pendiente", f2: "hecho", f4: "pendiente" }} />);
} else {
  /* TRÁNSITO: la tarjeta, con los cuatro casos que importan. */
  const v = (n: number, o: any) => ({
    id: "t" + n, placa: o.placa ?? "TRN00" + n, planta: "APA", cd_origen: "Apartadó", cd_destino: "Barranquilla",
    sku: "3500887", descripcion: "Botella Costeña 175 cc", tipo_envase: "G175", estibas: 20, sider: 12.5,
    cajas: 1440, hl: 25.2, estado: "en_transito", en_camino: "05:30:00", fotos_salida: 3,
    salida_en: hace(6), salida_direccion: o.dir ?? "Calle 30 # 12-45, zona industrial", creado_por: "u1",
    creado_en: hace(6), fecha: "2026-09-29", importado: false, requiere_ai: false, ...o });
  const viajes = c === "largos"
    ? [v(1, { requiere_ai: true, requiere_sorting: true,
              dir: "Kilómetro 14 vía Barranquilla – Ciénaga, sector zona franca industrial, bodega 12 y 13" })]
    : [v(1, {}), v(2, { requiere_sorting: true }), v(3, { requiere_ai: true }),
       v(4, { requiere_ai: true, requiere_sorting: true })];
  root.render(<Transito viajes={viajes as any} nombres={{ u1: "Cristian Padilla" }}
    esEditor={true} esAdmin={c !== "noadmin"} manda={c !== "noadmin"} origenes={[]} skus={[]}
    maestrosAi={maestros} trabados={0} sinEvidencia={0} cabeza={<h1>En tránsito</h1>} />);
}
`);

const js = buildSync({
  entryPoints: [R(".arnes/_so-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "@/lib/supabase/client": R(".arnes/_so-cliente.ts"),
    "next/navigation": R(".arnes/_so-nav.ts"),
    "next/link": R(".arnes/_so-link.tsx"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = ["src/app/globals.css", "src/app/(app)/shell.css",
             "src/app/(app)/sider/sider.css", "src/modulos/sider/ai.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = [];
pg.on("pageerror", (e) => roto.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") roto.push(m.text()) });

const monta = async (query, ancho = 1440, tema = "") => {
  await pg.unrouteAll();
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <style>${P}${css}</style></head>
      <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">
      <div class="sd" id="r"></div></main></div></div>
      <script>${js}<\/script></body></html>`,
  }));
  await pg.goto(`http://arnes.local/?${query}`);
  /* SI NO PINTA, SE DICE POR QUÉ. Un «Timeout 30000ms» sin más obliga a
     adivinar; lo que sirve es el error que el componente tiró al montar. */
  try { await pg.waitForSelector("#r > *", { timeout: 8000 }) }
  catch { throw new Error(`«${query}» no pintó nada. Errores de la página: ${roto.slice(-3).join(" | ") || "ninguno"}`) }
};
const txt = () => pg.$eval("#r", (e) => e.textContent.replace(/\s+/g, " "));
const rpcs = () => pg.evaluate(() => window.__rpc);

/* DIAGNÓSTICO: `DEBUG="m=sorting&c=normal@360" node .arnes/sd-sorting.mjs`
   dice QUÉ elemento se sale de la pantalla, en vez de solo decir que algo
   se sale. Un «se sale 68 px» sin nombre obliga a adivinar. */
/* CAPTURA: `SHOT="m=sorting&c=normal@1440@/ruta/salida.png" node ...` */
if (process.env.SHOT) {
  const [q, w, ruta] = process.env.SHOT.split("@");
  await monta(q, Number(w));
  await pg.screenshot({ path: ruta, fullPage: true });
  await nav.close(); process.exit(0);
}
if (process.env.DEBUG) {
  const [q, w] = process.env.DEBUG.split("@");
  await monta(q, Number(w));
  const fuera = await pg.evaluate(() => {
    const W = document.documentElement.clientWidth;
    return [...document.querySelectorAll("#r *")]
      .filter((e) => e.getBoundingClientRect().right > W + 1)
      .slice(0, 10).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)} ` +
        `derecha=${Math.round(e.getBoundingClientRect().right)} ancho=${Math.round(e.getBoundingClientRect().width)}`);
  });
  console.log(fuera.join("\n") || "nada se sale"); await nav.close(); process.exit(0);
}

/* =====================================================================
   1 · «HACE 3 H»: LAS DOS FUNCIONES PURAS
   ---------------------------------------------------------------------
   Contra la hora que manda el SERVIDOR. Con Date.now() en el navegador el
   texto sale distinto en los dos lados y React avisa.
   ===================================================================== */
await monta("m=sorting&c=normal");
{
  const AH = "2026-09-29T15:00:00.000Z";
  const haceMin = (m) => new Date(Date.parse(AH) - m * 60000).toISOString();
  const casos = [
    [5, "hace 5 min"], [59, "hace 59 min"], [60, "hace 1 h"], [90, "hace 1 h"],
    [47 * 60, "hace 47 h"], [49 * 60, "hace 2 d"], [0, "hace 0 min"],
  ];
  for (const [m, dice] of casos) {
    const r = await pg.evaluate(([d, ah]) => window.__haceCuanto(d, ah), [haceMin(m), AH]);
    ok(r === dice, `a ${m} min dice «${r}» y son «${dice}»`);
  }
  ok(await pg.evaluate((ah) => window.__haceCuanto(null, ah), AH) === "—", "sin fecha no dice «—»");
  /* EL LÍMITE DE «TARDE»: exactamente 24 h NO es tarde; 24 h y un minuto, sí. */
  ok(await pg.evaluate(([d, ah]) => window.__esTarde(d, ah), [haceMin(24 * 60), AH]) === false,
     "exactamente 24 h ya cuenta como «tarde»: el límite es MÁS de un día");
  ok(await pg.evaluate(([d, ah]) => window.__esTarde(d, ah), [haceMin(24 * 60 + 1), AH]) === true,
     "24 h y un minuto NO cuenta como tarde");
  ok(await pg.evaluate((ah) => window.__esTarde(null, ah), AH) === false,
     "un camión sin fecha de llegada cuenta como tarde: sale teñido sin razón");
}

/* =====================================================================
   2 · LA LISTA DE LOS MUCHACHOS DICE LA VERDAD
   ===================================================================== */
{
  const cuantos = await pg.$$eval(".tr-vh.so", (s) => s.length);
  ok(cuantos === 3, `hay ${cuantos} tarjetas y son 3 los camiones esperando`);
  ok(await pg.$eval(".kpi .num", (e) => e.textContent.trim()) === "3",
     "el contador de «por hacer» no dice 3");
  /* SOLO EL DE 30 H Y EL DE 50 H SON «TARDE»; el de 3 h no. */
  ok(await pg.$$eval(".tr-vh.so-tarde", (s) => s.length) === 2,
     "«tarde» debería marcar 2 camiones (30 h y 50 h) y no el de 3 h");
  ok(/2 llevan más de un día esperando/.test(await txt()),
     `el contador no dice cuántos llevan más de un día: «${(await txt()).slice(0, 220)}»`);
  /* EL SELLO LLEVA LA PALABRA: el color solo no separa a Sorting de la AI. */
  const sellos = await pg.$$eval(".tr-vh.so .sello.sorting", (s) => s.map((e) => e.textContent.trim()));
  ok(sellos.length === 3 && sellos.every((t) => t === "SORTING"),
     `los sellos dicen [${sellos}] y tienen que decir la palabra SORTING`);
  ok(await pg.$$eval(".tr-vh.so .so-btn", (s) => s.length) === 3, "faltan botones «Hacer el Sorting»");
  /* Un camión sin detalle en la vista grande (llegó a la lista pero el
     viaje no se pudo leer) sigue apareciendo, con lo que sí se sabe. */
  ok(/SIN-DETALLE/.test(await txt()) && /3500887/.test(await txt()),
     "el camión sin detalle desapareció o perdió su material: no puede esconderse un pendiente");
  ok(/Lo pidió Cristian Padilla/.test(await txt()), "no dice quién pidió el Sorting");
  ok(roto.length === 0, `la pantalla tiró un error: ${roto[0]}`);
}

/* SIN PERMISO DE EDICIÓN: se ve, no se toca. */
await monta("m=sorting&c=lectura");
{
  ok(await pg.$$eval(".so-btn, .tr-so-btn", (s) => s.length) === 0,
     "quien no puede editar VE botones de hacer o corregir: la base los rechazaría, pero un botón que da error es peor que ninguno");
  ok(/Solo puedes mirar/.test(await txt()), "no explica por qué no hay botones");
  ok(/HEC001/.test(await txt()), "el de solo lectura no ve los Sorting hechos");
}

/* Y AUNQUE LE LLEGUEN LOS MAESTROS: el permiso lo decide el componente. */
await monta("m=sorting&c=lecturaConMaestros");
ok(await pg.$$eval(".so-btn, .tr-so-btn", (s) => s.length) === 0,
   "con los maestros a la mano pero SIN permiso de edición salen botones: el componente confía en que la página " +
   "nunca le pase los maestros a quien no puede editar, y el día que alguien cambie la página lo hace");

/* NADA QUE HACER. */
await monta("m=sorting&c=vacio");
{
  const t = await txt();
  ok(/No hay camiones esperando Sorting/.test(t), "sin pendientes no lo dice");
  ok(/Todavía no se ha cerrado ningún Sorting/.test(t), "sin hechos no lo dice");
  ok(await pg.$eval(".kpi .num", (e) => e.textContent.trim()) === "0", "el contador no dice 0");
  ok(/nada pendiente/.test(t), "el contador vacío no dice «nada pendiente»");
  ok(!/NaN|undefined|Infinity/.test(t), "salió basura con la lista vacía");
}

/* =====================================================================
   3 · LA AI SIGUE GUARDANDO COMO ANTES — Y EL SORTING CON SU TIPO
   ---------------------------------------------------------------------
   Es la comprobación más importante de este archivo. Se llena el
   formulario de verdad y se lee lo que llegaría a la base.
   ===================================================================== */
async function llenaYGuarda(query) {
  await monta(query);
  await pg.selectOption("#ai-canal", "t1");
  await pg.selectOption("#ai-envase", "G175");
  await pg.fill("#ai-rec", "1000");
  await pg.fill("#ai-rev", "100");
  for (let i = 0; i < 3; i++) await pg.click('button[aria-label="Sumar una de Rota o despicado"]');
  const boton = pg.locator("button.b1:not([disabled])").first();
  await boton.waitFor();
  const rotulo = (await boton.textContent()).trim();
  await boton.click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  return { rotulo, llamada: (await rpcs())[0] };
}

{
  const s = await llenaYGuarda("m=form&c=sorting");
  ok(s.llamada.n === "sider_ai_guardar", `guardó con «${s.llamada.n}»`);
  ok(s.llamada.a.p_tipo === "sorting",
     `un Sorting se guardó con p_tipo=${JSON.stringify(s.llamada.a.p_tipo)}: sin eso quedaría como AI y sumaría al cobro del socio`);
  ok(s.rotulo === "Cerrar Sorting", `el botón dice «${s.rotulo}» y en un Sorting tiene que decir «Cerrar Sorting»`);
  ok(s.llamada.a.p_conteos?.rota === 3 && s.llamada.a.p_revisadas === 100 && s.llamada.a.p_recibidas === 1000,
     `los datos no llegaron bien: ${JSON.stringify(s.llamada.a)}`);
  ok(s.llamada.a.p_viaje === "vf", "no mandó el viaje");
}
{
  const a = await llenaYGuarda("m=form&c=ai");
  ok(a.llamada.n === "sider_ai_guardar", "la AI no llamó a sider_ai_guardar");
  /* LA DEFENSA QUE IMPORTA. `"p_tipo" in args` y no `=== undefined`: una
     clave con valor undefined también viaja en el JSON… y se rechaza. */
  ok(!("p_tipo" in a.llamada.a),
     "LA AI MANDÓ p_tipo: en cuanto se suba este código —y antes de correr el SQL— Postgres " +
     "rechazaría el parámetro con nombre que la función vieja no conoce, y la revisión AI dejaría de guardar en el muelle");
  ok(a.rotulo === "Cerrar revisión", `la AI cambió su botón a «${a.rotulo}»`);
  ok(JSON.stringify(Object.keys(a.llamada.a).sort()) === JSON.stringify(
       ["p_canal","p_certificado","p_comentarios","p_conteos","p_envase","p_recibidas","p_revisadas","p_socio","p_turno","p_viaje","p_zcl3"].sort()),
     `la AI mandó otro juego de parámetros que antes: ${Object.keys(a.llamada.a).sort()}`);
}

/* LOS ROTULOS: UN SORTING NO HABLA DE PLATA; LA AI SÍ. */
{
  await monta("m=form&c=sorting");
  const t = await txt();
  for (const [re, que] of [[/Abono final SAP/, "«Abono final SAP»"], [/No se abona/, "«No se abona»"],
                           [/ÍNDICE DE COBRO/, "«ÍNDICE DE COBRO»"], [/ENTRAN AL COBRO/, "«ENTRAN AL COBRO»"],
                           [/NO COBRAN/, "«NO COBRAN»"], [/PARA EL FACTURADOR/, "«PARA EL FACTURADOR»"]]) {
    ok(!re.test(t), `el Sorting muestra ${que}: son palabras del cobro al socio y a los muchachos les hacen creer que lo que cuentan mueve plata`);
  }
  ok(/ÍNDICE DE DEFECTOS/.test(t) && /ENTRAN AL ÍNDICE/.test(t) && /COMENTARIOS DEL SORTING/.test(t),
     "el Sorting no tiene sus rótulos propios");
  await monta("m=form&c=ai");
  const u = await txt();
  for (const [re, que] of [[/Abono final SAP/, "«Abono final SAP»"], [/No se abona/, "«No se abona»"],
                           [/ÍNDICE DE COBRO/, "«ÍNDICE DE COBRO»"], [/ENTRAN AL COBRO/, "«ENTRAN AL COBRO»"],
                           [/PARA EL FACTURADOR/, "«PARA EL FACTURADOR»"]]) {
    ok(re.test(u), `la AI perdió ${que}: cambiar el formulario para Sorting no puede quitarle a la AI lo suyo`);
  }
  ok(!/ÍNDICE DE DEFECTOS|COMENTARIOS DEL SORTING/.test(u), "la AI muestra rótulos de Sorting");
}

/* =====================================================================
   4 · CERRAR Y CORREGIR DESDE LA LISTA
   ===================================================================== */
{
  await monta("m=sorting&c=normal");
  await pg.evaluate(() => { window.__filas = {
    v_sider_sorting_detalle: [
      { revision_id: "r1", defecto: "rota", defecto_nombre: "Rota o despicado", cobra: true, orden: 1, unidades: 37, pct: 0.009, hl: 0.06 },
    ] } });
  await pg.click(".tr-vh.so .so-btn >> nth=0");
  const t = await txt();
  ok(/Cerrar Sorting/.test(t) && /ÍNDICE DE DEFECTOS/.test(t), "el botón de la lista no abrió el formulario de Sorting");
  ok(await pg.$$eval(".tr-vh.so", (s) => s.length) === 0,
     "con el formulario abierto sigue la lista de camiones: la pantalla es de UN camión");
  ok(/SOR001/.test(t), "el formulario no muestra la placa del camión escogido");

  await pg.selectOption("#ai-canal", "t1");
  await pg.selectOption("#ai-envase", "G175");
  await pg.fill("#ai-rec", "500"); await pg.fill("#ai-rev", "50");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.a.p_viaje === "v1" && l.a.p_tipo === "sorting",
     `desde la lista guardó ${JSON.stringify(l.a).slice(0, 120)}`);
  await pg.waitForFunction(() => window.__refresh > 0);
  ok(/Sorting de SOR001 cerrado/.test(await txt()), "no avisó que el Sorting quedó cerrado");
  ok(await pg.$$eval(".tr-vh.so", (s) => s.length) === 3,
     "al guardar no volvió a la lista (el refresh trae la lista nueva desde el servidor)");
}

/* CORREGIR UNO CERRADO: trae sus conteos y guarda como corrección. */
{
  await monta("m=sorting&c=normal");
  await pg.evaluate(() => { window.__filas = {
    v_sider_sorting_detalle: [
      { revision_id: "r1", defecto: "rota", defecto_nombre: "Rota o despicado", cobra: true, orden: 1, unidades: 37, pct: 0.009, hl: 0.06 },
    ] } });
  await pg.click(".so-hechos .tr-so-btn >> nth=0");
  await pg.waitForSelector("#ai-rec");
  ok(/Guardar la corrección/.test(await txt()),
     "corregir un Sorting cerrado no abrió el formulario en modo corrección");
  ok(await pg.inputValue("#ai-rec") === "82080" && await pg.inputValue("#ai-rev") === "4104",
     "el formulario de corrección no trae lo que ya se había guardado");
  ok(/37/.test(await pg.$eval(".ai-def.hay", (e) => e.textContent)),
     "no trajo los conteos del Sorting (el 37 de «rota»)");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.a.p_tipo === "sorting" && l.a.p_viaje === "v1",
     `la corrección de un Sorting se guardó como ${JSON.stringify(l.a.p_tipo)}: corregiría la AI`);
  await pg.waitForFunction(() => window.__refresh > 0);
  ok(/Sorting de HEC001 corregido/.test(await txt()), "no dijo «corregido»");
}

/* SI LA BASE RECHAZA, EL FORMULARIO NO SE CIERRA NI FINGE QUE GUARDÓ. */
{
  await monta("m=form&c=sorting");
  await pg.evaluate(() => { window.__rpcFalla = "Registrar un Sorting requiere permiso de edición en Sorting" });
  await pg.selectOption("#ai-canal", "t1"); await pg.selectOption("#ai-envase", "G175");
  await pg.fill("#ai-rec", "1000"); await pg.fill("#ai-rev", "100");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForSelector(".ai-p-falla");
  ok(/permiso/.test(await pg.$eval(".ai-p-falla", (e) => e.textContent)),
     "el rechazo de la base no se le explica a quien está guardando");
  ok(await pg.evaluate(() => !window.__guardado), "cerró el formulario como si hubiera guardado, y la base lo rechazó");
}

/* =====================================================================
   5 · TRÁNSITO: PEDIR SORTING, Y PEDIR AI COMO SIEMPRE
   ===================================================================== */
await monta("m=transito&c=normal");
{
  const t = await txt();
  const tarjeta = (placa) => pg.locator(`article.tr-vh:has(.placa:text("${placa}"))`);
  /* CUATRO CAMIONES: nada, solo Sorting, solo AI, las dos. */
  const info = await pg.$$eval("article.tr-vh", (s) => s.map((a) => ({
    placa: a.querySelector(".placa").textContent,
    sorting: !!a.querySelector(".sello.sorting"), ai: !!a.querySelector(".sello.ai"),
    cls: a.className, boton: [...a.querySelectorAll(".tr-so-btn")].map((b) => b.textContent.trim()),
  })));
  const p = (x) => info.find((i) => i.placa === x);
  ok(!p("TRN001").sorting && !p("TRN001").ai && p("TRN001").boton[0] === "Pedir Sorting",
     `el camión sin nada debería ofrecer «Pedir Sorting»: ${JSON.stringify(p("TRN001"))}`);
  ok(p("TRN002").sorting && !p("TRN002").ai && p("TRN002").boton[0] === "Quitar Sorting",
     `el que ya pidió Sorting debería ofrecer «Quitar Sorting»: ${JSON.stringify(p("TRN002"))}`);
  ok(!p("TRN003").sorting && p("TRN003").ai, "el de solo AI no debe llevar sello de Sorting");
  ok(p("TRN004").sorting && p("TRN004").ai, "el que lleva las dos tiene que mostrar los dos sellos");
  /* EL COLOR DE LA TARJETA: la AI manda. */
  ok(/\bai\b/.test(p("TRN004").cls) && !/\bso\b/.test(p("TRN004").cls),
     `el camión con AI y Sorting se pinta ${p("TRN004").cls}: tiene que ser el morado de la AI, que se hace primero y cobra`);
  ok(/\bso\b/.test(p("TRN002").cls), "el de solo Sorting no lleva su franja");

  /* LOS DOS SELLOS SE LEEN POR LA PALABRA. */
  const dos = await pg.$$eval("article.tr-vh:has(.sello.sorting):has(.sello.ai) .sello", (s) => s.map((e) => e.textContent.trim()));
  ok(dos.includes("SORTING") && dos.includes("REVISIÓN AI"),
     `los dos sellos no se distinguen por la palabra: [${dos}]`);

  /* PEDIR SORTING LLAMA A LO SUYO Y NO A LO DE LA AI. */
  await tarjeta("TRN001").locator(".tr-so-btn").click();
  await pg.locator('[role="dialog"] button', { hasText: "Pedir Sorting" }).click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  let l = (await rpcs())[0];
  ok(l.n === "sider_sorting_marcar" && l.a.p_viaje === "t1" && l.a.p_marcar === true,
     `pedir Sorting llamó ${JSON.stringify(l)}`);
  ok(!("p_motivo" in l.a), "pedir Sorting manda p_motivo: la función no lo recibe");
  await pg.waitForFunction(() => window.__refresh > 0);
  ok(/TRN001 pasará a Sorting cuando llegue/.test(await txt()), "no confirmó que el camión pasará a Sorting");
}
{
  /* Y QUITARLO. */
  await monta("m=transito&c=normal");
  await pg.locator('article.tr-vh:has(.placa:text("TRN002")) .tr-so-btn').click();
  await pg.locator('[role="dialog"] button', { hasText: "Quitar el Sorting" }).click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.n === "sider_sorting_marcar" && l.a.p_marcar === false && l.a.p_viaje === "t2",
     `quitar el Sorting llamó ${JSON.stringify(l)}`);
}
{
  /* LA AI SIGUE PIDIÉNDOSE COMO SIEMPRE: la misma función, los mismos parámetros. */
  await monta("m=transito&c=normal");
  await pg.locator('article.tr-vh:has(.placa:text("TRN001")) .tr-ai').click();
  await pg.locator('[role="dialog"] button', { hasText: "Solicitar revisión" }).click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.n === "sider_ai_marcar" && l.a.p_marcar === true && l.a.p_viaje === "t1" && l.a.p_motivo === null,
     `pedir la AI cambió: ${JSON.stringify(l)}`);
  ok(!("p_tipo" in l.a), "pedir la AI manda p_tipo");
}
{
  /* QUIEN NO ES ADMINISTRADOR NO VE EL BOTÓN: el candado es la base, pero un
     botón que da error es peor que ninguno. */
  await monta("m=transito&c=noadmin");
  ok(await pg.$$eval(".tr-so-btn", (s) => s.length) === 0, "un no-administrador ve «Pedir Sorting»");
  ok(await pg.$$eval(".sello.sorting", (s) => s.length) === 2, "sin ser admin sí debe VER qué camiones llevan Sorting");
}

/* =====================================================================
   5b · FUENTE PRINCIPAL: «SORTING PENDIENTE» / «SORTING HECHO»
   ---------------------------------------------------------------------
   Lo eligió Cristian: el camión entra a la fuente principal al certificar
   la llegada, con una marca que dice si su Sorting sigue pendiente o ya
   se hizo. Las reglas de quién lleva qué marca están en una función pura.
   ===================================================================== */
{
  const u = (a, b) => pg.evaluate(([x, y]) => window.__unir(x, y), [a, b]);
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  let r = await u(["a", "b"], ["b"]);
  ok(eq(r, { a: "pendiente", b: "hecho" }), `pidió a y b, hizo b: salió ${JSON.stringify(r)}`);
  r = await u(["a"], ["zzz"]);
  ok(eq(r, { a: "pendiente" }),
     `un Sorting «hecho» de un camión que NUNCA LO PIDIÓ salió ${JSON.stringify(r)}: se le inventaría una marca`);
  r = await u(["a"], [null, undefined]);
  ok(eq(r, { a: "pendiente" }), `un Sorting sin viaje (importado) salió ${JSON.stringify(r)}`);
  ok(eq(await u([], []), {}), "sin nadie salió algo");
  r = await u(["a"], ["a", "a"]);
  ok(eq(r, { a: "hecho" }), `hecho dos veces salió ${JSON.stringify(r)}`);
}
await monta("m=viajes&c=marcas");
{
  const marcas = await pg.$$eval("tbody tr", (s) => s.map((tr) => ({
    placa: tr.querySelector(".placa")?.textContent,
    txt: tr.querySelector(".vj-sorting .sello")?.textContent.trim() ?? null,
    hecho: !!tr.querySelector(".vj-sorting .sello.hecho"),
  })));
  const m = Object.fromEntries(marcas.map((x) => [x.placa, x]));
  ok(m.FUE001.txt === "SORTING PENDIENTE" && !m.FUE001.hecho, `FUE001: ${JSON.stringify(m.FUE001)}`);
  ok(m.FUE002.txt === "SORTING HECHO" && m.FUE002.hecho, `FUE002: ${JSON.stringify(m.FUE002)}`);
  ok(m.FUE003.txt === null, `el que no pidió Sorting lleva marca: ${JSON.stringify(m.FUE003)}`);
  /* EL ESTADO NO SE PISA: un camión recibido con el Sorting pendiente dice
     las dos cosas, cada una en su sitio. */
  const est = await pg.$$eval("tbody tr", (s) => s.map((tr) =>
    [...tr.querySelectorAll(".sello")].map((e) => e.textContent.trim())));
  ok(est[0].includes("recibido") && est[0].includes("SORTING PENDIENTE"),
     `el estado y el Sorting no conviven en la misma fila: ${est[0]}`);
  ok(est[3].includes("en tránsito") && est[3].includes("SORTING PENDIENTE"),
     `un camión en tránsito que pidió Sorting: ${est[3]}`);
}
await monta("m=viajes&c=sinmarcas");
ok(await pg.$$eval(".vj-sorting", (s) => s.length) === 0,
   "sin marcas (o sin correr la migración) aparece un rótulo de Sorting igual");

/* =====================================================================
   6 · NADA SE SALE DE LA PANTALLA, en los cuatro anchos
   ===================================================================== */
for (const ancho of [360, 390, 820, 1440]) {
  for (const q of ["m=sorting&c=normal", "m=sorting&c=largos", "m=transito&c=largos"]) {
    await monta(q, ancho);
    const sobra = await pg.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(sobra <= 1, `${q} en ${ancho} px se sale ${sobra} px de ancho`);

    /* NADA POR FUERA DE SU TARJETA: la dirección larga empuja el botón fuera
       del borde (pasó con «Certificar llegada»), y ahora hay un botón más. */
    const fuera = await pg.$$eval("article.tr-vh", (s) => s.flatMap((a) => {
      const r = a.getBoundingClientRect();
      return [...a.querySelectorAll("button, .sello, dl, .tr-ruta")].map((e) => {
        const b = e.getBoundingClientRect();
        return b.right > r.right + 1 || b.left < r.left - 1
          ? `${e.className || e.tagName} llega a ${Math.round(b.right)} y su tarjeta termina en ${Math.round(r.right)}` : null;
      }).filter(Boolean);
    }));
    ok(fuera.length === 0, `${q} en ${ancho} px: ${fuera[0]}`);

    /* LOS DEDOS: ningún botón NUESTRO por debajo de 38 px. Solo los de
       Sorting: «Corregir» y «Anular» de Tránsito ya existían y miden 34 —es
       un asunto de esa pantalla, no de esta, y mezclarlo haría que este
       arnés fallara por algo que no tocamos. */
    const chicos = await pg.$$eval(".so-btn, .tr-so-btn, .tr-ai, footer .btn", (s) =>
      s.map((b) => [b.textContent.trim(), b.getBoundingClientRect().height])
       .filter(([, h]) => h > 0 && h < 38));
    ok(chicos.length === 0, `${q} en ${ancho} px: el botón «${chicos[0]?.[0]}» mide ${chicos[0]?.[1]} px`);

    /* Y LOS RENGLONES DE «HECHOS» NO SE MONTAN: cinco columnas en 360 px. */
    const filas = await pg.$$eval(".so-hechos li", (s) => s.map((li) => {
      const r = li.getBoundingClientRect();
      return [...li.children].map((c) => { const b = c.getBoundingClientRect();
        return { t: c.textContent.trim().slice(0, 14), x0: b.left, x1: b.right, y0: b.top, y1: b.bottom,
                 dentro: b.right <= r.right + 1 && b.left >= r.left - 1 } });
    }));
    for (const [i, hijos] of filas.entries()) {
      for (const h of hijos) ok(h.dentro, `${q} en ${ancho} px: «${h.t}» se sale del renglón ${i + 1} de Hechos`);
      for (let a = 0; a < hijos.length; a++) for (let b = a + 1; b < hijos.length; b++) {
        const A = hijos[a], B = hijos[b];
        const cruza = A.x0 < B.x1 - 1.5 && B.x0 < A.x1 - 1.5 && A.y0 < B.y1 - 1.5 && B.y0 < A.y1 - 1.5;
        ok(!cruza, `${q} en ${ancho} px: «${A.t}» y «${B.t}» se montan en Hechos`);
      }
    }
  }
}

/* =====================================================================
   7 · SE LEE Y SE DISTINGUE — EN LOS SIETE TEMAS
   ---------------------------------------------------------------------
   El magenta de Sorting quedó a 87 del morado de AI, por debajo del 100
   que se exigía: el color NO puede ir solo. Aquí se mide lo que sí se
   puede afirmar: que el texto se lee, y que las dos palabras son
   distintas —que es lo que separa una de la otra cuando el color no
   alcanza.
   ===================================================================== */
{
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const razon = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const t of ["", "oficial", "noche", "papel", "alto", "sobrio", "bosque"]) {
    await monta("m=transito&c=normal", 1440, t);
    const m = await pg.evaluate(() => {
      const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
        const s = getComputedStyle(e); return { c: s.color, f: s.backgroundColor, b: s.borderLeftColor } };
      return { so: g(".sello.sorting"), ai: g(".sello.ai"), btn: g(".tr-so-btn.on"),
               cardSo: g("article.tr-vh.so"), cardAi: g("article.tr-vh.ai"),
               largo: g("article.tr-vh.largo") };
    });
    ok(m.so && m.ai && m.btn, `[${t || "claro"}] faltan los sellos o el botón`);
    if (!(m.so && m.ai && m.btn)) continue;
    ok(razon(m.so.c, m.so.f) >= 4.5,
       `[${t || "claro"}] el sello SORTING se lee a ${razon(m.so.c, m.so.f).toFixed(1)}:1 y tiene que llegar a 4,5`);
    ok(razon(m.btn.c, m.btn.f) >= 4.5,
       `[${t || "claro"}] el botón «Quitar Sorting» se lee a ${razon(m.btn.c, m.btn.f).toFixed(1)}:1`);
    /* LA FRANJA DE SORTING NO PUEDE SER LA DE «VA TARDE» EN NINGÚN TEMA: en uno
       el oro es AZUL y un Sorting azul habría chocado justo ahí. */
    if (m.largo) {
      const d = Math.hypot(...[0, 1, 2].map((i) => m.cardSo.b.match(/\d+/g)[i] - m.largo.b.match(/\d+/g)[i]));
      ok(d >= 85, `[${t || "claro"}] la franja de Sorting está a ${Math.round(d)} de la de «va tarde»`);
    }
    /* Y las dos PALABRAS son distintas. */
    const w = await pg.$$eval(".sello.sorting, .sello.ai", (s) => s.map((e) => e.textContent.trim()));
    ok(new Set(w).size === 2, `[${t || "claro"}] los sellos de AI y Sorting dicen lo mismo: [${w}]`);
  }
}

ok(roto.length === 0, `hubo errores en la consola: ${roto[0]}`);
await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Sorting en pantalla: la AI se guarda EXACTAMENTE como antes —sin p_tipo, con el mismo juego de " +
            "parámetros— y solo el Sorting lo lleva; un Sorting no habla de plata ni de cobro y la AI conserva " +
            "todo lo suyo; la lista dice cuántos esperan y cuáles llevan más de un día, y sin permiso no hay " +
            "botones; pedir y quitar Sorting en Tránsito llama a su función y la AI sigue con la suya; cerrar " +
            "y corregir desde la lista guardan como Sorting; nada se sale ni se monta en los cuatro anchos, y " +
            "el sello se lee y se distingue de la AI por la palabra en los siete temas.");
