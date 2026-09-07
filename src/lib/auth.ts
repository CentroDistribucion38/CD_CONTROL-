/**
 * Login por USUARIO, no por correo.
 *
 * Supabase Auth exige un correo internamente, así que CONTROL le arma uno
 * sintético a partir del usuario: "jperez" → "jperez@cdcontrol.co".
 * Ese correo nunca se muestra ni recibe nada; el usuario solo conoce su
 * nombre de usuario.
 *
 * OJO: el dominio debe tener un TLD publico valido — Supabase rechaza ".local".
 * No hace falta que el dominio sea tuyo: con «Confirm email» apagado no se envia nada.
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

export function correoDeUsuario(usuario: string): string {
  return `${normalizarUsuario(usuario)}@${DOMINIO_INTERNO}`;
}

export function usuarioDeCorreo(correo: string | null | undefined): string {
  if (!correo) return "";
  return correo.split("@")[0];
}

export const USUARIO_PATRON = "[a-zA-Z0-9._-]{3,30}";
