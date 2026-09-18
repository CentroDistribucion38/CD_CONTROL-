/* =====================================================================
   ARMA EL ARCHIVO ÚNICO CON LAS MIGRACIONES PENDIENTES

   POR QUÉ SE GENERA Y NO SE ESCRIBE A MANO. Un archivo pegado a mano se
   queda viejo en silencio: se corrige una migración y el «todo en uno»
   sigue trayendo la versión de ayer, que es peor que no tenerlo. Esto lo
   arma desde los archivos de verdad, cada vez.

   EL ORDEN ES EL DE LAS DEPENDENCIAS, no el alfabético:

     1. inventario-base ........ el permiso de /inventario/base
     2. documento-diez ......... el documento del viaje a 10 dígitos
     3. dia-cerrado ............ el candado del día anterior
     4. cruce-permiso .......... el permiso de /traspasos/cruce
     5. varios-tipos ........... varios tipos por viaje; reescribe la
                                 vista de control
     6. sap-movimientos ........ el corte de SAP, con su tabla, su
                                 función de importar y sus vistas

   2026-09-traspasos-cruce-sap.sql NO VA AQUÍ, Y ES A PROPÓSITO.

   Esa migración creaba la tabla del corte AGRUPADA por documento, y la
   de movimientos la sustituye entera: crea lo suyo, se trae lo que
   hubiera en la vieja y la jubila. Metiendo las dos en el mismo archivo,
   la SEGUNDA vuelta reventaba —«cannot change return type of existing
   function»— y, peor, volvía a crear la tabla vieja vacía para que la de
   movimientos intentara jubilarla otra vez encima de la jubilada. Lo
   cazó el segundo pase del arnés, que existe justamente para eso.

   Quien ya corrió cruce-sap no pierde nada: sus documentos se traen. Y
   quien no la corrió nunca tampoco: la de movimientos no la necesita.

   Y EL EDITOR DE SUPABASE NO CORRE ESTO COMO UNA SOLA TRANSACCIÓN: parte
   el archivo contando los `$$`. Por eso se comprueba que ninguno quede
   dentro de un comentario —el editor los contaría igual y partiría una
   función por la mitad— y por eso al final va un bloque que dice qué
   quedó puesto: si algo se cayó a mitad de camino, el resto siguió
   corriendo y hay que poder verlo.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";

const U = (p) => new URL(p, import.meta.url);

const PASOS = [
  ["2026-09-inventario-base",           "La base del conteo: permiso de /inventario/base"],
  ["2026-09-traspasos-documento-diez",  "El documento del viaje: máximo 10 dígitos"],
  ["2026-09-traspasos-dia-cerrado",     "El día cerrado: registrar y anular atrasado solo el admin"],
  ["2026-09-traspasos-cruce-permiso",   "El permiso de /traspasos/cruce (la pantalla Importar)"],
  ["2026-09-traspasos-varios-tipos",    "Varios tipos por viaje (reescribe la vista de control)"],
  ["2026-09-traspasos-sap-movimientos",  "El corte de SAP, movimiento por movimiento"],
];

const raya = (t) =>
  "-- =====================================================================\n"
+ `-- ${t}\n`
+ "-- =====================================================================\n";

let salida = `-- =====================================================================
-- CONTROL · TODO LO QUE FALTA CORRER, EN UN SOLO ARCHIVO
--
-- Se pega entero en el SQL Editor de Supabase y se le da Run UNA vez.
-- Las ${PASOS.length} migraciones van en el orden de sus dependencias, y todas se
-- pueden correr varias veces sin romper nada: si alguna ya estaba
-- puesta, simplemente no cambia nada.
--
-- AL FINAL SALE UN RESUMEN con lo que quedó. Si algo falla a mitad de
-- camino, el editor SIGUE con lo que viene detrás —no es una sola
-- transacción—, así que ese resumen es lo que dice de verdad qué hay.
-- =====================================================================

`;

const fuentes = [];
for (const [archivo, titulo] of PASOS) {
  const ruta = U(`../supabase/migraciones/${archivo}.sql`);
  const sql = readFileSync(ruta, "utf8");

  /* EL `$$` DENTRO DE UN COMENTARIO PARTE EL ARCHIVO. El editor de
     Supabase cuenta esos signos para saber dónde empieza y acaba el
     cuerpo de una función, y no le importa que estén comentados: una
     función se corta por la mitad y el error que sale no señala el
     comentario. */
  const comentarios = [...sql.matchAll(/\/\*[\s\S]*?\*\/|--[^\n]*/g)].map((m) => m[0]);
  const malo = comentarios.find((c) => c.includes("$$"));
  if (malo) {
    console.error(`${archivo}: hay un «$$» dentro de un comentario, y el editor de `
      + `Supabase parte el archivo por ahí:\n  ${malo.slice(0, 120)}`);
    process.exit(1);
  }

  fuentes.push([archivo, sql]);
  salida += raya(`${PASOS.findIndex((p) => p[0] === archivo) + 1} de ${PASOS.length} · ${titulo}`)
          + `-- archivo: supabase/migraciones/${archivo}.sql\n\n`
          + sql.trimEnd() + "\n\n\n";
}

