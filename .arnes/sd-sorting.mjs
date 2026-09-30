/* =====================================================================
   SIDER · REVISIÓN AI (la pantalla que se llamaba «Sorting») Y EL «+»
   DE TRÁNSITO — LAS PANTALLAS

   La base (`correr-sider-revision.sh`) ya prueba las reglas y el cobro.
   Esto prueba lo que solo se ve MONTANDO la pantalla de verdad, con los
   componentes REALES —solo `supabase`, `next/navigation` y `next/link`
   son dobles, porque son lo único que necesita un servidor—:

   1. LA LISTA DICE LA VERDAD. Dos clases —certificada y normal—, cada
      una con su palabra escrita (el color solo no las separa: el magenta
      quedó a 87 del morado), su contador, su filtro; el interno lleva su
      marca y dice «Lo creó», no «Lo pidió»; sin permiso de edición no hay
      botones, ni aunque la página le pase los maestros.

   2. LA AI SIGUE GUARDANDO COMO ANTES. `p_tipo` solo puede viajar cuando
      es la normal: si viajara siempre, el formulario dejaría de guardar
      en el instante de subir el código y ANTES de correr el SQL, porque
      Postgres rechaza un parámetro con nombre que la función vieja no
      conoce. Y AHORA LAS DOS MUESTRAN LA PLATA: las dos cobran, y esconder
      el índice de cobro en una de ellas sería mentirle a quien cuenta.

   3. EL «+» DE TRÁNSITO. Se escoge de listas, se calcula solo, dice qué
      falta por su nombre, no deja crear origen y destino iguales, manda
      a la base EXACTAMENTE los parámetros que la función espera, y un
      rechazo de la base no lo cierra ni finge que guardó.

   4. TRÁNSITO YA NO TIENE EL PASO DE LA AI NI EL INTERRUPTOR DE SORTING.
      El interno lleva su sello, no lleva reloj ni «0/3 fotos», y su
      recibo no reclama fotos de una salida que no hubo.

   5. FUENTE PRINCIPAL MARCA AL INTERNO en vez de decir «0/3 fotos».

   6. EL INFORME AI trae su columna de clase y su filtro.

   7. NADA SE SALE NI SE MONTA en 360/390/820/1440, y todo se lee en los
      SIETE TEMAS REALES (oficial, tinta, pizarra, ámbar, negro, gris,
      halo). La versión anterior de este arnés probaba «noche», «papel»,
      «alto»… que no existen: caían al tema por defecto y la prueba pasaba
      sin haber medido ninguno de los otros seis.

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

/* ---------- LOS TRES DOBLES ---------- */
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
export function useRouter() { return { refresh: () => { (window as any).__refresh++ }, push: (u: string) => { (window as any).__push = u }, replace() {}, back() {} } }
export function usePathname() { return "/sider/sorting" }
export function useSearchParams() { return new URLSearchParams() }`);
/* `next/link` es un <a> y nada más — PERO CON SUS ATRIBUTOS: un doble que
   pierde el className hace que el arnés mida otra pantalla. */
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
import { Informe } from "../src/app/(app)/sider/seguimiento/ai/Informe";
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

/* n=1 certificada de 30 h · n=2 certificada de 3 h · n=3 NORMAL INTERNO de 50 h ·
   n=4 normal (marcada por el administrador) de 5 h. */
const pend = (n: number, h: number, o: any = {}) => ({
  viaje_id: "v" + n, tipo: o.tipo ?? "ai", placa: o.placa ?? "REV00" + n, planta: "BAQ", sku: "3500887",
  estibas: 20 + n, fecha: "2026-09-28", llego_en: hace(h), pedido_en: hace(h + 5),
  pedido_por: "u1", motivo: o.motivo ?? null, interno: !!o.interno,
  pedido_nombre: o.pedido ?? "Cristian Padilla",
  ...(o.canal ? { canal: o.canal, socio: o.socio ?? null, envase: o.envase ?? null } : {}),
});
const det = (n: number, o: any = {}) => ({
  id: "v" + n, placa: "REV00" + n, cd_origen: o.origen ?? "Apartadó", cd_destino: "Barranquilla",
  descripcion: o.desc ?? "Botella Costeña 175 cc", tipo_envase: "G175", sider: 12.5, cajas: 1440, hl: 25.2,
  ...(o.unidades ? { unidades: o.unidades } : {}),
});
const hecho = (n: number, o: any = {}) => ({
  id: "r" + n, viaje_id: "v" + n, fecha: "2026-09-27", planta: "BAQ", placa: o.placa ?? "HEC00" + n,
  turno: "T2", envase: "G175", envase_nombre: o.env ?? "Costeñita 175",
  recibidas: 82080, revisadas: 4104, defectos: 48, indice: 0.011696, ediciones: o.ed ?? 0,
  revisado_por: "u2", revisado_en: hace(20 + n), comentarios: null, zcl3: null,
  canal: "t1", certificado: false, socio: null, ...(o.sinTipo ? {} : { tipo: o.tipo ?? "ai" }),
});

const ORIGENES = [
  { planta: "APA", cd_origen: "Apartadó" }, { planta: "BAQ", cd_origen: "Barranquilla" },
  { planta: "MDE", cd_origen: "Medellín" }];
const SKUS_M = [
  { sku: "3500887", descripcion: "Botella Costeña 175 cc", clase: "Envase", cajas_x_estiba: 72, unidades_x_caja: 24, hl_x_unidad: 0.00175 },
  { sku: "3500901", descripcion: "Costeñita Ámbar 330 cc", clase: "Envase", cajas_x_estiba: 60, unidades_x_caja: 24, hl_x_unidad: 0.0033 },
  { sku: "3500999", descripcion: "Caja plástica azul", clase: "Envase", cajas_x_estiba: null, unidades_x_caja: null, hl_x_unidad: null }];

const cuatro = [
  pend(1, 30), pend(2, 3),
  pend(3, 50, { tipo: "sorting", interno: true, pedido: "Control Uno", placa: "INT003", canal: "socios", socio: "logi", envase: "G175" }),
  pend(4, 5, { tipo: "sorting" }),
];
const casos: Record<string, any> = {
  normal: { puedeEditar: true, puedeCrear: true, maestros, pendientes: cuatro,
    detalle: [det(1, { unidades: 34560 }), det(2), det(4)],   /* el 3 SIN detalle: no puede esconderse */
    hechos: [hecho(1), hecho(2, { tipo: "sorting", ed: 2 }), hecho(3), hecho(5, { sinTipo: true })] },
  soloNormal: { puedeEditar: true, maestros, pendientes: [pend(4, 5, { tipo: "sorting" })],
    detalle: [det(4)], hechos: [hecho(2, { tipo: "sorting" })] },
  largos: { puedeEditar: true, maestros,
    pendientes: [pend(1, 30, { pedido: "Nombre Muy Largo De Una Persona Con Apellidos Compuestos" }),
                 pend(3, 50, { tipo: "sorting", interno: true, placa: "ABC-1234-LARGA", pedido: "Otro Nombre Muy Largo De Persona De Control" })],
    detalle: [det(1, { origen: "Centro de distribución de Apartadó zona franca", desc: "Botella retornable Costeña 175 cc caja por veinticuatro unidades reforzada" })],
    hechos: [hecho(1, { placa: "XYZ-9999-LARGA", env: "Envase retornable de vidrio color ámbar de 175 centímetros cúbicos" }),
             hecho(2, { tipo: "sorting", placa: "XYZ-8888-LARGA" })] },
  /* EDITA REVISIONES PERO NO TIENE EL PERMISO «Vh Interno (+)»: sin «+». */
  sincrear: { puedeEditar: true, puedeCrear: false, maestros, pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
  /* CREA PERO NO CIERRA REVISIONES: el «+» es de su propio permiso. */
  soloCrea: { puedeEditar: false, puedeCrear: true, maestros: null, pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
  lectura: { puedeEditar: false, maestros: null, pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
  vacio: { puedeEditar: true, maestros, pendientes: [], detalle: [], hechos: [] },
  /* SIN PERMISO PERO CON LOS MAESTROS: el componente tiene que negarse
     POR SU CUENTA, no confiar en que la página nunca se los pase. */
  lecturaConMaestros: { puedeEditar: false, maestros, pendientes: [pend(1, 30)], detalle: [det(1)], hechos: [hecho(1)] },
};

const q = new URL(location.href).searchParams;
const m = q.get("m") ?? "sorting";
const c = q.get("c") ?? "normal";
const root = createRoot(document.getElementById("r")!);

if (m === "sorting") {
  const k = casos[c];
  root.render(<Sorting ahora={AHORA} pendientes={k.pendientes} detalle={k.detalle}
    hechos={k.hechos} nombres={{ u1: "Cristian Padilla", u2: "Muchacho Uno" }}
    maestros={k.maestros} puedeEditar={k.puedeEditar}
    puedeCrear={!!k.puedeCrear} origenes={k.puedeCrear ? ORIGENES : []} skus={k.puedeCrear ? SKUS_M : []}
    socios={k.puedeCrear ? [{ clave: "logi", nombre: "Logisinú" }, { clave: "sur", nombre: "Distribuciones del Sur" }] : []}
    estibasPorSider={36} />);
} else if (m === "form") {
  const viaje = { viaje_id: "vf", placa: "FRM001", planta: "BAQ", fecha: "2026-09-28", sku: "3500887",
                  llego_en: hace(2),
                  ...(q.get("u") ? { unidades: Number(q.get("u")) } : {}),
                  ...(q.get("canal") ? { canal: q.get("canal") } : {}),
                  ...(q.get("socio") ? { socio: q.get("socio") } : {}),
                  ...(q.get("envase") ? { envase: q.get("envase") } : {}) };
  /* «corregir»: una revisión ya guardada, de T3, de T1 (canal), con envase G175. */
  const previa: any = q.get("previa") ? {
    id: "r9", viaje_id: "vf", fecha: "2026-09-27", planta: "BAQ", placa: "FRM001", turno: "T3",
    canal: "t1", canal_nombre: "T1", socio: null, socio_nombre: null, envase: "G175", envase_nombre: "Costeñita 175",
    litros: 0.175, certificado: false, recibidas: 1000, revisadas: 100, zcl3: null, comentarios: null,
    revisado_por: "u2", revisado_en: hace(20), editado_por: null, editado_en: null, ediciones: 0,
    defectos: 0, otros: 0, marcadas: 0, indice: 0, no_abono: 0, abono_sap: 1000, hl_defectos: 0 } : null;
  root.render(<FormularioAi viaje={viaje} revision={previa} detalle={[]} defectos={maestros.defectos}
    envases={maestros.envases} socios={maestros.socios} canales={maestros.canales}
    alGuardar={() => { (window as any).__guardado = true }} alCancelar={() => {}}
    {...(c === "sorting" ? { tipo: "sorting" as const } : {})} />);
} else if (m === "viajes") {
  /* FUENTE PRINCIPAL: la marca de la revisión normal junto al estado, y el interno. */
  const f = (n: number, o: any) => ({
    id: "f" + n, placa: "FUE00" + n, planta: "APA", cd_origen: "Apartadó", cd_destino: "Barranquilla",
    sku: "3500887", descripcion: "Botella Costeña 175 cc", tipo_envase: "G175", estibas: 20, sider: 12.5,
    cajas: 1440, unidades: 34560, hl: 25.2, estado: "recibido", en_camino: null, fotos_salida: 3,
    fotos_llegada: 3, salida_en: hace(30), llegada_en: hace(24), creado_por: "u1", creado_en: hace(30),
    fecha: "2026-09-28", num_mes: 9, semana: 39, anio: 2026, importado: false, faltan_factores: false,
    observacion: null, motivo_anulacion: null, ...o });
  const viajes = [f(1, {}), f(2, {}), f(3, {}), f(4, { estado: "en_transito" }),
                  f(5, { fotos_salida: 0, salida_en: null, en_camino: null })];
  root.render(<Viajes viajes={viajes as any} nombres={{ u1: "Cristian Padilla" }} origenes={[]} skus={[]}
    manda={false} esEditor={false}
    sorting={c === "sinmarcas" ? {} : { f1: "pendiente", f2: "hecho", f4: "pendiente", f5: "pendiente" }}
    internos={c === "sinmarcas" ? [] : ["f5"]} />);
} else if (m === "informe") {
  const rv = (n: number, o: any) => ({
    id: "i" + n, viaje_id: "v" + n, fecha: "2026-09-2" + n, planta: "BAQ", placa: "INF00" + n, turno: "T1",
    envase: "G175", envase_nombre: "Costeñita 175", recibidas: 1000, revisadas: 100, defectos: 3, otros: 0,
    no_abono: 30, hl_defectos: 0.1, indice: 0.03, socio: "logi", socio_nombre: "Logisinú",
    canal: "t1", canal_nombre: "T1", origen: "propio", ediciones: 0, comentarios: null, zcl3: null,
    defectos_hoja: 3, hl_hoja: 0.1, pct_hoja: 0.03, ...o });
  const revs = c === "sintipo"
    ? [rv(1, {}), rv(2, {})]
    : [rv(1, { tipo: "ai" }), rv(2, { tipo: "sorting" }), rv(3, { tipo: "sorting" })];
  const datos: any = { revisiones: revs,
    defectos: [{ clave: "rota", nombre: "Rota o despicado", cobra: true, orden: 1, unidades: 9, hl: 0.3, pct: 0.03 }],
    socios: [{ clave: "logi", nombre: "Logisinú", revisiones: revs.length, recibidas: 3000, revisadas: 300, defectos: 9, no_abono: 90, hl: 0.3, indice: 0.03 }],
    semanas: [{ semana: "2026-09-21", revisiones: revs.length, revisadas: 300, defectos: 9, indice: 0.03 }],
    total: { revisiones: revs.length, recibidas: 3000, revisadas: 300, defectos: 9, otros: 0, no_abono: 90, hl: 0.3,
             socios: 1, importadas: 0, indice: 0.03, defectos_hoja: 9, hl_hoja: 0.3, pct_hoja: 0.03 },
    porRevision: new Map() };
  root.render(<Informe datos={datos}
    opciones={{ socios: [["logi", "Logisinú"]], envases: [["G175", "Costeñita 175"]], canales: [["t1", "T1"]],
                primera: "2026-09-21", ultima: "2026-09-29" }}
    filtro={{ desde: "2026-09-21", hasta: "2026-09-29", ...(c === "filtrado" ? { tipo: "sorting" } : {}) }}
    esEditor={false} />);
} else {
  /* TRÁNSITO: la tarjeta, con los casos que importan. */
  const v = (n: number, o: any) => ({
    id: "t" + n, placa: o.placa ?? "TRN00" + n, planta: "APA", cd_origen: "Apartadó", cd_destino: "Barranquilla",
    sku: "3500887", descripcion: "Botella Costeña 175 cc", tipo_envase: "G175", estibas: 20, sider: 12.5,
    cajas: 1440, hl: 25.2, estado: "en_transito", en_camino: "05:30:00", fotos_salida: 3,
    salida_en: hace(6), salida_direccion: o.dir ?? "Calle 30 # 12-45, zona industrial", creado_por: "u1",
    creado_en: hace(6), fecha: "2026-09-29", importado: false, requiere_ai: false, ...o });
  const interno = (n: number, o: any = {}) => v(n, { placa: "INT00" + n, interno: true, requiere_sorting: true,
    fotos_salida: 0, salida_en: null, en_camino: null, salida_direccion: null, creado_en: hace(2), ...o });
  const viajes = c === "largos"
    ? [v(1, { requiere_ai: true, dir: "Kilómetro 14 vía Barranquilla – Ciénaga, sector zona franca industrial, bodega 12 y 13" }),
       interno(2, { descripcion: "Botella retornable Costeña 175 cc caja por veinticuatro unidades reforzada" })]
    : c === "sinfotos"
    ? [v(1, { fotos_salida: 1 }), interno(2)]
    : [v(1, {}), v(2, { requiere_sorting: true }), v(3, { requiere_ai: true }),
       interno(4), v(5, { requiere_ai: true, requiere_sorting: true })];
  const origenes = [
    { planta: "APA", cd_origen: "Apartadó" }, { planta: "BAQ", cd_origen: "Barranquilla" },
    { planta: "MDE", cd_origen: "Medellín" }];
  const skus = [
    { sku: "3500887", descripcion: "Botella Costeña 175 cc", clase: "Envase", cajas_x_estiba: 72, unidades_x_caja: 24, hl_x_unidad: 0.00175 },
    { sku: "3500901", descripcion: "Costeñita Ámbar 330 cc", clase: "Envase", cajas_x_estiba: 60, unidades_x_caja: 24, hl_x_unidad: 0.0033 },
    { sku: "3500999", descripcion: "Caja plástica azul", clase: "Envase", cajas_x_estiba: null, unidades_x_caja: null, hl_x_unidad: null }];
  root.render(<Transito viajes={viajes as any} nombres={{ u1: "Cristian Padilla" }}
    esEditor={c !== "lectura"} esAdmin={c !== "noadmin"} manda={c !== "noadmin"}
    origenes={origenes} skus={skus} estibasPorSider={36}
    trabados={0} sinEvidencia={0} cabeza={<h1>En tránsito</h1>} />);
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
             "src/app/(app)/sider/sider.css", "src/modulos/sider/ai.css",
             "src/app/(app)/sider/seguimiento/ai/informe.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = [];
pg.on("pageerror", (e) => roto.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") roto.push(m.text()) });

/* EL RELOJ: con «&t=2026-09-30T01:30:00Z» la página vive en esa hora. */
await pg.addInitScript(() => {
  const t = new URL(location.href).searchParams.get("t");
  if (!t) return;
  const off = Date.parse(t) - Date.now(), Real = Date;
  class Falso extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() + off) }
    static now() { return Real.now() + off }
  }
  window.Date = Falso;
});
const monta = async (query, ancho = 1440, tema = "") => {
  await pg.unrouteAll();
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <style>${P}${css}</style></head>
      <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">
      <div class="sd${query.startsWith("m=sorting") ? " so-pantalla" : ""}" id="r"></div></main></div></div>
      <script>${js}<\/script></body></html>`,
  }));
  await pg.goto(`http://arnes.local/?${query}`);
  try { await pg.waitForSelector("#r > *", { timeout: 8000 }) }
  catch { throw new Error(`«${query}» no pintó nada. Errores de la página: ${roto.slice(-3).join(" | ") || "ninguno"}`) }
};
const txt = () => pg.$eval("#r", (e) => e.textContent.replace(/\s+/g, " "));
/* «¿De quién es?» del «+»: sin escoger, el formulario no sabe si pide socio o documento. */
const t1 = () => pg.click('.nv-canal-bot button:has-text("T1")');
const socioBtn = () => pg.click('.nv-canal-bot button:has-text("Socio")');
const rpcs = () => pg.evaluate(() => window.__rpc);

