import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { MODULOS } from "@/modulos/registro";
import { acciones as leerAcciones } from "@/modulos/acciones/datos";
import { hallazgos as leerHallazgos } from "@/modulos/acciones/hallazgos";
import "./acciones.css";

export const dynamic = "force-dynamic";

/**
 * LA PORTADA DE ACCIONES — dos ramas, y hay que escoger una.
 *
 * ESTA PANTALLA EXISTE PARA SEPARAR, no para decorar. Las dos ramas
 * hablan de lo que está mal y NINGUNA de las dos cifras se suma con la
 * otra:
 *
 *   OL    una ACCIÓN: algo que hay que corregir, con responsable y
 *         plazo. Se abre todos los días y se cierra cuando alguien la
 *         hace; después otro verifica si de verdad sirvió.
 *   ABI   un HALLAZGO: lo que se encontró en una auditoría, con su
 *         evidencia y una redacción que va a un informe. Se levanta el
 *         día de la auditoría.
 *
 * Y NO SE SUMAN, aunque las dos «cuenten cosas que están mal». Un
 * hallazgo puede no generar ninguna acción —se documenta y ya— y una
 * acción puede nacer de un reporte de turno que nadie auditó. Sumarlas
 * daría un número que no contesta ninguna pregunta que alguien tenga.
 *
 * LO QUE SÍ SE PUEDE DECIR es cuántos hallazgos ya abrieron su acción,
 * y eso va escrito abajo: es la única cifra que de verdad cruza las dos
 * ramas.
 *
 * LA RUTA DEL MÓDULO NUNCA CAE EN UNA RAMA. Es la bifurcación: estando
 * parado aquí, el riel tiene que mostrar las ramas y no las pantallas de
 * una de ellas. Por eso «Todas» se mudó a /acciones/todas.
 */
export default async function AccionesPortada() {
  const [permisos, acc, hz] = await Promise.all([
    misPermisos(),
    leerAcciones(),
    leerHallazgos(),
  ]);

  const modulo = MODULOS.find((m) => m.id === "acciones")!;
  /* SOLO LAS RAMAS QUE EL ROL TIENE ABIERTAS. Pintar una tarjeta que
     lleva a un «no tienes permiso» manda a alguien a estrellarse
     contra una puerta. */
  const ramas = (modulo.ramas ?? []).filter((r) =>
    modulo.secciones.some((s) => s.rama === r.id && permisos.puedeVer(s.ruta)));

  const vencidas = acc.falta ? 0 : acc.acciones.filter((a) => a.vencida).length;
  const vivas = acc.falta ? 0 : acc.acciones.filter((a) => a.viva).length;
  const sinDueno = acc.falta ? 0 : acc.acciones.filter((a) => a.viva && a.sin_dueno).length;

  const abiertos = hz.falta ? 0
    : hz.hallazgos.filter((h) => h.estado === "borrador" || h.estado === "firme").length;
  const sinRedaccion = hz.falta ? 0 : hz.hallazgos.filter((h) => h.falta_redaccion).length;
  const conAccion = hz.falta ? 0 : hz.hallazgos.filter((h) => h.tiene_accion).length;

  const CIFRA: Record<string, { n: string; u: string; pie: string; mal: boolean } | null> = {
    ol: acc.falta ? null : {
      n: String(vivas), u: vivas === 1 ? "acción" : "acciones",
      /* LO VENCIDO ES LO QUE APURA, y va en el pie porque es lo que
         convierte «13 abiertas» en algo que alguien hace hoy. */
      pie: vencidas
        ? `abiertas · ${vencidas} ya vencida${vencidas === 1 ? "" : "s"}`
        : sinDueno
          ? `abiertas · ${sinDueno} sin responsable`
          : "abiertas, ninguna vencida",
      mal: vencidas > 0,
    },
    abi: hz.falta ? null : {
      n: String(abiertos), u: abiertos === 1 ? "hallazgo" : "hallazgos",
      /* SIN REDACCIÓN NO PUEDEN SALIR EN EL INFORME: es el trabajo
         pendiente de esta rama, no un error. */
      pie: sinRedaccion
        ? `sin cerrar · ${sinRedaccion} esperan su redacción`
        : abiertos
          ? "sin cerrar, todos redactados"
          : "sin cerrar",
      mal: false,
    },
  };

  return (
    <div className="ac ac-portada">
      <section className="ac-p-cabeza">
        <p className="ojo">ACCIONES · LO QUE SE ENCONTRÓ MAL · CD38 AG01</p>
        <h1>¿Qué vas a mirar?</h1>
        <p className="sub">
          Dos formas de encontrar lo que está mal y dos ritmos distintos: el <b>OL</b> abre
          acciones todos los días, con responsable y plazo; <b>ABI</b> levanta hallazgos el día
          de la auditoría, con evidencia y redacción. <b>No se suman</b> — un hallazgo puede
          solo documentarse, y una acción puede nacer de un reporte que nadie auditó.
        </p>
      </section>

      <div className="ac-p-ramas">
        {ramas.map((r) => {
          const c = CIFRA[r.id];
          return (
            <Link key={r.id} href={r.ruta} className="ac-p-rama">
              <span className="ac-p-corte" aria-hidden />
              <span className="ac-p-rot">{r.eyebrow}</span>
              <span className="ac-p-nom">{r.nombre}</span>
              <span className="ac-p-des">{r.descripcion}</span>
              {c && (
                <span className={"ac-p-cifra" + (c.mal ? " mal" : "")}>
                  <b>{c.n}</b><i>{c.u}</i>
                  <em>{c.pie}</em>
                </span>
              )}
              <span className="ac-p-entrar">Entrar <svg viewBox="0 0 24 24" fill="none"
                strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 7l5 5-5 5" /></svg></span>
            </Link>
          );
        })}
      </div>

      {/* LA ÚNICA CIFRA QUE CRUZA LAS DOS RAMAS, y por eso va aparte y
          no dentro de una tarjeta: metida en una de las dos parecería
          suya. */}
      {!hz.falta && conAccion > 0 && (
        <div className="ac-p-cruce">
          <b>{conAccion}</b> de los hallazgos de ABI ya abrieron su acción en OL. Es lo único
          que suman las dos ramas: lo demás mide cosas distintas.
        </div>
      )}

      {ramas.length === 0 && (
        <div className="ac-p-aviso">
          Tu rol no tiene abierta ninguna de las dos ramas de Acciones. Pídele al administrador
          que te dé permiso en <b>Administración → Roles</b>.
        </div>
      )}

      {hz.falta && (
        <div className="ac-p-aviso">
          <b>Falta crear la rama de ABI en Supabase.</b> Abre el editor de SQL y corre{" "}
          <code>supabase/migraciones/2026-09-acciones-abi-hallazgos.sql</code>. Se puede correr
          varias veces sin romper nada. Mientras tanto, OL funciona igual.
        </div>
      )}
    </div>
  );
}
