import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/sesion";
import { BarraSuperior } from "@/components/BarraSuperior";
import { Marco } from "@/components/Marco";
import { misPermisos } from "@/lib/permisos";
import { ClaveProvisional } from "@/components/ClaveProvisional";
import { RecordarTema } from "@/components/RecordarTema";
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
  const user = await usuarioActual();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const nombre = perfil?.nombre || perfil?.usuario || "Usuario";

  /* CLAVE PROVISIONAL: la puerta cerrada.
     Va AQUÍ, en el cascarón que envuelve todas las rutas, y no en un
     aviso dentro de cada pantalla: un aviso se cierra y se olvida, y
     escribir otra URL a mano lo saltaría. Esto reemplaza la aplicación
     entera hasta que la clave cambie.
     Seis dígitos son un millón de combinaciones; como clave permanente se
     adivina igual, así que no puede quedar por descuido. */
  if (perfil?.clave_provisional === true) {
    return (
      <div className="sh flex min-h-screen flex-col"
           data-tema={perfil?.tema === "oficial" ? undefined : perfil?.tema}>
        <ClaveProvisional id={user.id} nombre={nombre} />
      </div>
    );
  }

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
      data-tema={
        perfil?.tema && perfil.tema !== "oficial" ? String(perfil.tema) : undefined
      }
    >
      {/* Deja anotado el tema en este equipo para que la pantalla de
          entrada se pinte igual la próxima vez. */}
      <RecordarTema tema={String(perfil?.tema ?? "oficial")} />
      <BarraSuperior usuario={nombre} turno={turnoActual()} />
      <Marco permitidas={permitidas}>{children}</Marco>
    </div>
  );
}
