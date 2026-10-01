/* =====================================================================
   INVENTARIO FISCAL · LA PÁGINA (servidor) — lo que lee de la base y lo que le pasa a la pantalla.
   Sobre todo: «publicado_en» (el botón de Contar) llega con un SQL nuevo; si falta, la pantalla
   sigue sirviendo, sin ese botón, en vez de caerse.
   ===================================================================== */
import { writeFileSync } from "node:fs";
import { build } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_fp-permisos.ts"), `export async function misPermisos() { const g = globalThis as any; return { puedeEditar: () => true, manda: g.__MANDA === true } }`);
writeFileSync(R(".arnes/_fp-fefo.ts"), `export async function maestroInventario() { return { falta: false, bodegas: [{ id: "b1", codigo: "CD38", activo: true }], ubicaciones: [{ bodega_id: "b1" }], errorBodegas: null } }`);
writeFileSync(R(".arnes/_fp-server.ts"), `
export async function createClient() {
  const g = globalThis as any;
  return {
    rpc: async (n: string) => {
      g.__LECTURAS.push({ t: "rpc:" + n, cols: "" });
      if (n === "inv_fiscal_avance" && g.__SIN_AVANCE) return { data: null, error: { message: "Could not find the function public.inv_fiscal_avance" } };
      return { data: n === "inv_fiscal_avance" ? (g.__AVANCE ?? []) : null, error: null };
    },
    from: (t: string) => {
    const q: any = { cols: "" };
    const resp = () => {
      g.__LECTURAS.push({ t, cols: q.cols });
      if (t === "inv_fiscales" && q.cols.includes("publicado_en") && g.__SIN_COLUMNA) return { data: null, error: { message: "column inv_fiscales.publicado_en does not exist" } };
      if (t === "inv_fiscal_hojas" && g.__SIN_TABLA) return { data: null, error: { message: "relation does not exist" } };
      const filas = (g.__DATOS[t] ?? []).map((f: any) => { const o = { ...f }; if (t === "inv_fiscales" && !q.cols.includes("publicado_en")) delete o.publicado_en; return o });
      return { data: filas, error: null };
    };
    for (const m of ["eq", "order", "limit"]) q[m] = () => q;
    q.select = (c: string) => { q.cols = c; return q };
    q.then = (ok: any, no: any) => Promise.resolve(resp()).then(ok, no);
    return q;
  } };
}`);
writeFileSync(R(".arnes/_fp-fiscal.tsx"), `export function Fiscal(p: any) { return <pre id="props">{JSON.stringify({ ...p, personas: undefined, roles: undefined })}</pre> }`);
writeFileSync(R(".arnes/_fp-page.tsx"), `export { default } from "../src/app/(app)/inventario/fiscal/page";`);
const out = (await build({ entryPoints: [R(".arnes/_fp-page.tsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic",
  alias: { "@/lib/permisos": R(".arnes/_fp-permisos.ts"), "@/modulos/inventario/fefo": R(".arnes/_fp-fefo.ts"), "@/lib/supabase/server": R(".arnes/_fp-server.ts"), "@": R("src") },
  plugins: [{ name: "x", setup(b) {
    b.onResolve({ filter: /^\.\/Fiscal$/ }, () => ({ path: R(".arnes/_fp-fiscal.tsx") }));
    b.onResolve({ filter: /\.css$/ }, () => ({ path: "x", namespace: "css" }));
    b.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "", loader: "js" }));
  } }], external: ["react", "react-dom", "react/jsx-runtime", "next/*"], logLevel: "silent" })).outputFiles[0].text;
