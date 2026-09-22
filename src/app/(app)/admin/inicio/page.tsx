import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { hayLlaveDeServicio } from "@/lib/supabase/servicio";
import { SQL_REVISAR } from "@/modulos/admin/sql";
import { Copiar, EnviarAcceso } from "./Piezas";
import "../roles/roles.css";
import "./inicio.css";

export const dynamic = "force-dynamic";

/**
 * ADMINISTRACIÓN · INICIO — todo lo de la plataforma de un vistazo.
 *
 * Una frase arriba que dice cómo está todo; las cifras de la gente; lo
 * último que se cambió (personas, roles y datos borrados), agrupado por
 * cuándo; la salud de la plataforma (llave del servidor y SQL que falta,
 * con la ruta para copiar) y quién está por atender, con «Enviar acceso».
 */
type P = { id: string; nombre: string | null; usuario: string | null; rol: string; activo: boolean; clave_provisional: boolean };
type Mov = { cuando: string; quien: string | null; tipo: "persona" | "rol" | "datos"; accion: string; texto: React.ReactNode };

const DIA = 86_400_000;
const hora = (s: string) => new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
const diaCol = (ms: number) => new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10);
function cuando(s: string) {
  const d = Math.round((Date.parse(diaCol(Date.now())) - Date.parse(diaCol(Date.parse(s)))) / DIA);
  if (d <= 0) return hora(s);
  if (d === 1) return `ayer ${hora(s)}`;
  if (d < 30) return `hace ${d} días`;
  return new Date(s).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}
function grupo(s: string) {
  const d = Math.round((Date.parse(diaCol(Date.now())) - Date.parse(diaCol(Date.parse(s)))) / DIA);
  return d <= 0 ? "HOY" : d < 7 ? "ESTA SEMANA" : "ANTES";
}
const ini = (n: string) => { const p = n.trim().split(/\s+/); return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase() };

const I = {
  gente: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.7-3 3-4.6 6-4.6s5.3 1.6 6 4.6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.4c2.3.2 4 1.7 4.5 4.6" /></svg>,
  entrar: <svg viewBox="0 0 24 24"><path d="M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8" /><path d="M4 12h11M11 8l4 4-4 4" /></svg>,
  ojo: <svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  llave: <svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2 2M14 9l2 2" /></svg>,
  escudo: <svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z" /></svg>,
  persona: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.4" /><path d="M3 19c.8-3.3 3.3-5 6-5s5.2 1.7 6 5" /><path d="M16 11l2 2 4-4" /></svg>,
  candado: <svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>,
  papelera: <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.8h6V7M6.5 7l1 12.2h9L17.5 7" /><path d="M10 11v5M14 11v5" /></svg>,
  mas: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.4" /><path d="M3 19c.8-3.3 3.3-5 6-5s5.2 1.7 6 5M18 8v6M15 11h6" /></svg>,
  apagar: <svg viewBox="0 0 24 24"><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></svg>,
  bien: <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>,
  alerta: <svg viewBox="0 0 24 24"><path d="M12 7v6M12 16.5v.5" /></svg>,
};

