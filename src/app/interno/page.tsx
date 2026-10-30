import { notFound } from "next/navigation";
import { abierto, dueno } from "@/modulos/consumo/acceso";
import { armarPanel } from "@/modulos/consumo/datos";
import { Codigo } from "./Codigo";
import { Consumo } from "./Consumo";

export const dynamic = "force-dynamic";

export default async function Page() {
  const d = await dueno();
  if (!d.ok) notFound();                       // para todos los demás, esta dirección no existe
  if (!(await abierto(d.id))) return <Codigo />;
  return <Consumo panel={await armarPanel()} />;
}
