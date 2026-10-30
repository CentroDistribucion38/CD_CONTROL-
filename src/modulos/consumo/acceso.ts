/**
 * LA PUERTA DEL PANEL PRIVADO DE CONSUMO.
 *
 * Tres llaves, y las tres tienen que girar:
 *   1. Haber entrado a CONTROL (sesión).
 *   2. Ser uno de los usuarios de CONSUMO_USUARIO (el id o el correo de la cuenta).
 *   3. Escribir el código de CONSUMO_CODIGO. Al acertar se deja una cookie firmada de 30 minutos.
 *
 * NADA de esto vive en la base ni en los permisos: ni en roles, ni en el menú, ni en el «Uso» de
 * Administración. Por eso un administrador, por «super» que sea, no tiene dónde verlo; y a cualquiera
 * que no sea el dueño la dirección le responde «no existe» (404), igual que una dirección inventada.
 *
 * Si falta alguna de las dos variables, la puerta queda cerrada para todos.
 */
import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { usuarioActual } from "@/lib/sesion";

const COOKIE = "__ci";
export const VIDA_S = 30 * 60;

export async function dueno(): Promise<{ ok: boolean; id: string }> {
  const lista = (process.env.CONSUMO_USUARIO ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!lista.length || !process.env.CONSUMO_CODIGO) return { ok: false, id: "" };
  const u = await usuarioActual();
  if (!u) return { ok: false, id: "" };
  const ok = lista.includes(u.id.toLowerCase()) || (!!u.email && lista.includes(u.email.toLowerCase()));
  return { ok, id: u.id };
}

const firma = (id: string, exp: number) =>
  createHmac("sha256", process.env.CONSUMO_CODIGO ?? "").update(`${id}.${exp}`).digest("hex");

const igual = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest(), y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

export const codigoCorrecto = (txt: string) => !!process.env.CONSUMO_CODIGO && igual(txt.trim(), process.env.CONSUMO_CODIGO.trim());

export async function abierto(id: string): Promise<boolean> {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return false;
  const [exp, f] = c.split(".");
  const n = Number(exp);
  if (!n || !f || n < Date.now()) return false;
  return igual(f, firma(id, n));
}

export async function abrir(id: string) {
  const exp = Date.now() + VIDA_S * 1000;
  (await cookies()).set(COOKIE, `${exp}.${firma(id, exp)}`, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/interno", maxAge: VIDA_S,
  });
}

export async function cerrar() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/interno", maxAge: 0 });
}
