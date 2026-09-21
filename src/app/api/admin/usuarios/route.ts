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
import { createClient } from "@/lib/supabase/server";
import { clienteDeServicio } from "@/lib/supabase/servicio";
import { misPermisos } from "@/lib/permisos";
import { correoDeUsuario, normalizarUsuario } from "@/lib/auth";
import { crearCuenta, claveSugerida, porQueLaClave, DIGITOS } from "@/lib/cuentas";

export const dynamic = "force-dynamic";

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

  const hecha = await crearCuenta(supabase, admin, { nombre, usuario, rol, extra });
  if (!hecha.ok) {
    const { status, ...resto } = hecha;
    return NextResponse.json(resto, { status });
  }
  const { ok: _ok, ...datos } = hecha;
  void _ok;
  return NextResponse.json(datos);
}

/**
 * GENERARLE UNA CLAVE NUEVA A ALGUIEN QUE YA EXISTE.
 *
 * Hace falta porque la clave sale UNA vez y no se guarda en ninguna
 * parte nuestra. Si el administrador no alcanzó a dictarla —o la
 * creación se cortó a mitad y nunca la vio— no hay de dónde sacarla: la
 * única salida es poner otra. Sin esto, esa persona quedaba con una
 * cuenta a la que nadie puede entrar y un usuario ocupado para siempre.
 *
 * La nueva nace PROVISIONAL otra vez: quien entre con ella tiene que
 * cambiarla antes de llegar a ninguna pantalla, igual que la primera.
 *
 * El mismo orden de siempre: sesión → manda → recién ahí la llave.
 */
/**
 * EDITAR EL NOMBRE Y EL USUARIO DE UNA CUENTA.
 *
 * Por qué esto no se podía hacer a mano en el panel de Supabase: el
 * login de CONTROL es por USUARIO, y Supabase Auth necesita un correo,
 * así que la plataforma arma uno sintético —<usuario>@cdcontrol.co—
 * que nadie ve. El usuario vive entonces en DOS sitios: perfiles.usuario
 * y auth.users.email. Cambiar solo la fila de perfiles deja la cuenta
 * entrando con el nombre viejo y mostrándose con el nuevo; y auth.users
 * no se edita desde la tabla del panel. Aquí se cambian los dos, en el
 * orden que deja el menor destrozo si algo falla a mitad.
 *
 * EL NOMBRE es libre: es como se le dice a la persona. EL USUARIO es con
 * lo que entra, así que cambiarlo cambia su forma de entrar — la
 * pantalla lo advierte antes de guardar.
 *
 * Lo que esta ruta NO toca: el rol, los permisos y la clave. El rol y
 * los permisos se editan donde se ven sus consecuencias; la clave tiene
 * su propio botón, que además la vuelve provisional.
 */
