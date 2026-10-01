/* =====================================================================
   CONTEO · LA FICHA DE TOTALES DEL BORRADOR — en Chromium, con el componente de verdad.
   «Dentro del borrador una ficha que diga cuántas estibas en general y cuántas
   unidades en total, para comparar conteos.»
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
writeFileSync(R(".arnes/_cf-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Contar } from "../src/app/(app)/inventario/conteo/Contar";
const w = window as any;
createRoot(document.getElementById("r")!).render(<Contar bodegaId="b1" conteoInicial={{ id: "c1", codigo: "INV-1", estado: "en_proceso", iniciado_en: null }}
  renglonesIniciales={w.REN} materiales={w.MAT} ubicaciones={w.UBI} estados={[]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_cf-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "@/lib/supabase/client": R(".arnes/_sb-conteo.js"), "next/navigation": R(".arnes/stub-nav.js"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const M = (id, sku, tipo, upc, cpe) => ({ id, sku, nombre: (tipo === "ENVASE" ? "Canasta " : "Águila ") + sku, unidades_por_caja: upc, cajas_por_estiba: cpe, unidades_por_estiba: null, contenido: null,
  familia: null, presentacion: null, vida_util: 180, f_limite_desp: null, dias_minimo: 30, origen: null, foraneo: null, tipo_material: tipo, activo: true });
const MAT = [M("m1", "3128", "PRODUCTO", 30, 80), M("m2", "3129", "PRODUCTO", 30, 80), M("m3", "900", "ENVASE", 30, 40), M("m4", "777", "PRODUCTO", null, null)];
const U = (calle, modulo, lado) => ({ id: `${calle}${modulo}${lado ?? ""}`, bodega_id: "b1", clave: `${calle}${modulo}${lado ? "_" + lado : ""}`, calle, modulo, lado, familia: null, capacidad: 10, activa: true });
const UBI = [U("A", "01", "IZQ"), U("B", "02", null)];
const base = { conteo_id: "c1", conteo: "INV-1", estado: "en_proceso", familia: null, lado: null, estibas: null, cajas: null, saldo: null, total_estibas: 0, capacidad: 10,
  venc_dia: null, venc_mes: null, venc_anio: null, vencimiento: null, dias_para_salir: 100 };
const REN = [
  { ...base, id: "r1", codigo: "3128", material: "Águila 3128", tipo_material: "PRODUCTO", factor_estibado: 80, ubicacion: "A01_IZQ", calle: "A", modulo: "01", estibas: 3, total_cajas: 240 },
  { ...base, id: "r2", codigo: "3129", material: "Águila 3129", tipo_material: "PRODUCTO", factor_estibado: 80, ubicacion: "B02", calle: "B", modulo: "02", cajas: 40, total_cajas: 40 },
  { ...base, id: "r3", codigo: "900", material: "Canasta 900", tipo_material: "ENVASE", factor_estibado: 40, ubicacion: "A01_IZQ", calle: "A", modulo: "01", estibas: 2, saldo: 20, total_cajas: 100 },
];
/* Producto 280 cajas = 3,5 estibas = 8.400 un · Envase 100 cajas = 2,5 estibas = 3.000 un · General 380 · 6 · 11.400. */
const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/inventario/fefo.css"].map((f) => readFileSync(R(f), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";
const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const num = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
const monta = async (ren, ancho = 390) => {
  await pg.setViewportSize({ width: ancho, height: 900 });
  await pg.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${P}${css}</style></head><body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main"><div class="fe"><div id="r"></div></div></main></div></div><script>window.MAT=${JSON.stringify(MAT)};window.UBI=${JSON.stringify(UBI)};window.REN=${JSON.stringify(ren)};</script><script>${js}</script></body></html>`);
  await pg.waitForSelector(".fe-anotar", { state: "attached" });
  await pg.click('[role=tab]:has-text("El borrador")');
};
const cifras = (n) => pg.locator(".fe-ficha").nth(n).locator("dd").allTextContents().then((x) => x.map(num));
const roto = []; pg.on("pageerror", (e) => roto.push(String(e.message)));

