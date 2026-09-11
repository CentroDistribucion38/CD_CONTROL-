import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { MODULOS } from "@/modulos/registro";
import { roturas as leerRoturas, salidas as leerSalidas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "./roturas.css";
import { SinTablas } from "./comunes";

export const dynamic = "force-dynamic";

/**
 * LA PORTADA DE ROTURAS — dos ramas, y hay que escoger una.
 *
 * ESTA PANTALLA EXISTE PARA SEPARAR, no para decorar. En sitio cuenta
 * UNIDADES por causa y proceso: contesta de quién fue la rotura y de
 * dónde salió. La salida pesa KILOS de vidrio: contesta cuánto vidrio
 * salió por la puerta. Y no se cuadran entre sí — una botella de 330 y
 * una de 750 pesan distinto, el vidrio se acumula días antes de salir, y
 * parte de lo que se pesa nunca se contó en sitio.
 *
 * Con las siete pantallas en una sola lista, tarde o temprano alguien
 * lee las unidades de arriba y los kilos de abajo como si fueran la
 * misma cuenta, y arma un informe con un factor de conversión inventado.
 * La bifurcación es lo que impide esa lectura.
 *
 * Cada tarjeta trae su cifra viva —lo que espera visto bueno, lo que
 * está abierto sin firmar— porque una portada que solo repite dos
 * nombres es un clic de peaje: quien entra ya sabía adónde iba.
 */
export default async function RoturasPortada() {
  const [permisos, rot, sal] = await Promise.all([
    misPermisos(), leerRoturas(400), leerSalidas(200),
  ]);

  if (rot.falta) return <div className="rt"><SinTablas /></div>;

  const modulo = MODULOS.find((m) => m.id === "roturas")!;
  const ramas = (modulo.ramas ?? []).filter((r) =>
    modulo.secciones.some((s) => s.rama === r.id && permisos.puedeVer(s.ruta)));

  const esperando = rot.roturas.filter((r) => r.esperando).length;
  const sinFoto = rot.roturas.filter((r) => r.le_falta_foto && r.estado !== "anulada").length;
  const abiertas = sal.salidas.filter((s) => s.estado === "abierta");
  const porFirmar = sal.salidas.filter((s) => s.estado === "cerrada" && !s.completa).length;
  const kgAbiertos = abiertas.reduce((t, s) => t + Number(s.neto_kg), 0);

  /* La cifra de cada rama, en la unidad de esa rama. Nunca una suma de
     las dos: no existe. */
  const CIFRA: Record<string, { n: string; u: string; pie: string; mal: boolean }> = {
    "en-sitio": {
      n: String(esperando), u: esperando === 1 ? "rotura" : "roturas",
      pie: sinFoto
        ? `esperando visto bueno · ${sinFoto} sin la foto que exige su causa`
        : "esperando el visto bueno de ABI",
      mal: sinFoto > 0,
    },
    salida: {
      n: kilos(kgAbiertos), u: "kg",
      pie: porFirmar
        ? `en ${abiertas.length} salida${abiertas.length === 1 ? "" : "s"} abierta${abiertas.length === 1 ? "" : "s"} · ${porFirmar} esperando firma`
        : `en ${abiertas.length} salida${abiertas.length === 1 ? "" : "s"} abierta${abiertas.length === 1 ? "" : "s"}`,
      mal: porFirmar > 0,
    },
  };

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · VIDRIO Y PRODUCTO ROTO · CD38 AG01</p>
          <h1>¿Qué vas a hacer?</h1>
          <p className="sub">
            El módulo mide dos cosas y no se mezclan. Arriba se cuentan <b>unidades</b> por causa
            y por proceso; abajo se pesan <b>kilos</b> de vidrio. Ninguna pantalla suma las dos,
            porque no existe el factor que convierta una en la otra.
          </p>
        </div>
      </section>

      <div className="ramas">
        {ramas.map((r) => {
          const c = CIFRA[r.id];
          return (
            <Link key={r.id} href={r.ruta} className="rama">
              <span className="corte" aria-hidden />
              <span className="rot">{r.eyebrow}</span>
              <span className="nom">{r.nombre}</span>
              <span className="des">{r.descripcion}</span>
              {c && (
                <span className={"cifra-rama" + (c.mal ? " mal" : "")}>
                  <b>{c.n}</b><i>{c.u}</i>
                  <em>{c.pie}</em>
                </span>
              )}
              <span className="entrar">Entrar <svg viewBox="0 0 24 24" fill="none"
                strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 7l5 5-5 5" /></svg></span>
            </Link>
          );
        })}
      </div>

      {ramas.length === 0 && (
        <div className="aviso rojo">
          Tu rol no tiene abierta ninguna de las dos ramas de Roturas. Pídele al administrador
          que te dé permiso en <b>Administración → Roles</b>.
        </div>
      )}
    </div>
  );
}
