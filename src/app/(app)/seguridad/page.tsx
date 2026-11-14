import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { MODULOS, entradaDeRama } from "@/modulos/registro";
import { leerCertificaciones } from "@/modulos/seguridad/datos";
import { armarTablero, hoyCo } from "@/modulos/seguridad/certificaciones";
import "../inventario/fefo.css";
import "../inventario/portada.css";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("es-CO");

/**
 * LA PORTADA DE SEGURIDAD — hoy una rama (Certificaciones) y queda el espacio para las que sigan.
 * Cada tarjeta trae su cifra viva: cuántas licencias VACA de gente activa ya vencieron o vencen este mes.
 */
export default async function SeguridadPortada() {
  const [permisos, d] = await Promise.all([misPermisos(), leerCertificaciones()]);
  const modulo = MODULOS.find((m) => m.id === "seguridad")!;
  const ramas = (modulo.ramas ?? []).filter((r) => modulo.secciones.some((s) => s.rama === r.id && permisos.puedeVer(s.ruta)));

  const CIFRA: Record<string, { n: string; u: string; pie: string; mal: boolean } | null> = { certificaciones: null };
  if (!d.falta && !d.error && d.personas.length) {
    const { departamentos, ...config } = d.reglas;
    const t = armarTablero(d.personas, hoyCo(), config);
    const n = t.vencidas + t.criticas + t.avisos;
    CIFRA.certificaciones = {
      n: nf.format(n), u: n === 1 ? "alerta" : "alertas",
      pie: t.vencidas > 0
        ? `${t.vencidas} ${t.vencidas === 1 ? "vencida y trabajando" : "vencidas y trabajando"} · ${nf.format(t.activos)} activos en ${departamentos.map((x) => x.charAt(0) + x.slice(1).toLowerCase()).join(", ")}`
        : `vencen en ${config.diasAviso} días · ${nf.format(t.activos)} activos`,
      mal: t.vencidas > 0,
    };
  }

  return (
    <div className="fe inv-p">
      <section className="inv-cabeza">
        <p className="ojo">SEGURIDAD · PERSONAS Y CERTIFICACIONES · CD38</p>
        <h1>¿Qué vas a mirar?</h1>
        <p className="sub">
          Quién está habilitado para trabajar. Las <b>licencias VACA</b> («Licencia para cuidar») de las contratistas:
          qué se vence, a quién exigirle (<b>Interventor ABI</b> y <b>Coordinador de la contratista</b>) y cómo va el cumplimiento.
        </p>
      </section>

      <div className="inv-ramas">
        {ramas.map((r) => {
          const c = CIFRA[r.id];
          return (
            <Link key={r.id} href={entradaDeRama(modulo, r, permisos.puedeVer)} className="inv-rama">
              <span className="inv-corte" aria-hidden />
              <span className="inv-rot">{r.eyebrow}</span>
              <span className="inv-nom">{r.nombre}</span>
              <span className="inv-des">{r.descripcion}</span>
              {c && (
                <span className={"inv-cifra" + (c.mal ? " mal" : "")}>
                  <b>{c.n}</b><i>{c.u}</i>
                  <em>{c.pie}</em>
                </span>
              )}
              <span className="inv-entrar">Entrar <svg viewBox="0 0 24 24" fill="none"
                strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 7l5 5-5 5" /></svg></span>
            </Link>
          );
        })}
      </div>

      {ramas.length === 0 && (
        <div className="inv-aviso">
          Tu rol no tiene abierta ninguna pantalla de Seguridad. Pídele al administrador que te dé permiso en
          <b> Administración → Roles</b>.
        </div>
      )}
    </div>
  );
}