export async function PUT(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });

  const permisos = await misPermisos();
  if (!permisos.manda) {
    return NextResponse.json(
      { error: "Editar usuarios requiere un rol que administre la plataforma." },
      { status: 403 }
    );
  }

  const admin = clienteDeServicio();
  if (!admin) {
    return NextResponse.json(
      { error: "Falta la variable SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 503 }
    );
  }

  let cuerpo: {
    id?: string; nombre?: string; usuario?: string;
    rol?: string; permisos_extra?: Record<string, string>;
  };
  try { cuerpo = await req.json() } catch {
    return NextResponse.json({ error: "No llegó nada que cambiar." }, { status: 400 });
  }

  const id = (cuerpo.id ?? "").trim();
  const nombre = (cuerpo.nombre ?? "").trim();
  const usuario = normalizarUsuario(cuerpo.usuario ?? "");
  /* EL ROL Y LAS PANTALLAS SON OPCIONALES EN ESTA RUTA, a propósito:
     `undefined` quiere decir «no los toques». Si se trataran como ""
     y {}, cualquier pantalla que solo quisiera corregir un nombre
     dejaría a la persona sin rol y sin sus pantallas extra sin haberlo
     pedido. */
  const rol = cuerpo.rol === undefined ? null : cuerpo.rol.trim();
  const extra = cuerpo.permisos_extra ?? null;

  if (!id) return NextResponse.json({ error: "Falta decir a quién." }, { status: 400 });
  if (nombre.length < 3) {
    return NextResponse.json({ error: "El nombre no puede quedar en blanco." }, { status: 400 });
  }
  if (usuario.length < 3) {
    return NextResponse.json(
      { error: "El usuario necesita al menos tres caracteres: letras, números, punto, guion." },
      { status: 400 }
    );
  }

  const { data: antes } = await admin
    .from("perfiles").select("id, usuario, nombre, rol").eq("id", id).maybeSingle();
  if (!antes) {
    return NextResponse.json({ error: "Esa persona ya no está." }, { status: 404 });
  }

  /* El rol tiene que existir. Si no se comprobara, un rol mal escrito
     dejaría a alguien sin ver ninguna pantalla y nadie sabría por qué. */
  if (rol !== null) {
    if (!rol) return NextResponse.json({ error: "Falta decir con qué rol entra." }, { status: 400 });
    const { data: elRol } = await supabase
      .from("roles").select("clave, manda").eq("clave", rol).maybeSingle();
    if (!elRol) {
      return NextResponse.json({ error: `El rol "${rol}" no existe.` }, { status: 400 });
    }

    /* NADIE SE QUITA A SÍ MISMO LA LLAVE. Cambiarse el propio rol por uno
       que no administra la plataforma deja la sesión abierta pero sin
       poder volver a entrar aquí — y si es el único administrador, deja
       la plataforma sin nadie que pueda arreglarlo. El candado vive en el
       servidor y no en un botón escondido: esconder un botón no es un
       permiso. */
    if (id === user.id && !elRol.manda) {
      return NextResponse.json(
        { error: "No puedes quitarte a ti mismo el rol que administra la plataforma: " +
                 "quedarías sin poder volver a entrar aquí. Pídeselo a otro administrador." },
        { status: 409 }
      );
    }
  }

  /* Los permisos de la persona tienen que ser niveles reales: sin esto,
     un typo deja un permiso que no aplica a nada y parece dado.
     «ninguno» es un valor VÁLIDO y no una ausencia: es cómo se le quita
     a una sola persona una pantalla que su rol sí le da. */
  if (extra !== null) {
    for (const [ruta, nivel] of Object.entries(extra)) {
      if (nivel !== "ver" && nivel !== "editar" && nivel !== "ninguno") {
        return NextResponse.json({ error: `Nivel inválido en ${ruta}.` }, { status: 400 });
      }
    }
  }

  const cambiaUsuario = (antes.usuario ?? "").toLowerCase() !== usuario.toLowerCase();

  /* Que no se lo quite a otro. usuario_libre() dice "no" también cuando
     el dueño es esta misma persona, así que solo se pregunta si de
     verdad está cambiando: si no, corregir una tilde del NOMBRE fallaría
     diciendo que el usuario está tomado... por él mismo. */
  if (cambiaUsuario) {
    const { data: libre } = await supabase.rpc("usuario_libre", { p_usuario: usuario });
    if (libre === false) {
      return NextResponse.json(
        { error: `El usuario "${usuario}" ya está tomado por otra persona.` },
        { status: 409 }
      );
    }
  }

  /* PRIMERO auth y DESPUÉS el perfil. Si se cae en medio:
       · con este orden queda entrando con el usuario nuevo y mostrándose
         con el viejo — feo, pero la persona ENTRA, y el administrador lo
         ve y lo vuelve a guardar.
       · al revés quedaría mostrándose con el nuevo y entrando con el
         viejo, que nadie recuerda: esa persona se queda por fuera.
     Se elige el que deja a alguien adentro. */
  if (cambiaUsuario) {
    const { error: eAuth } = await admin.auth.admin.updateUserById(id, {
      email: correoDeUsuario(usuario),
      email_confirm: true,
    });
    if (eAuth) {
      return NextResponse.json(
        { error: `No se pudo cambiar el usuario: ${eAuth.message}` },
        { status: 500 }
      );
    }
  }

  /* Con .select(): un update que no encuentra la fila NO da error en
     PostgREST, devuelve éxito y cero filas. Sin comprobar cuántas
     cambiaron, la pantalla diría "listo" sin haber cambiado nada. */
  const { data: despues, error: ePerfil } = await admin
    .from("perfiles")
    .update({
      nombre, usuario,
      ...(rol !== null ? { rol } : {}),
      ...(extra !== null ? { permisos_extra: extra } : {}),
    })
    .eq("id", id)
    .select("id, usuario, nombre, rol, permisos_extra")
    .maybeSingle();

  if (ePerfil || !despues) {
    return NextResponse.json(
      {
        error: cambiaUsuario
          ? `El usuario de "${antes.nombre}" quedó como "${usuario}" para entrar, pero el ` +
            `perfil no se pudo actualizar${ePerfil ? `: ${ePerfil.message}` : ""}. ` +
            `Entra con "${usuario}" y vuelve a guardar aquí.`
          : `No se pudo guardar el nombre${ePerfil ? `: ${ePerfil.message}` : ""}.`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: despues.id,
    nombre: despues.nombre,
    usuario: despues.usuario,
    /* SE DEVUELVE CÓMO QUEDÓ, no solo que salió bien. La pantalla pinta
       esto en la fila sin esperar a volver a consultar: así lo que se ve
       después de guardar es lo que la BASE dice que quedó, no lo que el
       navegador cree que mandó. Si un trigger cambiara algo por su
       cuenta, se vería aquí mismo. */
    rol: despues.rol,
    permisos_extra: despues.permisos_extra ?? {},
    antes: { nombre: antes.nombre, usuario: antes.usuario },
    cambioUsuario: cambiaUsuario,
    cambioRol: rol !== null && rol !== antes.rol,
    /* Cambiarse a uno mismo el usuario es válido, pero la sesión sigue
       abierta con el correo viejo y el siguiente ingreso será con el
       nuevo. Mejor decirlo que dejar que lo descubra mañana. */
    eresTu: id === user.id,
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });

  const permisos = await misPermisos();
  if (!permisos.manda) {
    return NextResponse.json(
      { error: "Generar claves requiere un rol que administre la plataforma." },
      { status: 403 }
    );
  }

  const admin = clienteDeServicio();
  if (!admin) {
    return NextResponse.json(
      { error: "Falta la variable SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 503 }
    );
  }

  let cuerpo: { id?: string };
  try { cuerpo = await req.json() } catch {
    return NextResponse.json({ error: "No llegó a quién." }, { status: 400 });
  }
  const id = (cuerpo.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta decir a quién." }, { status: 400 });

  const { data: quien } = await admin
    .from("perfiles").select("id, usuario, nombre").eq("id", id).maybeSingle();
  if (!quien) {
    return NextResponse.json({ error: "Esa persona ya no está." }, { status: 404 });
  }

  /* A UNO MISMO NO. Cambiarse la propia clave por una de seis dígitos y
     quedar marcado como provisional es encerrarse afuera de la sesión
     que se está usando para administrar. Para la propia contraseña está
     Mi perfil, que pide la actual. */
  if (id === user.id) {
    return NextResponse.json(
      { error: "Para cambiar tu propia clave usa Mi perfil, no esto." },
      { status: 400 }
    );
  }

  const clave = claveSugerida();
  const { error: eClave } = await admin.auth.admin.updateUserById(id, {
    password: clave, email_confirm: true,
  });
  if (eClave) {
    return NextResponse.json(
      { error: porQueLaClave(eClave.message, quien.usuario ?? "") },
      { status: 500 }
    );
  }

  /* La marca se prende DESPUÉS de que la clave ya cambió. Al revés, si
     el cambio fallara quedaría alguien obligado a cambiar una clave que
     sigue siendo la vieja. */
  const { error: eMarca } = await admin
    .from("perfiles").update({ clave_provisional: true }).eq("id", id);
  if (eMarca) {
    return NextResponse.json(
      {
        error:
          `La clave de "${quien.usuario}" SÍ cambió, pero no se pudo marcar como ` +
          `provisional: ${eMarca.message}. Dísela igual y pídele que la cambie.`,
        usuario: quien.usuario, nombre: quien.nombre, clave, digitos: DIGITOS,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    usuario: quien.usuario, nombre: quien.nombre, clave, digitos: DIGITOS,
  });
}
