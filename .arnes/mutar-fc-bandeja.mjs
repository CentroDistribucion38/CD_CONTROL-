/* =====================================================================
   ¿DE VERDAD CAZA ALGO EL ARNÉS DE LA BANDEJA DE FACTURACIÓN?
     node .arnes/mutar-fc-bandeja.mjs
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REG = "src/modulos/registro.ts";
const PAG = "src/app/(app)/traspasos/facturacion/page.tsx";
const BAN = "src/app/(app)/traspasos/facturacion/Bandeja.tsx";
const CSS = "src/app/(app)/traspasos/facturacion/facturacion.css";
const VIEJA = "src/app/(app)/facturacion/page.tsx";
const RGT = "src/app/(app)/traspasos/Registrar.tsx";
const VJ = "src/app/(app)/traspasos/Viajes.tsx";
const COM = "src/app/(app)/traspasos/comunes.tsx";
const original = Object.fromEntries([REG, PAG, BAN, CSS, RGT, VJ, COM, VIEJA].map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => { for (const [f, t] of Object.entries(original)) writeFileSync(f, t) };
process.on("exit", restaurar);
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => { restaurar(); process.exit(130) });

let fallos = 0, total = 0;
function probar(nombre, cambios, espera) {
  total++; restaurar();
  for (const [archivo, de, a] of cambios) {
    const antes = readFileSync(archivo, "utf8");
    if (!antes.includes(de)) { console.log(`  ROTA  ✘  ${nombre}  ← la mutación ya no aplica`); fallos++; return }
    writeFileSync(archivo, antes.replace(de, a));
  }
  let salida;
  try { salida = execFileSync("node", [".arnes/fc-bandeja.mjs"], { encoding: "utf8" }) }
  catch (e) {
    salida = (e.stdout ?? "") + (e.stderr ?? "");
    if (salida.includes(espera)) { console.log(`  ROJA  ✔  ${nombre}`); return }
    console.log(`  OTRA  ✘  ${nombre}  ← se puso rojo, pero por otra cosa`);
    console.log(`           esperaba: «${espera}»`);
    for (const l of salida.split("\n").filter((l) => l.startsWith("✗") || /Error/.test(l)).slice(0, 2))
      console.log(`           salió:    ${l}`);
    fallos++; return;
  }
  console.log(`  VERDE ✘  ${nombre}  ← LA PRUEBA NO CAZA ESTO`); fallos++;
}
console.log("");

probar("Facturación va antes de Registrar",
  [[REG, '      { nombre: "Facturación", ruta: "/traspasos/facturacion" },\n', ""],
   [REG, '      { nombre: "Plan", ruta: "/traspasos/plan" },', '      { nombre: "Plan", ruta: "/traspasos/plan" },\n      { nombre: "Facturación", ruta: "/traspasos/facturacion" },']],
  "entre Registrar y Control");
probar("la dirección vieja se queda en un 404",
  [[VIEJA, 'redirect("/traspasos/facturacion");', 'redirect("/traspasos");']],
  "la dirección vieja /facturacion no manda a la nueva");
probar("la pantalla no pide permiso para confirmar",
  [[PAG, 'puedeConfirmar={permisos.puedeEditar("/traspasos/facturacion")}', "puedeConfirmar={true}"]],
  "no pide el permiso de /traspasos/facturacion");
probar("cualquiera reabre",
  [[PAG, "puedeReabrir={permisos.manda}", "puedeReabrir={true}"]],
  "reabrir no queda solo para quien administra");
probar("Registrar vuelve a pedir la orden de cargue",
  [[RGT, '                : !placa.trim() ? "Falta la placa"\n', '                : !placa.trim() ? "Falta la placa"\n                : !documento.trim() ? "Falta la orden de cargue"\n']],
  "Registrar todavía pide la orden de cargue");
probar("Registrar vuelve a mandar una orden",
  [[RGT, "          p_documento: null,\n", "          p_documento: placa,\n"]],
  "Registrar todavía manda una orden de cargue");
probar("corregir le borra la orden al viaje viejo",
  [[VJ, "p_documento: vacio ? null : v.documento ?? null,", "p_documento: null,"]],
  "se le borra la orden de cargue que tenía");
probar("la lista vuelve a marcar SIN ORDEN DE CARGUE",
  [[COM, "          {/* LO QUE DIJO FACTURACIÓN.", "          {v.sin_documento && <span>SIN ORDEN DE CARGUE</span>}\n          {/* LO QUE DIJO FACTURACIÓN."]],
  "marca «SIN ORDEN DE CARGUE»");
probar("lo que salió se puede corregir y anular en el patio",
  [[VJ, "puedeEditar && v.vale && !v.salida_en ?", "puedeEditar && v.vale ?"]],
  "todavía ofrece Corregir y Anular");
probar("el patio no ve si salió",
  [[COM, '<span className="eti salio"', '<span className="eti"']],
  "no dice si el viaje salió");
probar("arriba no dice cuántos esperan",
  [[BAN, '<><span className="fc-n">{nf.format(pendientes.length)}</span> viaje', "<>Viajes"]],
  "no dice cuántos esperan");
probar("la tarjeta vuelve a la orden de cargue arriba",
  [[BAN, "          <b>{v.placa ?? \"—\"}</b>\n        </p>", "          <b>{v.documento ?? \"—\"}</b>\n        </p>"]],
  "no pone la placa arriba");
probar("un viaje sin orden muestra el rótulo vacío",
  [[BAN, '{v.documento && <p className="fc-placa">Orden de cargue {v.documento}</p>}', '<p className="fc-placa">Orden de cargue {v.documento}</p>']],
  "muestra el rótulo vacío");
probar("el número acepta cualquier cosa",
  [[BAN, '                   inputMode="numeric" maxLength={10} autoComplete="off" spellCheck={false}\n                   placeholder="Hasta 10 cifras"',
         '                   autoComplete="off" spellCheck={false}\n                   placeholder="Hasta 10 cifras"']],
  "no se pide en cifras");
probar("se confirma sin número",
  [[BAN, 'disabled={!numero || mandando}>', "disabled={mandando}>"]],
  "se puede confirmar sin haber puesto el número");
probar("quien no factura ve el campo",
  [[BAN, "      {puede && (\n        <form", "      {true && (\n        <form"]],
  "quien no factura ve el campo");
probar("lo que salió no dice quién confirmó",
  [[BAN, "{v.salida_nombre && <> · confirmó {v.salida_nombre}</>}", ""]],
  "no dice su documento ni quién confirmó");
probar("el botón se sale de la pantalla en el celular",
  [[CSS, ".fc-viaje { grid-template-columns: 1fr }", ".fc-viaje { grid-template-columns: 1fr 380px }"]],
  "fuera de la pantalla");
probar("el error de un viaje en un rojo que no se lee",
  [[CSS, ".fc-error { grid-column: 1 / -1; margin: 0; font-size: 12.5px; font-weight: 700; color: #A30D25 }",
         ".fc-error { grid-column: 1 / -1; margin: 0; font-size: 12.5px; font-weight: 700; color: #F07080 }"]],
  "«error» contrasta");
probar("el campo del número queda chico para el dedo",
  [[CSS, "  min-height: 46px; width: 100%; min-width: 0; padding: 10px 12px;", "  min-height: 30px; width: 100%; min-width: 0; padding: 2px 12px;"]],
  "(mínimo 44)");

restaurar();
console.log("");
if (fallos) { console.log(`${fallos} de ${total} no cazan lo que dicen cazar.`); process.exit(1) }
console.log(`Las ${total} se pusieron rojas. El arnés caza lo que dice cazar.`);
