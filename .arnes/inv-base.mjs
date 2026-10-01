/* =====================================================================
   LA BASE DEL CONTEO — lo que no se ve en pantalla pero decide.

   La pantalla se mide montada, con datos, en `inv-base-nueva.mjs` (y el cruce en
   `inv-base-cruce.mjs`). Aquí quedan las reglas que se comprueban LEYENDO el código:

   1. LOS DOS MONTONES NO SE MEZCLAN. Lo enviado está firmado; los borradores son de quien los
      está caminando. Un renglón a medio contar sumando en un total del que alguien despacha no
      da error, no avisa, y la diferencia aparece semanas después.
   2. EL EXCEL: separador y BOM escritos, y se baja lo que se ve, ordenado igual.
   3. EL ORDEN NO MUTA la lista que vino del servidor.
   4. LA PANTALLA ESTÁ REGISTRADA Y EN EL ORDEN DEL PROCESO, y el permiso se mudó con ella.
   5. LA PUERTA SE COMPRUEBA EN EL SERVIDOR, y «marcar PASADO» y «Eliminar» cada uno con su permiso.
   ===================================================================== */
import { readFileSync } from "node:fs";

const tsx = readFileSync(new URL("../src/app/(app)/inventario/base/Base.tsx", import.meta.url), "utf8");
const pgx = readFileSync(new URL("../src/app/(app)/inventario/base/page.tsx", import.meta.url), "utf8");
const datos = readFileSync(new URL("../src/modulos/inventario/fefo.ts", import.meta.url), "utf8");
const reg = readFileSync(new URL("../src/modulos/registro.ts", import.meta.url), "utf8");
const err = readFileSync(new URL("../src/lib/errores.ts", import.meta.url), "utf8");
const fallas = [];