writeFileSync(R(".arnes/_fp-page.bundle.mjs"), out);
const { renderToStaticMarkup } = await import("react-dom/server");
const Pagina = (await import(R(".arnes/_fp-page.bundle.mjs") + "?" + Date.now())).default;
const DATOS = {
  inv_fiscales: [
    { id: "f1", nombre: "FISCAL OCTUBRE 2026 · viernes 02/10", fecha: "2026-10-02", estado: "abierto", creado_en: "x", publicado_en: "2026-10-01T14:00:00Z" },
    { id: "f2", nombre: "Otro", fecha: "2026-10-09", estado: "abierto", creado_en: "y", publicado_en: null },
  ],
  inv_fiscal_hojas: [{ id: "h1", fiscal_id: "f1", numero: 1 }],
  inv_fiscal_miembros: [{ hoja_id: "h1", equipo: "OL", user_id: "u1" }],
  perfiles: [{ id: "u1", nombre: "Ana", activo: true, rol: "operador" }], roles: [],
};
const AVANCE = [
  { fiscal_id: "f1", hoja_id: "h1", numero: 1, ol_renglones: "3", ol_termino: "2026-10-02T10:00:00Z", bavaria_renglones: 0, bavaria_termino: null },
  { fiscal_id: "fOtro", hoja_id: "hx", numero: 1, ol_renglones: 9, ol_termino: null, bavaria_renglones: 9, bavaria_termino: null },
];
const dibuja = async (o = {}) => {
  Object.assign(globalThis, { __LECTURAS: [], __DATOS: DATOS, __SIN_COLUMNA: false, __SIN_TABLA: false, __SIN_AVANCE: false, __AVANCE: AVANCE, __MANDA: false }, o);
  const html = renderToStaticMarkup(await Pagina());
  const m = html.match(/<pre id="props">(.*)<\/pre>/s);
  return { html, props: m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) : null };
};
let r = await dibuja();
ok(r.props && r.props.puedePublicar === true, "con la columna, no deja publicar");
ok(r.props?.fiscales?.[0]?.publicado === "2026-10-01T14:00:00Z" && r.props?.fiscales?.[1]?.publicado === null, "la pantalla no recibe cuál está publicado: " + JSON.stringify(r.props?.fiscales?.map((f) => f.publicado)));
ok(globalThis.__LECTURAS.filter((x) => x.t === "inv_fiscales").length === 1 && /publicado_en/.test(globalThis.__LECTURAS.find((x) => x.t === "inv_fiscales").cols), "no lee publicado_en");
r = await dibuja({ __SIN_COLUMNA: true });
ok(r.props && r.props.puedePublicar === false, "sin la columna debe avisar que falta el SQL (puedePublicar=false): " + (r.props && r.props.puedePublicar));
ok(r.props?.fiscales?.length === 2 && r.props.fiscales.every((f) => f.publicado === null), "sin la columna, la lista no se muestra igual (sin publicado)");
const lect = globalThis.__LECTURAS.filter((x) => x.t === "inv_fiscales");
ok(lect.length === 2 && !/publicado_en/.test(lect[1].cols), "sin la columna no vuelve a leer sin ella: " + JSON.stringify(lect.map((x) => x.cols)));
ok(!/Falta preparar el inventario fiscal/.test(r.html), "sin la columna cae a «falta preparar» y el plan deja de verse");
r = await dibuja({ __SIN_TABLA: true });
ok(/Falta preparar el inventario fiscal/.test(r.html) && /2026-10-inventario-fiscal\.sql/.test(r.html), "sin las tablas del fiscal no manda al SQL de siempre");
/* El avance de cada hoja y el cruce. */
r = await dibuja();
ok(r.props?.conCruce === true, "con el SQL del cruce no lo marca disponible");
ok(r.props?.fiscales?.[0]?.hojaIds?.["1"] === "h1", "la pantalla no recibe el id de la hoja: " + JSON.stringify(r.props?.fiscales?.[0]));
ok(r.props?.fiscales?.[0]?.avance?.["1"]?.olRenglones === 3 && r.props.fiscales[0].avance["1"].olTermino === "2026-10-02T10:00:00Z" && r.props.fiscales[0].avance["1"].bavariaTermino === null, "el avance no llega bien: " + JSON.stringify(r.props?.fiscales?.[0]?.avance));
ok(JSON.stringify(r.props?.fiscales?.[1]?.avance) === "{}" && JSON.stringify(r.props?.fiscales?.[1]?.hojaIds) === "{}", "un plan sin avance debe llegar con avance vacío, no con el de otro plan");
ok(globalThis.__LECTURAS.some((x) => x.t === "rpc:inv_fiscal_avance"), "no pide el avance");
r = await dibuja({ __SIN_AVANCE: true });
ok(r.props?.conCruce === false && r.props?.fiscales?.length === 2 && r.props.fiscales.every((f) => f.avance === undefined && f.hojaIds === undefined), "sin el SQL del cruce la pantalla debe seguir sirviendo, sin avance: " + JSON.stringify(r.props?.conCruce));
ok(!/Falta preparar el inventario fiscal/.test(r.html), "sin el SQL del cruce cae a «falta preparar» y el plan deja de verse");
r = await dibuja({ __MANDA: true });
ok(r.props?.manda === true, "no le pasa a la pantalla si es administrador");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Fiscal (página): lee quién está publicado, y si a la base le falta el SQL de Contar la pantalla sigue sirviendo sin ese botón.");
