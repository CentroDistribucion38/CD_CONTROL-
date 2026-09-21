/* ¿CAZAN ALGO LOS ARNESES DE ROLES? node .arnes/mutar-ad-roles.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const UI = "src/app/(app)/admin/roles/Roles.tsx";
const SQL = "supabase/migraciones/2026-09-admin-roles.sql";
const orig = Object.fromEntries([UI, SQL].map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(orig)) writeFileSync(f, t) };
process.on("exit", restaurar);
let fallos = 0, total = 0;
function probar(nombre, [archivo, de, a], espera, arnes) {
  total++; restaurar();
  if (!orig[archivo].includes(de)) { console.log(`  ROTA  ✘  ${nombre}`); fallos++; return }
  writeFileSync(archivo, orig[archivo].replace(de, a));
  let s = "";
  try { s = execFileSync("bash", ["-c", arnes], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }
  catch (e) { s = (e.stdout ?? "") + (e.stderr ?? "") }
  if (s.includes(espera)) console.log(`  ROJA  ✔  ${nombre}`);
  else { console.log(`  VERDE ✘  ${nombre}\n           ${s.split("\n").filter((l) => /✗|ERROR/.test(l)).slice(0, 2).join(" | ")}`); fallos++ }
}
const P = "node .arnes/ad-roles.mjs", Q = "bash .arnes/correr-admin-roles.sh";
probar("el de sistema ofrece borrar", [UI, "{rol.sistema || rol.manda ? (", "{rol.manda ? ("], "un rol de sistema no dice", P);
probar("borrar no manda el destino", [UI, "p_clave: rol.clave, p_mover_a: hay > 0 ? destino : null,", "p_clave: rol.clave, p_mover_a: null,"], "no manda el rol y el destino", P);
probar("el destino ofrece el mismo rol", [UI, "const otros = roles.filter((r) => r.clave !== cual);", "const otros = roles;"], "ofrece el mismo rol", P);
probar("duplicar no copia", [UI, "p_descripcion: rol.descripcion, p_copiar_de: rol.clave,", "p_descripcion: rol.descripcion, p_copiar_de: null,"], "no manda la copia", P);
probar("quiénes no filtra por rol", [UI, "gente.filter((p) => p.rol === cual)", "gente.filter(() => true)"], "no dice cuántos", P);
/* EL CANDADO DE 02-roles.sql (roles_candado_trg) SIGUE DEBAJO: si la
   función perdiera su propio freno, el candado frena igual. Estas tres
   mutaciones no pueden ponerse rojas por su afirmación —el rol no se
   borra de todas formas— y por eso no van: serían verdes que no dicen
   nada. Lo que sí se mide es que, sin el paso de la gente, no se borra. */
probar("la base no pasa a la gente", [SQL, "    update public.perfiles set rol = p_mover_a where rol = p_clave;", "    perform 1;"], "Hay usuarios con el rol", Q);
probar("duplicar no copia en la base", [SQL, "    insert into public.rol_permisos (rol, seccion, nivel)\n    select v_clave, seccion, nivel from public.rol_permisos where rol = p_copiar_de;", "    perform 1;"], "2b(el duplicado no trae", Q);
probar("el historial se llena sin cambios", [SQL, "  if jsonb_array_length(v_cambios) > 0 then", "  if true then"], "3c(guardar sin cambios", Q);
probar("cualquiera crea roles", [SQL, "  if not public.manda() then raise exception 'Solo un rol que administre la plataforma puede crear roles'; end if;", ""], "1(un supervisor creó", Q);
restaurar();
console.log(fallos ? `\n${fallos} no cazan lo que dicen.` : `\nLas ${total} se pusieron rojas.`);
process.exit(fallos ? 1 : 0);