const limpio = tsx.replace(/\/\*[\s\S]*?\*\//g, "");
const limpioDatos = datos.replace(/\/\*[\s\S]*?\*\//g, "");

/* 1. LOS DOS MONTONES NO SE MEZCLAN. «Lo enviado en una parte y la hoja de borradores de todos,
   sin tocar nada de ellos, solo para ir teniendo la visual, pero no entra dentro de la base de
   datos fija.» */
if (!/enviadas: lineas\.filter\(\(r\) => deEnviados\.has\(r\.conteo_id\)\)/.test(limpioDatos) ||
    !/abiertas: lineas\.filter\(\(r\) => !deEnviados\.has\(r\.conteo_id\)\)/.test(limpioDatos))
  fallas.push("lo enviado y los borradores no se separan por el estado del recorrido: un " +
              "renglón a medio contar acabaría sumando en un total del que alguien despacha");
/* La pestaña de la base lee lo CRUZADO de lo enviado (nunca los abiertos) y la de borradores lo abierto sin cruzar. */
if (!/pestania === "base"\s*\? cruce\.vigentes\.map\(enriquecer\)\s*: abiertas\.map\(/.test(limpio))
  fallas.push("la tabla no lee lo cruzado de lo enviado en una pestaña y lo abierto en la otra: los dos acabarían juntos");
if (!/cruzar\(enviadas\.filter/.test(limpio))
  fallas.push("el cruce no parte de lo ENVIADO: un borrador entraría en la base");
if (/\[\.\.\.enviadas, \.\.\.abiertas\]/.test(limpio))
  fallas.push("la pantalla junta los dos montones en una sola lista");
if (!/const cajas = filas\.reduce/.test(limpio))
  fallas.push("el total de cajas no sale de las filas que se están viendo");

/* 2. EL EXCEL. */
if (!/"sep=;"/.test(limpio))
  fallas.push("el CSV no dice el separador: Excel en español apilaría las columnas en la A");
/* SE BUSCA EN EL CÓDIGO, NO EN LOS COMENTARIOS: una versión de esta comprobación se daba por
   satisfecha con un comentario que mencionaba el BOM. */
if (!/new Blob\(\["\\uFEFF"/.test(limpio))
  fallas.push("el CSV va sin BOM: «Águila» se abriría como «Ãguila»");
if (!/bajar\(filas,/.test(limpio))
  fallas.push("el Excel no baja lo filtrado");

/* 3. EL ORDEN NO MUTA LA LISTA QUE VINO DEL SERVIDOR (`sort` muta). */
if (!/return \[\.\.\.vistas\]\.sort/.test(limpio))
  fallas.push("se ordena mutando la lista que vino del servidor");

/* 8. LA PANTALLA ESTÁ REGISTRADA Y EN EL ORDEN DEL PROCESO.
   Se mantiene el maestro, se camina la bodega, queda el registro, y
   sobre ese registro se decide. La base va ANTES que el tablero porque
   el tablero SALE de ella. */
{
  const bloque = (reg.match(/id: "inventario"[\s\S]*?\n  \},/) ?? [""])[0];
  /* SOLO LAS SECCIONES. Desde que Inventario tiene ramas, cada rama
     trae su propia `ruta:` y el patrón las contaba como pantallas: el
     arnés fallaba diciendo que sobraban tres, que era su propio error
     de lectura y no un error del menú. */
  const secciones = (bloque.match(/secciones: \[[\s\S]*$/) ?? [""])[0];
  const rutas = [...secciones.matchAll(/ruta: "(\/inventario[^"]*)"/g)].map((m) => m[1]);
  /* AVERÍAS VA AL FINAL, y su análisis detrás. Es el mismo orden del
     proceso: se mantiene el maestro, se cuenta, queda el registro, se
     decide qué sale primero — y lo que se dañó y no va a salir nunca se
     aparta al final. Mientras no tenga documento de baja sigue contando
     en «La base», que es la diferencia que descuadra un conteo. */
  /* Desde el pedido «organicemos esto de acuerdo al flujo»: orden pedido: corte → fiscal → contar → base → tablero → maestro → recepción. */
  const debe = ["/inventario/corte", "/inventario/fiscal", "/inventario/conteo",
                "/inventario/base", "/inventario/tablero", "/inventario/maestro", "/inventario/recibir",
                "/inventario/averias", "/inventario/averias/tablero",
                "/inventario/averias/analisis", "/inventario/averias/maestro"];
  /* Y VAN EN DOS RAMAS, no en una lista de ocho. Comparten tema —lo
     que hay en la bodega— y no comparten cifras: los conteos miden
     EXISTENCIAS y las averías lo que ya no se puede vender. Con las
     ocho juntas, «Maestro» salía dos veces queriendo decir cosas
     distintas. */
  const conRama = [...secciones.matchAll(/ruta: "(\/inventario[^"]*)", rama: "(\w+)"/g)]
    .map((m) => m[2]);
  if (conRama.length !== rutas.length)
    fallas.push(`${rutas.length - conRama.length} pantallas de Inventario sin rama: el menú las pone todas juntas`);
  if (new Set(conRama).size !== 2)
    fallas.push(`Inventario tiene ${new Set(conRama).size} ramas y deben ser dos: conteos y averías`);
  if (rutas.join("|") !== debe.join("|"))
    fallas.push(`las pantallas de Inventario salen [${rutas.join(", ")}] y deben salir ` +
                `[${debe.join(", ")}]: la base va antes que el tablero porque el tablero ` +
                "sale de ella");

  /* NINGUNA SECCIÓN PUEDE VIVIR EN LA RUTA DEL MÓDULO. Es EL error que
     dejó a Inventario sin bifurcación: el tablero de FEFO ocupaba
     /inventario, así que entrar al módulo era entrar ya a Conteos y no
     había dónde escoger —«le doy a conteos y no me sale nada»—.
     `ramaDeRuta` devuelve undefined en la ruta del módulo A PROPÓSITO:
     estando parado ahí el riel tiene que mostrar las ramas. Una sección
     ahí no da error, no avisa: se ve una pantalla cualquiera donde
     debería estar la portada.

     Y APLICA A CUALQUIER MÓDULO CON RAMAS, no solo a Inventario: es la
     misma trampa para el siguiente que se parta en dos. */
  for (const m of [...reg.matchAll(/id: "(\w+)",\n(?:.|\n)*?\n  \},/g)]) {
    const txt = m[0];
    if (!/ramas: \[/.test(txt)) continue;
    const suya = (txt.match(/\n    ruta: "([^"]+)"/) ?? [])[1];
    const secs = (txt.match(/secciones: \[[\s\S]*$/) ?? [""])[0];
    if (!suya) continue;
    if (new RegExp(`ruta: "${suya}",`).test(secs))
      fallas.push(`el módulo ${m[1]} tiene una sección en su propia ruta (${suya}): ` +
                  "esa dirección es la bifurcación y con una pantalla encima no hay dónde escoger");
  }

  /* Y LA RAMA TAMPOCO ENTRA POR LA RUTA DEL MÓDULO: una tarjeta que
     apunta a la pantalla donde está la tarjeta es un botón que no lleva
     a ningún lado. */
  {
    const bloqueRamas = (bloque.match(/ramas: \[[\s\S]*?\n    \],/) ?? [""])[0];
    const rutasRama = [...bloqueRamas.matchAll(/ruta: "([^"]+)"/g)].map((x) => x[1]);
    if (rutasRama.includes("/inventario"))
      fallas.push("una rama de Inventario entra por /inventario, que es la portada: " +
                  "la tarjeta se devuelve a sí misma");
    if (rutasRama.join("|") !== "/inventario/tablero|/inventario/averias")
      fallas.push(`las ramas de Inventario entran por [${rutasRama.join(", ")}] y deben ` +
                  "entrar por [/inventario/tablero, /inventario/averias]");
  }
}

/* =====================================================================
   8b. EL PERMISO SE MUDÓ CON LA PANTALLA

   En este proyecto los permisos se guardan como EL TEXTO DE LA
   DIRECCIÓN. Mover el tablero de /inventario a /inventario/tablero deja
   las filas viejas apuntando a algo que ya no existe y la persona pierde
   la pantalla EN SILENCIO: no da error, deja de verse. Es el mismo
   motivo por el que las pantallas de Roturas no se movieron al meterlas
   en Quiebra.

   Así que la migración que muda el permiso tiene que existir, y tiene
   que copiar LOS DOS sitios donde vive: el rol y la persona.
   ===================================================================== */
{
  let sql = "";
  try {
    sql = readFileSync(new URL("../supabase/migraciones/2026-09-inventario-portada.sql",
                               import.meta.url), "utf8");
  } catch { /* no está */ }

  if (!sql)
    fallas.push("el tablero cambió de dirección y no hay migración que mude el permiso: " +
                "quien podía verlo lo pierde en silencio");
  else {
    /* SE MIRA LA SENTENCIA QUE HACE EL TRABAJO, no «que la ruta aparezca
       en algún sitio del archivo». La primera versión de estas dos
       aserciones preguntaba eso —`/rol_permisos[\s\S]*\/inventario\/tablero/`—
       y las dos mutaciones volvieron VERDES: el `raise notice` del final
       nombra las dos cosas, así que el archivo seguía «conteniéndolas»
       con el insert roto. La distancia va acotada para que el bloque de
       abajo no pueda volver a rescatar a un insert de arriba. */
    if (!/insert\s+into\s+public\.rol_permisos[\s\S]{0,300}'\/inventario\/tablero'/i.test(sql))
      fallas.push("la migración no copia el permiso del ROL a /inventario/tablero");
    if (!/update\s+public\.perfiles[\s\S]{0,300}jsonb_build_object\('\/inventario\/tablero'/i.test(sql))
      fallas.push("la migración no copia los permisos SUELTOS de cada persona: " +
                  "el de portería que además miraba el tablero lo pierde");
    /* NO BORRA /inventario: sigue siendo la ruta del módulo y es lo que
       decide si Inventario aparece en el menú. Borrarla dejaría a
       alguien con el tablero abierto y sin puerta por donde llegar. */
    if (/delete\s+from\s+public\.rol_permisos/i.test(sql))
      fallas.push("la migración BORRA el permiso de /inventario: esa ruta es la portada " +
                  "del módulo y sin ella el módulo desaparece del menú");
  }
}

/* 5. LA PUERTA, EN EL SERVIDOR: una pantalla escondida del menú se alcanza igual escribiendo la dirección. */
if (!/permisos\.puedeVer\("\/inventario\/base"\)/.test(pgx))
  fallas.push("la página no comprueba el permiso: escribiendo la dirección se entraría igual");
/* MARCAR PASADO: quien edita «La base» o administra. ELIMINAR: SOLO quien administra (el «super admin»). */
if (!/puedeMarcar=\{permisos\.manda \|\| permisos\.puedeEditar\("\/inventario\/base"\)\}/.test(pgx))
  fallas.push("la página no decide «puede marcar» con el permiso de editar La base (o administrar)");
if (!/manda=\{permisos\.manda\}/.test(pgx))
  fallas.push("la página no pasa si administra: «Eliminar» saldría a quien no debe");
if (!/\{manda && admin && \(/.test(limpio) || !/<EliminarFefos/.test(limpio) || !/<QuitarRenglones/.test(limpio))
  fallas.push("«Eliminar» no está detrás de manda: lo vería quien no administra");
if (/<EliminarFefos[^>]*\/>/.test(limpio) && !/manda && admin/.test(limpio))
  fallas.push("EliminarFefos se monta sin comprobar que administra");
/* Y la traducción del error de la base: sin ella dice «function … does not exist» sin decir qué archivo correr. */
if (!/conteo_fefo_marcar_pasado\\b\|\\bconteo_lineas_pasadas/.test(err) || !/2026-10-base-pasados\.sql/.test(err))
  fallas.push("falta traducir el error de «marcar PASADO» a «corre 2026-10-base-pasados.sql»");

console.log("");
if (fallas.length) { fallas.forEach((f) => console.log("✗ " + f)); process.exit(1) }
console.log("✓ La base (lectura de código): los dos montones no se mezclan, el Excel lleva separador y BOM, " +
            "el menú va en el orden del proceso, el permiso se mudó y «Eliminar» solo es de quien administra.");
