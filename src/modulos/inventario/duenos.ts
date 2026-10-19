/** A quién pertenece un envase que no es de la casa: se reasigna a ANDINA o HEINEKEN (en el Balance) y su casco viene con ese «código», en estibas. */
export const DUENOS_ENVASE = ["ANDINA", "HEINEKEN"] as const;
export const esDueno = (e: string | null | undefined) => DUENOS_ENVASE.includes(String(e ?? "").trim().toUpperCase() as (typeof DUENOS_ENVASE)[number]);
