/* =====================================================================
   REGISTRAR HACIA ADELANTE — la cuenta de los días

   Lo que se mide aquí es lo ÚNICO que la pantalla decide por su cuenta:
   hasta qué fecha deja registrar. El candado de verdad está en la base
   —`traspaso_registrar`, con su propia prueba en
   .arnes/correr-traspasos-adelantado.sh—; esto comprueba que la
   pantalla no le diga a la gente algo distinto de lo que la base va a
   aceptar.

   SE PRUEBAN LOS BORDES, no el caso fácil: el cambio de mes, el de año,
   el 29 de febrero y el día del cambio de hora en otros países —que no
   aplica en Colombia, pero el servidor que corre esto puede estar en
   cualquier parte y `new Date` sí lo aplica—.

     node .arnes/tp-adelanto.mjs
   ===================================================================== */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* SE COMPILA EL ARCHIVO DE VERDAD, no una copia: una prueba contra una
   copia de la fórmula pasa siempre y no dice nada. */
const dir = mkdtempSync(join(tmpdir(), "tp-adel-"));
const compilado = join(dir, "formato.mjs");
execFileSync("npx", ["esbuild", `${process.cwd()}/src/modulos/traspasos/formato.ts`,
  "--bundle", "--format=esm", "--platform=node", `--outfile=${compilado}`],
  { stdio: "pipe" });
const mod = await import(`file://${compilado}`);

const fallas = [];
const igual = (que, dio, deb) => {
  if (dio !== deb) fallas.push(`${que}: dio ${dio} y debía dar ${deb}`);
};

/* 1. EL NÚMERO ES EL MISMO QUE EL DE LA BASE. Se lee del SQL, no se
      escribe aquí: si alguien cambia uno de los dos, esto lo dice. */
const sql = readFileSync(
  "supabase/migraciones/2026-09-traspasos-registro-adelantado.sql", "utf8");
const m = sql.match(/if p_fecha > v_hoy \+ (\d+) then/);
if (!m) fallas.push("no encontré el tope en la migración (¿cambió el `if`?)");
else if (Number(m[1]) !== mod.DIAS_ADELANTE)
  fallas.push(`la base deja ${m[1]} días y la pantalla ${mod.DIAS_ADELANTE}: se separaron`);
else console.log(`el tope es ${mod.DIAS_ADELANTE} días en la base y en la pantalla`);

/* 2. LOS BORDES DEL CALENDARIO. */
for (const [hoy, deb] of [
  ["2026-09-23", "2026-09-30"],   // corriente
  ["2026-09-28", "2026-10-05"],   // cambia de mes
  ["2026-12-28", "2027-01-04"],   // cambia de año
  ["2028-02-26", "2028-03-04"],   // bisiesto
  ["2026-10-31", "2026-11-07"],   // fin de mes de 31
  ["2026-02-27", "2026-03-06"],   // febrero normal
]) igual(`tope desde ${hoy}`, mod.topeAdelante(hoy), deb);

/* 3. Y QUE SIGA SIENDO UNA FECHA, no una cadena rara. */
for (const hoy of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
  const t = mod.topeAdelante(hoy);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) fallas.push(`tope desde ${hoy} no es una fecha: ${t}`);
  if (t <= hoy) fallas.push(`el tope desde ${hoy} no quedó adelante: ${t}`);
}

if (fallas.length) {
  console.error("\nFALLAS:\n" + fallas.map((f) => " · " + f).join("\n"));
  process.exit(1);
}
console.log("los bordes del calendario, bien; y el número no se separó de la base.");
