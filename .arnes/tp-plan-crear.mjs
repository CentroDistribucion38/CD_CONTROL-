/* =====================================================================
   TRASPASOS · PLAN — CREAR SÍ, CAMBIAR LO PUBLICADO NO (LA PANTALLA)

   La base (`correr-traspasos-plan-crear.sh`) prueba que el candado es
   real. Esto prueba lo que solo se ve MONTANDO la pantalla de verdad:

   1. QUIEN MANDA lo ve todo editable, también con el día publicado, y
      conserva «Borrar el plan del día».
   2. QUIEN CREA, con el día publicado, ve la rejilla en solo lectura, sin
      botones, con la RAZÓN escrita (una rejilla muda se lee «está rota»)
      y con lo PUBLICADO —no con el borrador que dejó quien manda—.
   3. QUIEN CREA, con el día sin plan, arma y publica; con solo un
      borrador suyo puede tirarlo.
   4. QUIEN SOLO MIRA no ve botones ni el aviso (el aviso es para quien
      esperaba poder editar).
   5. QUE NADA SE SALGA DE LA PANTALLA en 360 / 820 / 1440.

   El componente es el REAL. Solo `supabase` y `next/navigation` son dobles.

     node .arnes/tp-plan-crear.mjs
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

writeFileSync(R(".arnes/_pc-cliente.ts"), `
const w = window as any;
w.__rpc = [];
export function createClient() {
  return {
    rpc: async (n: string, a: any) => { w.__rpc.push({ n, a }); return { data: 1, error: null }; },
    from: () => { const b: any = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
      then: (res: any) => res({ data: [], error: null }) }; return b; },
  };
}`);
writeFileSync(R(".arnes/_pc-nav.ts"), `
export function useRouter() { return { refresh() {}, push() {}, replace() {}, back() {} } }
export function usePathname() { return "/traspasos/plan" }
export function useSearchParams() { return new URLSearchParams() }`);
writeFileSync(R(".arnes/_pc-link.tsx"), `
export default function Link({ href, children, ...resto }: any) { return <a href={href} {...resto}>{children}</a>; }`);

writeFileSync(R(".arnes/_pc-entrada.tsx"), `
import { createRoot } from "react-dom/client";
import { Plan } from "../src/app/(app)/traspasos/plan/Plan";

const tipos: any[] = [
  { clave: "pet", nombre: "PET", activo: true, orden: 1 },
  { clave: "casco", nombre: "Casco vidrio", activo: true, orden: 2 },
  { clave: "estibas", nombre: "Estibas de un nombre bastante largo para probar", activo: true, orden: 3 },
];
const lin = (turno: string, tipo: string, planeado: number, publicado: boolean) =>
  ({ id: turno + tipo + publicado, fecha: "2026-10-09", turno, tipo, planeado, publicado });
const PUB = [lin("A", "pet", 6, true), lin("B", "casco", 4, true)];
const BOR_ADMIN = [lin("A", "pet", 9, false)];
const BOR_SUYO = [lin("C", "pet", 2, false)];

const casos: Record<string, any> = {
  "manda-publicado":  { puedeEditar: true,  manda: true,  publicadas: PUB, borrador: [] },
  "manda-y-borrador": { puedeEditar: true,  manda: true,  publicadas: PUB, borrador: BOR_ADMIN },
  "crea-publicado":   { puedeEditar: true,  manda: false, publicadas: PUB, borrador: [] },
  "crea-publicado-borrador-admin": { puedeEditar: true, manda: false, publicadas: PUB, borrador: BOR_ADMIN },
  "crea-vacio":       { puedeEditar: true,  manda: false, publicadas: [], borrador: [] },
  "crea-su-borrador": { puedeEditar: true,  manda: false, publicadas: [], borrador: BOR_SUYO },
  "solo-mira":        { puedeEditar: false, manda: false, publicadas: PUB, borrador: [] },
};

const q = new URLSearchParams(location.search);
const c = casos[q.get("c") || "manda-publicado"];
createRoot(document.getElementById("r")!).render(
  <Plan tipos={tipos} publicadas={c.publicadas} borrador={c.borrador} vaciosGuardados={[{ turno: "A", vacios: 3 }]}
        control={[]} promedio={[]} ayer={[]} fecha="2026-10-09" hoy="2026-10-05" esHoy={false}
        puedeEditar={c.puedeEditar} manda={c.manda} />
);
`);

const js = buildSync({
  entryPoints: [R(".arnes/_pc-entrada.tsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic",
  alias: {
    "@/lib/supabase/client": R(".arnes/_pc-cliente.ts"),
    "next/navigation": R(".arnes/_pc-nav.ts"),
    "next/link": R(".arnes/_pc-link.tsx"),
    "@": R("src"),
  },
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
}).outputFiles[0].text;

const css = ["src/app/globals.css", "src/app/(app)/shell.css", "src/app/(app)/traspasos/traspasos.css"]
  .map((p) => readFileSync(R(p), "utf8")).join("\n");
const P = "*,::before,::after{margin:0;padding:0;box-sizing:border-box;border:0 solid}";

const { chromium } = await import("playwright");
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pg = await nav.newPage();
const roto = [];
pg.on("pageerror", (e) => roto.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") roto.push(m.text()) });

const monta = async (caso, ancho = 1440) => {
  await pg.unrouteAll();
  await pg.setViewportSize({ width: ancho, height: 1000 });
  await pg.route("http://arnes.local/**", (r) => r.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <style>${P}${css}</style></head>
      <body><div class="sh"><div class="sh-marco sin-riel"><main class="sh-main">
      <div class="tp" id="r"></div></main></div></div>
      <script>${js}<\/script></body></html>`,
  }));
  await pg.goto(`http://arnes.local/?c=${caso}`);
  try { await pg.waitForSelector("#r .matriz", { timeout: 8000 }) }
  catch { throw new Error(`«${caso}» no pintó. Errores de la página: ${roto.slice(-3).join(" | ") || "ninguno"}`) }
};

/* Lo que ve la persona, en cifras que se pueden comparar. */
const foto = () => pg.evaluate(() => {
  const t = (s) => [...document.querySelectorAll(s)].length;
  const txt = document.querySelector("#r").textContent.replace(/\s+/g, " ");
  const solo = [...document.querySelectorAll(".solo-ver")].map((e) => e.textContent.trim());
  const botones = [...document.querySelectorAll("#r button")].map((b) => b.textContent.trim());
  return {
    celdasEditables: t(".cel-step"),
    soloVer: solo,
    aviso: document.querySelector(".plan-cerrado")?.textContent.replace(/\s+/g, " ").trim() ?? null,
    pie: t(".pie-publicar"), atajos: t(".atajos-plan"),
    publicar: botones.includes("Publicar plan del día"),
    borrador: botones.includes("Guardar borrador"),
    borrar: botones.includes("Borrar el plan del día"),
    txt,
  };
});