/* DIAGNÓSTICO: `DEBUG="m=sorting&c=normal@360" node .arnes/sd-sorting.mjs`
   dice QUÉ elemento se sale; `SHOT="q@ancho@/ruta.png"` saca una captura. */
if (process.env.SHOT) {
  const [q, w, ruta, tema] = process.env.SHOT.split("@");
  await monta(q, Number(w), tema ?? "");
  if (process.env.CLIC) await pg.click(process.env.CLIC);
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
  ok(await pg.evaluate(([d, ah]) => window.__esTarde(d, ah), [haceMin(24 * 60), AH]) === false,
     "exactamente 24 h ya cuenta como «tarde»: el límite es MÁS de un día");
  ok(await pg.evaluate(([d, ah]) => window.__esTarde(d, ah), [haceMin(24 * 60 + 1), AH]) === true,
     "24 h y un minuto NO cuenta como tarde");
  ok(await pg.evaluate((ah) => window.__esTarde(null, ah), AH) === false,
     "un camión sin fecha de llegada cuenta como tarde: sale teñido sin razón");
}

/* =====================================================================
   2 · LA LISTA DICE LA VERDAD — LAS DOS CLASES
   ===================================================================== */
{
  const t = await txt();
  ok(await pg.$$eval(".tr-vh", (s) => s.length) === 4, "no hay 4 tarjetas: son 4 los camiones esperando");
  ok(await pg.$$eval(".tr-vh.ai", (s) => s.length) === 2 && await pg.$$eval(".tr-vh.so", (s) => s.length) === 2,
     "las tarjetas no se reparten 2 certificadas (morado) y 2 normales (magenta)");
  ok(await pg.$eval(".kpi .num", (e) => e.textContent.trim()) === "4", "el contador de «por hacer» no dice 4");
  ok(/2 certificadas · 2 normales/.test(t), `el contador no reparte por clase: «${t.slice(0, 260)}»`);
  ok(/2 con más de un día/.test(t), "el contador no dice cuántos llevan más de un día");
  ok(await pg.$$eval(".tr-vh.so-tarde", (s) => s.length) === 2,
     "«tarde» debería marcar 2 camiones (30 h y 50 h) y no los de 3 h y 5 h");

  /* LA CLASE VA CON LA PALABRA ESCRITA. */
  const cert = await pg.$$eval(".tr-vh .sello.ai", (s) => s.map((e) => e.textContent.trim()));
  const norm = await pg.$$eval(".tr-vh .sello.sorting", (s) => s.map((e) => e.textContent.trim()));
  ok(cert.length === 2 && cert.every((x) => x === "CERTIFICADA"), `sellos de certificada: [${cert}]`);
  ok(norm.length === 2 && norm.every((x) => x === "NORMAL"), `sellos de normal: [${norm}]`);

  /* EL INTERNO SE MARCA, Y SOLO EL INTERNO. */
  const internos = await pg.$$eval(".tr-vh .sello.interno", (s) => s.map((e) => e.closest(".tr-vh").querySelector(".placa").textContent));
  ok(internos.length === 1 && internos[0] === "INT003", `sellos «INTERNO» en [${internos}]: solo INT003 lo creó control`);
  ok(/Lo creó Control Uno/.test(t), "el interno no dice «Lo creó»");
  ok(await pg.$$eval(".tr-vh", (s) => s.filter((a) => a.querySelector(".sello.interno")).every((a) => /Creado/.test(a.textContent) && !/Llegó/.test(a.textContent))),
     "un Vh Interno dice «Llegó»: nunca llegó, lo crearon aquí");
  ok(await pg.$$eval(".tr-vh", (s) => s.filter((a) => !a.querySelector(".sello.interno")).every((a) => /Llegó/.test(a.textContent))),
     "una revisión de Sider ya no dice «Llegó»");
  ok(/Lo pidió Cristian Padilla/.test(t), "la certificada no dice «Lo pidió»");
  ok(await pg.$$eval(".tr-vh", (s) => s.filter((a) => a.querySelector(".sello.interno")).every((a) => !/Lo pidió/.test(a.textContent))),
     "un interno dice «Lo pidió»: nadie lo pidió, lo creó control");

  /* SIN DETALLE el camión no desaparece ni repite el material. */
  const sd = await pg.$eval('.tr-vh:has(.placa:text("INT003"))', (a) => a.textContent.replace(/\s+/g, " "));
  ok(/3500887/.test(sd) && /Material sin descripción/.test(sd), "el camión sin detalle perdió su material");
  ok((sd.match(/3500887/g) || []).length === 1, "el material sin descripción se dice dos veces");

  ok(await pg.$$eval(".tr-vh footer .btn", (s) => s.filter((b) => b.textContent.trim() === "Hacer la revisión").length) === 4,
     "faltan botones «Hacer la revisión»");
  ok(await pg.$$eval(".tr-vh.ai footer .btn.ai", (s) => s.length) === 2 &&
     await pg.$$eval(".tr-vh.so footer .btn.so-btn", (s) => s.length) === 2,
     "cada clase debe llevar el botón de su color");
  ok(!/Sorting/i.test(t), `la pantalla todavía dice «Sorting»: «${(t.match(/.{20}Sorting.{20}/i) || [""])[0]}»`);
  ok(await pg.$eval("h1", (e) => e.textContent.trim()) === "Revisión AI", "el título no es «Revisión AI»");

  /* LAS HECHAS: cada una con su clase; sin `tipo` (migración sin correr) = certificada. */
  const hs = await pg.$$eval(".so-hechos li", (s) => s.map((li) => ({
    placa: li.querySelector(".placa").textContent, sello: li.querySelector(".so-h-tipo .sello").textContent.trim() })));
  ok(hs.length === 4, `hay ${hs.length} hechas y son 4`);
  ok(hs.find((h) => h.placa === "HEC002")?.sello === "NORMAL", "HEC002 es normal y no lo dice");
  ok(hs.find((h) => h.placa === "HEC001")?.sello === "CERTIFICADA", "HEC001 es certificada y no lo dice");
  ok(hs.find((h) => h.placa === "HEC005")?.sello === "CERTIFICADA",
     "una revisión SIN `tipo` (la migración no se ha corrido) tiene que salir como certificada");
  ok(/corregida 2 veces/.test(t), "no dice cuántas veces se corrigió");
  ok(roto.length === 0, `la pantalla tiró un error: ${roto[0]}`);

  /* LAS DOS CLASES, CADA UNA EN SU BLOQUE: nunca en la misma lista. */
  ok(await pg.$$eval(".so-clase", (s) => s.length) === 0, "quedó el filtro de clase: ahora son dos bloques separados");
  const bl = await pg.$$eval(".so-bloque", (s) => s.map((b) => ({
    css: b.className.replace("so-bloque", "").trim(), titulo: b.querySelector("h2").textContent.trim(),
    tarjetas: b.querySelectorAll(".tr-vh").length, propias: b.querySelectorAll(".tr-vh.ai, .tr-vh.so").length,
    hechas: b.querySelectorAll(".so-hechos li").length,
    porHacer: b.querySelector(".so-bloque-n b").textContent.trim(),
    rotuloHechas: [...b.querySelectorAll("h3")].map((h) => h.textContent.replace(/\s+/g, " ").trim()) })));
  ok(bl.length === 2, `hay ${bl.length} bloques y son 2`);
  ok(bl[0]?.css === "ai" && bl[0]?.titulo === "Revisión AI – certificada", `el primer bloque es «${bl[0]?.titulo}»`);
  ok(bl[1]?.css === "so" && bl[1]?.titulo === "Revisión AI – normal", `el segundo bloque es «${bl[1]?.titulo}»`);
  ok(bl[0]?.tarjetas === 2 && bl[1]?.tarjetas === 2, `las tarjetas se reparten ${bl.map((x) => x.tarjetas)} y son 2 y 2`);
  ok(await pg.$$eval(".so-bloque.ai .tr-vh", (s) => s.every((a) => a.classList.contains("ai"))) &&
     await pg.$$eval(".so-bloque.so .tr-vh", (s) => s.every((a) => a.classList.contains("so"))),
     "una tarjeta quedó en el bloque de la OTRA clase");
  ok(bl[0]?.hechas === 3 && bl[1]?.hechas === 1, `las hechas se reparten ${bl.map((x) => x.hechas)} y son 3 y 1`);
  ok(await pg.$$eval(".so-bloque.ai .so-hechos li", (s) => s.every((l) => l.classList.contains("ai"))) &&
     await pg.$$eval(".so-bloque.so .so-hechos li", (s) => s.every((l) => l.classList.contains("so"))),
     "una revisión hecha quedó en el bloque de la OTRA clase");
  ok(bl[0]?.porHacer === "2" && bl[1]?.porHacer === "2", "el contador de cada bloque no dice 2 y 2");
  ok(/Hechas las últimas 1/.test(bl[1]?.rotuloHechas.join(" ")), "el rótulo de «Hechas» de la normal no cuenta sus propias hechas");
  ok(/Hechas las últimas 3/.test(bl[0]?.rotuloHechas.join(" ")), "el rótulo de «Hechas» de la certificada no cuenta las suyas");
  /* EL COLOR DEL BLOQUE ES EL DE SU CLASE: la franja del encabezado coincide con la de sus tarjetas. */
  const col = await pg.evaluate(() => {
    const c = (sel) => getComputedStyle(document.querySelector(sel)).borderLeftColor;
    return { cabAi: c(".so-bloque.ai .so-bloque-cab"), cabSo: c(".so-bloque.so .so-bloque-cab"),
             tAi: c(".so-bloque.ai .tr-vh"), tSo: c(".so-bloque.so .tr-vh") } });
  ok(col.cabAi === col.tAi && col.cabSo === col.tSo && col.cabAi !== col.cabSo,
     `el encabezado de cada bloque no lleva el color de su clase: ${JSON.stringify(col)}`);
  ok(await pg.$$eval(".so-bloque.ai .sello.sorting, .so-bloque.so .sello.ai", (s) => s.length) === 0,
     "un sello de una clase apareció dentro del bloque de la otra");
}
{
  /* UN BLOQUE SIN NADA DE SU CLASE dice que está vacío, y el otro sigue con lo suyo. */
  await monta("m=sorting&c=soloNormal");
  const t = await txt();
  ok(/No hay revisiones certificadas por hacer/.test(t), `bloque certificada vacío: «${t.slice(0, 200)}»`);
  ok(/Todavía no hay revisiones certificadas cerradas/.test(t), "el bloque sin hechas no lo dice");
  ok(!/No hay revisiones normales por hacer/.test(t), "dice que no hay normales cuando sí hay una");
  ok(await pg.$$eval(".so-bloque.so .tr-vh", (s) => s.length) === 1 && await pg.$$eval(".so-bloque.ai .tr-vh", (s) => s.length) === 0,
     "el camión normal no quedó solo en su bloque");
}

