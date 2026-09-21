/* ¿CAZAN ALGO LOS ARNESES DE USUARIOS? node .arnes/mutar-ad-usuarios.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const UI = "src/app/(app)/admin/usuarios/Usuarios.tsx";
const SQL = "supabase/migraciones/2026-09-admin-usuarios.sql";
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
const P = "node .arnes/ad-usuarios.mjs", Q = "bash .arnes/correr-admin-usuarios.sh";
probar("buscar no ignora tildes", [UI, 'const plano = (x: string) => x.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();', "const plano = (x: string) => x.toLowerCase();"], "buscar sin tilde", P);
probar("el filtro de rol no filtra", [UI, "(!fRol || p.rol === fRol) &&", "true &&"], "el filtro de rol", P);
probar("uno mismo entra en la selección", [UI, 'const conmigo = ids.includes(yo) && accion !== "activar";', "const conmigo = false;"], "incluyéndose a uno mismo", P);
probar("la confirmación no nombra", [UI, "dice: <><p>{quien}.</p><p>Desde que vuelvan", "dice: <><p>Varios.</p><p>Desde que vuelvan"], "no nombra a quiénes", P);
probar("los propuestos chocan", [UI, "    while (usados.has(u)) u = `${base}${k++}`;\n", ""], "chocan", P);
probar("copiar incluye los que fallaron", [UI, "...listaClaves(resultados ?? []).map((x) => `${x.nombre}\\t${x.usuario}\\t${x.clave}`)", "...(resultados ?? []).map((x) => `${x.nombre}\\t${x.usuario}\\t${x.clave}`)"], "Copiar todo", P);
probar("deja crear con un usuario tomado", [UI, "propuestos.some((u, i) => u.length < 3 || lista.some((p) => p.usuario === u) || propuestos.indexOf(u) !== i)", "false"], "deja crear con un usuario que ya existe", P);
probar("la base deja desactivarse a uno mismo", [SQL, "  if auth.uid() = any(p_ids) and p_accion in ('rol', 'desactivar') then", "  if false then"], "6(se desactivó a sí mismo)", Q);
/* «Las …_por sin llave» no tiene mutación: hoy todas las columnas de
   persona tienen llave, así que esa parte solo cubre las que se agreguen
   mañana sin ella, y quitarla no cambia ningún conteo de hoy. */
probar("el rastro de uno trae a todos", [SQL, "      where $1 is null or p.id = any($1) group by p.id", "      group by p.id"], "3c(pedir el rastro", Q);
probar("cualquiera ve los ingresos", [SQL, "  if not public.manda() then raise exception 'Solo quien administra ve los ingresos'; end if;", ""], "1(uno que no administra ve los ingresos)", Q);
restaurar();
console.log(fallos ? `\n${fallos} no cazan lo que dicen.` : `\nLas ${total} se pusieron rojas.`);
process.exit(fallos ? 1 : 0);
