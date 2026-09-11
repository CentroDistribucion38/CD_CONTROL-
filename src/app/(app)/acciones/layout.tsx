import { misPermisos } from "@/lib/permisos";
import { zonas, motivos, parametros } from "@/modulos/acciones/datos";
import "./acciones.css";
import { BarraAbajo } from "./BarraAbajo";

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
      {children}
      <BarraAbajo zonas={zs} motivos={ms} plazos={par.plazos}
                  puedeEditar={permisos.puedeEditar("/acciones")} />
    </>
  );
}
