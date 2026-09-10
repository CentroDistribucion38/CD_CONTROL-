import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { modulosVisibles } from "@/modulos/registro";
import { misPermisos, entradaDe } from "@/lib/permisos";
import { Perfil } from "./Perfil";
import "./perfil.css";

export const dynamic = "force-dynamic";

/**
 * Mi perfil. Se lee el perfil completo con select("*") a propósito: si
 * todavía no se corrió supabase/01-perfil.sql, las columnas nuevas
 * simplemente no vienen y la pantalla se muestra igual, en vez de
 * reventar con "column does not exist".
 */
export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const p = (data ?? {}) as Record<string, unknown>;

  /* "Al iniciar sesión, abrir" guarda una RUTA, y tiene que ser la misma
     adonde lleva la tarjeta del módulo: si la tarjeta abre Certificar y
     esta preferencia abre la Fuente principal, el módulo se comporta
     distinto según por dónde se entre. entradaDe() además comprueba que
     la persona pueda ver esa pantalla, para que nadie elija como página
     de inicio una a la que su rol no llega. */
  const permisos = await misPermisos();

  return (
    <Perfil
      id={user.id}
      usuario={String(p.usuario ?? "")}
      nombre={String(p.nombre ?? "")}
      rol={String(p.rol ?? "operador")}
      bodega={String(p.bodega ?? "Ag01 — Barranquilla")}
      turno={p.turno_habitual == null ? "" : String(p.turno_habitual)}
      moduloInicio={p.modulo_inicio == null ? "" : String(p.modulo_inicio)}
      textoGrande={p.texto_grande === true}
      tema={p.tema === "ambar" ? "ambar" : "oficial"}
      ultimoIngreso={user.last_sign_in_at ?? null}
      modulos={modulosVisibles(String(p.rol ?? "operador")).map((m) => ({
        id: m.id,
        nombre: m.nombre,
        ruta: entradaDe(m, permisos),
      }))}
    />
  );
}