/* ── EL RESUMEN FINAL ───────────────────────────────────────────────
   No repite los `raise notice` de cada migración: dice, en una sola
   lectura, qué objetos existen AHORA. Es lo único que contesta «¿corrió
   todo?» cuando el editor soltó cincuenta líneas de avisos. */
salida += raya(`${PASOS.length + 1} de ${PASOS.length + 1} · QUÉ QUEDÓ PUESTO`);
salida += `do $$
declare
  v_falta text := '';
begin
  /* LA TABLA traspasos_sap YA NO SE COMPRUEBA: el paso 7 la jubila
     como traspasos_sap_viejo y el corte vive ahora en
     traspasos_sap_mov. Buscarla aquí hacía que el resumen se quejara
     de que falta justo lo que acaba de cambiar de nombre a propósito —
     y lo cazó él solo. */
  if to_regclass('public.v_traspasos_cruce') is null then
    v_falta := v_falta || ' · la vista del cruce'; end if;
  if to_regclass('public.v_traspasos_sap_importaciones') is null then
    v_falta := v_falta || ' · la vista de importaciones anteriores'; end if;
  if to_regclass('public.traspasos_sap_mov') is null then
    v_falta := v_falta || ' · la tabla de movimientos del corte'; end if;
  if to_regclass('public.v_traspasos_sap') is null then
    v_falta := v_falta || ' · la vista que agrupa los movimientos en documentos'; end if;
  if to_regprocedure('public.traspaso_sap_importar(jsonb)') is null then
    v_falta := v_falta || ' · la función de importar el corte'; end if;
  if to_regprocedure('public.traspaso_dia_abierto(date, timestamptz)') is null then
    v_falta := v_falta || ' · el candado del día'; end if;
  if to_regclass('public.traspasos_viaje_tipos') is null then
    v_falta := v_falta || ' · los tipos por viaje'; end if;
  if to_regprocedure('public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text)') is null then
    v_falta := v_falta || ' · la función de registrar con varios tipos'; end if;
  if not exists (select 1 from public.rol_permisos where seccion = '/traspasos/cruce') then
    v_falta := v_falta || ' · el permiso de /traspasos/cruce (nadie vería Importar)'; end if;
  if not exists (select 1 from public.rol_permisos where seccion = '/inventario/base') then
    v_falta := v_falta || ' · el permiso de /inventario/base'; end if;

  if v_falta <> '' then
    raise exception 'NO QUEDÓ TODO. Falta:%  — vuelve a correr el archivo y mira el primer ERROR de arriba.', v_falta;
  end if;

  raise notice ' ';
  raise notice 'LISTO. Quedaron puestas las ${PASOS.length} migraciones.';
  raise notice '  · La base del conteo y su permiso.';
  raise notice '  · El documento del viaje a 10 dígitos.';
  raise notice '  · El día cerrado: registrar o anular de días anteriores solo el super administrador.';
  raise notice '  · El corte de SAP, el cruce y las importaciones anteriores.';
  raise notice '  · El permiso de la pantalla Importar.';
  raise notice '  · Varios tipos por viaje.';
  raise notice '  · El corte de SAP guardado movimiento por movimiento: un documento se agrupa';
  raise notice '    sobre TODO lo importado, así que -36 el lunes y +36 el martes ya dan cero.';
  raise notice ' ';
  raise notice 'Ahora en Administración -> Roles hay que marcar quién ve «Importar» y «La base».';
end $$;
`;

const destino = U("../supabase/migraciones/PENDIENTES-todo-en-uno.sql");
writeFileSync(destino, salida);

console.log(`Armado: supabase/migraciones/PENDIENTES-todo-en-uno.sql`);
console.log(`  ${PASOS.length} migraciones · ${salida.length.toLocaleString("es-CO")} caracteres`);
for (const [a, s] of fuentes) console.log(`  · ${a} (${s.length.toLocaleString("es-CO")})`);
