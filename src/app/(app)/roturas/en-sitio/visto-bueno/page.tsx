import { RUTA_FIRMA } from "@/modulos/roturas/firmas";
import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { porRevisar, roturas as leerRoturas } from "@/modulos/roturas/datos";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { VistoBueno } from "./VistoBueno";

export const dynamic = "force-dynamic";

export default async function VistoBuenoPage() {
  const [permisos, datos, todas, nombres] = await Promise.all([
    misPermisos(), porRevisar(), leerRoturas(1000), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  /* Quien tiene EDITAR en Visto bueno (o administra), no un rol con
     cierto nombre. Mismo criterio que rotura_puede('visto_bueno') en la base. Las dos
     capas dicen lo mismo, pero la que protege es la de abajo: a una
     pantalla escondida se llega igual escribiendo la URL. */
  const puedeDecidir = permisos.puedeEditar(RUTA_FIRMA.visto_bueno);

  /* El mismo montón en tres momentos. Tres cifras en fila con flechas
     se leen como un recorrido; tres cajas iguales se leen como tres
     medidas distintas, que es otra cosa. */
  const cuentan = todas.roturas.filter((r) => r.estado === "cuenta").length;
  const noCuentan = todas.roturas.filter((r) => r.estado === "no_cuenta").length;
  const enPleito = todas.roturas.filter((r) => r.etapa === "desacuerdo").length;
  const enJuego = datos.roturas.reduce((s, r) => s + r.unidades_vidrio, 0);

  const viejo = datos.roturas.length
    ? Math.max(...datos.roturas.map((r) => r.minutos))
    : 0;

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · VISTO BUENO DEL OPERADOR LOGÍSTICO</p>
          <h1>¿Estás de acuerdo?</h1>
          <p className="sub">
            Lo que el turno registró, esperando tu respuesta. Lo que aceptes <b>pasa a cobro
            de una</b> y no le llega a ABI: queda en la data del mes. Lo que objetes va a ABI
            con tu motivo y tu evidencia, y ahí ABI tiene la última palabra.
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">ESPERANDO TU RESPUESTA</div>
          <div className="num">{datos.roturas.length}</div>
          <div className="pie">
            <b>{enJuego}</b> unidades en juego
            {viejo > 0 && ` · la más vieja, ${viejo < 60 ? `${viejo} min` : `${Math.round(viejo / 60)} h`}`}
          </div>
        </div>
      </section>

      {/* LA CADENA, COMO ES AHORA. Cuatro eslabones y no tres: el
          desacuerdo es un sitio donde una rotura se queda, no un paso
          invisible, y quien mira la bandeja tiene que poder ver cuántas
          hay paradas ahí esperando a ABI. */}
      <div className="cadena">
        <div className="eslabon aqui">
          <div className="n">{datos.roturas.length}</div>
          <div className="r">ESPERAN TU RESPUESTA</div>
        </div>
        <div className="flecha" aria-hidden>›</div>
        <div className="eslabon">
          <div className="n">{cuentan}</div>
          <div className="r">A COBRO</div>
        </div>
        <div className="flecha" aria-hidden>›</div>
        <div className="eslabon">
          <div className="n">{enPleito}</div>
          <div className="r">EN DESACUERDO · ABI</div>
        </div>
        <div className="flecha" aria-hidden>›</div>
        <div className="eslabon mal">
          <div className="n">{noCuentan}</div>
          <div className="r">NO SE COBRAN</div>
        </div>
      </div>

      {!puedeDecidir && (
        <div className="aviso">
          Estás viendo la bandeja, pero contestar es de quien tenga <b>Editar</b> en esta
          pantalla — el operador logístico. Los botones aparecen cuando tengas ese permiso.
        </div>
      )}

      {datos.vieja && (
        <div className="aviso rojo">
          <b>Falta correr el SQL de la cadena nueva.</b> Mientras tanto esta bandeja mezcla lo
          que espera tu respuesta con lo que ya objetaste. Se arregla corriendo
          <b> supabase/migraciones/2026-09-roturas-visto-bueno-easy.sql</b>.
        </div>
      )}

      <VistoBueno roturas={datos.roturas} nombres={nombres} puedeDecidir={puedeDecidir} />
    </div>
  );
}
