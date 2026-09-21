/**
 * CREAR UNA CUENTA — lo que antes vivía dentro de POST /api/admin/usuarios.
 *
 * Sale a su propio archivo porque ahora se crea de a una Y de a varias
 * («crear varios usuarios a la vez dentro de un mismo rol»), y las dos
 * tienen que hacer exactamente lo mismo: comprobar el rol, el usuario
 * libre, adoptar la cuenta huérfana, escribir el perfil y devolver la
 * clave. Dos copias de esto serían dos juegos de reglas.
 *
 * QUIÉN PUEDE lo comprueba quien llama, ANTES: esto recibe ya la llave de
 * servicio.
 */
import "server-only";
import { randomInt } from "crypto";
import type { createClient } from "@/lib/supabase/server";
import type { clienteDeServicio } from "@/lib/supabase/servicio";
import { correoDeUsuario } from "@/lib/auth";

type Sesion = Awaited<ReturnType<typeof createClient>>;
type Admin = NonNullable<ReturnType<typeof clienteDeServicio>>;


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
export const DIGITOS = 6;

/**
 * Una clave de DIGITOS dígitos, uniforme y sin sesgo.
 * randomInt(min, max) del módulo crypto: no es Math.random, y el rango
 * se pide completo para que el 0 inicial no se pierda ("0417" es una
 * clave válida y descartarla quitaría cien mil de un millón).
 */
export function claveSugerida(): string {
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
export async function buscarPorCorreo(
  admin: Admin,
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
export function porQueLaClave(mensaje: string, usuario: string): string {
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


export type Creada =
  | { ok: true; usuario: string; nombre: string; rol: string; clave: string; digitos: number }
  | { ok: false; status: number; error: string; usuario?: string };

export async function crearCuenta(supabase: Sesion, admin: Admin, d: {
  nombre: string; usuario: string; rol: string; extra: Record<string, string>;
}): Promise<Creada> {
  const { nombre, usuario, rol, extra } = d;
  /* El rol tiene que existir. Si no se comprobara, un rol mal escrito
     crearía una persona que no puede ver ninguna pantalla y nadie
     sabría por qué. */
  const { data: elRol } = await supabase
    .from("roles").select("clave").eq("clave", rol).maybeSingle();
  if (!elRol) {
    return { ok: false as const, status: 400, error: `El rol "${rol}" no existe.` };
  }

  /* Los permisos extra tienen que ser rutas reales y niveles reales: sin
     esto, un typo deja un permiso que no aplica a nada y parece dado. */
  for (const [ruta, nivel] of Object.entries(extra)) {
    if (nivel !== "ver" && nivel !== "editar" && nivel !== "ninguno") {
      return { ok: false as const, status: 400, error: `Nivel inválido en ${ruta}.` };
    }
  }

  /* ¿Está libre el usuario? Se pregunta antes para poder decirlo claro;
     de todas formas la creación fallaría abajo, pero con un error de
     Supabase que no le sirve a nadie. */
  const { data: libre } = await supabase.rpc("usuario_libre", { p_usuario: usuario });
  if (libre === false) {
    return { ok: false as const, status: 409, error: `El usuario "${usuario}" ya está tomado.` };
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
      return { ok: false as const, status: 400, error: porQueLaClave(eAuth?.message ?? "error desconocido", usuario) };
    }

    const suya = await buscarPorCorreo(admin, correo);
    if (!suya) {
      return { ok: false as const, status: 409, error:
            `Supabase dice que "${usuario}" ya tiene cuenta, pero no aparece al ` +
            `buscarla. Revísala en Authentication → Users antes de volver a intentar.` };
    }

    /* Si esa cuenta YA tiene perfil, entonces sí está tomada de verdad
       y no hay nada que adoptar. */
    const { data: yaTiene } = await admin
      .from("perfiles").select("id, usuario").eq("id", suya).maybeSingle();
    if (yaTiene?.usuario) {
      return { ok: false as const, status: 409, error: `El usuario "${usuario}" ya está tomado.` };
    }

    const { error: eClave } = await admin.auth.admin.updateUserById(suya, {
      password: clave, email_confirm: true,
    });
    if (eClave) {
      return { ok: false as const, status: 500, error: porQueLaClave(eClave.message, usuario) };
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
    return { ok: false as const, status: 500, error:
          `La cuenta de "${usuario}" quedó creada pero su perfil no se escribió, ` +
          `y la base no dijo por qué. Búscala en Authentication → Users.`,
        usuario };
  }

  if (ePerfil) {
    /* La cuenta quedó creada y el perfil no: se dice, con el usuario, en
       vez de dejar una cuenta huérfana sin que nadie se entere. Borrarla
       aquí sería peor —si el borrado también falla, se pierde el rastro
       de que existe—. */
    return { ok: false as const, status: 500, error:
          `La cuenta de "${usuario}" quedó creada, pero su perfil no se pudo ` +
          `completar: ${ePerfil.message}. Búscala en la lista y corrígela.`,
        usuario };
  }

  /* La clave sale UNA vez y no se guarda: quien la necesita es el
     administrador que la va a dictar, en este momento. */
  return { ok: true, usuario, nombre, rol, clave, digitos: DIGITOS };
}
