/**
 * Login por USUARIO, no por correo.
 *
 * Supabase Auth exige un correo internamente, así que CONTROL le arma uno
 * sintético a partir del usuario: "jperez" → "jperez@cdcontrol.local".
 * Ese correo nunca se muestra ni recibe nada; el usuario solo conoce su
 * nombre de usuario.
 *
 * OJO: el dominio debe tener un TLD público válido. Supabase rechaza cosas
 * como ".local" o ".invalid". No hace falta que el dominio sea tuyo ni que
 * exista buzón: con «Confirm email» apagado nunca se envía ningún correo.
 * Este es el único lugar donde se define.
 */
export const DOMINIO_INTERNO = "cdcontrol.co";

/** Minúsculas, sin espacios, solo letras, números, punto, guion y guion bajo. */
export function normalizarUsuario(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/**
 * Acepta las dos formas: "admin" o "admin@cdcontrol.co".
 * Si ya viene un correo completo se respeta tal cual.
 */
export function correoDeUsuario(valor: string): string {
  const limpio = valor.trim().toLowerCase();
  if (limpio.includes("@")) return limpio;
  return `${normalizarUsuario(limpio)}@${DOMINIO_INTERNO}`;
}

export function usuarioDeCorreo(correo: string | null | undefined): string {
  if (!correo) return "";
  return correo.split("@")[0];
}

export const USUARIO_PATRON = "[a-zA-Z0-9._@-]{3,60}";
