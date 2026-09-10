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

/**
 * Cuántos dígitos tiene la clave que sugiere la plataforma.
 *
 * SEIS, y no cuatro, porque Supabase RECHAZA las claves de menos de
 * seis caracteres: "Password should be at least 6 characters". Con
 * cuatro, createUser fallaba y quedaba la cuenta a medias. No es una
 * preferencia, es el mínimo del proveedor.
 *
 * De paso son un millón de combinaciones en vez de diez mil, y seis
 * dígitos se dictan por teléfono igual de fácil que cuatro.
 *
 * Si un día se sube el mínimo en Authentication → Policies, hay que
 * subir esto también: el error de abajo lo dice con todas las letras.
 */
const DIGITOS = 6;

/**
 * Una clave de DIGITOS dígitos, uniforme y sin sesgo.
 * randomInt(min, max) del módulo crypto: no es Math.random, y el rango
 * se pide completo para que el 0 inicial no se pierda ("0417" es una
 * clave válida y descartarla quitaría cien mil de un millón).
 */
function claveSugerida(): string {
  const tope = 10 ** DIGITOS;
  return String(randomInt(0, tope)).padStart(DIGITOS, "0");
}

/**
 * El id de la cuenta de auth que tiene ese correo, o null.
 *
 * Se pagina porque listUsers devuelve 50 por página y una cuenta vieja
 * puede estar en la tercera: pedir solo la primera y concluir "no está"
 * sería una respuesta equivocada disfrazada de dato. El tope de 20
 * páginas —mil cuentas— es para que un error de la API no deje esto
 * girando para siempre.
 */
async function buscarPorCorreo(
  admin: NonNullable<ReturnType<typeof clienteDeServicio>>,
  correo: string
): Promise<string | null> {
  const buscado = correo.toLowerCase();
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hallado = data.users.find((u) => (u.email ?? "").toLowerCase() === buscado);
    if (hallado) return hallado.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Supabase contesta "Password should be at least 6 characters" cuando la
 * clave es más corta que el mínimo del proyecto. Ese mensaje en inglés,
 * crudo, no le dice a nadie qué hacer: lo que hay que cambiar es la
 * constante DIGITOS de arriba, y eso es lo que dice esta traducción.
 */
function porQueLaClave(mensaje: string, usuario: string): string {
  if (/at least \d+ characters/i.test(mensaje)) {
    const min = mensaje.match(/at least (\d+)/i)?.[1] ?? "6";
    return (
      `Supabase pide claves de al menos ${min} caracteres y la plataforma está ` +
      `generando de ${DIGITOS}. Sube DIGITOS en src/app/api/admin/usuarios/route.ts ` +
      `a ${min} o más, o baja el mínimo en Supabase → Authentication → Policies.`
    );
  }
  return `No se pudo crear la cuenta de "${usuario}": ${mensaje}`;
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
  const correo = correoDeUsuario(usuario);
  const clave = claveSugerida();
  const { data: creada, error: eAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: clave,
    /* Confirmado de entrada: CONTROL entra por usuario y el correo es
       sintético —no existe buzón—, así que esperar una confirmación
       dejaría la cuenta sin poder entrar para siempre. */
    email_confirm: true,
  });

  /* LA CUENTA HUÉRFANA.
     auth.users y perfiles son dos tablas. Si la cuenta se creó y su
     perfil no, queda una cuenta que NO SE VE en ninguna pantalla y que
     además bloquea el usuario para siempre: usuario_libre mira
     perfiles, dice "libre", y createUser contesta "ya existe". Ese
     callejón sin salida es exactamente lo que pasó.
     Aquí se ADOPTA: se le pone una clave provisional nueva y se le
     arma el perfil. No se borra la cuenta —borrar cuentas de auth por
     una condición deducida es demasiado filo para un caso que se
     arregla completándola—. */
  let idCuenta = creada?.user?.id ?? null;
  if (!idCuenta) {
    const m = (eAuth?.message ?? "").toLowerCase();
    const yaExiste = m.includes("already") || m.includes("registered");
    if (!yaExiste) {
      return NextResponse.json(
        { error: porQueLaClave(eAuth?.message ?? "error desconocido", usuario) },
        { status: 400 }
      );
    }

    const suya = await buscarPorCorreo(admin, correo);
    if (!suya) {
      return NextResponse.json(
        {
          error:
            `Supabase dice que "${usuario}" ya tiene cuenta, pero no aparece al ` +
            `buscarla. Revísala en Authentication → Users antes de volver a intentar.`,
        },
        { status: 409 }
      );
    }

    /* Si esa cuenta YA tiene perfil, entonces sí está tomada de verdad
       y no hay nada que adoptar. */
    const { data: yaTiene } = await admin
      .from("perfiles").select("id, usuario").eq("id", suya).maybeSingle();
    if (yaTiene?.usuario) {
      return NextResponse.json(
        { error: `El usuario "${usuario}" ya está tomado.` },
        { status: 409 }
      );
    }

    const { error: eClave } = await admin.auth.admin.updateUserById(suya, {
      password: clave, email_confirm: true,
    });
    if (eClave) {
      return NextResponse.json({ error: porQueLaClave(eClave.message, usuario) }, { status: 500 });
    }
    idCuenta = suya;
  }

  /* ---------- El perfil ----------
     UPSERT y no update. Antes esto era un update, confiando en que el
     disparador on_auth_user_created de 00-nucleo.sql ya hubiera creado
     la fila. Cuando ese disparador no está —o no corrió— el update no
     encuentra nada, Y NO DA ERROR: PostgREST devuelve éxito con cero
     filas tocadas. La cuenta quedaba en auth.users sin perfil, invisible
     en la pantalla y bloqueando el usuario para siempre.
     Con upsert la fila queda escrita exista o no el disparador. Depender
     de algo que no se comprueba fue el error; comprobarlo abajo, con
     select(), es lo que lo cierra.

     Se hace con la llave de servicio porque el disparador de columnas
     protegidas solo deja tocar rol y permisos a un admin, y aquí quien
     escribe es el servidor, no la sesión. Ya se comprobó arriba que
     quien pidió esto sí es admin. */
  const { data: filaPerfil, error: ePerfil } = await admin
    .from("perfiles")
    .upsert({
      id: idCuenta,
      usuario,
      nombre,
      rol,
      activo: true,
      clave_provisional: true,
      permisos_extra: extra,
    }, { onConflict: "id" })
    .select("id")
    .maybeSingle();

  if (!ePerfil && !filaPerfil) {
    return NextResponse.json(
      {
        error:
          `La cuenta de "${usuario}" quedó creada pero su perfil no se escribió, ` +
          `y la base no dijo por qué. Búscala en Authentication → Users.`,
        usuario,
      },
      { status: 500 }
    );
  }

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

  let cuerpo: { id?: string; nombre?: string; usuario?: string };
  try { cuerpo = await req.json() } catch {
    return NextResponse.json({ error: "No llegó nada que cambiar." }, { status: 400 });
  }

  const id = (cuerpo.id ?? "").trim();
  const nombre = (cuerpo.nombre ?? "").trim();
  const usuario = normalizarUsuario(cuerpo.usuario ?? "");

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
    .from("perfiles").select("id, usuario, nombre").eq("id", id).maybeSingle();
  if (!antes) {
    return NextResponse.json({ error: "Esa persona ya no está." }, { status: 404 });
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
    .update({ nombre, usuario })
    .eq("id", id)
    .select("id, usuario, nombre")
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
    antes: { nombre: antes.nombre, usuario: antes.usuario },
    cambioUsuario: cambiaUsuario,
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
