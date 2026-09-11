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

  /* Mismo criterio que rotura_puede('visto_bueno') en la base. Las dos
     capas dicen lo mismo, pero la que protege es la de abajo: a una
     pantalla escondida se llega igual escribiendo la URL. */
  const puedeDecidir = permisos.manda || permisos.rol === "abi";

  /* El mismo montón en tres momentos. Tres cifras en fila con flechas
     se leen como un recorrido; tres cajas iguales se leen como tres
     medidas distintas, que es otra cosa. */
  const cuentan = todas.roturas.filter((r) => r.estado === "cuenta").length;
  const noCuentan = todas.roturas.filter((r) => r.estado === "no_cuenta").length;
  const enJuego = datos.roturas.reduce((s, r) => s + r.unidades_vidrio, 0);

  const viejo = datos.roturas.length
    ? Math.max(...datos.roturas.map((r) => r.minutos))
    : 0;

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · VISTO BUENO DE ABI</p>
          <h1>Cuenta o no cuenta</h1>
          <p className="sub">
            Lo que el turno registró, esperando la decisión. Una causa no asumida sin foto no se
            puede marcar como que cuenta: es lo que se devolvería de todas formas, y la base lo
            impide antes de que haya que explicarlo.
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">ESPERANDO VISTO BUENO</div>
          <div className="num">{datos.roturas.length}</div>
          <div className="pie">
            <b>{enJuego}</b> unidades en juego
            {viejo > 0 && ` · la más vieja, ${viejo < 60 ? `${viejo} min` : `${Math.round(viejo / 60)} h`}`}
          </div>
        </div>
      </section>

      <div className="cadena">
        <div className="eslabon aqui">
          <div className="n">{datos.roturas.length}</div>
          <div className="r">POR REVISAR</div>
        </div>
        <div className="flecha" aria-hidden>›</div>
        <div className="eslabon">
          <div className="n">{cuentan}</div>
          <div className="r">CUENTAN</div>
        </div>
        <div className="flecha" aria-hidden>›</div>
        <div className="eslabon mal">
          <div className="n">{noCuentan}</div>
          <div className="r">NO CUENTAN</div>
        </div>
      </div>

      {!puedeDecidir && (
        <div className="aviso">
          Estás viendo la bandeja, pero decidir es del rol <b>ABI</b> o del administrador.
          Los botones aparecen cuando tengas ese rol.
        </div>
      )}

      <VistoBueno roturas={datos.roturas} nombres={nombres} puedeDecidir={puedeDecidir} />
    </div>
  );
}
