import { misPermisos } from "@/lib/permisos";
import { usuarioActual } from "@/lib/sesion";
import { misAcciones, zonas, motivos, parametros } from "@/modulos/acciones/datos";
import "../acciones.css";
import { SinTablas } from "../comunes";
import { Alerta } from "../Alerta";
import { Mias } from "./Mias";

export const dynamic = "force-dynamic";

export default async function MisAccionesPage() {
  const user = await usuarioActual();

  const [permisos, datos, zs, ms, par] = await Promise.all([
    misPermisos(),
    misAcciones(user?.id ?? ""),
    zonas(),
    motivos(),
    parametros(),
  ]);

  if (datos.falta) return <div className="ac"><SinTablas /></div>;

  /* Las tres cifras de la alerta se cuentan aquí, sobre lo que ya se
     trajo: pedirle a la base tres consultas más para contar lo que está
     en la mano es lento por gusto.
     "Hoy" se compara contra el FINAL del día en hora local y no contra
     "ahora + 24 h": algo que vence mañana a las 6 a. m. no es hoy aunque
     falten menos de veinticuatro horas. */
  const finDelDia = new Date(); finDelDia.setHours(23, 59, 59, 999);
  const vencidas = datos.acciones.filter((a) => a.vencida).length;
  const hoy = datos.acciones.filter(
    (a) => a.viva && !a.vencida && new Date(a.vence_en) <= finDelDia).length;
  /* Recién asignadas: las que llegaron en el último turno y siguen
     abiertas. No hay "leído/no leído" en la base —eso sería otra tabla y
     otra cosa que mantener—, así que se usa el tiempo desde que se
     asignó, que contesta la misma pregunta: ¿esto es nuevo para mí? */
  const sinVer = datos.acciones.filter(
    (a) => a.viva && a.asignada_en &&
      Date.now() - new Date(a.asignada_en).getTime() < 8 * 3600_000).length;

  return (
    <div className="ac">
      <Alerta vencidas={vencidas} hoy={hoy} sinVer={sinVer} esMio />
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES CORRECTIVAS · CD38 AG01</p>
          <h1>Mis acciones</h1>
          <p className="sub">
            Lo tuyo de hoy. El tablero queda de segundo: en el celular no se analiza, se resuelve.
            Cerrar una acción es decir qué hiciste — después alguien va a ir a mirar si sirvió.
          </p>
        </div>
      </section>

      <Mias
        acciones={datos.acciones}
        zonas={zs}
        motivos={ms}
        plazos={par.plazos}
        puedeEditar={permisos.puedeEditar("/acciones/mias")}
        manda={permisos.manda}
      />
    </div>
  );
}
