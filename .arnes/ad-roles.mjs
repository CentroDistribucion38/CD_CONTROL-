/* =====================================================================
   ROLES — la pantalla de verdad, en Chromium.

   «No me deja eliminar un rol.» Se monta Roles.tsx tal cual con una base
   de mentiras que anota cada llamada, y se recorre:
   1. un rol de sistema (Operador) dice que no se borra, y no ofrece borrar;
   2. un rol con gente: «Borrar rol» está ARRIBA (sin bajar), pide a qué
      rol pasar a su gente, confirma y manda rol_borrar con ese destino;
   3. un rol sin gente se borra sin pedir destino;
   4. Duplicar manda rol_crear con copiar_de y el nombre escrito;
   5. «Quiénes lo tienen» lista a su gente; «Historial» dice qué cambió
      de qué a qué, quién y cuándo;
   6. 1200, 390 y 360 sin salirse y todo tocable; siete temas legibles.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = [];
const ok = (c, m) => { if (!c) fallas.push(m) };

writeFileSync(R(".arnes/_nav-ro.ts"), `export const useRouter = () => ({ refresh() {}, replace() {}, push() {} });`);
writeFileSync(R(".arnes/_supa-ro.ts"), `export const createClient = () => ({ rpc: async (f: string, a: any) => {
  (window as any).llamadas = [...((window as any).llamadas ?? []), { f, a }];
  return { data: f === "rol_borrar" ? (a.p_mover_a ? 2 : 0) : f === "rol_crear" ? a.p_clave : 3, error: null };
} });`);
writeFileSync(R(".arnes/_ro-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Roles } from "../src/app/(app)/admin/roles/Roles";
const roles = [
  { clave: "admin", nombre: "Administrador", descripcion: null, manda: true, sistema: true, orden: 1 },
  { clave: "operador", nombre: "Operador", descripcion: "Consulta lo que le habiliten.", manda: false, sistema: true, orden: 2 },
  { clave: "portero", nombre: "Portero", descripcion: null, manda: false, sistema: false, orden: 3 },
  { clave: "vacio", nombre: "Sin nadie", descripcion: null, manda: false, sistema: false, orden: 4 },
];
const gente = [
  { id: "1", nombre: "Ana Pérez", usuario: "ana", activo: true, rol: "portero" },
  { id: "2", nombre: "Beto Díaz", usuario: "beto", activo: false, rol: "portero" },
  { id: "3", nombre: "Caro", usuario: "caro", activo: true, rol: "operador" },
];
const historial = [
  { id: 9, rol: "portero", rol_nombre: "Portero", accion: "permisos", detalle: { cambios: [
    { seccion: "/traspasos", antes: "editar", despues: "ver" }, { seccion: "/acciones", antes: "ninguno", despues: "editar" }] },
    hecho_nombre: "Cristian Padilla", hecho_en: "2026-09-21T15:00:00Z" },
  { id: 8, rol: "portero", rol_nombre: "Portero", accion: "duplicado", detalle: { de_nombre: "Supervisor", pantallas: 12 }, hecho_nombre: "Cristian Padilla", hecho_en: "2026-09-20T15:00:00Z" },
  { id: 7, rol: "viejo", rol_nombre: "Rol viejo", accion: "borrado", detalle: { usuarios: 1, quienes: ["Dani"], a_nombre: "Operador" }, hecho_nombre: "Cristian Padilla", hecho_en: "2026-09-19T15:00:00Z" },
];
const catalogo = [
  { id: "traspasos", nombre: "Traspasos", acento: "#0A7", secciones: Array.from({ length: 20 }, (_, i) => ({ nombre: "Pantalla " + i, ruta: i ? "/traspasos/p" + i : "/traspasos" })) },
  { id: "acciones", nombre: "Acciones", acento: "#C21", secciones: Array.from({ length: 23 }, (_, i) => ({ nombre: "Otra " + i, ruta: i ? "/acciones/p" + i : "/acciones" })) },
];
createRoot(document.getElementById("r")!).render(<Roles roles={roles} catalogo={catalogo} gente={gente} historial={historial as any}
  cuantos={{ portero: 2, operador: 1 }} permisos={[{ rol: "portero", seccion: "/traspasos", nivel: "ver" }, { rol: "operador", seccion: "/acciones", nivel: "ver" }]} />);
`);
const js = buildSync({ entryPoints: [R(".arnes/_ro-entrada.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic",
  alias: { "next/navigation": R(".arnes/_nav-ro.ts"), "@/lib/supabase/client": R(".arnes/_supa-ro.ts"), "@": R("src") },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" }).outputFiles[0].text;
const css = readFileSync(R("src/app/(app)/admin/roles/roles.css"), "utf8");
const glob = readFileSync(R("src/app/globals.css"), "utf8"), shell = readFileSync(R("src/app/(app)/shell.css"), "utf8");
const PREFLIGHT = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const monta = async (ancho, tema, alto = 900) => {
  await pg.setViewportSize({ width: ancho, height: alto });
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PREFLIGHT}${glob}${shell}${css}</style></head>
    <body><div class="sh"${tema ? ` data-tema="${tema}"` : ""}><div class="sh-marco sin-riel"><main class="sh-main"><div class="rl" id="r"></div></main></div></div>
    <script>${js}</script></body></html>`);
  await pg.waitForSelector(".rl-roles");
  await pg.evaluate(() => { window.llamadas = [] });
};
const rol = (n) => pg.click(`.rl-roles button:has-text("${n}")`);
const llamadas = () => pg.evaluate(() => window.llamadas ?? []);

await monta(1200);
/* 1 · SISTEMA */
await rol("Operador");
ok(await pg.isVisible("text=De sistema · no se borra"), "un rol de sistema no dice que no se borra");
ok(!(await pg.isVisible(".rl-herr-der button:has-text('Borrar rol')")), "un rol de sistema ofrece borrar");
ok(!(await pg.isVisible("text=Borrar el rol «")), "sigue el botón viejo de borrar al final de la lista");