/* SIN PERMISO DE EDICIÓN: se ve, no se toca. */
await monta("m=sorting&c=lectura");
{
  ok(await pg.$$eval(".tr-vh footer .btn, .tr-so-btn", (s) => s.length) === 0,
     "quien no puede editar VE botones de hacer o corregir: un botón que da error es peor que ninguno");
  ok(/Solo puedes mirar/.test(await txt()), "no explica por qué no hay botones");
  ok(/HEC001/.test(await txt()), "el de solo lectura no ve las revisiones hechas");
}
/* Y AUNQUE LE LLEGUEN LOS MAESTROS: el permiso lo decide el componente. */
await monta("m=sorting&c=lecturaConMaestros");
ok(await pg.$$eval(".tr-vh footer .btn, .tr-so-btn", (s) => s.length) === 0,
   "con los maestros a la mano pero SIN permiso de edición salen botones: el componente confía en que la página " +
   "nunca le pase los maestros a quien no puede editar, y el día que alguien cambie la página lo hace");

/* NADA QUE HACER. */
await monta("m=sorting&c=vacio");
{
  const t = await txt();
  ok(/No hay revisiones certificadas por hacer/.test(t) && /No hay revisiones normales por hacer/.test(t),
     "sin pendientes cada bloque debe decirlo");
  ok(/Todavía no hay revisiones certificadas cerradas/.test(t) && /Todavía no hay revisiones normales cerradas/.test(t),
     "sin hechas cada bloque debe decirlo");
  ok(await pg.$$eval(".so-bloque", (s) => s.length) === 2, "sin nada, los dos bloques tienen que seguir a la vista");
  ok(await pg.$eval(".kpi .num", (e) => e.textContent.trim()) === "0", "el contador no dice 0");
  ok(/nada pendiente/.test(t), "el contador vacío no dice «nada pendiente»");
  ok(!/NaN|undefined|Infinity/.test(t), "salió basura con la lista vacía");
}

/* =====================================================================
   3 · LA AI SIGUE GUARDANDO COMO ANTES — Y LA NORMAL CON SU TIPO
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
     `una revisión normal se guardó con p_tipo=${JSON.stringify(s.llamada.a.p_tipo)}: sin eso quedaría como certificada`);
  ok(s.rotulo === "Cerrar revisión", `el botón dice «${s.rotulo}»`);
  ok(s.llamada.a.p_conteos?.rota === 3 && s.llamada.a.p_revisadas === 100 && s.llamada.a.p_recibidas === 1000,
     `los datos no llegaron bien: ${JSON.stringify(s.llamada.a)}`);
  ok(s.llamada.a.p_viaje === "vf", "no mandó el viaje");
}
{
  const a = await llenaYGuarda("m=form&c=ai");
  ok(a.llamada.n === "sider_ai_guardar", "la certificada no llamó a sider_ai_guardar");
  /* `"p_tipo" in args` y no `=== undefined`: una clave con valor undefined también viaja… y se rechaza. */
  ok(!("p_tipo" in a.llamada.a),
     "LA CERTIFICADA MANDÓ p_tipo: en cuanto se suba este código —y antes de correr el SQL— Postgres " +
     "rechazaría el parámetro con nombre que la función vieja no conoce, y la revisión AI dejaría de guardar en el muelle");
  ok(a.rotulo === "Cerrar revisión", `la certificada cambió su botón a «${a.rotulo}»`);
  ok(JSON.stringify(Object.keys(a.llamada.a).sort()) === JSON.stringify(
       ["p_canal","p_certificado","p_comentarios","p_conteos","p_envase","p_recibidas","p_revisadas","p_socio","p_turno","p_viaje","p_zcl3"].sort()),
     `la certificada mandó otro juego de parámetros que antes: ${Object.keys(a.llamada.a).sort()}`);
}
/* =====================================================================
   3b · EL FORMULARIO ABRE CON LO QUE YA SE SABE
   ===================================================================== */
/* EL TURNO SALE DE LA HORA DE COLOMBIA (UTC-5): T1 06–14, T2 14–22, T3 22–06. En los bordes. */
for (const [utc, esperado, hora] of [
  ["2026-09-29T11:00:00Z", "T1", "06:00"], ["2026-09-29T10:59:00Z", "T3", "05:59"],
  ["2026-09-29T18:59:00Z", "T1", "13:59"], ["2026-09-29T19:00:00Z", "T2", "14:00"],
  ["2026-09-30T02:59:00Z", "T2", "21:59"], ["2026-09-30T03:00:00Z", "T3", "22:00"],
  ["2026-09-29T05:00:00Z", "T3", "00:00"], ["2026-09-29T15:30:00Z", "T1", "10:30"],
]) {
  await monta("m=form&c=ai&t=" + utc);
  const on = await pg.$$eval(".ai-seg button.on", (b) => b.map((x) => x.textContent));
  ok(on.length === 1 && on[0] === esperado, `a las ${hora} en Colombia el turno abrió en ${JSON.stringify(on)} y debía ser ${esperado}`);
}
/* Y SE PUEDE CAMBIAR, y lo cambiado es lo que viaja. */
{
  await monta("m=form&c=ai&t=2026-09-29T15:30:00Z&canal=t1&envase=G175");
  await pg.click('.ai-seg button:has-text("T3")');
  ok(await pg.$eval(".ai-seg button.on", (e) => e.textContent) === "T3", "no dejó cambiar el turno");
  await pg.fill("#ai-rec", "1000"); await pg.fill("#ai-rev", "100");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  ok((await rpcs())[0].a.p_turno === "T3", "el turno cambiado a mano no es el que viaja");
}
/* UN VH INTERNO DE UN SOCIO: canal, socio y envase puestos; nada que escoger. */
{
  await monta("m=form&c=sorting&u=34560&canal=socios&socio=logi&envase=G175&t=2026-09-29T20:00:00Z");
  ok(await pg.$$eval("select#ai-canal, select#ai-socio, select#ai-envase", (s) => s.length) === 0, "con el viaje completo sigue habiendo desplegables");
  ok(await pg.$eval(".ai-seg button.on", (e) => e.textContent) === "T2", "a las 15:00 el turno no abrió en T2");
  const f = await pg.$eval(".ai-p-faltan", (e) => e.textContent);
  ok(/Cuántas se revisaron/.test(f) && !/socio|envase|llegaron/i.test(f), "pide más que las revisadas: " + f);
  ok(/Lo dijo el Vh Interno/.test(await txt()) && /Sale del material del viaje/.test(await txt()), "no dice de dónde salen los datos");
  await pg.fill("#ai-rev", "3456");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const a = (await rpcs())[0].a;
  ok(a.p_canal === "socios" && a.p_socio === "logi" && a.p_envase === "G175" && a.p_turno === "T2" && a.p_revisadas === 3456 && a.p_recibidas === 34560,
     "lo que viaja no es lo del viaje: " + JSON.stringify(a));
}
/* «CAMBIAR» abre los campos, con lo del viaje escogido, y lo que se cambia es lo que viaja. */
{
  await monta("m=form&c=sorting&u=34560&canal=socios&socio=logi&envase=G175");
  ok(/Cambiar canal, socio o envase/.test(await txt()), "no ofrece cambiar");
  await pg.click('button:has-text("Cambiar canal, socio o envase")');
  ok(await pg.inputValue("select#ai-canal") === "socios" && await pg.inputValue("select#ai-socio") === "logi" && await pg.inputValue("select#ai-envase") === "G175",
     "al abrir el cambio no quedan escogidos los del viaje");
  ok(await pg.$$eval(".ai-cambiar", (s) => s.length) === 0, "sigue el botón de cambiar con los campos abiertos");
  await pg.selectOption("select#ai-canal", "t1");
  await pg.fill("#ai-rev", "100");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const a = (await rpcs())[0].a;
  ok(a.p_canal === "t1" && a.p_socio === null, "el canal cambiado a T1 no viajó sin socio: " + JSON.stringify(a));
}
/* UN VH INTERNO DE T1: sin socio. */
{
  await monta("m=form&c=sorting&u=34560&canal=t1&envase=G175");
  ok(await pg.$$eval("#ai-socio", (s) => s.length) === 0, "un camión de T1 muestra socio");
  await pg.fill("#ai-rev", "100");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const a = (await rpcs())[0].a;
  ok(a.p_canal === "t1" && a.p_socio === null && a.p_envase === "G175", "T1 no viajó bien: " + JSON.stringify(a));
}
/* UN CAMIÓN CERTIFICADO POR SIDER solo trae el envase: el canal (y socio) se siguen escogiendo. */
{
  await monta("m=form&c=ai&u=34560&envase=G175");
  ok(await pg.$$eval("select#ai-canal", (s) => s.length) === 1 && await pg.$$eval("#ai-envase", (s) => s.length) === 1
     && await pg.$$eval("select#ai-envase", (s) => s.length) === 0, "con solo el envase debía traer el envase fijo y el canal por escoger");
  ok(await pg.inputValue("select#ai-canal") === "socios" && /El socio/.test(await pg.$eval(".ai-p-faltan", (e) => e.textContent)),
     "el socio no queda por escoger");
  await pg.selectOption("select#ai-socio", "logi");
  await pg.fill("#ai-rev", "100");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const a = (await rpcs())[0].a;
  ok(a.p_envase === "G175" && a.p_socio === "logi", "no viajó bien: " + JSON.stringify(a));
}
/* UN CAMIÓN DE SOCIO SIN SOCIO GUARDADO (o con un socio ya apagado) no se cierra con el campo vacío:
   el socio se escoge. */
