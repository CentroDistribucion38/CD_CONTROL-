import { misPermisos } from "@/lib/permisos";
import { zonas, motivos, parametros } from "@/modulos/acciones/datos";
import "./acciones.css";
import { BarraAbajo } from "./BarraAbajo";
import { Cola } from "./Cola";

/**
 * El cascarón del módulo. Existe por la barra de abajo del celular: los
 * datos que necesita —las zonas y los motivos, para poder abrir el
 * reporte desde cualquier pantalla— se traen UNA vez aquí y no en cada
 * página. En un layout, Next no los vuelve a pedir al cambiar de sección
 * dentro del módulo, así que moverse entre Mis acciones y Por verificar
 * no repite esas dos consultas.
 */
export default async function AccionesLayout({ children }: { children: React.ReactNode }) {
  const [permisos, zs, ms, par] = await Promise.all([
    misPermisos(), zonas(), motivos(), parametros(),
  ]);

  return (
    <>
      {/* El aviso de lo que quedó guardado sin señal. Va en el cascarón
          para que se vea desde cualquier pantalla del módulo, y se
          esconde solo cuando no hay nada pendiente. */}
      <div className="ac" style={{ gap: 0 }}><Cola /></div>
      {children}
      <BarraAbajo zonas={zs} motivos={ms} plazos={par.plazos}
                  puedeEditar={permisos.puedeEditar("/acciones")} />
    </>
  );
}
