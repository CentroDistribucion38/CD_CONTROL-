import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { hayLlaveDeServicio } from "@/lib/supabase/servicio";
import { SQL_REVISAR } from "@/modulos/admin/sql";
import "../roles/roles.css";
import "./inicio.css";

export const dynamic = "force-dynamic";

/**
 * ADMINISTRACIÓN · INICIO — todo lo de la plataforma de un vistazo.
 *
 * Cuánta gente entra y quién no ha entrado nunca, las claves que siguen
 * provisionales, lo último que se cambió (personas, roles y datos
 * borrados, con quién y cuándo) y el estado del sistema: qué SQL falta
 * correr, si está la llave del servidor y qué versión está publicada.
 */
type P = { id: string; nombre: string | null; usuario: string | null; rol: string; activo: boolean; clave_provisional: boolean };
type Mov = { cuando: string; quien: string | null; que: string; tipo: "persona" | "rol" | "datos" };

const DIA = 86_400_000;
function hace(s: string) {
  const d = Math.floor((Date.now() - Date.parse(s)) / DIA);
  const h = new Date(s).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
  if (d <= 0) return `hoy ${h}`;
  if (d === 1) return `ayer ${h}`;
  if (d < 30) return `hace ${d} días`;
  return new Date(s).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

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
  const activos = ps.filter((p) => p.activo);
  const nunca = activos.filter((p) => ing.data && !ultimo.get(p.id)?.ultimo_ingreso);
  const provisional = activos.filter((p) => p.clave_provisional);
  const semana = activos.filter((p) => { const u = ultimo.get(p.id)?.ultimo_ingreso; return u && Date.now() - Date.parse(u) < 7 * DIA });
  const porRol = [...activos.reduce((m, p) => m.set(p.rol, (m.get(p.rol) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);

  /* LO ÚLTIMO QUE SE CAMBIÓ, de las tres partes, en una sola lista. */
  const QUE: Record<string, string> = { creado: "creó a", editado: "editó a", rol: "cambió el rol de", activado: "activó a",
    desactivado: "desactivó a", clave: "le generó clave nueva a", eliminado: "eliminó a" };
  const movs: Mov[] = [
    ...((hu.data ?? []) as { a_quien_nombre: string | null; a_quien_usuario: string | null; accion: string; detalle: Record<string, string>; hecho_nombre: string | null; hecho_en: string }[])
      .map((h) => ({ cuando: h.hecho_en, quien: h.hecho_nombre, tipo: "persona" as const,
        que: `${QUE[h.accion] ?? h.accion} ${h.a_quien_nombre || h.a_quien_usuario || "alguien"}` +
          (h.accion === "rol" ? `: ${nRol.get(h.detalle?.de) ?? h.detalle?.de ?? "—"} → ${nRol.get(h.detalle?.a) ?? h.detalle?.a}` : "") })),
    ...((hr.data ?? []) as { rol_nombre: string; accion: string; hecho_nombre: string | null; hecho_en: string; detalle: { cambios?: unknown[] } }[])
      .map((h) => ({ cuando: h.hecho_en, quien: h.hecho_nombre, tipo: "rol" as const,
        que: h.accion === "permisos" ? `cambió ${h.detalle?.cambios?.length ?? ""} permisos del rol ${h.rol_nombre}`
          : `${h.accion === "creado" ? "creó" : h.accion === "duplicado" ? "duplicó" : "borró"} el rol ${h.rol_nombre}` })),
    ...((hb.data ?? []) as { nombre: string; filas: number; borrado_nombre: string | null; borrado_en: string }[])
      .map((h) => ({ cuando: h.borrado_en, quien: h.borrado_nombre, tipo: "datos" as const,
        que: `borró ${Number(h.filas).toLocaleString("es-CO")} filas de ${h.nombre}` })),
  ].sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando)).slice(0, 14);

  /* EL ESTADO DEL SISTEMA */
  const existe = new Map(((est.data ?? []) as { objeto: string; existe: boolean }[]).map((x) => [x.objeto, x.existe]));
  const faltan = est.error ? null : SQL_REVISAR.filter((x) => existe.get(x.objeto) === false);
  const llave = hayLlaveDeServicio();
  const version = process.env.NEXT_PUBLIC_VERSION ?? "local";
  const bien = faltan !== null && faltan.length === 0 && llave;

  return (
    <div className="rl ain">
      <div className="cabeza">
        <div>
          <p className="ojo">PLATAFORMA · ADMINISTRACIÓN</p>
          <h1>Inicio</h1>
          <p className="sub">Quién entra, qué está pendiente, qué se cambió y si la plataforma está completa.</p>
        </div>
      </div>

      <div className="ain-kpis">
        <Link href="/admin/usuarios" className="ain-k"><span className="rot">ACTIVOS</span><b>{activos.length}</b>
          <span className="pie">{ps.length - activos.length} inactivos</span></Link>
        <Link href="/admin/usuarios" className="ain-k"><span className="rot">ENTRARON ESTA SEMANA</span><b>{ing.error ? "—" : semana.length}</b>
          <span className="pie">de {activos.length} activos</span></Link>
        <Link href="/admin/usuarios" className={"ain-k" + (nunca.length ? " ojo" : "")}><span className="rot">NUNCA HAN ENTRADO</span><b>{ing.error ? "—" : nunca.length}</b>
          <span className="pie">activos sin un solo ingreso</span></Link>
        <Link href="/admin/usuarios" className={"ain-k" + (provisional.length ? " ojo" : "")}><span className="rot">CLAVE PROVISIONAL</span><b>{provisional.length}</b>
          <span className="pie">todavía no la cambian</span></Link>
        <Link href="/admin/roles" className="ain-k"><span className="rot">ROLES</span><b>{nRol.size}</b>
          <span className="pie">{porRol.slice(0, 2).map(([r, n]) => `${n} ${nRol.get(r) ?? r}`).join(" · ")}</span></Link>
      </div>

      <div className="ain-dos">
        <section className="tarjeta">
          <div className="cab"><div><h2>Lo último que se cambió</h2><p>Personas, roles y datos borrados, con quién y cuándo.</p></div></div>
          {hu.error && <p className="ain-aviso">El historial de personas empieza a llenarse cuando se corra <code>2026-09-admin-historial.sql</code>.</p>}
          <ol className="ain-movs">
            {movs.map((m, i) => (
              <li key={i} className={m.tipo}>
                <span className="punto" aria-hidden />
                <span className="tx"><b>{m.quien ?? "Alguien"}</b> {m.que}</span>
                <time>{hace(m.cuando)}</time>
              </li>
            ))}
            {movs.length === 0 && <li className="vacio">Nada todavía.</li>}
          </ol>
          <p className="ain-mas"><Link href="/admin/usuarios#historial">Ver todo el historial de personas</Link></p>
        </section>

        <div className="ain-col">
          <section className={"tarjeta ain-estado" + (bien ? " bien" : " ojo")}>
            <div className="cab"><div>
              <h2>{bien ? "La plataforma está completa" : "Falta algo en la plataforma"}</h2>
              <p>Versión publicada <code>{version}</code></p>
            </div></div>
            <ul className="ain-chequeo">
              <li className={llave ? "si" : "no"}>
                <b>Llave del servidor</b>
                <span>{llave ? "Puesta: se pueden crear usuarios y generar claves." : "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel: no se pueden crear usuarios."}</span>
              </li>
              {faltan === null ? (
                <li className="no"><b>SQL por correr</b><span>Corre primero <code>supabase/migraciones/2026-09-admin-historial.sql</code>: con él esta pantalla revisa los demás.</span></li>
              ) : faltan.length === 0 ? (
                <li className="si"><b>SQL al día</b><span>Los {SQL_REVISAR.length} archivos que se revisan ya están en la base.</span></li>
              ) : faltan.map((f) => (
                <li className="no" key={f.archivo}><b>Falta correr</b><span><code>supabase/migraciones/{f.archivo}</code> — {f.para}</span></li>
              ))}
            </ul>
          </section>

          <section className="tarjeta">
            <div className="cab"><div><h2>Por atender</h2><p>Gente activa que no ha entrado o no ha cambiado su clave.</p></div></div>
            <ul className="ain-pend">
              {[...new Set([...provisional, ...nunca])].slice(0, 10).map((p) => {
                const cre = ultimo.get(p.id)?.creado;
                return (
                  <li key={p.id}>
                    <Link href={`/admin/usuarios?q=${encodeURIComponent(p.usuario ?? p.nombre ?? "")}`}>{p.nombre || p.usuario}</Link>
                    <span>{nRol.get(p.rol) ?? p.rol}{cre ? ` · creado ${hace(cre)}` : ""}</span>
                    <em>{!ultimo.get(p.id)?.ultimo_ingreso && !ing.error ? "nunca ha entrado" : "clave provisional"}</em>
                  </li>
                );
              })}
              {provisional.length + nunca.length === 0 && <li className="vacio">Nadie pendiente.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
