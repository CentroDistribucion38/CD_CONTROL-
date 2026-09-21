/* =====================================================================
   ROTURA DE LÍNEA EN EL CELULAR — la pantalla de verdad, en Chromium.

   «Algo así para el celular»: el día arriba, lo roto en una franja, los
   pasos numerados 1 línea · 2 turno · 3 envase · 4 máquina · 5 kilos,
   el resultado «38,5 ÷ 0,21 · salen solas → 184 u» y la barra oscura
   pegada abajo. Se montan Rejilla.tsx, Dias.tsx y MasDelDia.tsx de
   verdad con una base de mentiras que anota cada rpc.

   SE COMPRUEBA:
   1. en 390 y 360: la rejilla de quince casillas NO está y sí la
      máquina + kilos; los pasos salen numerados y en orden; nada se sale
      ni arrastra la página de lado; lo que se toca mide ≥ 44;
   2. la barra de anotar está pegada abajo y en pantalla sin rodar;
   3. «38,5» con coma cuenta (el teclado en español pone coma);
   4. dos máquinas en la misma pesada viajan juntas en UN rpc;
   5. «Más del día» va plegado en el celular y se abre al tocarlo;
   6. en el PC sigue la rejilla completa y no aparece nada del celular;
   7. contraste ≥ 4.5 de lo nuevo en los siete temas.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-rc.ts"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });
export const useSearchParams = () => new URLSearchParams("");`);
writeFileSync(R(".arnes/_supa-rc.ts"), `export const createClient = () => ({
  rpc: async (f: string, a: any) => { (window as any).rpcs = [...((window as any).rpcs ?? []), { f, a }]; return { error: null } },
});`);
writeFileSync(R(".arnes/_rc-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Rejilla } from "../src/app/(app)/quiebra/rotura/Rejilla";
import { Dias } from "../src/app/(app)/quiebra/rotura/Dias";
import { MasDelDia } from "../src/app/(app)/quiebra/rotura/MasDelDia";
const L = (linea: number) => ({ linea, tren: "", centro_coste: "", activo: true, orden: linea });
const M = (item: number, nombre: string, orden: number) => ({ item, nombre, activo: true, orden });
const maquinas = [M(9,"DESEMPACADORA",1), M(1,"DESEMPACADORA - LAVADORA",2), M(12,"LAVADORA",3),
  M(6,"SALIDA DE LAVADORA",4), M(2,"LAVADORA - LLENADORA",5), M(8,"OMNIVISION",6), M(11,"ENVASADORA",7),
  M(3,"LLENADORA - PASTEURITZADOR",8), M(13,"PASTEURIZADORA",9), M(4,"PASTEURIZADORA - ETIQUETADORA",10),
  M(7,"ETIQUETADORA",11), M(5,"ETIQUETADORA - EMPACADORA",12), M(10,"EMPACADORA",13), M(66,"CARGADOR",14), M(155,"PALE-DEPA",15)];
const envases = [{ material: "3500005", descripcion: "Envase Costeñita 175R", peso_kg: 0.21, activo: true, orden: 1 },
                 { material: "400733", descripcion: "ENVASE MARRON 330NR CERVEZAS", peso_kg: 0.177, activo: true, orden: 2 }];
const pesadas = [{ linea: 1, turno: 2, envase: "400733", envase_nombre: "", toma: 1, maquinas: 3, kg: 109, und: 619, baja: false },
                 { linea: 2, turno: 1, envase: "400733", envase_nombre: "", toma: 1, maquinas: 2, kg: 73, und: 412, baja: true },
                 { linea: 4, turno: 2, envase: "3500005", envase_nombre: "", toma: 1, maquinas: 4, kg: 300, und: 1339, baja: false }];
createRoot(document.getElementById("r")!).render(<>
  <Dias dia="2026-09-21" hoy="2026-09-21" esHoy={true} />
  <section className="rl-cabeza">
    <div><p className="rl-ojo">QUIEBRA · ROTURA DE LÍNEA · TURNO B · 08 · 16</p><h1>Rotura de línea</h1>
      <p className="rl-sub">El envase que se rompe mientras se envasa, máquina por máquina.</p></div>
    <div className="rl-panel"><div className="rl-corte" /><div className="rl-rot">ROTAS HOY</div>
      <div className="rl-num">2.370</div><div className="rl-pie">unidades · <b>482 kg</b> · 3 pesadas</div></div>
  </section>
  <div className="rl-marco">
    <Rejilla fecha="2026-09-21" lineas={[L(1),L(2),L(4),L(6)] as any} maquinas={maquinas as any}
             envases={envases as any} pesadas={pesadas as any} firmas={[]} turnoAhora={2}
             puedeEditar={true} esAdmin={false} />
    <MasDelDia pendientes={2}>
      <div className="rl-caja"><div className="rl-cab"><h2>El día, por línea</h2></div>
        <div className="rl-fila-linea"><span className="rl-etq">Línea 1</span><span className="rl-pista"><i style={{ width: "60%" }} /></span><span className="rl-v">1.031</span></div></div>
      <div className="rl-caja ojo"><div className="rl-cab"><h2>Sin dar de baja</h2></div><div className="rl-grande">2</div></div>
    </MasDelDia>
  </div>
  <div style={{ height: 900 }} />
</>);
`);
const js = buildSync({ entryPoints: [R(".arnes/_rc-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-rc.ts"), "@/lib/supabase/client": R(".arnes/_supa-rc.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/quiebra/rotura/rotura.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const ALTO = 740;
const monta = async (ancho, tema) => {
  await pg.setViewportSize({ width: ancho, height: ALTO });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="rl" id="r"></div></main></div></div><script>${js}</script></body></html>`);
  await pg.waitForSelector(".rl-escoger");
  await pg.evaluate(() => { window.rpcs = [] });
};
const escoge = async () => {
  await pg.click(".rl-disparo");
  await pg.click(".rl-rollo button:first-child");
};
const visible = (s) => pg.$eval(s, (e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0).catch(() => false);

const mide = () => pg.evaluate((ALTO) => {
  const d = document.documentElement;
  const salen = [];
  const caja = document.querySelector(".rl").getBoundingClientRect();
  for (const e of document.querySelectorAll(".rl *")) {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && getComputedStyle(e).display !== "none" && (r.right - caja.right > 0.5 || caja.left - r.left > 0.5)) {
      let rec = false;
      for (let p = e.parentElement; p && p.id !== "r"; p = p.parentElement) if (getComputedStyle(p).overflow !== "visible") rec = true;
      if (!rec) salen.push((e.className || e.tagName).toString().split(" ")[0]);
    }
  }
  const toques = [...document.querySelectorAll(".rl button, .rl input, .rl select")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && getComputedStyle(e).display !== "none" && !e.closest(".rl-fecha") })
    .map((e) => [Math.round(e.getBoundingClientRect().height), (e.className || e.tagName) + " " + (e.textContent || "").trim().slice(0, 14)]);
  const bot = document.querySelector(".rl-pie-reg .rl-btn.si")?.getBoundingClientRect();
  const pasos = [...document.querySelectorAll(".rl-rejilla .rl-rot")].filter((e) => e.querySelector(".rl-n"))
    .map((e) => e.querySelector(".rl-n").textContent + " " + e.textContent.slice(1).trim());
  return { lado: d.scrollWidth - d.clientWidth, salen: [...new Set(salen)], toques,
           pegada: getComputedStyle(document.querySelector(".rl-pie-reg")).position,
           boton: bot ? Math.round(bot.bottom) : null, pasos };
}, ALTO);

for (const ancho of [390, 360]) {
  await monta(ancho);
  ok(!(await visible(".rl-cabeza")), `${ancho}: en el celular sigue la cabeza (título y panel rojo), que no aporta al anotar`);
  ok(!(await visible(".rl-cel")), `${ancho}: la parte del celular sale antes de escoger el envase`);
  ok(await visible(".rl-rejilla .rl-vacio"), `${ancho}: antes del envase no dice que falta el envase`);
  let m = await mide();
  ok(m.pegada === "sticky", `${ancho}: la barra de anotar no va pegada abajo (${m.pegada})`);
  ok(m.boton != null && m.boton <= ALTO, `${ancho}: el botón de anotar no se ve sin rodar (acaba a ${m.boton})`);
  ok(await pg.$eval(".rl-pie-reg .rl-btn.si", (b) => b.disabled), `${ancho}: se puede anotar sin envase`);

  await escoge();
  ok(await visible(".rl-cel"), `${ancho}: con el envase escogido no salen máquina y kilos`);
  ok(!(await visible(".rl-tabla-env")), `${ancho}: en el celular sigue saliendo la rejilla de quince casillas`);
  m = await mide();
  ok(m.pasos.join("|") === "1 Línea|2 Turno|3 Envase|4 Máquina|5 Kilos de la canastilla",
     `${ancho}: los pasos no salen numerados y en orden: ${m.pasos.join(" | ")}`);
  ok(m.lado <= 0, `${ancho}: la página se arrastra ${m.lado} px de lado`);
  ok(!m.salen.length, `${ancho}: se sale: ${m.salen.join(", ")}`);
  const chicos = m.toques.filter(([h]) => h < 44);
  ok(!chicos.length, `${ancho}: se toca y mide menos de 44: ${chicos.map((x) => x.join(" px ")).join(" · ")}`);
  ok(m.boton <= ALTO, `${ancho}: con el envase escogido el botón se va de la pantalla (acaba a ${m.boton})`);

  /* 3 · LA COMA */
  await pg.selectOption(".rl-cel-maq", "6");
  await pg.fill(".rl-kilos input", "38,5");
  const salen = await pg.$eval(".rl-salen .v", (e) => e.textContent);
  ok(salen === "184 u", `${ancho}: 38,5 kg ÷ 0,21 da «${salen}» y debe dar 184 u (hacia arriba)`);
  ok(!(await pg.$eval(".rl-pie-reg .rl-btn.si", (b) => b.disabled)), `${ancho}: con kilos no se puede anotar`);

  /* 4 · DOS MÁQUINAS, UNA PESADA */
  await pg.selectOption(".rl-cel-maq", "13");
  await pg.fill(".rl-kilos input", "20");
  const lleva = await pg.$$eval(".rl-cel-lleva button", (b) => b.map((x) => x.querySelector("b").textContent));
  ok(lleva.join("|") === "SALIDA DE LAVADORA|PASTEURIZADORA", `${ancho}: «En esta pesada» dice ${lleva.join(", ")}`);
  await pg.click(".rl-cel-lleva button:first-of-type");
  ok(await pg.$eval(".rl-kilos input", (i) => i.value) === "38,5", `${ancho}: tocar una máquina de la pesada no la vuelve a poner arriba`);
  m = await mide();
  ok(!m.salen.length && m.lado <= 0, `${ancho}: con la pesada llena algo se sale: ${m.salen.join(", ")}`);
  await pg.click(".rl-pie-reg .rl-btn.si");
  await pg.waitForTimeout(50);
  const rpcs = await pg.evaluate(() => window.rpcs);
  const g = rpcs.filter((r) => r.f === "rotlinea_guardar");
  ok(g.length === 1, `${ancho}: anotar hizo ${g.length} rpc y es uno por pesada`);
  ok(g[0] && JSON.stringify(g[0].a.p_kilos) === JSON.stringify([{ maquina: 6, kg: 38.5 }, { maquina: 13, kg: 20 }]),
     `${ancho}: los kilos no viajan bien: ${JSON.stringify(g[0]?.a.p_kilos)}`);

  /* 5 · MÁS DEL DÍA */
  ok(!(await visible(".rl-lado .rl-caja")), `${ancho}: «Más del día» no va plegado`);
  await pg.click(".rl-mas-dia-btn");
  ok(await visible(".rl-lado .rl-caja"), `${ancho}: tocar «Más del día» no lo abre`);
  if (process.env.FOTO) {
    await monta(ancho); await escoge();
    await pg.selectOption(".rl-cel-maq", "6"); await pg.fill(".rl-kilos input", "38,5");
    await pg.screenshot({ path: `${process.env.FOTO}/rl-cel-${ancho}.png` });
  }
}

