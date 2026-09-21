/* =====================================================================
   FACTURACIÓN — la bandeja, medida.

   1. EL REGISTRO Y EL PATIO. Facturación va después de Traspasos en el
      menú; en el patio el campo se llama «Orden de cargue»; la lista del
      patio dice si el viaje salió o sigue por facturar; y lo que salió
      no ofrece corregir ni anular.
   2. LA BANDEJA, pintada con React de verdad: la cuenta arriba, la orden
      de cargue de cada viaje, el campo del número y su botón; quien no
      factura no ve el campo; quien no administra no reabre.
   3. EN PANTALLA: siete temas, y en el celular el botón de confirmar SE
      VE ENTERO sin deslizar —la lección del tablero de rotura—.

     node .arnes/fc-bandeja.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const U = (p) => new URL(p, import.meta.url);
const R = (p) => U("../" + p).pathname;
const fallas = [];
const ok = (c, msg) => { if (!c) fallas.push(msg) };
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* ======================= 1 · EL REGISTRO Y EL PATIO ======================= */
const reg = readFileSync(U("../src/modulos/registro.ts"), "utf8");
/* FACTURACIÓN VA DENTRO DE TRASPASOS, después de Registrar: «no debías
   crearlo allí, sino en el mismo módulo». Y no como módulo aparte. */
{
  const tr = reg.slice(reg.indexOf('id: "traspasos"'), reg.indexOf('id: "acciones"'));
  const iR = tr.indexOf('{ nombre: "Registrar", ruta: "/traspasos" }');
  const iF = tr.indexOf('{ nombre: "Facturación", ruta: "/traspasos/facturacion" }');
  const iC = tr.indexOf('{ nombre: "Control", ruta: "/traspasos/control" }');
  ok(iR > 0 && iF > iR && iC > iF, "Facturación no va dentro de Traspasos entre Registrar y Control: es el paso siguiente del mismo viaje");
  ok(!/id: "facturacion"/.test(reg), "Facturación sigue siendo un módulo aparte");
}
const pag = readFileSync(U("../src/app/(app)/traspasos/facturacion/page.tsx"), "utf8");
ok(/puedeVer\("\/traspasos\/facturacion"\)/.test(pag) && /puedeConfirmar=\{permisos\.puedeEditar\("\/traspasos\/facturacion"\)\}/.test(pag),
   "la pantalla no pide el permiso de /traspasos/facturacion para ver y para confirmar");
ok(/redirect\("\/traspasos\/facturacion"\)/.test(readFileSync(U("../src/app/(app)/facturacion/page.tsx"), "utf8")),
   "la dirección vieja /facturacion no manda a la nueva: quien la guardó se queda en un 404");
ok(/puedeReabrir=\{permisos\.manda\}/.test(pag), "reabrir no queda solo para quien administra");

const regTsx = sinComentarios(readFileSync(U("../src/app/(app)/traspasos/Registrar.tsx"), "utf8"));
const viajesTsx = sinComentarios(readFileSync(U("../src/app/(app)/traspasos/Viajes.tsx"), "utf8"));
const comunes = sinComentarios(readFileSync(U("../src/app/(app)/traspasos/comunes.tsx"), "utf8"));
ok(/<span className="rot-campo">Orden de cargue<\/span>/.test(regTsx) && !/rot-campo">Documento</.test(regTsx),
   "en Registrar el campo no se llama «Orden de cargue»");
ok(/>Orden de cargue<\/label>/.test(viajesTsx), "al corregir un viaje el campo no se llama «Orden de cargue»");
ok(/puedeEditar && v\.vale && !v\.salida_en \?/.test(viajesTsx),
   "un viaje que ya salió todavía ofrece Corregir y Anular en el patio");
ok(/className="eti salio"/.test(comunes) && /className="eti por-facturar"/.test(comunes),
   "la lista del patio no dice si el viaje salió o sigue por facturar");

