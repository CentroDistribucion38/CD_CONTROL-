import { redirect } from "next/navigation";

/* Programar PET ahora es una vista de Traspasos › PET. Los enlaces viejos llegan ahí. */
export default function ProgramarPetPage() {
  redirect("/traspasos/pet");
}
