/* ¿CAZAN ALGO LOS ARNESES DE BORRAR DATOS? node .arnes/mutar-ad-datos.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const UI = "src/app/(app)/admin/datos/BorrarDatos.tsx";
const CSS = "src/app/(app)/admin/datos/datos.css";
const SQL = "supabase/migraciones/2026-09-admin-borrar-datos.sql";
const SQL2 = "supabase/migraciones/2026-10-admin-borrar-todo.sql";   // la lista completa: pisa la del archivo de arriba
const orig = Object.fromEntries([UI, CSS, SQL, SQL2].map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(orig)) writeFileSync(f, t) };
process.on("exit", restaurar);
let fallos = 0, total = 0;
function probar(nombre, [archivo, de, a], espera, arnes) {
  if (process.env.SOLO && !nombre.includes(process.env.SOLO)) return;
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
probar("cambiar el rango no reinicia", [UI, 'setCopia(false); setEscrito(""); setConteos(null);', 'setConteos(null);'], "se quedó la copia", P);
probar("«Todo» manda fechas", [UI, "const pD = todo ? null : desde, pH = todo ? null : hasta;", "const pD = desde, pH = hasta;"], "«Todo»", P);
probar("borrar no manda el conteo visto", [UI, "[p.clave, conteos[p.clave].filas]", "[p.clave, 0]"], "el conteo visto", P);
probar("el apagado se ve rojo", [CSS, ".rl.bd .bd-borrar:disabled { background: var(--c-b4c0ce); cursor: not-allowed }", ""], "se ve rojo", P);
probar("en el celular no baja a una columna", [CSS, "  .rl.bd .bd-marco { grid-template-columns: minmax(0, 1fr) }", ""], "se sale de la pantalla", P);
probar("la base deja contar a cualquiera", [SQL, "declare c record; v_donde text; v_extra bigint := 0;\nbegin\n  if not public.manda() then raise exception 'Borrar datos es solo de quien administra la plataforma'; end if;",
  "declare c record; v_donde text; v_extra bigint := 0;\nbegin"], "1(un supervisor pudo contar)", Q);
/* Se le pide la afirmación 5, la que mira ESTA mutación (se borró sin
   escribir BORRAR), y no la 5d: 5d también se pone roja hoy por el fallo
   del conteo que está más abajo, y una mutación no puede cobrar por una
   afirmación que ya estaba roja sin ella. */
probar("la base borra sin BORRAR", [SQL, "  if coalesce(p_confirmacion, '') <> 'BORRAR' then", "  if false then"], "5(borró sin escribir BORRAR)", Q);
/* SALE ROTA ✘ Y ESO ES LA NOTICIA, NO UN DESCUIDO DE LA MUTACIÓN.
   Hoy admin_borrar NO compara el conteo: en el SQL está escrito
   «if false then» en lugar de «if v_hay is distinct from p_esperadas then»,
   o sea que el freno está puesto a mano en apagado y se borra aunque lo que
   hay ya no sea lo que la persona vio en pantalla. La mutación se deja tal
   cual —nombra la línea que DEBERÍA estar— y vuelve sola a ROJA el día que
   se arregle el SQL. Mientras tanto la prueba de Postgres ya lo canta:
   5b(borró con un conteo distinto al que se vio). NO se toca el SQL desde
   aquí: eso es arreglo de la aplicación, no del arnés.
   Por ese mismo fallo la prueba sale roja de entrada con 5d, 6 y 9 puestas,
   así que a las tres mutaciones de arriba que antes se colgaban de esos
   letreros se les cambió el que se les exige (5, 6b y 9b): ninguno de esos
   tres aparece en la corrida sin mutar, de modo que cada una vuelve a
   cazarse sola. */
probar("la base no compara el conteo", [SQL, "  if v_hay is distinct from p_esperadas then", "  if false then"], "5b(borró con un conteo distinto", Q);
/* Se le pide 6b —las filas que QUEDAN en la tabla después de borrar—, no
   el número que la función dice haber borrado: contar lo que quedó es lo
   que de verdad prueba que solo se fue el rango pedido, y además es la
   única de las dos que no está ya roja por el fallo del conteo. */