for (const q of ["canal=socios&envase=G175", "canal=socios&socio=apagado&envase=G175"]) {
  await monta("m=form&c=ai&u=34560&" + q);
  ok(await pg.$$eval("select#ai-socio", (x) => x.length) === 1 && await pg.inputValue("select#ai-socio") === ""
     && /El socio/.test(await pg.$eval(".ai-p-faltan", (e) => e.textContent)),
     "[" + q + "] un camión de socio sin socio válido no deja escoger el socio");
}
/* UN ENVASE QUE EL MAESTRO YA NO TRAE no se precarga: se escoge a mano. */
{
  await monta("m=form&c=ai&u=34560&envase=ZZZ999&canal=t1");
  ok(await pg.$$eval("select#ai-envase", (s) => s.length) === 1 && await pg.inputValue("select#ai-envase") === "",
     "un envase que no está en el maestro se precargó");
}
/* AL CORREGIR MANDA LO GUARDADO —turno, canal, envase—, no el viaje ni la hora de ahora. */
{
  await monta("m=form&c=ai&previa=1&canal=socios&socio=logi&envase=G175&t=2026-09-29T15:30:00Z");
  ok(await pg.$eval(".ai-seg button.on", (e) => e.textContent) === "T3", "al corregir el turno no es el que se guardó (T3)");
  ok(await pg.$$eval("select#ai-canal", (s) => s.length) === 1 && await pg.inputValue("select#ai-canal") === "t1",
     "al corregir no muestra el canal guardado editable");
  ok(await pg.$$eval(".ai-cambiar", (s) => s.length) === 0, "al corregir ofrece «Cambiar» sobre datos que ya son editables");
}

/* RECIBIDAS SALEN DE LA TARJETA; NO HAY N.° ZCL3 (ni socios ni T1). */
{
  await monta("m=form&c=sorting&u=34560");
  ok(await pg.$$eval("input#ai-rec", (s) => s.length) === 0, "con la tarjeta a la vista «recibidas» sigue siendo casilla para teclear");
  ok((await pg.$eval("#ai-rec", (e) => e.textContent)).replace(/\D/g, "") === "34560", "no muestra las botellas de la tarjeta");
  ok(/Salen de la tarjeta del camión/.test(await txt()), "no dice de dónde salen las recibidas");
  ok(await pg.$$eval("#ai-zcl3", (s) => s.length) === 0 && !/ZCL3/.test(await txt()), "sigue pidiendo el N.° ZCL3");
  await pg.selectOption("#ai-canal", "socios");
  ok(await pg.$$eval("#ai-zcl3", (s) => s.length) === 0, "el ZCL3 vuelve con el canal de socios");
  await pg.selectOption("#ai-canal", "t1");
  await pg.selectOption("#ai-envase", "G175");
  await pg.fill("#ai-rev", "3456");
  for (let i = 0; i < 3; i++) await pg.click('button[aria-label="Sumar una de Rota o despicado"]');
  const t = await txt();
  ok(/34\.560|34,560|34 560/.test(t.replace(/\u00a0/g, " ")), "el panel no usa las recibidas de la tarjeta");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.a.p_recibidas === 34560, `mandó recibidas=${l.a.p_recibidas}, no las de la tarjeta`);
  ok(l.a.p_zcl3 === null, `mandó ZCL3=${JSON.stringify(l.a.p_zcl3)}`);
}
{
  await monta("m=form&c=sorting");
  ok(await pg.$$eval("input#ai-rec", (s) => s.length) === 1 && /no pudo calcularlas/.test(await txt()),
     "sin dato de la tarjeta no deja escribir las recibidas y la revisión quedaría bloqueada");
}
/* LAS DOS MUESTRAN LA PLATA Y LA CLASE. Las dos cobran. */
for (const [c, clase] of [["sorting", "Revisión AI – normal"], ["ai", "Revisión AI – certificada"]]) {
  await monta(`m=form&c=${c}`);
  const t = await txt();
  for (const [re, que] of [[/Abono final SAP/, "«Abono final SAP»"], [/No se abona/, "«No se abona»"],
                           [/ÍNDICE DE COBRO/, "«ÍNDICE DE COBRO»"], [/ENTRAN AL COBRO/, "«ENTRAN AL COBRO»"],
                           [/NO COBRAN/, "«NO COBRAN»"], [/PARA EL FACTURADOR/, "«PARA EL FACTURADOR»"]]) {
    ok(re.test(t), `[${c}] la revisión ${clase} no muestra ${que}: las dos cobran`);
  }
  ok(!/ÍNDICE DE DEFECTOS|COMENTARIOS DEL SORTING|ENTRAN AL ÍNDICE/.test(t), `[${c}] quedaron rótulos del Sorting viejo`);
  ok(new RegExp("REVISIÓN\\s*" + clase).test(t), `[${c}] la cinta no dice «${clase}»`);
}

/* =====================================================================
   4 · HACER Y CORREGIR DESDE LA LISTA
   ===================================================================== */
{
  await monta("m=sorting&c=normal&t=2026-09-29T15:00:00Z");   /* 10:00 en Colombia → T1 */
  await pg.click(".tr-vh.so .so-btn >> nth=0");
  let t = await txt();
  ok(/INT003/.test(t) && /Revisión AI – normal/.test(t), "el botón de la normal no abrió el formulario de la normal");
  ok(await pg.$$eval(".tr-vh", (s) => s.length) === 0, "con el formulario abierto sigue la lista: la pantalla es de UN camión");
  /* EL VH INTERNO YA DIJO DE QUIÉN Y DE QUÉ: no hay nada que escoger, solo se cuentan botellas. */
  ok(await pg.$$eval("select#ai-canal, select#ai-socio, select#ai-envase", (s) => s.length) === 0,
     "el interno con canal, socio y envase sigue pidiendo escogerlos");
  ok(/Socios/.test(await pg.$eval("#ai-canal", (e) => e.textContent)) && /Logisinú/.test(await pg.$eval("#ai-socio", (e) => e.textContent))
     && /G175/.test(await pg.$eval("#ai-envase", (e) => e.textContent)), "no muestra el canal, el socio y el envase del interno");
  ok(await pg.$eval(".ai-seg button.on", (e) => e.textContent) === "T1", "el turno no abre en el de la hora (10:00 → T1)");
  ok(/Cuántas se revisaron/.test(await pg.$eval(".ai-p-faltan", (e) => e.textContent)) && !/socio|envase|turno/i.test(await pg.$eval(".ai-p-faltan", (e) => e.textContent)),
     "el panel pide algo más que las botellas revisadas: " + await pg.$eval(".ai-p-faltan", (e) => e.textContent));
  await pg.fill("#ai-rec", "500"); await pg.fill("#ai-rev", "50");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.a.p_viaje === "v3" && l.a.p_tipo === "sorting", `la normal guardó ${JSON.stringify(l.a).slice(0, 140)}`);
  ok(l.a.p_canal === "socios" && l.a.p_socio === "logi" && l.a.p_envase === "G175" && l.a.p_turno === "T1",
     `no mandó lo que trajo el viaje: ${JSON.stringify(l.a)}`);
  await pg.waitForFunction(() => window.__refresh > 0);
  ok(/Revisión AI – normal de INT003 cerrada/.test(await txt()), "no avisó que la revisión normal quedó cerrada");
  ok(await pg.$$eval(".tr-vh", (s) => s.length) === 4, "al guardar no volvió a la lista");
}
{
  await monta("m=sorting&c=normal");
  await pg.click(".tr-vh.ai .btn.ai >> nth=0");
  ok((await pg.$eval("#ai-rec", (e) => e.textContent)).replace(/\D/g, "") === "34560",
     "desde la lista, la tarjeta del camión no le pasó sus botellas al formulario");
  await pg.selectOption("#ai-canal", "t1"); await pg.selectOption("#ai-envase", "G175");
  await pg.fill("#ai-rev", "50");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.a.p_recibidas === 34560, `mandó recibidas=${l.a.p_recibidas}`);
  ok(l.a.p_viaje === "v1" && !("p_tipo" in l.a), `la certificada guardó ${JSON.stringify(l.a).slice(0, 140)}`);
  await pg.waitForFunction(() => window.__refresh > 0);
  ok(/Revisión AI – certificada de REV001 cerrada/.test(await txt()), "no avisó que la certificada quedó cerrada");
}
/* CORREGIR UNA CERRADA: trae sus conteos y guarda como corrección, con SU clase. */
for (const [sel, viaje, tipo, aviso] of [
  [".so-hechos li.so .tr-so-btn", "v2", "sorting", /Revisión AI – normal de HEC002 corregida/],
  [".so-hechos li.ai .tr-so-btn", "v1", null, /Revisión AI – certificada de HEC001 corregida/],
]) {
  await monta("m=sorting&c=normal");
  await pg.evaluate(() => { window.__filas = { v_sider_ai_detalle: [
    { revision_id: "r1", defecto: "rota", defecto_nombre: "Rota o despicado", cobra: true, orden: 1, unidades: 37, pct: 0.009, hl: 0.06 },
    { revision_id: "r2", defecto: "rota", defecto_nombre: "Rota o despicado", cobra: true, orden: 1, unidades: 37, pct: 0.009, hl: 0.06 },
  ] } });
  await pg.click(sel + " >> nth=0");
  await pg.waitForSelector("#ai-rec");
  ok(/Guardar la corrección/.test(await txt()), "corregir no abrió el formulario en modo corrección");
  /* v1 tiene tarjeta (34 560 botellas) → sale de ella; v2 no → trae lo ya guardado. */
  const recVis = viaje === "v1"
    ? (await pg.$eval("#ai-rec", (e) => e.textContent)).replace(/\D/g, "") === "34560"
    : await pg.inputValue("#ai-rec") === "82080";
  ok(recVis && await pg.inputValue("#ai-rev") === "4104",
     "el formulario de corrección no trae lo ya guardado");
  ok(/37/.test(await pg.$eval(".ai-def.hay", (e) => e.textContent)), "no trajo los conteos (el 37 de «rota»)");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.a.p_viaje === viaje && (tipo ? l.a.p_tipo === tipo : !("p_tipo" in l.a)),
     `la corrección de ${viaje} se guardó como ${JSON.stringify(l.a.p_tipo)}: cambiaría de clase`);
  await pg.waitForFunction(() => window.__refresh > 0);
  ok(aviso.test(await txt()), `no dijo «corregida»: ${aviso}`);
}
/* SI LA BASE RECHAZA, EL FORMULARIO NO SE CIERRA NI FINGE QUE GUARDÓ. */
{
  await monta("m=form&c=sorting");
  await pg.evaluate(() => { window.__rpcFalla = "Registrar una revisión requiere permiso de edición en Revisión AI" });
  await pg.selectOption("#ai-canal", "t1"); await pg.selectOption("#ai-envase", "G175");
  await pg.fill("#ai-rec", "1000"); await pg.fill("#ai-rev", "100");
  await pg.locator("button.b1:not([disabled])").first().click();
  await pg.waitForSelector(".ai-p-falla");
  ok(/permiso/.test(await pg.$eval(".ai-p-falla", (e) => e.textContent)), "el rechazo de la base no se explica");
  ok(await pg.evaluate(() => !window.__guardado), "cerró el formulario como si hubiera guardado, y la base lo rechazó");
}

/* =====================================================================
   5 · TRÁNSITO: SIN EL PASO DE LA AI, SIN SORTING, CON EL INTERNO
   ===================================================================== */
