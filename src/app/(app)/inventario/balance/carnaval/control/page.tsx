import { redirect } from "next/navigation";

/** AG07 Carnaval ahora vive dentro del Cuadre SAP: este enlace viejo lo lleva allá. */
export default function Page() { redirect("/inventario/balance/cuadre?alm=AG07&sub=control") }
