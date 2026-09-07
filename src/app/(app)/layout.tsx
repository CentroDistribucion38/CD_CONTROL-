import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navegacion } from "@/components/Navegacion";

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
    .select("nombre, rol")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Navegacion
        nombre={perfil?.nombre ?? user.email ?? "Usuario"}
        rol={perfil?.rol ?? "operador"}
      />
      <main className="flex-1 overflow-x-hidden p-5 md:p-8">{children}</main>
    </div>
  );
}
