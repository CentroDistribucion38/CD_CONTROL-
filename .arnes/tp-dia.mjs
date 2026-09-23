/* =====================================================================
   TRASPASOS · EL DÍA OPERATIVO ARRANCA A LAS 22:00 CON EL TURNO C

   «Toca revisar que el día 23/09 en la app empiece el 22/09 a las 22:00
   con el turno C. No deja registrar hasta que cambie el día.»

   SE MIDE CON EL RELOJ MOVIDO, que es la única forma de comprobar algo
   que solo se rompe a las diez de la noche. Sin esto, el error habría
   que cazarlo estando en la bodega a esa hora.

   LAS DOS MITADES TIENEN QUE DECIR LO MISMO. La pantalla decide qué día
   proponer y la base decide qué día acepta: si no coincidieran, el
   botón se vería habilitado y el guardado reventaría con un mensaje
   rojo después de escribir placa, ruta y cantidad. Por eso aquí se
   comprueban las dos contra la MISMA tabla de horas.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildSync } from "esbuild";
const R = (p) => new URL("../" + p, import.meta.url).pathname;
const fallas = []; const ok = (c, m) => { if (!c) fallas.push(m) };

/* ---------- LA TABLA DE LA VERDAD ----------
   Hora de Barranquilla → qué día operativo es. Es la regla escrita una
   sola vez, y contra ella se miden la pantalla y la base. */
const CASOS = [
  ["2026-09-22 05:59", "2026-09-22", "antes de las 6, todavía es el día del calendario"],
  ["2026-09-22 06:00", "2026-09-22", "entra el turno A: sigue siendo el mismo día"],
  ["2026-09-22 13:59", "2026-09-22", "media tarde"],
  ["2026-09-22 14:00", "2026-09-22", "entra el turno B"],
  ["2026-09-22 21:59", "2026-09-22", "un minuto antes de las 22:00 todavía es el 22"],
  ["2026-09-22 22:00", "2026-09-23", "ENTRA EL TURNO C: ya es el 23 — esto es lo que estaba mal"],
  ["2026-09-22 23:30", "2026-09-23", "media noche del turno C: el 23"],
  ["2026-09-23 00:30", "2026-09-23", "pasada la medianoche, el mismo turno C, el mismo día"],
  ["2026-09-23 05:59", "2026-09-23", "se acaba el turno C: sigue siendo el 23"],
  ["2026-09-30 22:10", "2026-10-01", "fin de mes: el turno C del 30 es del 1 de octubre"],
  ["2026-12-31 22:10", "2027-01-01", "fin de año: el turno C del 31 es del 1 de enero"],
];

/* ---------- 1 · LA PANTALLA ---------- */
const js = buildSync({ entryPoints: [R("src/modulos/traspasos/datos.ts")], bundle: true, write: false,
  format: "esm", platform: "neutral", external: ["@/lib/supabase/server"], logLevel: "silent" }).outputFiles[0].text;
writeFileSync(R(".arnes/_dia.mjs"), js.replace(/import[^;]*@\/lib\/supabase\/server[^;]*;/g, "const createClient = null;"));
const { hoyLocal, turnoDeAhora } = await import(R(".arnes/_dia.mjs") + "?" + Date.now())
  .then(async (m) => ({ ...m, ...(await import(R("src/modulos/traspasos/formato.ts").replace(/\.ts$/, ".ts")) .catch(() => ({}))) }));

/* El reloj, movido. Date.now() es lo único que hoyLocal mira. */
const conReloj = (bogota, fn) => {
  const real = Date.now;
  /* La hora que llega es de Barranquilla (UTC-5): se pasa a UTC. */
  const t = Date.parse(bogota.replace(" ", "T") + ":00Z") + 5 * 3600_000;
  Date.now = () => t;
  try { return fn() } finally { Date.now = real }
};

const tabla = [];
for (const [hora, dia, porque] of CASOS) {
  const dio = conReloj(hora, hoyLocal);
  tabla.push({ "hora en Barranquilla": hora, "día operativo": dio, "debe ser": dia, "": dio === dia ? "ok" : "✗" });
  ok(dio === dia, `a las ${hora} la pantalla dice que hoy es ${dio} y es ${dia} — ${porque}`);
}

/* Y el turno que propone tiene que ser el que de verdad está entrando. */
for (const [hora, , ] of CASOS) {
  const h = Number(hora.slice(11, 13));
  const esperado = h >= 6 && h < 14 ? "A" : h >= 14 && h < 22 ? "B" : "C";
  const dio = conReloj(hora, turnoDeAhora);
  ok(dio === esperado, `a las ${hora} propone el turno ${dio} y está entrando el ${esperado}`);
}