await monta("m=transito&c=normal");
{
  const t = await txt();
  const info = await pg.$$eval("article.tr-vh", (s) => s.map((a) => ({
    placa: a.querySelector(".placa").textContent, cls: a.className,
    ai: a.querySelector(".sello.ai")?.textContent.trim() ?? null,
    so: a.querySelector(".sello.sorting")?.textContent.trim() ?? null,
    interno: a.querySelector(".sello.interno")?.textContent.trim() ?? null,
    reloj: !!a.querySelector(".sello.transito, .sello.falta"),
    boton: a.querySelector(".tr-ai")?.textContent.trim() ?? null,
    pie: a.querySelector("footer .tr-salio")?.textContent.replace(/\s+/g, " ") ?? "",
  })));
  const p = (x) => info.find((i) => i.placa === x);
  ok(!p("TRN001").ai && !p("TRN001").so && !p("TRN001").interno && p("TRN001").boton === "Pedir revisión AI",
     `el camión sin nada: ${JSON.stringify(p("TRN001"))}`);
  ok(p("TRN002").so === "REVISIÓN AI · NORMAL" && !p("TRN002").ai, `el marcado como normal: ${JSON.stringify(p("TRN002"))}`);
  ok(p("TRN003").ai === "REVISIÓN AI · CERTIFICADA" && p("TRN003").boton === "Quitar revisión AI",
     `el de la certificada: ${JSON.stringify(p("TRN003"))}`);
  ok(p("TRN005").ai && p("TRN005").so && /\bai\b/.test(p("TRN005").cls) && !/\bso\b/.test(p("TRN005").cls),
     `con las dos se pinta ${p("TRN005").cls}: tiene que mandar la certificada (morado)`);

  /* EL INTERNO */
  const i = p("INT004");
  ok(i.interno === "VH INTERNO · REVISIÓN NORMAL", `el sello del interno dice «${i.interno}»`);
  ok(!i.so && !i.ai, "el interno lleva un segundo sello con lo mismo");
  ok(!i.reloj, "el interno lleva reloj de «en camino»: no hubo salida desde donde contarlo");
  ok(i.boton === null, "al interno se le ofrece «Pedir revisión AI»: la certificada no es para él");
  ok(/sin salida certificada/.test(i.pie) && !/0\/3/.test(i.pie), `el pie del interno dice «${i.pie}»`);
  ok(/\bso\b/.test(i.cls) && !/\bai\b/.test(i.cls), `el interno se pinta «${i.cls}»`);
  ok(await pg.$eval('article.tr-vh:has(.placa:text("INT004")) footer .mal', () => true).catch(() => false) === false,
     "el interno sale con un «0/3 fotos» en rojo: reclama fotos de una salida que no hubo");
  ok(await pg.$eval('article.tr-vh:has(.placa:text("INT004"))', (a) => !/le faltan fotos/.test(a.textContent)),
     "el interno lleva el aviso «A la salida le faltan fotos»: reclama fotos de una salida que no hubo");
  ok(await pg.$eval('article.tr-vh:has(.placa:text("TRN001"))', (a) => !/le faltan fotos/.test(a.textContent)),
     "un camión con sus 3 fotos de salida lleva el aviso de fotos faltantes");

  /* LO QUE YA NO EXISTE */
  ok(!/Pedir Sorting|Quitar Sorting|Solicitar Sorting/.test(t), "todavía se ofrece pedir Sorting en Tránsito");
  ok(await pg.$$eval(".tr-so-btn", (s) => s.length) === 0, "quedó un botón de Sorting en Tránsito");
  ok(!/ya llegó y nadie contó su muestra/.test(t), "el anular todavía habla de la muestra que ya no se cuenta aquí");

  /* PEDIR LA AI SIGUE SIENDO LO DE SIEMPRE. */
  await pg.locator('article.tr-vh:has(.placa:text("TRN001")) .tr-ai').click();
  await pg.locator('[role="dialog"] button', { hasText: "Solicitar revisión" }).click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.n === "sider_ai_marcar" && l.a.p_marcar === true && l.a.p_viaje === "t1" && l.a.p_motivo === null,
     `pedir la AI cambió: ${JSON.stringify(l)}`);
  ok(!("p_tipo" in l.a), "pedir la AI manda p_tipo");
}
await monta("m=transito&c=noadmin");
{
  ok(await pg.$$eval(".tr-ai", (s) => s.length) === 0, "un no-administrador ve «Pedir revisión AI»");
  ok(await pg.$$eval(".sello.ai, .sello.sorting, .sello.interno", (s) => s.length) === 5,
     "sin ser admin sí debe VER las marcas (3 de revisión + interno + una con las dos)");
}

