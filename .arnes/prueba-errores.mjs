/* QUÉ ARCHIVO NOMBRA CADA ERROR.
   Se prueba con los mensajes TAL COMO los devuelve PostgREST, que es lo
   que de verdad llega a la pantalla: si la prueba usara mensajes
   inventados, pasaría con un mapeo que en la vida real no acierta. */
import { execSync } from "node:child_process";
import fs from "node:fs";

/* SE COMPILA EL ARCHIVO DE VERDAD, no se le quitan los tipos con
   expresiones regulares. Ese atajo se rompió con un `as string` y la
   prueba reventó por su propia culpa, no por la del código: una prueba
   que falla por su andamio no dice nada de lo que probaba. */
fs.mkdirSync(".arnes/tmp", { recursive: true });
execSync("npx tsc src/lib/errores.ts --outDir .arnes/tmp --module es2022 " +
         "--target es2022 --moduleResolution bundler --skipLibCheck", { stdio: "inherit" });
const mod = await import("../.arnes/tmp/errores.js");

const CASOS = [
  ['Could not find the function public.rotlinea_firmar(p_fecha, p_linea, p_turno, p_nota) in the schema cache',
   "2026-09-rotura-linea-firma.sql"],
  ['relation "public.rotlinea_firmas" does not exist',
   "2026-09-rotura-linea-firma.sql"],
  ['relation "public.v_rotlinea_uso" does not exist',
   "2026-09-rotura-linea-maestro.sql"],
  ['Could not find the function public.rotlinea_guardar(...) in the schema cache',
   "supabase/modulos/rotura-linea.sql"],
  ['relation "public.rotlinea_envases" does not exist',
   "supabase/modulos/rotura-linea.sql"],
  ['relation "public.v_rotlinea" does not exist',
   "supabase/modulos/rotura-linea.sql"],
  /* Y que NO se le robe el módulo al vecino: roturas de tolvas sigue
     mandando a su propio archivo, que es el que empezó con ese prefijo. */
  ['Could not find the function public.rotura_registrar(...) in the schema cache',
   "supabase/modulos/roturas.sql"],
  ['relation "public.roturas_tolvas" does not exist', "supabase/modulos/roturas.sql"],
  ['relation "public.quiebra_bajas" does not exist', "supabase/modulos/quiebra.sql"],
  /* Traspasos: el módulo y sus seis migraciones. */
  ['relation "public.traspasos_viajes" does not exist', "supabase/modulos/traspasos.sql"],
  ['Could not find the function public.traspaso_registrar(...) in the schema cache',
   "supabase/modulos/traspasos.sql"],
  ['Could not find the function public.traspaso_editar_viaje(...) in the schema cache',
   "2026-09-traspasos-editar-viaje.sql"],
  ['Could not find the function public.traspaso_borrar_plan(p_fecha) in the schema cache',
   "2026-09-traspasos-borrar-plan.sql"],
  ['relation "public.traspasos_placas" does not exist', "2026-09-traspasos-placas.sql"],
  ['Could not find the function public.traspaso_plan_a_varios(...) in the schema cache',
   "2026-09-traspasos-plan-varios-dias.sql"],
  ['relation "public.v_traspasos_uso" does not exist', "2026-09-traspasos-maestro.sql"],
  ['relation "public.traspasos_plan_vacios" does not exist', "2026-09-traspasos-plan-rejilla.sql"],
  /* Y lo de siempre: un error que no es de SQL faltante no nombra nada. */
  ['duplicate key value violates unique constraint', "(genérico)"],
];

let malas = 0;
for (const [error, esperado] of CASOS) {
  const dice = mod.traducirError(error);
  const ok = esperado === "(genérico)"
    ? !/ejecuta supabase\//.test(dice)
    : dice.includes(esperado);
  if (!ok) malas++;
  console.log(`${ok ? "bien" : "MAL "}  ${error.slice(0, 52).padEnd(54)} → ${
    (dice.match(/ejecuta (\S+)/) || [,"(genérico)"])[1]}`);
}
fs.rmSync(".arnes/tmp", { recursive: true, force: true });
console.log(malas ? `\n${malas} de ${CASOS.length} mal` : `\nlos ${CASOS.length} casos, bien`);
