/* «La última vez en…» trae SOLO los renglones del conteo más reciente de la posición. */
import { buildSync } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
mkdirSync(R(".arnes/tmp"), { recursive: true });
writeFileSync(R(".arnes/tmp/ultimo.mjs"), buildSync({ entryPoints: [R("src/modulos/inventario/ultimo-conteo.ts")], bundle: true, format: "esm", write: false }).outputFiles[0].text);
const { soloElUltimo } = await import(pathToFileURL(R(".arnes/tmp/ultimo.mjs")).href);
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };
const f = (id, conteo_id, contado_en) => ({ id, conteo_id, contado_en });

/* Llegan renglones de tres conteos: solo quedan los del más reciente, todos (no solo uno). */
const todas = [f("a", "c1", "2026-09-10T10:00:00Z"), f("b", "c3", "2026-09-23T10:00:00Z"), f("c", "c2", "2026-09-17T10:00:00Z"), f("d", "c3", "2026-09-23T10:00:00Z"), f("e", "c1", "2026-09-10T10:00:00Z")];
const r = soloElUltimo(todas);
ok(r.length === 2 && r.map((x) => x.id).join() === "b,d", "debían quedar los dos renglones del conteo c3: " + r.map((x) => x.id));
/* El más reciente por FECHA, no por el orden en que llegan ni por el id. */
ok(soloElUltimo([f("a", "z9", "2026-09-01T00:00:00Z"), f("b", "a1", "2026-09-20T00:00:00Z")]).map((x) => x.id).join() === "b", "gana la fecha, no el id");
/* Empate de fecha: el id mayor, como la vista. */
ok(soloElUltimo([f("a", "c1", "2026-09-20T00:00:00Z"), f("b", "c2", "2026-09-20T00:00:00Z")]).map((x) => x.id).join() === "b", "el empate lo gana el id mayor");
/* Un solo conteo: todo queda. Vacío: vacío. Sin conteo_id: no se toca. */
ok(soloElUltimo([f("a", "c1", "2026-09-20T00:00:00Z"), f("b", "c1", "2026-09-20T00:00:00Z")]).length === 2, "un solo conteo queda completo");
ok(soloElUltimo([]).length === 0, "vacío");
ok(soloElUltimo([{ contado_en: "2026-09-20T00:00:00Z" }, { contado_en: "2026-09-01T00:00:00Z" }]).length === 2, "sin conteo_id no se puede separar: se deja igual");
/* Y la pantalla lo usa: lo que llega de la base pasa por el filtro antes de pintarse. */
import { readFileSync } from "node:fs";
ok(/setPrevio\(soloElUltimo\(/.test(readFileSync(R("src/app/(app)/inventario/conteo/Contar.tsx"), "utf8")), "Contar.tsx debía pasar lo que llega por soloElUltimo");
if (fallas.length) { fallas.forEach((x) => console.log("✗ " + x)); process.exit(1) }
console.log("✓ La última vez en una posición: solo los renglones del conteo más reciente.");
