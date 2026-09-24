/* Los mensajes reales que devuelven PostgREST y Postgres, para que la
   traducción no se pruebe con textos inventados. */
const casos = [
  ["Could not find the 'tema' column of 'perfiles' in the schema cache", "columna tema"],
  ["Could not find the 'texto_grande' column of 'perfiles' in the schema cache", "columna texto_grande"],
  ['new row for relation "perfiles" violates check constraint "perfiles_tema_valido"', "tema no permitido"],
  ["new row violates row-level security policy for table \"perfiles\"", "sin permiso"],
  ["Solo el administrador puede cambiar usuario, rol, bodega o estado.", "tal cual"],
];
function traducir(mensaje) {
  const m = mensaje.toLowerCase();
  if (m.includes("column") || m.includes("schema cache")) {
    const cual = mensaje.match(/'([a-z_]+)' column/i)?.[1];
    return `Falta la columna ${cual ? `«${cual}» ` : ""}del perfil en Supabase. Abre el SQL Editor y ejecuta supabase/01-perfil.sql. Se puede correr varias veces sin romper nada.`;
  }
  if (m.includes("perfiles_tema_valido"))
    return "Ese tema todavía no está permitido en la base. Abre el SQL Editor y ejecuta supabase/migraciones/2026-09-temas-gris.sql.";
  if (m.includes("row-level security") || m.includes("permission"))
    return "No tienes permiso para cambiar esos datos.";
  return mensaje;
}
for (const [crudo, que] of casos) console.log(`[${que}]\n  ${traducir(crudo)}\n`);
