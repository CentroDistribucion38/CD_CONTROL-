/**
 * USUARIOS DE A VARIOS — y eliminar de verdad.
 *
 * POST { accion, ... }
 *   crear       { rol, personas: [{ nombre, usuario }] }  crea cada una con
 *               su clave provisional, en el mismo rol; devuelve una fila por
 *               persona, con su clave o con por qué no se creó.
 *   rol         { ids, rol }        les cambia el rol a todos.
 *   activar     { ids }             les devuelve la entrada.
 *   desactivar  { ids }             les quita la entrada: el perfil queda
 *                                   inactivo Y la cuenta bloqueada, para que
 *                                   una sesión vieja no siga entrando.
 *   eliminar    { ids }             quien NO ha dejado ningún registro se
 *                                   borra del todo; quien sí, se desactiva
 *                                   —borrarlo dejaría viajes y firmas sin
 *                                   saber de quién—. Se dice cuál fue cuál.
 *
 * El orden de siempre: sesión → que administre → recién ahí la llave.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { anotar } from "@/lib/historial";
import { misPermisos } from "@/lib/permisos";
import { normalizarUsuario } from "@/lib/auth";
import { crearCuenta } from "@/lib/cuentas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX = 50;
/** Cien años: Supabase no tiene «para siempre»; esto es lo mismo. */
const BLOQUEO = "876000h";

const esId = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const permisos = await misPermisos();
  if (!permisos.manda) {
    return NextResponse.json({ error: "Esto requiere un rol que administre la plataforma." }, { status: 403 });
  }
  const admin = clienteDeServicio();
  if (!admin) {
    return NextResponse.json({ error: "Falta la variable SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  }

  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const accion = String(b.accion ?? "");

  /* ---------------- CREAR VARIOS ---------------- */
  if (accion === "crear") {
    const rol = String(b.rol ?? "").trim();
    const personas = (Array.isArray(b.personas) ? b.personas : []) as { nombre?: string; usuario?: string }[];
    if (!rol) return NextResponse.json({ error: "Falta el rol." }, { status: 400 });
    if (personas.length === 0) return NextResponse.json({ error: "No llegó ninguna persona." }, { status: 400 });
    if (personas.length > MAX) {
      return NextResponse.json({ error: `Son ${personas.length}: de a ${MAX} como máximo por vez.` }, { status: 400 });
    }
    /* De a una y en orden: si dos del lote piden el mismo usuario, la
       segunda se entera de que ya está tomado en vez de chocar a la vez. */
    const resultados = [];
    for (const p of personas) {
      const nombre = String(p.nombre ?? "").trim();
      const usuario = normalizarUsuario(String(p.usuario ?? ""));
      if (nombre.length < 3 || usuario.length < 3) {
        resultados.push({ nombre, usuario, ok: false, error: "Nombre o usuario demasiado cortos." });
        continue;
      }
      const r = await crearCuenta(supabase, admin, { nombre, usuario, rol, extra: {} });
      resultados.push(r.ok ? { nombre, usuario: r.usuario, ok: true, clave: r.clave }
                           : { nombre, usuario, ok: false, error: r.error });
    }
    await anotar(admin, user.id, resultados.filter((r) => r.ok).map((r) => ({ nombre: r.nombre, usuario: r.usuario, accion: "creado" as const, detalle: { rol, lote: true } })));
    return NextResponse.json({ resultados });
  }

  const ids: string[] = (Array.isArray(b.ids) ? (b.ids as unknown[]) : []).filter(esId);
  if (ids.length === 0) return NextResponse.json({ error: "No escogiste a nadie." }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ error: "Demasiados a la vez." }, { status: 400 });

  /* ---------------- ROL, ACTIVAR, DESACTIVAR ---------------- */
  if (accion === "rol" || accion === "activar" || accion === "desactivar") {
    const { data, error } = await supabase.rpc("usuarios_lote", {
      p_ids: ids, p_accion: accion, p_rol: accion === "rol" ? String(b.rol ?? "") : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    /* La entrada, en la cuenta: sin esto un desactivado con la sesión
       abierta seguiría adentro hasta que se le venciera. */
    let sinBloqueo = 0;
    if (accion !== "rol") {
      for (const id of ids) {
        const { error: e } = await admin.auth.admin.updateUserById(id, { ban_duration: accion === "desactivar" ? BLOQUEO : "none" });
        if (e) sinBloqueo++;
      }
    }
    return NextResponse.json({ cambiados: Number(data ?? 0), sinBloqueo });
  }

  /* ---------------- ELIMINAR ---------------- */
  if (accion === "eliminar") {
    if (ids.includes(user.id)) {
      return NextResponse.json({ error: "Tú estás en la selección: no te puedes eliminar a ti mismo." }, { status: 400 });
    }
    const { data: rastro, error: eR } = await supabase.rpc("usuarios_rastro", { p_ids: ids });
    if (eR) return NextResponse.json({ error: eR.message }, { status: 400 });
    const cuantos = new Map<string, number>(((rastro ?? []) as { id: string; registros: number }[]).map((r) => [r.id, Number(r.registros)]));
    const { data: gente } = await supabase.from("perfiles").select("id, nombre, usuario").in("id", ids);
    const nombre = new Map(((gente ?? []) as { id: string; nombre: string | null; usuario: string | null }[]).map((g) => [g.id, g.nombre || g.usuario || g.id]));

    const conRastro = ids.filter((id) => (cuantos.get(id) ?? 0) > 0);
    const limpios = ids.filter((id) => (cuantos.get(id) ?? 0) === 0);
    const resultados: { id: string; nombre: string; hecho: "eliminado" | "desactivado" | "error"; registros: number; error?: string }[] = [];

    if (conRastro.length) {
      const { error } = await supabase.rpc("usuarios_lote", { p_ids: conRastro, p_accion: "desactivar", p_rol: null });
      for (const id of conRastro) {
        if (!error) await admin.auth.admin.updateUserById(id, { ban_duration: BLOQUEO });
        resultados.push({ id, nombre: nombre.get(id) ?? id, registros: cuantos.get(id) ?? 0,
          hecho: error ? "error" : "desactivado", error: error?.message });
      }
    }
    for (const id of limpios) {
      const { error } = await admin.auth.admin.deleteUser(id);
      resultados.push({ id, nombre: nombre.get(id) ?? id, registros: 0,
        hecho: error ? "error" : "eliminado",
        error: error ? (/administre|administra/i.test(error.message) ? error.message : `No se pudo eliminar: ${error.message}`) : undefined });
    }
    /* Los desactivados por tener registros ya los anotó usuarios_lote. */
    const usuarioDe = new Map(((gente ?? []) as { id: string; usuario: string | null }[]).map((g) => [g.id, g.usuario]));
    await anotar(admin, user.id, resultados.filter((r) => r.hecho === "eliminado")
      .map((r) => ({ a_quien: r.id, nombre: r.nombre, usuario: usuarioDe.get(r.id) ?? null, accion: "eliminado" as const })));
    return NextResponse.json({ resultados });
  }

  return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
}
