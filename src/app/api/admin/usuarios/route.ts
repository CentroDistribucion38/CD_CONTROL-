/**
 * CREAR UN USUARIO.
 *
 * Va en el servidor y no en la pantalla porque crear una cuenta toca
 * auth.users, y a eso solo llega la llave de servicio. Esa llave nunca
 * puede bajar al navegador.
 *
 * EL ORDEN DE LOS PASOS ES LA SEGURIDAD, no un detalle:
 *
 *   1. quién pide      se lee la sesión de la cookie
 *   2. puede hacerlo   se comprueba que su rol administre la plataforma
 *   3. recién ahí      se usa la llave de servicio
 *
 * Si el paso 2 faltara, esta ruta sería una puerta para que cualquiera
 * con sesión —un operador— se cree un usuario administrador. La llave de
 * servicio se salta el RLS, así que aquí no hay nada debajo que lo
 * frene: la comprobación de arriba ES el control.
 *
 * LA CLAVE la genera la plataforma con crypto.randomInt, no con
 * Math.random: Math.random es predecible y una clave predecible no es
 * una clave. Sale una sola vez, en la respuesta, para que el
 * administrador la dicte; no se guarda en ninguna tabla nuestra.
 *
 * Y nace marcada como PROVISIONAL: mientras lo esté, la aplicación no
 * deja entrar a ningún módulo hasta que la persona la cambie.
 */

import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { misPermisos } from "@/lib/permisos";
import { correoDeUsuario, normalizarUsuario } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Cuántos dígitos tiene la clave que sugiere la plataforma. */
const DIGITOS = 4;

/**
 * Una clave de DIGITOS dígitos, uniforme y sin sesgo.
 * randomInt(min, max) del módulo crypto: no es Math.random, y el rango
 * se pide completo para que el 0 inicial no se pierda ("0417" es una
 * clave válida y descartarla quitaría mil combinaciones de diez mil).
 */
function claveSugerida(): string {
  const tope = 10 ** DIGITOS;
  return String(randomInt(0, tope)).padStart(DIGITOS, "0");
}

export async function POST(req: Request) {
  /* ---------- 1 y 2 · quién pide, y si puede ---------- */
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  }
  const permisos = await misPermisos();
  if (!permisos.manda) {
    return NextResponse.json(
      { error: "Crear usuarios requiere un rol que administre la plataforma." },
      { status: 403 }
    );
  }

  /* ---------- 3 · la llave ---------- */
  const admin = clienteDeServicio();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Falta la variable SUPABASE_SERVICE_ROLE_KEY en el servidor. " +
          "Se pone en Vercel → Settings → Environment Variables (y en .env.local " +
          "para trabajar en local). Sin ella no se pueden crear cuentas.",
      },
      { status: 503 }
    );
  }

  /* ---------- Lo que llegó ---------- */
  let cuerpo: {
    nombre?: string; usuario?: string; rol?: string;
    permisos_extra?: Record<string, string>;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "No llegó nada que crear." }, { status: 400 });
  }

  const nombre = (cuerpo.nombre ?? "").trim();
  const usuario = normalizarUsuario(cuerpo.usuario ?? "");
  const rol = (cuerpo.rol ?? "").trim();
  const extra = cuerpo.permisos_extra ?? {};

  if (nombre.length < 3) {
    return NextResponse.json({ error: "El nombre no puede quedar en blanco." }, { status: 400 });
  }
  if (usuario.length < 3) {
    return NextResponse.json(
      { error: "El usuario necesita al menos tres caracteres: letras, números, punto, guion." },
      { status: 400 }
    );
  }
  if (!rol) {
    return NextResponse.json({ error: "Falta decir con qué rol entra." }, { status: 400 });
  }

  /* El rol tiene que existir. Si no se comprobara, un rol mal escrito
     crearía una persona que no puede ver ninguna pantalla y nadie
     sabría por qué. */
  const { data: elRol } = await supabase
    .from("roles").select("clave").eq("clave", rol).maybeSingle();
  if (!elRol) {
    return NextResponse.json({ error: `El rol "${rol}" no existe.` }, { status: 400 });
  }

  /* Los permisos extra tienen que ser rutas reales y niveles reales: sin
     esto, un typo deja un permiso que no aplica a nada y parece dado. */
  for (const [ruta, nivel] of Object.entries(extra)) {
    if (nivel !== "ver" && nivel !== "editar") {
      return NextResponse.json({ error: `Nivel inválido en ${ruta}.` }, { status: 400 });
    }
  }

  /* ¿Está libre el usuario? Se pregunta antes para poder decirlo claro;
     de todas formas la creación fallaría abajo, pero con un error de
     Supabase que no le sirve a nadie. */
  const { data: libre } = await supabase.rpc("usuario_libre", { p_usuario: usuario });
  if (libre === false) {
    return NextResponse.json(
      { error: `El usuario "${usuario}" ya está tomado.` },
      { status: 409 }
    );
  }

  /* ---------- Crear la cuenta ---------- */
  const clave = claveSugerida();
  const { data: creada, error: eAuth } = await admin.auth.admin.createUser({
    email: correoDeUsuario(usuario),
    password: clave,
    /* Confirmado de entrada: CONTROL entra por usuario y el correo es
       sintético —no existe buzón—, así que esperar una confirmación
       dejaría la cuenta sin poder entrar para siempre. */
    email_confirm: true,
  });

  if (eAuth || !creada?.user) {
    const m = (eAuth?.message ?? "").toLowerCase();
    return NextResponse.json(
      {
        error: m.includes("already")
          ? `Ese usuario ya tiene cuenta en Supabase.`
          : `No se pudo crear la cuenta: ${eAuth?.message ?? "error desconocido"}`,
      },
      { status: 400 }
    );
  }

  /* ---------- El perfil ----------
     El disparador de 00-nucleo.sql ya crea una fila de perfil cuando
     nace la cuenta, así que esto ACTUALIZA en vez de insertar. Se hace
     con la llave de servicio porque el disparador de columnas
     protegidas solo deja tocar rol y permisos a un admin, y aquí quien
     escribe es el servidor, no la sesión. Ya se comprobó arriba que
     quien pidió esto sí es admin. */
  const { error: ePerfil } = await admin
    .from("perfiles")
    .update({
      usuario,
      nombre,
      rol,
      activo: true,
      clave_provisional: true,
      permisos_extra: extra,
    })
    .eq("id", creada.user.id);

  if (ePerfil) {
    /* La cuenta quedó creada y el perfil no: se dice, con el usuario, en
       vez de dejar una cuenta huérfana sin que nadie se entere. Borrarla
       aquí sería peor —si el borrado también falla, se pierde el rastro
       de que existe—. */
    return NextResponse.json(
      {
        error:
          `La cuenta de "${usuario}" quedó creada, pero su perfil no se pudo ` +
          `completar: ${ePerfil.message}. Búscala en la lista y corrígela.`,
        usuario,
      },
      { status: 500 }
    );
  }

  /* La clave sale UNA vez y no se guarda: quien la necesita es el
     administrador que la va a dictar, en este momento. */
  return NextResponse.json({ usuario, nombre, rol, clave, digitos: DIGITOS });
}