/* ---------- 1. QUIEN MANDA ---------- */
for (const c of ["manda-publicado", "manda-y-borrador"]) {
  await monta(c); const f = await foto();
  ok(f.celdasEditables === 12, `${c}: quien manda debía ver las 12 celdas editables y ve ${f.celdasEditables}`);
  ok(f.aviso === null, `${c}: quien manda no debía ver el aviso de plan publicado`);
  ok(f.publicar && f.borrador && f.borrar, `${c}: quien manda debía tener Publicar, Guardar borrador y Borrar`);
  ok(f.atajos === 1, `${c}: quien manda debía tener los atajos`);
}

/* ---------- 2. QUIEN CREA, CON EL DÍA PUBLICADO ---------- */
for (const c of ["crea-publicado", "crea-publicado-borrador-admin"]) {
  await monta(c); const f = await foto();
  ok(f.celdasEditables === 0, `${c}: no debía poder editar celdas y ve ${f.celdasEditables} editables`);
  ok(f.pie === 0 && !f.publicar && !f.borrador && !f.borrar,
     `${c}: no debía tener Publicar, Guardar borrador ni Borrar (tiene: publicar=${f.publicar} borrador=${f.borrador} borrar=${f.borrar})`);
  ok(f.atajos === 0, `${c}: no debía tener los atajos de armar`);
  ok(f.aviso && /ya tiene el plan publicado/.test(f.aviso) && /administrador/.test(f.aviso),
     `${c}: debía decir POR QUÉ no hay botones y dice: ${f.aviso}`);
  /* LO PUBLICADO, no el borrador del administrador: 6 y 4, nunca el 9. */
  ok(f.soloVer.includes("6") && f.soloVer.includes("4"), `${c}: debía enseñar lo publicado (6 y 4) y enseña ${f.soloVer.join(",")}`);
  ok(!f.soloVer.includes("9"), `${c}: enseñó el borrador del administrador (9) como si fuera el plan`);
}

