import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BarraSuperior } from "@/components/BarraSuperior";
import { Navegacion } from "@/components/Navegacion";
import "./shell.css";

function turnoActual(): string {
  const ahora = new Date();
  const hora = Number(
    ahora.toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      hour12: false,
    })
  );
  const reloj = ahora.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const turno = hora >= 6 && hora < 14 ? 1 : hora >= 14 && hora < 22 ? 2 : 3;
  return `Turno ${turno} · ${reloj}`;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("usuario, nombre, rol")
    .eq("id", user.id)
    .single();

  const nombre = perfil?.nombre || perfil?.usuario || "Usuario";
  const rol = perfil?.rol ?? "operador";

  return (
    <div className="sh flex min-h-screen flex-col">
      <BarraSuperior usuario={nombre} turno={turnoActual()} />
      <div className="flex flex-1 flex-col md:flex-row">
        <Navegacion nombre={nombre} rol={rol} />
        <main className="flex-1 overflow-x-hidden p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