/* ---------- EL RECIBO: EL INTERNO NO RECLAMA FOTOS DE UNA SALIDA QUE NO HUBO ---------- */
{
  await monta("m=transito&c=sinfotos");
  const pedidos = [];
  pg.on("request", (r) => { if (/\/api\/sider\/evidencia\//.test(r.url())) pedidos.push(r.url()) });
  await pg.locator('article.tr-vh:has(.placa:text("INT002")) .btn:has-text("Certificar llegada")').click();
  await pg.waitForSelector(".tr-llegada");
  let t = await txt();
  ok(/Llegó INT002/.test(t), "no abrió el recibo del interno");
  ok(!/Faltan las fotos de la SALIDA/.test(t), "el recibo del interno reclama las fotos de una salida que nunca hubo: quedaría trancado");
  ok(/por control/.test(t), "el recibo del interno no dice que lo creó control");
  ok(/Al certificarla pasa a Revisión AI – normal/.test(t), "el recibo no dice a dónde pasa el interno");
  await pg.waitForTimeout(300);
  ok(pedidos.length === 0, "el recibo del interno fue a buscar las fotos de una salida que no existe");

  /* Y AL NORMAL CON SALIDA INCOMPLETA SÍ SE LO DICE: la regla no se relajó para todos. */
  await monta("m=transito&c=sinfotos");
  await pg.locator('article.tr-vh:has(.placa:text("TRN001")) .btn:has-text("Certificar llegada")').click();
  await pg.waitForSelector(".tr-llegada");
  t = await txt();
  ok(/Faltan las fotos de la SALIDA/.test(t), "un camión normal con 1 de 3 fotos de salida ya no las reclama: la regla se relajó para todos");
  ok(!/Al certificarla pasa a Revisión AI/.test(t), "un camión sin revisión pedida dice que pasa a Revisión AI");
}

/* =====================================================================
   5a · EL «+»: MONTAR UN CAMIÓN INTERNO
   ===================================================================== */
/* TRÁNSITO YA NO TIENE «+»: el Vh Interno no pasa por ahí. */
await monta("m=transito&c=normal");
ok(await pg.$$eval(".tr-mas", (s) => s.length) === 0, "En tránsito todavía tiene el «+»: el Vh Interno se crea en Revisión AI");
ok(await pg.$$eval("article.tr-vh .btn", (s) => s.some((b) => /Certificar llegada/.test(b.textContent))),
   "Tránsito perdió «Certificar llegada» al quitarle el «+»");
await monta("m=sorting&c=lectura");
ok(await pg.$$eval(".tr-mas", (s) => s.length) === 0, "quien solo mira Revisión AI ve el «+»");
/* CERRAR REVISIONES NO ALCANZA: el «+» tiene su propio permiso. */
await monta("m=sorting&c=sincrear");
ok(await pg.$$eval(".tr-mas", (s) => s.length) === 0, "quien cierra revisiones pero NO tiene «Vh Interno (+)» ve el «+»");
ok(await pg.$$eval(".tr-vh .btn", (s) => s.some((b) => /Hacer la revisión/.test(b.textContent))),
   "sin el permiso del «+» también se le quitó hacer la revisión");
/* Y AL REVÉS: puede crear sin poder cerrar revisiones. */
await monta("m=sorting&c=soloCrea");
ok(await pg.$$eval(".tr-mas", (s) => s.length) === 1, "quien tiene «Vh Interno (+)» y no cierra revisiones no ve el «+»");
ok(await pg.$$eval(".tr-vh .btn", (s) => s.some((b) => /Hacer la revisión/.test(b.textContent))) === false,
   "quien solo crea ve «Hacer la revisión»");

await monta("m=sorting&c=normal");
{
  ok(await pg.$$eval(".tr-mas", (s) => s.length) === 1, "no aparece el «+» para quien tiene el permiso");
  ok(/Vh Interno/.test(await pg.$eval(".tr-mas", (e) => e.textContent)), "el «+» no dice qué crea");
  await pg.click(".tr-mas");
  await pg.waitForSelector("#nv-titulo");
  const crear = pg.locator('.vj-caja.nuevo .btn:has-text("Crear Vh Interno")');

  /* NADA ESCRITO: el botón apagado y lo que falta dicho por su nombre. */
  ok(await crear.isDisabled(), "el botón de crear está encendido con el formulario vacío");
  let t = await pg.$eval(".vj-caja.nuevo", (e) => e.textContent.replace(/\s+/g, " "));
  ok(/Falta si es de un socio o de T1, la placa \(3 letras y 3 números\), el CD de origen, el material, las estibas\./.test(t), `lo que falta no se dice por su nombre: «${t.slice(-160)}»`);
  ok(await pg.inputValue(".nv-campos select >> nth=1") === "Barranquilla", "el destino no arranca en Barranquilla");
  const destinos = await pg.$$eval(".nv-campos select >> nth=1 >> option", (o) => o.map((x) => x.textContent));
  ok(JSON.stringify(destinos) === JSON.stringify(["Barranquilla", "Apartadó", "Medellín"]),
     `los destinos son [${destinos}]: Barranquilla primero y sin repetirse aunque el maestro también la traiga como origen`);

  await t1();
  /* LA PLACA SE ESCRIBE EN MAYÚSCULA. */
  await pg.fill(".nv-placa input", "abc123");
  ok(await pg.inputValue(".nv-placa input") === "ABC123", "la placa no se pasa a mayúsculas");
  /* LA PLACA: 3 LETRAS Y 3 NÚMEROS, NO MÁS. */
  await pg.fill(".nv-placa input", "ab-1 2");
  ok(await pg.inputValue(".nv-placa input") === "AB12", "la placa deja pasar guiones y espacios");
  await pg.fill(".nv-placa input", "abcd123456");
  ok(await pg.inputValue(".nv-placa input") === "ABCD12", `la placa deja escribir más de 6: «${await pg.inputValue(".nv-placa input")}»`);
  ok(await pg.$eval(".nv-placa small", (e) => e.classList.contains("mal")), "una placa mala no se marca");
  ok(/3 letras y 3 números/.test(await pg.$eval(".vj-caja.nuevo", (e) => e.textContent)), "no dice la regla de la placa");
  await pg.fill(".nv-placa input", "abc123");

  await pg.selectOption(".nv-campos select >> nth=0", "APA");

  /* LA BÚSQUEDA DE MATERIAL, sin tildes y sin mayúsculas. */
  const lista = async (q) => { await pg.fill(".nv-material input", q);
    return pg.$$eval(".nv-lista li", (s) => s.map((e) => e.textContent.trim())); };
  ok((await lista("COSTEÑA")).length === 1 && /Costeña 175/.test((await lista("COSTEÑA"))[0]), "«COSTEÑA» no encuentra la Costeña 175");
  ok((await lista("costenita")).length === 1 && /Ámbar/.test((await lista("costenita"))[0]), "«costenita» (sin ñ) no encuentra la Costeñita Ámbar");
  ok((await lista("3500")).length === 3, "buscar por código no trae los 3 materiales");
  ok(/Ningún material del maestro coincide con «zzz»/.test((await lista("zzz"))[0] ?? ""), "una búsqueda sin resultados no lo dice");

  /* UN MATERIAL SIN FACTORES: las cifras dicen «—», no un cero que parezca un dato. */
  await pg.fill(".nv-material input", "azul");
  await pg.click(".nv-lista button");
  await pg.fill(".nv-campos label:has(span:text('Estibas')) input", "9");
  const cif = async () => pg.$$eval(".nv-cifras div", (s) => Object.fromEntries(s.map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent])));
  let c = await cif();
  ok(c.Cajas === "—" && c.Unidades === "—" && c.HL === "—", `material sin factores: ${JSON.stringify(c)}`);
  ok(c.Sider === "0,25", `9 estibas / 36 = 0,25 y dice «${c.Sider}»`);
  await pg.click('.nv-escogido button:has-text("Cambiar")');

  /* EL MATERIAL DE VERDAD: las cifras se calculan solas con las fórmulas de Certificar. */
  await pg.fill(".nv-material input", "175");
  await pg.click(".nv-lista button");
  ok(/Botella Costeña 175 cc/.test(await pg.$eval(".nv-escogido", (e) => e.textContent)), "no muestra el material escogido");
  await pg.fill(".nv-campos label:has(span:text('Estibas')) input", "10,5");
  c = await cif();
  const f0 = await pg.evaluate(() => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(72 * 10.5));
  const fu = await pg.evaluate(() => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(24 * 72 * 10.5));
  const fh = await pg.evaluate(() => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(0.00175 * 24 * 72 * 10.5));
  const fs = await pg.evaluate(() => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(10.5 / 36));
  ok(c.Cajas === f0 && c.Unidades === fu && c.HL === fh && c.Sider === fs,
     `10,5 estibas de la 175: salió ${JSON.stringify(c)} y debía ser Sider ${fs}, cajas ${f0}, unidades ${fu}, HL ${fh}`);
  /* EL DOCUMENTO ES OBLIGATORIO: con todo lo demás lleno, sin él el botón sigue apagado y lo dice. */
  ok(await crear.isDisabled(), "con todo lleno pero SIN documento el botón se enciende (el documento es obligatorio)");
  ok(/Falta el documento \(número de factura\)/.test(await pg.$eval(".vj-caja.nuevo", (e) => e.textContent)),
     "sin documento no dice que falta el documento");
  await pg.fill(".nv-doc input", "0071234");
  ok(await crear.isEnabled(), "con todo lleno el botón no se enciende");

  /* ORIGEN = DESTINO, con TODO lo demás lleno: lo único que puede apagar el botón es eso. */
  await pg.selectOption(".nv-campos select >> nth=0", "BAQ");
  ok(await pg.$$eval(".vj-caja.nuevo [role=alert]", (s) => s.some((e) => /mismo CD/.test(e.textContent))),
     "origen y destino iguales no se avisan");
  ok(await crear.isDisabled(), "deja crear con origen y destino iguales (con todo lo demás lleno)");
  await pg.selectOption(".nv-campos select >> nth=0", "APA");
  ok(await pg.$$eval(".vj-caja.nuevo [role=alert]", (s) => s.length) === 0, "el aviso de origen = destino no se quita al corregir");
  ok(await crear.isEnabled(), "al corregir el destino el botón no se vuelve a encender");

  /* UNA PLACA QUE NO ES 3 LETRAS + 3 NÚMEROS APAGA EL BOTÓN, con todo lo demás lleno. */
  for (const mala of ["AB1234", "ABCD12", "123ABC", "ABC12", "A1B2C3", ""]) {
    await pg.fill(".nv-placa input", mala);
    ok(await crear.isDisabled(), `con la placa «${mala}» deja crear`);
    ok(/la placa \(3 letras y 3 números\)/.test(await pg.$eval(".vj-caja.nuevo", (e) => e.textContent)),
       `con la placa «${mala}» no dice que falta la placa por su regla`);
  }
  await pg.fill(".nv-placa input", "abc123");
  ok(await crear.isEnabled(), "con la placa buena el botón no se enciende");

  /* ESTIBAS MALAS APAGAN EL BOTÓN. */
  for (const malo of ["0", "-3", "abc", ""]) {
    await pg.fill(".nv-campos label:has(span:text('Estibas')) input", malo);
    ok(await crear.isDisabled(), `con «${malo}» estibas deja crear`);
  }
  await pg.fill(".nv-campos label:has(span:text('Estibas')) input", "10,5");

  /* CREAR: EXACTAMENTE LOS PARÁMETROS QUE LA FUNCIÓN ESPERA. */
  /* EL DOCUMENTO: SOLO NÚMEROS, MÁXIMO 10. */
  await pg.fill(".nv-doc input", "F-77 ab");
  ok(await pg.inputValue(".nv-doc input") === "77", `el documento deja pasar letras y guiones: «${await pg.inputValue(".nv-doc input")}»`);
  await pg.fill(".nv-doc input", "12345678901234");
  ok(await pg.inputValue(".nv-doc input") === "1234567890", `el documento deja escribir más de 10: «${await pg.inputValue(".nv-doc input")}»`);
  ok(/hasta 10 dígitos/.test(await pg.$eval(".nv-doc", (e) => e.textContent)), "el documento no dice su regla");
  ok(await pg.$eval(".nv-doc input", (e) => e.maxLength) === 10, "el campo del documento no limita a 10");
  /* SIN LOTE NI NOTA: el formulario se queda con lo justo. */
  ok(await pg.$$eval(".nv-mas", (s) => s.length) === 0, "el formulario todavía tiene «Más datos»");
  ok(!/\b(Lote|Nota)\b/.test(await pg.$eval(".vj-caja.nuevo", (e) => e.textContent)), "el formulario todavía pide lote o nota");
  await crear.click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.n === "sider_viaje_interno_crear", `llamó «${l.n}»`);
  ok(JSON.stringify(l.a) === JSON.stringify({ p_placa: "ABC123", p_planta: "APA", p_destino: "Barranquilla", p_sku: "3500887",
                                              p_estibas: 10.5, p_factura: "1234567890", p_canal: "t1", p_socio: null, p_lote: null, p_nota: null }),
     `los parámetros son ${JSON.stringify(l.a)}`);
  await pg.waitForFunction(() => window.__refresh > 0);
  ok(await pg.$$eval("#nv-titulo", (s) => s.length) === 0, "el formulario no se cierra al crear");
  ok(/ABC123 creado: ya está en Revisión AI – normal/.test(await txt()), "no avisa que el Vh Interno quedó en Revisión AI");
}
/* =====================================================================
   5b · «¿DE QUIÉN ES?»: SOCIO (SIN DOCUMENTO, CON SOCIO) O T1 (CON FACTURA)
   ===================================================================== */
{
  const origen = '.nv-campos label:has(> span:text("CD origen")) select';
  const llena = async () => {
    await pg.fill(".nv-placa input", "abc123");
    await pg.selectOption(origen, "APA");
    await pg.fill(".nv-material input", "175"); await pg.click(".nv-lista button");
    await pg.fill(".nv-campos label:has(span:text('Estibas')) input", "10");
  };
  await monta("m=sorting&c=normal");
  await pg.click(".tr-mas"); await pg.waitForSelector("#nv-titulo");
  const crear = pg.locator('.vj-caja.nuevo .btn:has-text("Crear Vh Interno")');
  /* SIN ESCOGER NO SE PIDE NI SOCIO NI DOCUMENTO: primero se dice de quién es. */
  ok(await pg.$$eval(".nv-canal-bot button", (b) => b.length) === 2 && await pg.$$eval(".nv-canal-bot button.on", (b) => b.length) === 0,
     "no hay dos botones sin escoger para «¿De quién es?»");
  ok(await pg.$$eval(".nv-doc, .nv-socio", (x) => x.length) === 0, "sin escoger ya pide documento o socio");
  await llena();
  ok(await crear.isDisabled() && /si es de un socio o de T1/.test(await pg.$eval(".vj-falta", (e) => e.textContent)),
     "con todo lleno pero sin decir de quién es, el botón se enciende o no lo dice");

  /* SOCIO: NO HAY DOCUMENTO; SE ESCOGE EL SOCIO, Y ES OBLIGATORIO. */
  await socioBtn();
  ok(await pg.$eval('.nv-canal-bot button:has-text("Socio")', (e) => e.getAttribute("aria-pressed")) === "true", "el botón Socio no queda marcado");
  ok(await pg.$$eval(".nv-doc", (x) => x.length) === 0, "un camión de socio pide documento");
  const socios = await pg.$$eval(".nv-socio option", (o) => o.map((x) => x.textContent));
  ok(JSON.stringify(socios) === JSON.stringify(["— escoge el socio —", "Logisinú", "Distribuciones del Sur"]), `los socios son ${JSON.stringify(socios)}`);
  ok(await crear.isDisabled() && /el socio/.test(await pg.$eval(".vj-falta", (e) => e.textContent))
     && !/documento/.test(await pg.$eval(".vj-falta", (e) => e.textContent)),
     "sin socio el botón está encendido, o no dice que falta el socio, o pide documento");
  await pg.selectOption(".nv-socio select", "sur");
  ok(await crear.isEnabled(), "con el socio escogido y sin documento el botón no se enciende");
  await crear.click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  let l = (await rpcs())[0];
  ok(l.n === "sider_viaje_interno_crear" && l.a.p_canal === "socios" && l.a.p_socio === "sur" && l.a.p_factura === null,
     `el camión de un socio mandó ${JSON.stringify(l.a)}`);

  /* T1: DOCUMENTO OBLIGATORIO, SIN SOCIO, Y LA FACTURA QUE QUEDÓ ESCRITA NO SE ARRASTRA A UN SOCIO. */
  await monta("m=sorting&c=normal");
  await pg.click(".tr-mas"); await pg.waitForSelector("#nv-titulo");
  await llena();
  await t1();
  ok(await pg.$$eval(".nv-socio", (x) => x.length) === 0 && await pg.$$eval(".nv-doc", (x) => x.length) === 1, "T1 no pide el documento en lugar del socio");
  ok(await crear.isDisabled() && /el documento/.test(await pg.$eval(".vj-falta", (e) => e.textContent)), "T1 sin documento no dice que falta");
  await pg.fill(".nv-doc input", "9988");
  ok(await crear.isEnabled(), "T1 con documento no enciende el botón");
  await socioBtn();                                   /* se arrepiente: era de un socio */
  await pg.selectOption(".nv-socio select", "logi");
  await t1();                                         /* y otra vez T1: el socio escogido no debe viajar */
  await crear.click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  l = (await rpcs())[0];
  ok(l.a.p_canal === "t1" && l.a.p_socio === null && l.a.p_factura === "9988", `T1 mandó ${JSON.stringify(l.a)}`);

  /* SOCIO CON DOS MATERIALES: la misma regla en la función de varios. */
  await monta("m=sorting&c=normal");
  await pg.click(".tr-mas"); await pg.waitForSelector("#nv-titulo");
  await llena();
  await t1(); await pg.fill(".nv-doc input", "777");   /* escribió una factura… */
  await socioBtn();                                     /* …y resultó ser de un socio */
  await pg.selectOption(".nv-socio select", "logi");
  await pg.click(".nv-mas-mat");
  await pg.fill(".nv-linea >> nth=1 >> .nv-material input", "ámbar"); await pg.click(".nv-linea >> nth=1 >> .nv-lista button");
  await pg.fill(".nv-linea >> nth=1 >> label:has(span:text('Estibas')) input", "4");
  await crear.click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  l = (await rpcs())[0];
  ok(l.n === "sider_viaje_interno_crear_varios" && l.a.p_canal === "socios" && l.a.p_socio === "logi" && l.a.p_factura === null,
     `varios de un socio mandó ${JSON.stringify(l.a)}`);
}
/* UN CAMIÓN CON VARIOS MATERIALES DE LA MISMA FACTURA: el «+» agrega otra línea. */
{
  await monta("m=sorting&c=normal");
  await pg.click(".tr-mas"); await pg.waitForSelector("#nv-titulo");
  const crear = pg.locator('.vj-caja.nuevo .btn:has-text("Crear Vh Interno")');
  ok(await pg.$$eval(".nv-linea", (x) => x.length) === 1 && await pg.$$eval(".nv-linea-cab", (x) => x.length) === 0,
     "con un solo material aparece el encabezado «Material 1 de 1» o falta la línea");
  ok(await pg.$$eval(".nv-mas-mat", (x) => x.length) === 1, "no aparece el «+ Agregar otro material»");
  await pg.fill(".nv-placa input", "abc123"); await pg.selectOption(".nv-campos select >> nth=0", "APA");
  await t1(); await pg.fill(".nv-doc input", "555");
  await pg.fill(".nv-linea >> nth=0 >> .nv-material input", "175"); await pg.click(".nv-linea >> nth=0 >> .nv-lista button");
  await pg.fill(".nv-linea >> nth=0 >> label:has(span:text('Estibas')) input", "10");
  await pg.click(".nv-mas-mat");
  ok(await pg.$$eval(".nv-linea", (x) => x.length) === 2, "el «+» no agregó otra línea");
  ok(/Material 1 de 2/.test(await txt()) && /Material 2 de 2/.test(await txt()), "no numera las líneas");
  ok(await crear.isDisabled(), "con la segunda línea vacía el botón está encendido");
  ok(/material 2/.test(await pg.$eval(".vj-falta", (e) => e.textContent)) && /estibas del material 2/.test(await pg.$eval(".vj-falta", (e) => e.textContent)),
     "no dice que falta el material 2 y sus estibas");
  /* el material ya escogido no se ofrece otra vez en la segunda línea */
  await pg.fill(".nv-linea >> nth=1 >> .nv-material input", "3500");
  const of = await pg.$$eval(".nv-linea >> nth=1 >> .nv-lista li", (x) => x.map((e) => e.textContent));
  ok(of.length === 2 && !of.some((t) => /Costeña 175/.test(t)), `la segunda línea vuelve a ofrecer el material de la primera: ${JSON.stringify(of)}`);
  await pg.fill(".nv-linea >> nth=1 >> .nv-material input", "ámbar");
  await pg.click(".nv-linea >> nth=1 >> .nv-lista button");
  await pg.fill(".nv-linea >> nth=1 >> label:has(span:text('Estibas')) input", "4");
  ok(!(await crear.isDisabled()), "con las dos líneas llenas el botón sigue apagado");
  const tot = await pg.$$eval(".nv-cifras div", (x) => Object.fromEntries(x.map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent])));
  const fs = await pg.evaluate(() => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(14 / 36));
  ok(tot.Sider === fs, `el total de siders no suma las dos líneas: ${JSON.stringify(tot)} (debía ${fs})`);
  ok(/Total de los 2 materiales/.test(await txt()), "no dice que las cifras son el total");
  /* UN MATERIAL SIN FACTORES: se dice cuál y qué falta, y el total suma lo que sí se sabe. */
  await pg.click(".nv-linea >> nth=1 >> button:has-text('Cambiar')");
  await pg.fill(".nv-linea >> nth=1 >> .nv-material input", "azul"); await pg.click(".nv-linea >> nth=1 >> .nv-lista button");
  ok(/Sin factor de estiba en el maestro/.test(await pg.$eval(".nv-linea >> nth=1", (e) => e.textContent)), "no dice qué factor falta");
  ok(await pg.$eval(".nv-linea >> nth=1 >> .nv-lin-cif a", (e) => e.getAttribute("href")) === "/sider/maestro", "«completar» no lleva al Maestro");
  ok(await pg.$eval(".nv-linea >> nth=1", (e) => e.classList.contains("pend")), "la línea sin factores no queda marcada");
  const par = await pg.$$eval(".nv-cifras div", (x) => Object.fromEntries(x.map((d) => [d.querySelector("dt").textContent, d.textContent])));
  ok(/falta mat\. 2/.test(par.Cajas) && /falta mat\. 2/.test(par.Unidades), `el total parcial no avisa qué material falta: ${JSON.stringify(par)}`);
  ok(!/falta mat/.test(par.Sider), "los siders sí se suman de los dos y no debían avisar");
  ok(!(await crear.isDisabled()), "un material sin factores no debe impedir crear el camión");
  await pg.click(".nv-linea >> nth=1 >> button:has-text('Cambiar')");
  await pg.fill(".nv-linea >> nth=1 >> .nv-material input", "ámbar"); await pg.click(".nv-linea >> nth=1 >> .nv-lista button");
  await crear.click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  const l = (await rpcs())[0];
  ok(l.n === "sider_viaje_interno_crear_varios", `con dos materiales llamó «${l.n}»`);
  ok(JSON.stringify(l.a) === JSON.stringify({ p_placa: "ABC123", p_planta: "APA", p_destino: "Barranquilla", p_factura: "555",
       p_lineas: [{ sku: "3500887", estibas: 10 }, { sku: "3500901", estibas: 4 }], p_canal: "t1", p_socio: null }), `los parámetros son ${JSON.stringify(l.a)}`);
}
{
  /* QUITAR una línea deja la de siempre — y con una sola línea se llama a la función de siempre. */
  await monta("m=sorting&c=normal");
  await pg.click(".tr-mas"); await pg.waitForSelector("#nv-titulo");
  await pg.fill(".nv-placa input", "abc123"); await pg.selectOption(".nv-campos select >> nth=0", "APA"); await t1(); await pg.fill(".nv-doc input", "555");
  await pg.fill(".nv-linea >> nth=0 >> .nv-material input", "175"); await pg.click(".nv-linea >> nth=0 >> .nv-lista button");
  await pg.fill(".nv-linea >> nth=0 >> label:has(span:text('Estibas')) input", "10");
  await pg.click(".nv-mas-mat"); await pg.click(".nv-mas-mat");
  ok(await pg.$$eval(".nv-linea", (x) => x.length) === 3, "no agregó la tercera línea");
  await pg.click('.nv-linea >> nth=2 >> button:has-text("Quitar")');
  await pg.click('.nv-linea >> nth=1 >> button:has-text("Quitar")');
  ok(await pg.$$eval(".nv-linea", (x) => x.length) === 1 && await pg.$$eval(".nv-linea-cab", (x) => x.length) === 0, "al quedar una línea no vuelve a la vista simple");
  await pg.locator('.vj-caja.nuevo .btn:has-text("Crear Vh Interno")').click();
  await pg.waitForFunction(() => window.__rpc.length > 0);
  ok((await rpcs())[0].n === "sider_viaje_interno_crear", "con una sola línea debía llamar a la función de siempre");
}
/* SI LA BASE RECHAZA, NO SE CIERRA NI FINGE. */
{
  await monta("m=sorting&c=normal");
  await pg.click(".tr-mas");
  await pg.fill(".nv-placa input", "ZZZ999");
  await pg.selectOption(".nv-campos select >> nth=0", "APA");
  await pg.fill(".nv-material input", "175"); await pg.click(".nv-lista button");
  await pg.fill(".nv-campos label:has(span:text('Estibas')) input", "5");
  await t1(); await pg.fill(".nv-doc input", "123");
  await pg.selectOption(".nv-campos select >> nth=1", "Medellín");
  await pg.evaluate(() => { window.__rpcFalla = "Ese material está apagado en el maestro" });
  await pg.click('.vj-caja.nuevo .btn:has-text("Crear Vh Interno")');
  await pg.waitForSelector(".vj-mal");
  ok(/material/.test(await pg.$eval(".vj-mal", (e) => e.textContent)), "el rechazo de la base no se le explica a quien crea");
  ok(await pg.$$eval("#nv-titulo", (s) => s.length) === 1, "cerró el formulario aunque la base lo rechazó");
  ok(await pg.evaluate(() => window.__refresh) === 0, "refrescó como si hubiera creado");
  /* REINTENTAR CON EL MISMO FORMULARIO: el destino escogido (no el de por defecto) es el que viaja. */
  await pg.evaluate(() => { window.__rpcFalla = null; window.__rpc.length = 0 });
  await pg.click('.vj-caja.nuevo .btn:has-text("Crear Vh Interno")');
  await pg.waitForFunction(() => window.__rpc.length > 0);
  ok((await rpcs())[0].a.p_destino === "Medellín", `el destino escogido no viaja: ${(await rpcs())[0].a.p_destino}`);
  /* CANCELAR NO LLAMA A NADA. */
  await monta("m=sorting&c=normal");
  await pg.click(".tr-mas");
  await pg.evaluate(() => { window.__rpc.length = 0 });
  await pg.click('.vj-caja.nuevo .btn:has-text("Cancelar")');
  ok(await pg.$$eval("#nv-titulo", (s) => s.length) === 0, "cancelar no cierra");
  ok((await rpcs()).length === 0, "cancelar llamó a la base");
}

