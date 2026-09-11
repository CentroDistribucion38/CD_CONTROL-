import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { porRevisar } from "@/modulos/roturas/datos";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { VistoBueno } from "./VistoBueno";

export const dynamic = "force-dynamic";

export default async function VistoBuenoPage() {
  const [permisos, datos, nombres] = await Promise.all([
    misPermisos(), porRevisar(), nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  /* Mismo criterio que rotura_puede('visto_bueno') en la base. Las dos
     capas dicen lo mismo, pero la que protege es la de abajo: a una
     pantalla escondida se llega igual escribiendo la URL. */
  const puedeDecidir = permisos.manda || permisos.rol === "abi";

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
          <div className="corte" aria-hidden />
          <div className="rot">LA MÁS VIEJA ESPERANDO</div>
          <div className="num">
            {viejo < 60 ? viejo : Math.round(viejo / 60)}
            <span className="u">{viejo < 60 ? "min" : "horas"}</span>
          </div>
          <div className="pie">
            {datos.roturas.length
              ? `${datos.roturas.length} en la bandeja`
              : "Nada esperando"}
          </div>
        </div>
      </section>

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