/* 2 · CON GENTE */
await rol("Portero");
const y = await pg.evaluate(() => document.querySelector(".rl-herr-der .peligro").getBoundingClientRect().top);
ok(y > 0 && y < 900, `«Borrar rol» no se ve sin bajar (está a ${Math.round(y)} px)`);
await pg.click(".rl-herr-der .peligro");
ok(await pg.isVisible(".rl-caja.peligro select"), "borrar un rol con gente no pregunta a qué rol pasarla");
ok(/tiene 2 usuarios: Ana Pérez, Beto Díaz/.test(await pg.textContent(".rl-caja.peligro")), "no dice quiénes tiene el rol");
const opciones = await pg.$$eval(".rl-caja.peligro option", (o) => o.map((x) => x.value));
ok(!opciones.includes("portero") && opciones.includes("operador"), `el destino ofrece el mismo rol o le falta otro: ${opciones}`);
ok(await pg.inputValue(".rl-caja.peligro select") === "operador", "el destino no arranca en Operador");
await pg.selectOption(".rl-caja.peligro select", "vacio");
await pg.click(".rl-caja.peligro .btn.rojo");
await pg.waitForSelector(".cf-caja");
ok(/2.*usuarios pasan.*Sin nadie/.test(await pg.textContent(".cf-caja")), "la confirmación no dice a dónde pasan");
await pg.click(".cf-caja .cf-btn.mal");
await pg.waitForFunction(() => (window.llamadas ?? []).some((l) => l.f === "rol_borrar"));
let l = (await llamadas()).find((x) => x.f === "rol_borrar");
ok(l.a.p_clave === "portero" && l.a.p_mover_a === "vacio", `rol_borrar no manda el rol y el destino: ${JSON.stringify(l.a)}`);
await pg.waitForSelector(".aviso.bien");
ok(/2 usuarios pasaron a Sin nadie/.test(await pg.textContent(".aviso")), "después de borrar no dice a dónde pasó la gente");

/* 3 · SIN GENTE */
await monta(1200);
await rol("Sin nadie");
await pg.click(".rl-herr-der .peligro");
ok(!(await pg.isVisible(".rl-caja.peligro select")), "un rol sin gente pide destino");
await pg.click(".rl-caja.peligro .btn.rojo"); await pg.click(".cf-caja .cf-btn.mal");
await pg.waitForFunction(() => (window.llamadas ?? []).some((l) => l.f === "rol_borrar"));
l = (await llamadas()).find((x) => x.f === "rol_borrar");
ok(l.a.p_clave === "vacio" && l.a.p_mover_a === null, `un rol sin gente se borra con destino: ${JSON.stringify(l.a)}`);