/* =====================================================================
   5b · FUENTE PRINCIPAL: LA MARCA DE LA REVISIÓN NORMAL Y EL INTERNO
   ===================================================================== */
{
  const u = (a, b) => pg.evaluate(([x, y]) => window.__unir(x, y), [a, b]);
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  let r = await u(["a", "b"], ["b"]);
  ok(eq(r, { a: "pendiente", b: "hecho" }), `pidió a y b, hizo b: salió ${JSON.stringify(r)}`);
  r = await u(["a"], ["zzz"]);
  ok(eq(r, { a: "pendiente" }), `una revisión «hecha» de un camión que NUNCA la pidió salió ${JSON.stringify(r)}`);
  r = await u(["a"], [null, undefined]);
  ok(eq(r, { a: "pendiente" }), `una revisión sin viaje (importada) salió ${JSON.stringify(r)}`);
  ok(eq(await u([], []), {}), "sin nadie salió algo");
  r = await u(["a"], ["a", "a"]);
  ok(eq(r, { a: "hecho" }), `hecha dos veces salió ${JSON.stringify(r)}`);
}
await monta("m=viajes&c=marcas");
{
  const filas = await pg.$$eval("tbody tr", (s) => s.map((tr) => ({
    placa: tr.querySelector(".placa")?.textContent,
    marcas: [...tr.querySelectorAll(".vj-sorting .sello")].map((e) => e.textContent.trim()),
    hecho: !!tr.querySelector(".vj-sorting .sello.hecho"),
    fotos: tr.textContent.replace(/\s+/g, " "),
  })));
  const m = Object.fromEntries(filas.map((x) => [x.placa, x]));
  ok(JSON.stringify(m.FUE001.marcas) === '["REVISIÓN NORMAL PENDIENTE"]' && !m.FUE001.hecho, `FUE001: ${JSON.stringify(m.FUE001.marcas)}`);
  ok(JSON.stringify(m.FUE002.marcas) === '["REVISIÓN NORMAL HECHA"]' && m.FUE002.hecho, `FUE002: ${JSON.stringify(m.FUE002.marcas)}`);
  ok(m.FUE003.marcas.length === 0, `el que no la pidió lleva marca: ${JSON.stringify(m.FUE003.marcas)}`);
  ok(m.FUE001.marcas.every((x) => !/SORTING/i.test(x)), "quedó la palabra Sorting");
  /* EL INTERNO: su marca, su «sin salida», y ningún reclamo de fotos. */
  ok(m.FUE005.marcas.includes("VH INTERNO") && m.FUE005.marcas.includes("REVISIÓN NORMAL PENDIENTE"),
     `FUE005 (interno): ${JSON.stringify(m.FUE005.marcas)}`);
  ok(/Vh Interno · sin salida/.test(m.FUE005.fotos) && /Vh Interno · sin certificar/.test(m.FUE005.fotos) && !/0\/3 fotos/.test(m.FUE005.fotos),
     `el interno dice «0/3 fotos» o no dice que no tuvo salida: «${m.FUE005.fotos.slice(0, 200)}»`);
  ok(/3\/3 fotos/.test(m.FUE001.fotos), "un camión normal ya no dice sus fotos de salida");
  /* EL ESTADO NO SE PISA. */
  const est = await pg.$$eval("tbody tr", (s) => s.map((tr) => [...tr.querySelectorAll(".sello")].map((e) => e.textContent.trim())));
  ok(est[0].includes("recibido") && est[0].includes("REVISIÓN NORMAL PENDIENTE"), `el estado y la revisión no conviven: ${est[0]}`);
  ok(est[3].includes("en tránsito") && est[3].includes("REVISIÓN NORMAL PENDIENTE"), `en tránsito con revisión pedida: ${est[3]}`);
}
await monta("m=viajes&c=sinmarcas");
ok(await pg.$$eval(".vj-sorting", (s) => s.length) === 0, "sin marcas (o sin correr la migración) aparece un rótulo igual");

/* =====================================================================
   6 · EL INFORME AI: LA CLASE VA ESCRITA Y SE PUEDE FILTRAR
   ===================================================================== */
await monta("m=informe&c=normal");
{
  const t = await txt();
  const ths = await pg.$$eval(".ia-tabla th", (s) => s.map((e) => e.textContent.trim()));
  ok(ths.includes("Revisión"), `la tabla no tiene la columna «Revisión»: [${ths.slice(0, 6)}]`);
  const selos = await pg.$$eval(".ia-tabla tbody tr", (s) => Object.fromEntries(s.map((tr) =>
    [tr.querySelector("b").textContent, tr.querySelector("td:nth-child(3) .ia-sello")?.textContent.trim()])));
  ok(selos.INF001 === "Certificada" && selos.INF002 === "Normal" && selos.INF003 === "Normal" && Object.keys(selos).length === 3,
     `las clases de las filas son ${JSON.stringify(selos)}`);
  const opts = await pg.$$eval('.ia-filtros label:has(span:text("Revisión")) option', (o) => o.map((x) => x.textContent));
  ok(JSON.stringify(opts) === JSON.stringify(["Todas", "Certificada", "Normal"]), `el filtro «Revisión» ofrece [${opts}]`);
  ok(/1 certificada y 2 normales/.test(t), `la nota no reparte las clases: «${t.slice(-160)}»`);
  await pg.selectOption('.ia-filtros label:has(span:text("Revisión")) select', "sorting");
  ok(/tipo=sorting/.test(await pg.evaluate(() => window.__push ?? "")), `el filtro no viaja en la dirección: ${await pg.evaluate(() => window.__push)}`);
}
await monta("m=informe&c=filtrado");
ok(await pg.inputValue('.ia-filtros label:has(span:text("Revisión")) select') === "sorting", "el filtro escogido no se ve escogido");
ok(!/certificada y/.test(await txt()), "filtrado a una clase todavía cuenta las dos");
await monta("m=informe&c=sintipo");
{
  const selos = await pg.$$eval(".ia-tabla tbody tr td:nth-child(3) .ia-sello", (s) => s.map((e) => e.textContent.trim()));
  ok(selos.length === 2 && selos.every((x) => x === "Certificada"), `sin columna tipo (migración sin correr) las filas salen [${selos}]`);
  ok(!/normal/i.test(await pg.$eval(".ia-mas", (e) => e.textContent)), "sin tipo dice que hay revisiones normales");
}

/* =====================================================================
   7 · NADA SE SALE NI SE MONTA, en los cuatro anchos
   ===================================================================== */