/* ======================= 2 · LA BANDEJA ======================= */
writeFileSync(U("./_nav.mjs"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(U("./_supa.mjs"), `export const createClient = () => ({ rpc: async () => ({ error: null }) });`);
buildSync({
  entryPoints: [R("src/app/(app)/traspasos/facturacion/Bandeja.tsx")],
  bundle: true, format: "esm", platform: "node", jsx: "automatic",
  outfile: R(".arnes/_bandeja.mjs"),
  external: ["react", "react/jsx-runtime", "react-dom"],
  alias: { "next/navigation": R(".arnes/_nav.mjs"), "@/lib/supabase/client": R(".arnes/_supa.mjs"), "@": R("src") },
  logLevel: "silent",
});
const B = await import(U("./_bandeja.mjs").href + "?v=" + Date.now());
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");

const viaje = (id, extra) => ({
  id, codigo: "TP-" + id, fecha: "2026-09-21", turno: "B", turno_orden: 2, tipo: "pet", tipo_nombre: "PET",
  placa: "ABC12" + id, documento: "500000000" + id, sin_documento: false,
  origen: "ag01", origen_nombre: "Ag01 Barranquilla", destino: "planta", destino_nombre: "Planta Atlántico",
  origen_suelto: false, destino_suelto: false, viajes: 1, vacio: false, carga: 36, unidad: "estibas",
  nota: null, hora: "2026-09-21T15:20:00Z", registrado_por: "u1", registrado_en: "2026-09-21T15:20:00Z",
  dias_atras: 0, atrasado: false, ediciones: 0, editado_en: null, editado_por: null,
  estado: "registrado", vale: true, motivo_anulacion: null, anulado_en: null, anulado_por: null,
  factura_documento: null, salida_en: null, salida_por: null, salida_nombre: null,
  salida_historica: false, por_facturar: true, ...extra,
});
const PEND = [viaje("1"), viaje("2"), viaje("3")];
const SAL = [
  viaje("4", { factura_documento: "7687019429", salida_en: "2026-09-21T16:00:00Z", salida_nombre: "Fanny Factura", por_facturar: false }),
  viaje("5", { factura_documento: "7687019430", salida_en: "2026-09-21T16:10:00Z", salida_nombre: "Fanny Factura", por_facturar: false }),
];
const NOMBRES = { u1: "Santiago Leal" };
const pinta = (p) => renderToStaticMarkup(createElement(B.Bandeja, {
  pendientes: PEND, salieron: SAL, nombres: NOMBRES, puedeConfirmar: true, puedeReabrir: true, ...p }));

const html = pinta({});
const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok(/3 viajes por facturar/.test(texto), `arriba no dice cuántos esperan: «${texto.slice(0, 120)}»`);
ok(html.includes(">5000000001<"), "el viaje no muestra su orden de cargue");
ok((html.match(/inputMode="numeric"/g) ?? []).length === 3 && (html.match(/maxLength="10"/g) ?? []).length >= 3,
   "el número de documento no se pide en cifras y con diez como máximo en cada viaje");
ok((html.match(/>Confirmar salida<\/button>/g) ?? []).length === 3, "no hay un «Confirmar salida» por viaje");
ok((html.match(/<button type="submit" class="btn si" disabled="">/g) ?? []).length === 3,
   "se puede confirmar sin haber puesto el número");
ok(html.includes(">7687019429<") && /confirmó Fanny Factura/.test(texto), "lo que salió no dice su documento ni quién confirmó");
ok((html.match(/>Reabrir<\/button>/g) ?? []).length === 2, "el administrador no tiene «Reabrir» en lo que salió");

const soloVer = pinta({ puedeConfirmar: false, puedeReabrir: false });
ok(!/Confirmar salida/.test(soloVer) && /fc-solo-ver/.test(soloVer), "quien no factura ve el campo para confirmar");
ok(!/>Reabrir</.test(soloVer), "quien no administra puede reabrir");
const vacia = renderToStaticMarkup(createElement(B.Bandeja, {
  pendientes: [], salieron: [], nombres: {}, puedeConfirmar: true, puedeReabrir: false }));
ok(/No hay viajes/.test(vacia), "sin pendientes no lo dice");

/* ======================= 3 · EN PANTALLA ======================= */
{
  const { chromium } = await import("playwright");
  const css = readFileSync(U("../src/app/(app)/traspasos/traspasos.css"), "utf8")
            + readFileSync(U("../src/app/(app)/traspasos/facturacion/facturacion.css"), "utf8");
  const glob = readFileSync(U("../src/app/globals.css"), "utf8");
  const shell = readFileSync(U("../src/app/(app)/shell.css"), "utf8");
  const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
  const canales = (c) => { const n = (c.match(/[\d.]+/g) ?? [0,0,0]).slice(0,3).map(Number);
                           return c.startsWith("color(") ? n.map((v) => v * 255) : n };
  const razon = (a, b) => {
    const lum = (c) => { const [r,g,bl] = canales(c).map((v) => { v /= 255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4 });
                         return 0.2126*r + 0.7152*g + 0.0722*bl };
    const L1 = lum(a), L2 = lum(b);
    return +((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2);
  };
  /* EL ERROR DE UN VIAJE, ya puesto: aparece después de un clic que aquí
     no hay, y tiene que leerse igual. */
  const conError = html.replace('</form>', '<p class="fc-error" role="alert">El documento 7687019429 ya está en el viaje TP-4.</p></form>');
  const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const pg = await nav.newPage();
  const monta = async (tema, ancho) => {
    await pg.setViewportSize({ width: ancho, height: 900 });
    await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${glob}${shell}${css}
      html,body{margin:0}</style></head><body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}>
      <div class="sh-marco sin-riel"><main class="sh-main">${conError}</main></div></div></body></html>`);
  };
  for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
    await monta(t, 1200);
    const m = await pg.evaluate(() => {
      const fondo = (e) => {
        for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c }
        return "rgb(255, 255, 255)" };
      const par = (s) => { const e = document.querySelector(s);
                           return e ? { txt: getComputedStyle(e).color, fondo: fondo(e) } : { falta: s } };
      return { "título": par(".fc-cabeza h1"), "lo que dice arriba": par(".fc-cabeza .sub"),
               "orden de cargue": par(".fc-oc b"), "rótulo de la orden": par(".fc-oc span"),
               "placa": par(".fc-placa"), "datos del viaje": par(".fc-meta"),
               "rótulo del número": par(".fc-confirmar label span"), "número": par(".fc-confirmar input"),
               "confirmar salida": par(".fc-confirmar .btn"), "error": par(".fc-error"),
               "documento que salió": par(".fc-doc b"), "reabrir": par(".fc-salido .btn") };
    });
    for (const [k, v] of Object.entries(m)) {
      if (v.falta) { ok(false, `tema ${t ?? "oficial"}: en pantalla no está «${k}» (${v.falta})`); continue }
      const x = razon(v.txt, v.fondo);
      ok(x >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${x} (mínimo 4.5)`);
    }
  }
  for (const ancho of [1200, 768, 390, 360]) {
    await monta(null, ancho);
    const g = await pg.evaluate(() => {
      const r = (s) => [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect());
      const btn = r(".fc-confirmar .btn"), inp = r(".fc-confirmar input");
      return {
        lado: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        /* EL BOTÓN ENTERO A LA VISTA: ni cortado a la derecha ni fuera. */
        fuera: btn.filter((b) => b.right > innerWidth + 0.5 || b.left < -0.5).length,
        boton: Math.min(...btn.map((b) => b.height)), campo: Math.min(...inp.map((b) => b.height)),
        busca: document.querySelector(".fc-busca input").getBoundingClientRect().height,
      };
    });
    ok(g.lado <= 0, `${ancho} px: la bandeja arrastra la página ${g.lado} px de lado`);
    ok(g.fuera === 0, `${ancho} px: ${g.fuera} botón(es) de «Confirmar salida» quedan fuera de la pantalla`);
    ok(g.boton >= 44 && g.campo >= 44 && g.busca >= 44,
       `${ancho} px: botón ${g.boton} px, número ${g.campo} px, buscar ${g.busca} px (mínimo 44)`);
  }
  await nav.close();
}

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Facturación: va dentro de Traspasos después de Registrar, el patio dice «Orden de cargue», la bandeja pide el número " +
            "en cifras con su botón siempre a la vista, y se lee en los siete temas.");
