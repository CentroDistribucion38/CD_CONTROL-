import { redirect } from "next/navigation";

/**
 * VERIFICACIÓN YA NO EXISTE — esto es el desvío.
 *
 * «Quita lo de Verificación: que solo sean dos firmas, dos procesos.»
 * La salida va de Pesar a Validación y esta etapa se fue: ya no está en
 * el menú, no tiene firma que poner y `salida_firmar` la rechaza por
 * nombre.
 *
 * PERO LA DIRECCIÓN SE QUEDA, redirigiendo. Borrar el archivo dejaría
 * un 404 a quien tenga la página guardada en favoritos o abierta en una
 * pestaña desde ayer —y en la bodega hay computadores que no se cierran
 * en semanas—. Un 404 se lee como «la aplicación se rompió»; un desvío
 * a Validación se lee como lo que es: eso se movió.
 *
 * Es de una línea y se puede borrar el día que ya nadie llegue aquí.
 */
export default function VerificacionSeFuePage() {
  redirect("/roturas/salida/validacion");
}
