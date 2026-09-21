/* ¿CAZAN ALGO LOS ARNESES DE BORRAR DATOS? node .arnes/mutar-ad-datos.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const UI = "src/app/(app)/admin/datos/BorrarDatos.tsx";
const CSS = "src/app/(app)/admin/datos/datos.css";
const SQL = "supabase/migraciones/2026-09-admin-borrar-datos.sql";
const orig = Object.fromEntries([UI, CSS, SQL].map((f) => [f, readFileSync(f, "utf8")]));
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
const P = "node .arnes/ad-datos.mjs", Q = "bash .arnes/correr-admin-borrar.sh";
probar("se puede escribir sin bajar la copia", [UI, "disabled={!copia}", "disabled={false}"], "sin haber bajado la copia", P);
probar("borra sin escribir BORRAR", [UI, 'copia && escrito === "BORRAR" && !borrando', 'copia && !borrando'], "habilita el botón", P);
probar("acepta borrar en minúscula", [UI, 'escrito === "BORRAR"', 'escrito.toUpperCase() === "BORRAR"'], "en minúscula", P);
probar("cambiar el rango no reinicia", [UI, 'setCopia(false); setEscrito(""); setConteo(null);', 'setConteo(null);'], "se quedó la copia", P);
probar("«Todo» manda fechas", [UI, "const pD = todo ? null : desde, pH = todo ? null : hasta;", "const pD = desde, pH = hasta;"], "«Todo»", P);
probar("borrar no manda el conteo visto", [UI, "esperadas: conteo.filas", "esperadas: 0"], "el conteo visto", P);
probar("el apagado se ve rojo", [CSS, ".rl.bd .bd-borrar:disabled { background: var(--c-b4c0ce); cursor: not-allowed }", ""], "se ve rojo", P);
probar("en el celular no baja a una columna", [CSS, "  .rl.bd .bd-marco { grid-template-columns: minmax(0, 1fr) }", ""], "se sale de la pantalla", P);
probar("la base deja contar a cualquiera", [SQL, "declare c record; v_donde text; v_extra bigint := 0;\nbegin\n  if not public.manda() then raise exception 'Borrar datos es solo de quien administra la plataforma'; end if;",
  "declare c record; v_donde text; v_extra bigint := 0;\nbegin"], "1(un supervisor pudo contar)", Q);
probar("la base borra sin BORRAR", [SQL, "  if coalesce(p_confirmacion, '') <> 'BORRAR' then", "  if false then"], "5d(algo se borró sin confirmar)", Q);
probar("la base no compara el conteo", [SQL, "  if v_hay is distinct from p_esperadas then", "  if false then"], "5b(borró con un conteo distinto", Q);
probar("la base ignora el rango al borrar", [SQL, "  execute format('delete from public.%1$I t where %2$s', c.tabla, v_donde);", "  execute format('delete from public.%1$I t where true', c.tabla);"], "6(dice que borró", Q);
probar("el plan deja sus vacíos", [SQL, "'traspasos_plan', 't.fecha', 'traspasos_plan_vacios', null, null, 10", "'traspasos_plan', 't.fecha', null, null, null, 10"], "3c(el plan no cuenta sus vacíos", Q);
probar("no devuelve los PDF", [SQL, "'rotlinea_hojas', 't.fecha', null, 'rotlinea-hojas',\n     'select t.ruta from public.rotlinea_hojas t where %s', 22", "'rotlinea_hojas', 't.fecha', null, null, null, 22"], "3d(no cuenta los PDF)", Q);
probar("la lista trae usuarios", [SQL, "    ('inventario.conteos', 'Inventario', 'Conteos',", "    ('x.perfiles', 'X', 'Perfiles', 'x', 'perfiles', 't.creado_en::date', null, null, null, 99),\n    ('inventario.conteos', 'Inventario', 'Conteos',"], "2c(la lista trae", Q);
probar("no queda escrito", [SQL, "  insert into public.admin_borrados (clave, nombre, desde, hasta, filas, archivos)\n  values (c.clave, c.modulo || ' · ' || c.nombre, p_desde, p_hasta, v_n + v_x, coalesce(array_length(v_rutas, 1), 0));\n", ""], "9(el registro", Q);
restaurar();
console.log(fallos ? `\n${fallos} no cazan lo que dicen.` : `\nLas ${total} se pusieron rojas.`);
process.exit(fallos ? 1 : 0);