/* 6 · EL PC */
await monta(1200);
await escoge();
ok(await visible(".rl-tabla-env"), "PC: no está la rejilla completa");
ok(await visible(".rl-cabeza"), "PC: se perdió la cabeza con lo roto del día");
ok(!(await visible(".rl-cel")), "PC: sale la parte del celular");
ok(!(await visible(".rl-n")), "PC: salen los números de paso");
ok(!(await visible(".rl-mas-dia-btn")), "PC: sale el botón de «Más del día»");
ok(await visible(".rl-lado .rl-caja"), "PC: la columna de la derecha no se ve");
ok(await visible(".rl-nota"), "PC: se perdió la nota del peso");
await pg.fill(".rl-tabla input >> nth=0", "12.5");
ok((await pg.$eval(".rl-tabla tfoot td:last-child", (t) => t.textContent)) === "60", "PC: la rejilla no suma 12.5 kg ÷ 0.21 = 60 u");

/* 7 · CONTRASTE */
/* color-mix() sale como «color(srgb 0.81 0.83 0.85)», en 0–1 y no en 0–255:
   leído como rgb daba negro y el contraste salía 1,8 sin serlo. */
const lum = (c) => { const k = c.startsWith("color(srgb") ? 1 : 255; const [r, g2, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= k; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * r + .7152 * g2 + .0722 * b };
const razon = (a, b) => { const x = lum(a), y = lum(b); return +((Math.max(x, y) + .05) / (Math.min(x, y) + .05)).toFixed(2) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(390, t);
  const vacio = await pg.evaluate(() => { const b = document.querySelector(".rl-pie-reg .rl-btn.si"), s = getComputedStyle(b); return [s.color, s.backgroundColor] });
  await escoge();
  await pg.fill(".rl-kilos input", "38,5");
  const c = await pg.evaluate(() => {
    const g = (s, p) => getComputedStyle(document.querySelector(s))[p];
    const fondo = (s) => { for (let e = document.querySelector(s); e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255,255,255)" };
    return {
      numero: [g(".rl-n", "color"), g(".rl-n", "backgroundColor")],
      salen: [g(".rl-salen .v", "color"), fondo(".rl-salen")],
      salenK: [g(".rl-salen .k", "color"), fondo(".rl-salen")],
      cuenta: [g(".rl-pie-cuenta", "color"), fondo(".rl-pie-reg")],
      boton: [g(".rl-pie-reg .rl-btn.si", "color"), g(".rl-pie-reg .rl-btn.si", "backgroundColor")],
      kilos: [g(".rl-kilos input", "color"), fondo(".rl-kilos")],
      kg: [g(".rl-kilos span", "color"), fondo(".rl-kilos")],
      panel: [g(".rl-panel .rl-pie", "color"), g(".rl-panel", "backgroundColor")],
    };
  });
  c.botonApagado = vacio;
  const fila = Object.fromEntries(Object.entries(c).map(([k, [a, b]]) => [k, razon(a, b)]));
  console.log((t ?? "oficial").padEnd(8), Object.entries(fila).map(([k, v]) => `${k} ${v}`).join(" · "));
  for (const [k, v] of Object.entries(fila)) ok(v >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${v}`);
}

await nav.close();
if (fallas.length) { for (const f of fallas) console.log("✗ " + f); process.exit(1) }
console.log("✓ Rotura de línea en el celular: pasos 1–5 numerados, una máquina a la vez con la coma que cuenta, " +
            "dos máquinas en una sola pesada, la barra pegada abajo, «Más del día» plegado y el PC igual que antes.");