/* 4 · DUPLICAR */
await monta(1200);
await rol("Operador");
await pg.click(".rl-herr-der .btn.sec:has-text('Duplicar')");
ok(await pg.inputValue(".rl-caja input") === "Copia de Operador", "la copia no propone un nombre");
await pg.fill(".rl-caja input", "Portería Norte");
await pg.click(".rl-caja .btn:has-text('Crear la copia')");
await pg.waitForFunction(() => (window.llamadas ?? []).some((l) => l.f === "rol_crear"));
l = (await llamadas()).find((x) => x.f === "rol_crear");
ok(l.a.p_clave === "porteria_norte" && l.a.p_nombre === "Portería Norte" && l.a.p_copiar_de === "operador",
   `duplicar no manda la copia del rol: ${JSON.stringify(l.a)}`);

/* 5 · QUIÉNES E HISTORIAL */
await monta(1200);
await rol("Portero");
await pg.click(".rl-pest button:has-text('Quiénes')");
const quien = await pg.textContent(".rl-gente");
ok(/Ana Pérez/.test(quien) && /Beto Díaz/.test(quien) && /inactivo/.test(quien), "«Quiénes lo tienen» no lista a su gente");
ok(/Quiénes lo tienen · 2/.test(await pg.textContent(".rl-pest")), "la pestaña no dice cuántos");
await pg.click(".rl-pest button:has-text('Historial')");
const h = await pg.textContent(".rl-hist");
ok(/Traspasos · Pantalla 0\s*editar\s*→\s*ver/.test(h) && /Acciones · Otra 0\s*sin acceso\s*→\s*editar/.test(h), `el historial no dice qué cambió de qué a qué: ${h.slice(0, 160)}`);
ok(/Cristian Padilla/.test(h) && /copia de Supervisor/.test(h), "el historial no dice quién ni la copia");
ok(/Roles borrados/.test(await pg.textContent("#r")) && /Rol viejo/.test(await pg.textContent("#r")), "no se ven los roles borrados");

/* 6 · ANCHOS Y TEMAS */
for (const ancho of [1200, 390, 360]) {
  await monta(ancho);
  await rol("Portero");
  await pg.click(".rl-herr-der .peligro");
  const g = await pg.evaluate(() => {
    const alto = (s) => Math.min(...[...document.querySelectorAll(s)].map((x) => x.getBoundingClientRect().height));
    return { lado: document.documentElement.scrollWidth - innerWidth,
             tocar: alto(".rl-pest button, .rl-herr-der .btn, .rl-caja select, .rl-caja .btn") };
  });
  ok(g.lado <= 0, `${ancho} px: la página se sale ${g.lado} px de lado`);
  ok(g.tocar >= 40, `${ancho} px: algo de la barra mide ${g.tocar} px`);
}
const lum = (c) => { const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * n[0] + .7152 * n[1] + .0722 * n[2] };
const razon = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) };
for (const t of [null, "tinta", "pizarra", "ambar", "negro", "gris", "halo"]) {
  await monta(1200, t);
  await rol("Portero");
  await pg.click(".rl-herr-der .peligro");
  const pares = await pg.evaluate(() => {
    const fondo = (e) => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return "rgb(255, 255, 255)" };
    const par = (s) => { const e = document.querySelector(s); return [getComputedStyle(e).color, fondo(e)] };
    return { "pestaña": par(".rl-pest button:not(.aqui)"), "pestaña activa": par(".rl-pest button.aqui"), "duplicar": par(".rl-herr-der .btn.sec"),
             "borrar": par(".rl-herr-der .peligro"), "caja": par(".rl-caja p"), "rótulo": par(".rl-caja label span"),
             "botón rojo": par(".rl-caja .btn.rojo"), "select": par(".rl-caja select") };
  });
  for (const [k, [a, b]] of Object.entries(pares)) ok(razon(a, b) >= 4.5, `tema ${t ?? "oficial"}: «${k}» contrasta ${razon(a, b).toFixed(2)}`);
}
await monta(390); await rol("Portero"); await pg.click(".rl-herr-der .peligro");
await pg.screenshot({ path: "/tmp/claude-0/ad-roles-390.png", fullPage: false });
await monta(1200); await rol("Portero"); await pg.click(".rl-pest button:has-text('Historial')");
await pg.screenshot({ path: "/tmp/claude-0/ad-roles-1200.png" });
await nav.close();

console.log("");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Roles: borrar arriba y pasando a la gente, el de sistema lo dice, duplicar copia, quiénes e historial se leen, cabe en 360 y en siete temas.");