/* ---------- 3. QUIEN CREA, CON EL DÍA SIN PLAN ---------- */
{
  await monta("crea-vacio"); const f = await foto();
  ok(f.celdasEditables === 12, `crea-vacio: debía ver 12 celdas editables y ve ${f.celdasEditables}`);
  ok(f.aviso === null, "crea-vacio: no debía ver el aviso");
  ok(f.publicar && f.borrador, "crea-vacio: debía poder publicar y guardar borrador");
  ok(!f.borrar, "crea-vacio: «Borrar» no significa nada en un día sin plan");
  await monta("crea-su-borrador"); const g = await foto();
  ok(g.celdasEditables === 12 && g.aviso === null, "crea-su-borrador: debía poder seguir armando su borrador");
  ok(g.borrar, "crea-su-borrador: debía poder tirar su propio borrador");
}

/* ---------- 4. QUIEN SOLO MIRA ---------- */
{
  await monta("solo-mira"); const f = await foto();
  ok(f.celdasEditables === 0 && f.pie === 0 && !f.publicar && !f.borrar, "solo-mira: no debía tener nada para editar");
  ok(f.aviso === null, `solo-mira: el aviso es para quien esperaba poder editar, no para quien solo mira: ${f.aviso}`);
  ok(f.soloVer.includes("6") && f.soloVer.includes("4"), `solo-mira: debía ver lo publicado y ve ${f.soloVer.join(",")}`);
}

/* ---------- 5. LO QUE SE LLAMA A LA BASE ---------- */
{
  await monta("crea-vacio", 1440);
  await pg.evaluate(() => { (window).__rpc.length = 0 });
  await pg.locator(".cel-step").first().locator("button").last().click();
  await pg.getByRole("button", { name: "Publicar plan del día" }).click();
  await pg.waitForFunction(() => window.__rpc.length >= 2);
  const rpc = await pg.evaluate(() => window.__rpc.map((x) => x.n));
  ok(rpc.join(",") === "traspaso_guardar_plan,traspaso_publicar_plan",
     `publicar debía llamar guardar y publicar y llamó ${rpc.join(",")}`);
}

/* ---------- 5b. EL CABLEADO DE LA PÁGINA ----------
   La página es de servidor y este arnés no la monta, así que lo único
   que se puede comprobar aquí es su TEXTO: que le pasa al plan si quien
   mira manda de verdad. Es una prueba débil y se dice: cubre «alguien
   dejó manda={false}», no un cambio en misPermisos. */
{
  const pagina = readFileSync(R("src/app/(app)/traspasos/plan/page.tsx"), "utf8");
  ok(/manda=\{permisos\.manda\}/.test(pagina), "page.tsx debía pasarle al plan manda={permisos.manda}");
  ok(/puedeEditar=\{permisos\.puedeEditar\("\/traspasos\/plan"\)\}/.test(pagina),
     "page.tsx debía seguir pidiendo puedeEditar sobre /traspasos/plan");
}

/* ---------- 6. NADA SE SALE, EN LOS TRES ANCHOS ---------- */
for (const c of ["crea-publicado", "manda-publicado", "crea-vacio"]) {
  for (const w of [360, 820, 1440]) {
    await monta(c, w);
    const r = await pg.evaluate(() => {
      const doc = document.documentElement;
      const recortado = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.overflowX !== "visible" || s.overflowY !== "visible") return true;
        }
        return false;
      };
      const desborda = [];
      for (const el of document.querySelectorAll("#r *")) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && (b.right > doc.clientWidth + 0.5 || b.left < -0.5) && !recortado(el))
          desborda.push((el.className || el.tagName) + " r=" + Math.round(b.right));
      }
      const av = document.querySelector(".plan-cerrado");
      return { scroll: doc.scrollWidth, ancho: doc.clientWidth, desborda: desborda.slice(0, 4),
               avisoAlto: av ? Math.round(av.getBoundingClientRect().height) : 0,
               avisoCortado: av ? av.scrollHeight > av.clientHeight + 1 : false };
    });
    ok(r.scroll <= r.ancho + 0.5, `${c}@${w}: la página tiene scroll horizontal (${r.scroll} > ${r.ancho})`);
    ok(!r.desborda.length, `${c}@${w}: se sale de la pantalla: ${r.desborda.join(" | ")}`);
    ok(!r.avisoCortado, `${c}@${w}: el aviso queda cortado`);
    if (process.env.SHOT && c === "crea-publicado") await pg.screenshot({ path: R(`.arnes/tpc-${w}.png`), fullPage: true });
  }
}

ok(roto.length === 0, "errores en la consola de la página: " + roto.slice(0, 3).join(" | "));
await nav.close();
if (fallas.length) { console.log(""); fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ Plan: quien manda edita todo; quien crea no toca lo publicado y se le dice por qué; quien mira no ve botones; nada se sale en 360/820/1440.");
