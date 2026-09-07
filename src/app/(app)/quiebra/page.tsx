import { createClient } from "@/lib/supabase/server";
import { datosQuiebra } from "@/modulos/quiebra/datos";
import { TableroQuiebra } from "@/components/TableroQuiebra";

export const dynamic = "force-dynamic";

export default async function QuiebraPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: perfil }, datos] = await Promise.all([
    supabase.from("perfiles").select("rol").eq("id", user!.id).single(),
    datosQuiebra(),
  ]);

  const esEditor = perfil?.rol === "admin" || perfil?.rol === "supervisor";

  return (
    <TableroQuiebra
      bajas={datos.bajas}
      produccion={datos.produccion}
      metas={datos.metas}
      ultimaCarga={datos.ultimaCarga}
      esEditor={esEditor}
    />
  );
}
