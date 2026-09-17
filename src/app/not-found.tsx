import Link from "next/link";
import { cookies } from "next/headers";
import "./no-existe.css";

/**
 * ESTA DIRECCIÓN NO EXISTE.
 *
 * VA EN LA RAÍZ Y NO DENTRO DE (app) a propósito: así también atrapa lo
 * que cae fuera del armazón —una dirección tecleada mal, un enlace
 * viejo, un acceso directo de la app instalada— y no solo las rutas que
 * ya pasaron por el layout con sesión.
 *
 * SE PINTA CON EL TEMA DEL EQUIPO, igual que la entrada. Quien llega
 * aquí puede no tener sesión, así que no hay tema suyo que leer en la
 * base; lo más cerca que se puede estar de acertar es el de la última
 * persona que entró en ese computador, que es lo que guarda la cookie.
 * Sin cookie entra el de la casa.
 *
 * Y NO PIDE PERDÓN NI CULPA A NADIE. Lo que hace falta aquí son dos
 * cosas: decir qué pasó —para que nadie se quede sin saber si la
 * aplicación se rompió o si se equivocó de dirección— y dar la salida.
 */
export const dynamic = "force-dynamic";

const TEMAS = new Set(["tinta", "pizarra", "ambar", "negro", "gris", "halo"]);

export default async function NoExiste() {
  const guardado = (await cookies()).get("tema_equipo")?.value;
  const tema = guardado && TEMAS.has(guardado)
    ? guardado
    : guardado === "oficial" ? undefined : "gris";

  return (
    <div className="nx" data-tema={tema}>
      <div className="nx-tarjeta">
        <div className="nx-marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-b.png" alt="Bavaria" />
          <span>CD38 · CONTROL</span>
        </div>

        <p className="nx-num">404</p>
        <h1>Esta dirección ya no existe</h1>
        <p>
          La plataforma se está construyendo y las pantallas se mueven. Lo más probable es
          que <b>esta la tenía abierta desde antes</b> y entró un cambio: al recargar, la
          dirección vieja ya no lleva a ningún lado.
        </p>
        <p>
          Nada se perdió y nada se rompió — lo que se hizo en esa pantalla está guardado.
          Lo que cambió es por dónde se llega.
        </p>

        <div className="nx-pie">
          <Link className="nx-btn" href="/inicio">Ir al inicio</Link>
          <Link className="nx-btn plano" href="/inventario">Inventario</Link>
        </div>
      </div>
    </div>
  );
}
