import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BarraSuperior } from "@/components/BarraSuperior";
import { Marco } from "@/components/Marco";
import { misPermisos } from "@/lib/permisos";
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
    .select("*")
    .eq("id", user.id)
    .single();

  const nombre = perfil?.nombre || perfil?.usuario || "Usuario";
  const rol = perfil?.rol ?? "operador";

  /* Qué rutas puede ver esta persona. Se resuelve UNA vez aquí y baja al
     menú: si cada pantalla lo consultara por su cuenta serían quince
     consultas para dibujar una barra lateral. */
  const permisos = await misPermisos();
  const permitidas = [
    ...permisos.modulos.map((m) => m.ruta),
    ...permisos.modulos.flatMap((m) => m.secciones.map((x) => x.ruta)),
  ].filter((r) => permisos.puedeVer(r));

  return (
    /* El tema se resuelve AQUÍ, en el servidor, y baja ya puesto en el
       atributo. Si se resolviera en el navegador, la página se pintaría
       un instante con el tema oficial y luego saltaría al de la persona:
       ese parpadeo se ve feo y en un equipo de piso se ve peor. */
    <div
      className="sh flex min-h-screen flex-col"
      data-grande={perfil?.texto_grande === true ? "si" : undefined}
      data-tema={perfil?.tema === "ambar" ? "ambar" : undefined}
    >
      <BarraSuperior usuario={nombre} turno={turnoActual()} />
      <Marco rol={rol} permitidas={permitidas}>{children}</Marco>
    </div>
  );
}