/* ---------- 2 · LA BASE ----------
   LA MISMA TABLA DE HORAS, preguntándole a las funciones de verdad. No
   se copia la fórmula aquí: se llama a `traspaso_hoy()` con el reloj
   movido, que es justo para lo que esa función recibe la hora por
   parámetro. Una prueba que reescribe la fórmula aprueba aunque la
   función esté rota. */
let sql = "";
try {
  execSync("sudo service postgresql start", { stdio: "ignore" });
  /* Lo mínimo que la migración necesita encontrar puesto. */
  writeFileSync("/tmp/_dia_previo.sql", `
    create or replace function public.traspaso_hoy() returns date language sql stable
      as $$ select (now() at time zone 'America/Bogota')::date $$;
    create or replace function public.traspaso_arranque_turno(p_fecha date, p_turno text)
      returns timestamptz language sql immutable as $$ select p_fecha::timestamptz $$;
    create or replace function public.traspaso_dia_abierto(p_fecha date, p_ahora timestamptz default now())
      returns boolean language sql stable as $$ select true $$;
    create or replace function public.traspaso_orden_turno(p_turno text)
      returns smallint language sql immutable as $$ select 1::smallint $$;
  `);
  const psql = (f) => execSync(`sudo -u postgres psql -q -v ON_ERROR_STOP=1 -d postgres -f ${f}`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  psql("/tmp/_dia_previo.sql");
  writeFileSync("/tmp/_dia_mig.sql", readFileSync(R("supabase/migraciones/2026-09-traspasos-dia-operativo.sql"), "utf8"));
  /* DOS VECES: estas migraciones tienen que poder repetirse. */
  psql("/tmp/_dia_mig.sql");
  psql("/tmp/_dia_mig.sql");

  const pregunta = CASOS.map(([hora, dia]) =>
    `select '${hora}' as hora, '${dia}' as debe,` +
    ` public.traspaso_hoy(timestamp '${hora}' at time zone 'America/Bogota')::text as dio`
  ).join(" union all ");
  const out = execSync(
    `sudo -u postgres psql -qtA -F'|' -d postgres -c "${pregunta}"`,
    { encoding: "utf8" }).trim().split("\n");
  for (const linea of out) {
    const [hora, debe, dio] = linea.split("|");
    ok(dio === debe, `la BASE dice que a las ${hora} el día operativo es ${dio} y es ${debe}`);
    const dePantalla = tabla.find((t) => t["hora en Barranquilla"] === hora)?.["día operativo"];
    ok(dio === dePantalla,
       `a las ${hora} la base dice ${dio} y la pantalla ${dePantalla}: el botón se vería habilitado y el guardado reventaría`);
  }
  ok(out.length === CASOS.length, `la base contestó ${out.length} de ${CASOS.length} casos`);

  /* Y las tres reglas que dependen del turno C, sin copiar la fórmula. */
  const uno = (q) => execSync(`sudo -u postgres psql -qtA -d postgres -c "${q}"`, { encoding: "utf8" }).trim();
  ok(uno(`select public.traspaso_arranque_turno(date '2026-09-23','C') = (timestamp '2026-09-22 22:00' at time zone 'America/Bogota')`) === "t",
     "el turno C del 23 no arranca el 22 a las 22:00");
  ok(uno(`select public.traspaso_dia_abierto(date '2026-09-23', timestamp '2026-09-24 05:00' at time zone 'America/Bogota')`) === "t",
     "el día 23 tiene que seguir abierto a las 05:00 del 24 — el turno C todavía está cerrándolo");
  ok(uno(`select public.traspaso_dia_abierto(date '2026-09-23', timestamp '2026-09-24 07:00' at time zone 'America/Bogota')`) === "f",
     "el día 23 tiene que estar cerrado a las 07:00 del 24");
  ok(uno(`select public.traspaso_orden_turno('C') < public.traspaso_orden_turno('A')`) === "t",
     "el turno C tiene que ir antes que el A: es el que abre el día");
  sql = `${out.length} horas comprobadas contra las funciones`;
} catch (e) {
  sql = "NO SE PUDO";
  fallas.push("no se pudo comprobar la base: " + String(e.stderr ?? e).slice(0, 200));
}

console.log("");
console.table(tabla);
console.log(`  la base: ${sql}`);
console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ Traspasos · el día operativo arranca a las 22:00 con el turno C, en la pantalla y en la base.");
