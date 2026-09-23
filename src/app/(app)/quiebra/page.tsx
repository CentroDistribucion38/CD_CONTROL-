import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import { MODULOS } from "@/modulos/registro";
import { roturas as leerRoturas, salidas as leerSalidas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "./quiebra.css";

export const dynamic = "force-dynamic";

/**
 * LA PORTADA DE QUIEBRA — tres submódulos, y hay que escoger uno.
 *
 * ESTA PANTALLA EXISTE PARA SEPARAR, no para decorar. Los tres miden
 * material perdido y NINGUNO se suma con otro:
 *
 *   ENVASE    un PORCENTAJE contra la producción del mes.
 *   EN SITIO  UNIDADES rotas, por causa y por proceso.
 *   SALIDA    KILOS de vidrio que salieron por la puerta.
 *
 * No existe el factor que convierta uno en otro. Una botella de 330 y
 * una de 750 pesan distinto; el vidrio se acumula días antes de salir;
 * parte de lo que se pesa nunca se contó en sitio; y el porcentaje de
 * envase se mide contra litros producidos, que no tiene nada que ver con
 * ninguno de los dos. Con las catorce pantallas en una sola lista, tarde
 * o temprano alguien lee una cifra de arriba y otra de abajo como si
 * fueran la misma cuenta, y arma un informe con un factor inventado.
 * La bifurcación es lo que impide esa lectura.
 *
 * CADA TARJETA TRAE SU CIFRA VIVA, en la unidad de su rama y nunca una
 * suma de las tres. Una portada que solo repite tres nombres es un clic
 * de peaje: quien entra ya sabía adónde iba.
 *
 * ROTURAS ERA UN MÓDULO APARTE hasta hoy. Sus pantallas no se movieron
 * —siguen en /roturas/…, porque los permisos están guardados como el
 * texto de la dirección y moverlas habría dejado a la gente sin ellas en
 * silencio—; lo que cambió es por dónde se entra.
 */
export default async function QuiebraPortada() {
  const [permisos, mes, rot, sal] = await Promise.all([
    misPermisos(),
    /* SOLO EL ÚLTIMO MES, no el año entero. El tablero pagina las bajas
       y la producción completas porque filtra en el navegador; esta
       pantalla necesita UNA cifra, y traer cuarenta mil filas para
       pintar un número sería cobrarle a cada entrada el precio del
       informe. */
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("v_quiebra_diario_mes")
        .select("anio, num_mes, pct")
        .order("anio", { ascending: false })
        .order("num_mes", { ascending: false })
        .limit(1);
      return (data?.[0] ?? null) as { anio: number; num_mes: number; pct: number | null } | null;
    })(),
    leerRoturas(400),
    leerSalidas(200),
  ]);

  const modulo = MODULOS.find((m) => m.id === "quiebra")!;
  const ramas = (modulo.ramas ?? []).filter((r) =>
    modulo.secciones.some((s) => s.rama === r.id && permisos.puedeVer(s.ruta)));

  /* SI LAS TABLAS DE ROTURAS NO ESTÁN, la portada no se cae: esas dos
     tarjetas salen sin cifra y las demás funcionan. Un módulo a medio
     migrar no puede dejar sin entrar a los otros dos. */
  const esperando = rot.falta ? null : rot.roturas.filter((r) => r.esperando).length;
  const sinFoto = rot.falta ? 0
    : rot.roturas.filter((r) => r.le_falta_foto && r.estado !== "anulada").length;
  const abiertas = sal.falta ? [] : sal.salidas.filter((s) => s.estado === "abierta");
  const porFirmar = sal.falta ? 0
    : sal.salidas.filter((s) => s.estado === "cerrada" && !s.completa).length;
  const kgAbiertos = abiertas.reduce((t, s) => t + Number(s.neto_kg), 0);

  const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
               "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  /* La cifra de cada rama, en la unidad de esa rama. Nunca una suma de
     las tres: no existe. */
  const CIFRA: Record<string, { n: string; u: string; pie: string; mal: boolean } | null> = {
    envase: mes && mes.pct != null
      ? {
          n: Number(mes.pct).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          u: "%",
          pie: `de quiebra en ${MES[(mes.num_mes ?? 1) - 1]} de ${mes.anio}`,
          /* La meta vive en el tablero y cambia por mes; aquí no se
             repinta de rojo por una cifra que esta pantalla no compara
             contra nada. Decir «mal» sin decir contra qué es peor que
             no decirlo. */
          mal: false,
        }
      : null,
    "en-sitio": esperando == null ? null : {
      n: String(esperando), u: esperando === 1 ? "rotura" : "roturas",
      pie: sinFoto
        ? `esperando visto bueno · ${sinFoto} sin la foto que exige su causa`
        : "esperando el visto bueno de ABI",
      mal: sinFoto > 0,
    },
    salida: sal.falta ? null : {
      n: kilos(kgAbiertos), u: "kg",
      /* «ESPERANDO VH» Y NO «ESPERANDO FIRMA»: lo que esperan desde que
         se quitó Validación es un camión, no una firma. Decir «esperando
         firma» manda a alguien a buscar una pantalla que ya no existe.
         Y NO VA EN ROJO: una cédula esperando su Vh es lo normal, no un
         problema. Se pintaba en rojo cuando esperaba una firma que
         alguien tenía que ir a poner. */
      pie: porFirmar
        ? `en ${abiertas.length} salida${abiertas.length === 1 ? "" : "s"} abierta${abiertas.length === 1 ? "" : "s"} · ${porFirmar} cédula${porFirmar === 1 ? "" : "s"} esperando Vh`
        : `en ${abiertas.length} salida${abiertas.length === 1 ? "" : "s"} abierta${abiertas.length === 1 ? "" : "s"}`,
      mal: false,
    },
  };

  return (
    <div className="qb">
      <section className="cabeza-ramas">
        <div>
          <p className="ojo">QUIEBRA · PÉRDIDA DE MATERIAL · CD38 AG01</p>
          <h1>¿Qué vas a mirar?</h1>
          <p className="sub">
            Tres cosas que se pierden y tres formas de medirlas: el envase se mide en{" "}
            <b>porcentaje</b> contra lo que se produjo, lo que se rompe en la bodega en{" "}
            <b>unidades</b>, y el vidrio que sale por la puerta en <b>kilos</b>. Ninguna
            pantalla suma dos de ellas, porque no existe el factor que convierta una en otra.
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
        <div className="aviso-ramas">
          Tu rol no tiene abierto ninguno de los tres submódulos de Quiebra. Pídele al
          administrador que te dé permiso en <b>Administración → Roles</b>.
        </div>
      )}
    </div>
  );
}