/* 1 · la ficha: tres cifras en grande del borrador entero. */
await monta(REN);
ok(await pg.locator(".fe-ficha").count() === 1, "sin filtro hay una sola ficha");
ok(/Total del borrador/.test(await pg.locator(".fe-ficha h3").first().textContent()), "la ficha no se llama «Total del borrador»");
const c = await cifras(0);
ok(c.join("|") === "6|380|11400", "estibas, cajas, unidades del borrador: " + c.join("|"));
ok(/Estibas/.test(await pg.locator(".fe-ficha dt").nth(0).textContent()) && /Cajas/.test(await pg.locator(".fe-ficha dt").nth(1).textContent()) && /Unidades/.test(await pg.locator(".fe-ficha dt").nth(2).textContent()), "las tres cifras no van en el orden estibas · cajas · unidades");
/* producto y envase por separado, porque hay de los dos. */
const tipos = (await pg.locator(".fe-ficha-tipos li").allTextContents()).map((x) => x.replace(/\s+/g, " "));
ok(tipos.length === 2 && /Producto.*3,5 estibas · 280 cajas · 8\.400 unidades/.test(tipos[0]) && /Envase.*2,5 estibas · 100 cajas · 3\.000 unidades/.test(tipos[1]), "producto y envase aparte: " + tipos.join(" | "));
ok(await pg.locator(".fe-ficha-aviso").count() === 0, "no hay nada sin convertir y avisa algo");
/* ya no está la ficha si no hay renglones. */
await monta([]);
ok(await pg.locator(".fe-ficha").count() === 0, "con el borrador vacío no hay ficha");

/* 2 · con filtro: la primera sigue siendo TODO lo que se envía; la segunda, lo que se ve. */
await monta(REN);
await pg.selectOption(".fe-filtros select >> nth=0", "A");
ok(await pg.locator(".fe-ficha").count() === 2, "con filtro hay dos fichas");
ok((await cifras(0)).join("|") === "6|380|11400", "la ficha del total cambió con el filtro: " + (await cifras(0)).join());
ok((await cifras(1)).join("|") === "5.5|340|10200", "lo que se ve (calle A): " + (await cifras(1)).join());
ok(/Lo que ves/.test(await pg.locator(".fe-ficha h3").nth(1).textContent()), "la segunda no dice que es lo que se ve");
await pg.fill(".fe-filtros input", "3129");
ok((await cifras(1)).join("|") === "0|0|0", "filtro calle A + código 3129 (no coinciden): " + (await cifras(1)).join("|"));
await pg.selectOption(".fe-filtros select >> nth=0", "");
ok((await cifras(1)).join("|") === "0.5|40|1200", "filtro por código 3129: " + (await cifras(1)).join("|"));
ok(await pg.locator(".fe-ficha-tipos").nth(1).count() === 0, "con solo producto a la vista no separa producto y envase");
await pg.click('button:has-text("Quitar filtros")');
ok(await pg.locator(".fe-ficha").count() === 1, "al quitar los filtros vuelve a una sola ficha");

/* 3 · lo que no se pudo convertir se dice, y no se inventa. */
await monta([...REN, { ...base, id: "r4", codigo: "777", material: "Águila 777", tipo_material: "PRODUCTO", factor_estibado: null, ubicacion: "B02", calle: "B", modulo: "02", cajas: 50, total_cajas: 50 }]);
const c4 = await cifras(0);
ok(c4.join("|") === "6|430|11400", "lo que no se convierte no suma estibas ni unidades, las cajas sí: " + c4.join("|"));
const av = (await pg.locator(".fe-ficha-aviso").textContent()).replace(/\s+/g, " ");
ok(/1 renglón no tiene cajas por estiba/.test(av) && /1 renglón no tiene unidades por caja/.test(av), "el aviso de lo que no se pudo convertir: " + av);

/* 4 · nada se sale, en cuatro anchos, con filtro (las dos fichas) y con aviso. */
for (const w of [360, 390, 820, 1440]) {
  await monta([...REN, { ...base, id: "r4", codigo: "777", material: "Águila 777", tipo_material: "PRODUCTO", factor_estibado: null, ubicacion: "B02", calle: "B", modulo: "02", cajas: 50, total_cajas: 50 }], w);
  await pg.selectOption(".fe-filtros select >> nth=0", "B");
  const d = await pg.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth,
    fuera: [...document.querySelectorAll(".fe-fichas *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className || e.tagName).slice(0, 4) }));
  ok(d.ancho <= d.vista && d.fuera.length === 0, `a ${w} px se sale: ${d.ancho}>${d.vista} ${d.fuera.join(",")}`);
}
if (process.env.FOTO) {
  await monta(REN, 390); await pg.selectOption(".fe-filtros select >> nth=0", "A");
  await pg.locator(".fe-fichas").screenshot({ path: process.env.FOTO + "/ficha-390.png" });
  await monta(REN, 1440); await pg.selectOption(".fe-filtros select >> nth=0", "A");
  await pg.locator(".fe-fichas").screenshot({ path: process.env.FOTO + "/ficha-1440.png" });
}
ok(roto.length === 0, "errores de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Ficha de totales del borrador: estibas, cajas y unidades de todo el conteo, producto y envase aparte, lo filtrado en una segunda ficha, lo que no se convierte se avisa, y nada se sale en 4 anchos.");
