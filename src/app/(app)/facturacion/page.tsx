import { redirect } from "next/navigation";

/**
 * FACTURACIÓN SE MUDÓ DENTRO DE TRASPASOS: /traspasos/facturacion.
 *
 * «No debías crearlo allí, sino en el mismo módulo.» Es el paso siguiente
 * del mismo viaje, y va como pantalla de Traspasos, después de Registrar.
 * Esta dirección se queda y manda para allá: alguien ya la guardó.
 */
export default function FacturacionVieja() {
  redirect("/traspasos/facturacion");
}
