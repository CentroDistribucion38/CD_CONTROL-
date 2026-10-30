"use server";

import { redirect } from "next/navigation";
import { abrir, cerrar, codigoCorrecto, dueno } from "@/modulos/consumo/acceso";

export async function entrar(_: { mal?: boolean } | null, datos: FormData): Promise<{ mal?: boolean }> {
  const d = await dueno();
  if (!d.ok) return { mal: true };
  if (!codigoCorrecto(String(datos.get("codigo") ?? ""))) {
    await new Promise((r) => setTimeout(r, 1500));   // frena el probar códigos uno tras otro
    return { mal: true };
  }
  await abrir(d.id);
  redirect("/interno");
}

export async function salir() {
  await cerrar();
  redirect("/");
}