export default async function InicioAdmin() {
  const permisos = await misPermisos();
  if (!permisos.manda) {
    return (
      <div className="rl"><section className="tarjeta"><div className="cab"><div>
        <h2>Esta pantalla es de quien administra</h2>
        <p>Tu rol, <b>{permisos.nombreRol}</b>, no administra la plataforma. <Link href="/inicio">Volver</Link></p>
      </div></div></section></div>
    );
  }
  const supabase = await createClient();
  const [gente, roles, ing, hu, hr, hb, est] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, usuario, rol, activo, clave_provisional"),
    supabase.from("roles").select("clave, nombre"),
    supabase.rpc("usuarios_ingreso"),
    supabase.from("v_usuarios_historial").select("a_quien_nombre, a_quien_usuario, accion, detalle, hecho_nombre, hecho_en")
      .order("hecho_en", { ascending: false }).limit(12),
    supabase.from("v_roles_historial").select("rol_nombre, accion, detalle, hecho_nombre, hecho_en")
      .order("hecho_en", { ascending: false }).limit(8),
    supabase.from("v_admin_borrados").select("nombre, filas, borrado_nombre, borrado_en")
      .order("borrado_en", { ascending: false }).limit(5),
    supabase.rpc("admin_existe", { p_objetos: SQL_REVISAR.map((x) => x.objeto) }),
  ]);

  const ps = (gente.data ?? []) as P[];
  const nRol = new Map(((roles.data ?? []) as { clave: string; nombre: string }[]).map((r) => [r.clave, r.nombre]));
  const ultimo = new Map(((ing.data ?? []) as { id: string; ultimo_ingreso: string | null; creado: string | null }[]).map((r) => [r.id, r]));
  const sinIng = !!ing.error;
  const activos = ps.filter((p) => p.activo).sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? ""));
  const inactivos = ps.filter((p) => !p.activo);
  const nunca = sinIng ? [] : activos.filter((p) => !ultimo.get(p.id)?.ultimo_ingreso);
  const provisional = activos.filter((p) => p.clave_provisional);
  const semana = activos.filter((p) => { const u = ultimo.get(p.id)?.ultimo_ingreso; return u && Date.now() - Date.parse(u) < 7 * DIA });
  const porRol = [...activos.reduce((m, p) => m.set(p.rol, (m.get(p.rol) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  /* LO ÚLTIMO QUE SE CAMBIÓ */
  const QUE: Record<string, string> = { creado: "creó a", editado: "editó a", rol: "cambió el rol de", activado: "activó a",
    desactivado: "desactivó a", clave: "le generó clave nueva a", eliminado: "eliminó a" };
  const movs: Mov[] = [
    ...((hu.data ?? []) as { a_quien_nombre: string | null; a_quien_usuario: string | null; accion: string; detalle: Record<string, string>; hecho_nombre: string | null; hecho_en: string }[])
      .map((h) => ({ cuando: h.hecho_en, quien: h.hecho_nombre, tipo: "persona" as const, accion: h.accion,
        texto: <>{QUE[h.accion] ?? h.accion} <b>{h.a_quien_nombre || h.a_quien_usuario || "alguien"}</b>
          {h.accion === "rol" && <span className="cam"><s>{nRol.get(h.detalle?.de) ?? h.detalle?.de ?? "—"}</s><span aria-hidden>→</span><span className="a">{nRol.get(h.detalle?.a) ?? h.detalle?.a}</span></span>}</> })),
    ...((hr.data ?? []) as { rol_nombre: string; accion: string; hecho_nombre: string | null; hecho_en: string; detalle: { cambios?: unknown[] } }[])
      .map((h) => ({ cuando: h.hecho_en, quien: h.hecho_nombre, tipo: "rol" as const, accion: h.accion,
        texto: h.accion === "permisos" ? <>cambió <b>{h.detalle?.cambios?.length ?? ""} permisos</b> del rol {h.rol_nombre}</>
          : <>{h.accion === "creado" ? "creó" : h.accion === "duplicado" ? "duplicó" : "borró"} el rol <b>{h.rol_nombre}</b></> })),
    ...((hb.data ?? []) as { nombre: string; filas: number; borrado_nombre: string | null; borrado_en: string }[])
      .map((h) => ({ cuando: h.borrado_en, quien: h.borrado_nombre, tipo: "datos" as const, accion: "borrado",
        texto: <>borró <span className="num">{Number(h.filas).toLocaleString("es-CO")} filas</span> de {h.nombre}</> })),
  ].sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando)).slice(0, 12);
  const grupos = ["HOY", "ESTA SEMANA", "ANTES"].map((g) => ({ g, l: movs.filter((m) => grupo(m.cuando) === g) })).filter((x) => x.l.length);
  const icono = (m: Mov) => m.tipo === "datos" ? I.papelera : m.tipo === "rol" ? I.candado
    : m.accion === "clave" ? I.llave : m.accion === "creado" ? I.mas : m.accion === "desactivado" || m.accion === "eliminado" ? I.apagar : I.persona;

  /* LA SALUD */
  const existe = new Map(((est.data ?? []) as { objeto: string; existe: boolean }[]).map((x) => [x.objeto, x.existe]));
  const faltan = est.error
    ? [{ archivo: "2026-09-admin-historial.sql", para: "Con ella esta pantalla revisa las demás y se guarda el historial de personas", objeto: "" }]
    : SQL_REVISAR.filter((x) => existe.get(x.objeto) === false);
  const llave = hayLlaveDeServicio();
  const version = process.env.NEXT_PUBLIC_VERSION ?? "local";
  const chequeos = 1 + Math.max(1, faltan.length);
  const listos = (llave ? 1 : 0) + (faltan.length ? 0 : 1);

  /* POR ATENDER */
  const atender = [...new Map([...nunca, ...provisional].map((p) => [p.id, p])).values()];
  const pendientes = (llave ? 0 : 1) + faltan.length + atender.length;

  /* LA FRASE DE ARRIBA */
  const partes: React.ReactNode[] = [];
  if (!llave) partes.push(<b key="l">falta la llave del servidor</b>);
  if (faltan.length) partes.push(<b key="f">{faltan.length === 1 ? "falta correr una migración" : `faltan correr ${faltan.length} migraciones`}</b>);
  if (nunca.length) partes.push(<span key="n"><b>{nunca.length === 1 ? "una persona" : nunca.length === 2 ? "dos personas" : `${nunca.length} personas`}</b> nunca {nunca.length === 1 ? "ha" : "han"} entrado</span>);
  else if (provisional.length) partes.push(<span key="p"><b>{provisional.length}</b> sin cambiar su clave</span>);
  const frase = partes.length === 0 ? <>Todo en orden: la plataforma está completa y todos han entrado.</>
    : <>{partes.length === 1 && !faltan.length && llave ? "Casi todo listo: " : "Casi todo listo: "}{partes.reduce<React.ReactNode[]>((a, p, i) => [...a, i ? (i === partes.length - 1 ? " y " : ", ") : null, p], [])}.</>;

  return (
    <div className="rl ain">
      <div className="ain-top">
        <div>
          <p className="ain-o">PLATAFORMA · ADMINISTRACIÓN</p>
          <h1>Inicio</h1>
          <p className="ain-frase">{frase}</p>
        </div>
        <span className={"ain-est" + (pendientes ? "" : " ok")}><i />{pendientes ? `${pendientes} pendiente${pendientes === 1 ? "" : "s"}` : "Todo al día"}</span>
      </div>

      <div className="ain-gente">
        <Link href="/admin/usuarios" className="ain-card ain-k">
          <span className="ic">{I.gente}</span><b className="n">{activos.length}</b><span className="l">Activos</span>
          <span className="s">{inactivos.length ? `y ${inactivos.length} inactivo${inactivos.length === 1 ? "" : "s"}` : "nadie inactivo"}</span>
          <span className="avs">
            {activos.slice(0, 6).map((p) => <i key={p.id} title={p.nombre ?? ""}>{ini(p.nombre || p.usuario || "?")}</i>)}
            {activos.length > 6 && <i className="mas">+{activos.length - 6}</i>}
            {inactivos.slice(0, 1).map((p) => <i key={p.id} className="off" title={`${p.nombre} (inactivo)`}>{ini(p.nombre || p.usuario || "?")}</i>)}
          </span>
        </Link>
        <Link href="/admin/usuarios" className="ain-card ain-k">
          <span className="ic">{I.entrar}</span><b className="n">{sinIng ? "—" : semana.length}<small> / {activos.length}</small></b>
          <span className="l">Entraron esta semana</span>
          <span className="barrita"><i style={{ width: `${activos.length ? (semana.length / activos.length) * 100 : 0}%` }} /></span>
        </Link>
        <Link href="/admin/usuarios" className={"ain-card ain-k" + (nunca.length ? " hot" : "")}>
          <span className="ic">{I.ojo}</span><b className="n">{sinIng ? "—" : nunca.length}</b>
          <span className="l">Nunca han entrado</span><span className="s">activos sin un ingreso</span>
        </Link>
        <Link href="/admin/usuarios" className={"ain-card ain-k" + (provisional.length ? " warn" : "")}>
          <span className="ic">{I.llave}</span><b className="n">{provisional.length}</b>
          <span className="l">Clave provisional</span><span className="s">todavía no la cambian</span>
        </Link>
        <Link href="/admin/roles" className="ain-card ain-k">
          <span className="ic">{I.escudo}</span><b className="n">{nRol.size}</b><span className="l">Roles</span>
          <span className="roles" aria-hidden>
            {porRol.slice(0, 2).map(([r, n], i) => <i key={r} className={"r" + i} style={{ flex: n }} />)}
            {porRol.length > 2 && <i className="r2" style={{ flex: porRol.slice(2).reduce((a, x) => a + x[1], 0) }} />}
          </span>
          <span className="s">{porRol.slice(0, 2).map(([r, n]) => `${n} ${nRol.get(r) ?? r}`).join(" · ")}
            {porRol.length > 2 ? ` · ${porRol.slice(2).reduce((a, x) => a + x[1], 0)} otro${porRol.slice(2).reduce((a, x) => a + x[1], 0) === 1 ? "" : "s"}` : ""}</span>
        </Link>
      </div>

      <div className="ain-cuerpo">
        <section className="ain-card">
          <div className="ain-h"><h2>Lo último que se cambió</h2><Link href="/admin/usuarios#historial">Ver todo el historial →</Link></div>
          {hu.error && <p className="ain-aviso">El historial de personas empieza a llenarse cuando se corra <code>2026-09-admin-historial.sql</code>.</p>}
          {grupos.map(({ g, l }) => (
            <div key={g}>
              <p className="ain-dia">{g}</p>
              {l.map((m, i) => (
                <div key={i} className={"ain-ev" + (m.tipo === "datos" || m.accion === "eliminado" ? " bor" : "")}>
                  <span className="ic" aria-hidden>{icono(m)}</span>
                  <span className="t"><b>{m.quien ?? "Alguien"}</b> {m.texto}</span>
                  <time>{cuando(m.cuando)}</time>
                </div>
              ))}
            </div>
          ))}
          {movs.length === 0 && <p className="ain-vacio">Nada todavía.</p>}
          <div className="ain-fin" />
        </section>

        <div className="ain-lado">
          <section className="ain-card ain-salud">
            <div className="cab">
              <div><h2>Salud de la plataforma</h2><span>versión publicada · {version}</span></div>
              <div className="pg"><b>{listos} / {chequeos}</b><span>listo</span></div>
            </div>
            <div className={"chk " + (llave ? "ok" : "no")}>
              <span className="m">{llave ? I.bien : I.alerta}</span>
              <div><b>Llave del servidor</b>
                <p>{llave ? "Puesta. Se pueden crear usuarios y generar claves." : "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel: no se pueden crear usuarios ni generar claves."}</p></div>
            </div>
            {faltan.length === 0 ? (
              <div className="chk ok"><span className="m">{I.bien}</span>
                <div><b>Base al día</b><p>Los {SQL_REVISAR.length} SQL que se revisan ya están corridos.</p></div></div>
            ) : faltan.map((f) => (
              <div className="chk no" key={f.archivo}><span className="m">{I.alerta}</span>
                <div><b>Falta correr una migración</b><p>Sin ella no funciona: <b>{f.para}</b>. Ábrela, cópiala y córrela en el SQL Editor de Supabase.</p>
                  <div className="ruta"><span>supabase/migraciones/{f.archivo}</span><Copiar texto={`supabase/migraciones/${f.archivo}`} /></div></div>
              </div>
            ))}
          </section>

          <section className="ain-card">
            <div className="ain-h"><h2>Por atender</h2><span className="cuenta">{atender.length} persona{atender.length === 1 ? "" : "s"}</span></div>
            {atender.map((p) => {
              const cre = ultimo.get(p.id)?.creado;
              const nuncaEntro = nunca.includes(p);
              return (
                <div className="ain-per" key={p.id}>
                  <span className="av">{ini(p.nombre || p.usuario || "?")}</span>
                  <div>
                    <Link href={`/admin/usuarios?q=${encodeURIComponent(p.usuario ?? p.nombre ?? "")}`}><b>{p.nombre || p.usuario}</b></Link>
                    <span>{nRol.get(p.rol) ?? p.rol}{cre ? ` · creado ${cuando(cre)}` : ""}</span>
                    <em className="tag">{nuncaEntro ? "nunca ha entrado" : "clave provisional"}</em>
                  </div>
                  {llave && <EnviarAcceso id={p.id} nombre={p.nombre || p.usuario || ""} />}
                </div>
              );
            })}
            {atender.length === 0 && <p className="ain-vacio">Nadie pendiente: todos entraron y cambiaron su clave.</p>}
            <div className="ain-fin" />
          </section>
        </div>
      </div>
    </div>
  );
}