for (const ancho of [360, 390, 722, 820, 1440]) {
  for (const q of ["m=sorting&c=normal", "m=sorting&c=largos", "m=transito&c=largos", "m=transito&c=normal",
                   "m=form&c=sorting", "m=informe&c=normal", "m=viajes&c=marcas"]) {
    await monta(q, ancho);
    const sobra = await pg.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    /* El informe y Fuente principal llevan tablas que se deslizan dentro de su tarjeta: la PÁGINA no. */
    ok(sobra <= 1, `${q} en ${ancho} px se sale ${sobra} px de ancho`);

    const fuera = await pg.$$eval("article.tr-vh", (s) => s.flatMap((a) => {
      const r = a.getBoundingClientRect();
      return [...a.querySelectorAll("button, .sello, dl, .tr-ruta, .tr-mat")].map((e) => {
        const b = e.getBoundingClientRect();
        return b.right > r.right + 1 || b.left < r.left - 1
          ? `${e.className || e.tagName} llega a ${Math.round(b.right)} y su tarjeta termina en ${Math.round(r.right)}` : null;
      }).filter(Boolean);
    }));
    ok(fuera.length === 0, `${q} en ${ancho} px: ${fuera[0]}`);

    /* LOS DEDOS: ningún botón NUESTRO por debajo de 38 px. */
    const chicos = await pg.$$eval(".so-btn, .btn.ai, .tr-mas, .tr-vh footer .btn, .tr-so-btn", (s) =>
      s.map((b) => [b.textContent.trim(), b.getBoundingClientRect().height])
       .filter(([, h]) => h > 0 && h < 38));
    ok(chicos.length === 0, `${q} en ${ancho} px: el botón «${chicos[0]?.[0]}» mide ${chicos[0]?.[1]} px`);

    /* LA CINTA DEL FORMULARIO: cada celda dentro de la cinta, ninguna montada. */
    const celdas = await pg.$$eval(".ai-cinta > *", (s) => {
      const c = s[0]?.parentElement.getBoundingClientRect();
      return s.map((e) => { const b = e.getBoundingClientRect();
        return { t: e.textContent.trim().slice(0, 16), x0: b.left, x1: b.right, y0: b.top, y1: b.bottom,
                 dentro: !c || (b.right <= c.right + 1 && b.left >= c.left - 1) } });
    });
    for (const h of celdas) ok(h.dentro, `${q} en ${ancho} px: la celda «${h.t}» de la cinta se sale`);
    for (let a = 0; a < celdas.length; a++) for (let b = a + 1; b < celdas.length; b++) {
      const A = celdas[a], B = celdas[b];
      ok(!(A.x0 < B.x1 - 1.5 && B.x0 < A.x1 - 1.5 && A.y0 < B.y1 - 1.5 && B.y0 < A.y1 - 1.5),
         `${q} en ${ancho} px: «${A.t}» y «${B.t}» se montan en la cinta`);
    }

    /* LOS RENGLONES DE «HECHAS» NO SE MONTAN (seis columnas en 360 px). */
    const filas = await pg.$$eval(".so-hechos li", (s) => s.map((li) => {
      const r = li.getBoundingClientRect();
      return [...li.children].map((c) => { const b = c.getBoundingClientRect();
        return { t: c.textContent.trim().slice(0, 14), x0: b.left, x1: b.right, y0: b.top, y1: b.bottom,
                 dentro: b.right <= r.right + 1 && b.left >= r.left - 1 } });
    }));
    for (const [i, hijos] of filas.entries()) {
      for (const h of hijos) ok(h.dentro, `${q} en ${ancho} px: «${h.t}» se sale del renglón ${i + 1} de Hechas`);
      for (let a = 0; a < hijos.length; a++) for (let b = a + 1; b < hijos.length; b++) {
        const A = hijos[a], B = hijos[b];
        ok(!(A.x0 < B.x1 - 1.5 && B.x0 < A.x1 - 1.5 && A.y0 < B.y1 - 1.5 && B.y0 < A.y1 - 1.5),
           `${q} en ${ancho} px: «${A.t}» y «${B.t}» se montan en Hechas`);
      }
    }
  }

  /* EL BOTÓN FLOTANTE: dentro de la pantalla, y sin tapar la barra de «viajes escogidos». */
  await monta("m=sorting&c=normal", ancho);
  {
    const r0 = await pg.$eval(".tr-mas", (e) => { const b = e.getBoundingClientRect();
      return { x0: b.left, x1: b.right, y0: b.top, y1: b.bottom, W: innerWidth, H: innerHeight, pos: getComputedStyle(e).position } });
    ok(r0.pos === "fixed" && r0.x0 >= 0 && r0.x1 <= r0.W && r0.y0 >= 0 && r0.y1 <= r0.H,
       `el «+» en ${ancho} px no queda dentro de la pantalla: ${JSON.stringify(r0)}`);
    ok(r0.x1 > r0.W * 0.6 && r0.y1 > r0.H * 0.6, `el «+» en ${ancho} px no está abajo a la derecha`);
    ok(Math.round(r0.x1 - r0.x0) >= 56 && Math.abs((r0.x1 - r0.x0) - (r0.y1 - r0.y0)) < 2,
       `el «+» en ${ancho} px no es un círculo de al menos 56 px (${r0.x1 - r0.x0} × ${r0.y1 - r0.y0})`);
    /* NO TAPA EL ÚLTIMO BOTÓN: al final de la página, con todo el scroll, el
       botón de la última tarjeta y el «+» no pueden quedar uno sobre otro. */
    await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const r1 = await pg.evaluate(() => { const f = document.querySelector(".tr-mas").getBoundingClientRect();
      return [...document.querySelectorAll(".tr-vh .btn, .so-hechos button, .so-hechos a")].map((e) => { const b = e.getBoundingClientRect();
        return b.width > 0 && f.left < b.right && b.left < f.right && f.top < b.bottom && b.top < f.bottom
          ? e.textContent.trim().slice(0, 20) : null }).filter(Boolean) });
    ok(r1.length === 0, `el «+» en ${ancho} px tapa «${r1[0]}» al final de la página`);
  }

  /* EL «+» ABIERTO: la caja entera dentro de la pantalla, en todos los anchos, y con todo lleno. */
  await monta("m=sorting&c=normal", ancho);
  await pg.click(".tr-mas");
  await pg.waitForSelector(".vj-caja.nuevo");
  await pg.fill(".nv-placa input", "ABC123");
  await pg.selectOption(".nv-campos select >> nth=0", "APA");
  await pg.fill(".nv-material input", "175"); await pg.click(".nv-lista button");
  await pg.fill(".nv-campos label:has(span:text('Estibas')) input", "10,5");
  await t1(); await pg.fill(".nv-doc input", "1234567890");
  const caja = await pg.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const c = document.querySelector(".vj-caja.nuevo").getBoundingClientRect();
    const fuera = [...document.querySelectorAll(".vj-caja.nuevo *")].filter((e) => {
      const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > c.right + 1 || b.left < c.left - 1) })
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}`);
    const chicos = [...document.querySelectorAll(".vj-caja.nuevo input, .vj-caja.nuevo select, .vj-caja.nuevo .btn, .nv-lista button")]
      .map((e) => [e.tagName.toLowerCase() + "." + String(e.className).slice(0, 20), e.getBoundingClientRect().height])
      .filter(([, h]) => h > 0 && h < 40);
    return { der: c.right, W, izq: c.left, sobra: document.documentElement.scrollWidth - W, fuera, chicos };
  });
  ok(caja.sobra <= 1, `el «+» en ${ancho} px se sale ${caja.sobra} px`);
  ok(caja.izq >= -1 && caja.der <= caja.W + 1, `la caja del «+» en ${ancho} px queda entre ${Math.round(caja.izq)} y ${Math.round(caja.der)} de ${caja.W}`);
  ok(caja.fuera.length === 0, `el «+» en ${ancho} px: ${caja.fuera[0]} se sale de la caja`);
  ok(caja.chicos.length === 0, `el «+» en ${ancho} px: ${caja.chicos[0]?.[0]} mide ${caja.chicos[0]?.[1]} px (mínimo 40 para el dedo)`);
}

/* =====================================================================
   8 · SE LEE Y SE DISTINGUE — EN LOS SIETE TEMAS REALES
   ---------------------------------------------------------------------
   Los nombres salen de globals.css: oficial (sin atributo), tinta,
   pizarra, ámbar, negro, gris, halo. Los colores se resuelven en el
   navegador (un canvas de 1×1 lee cualquier sintaxis, incluido
   color-mix, que devuelve `color(srgb …)` y no `rgb()`), y un fondo
   transparente se compone sobre el de sus padres.
   ===================================================================== */
const MIDE = () => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] };
  const sobre = (f, b) => f[3] >= 1 ? f : [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat([1]);
  const fondo = (e) => { let acum = [255, 255, 255, 1]; const pila = [];
    for (let n = e; n; n = n.parentElement) pila.push(rgba(getComputedStyle(n).backgroundColor));
    for (const c of pila.reverse()) acum = sobre(c, acum); return acum };
  const lum = ([r, g, b]) => { const f = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2] };
  const razon = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  return (sel) => { const e = document.querySelector(sel); if (!e) return null;
    const f = fondo(e); const t = sobre(rgba(getComputedStyle(e).color), f); return razon(t, f) };
};
const PARES = {
  "m=sorting&c=normal": [".tr-mas", ".tr-vh.ai .sello.ai", ".tr-vh.so .sello.sorting", ".tr-vh .sello.interno",
                         ".so-bloque-cab h2", ".so-bloque-n span", ".tr-vh.ai .btn.ai", ".tr-vh.so .btn.so-btn", ".so-hechos li.so .so-h-tipo .sello"],
  "m=transito&c=normal": [".tr-vh .sello.ai", ".tr-vh .sello.sorting", ".tr-vh .sello.interno"],
  "m=viajes&c=marcas": [".vj-sorting .sello.interno", ".vj-sorting .sello:not(.interno)"],
  "m=informe&c=normal": [".ia-tabla td:nth-child(3) .ia-sello.propio", ".ia-tabla td:nth-child(3) .ia-sello.normal"],
};
const TEMAS = ["", "tinta", "pizarra", "ambar", "negro", "gris", "halo"];
const tabla = [];
for (const t of TEMAS) {
  for (const [q, sels] of Object.entries(PARES)) {
    await monta(q, 1440, t);
    const r = await pg.evaluate(([src, sl]) => { const mide = eval("(" + src + ")")(); return sl.map((s) => [s, mide(s)]) },
      [MIDE.toString(), sels]);
    for (const [s, v] of r) {
      ok(v !== null, `[${t || "oficial"}] ${q}: no existe ${s}`);
      if (v !== null) { tabla.push([t || "oficial", s, v]); ok(v >= 4.5, `[${t || "oficial"}] ${s} se lee a ${v.toFixed(2)}:1 y tiene que llegar a 4,5`) }
    }
  }
  /* LAS DOS PALABRAS SON DISTINTAS: cuando el color no alcanza, las separa la palabra. */
  await monta("m=sorting&c=normal", 1440, t);
  const w = await pg.$$eval(".tr-vh .sello.ai, .tr-vh .sello.sorting", (s) => [...new Set(s.map((e) => e.textContent.trim()))]);
  ok(w.length === 2, `[${t || "oficial"}] los sellos de certificada y normal dicen lo mismo: [${w}]`);
  /* LA FRANJA DICE LA CLASE: todas las de una clase comparten color —también la que lleva más de un
     día esperando, que se tiñe— y las dos clases no comparten ninguno. */
  const franjas = await pg.evaluate(() => {
    const g = (sel) => [...new Set([...document.querySelectorAll(sel)].map((e) => getComputedStyle(e).borderLeftColor))];
    return { so: g(".tr-vh.so"), ai: g(".tr-vh.ai") } });
  ok(franjas.so.length === 1 && franjas.ai.length === 1 && franjas.so[0] !== franjas.ai[0],
     `[${t || "oficial"}] las franjas de clase son certificada ${JSON.stringify(franjas.ai)} y normal ${JSON.stringify(franjas.so)}: ` +
     `cada clase debe tener UN color, también cuando lleva más de un día esperando`);
}

ok(roto.length === 0, `hubo errores en la consola: ${roto[0]}`);
await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Revisión AI en pantalla: la lista reparte certificadas y normales con la palabra escrita, filtra, " +
            "marca al interno y sin permiso no hay botones; la certificada se guarda EXACTAMENTE como antes " +
            "—sin p_tipo— y la normal lleva el suyo, las dos con su índice de cobro; el «+» calcula solo, dice " +
            "qué falta, no deja origen igual a destino y manda a la base los parámetros exactos; Tránsito ya no " +
            "pide Sorting ni tiene el paso de la AI y el interno no reclama fotos de una salida que no hubo; " +
            "Fuente principal y el Informe AI marcan la clase; y nada se sale en 4 anchos ni deja de leerse en " +
            "los 7 temas reales.");
