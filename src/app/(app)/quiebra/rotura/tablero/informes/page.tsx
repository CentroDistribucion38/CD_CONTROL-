import { misPermisos } from "@/lib/permisos";
import { maestros, tablero, hojasGuardadas } from "@/modulos/rotlinea/datos";
import "../../rotura.css";
import { Periodo } from "../Periodo";
import { Pestanas } from "../Pestanas";
import { Informes } from "./Informes";

export const dynamic = "force-dynamic";

const hoyLocal = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/**
 * INFORMES GENERADOS — la hoja del tablero que es solo de las hojas del
 * día que se generaron: verlas, descargarlas y, quien administra,
 * anularlas.
 *
 * MISMO PERMISO QUE EL TABLERO: es una hoja suya. Quien ve el tablero ve
 * sus informes; no hace falta otra casilla en Roles que alguien tendría
 * que acordarse de marcar.
 *
 * POR DEFECTO, LOS ÚLTIMOS 30 DÍAS: lo que se busca aquí es el papel de
 * esta semana o de la pasada, no el del año.
 */
export default async function InformesPage({ searchParams }: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const q = await searchParams;
  const hoy = hoyLocal();
  const fecha = (s: string | undefined, x: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? "") ? s! : x);
  const desde = fecha(q.desde, new Date(Date.parse(hoy + "T12:00:00") - 29 * 86400_000).toISOString().slice(0, 10));
  const hasta = fecha(q.hasta, hoy);

  const [permisos, m, t, hj] = await Promise.all([
    misPermisos(), maestros(), tablero(desde, hasta), hojasGuardadas(desde, hasta),
  ]);

  if (!permisos.puedeVer("/quiebra/rotura/tablero")) {
    return (
      <div className="rl">
        <section className="rl-sin-tablas">
          <h2>Esta pantalla no es para tu rol</h2>
          <p>Los informes generados los ve quien ve el tablero de rotura.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="rl">
      <Pestanas actual="informes" desde={desde} hasta={hasta}
                informes={hj.falta ? undefined : hj.hojas.filter((h) => h.anulada_en == null).length} />
      <Periodo desde={desde} hasta={hasta} hoy={hoy} lineas={m.lineas}
               base="/quiebra/rotura/tablero/informes" conLinea={false} />
      {hj.falta ? (
        <section className="rl-sin-tablas">
          <h2>Falta preparar los informes en Supabase</h2>
          <p>
            Ejecuta <code>supabase/migraciones/2026-09-rotura-linea-hojas.sql</code>. Crea el
            espacio donde se guardan los PDF y la lista de los que se generaron.
          </p>
        </section>
      ) : (
        <Informes hojas={hj.hojas} dias={t.dias} puedeAnular={permisos.manda} desde={desde} hasta={hasta} />
      )}
    </div>
  );
}