probar("la base ignora el rango al borrar", [SQL, "  execute format('delete from public.%1$I t where %2$s', c.tabla, v_donde);", "  execute format('delete from public.%1$I t where true', c.tabla);"], "6b(no quedó solo el día de fuera del rango)", Q);
probar("el plan deja sus vacíos", [SQL2, "'traspasos_plan', 't.fecha', 'traspasos_plan_vacios', null, null, 10", "'traspasos_plan', 't.fecha', null, null, null, 10"], "3c(el plan no cuenta sus vacíos", Q);
probar("no devuelve los PDF", [SQL2, "'rotlinea_hojas', 't.fecha', null, 'rotlinea-hojas',\n     'select t.ruta from public.rotlinea_hojas t where %s', 22", "'rotlinea_hojas', 't.fecha', null, null, null, 22"], "3d(no cuenta los PDF)", Q);
probar("la lista trae usuarios", [SQL2, "    ('inventario.conteos', 'Inventario', 'Conteos',", "    ('x.perfiles', 'X', 'Perfiles', 'x', 'perfiles', 't.creado_en::date', null, null, null, 99),\n    ('inventario.conteos', 'Inventario', 'Conteos',"], "2c(la lista trae", Q);
/* Se le pide 9b —que la fila del registro diga el rango y los archivos—:
   la 9 cuenta cuántos borrados quedaron escritos y hoy ya sale roja por el
   fallo del conteo, así que no probaría nada de esta mutación. */
probar("no queda escrito", [SQL, "  insert into public.admin_borrados (clave, nombre, desde, hasta, filas, archivos)\n  values (c.clave, c.modulo || ' · ' || c.nombre, p_desde, p_hasta, v_n + v_x, coalesce(array_length(v_rutas, 1), 0));\n", ""], "9b(el registro no dice el rango ni los archivos)", Q);
/* LA LISTA COMPLETA Y LA PANTALLA NUEVA */
const T = "bash .arnes/correr-admin-borrar.sh";
probar("falta Quiebra · cargas en la lista", [SQL2, "    ('quiebra.cargas', 'Quiebra', 'Cargas de archivos (registro)',", "    ('quiebra.xcargas', 'Quiebra', 'Cargas de archivos (registro)',"], "A(falta quiebra.cargas", T);
probar("el conteo no devuelve sus fotos", [SQL2, "'conteos', '(t.creado_en at time zone ''America/Bogota'')::date', null, 'inventario',", "'conteos', '(t.creado_en at time zone ''America/Bogota'')::date', null, null,"], "F2(no devuelve las 2 rutas", T);
probar("el fiscal cuenta por una fecha que no existe", [SQL2, "'inv_fiscales', 't.fecha', null, null, null, 73", "'inv_fiscales', 't.dia', null, null, null, 73"], "inventario.fiscal", T);
probar("las casillas son círculos", [UI, 'type="checkbox" className="bd-cuadro" name="punto"', 'type="radio" className="bd-cuadro" name="punto"'], "quedan círculos", P);
probar("los módulos entran abiertos", [UI, "useState<string[]>([])" + ";   // módulos desplegados", "useState<string[]>(puntos.map((p) => p.modulo));   // módulos desplegados"], "no entran plegados", P);
probar("la casilla se ve redonda", [CSS, "border: 2px solid var(--rl-tinta); border-radius: 2px; background: #fff; box-shadow: none; cursor: pointer; position: relative;", "border: 2px solid var(--rl-tinta); border-radius: 50%; background: #fff; box-shadow: none; cursor: pointer; position: relative;"], "la casilla no es un cuadrito", P);
probar("marcar todo no marca", [UI, "[...new Set([...a, ...ps.map((p) => p.clave)])]", "a"], "«Marcar todo» no marca", P);
probar("el borrado manda una sola clave", [UI, "claves: con.map((p) => p.clave), desde: pD", "claves: con.slice(0, 1).map((p) => p.clave), desde: pD"], "borrar varios no manda", P);
restaurar();
console.log(fallos ? `\n${fallos} no cazan lo que dicen.` : `\nLas ${total} se pusieron rojas.`);
process.exit(fallos ? 1 : 0);
