/* ¿CAZA ALGO EL ARNÉS DE LAS PLACAS PEGADAS?   node .arnes/mutar-sd-placas.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const PL = "src/modulos/sider/placas.ts";
const TR = "src/app/(app)/sider/transito/Transito.tsx";
const CSS = "src/app/(app)/sider/sider.css";
const original = Object.fromEntries([PL, TR, CSS].map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(original)) writeFileSync(f, t) };
process.on("exit", restaurar);
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => { restaurar(); process.exit(130) });
let fallos = 0, total = 0;
function probar(nombre, cambios, espera) {
  /* PARA TRABAJAR SIN ESPERAR LA CORRIDA ENTERA: con SOLO="firma" puesto
     solo se prueban las mutaciones cuyo nombre lleve esa palabra. Sin
     SOLO no cambia nada, para que una corrida normal siga siendo todas. */
  if (process.env.SOLO && !nombre.includes(process.env.SOLO)) return;
  total++; restaurar();
  for (const [a, de, por] of cambios) {
    const t = readFileSync(a, "utf8");
    if (!t.includes(de)) { console.log(`  ROTA  ✘  ${nombre}`); fallos++; return }
    writeFileSync(a, t.replace(de, por));
  }
  let out;
  try { out = execFileSync("node", [".arnes/sd-placas.mjs"], { encoding: "utf8" }) }
  catch (e) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    if (out.includes(espera)) { console.log(`  ROJA  ✔  ${nombre}`); return }
    console.log(`  OTRA  ✘  ${nombre}\n           esperaba «${espera}»\n           ${out.split("\n").filter((l) => l.startsWith("✗") || /Error/.test(l)).slice(0, 2).join("\n           ")}`);
    fallos++; return;
  }
  console.log(`  VERDE ✘  ${nombre}`); fallos++;
}
console.log("");
probar("el encabezado PLACA cuenta como placa",
  [[PL, "/^[A-Z0-9]{5,7}$/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s)", "/^[A-Z0-9]{3,7}$/.test(s)"]],
  "una columna de Excel no se lee");
probar("las columnas de Excel no se parten por renglón",
  [[PL, "texto.split(/[\\r\\n\\t,;|]+/)", "texto.split(/[,;|]+/)"]],
  "junta dos celdas distintas");
probar("una placa con guion no se reconoce",
  [[PL, 's.replace(/[^A-Za-z0-9]/g, "").toUpperCase()', "s.toUpperCase()"]],
  "no se lee");
probar("las repetidas cuentan dos veces",
  [[PL, "if (esPlaca(c) && !vistas.has(c)) { vistas.add(c); out.push(c) }", "if (esPlaca(c)) out.push(c)"]],
  "cuenta más de una vez");
probar("«XYZ 98A» en medio de un chat se pierde",
  [[PL, "    else if (i + 1 < ps.length && esPlaca(ps[i] + ps[i + 1])) { out.push(ps[i] + ps[i + 1]); i++ }\n", ""]],
  "un chat no se lee");
probar("pegar varias no hace lista",
  [[TR, "    if (placas.length < 2) return;", "    return;"]],
  "pegar varias placas de una vez no arma la lista");
probar("la lista no filtra las tarjetas",
  [[TR, "      if (enLista && !enLista.has(normPlaca(v.placa))) return false;\n", ""]],
  "pegando la lista quedan");
/* El cruce dejó de ser un Set de placas y pasó a ser un Map placa→viaje
   —para poder decir de dónde sale y hace cuánto—, así que la mutación
   se mudó al renglón que recorre los viajes. Rompe lo mismo: contar
   contra lo ya filtrado y no contra todo lo que está en camino. */
probar("las que no vienen se cuentan contra lo filtrado",
  [[TR, "    for (const v of viajes) {", "    for (const v of viajes.filter((x) => !f.origen || x.cd_origen === f.origen)) {"],
   [TR, "  }, [lista, viajes]);", "  }, [lista, viajes, f.origen]);"]],
  "con el filtro de origen puesto");
probar("se copian en un solo renglón",
  [[TR, 'cruce.noVienen.join("\\n")', 'cruce.noVienen.join(", ")']],
  "una por renglón");
probar("Limpiar deja la lista puesta",
  [[TR, 'const limpiar = () => { setF({ placa: "", origen: "", desde: "", hasta: "", solo: "" }); setLista(null) };',
        'const limpiar = () => { setF({ placa: "", origen: "", desde: "", hasta: "", solo: "" }) };']],
  "Limpiar no quita la lista");
probar("no dice cuántas se pegaron",
  [[TR, "<b>{lista.length} pegadas</b>", "<b>Lista</b>"]],
  "no dice cuántas se pegaron");
/* Las que no vienen dejaron de ser chips sueltos y pasaron a ser un
   renglón de la tablita con su marca «No viene»: la mutación del rojo
   se mudó a esa marca, que es donde vive hoy ese color. */
probar("las que no vienen en un rojo que no se lee",
  [[CSS, ".sd .tr-pl-pill.no { background: #FDE8EB; color: #A30D25 }",
         ".sd .tr-pl-pill.no { background: #FDE8EB; color: #F48A98 }"]],
  "«no viene» contrasta");
/* Y lo que puede salirse de la pantalla ya no son los chips: es la
   tablita, que mide 860 px y se desliza DENTRO de su marco. Quitándole
   el marco, la que se va de lado es la página entera. */
probar("las placas se salen de la pantalla en el celular",
  [[CSS, ".sd .tr-pl-marco { overflow: auto; max-height: 420px;", ".sd .tr-pl-marco { overflow: visible; max-height: none;"]],
  "no se desliza dentro de su marco");
restaurar();
console.log("");
if (fallos) { console.log(`${fallos} de ${total} no cazan lo que dicen cazar.`); process.exit(1) }
console.log(`Las ${total} se pusieron rojas. El arnés caza lo que dice cazar.`);
