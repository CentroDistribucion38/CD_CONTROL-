import { redirect } from "next/navigation";

/**
 * LA PORTADA VIEJA DE ROTURAS.
 *
 * Roturas dejó de ser un módulo aparte: se mudó dentro de Quiebra, como
 * dos de sus tres ramas —«En sitio» y «Salida»—, y la pantalla que
 * escoge rama es ahora /quiebra. Esta hacía exactamente ese trabajo para
 * dos ramas; tenerla también sería la misma bifurcación dicha dos veces,
 * y dos portadas que se parecen es cómo alguien acaba en la de menos.
 *
 * NO SE BORRA, MANDA PARA ALLÁ. Hay gente con este enlace guardado —en
 * la app instalada no hay barra de direcciones donde corregirlo— y un
 * 404 en su sitio parecería que el módulo desapareció. Un redirect
 * cuesta una línea y se puede quitar el día que ya nadie llegue por
 * aquí.
 *
 * Y LAS PANTALLAS DE ADENTRO NO SE MOVIERON: /roturas/en-sitio y
 * /roturas/salida siguen donde estaban, con todo lo que cuelga de ellas.
 * Los permisos de cada persona están guardados en la base como el TEXTO
 * de la dirección, así que moverlas habría dejado a media bodega sin sus
 * pantallas EN SILENCIO — sin error, simplemente sin verse.
 */
export default function RoturasPortadaVieja() {
  redirect("/quiebra");
}
