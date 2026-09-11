import { notFound, redirect } from "next/navigation";
import { misPermisos } from "@/lib/permisos";
import { createClient } from "@/lib/supabase/server";
import { nombresTodos } from "@/modulos/sider/datos";
import { carga, parametros, type Accion } from "@/modulos/acciones/datos";
import "../../acciones.css";
import { SinTablas } from "../../comunes";
import { Asignar } from "./Asignar";

export const dynamic = "force-dynamic";

export default async function AsignarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [permisos, quienes, par, nombres, una] = await Promise.all([
    misPermisos(),
    carga(),
    parametros(),
    nombresTodos(),
    /* Solo la acción que se va a asignar. Traer las 500 para usar una es
       la clase de cosa que no se nota hasta que hay 4.000. */
    supabase.from("v_acciones").select("*").eq("id", id).maybeSingle(),
  ]);

  if (una.error && /does not exist|schema cache/i.test(una.error.message)) {
    return <div className="ac"><SinTablas /></div>;
  }
  if (!una.data) notFound();

  /* El permiso se comprueba aquí y no solo escondiendo el botón: a esta
     dirección se llega escribiéndola. La base lo rechazaría igual —la
     función pide es_editor()—, pero es mejor no dejar entrar a una
     pantalla que no va a funcionar. */
  if (!permisos.puedeEditar("/acciones")) redirect("/acciones");

  const accion = una.data as Accion;

  return (
    <div className="ac">
      <Asignar
        accion={accion}
        carga={quienes}
        nombres={nombres}
        saturado={par.par["carga_saturado"] ?? 10}
      />
    </div>
  );
}
