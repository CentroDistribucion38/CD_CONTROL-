import Link from "next/link";
import { RUTA_FIRMA } from "@/modulos/roturas/firmas";
import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import { enDesacuerdo, roturas as leerRoturas } from "@/modulos/roturas/datos";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Desacuerdos } from "./Desacuerdos";

export const dynamic = "force-dynamic";

/**
 * LOS DESACUERDOS — la bandeja de ABI, y la única donde ABI decide.
 *
 * Antes de invertir la cadena, ABI decidía TODO de entrada y esta
 * pantalla no existía. Ahora ABI solo ve lo que el operador logístico
 * objetó: es más corta a propósito, y esa es la mejora.
 */
export default async function DesacuerdosPage() {
  const [permisos, datos, todas, nombres] = await Promise.all([
    misPermisos(), enDesacuerdo(), leerRoturas(1000), nombresTodos(),
  ]);

  if (datos.falta) {
    return (
      <div className="rt">
        <section className="cabeza">
          <div>
            <p className="ojo">ROTURAS · EN SITIO · DESACUERDOS</p>
            <h1>Falta crear esta parte en Supabase</h1>
            <p className="sub">
              Esta pantalla vive de la cadena nueva. Abre el editor de SQL y corre
              <b> supabase/migraciones/2026-09-roturas-visto-bueno-easy.sql</b>. Se puede correr
              varias veces sin romper nada.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const puedeResolver = permisos.puedeEditar(RUTA_FIRMA.desacuerdos);

  /* LAS TRES CIFRAS DE LA CONCILIACIÓN, y no «cuántas roturas hay».
     La pregunta de ABI a fin de mes es: de lo que se cobra, ¿cuánto se
     acordó y cuánto hubo que pelear? Un solo número «se cobra» borraría
     justo el dato por el que se hace una conciliación. */
  const porAcuerdo = todas.roturas.filter((r) => r.cobro_por === "acuerdo").length;
  const porAbi = todas.roturas.filter((r) => r.cobro_por === "abi").length;
  const noCuentan = todas.roturas.filter((r) => r.estado === "no_cuenta").length;
  const enJuego = datos.roturas.reduce((s, r) => s + r.unidades_vidrio, 0);

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · DESACUERDOS</p>
          <h1>Lo que hay que resolver</h1>
          <p className="sub">
            Solo llega aquí lo que el operador logístico <b>no aceptó</b>, con su motivo y su
            evidencia. Lo que aceptó ya se fue a cobro sin pasar por esta pantalla — por eso
            esta bandeja es corta. Lo que decidas aquí es <b>definitivo</b>.
          </p>
        </div>
        <div className="kpi">
          <span className="corte" aria-hidden />
          <div className="rot">ESPERANDO TU DECISIÓN</div>
          <div className="num">{datos.roturas.length}</div>
          <div className="pie"><b>{enJuego}</b> unidades en juego</div>
        </div>
      </section>

      {/* CÓMO SE ESTÁ CONCILIANDO. Si «por acuerdo» es mucho mayor que
          «lo sostuvo ABI», la cadena está funcionando: las partes se
          entienden solas. Si se parecen, hay algo de fondo que discutir
          que no se arregla rotura por rotura. */}
      <div className="cadena">
        <div className="eslabon">
          <div className="n">{porAcuerdo}</div>
          <div className="r">A COBRO POR ACUERDO</div>
        </div>
        <div className="flecha" aria-hidden>·</div>
        <div className="eslabon aqui">
          <div className="n">{datos.roturas.length}</div>
          <div className="r">EN DESACUERDO</div>
        </div>
        <div className="flecha" aria-hidden>·</div>
        <div className="eslabon">
          <div className="n">{porAbi}</div>
          <div className="r">LO SOSTUVO ABI</div>
        </div>
        <div className="flecha" aria-hidden>·</div>
        <div className="eslabon mal">
          <div className="n">{noCuentan}</div>
          <div className="r">NO SE COBRAN</div>
        </div>
      </div>

      {!puedeResolver && (
        <div className="aviso">
          Estás viendo la bandeja, pero resolver es de quien tenga <b>Editar</b> en esta
          pantalla — ABI. Los botones aparecen cuando tengas ese permiso.
        </div>
      )}

      <Desacuerdos roturas={datos.roturas} nombres={nombres} puedeResolver={puedeResolver} />

      <div className="aviso">
        <b>Esto no se devuelve.</b> Una vez resuelto, se acabó: es lo que quiere decir «la
        última palabra». Lo que el operador logístico aceptó se puede ver en{" "}
        <Link href="/roturas/en-sitio/analisis">Análisis</Link>, pero no pasa por aquí.
      </div>
    </div>
  );
}
