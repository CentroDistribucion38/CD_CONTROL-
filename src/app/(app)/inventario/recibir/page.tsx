import { misPermisos } from "@/lib/permisos";
import { usuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { maestroInventario } from "@/modulos/inventario/fefo";
import "../fefo.css";
import "./recibir.css";
import { Recibir } from "./Recibir";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · RECIBIR Y ROTULAR.
 *
 * Lo que entra al CD y el papel que se le pega a cada estiba.
 *
 * VA PRIMERO EN EL MENÚ DE INVENTARIO, antes de contar y antes del
 * FEFO, porque es el primer paso del proceso de verdad: el material
 * entra, se rotula, se ubica, y solo después se cuenta y se ordena por
 * vencimiento. El menú sigue el orden del proceso, no el orden en que
 * se construyeron las pantallas.
 *
 * EL MAESTRO ENTERO BAJA CON LA PÁGINA, igual que en el conteo: se abre
 * en el celular en el muelle, y reconocer el código MIENTRAS SE TECLEA
 * sin ir al servidor es lo que hace que no se sienta lento con señal de
 * bodega.
 */
export default async function RecibirPage() {
  const supabase = await createClient();
  const user = await usuarioActual();
  const [permisos, m, { data: perfil }] = await Promise.all([
    misPermisos(),
    maestroInventario(),
    supabase.from("perfiles").select("nombre").eq("id", user!.id).maybeSingle(),
  ]);
  const puedeRecibir = permisos.puedeEditar("/inventario/recibir");

  if (m.falta) {
    return (
      <div className="fe">
        <section className="sin-tablas">
          <h2>Falta preparar el inventario en Supabase</h2>
          <p>
            Abre el SQL Editor y ejecuta{" "}
            <code>supabase/migraciones/2026-09-inventario-fefo.sql</code> y después{" "}
            <code>supabase/datos/inventario-maestro-cd38.sql</code>, en ese orden. Sin el
            maestro no hay material que rotular ni ubicación donde ponerlo.
          </p>
        </section>
      </div>
    );
  }

  /* LA BODEGA DEL CD. Con una sola no se pregunta: preguntar algo que
     tiene una sola respuesta posible es un paso de más frente a un
     camión descargando. */
  const conUbicaciones = new Set(m.ubicaciones.map((u) => u.bodega_id));
  const bodega = m.bodegas.find((b) => conUbicaciones.has(b.id)) ?? m.bodegas[0] ?? null;
  const ubis = bodega
    ? m.ubicaciones.filter((u) => u.bodega_id === bodega.id && u.activa)
    : [];

  return (
    <div className="fe">
      <section className="cabeza">
        <div>
          <p className="ojo">INVENTARIO · RECIBIR · CD38 AG01</p>
          <h1>Recibir y rotular</h1>
          <p className="sub">
            Lo que entra al CD. Cada estiba sale con su rótulo: código y cantidad en letra
            grande para leerlos desde el pasillo, dónde queda, y un QR que la abre en el
            celular.
          </p>
        </div>
      </section>

      {/* POR AHORA NO SE GUARDA, Y SE DICE. Callarlo dejaría a alguien
          creyendo que el recibo quedó registrado y que el inventario ya
          lo tiene contado, que es exactamente el malentendido que
          descuadra un conteo. */}
      <div className="rc-aviso">
        <b>Por ahora esto solo imprime el rótulo: todavía no se guarda el recibo.</b>{" "}
        El inventario no se entera de lo que entra por aquí. Cuando esté la información de
        verdad se conecta, se guarda y el QR abre la estiba.
      </div>

      <Recibir
        materiales={m.materiales}
        ubicaciones={ubis}
        quien={perfil?.nombre ?? "—"}
        puedeRecibir={puedeRecibir}
      />
    </div>
  );
}
