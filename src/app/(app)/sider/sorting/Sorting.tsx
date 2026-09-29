"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Viaje } from "@/modulos/sider/comun";
import type {
  MaestrosAi, PendienteSorting, Revision, DetalleAi,
} from "@/modulos/sider/ai";
import { FormularioAi, type ViajeAi } from "@/modulos/sider/FormularioAi";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const cuando = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      }) : "—";

/**
 * «Hace 3 h», calculado contra la hora que mandó el SERVIDOR. Con
 * `Date.now()` aquí el texto sale distinto en el servidor y en el
 * navegador, y React avisa de la diferencia: la hora se pasa de arriba.
 */
export function haceCuanto(desde: string | null, ahora: string): string {
  if (!desde) return "—";
  const min = Math.max(0, Math.round((Date.parse(ahora) - Date.parse(desde)) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/** Más de un día esperando: el camión ya se descargó y sigue sin clasificar. */
const HORAS_TARDE = 24;
export const esTarde = (desde: string | null, ahora: string) =>
  !!desde && (Date.parse(ahora) - Date.parse(desde)) / 3600000 > HORAS_TARDE;

type Abierto = { viaje: ViajeAi; revision: Revision | null; detalle: DetalleAi[] };

export function Sorting({
  ahora, pendientes, detalle, hechos, nombres, maestros, puedeEditar,
}: {
  ahora: string;
  pendientes: PendienteSorting[];
  detalle: Viaje[];
  hechos: Revision[];
  nombres: Record<string, string>;
  /** Nulo si quien mira no puede editar, o si los maestros no bajaron. */
  maestros: MaestrosAi | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);

  const porId = new Map(detalle.map((v) => [v.id, v]));
  const puedeOperar = puedeEditar && !!maestros;

  /* ---------- CERRAR UN SORTING ---------- */
  function hacer(p: PendienteSorting) {
    setAbierto({
      viaje: {
        viaje_id: p.viaje_id, placa: p.placa, planta: p.planta,
        fecha: p.fecha, sku: p.sku, llego_en: p.llego_en,
      },
      revision: null, detalle: [],
    });
  }

  /* ---------- CORREGIR UNO CERRADO ----------
     Los conteos no vienen en la lista —son hasta catorce por revisión y
     casi nunca se abre una—, así que se piden aquí, al tocar. */
  async function corregir(r: Revision) {
    setCargando(r.id);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("v_sider_sorting_detalle").select("*")
      .eq("revision_id", r.id).order("orden");
    setCargando(null);
    if (error) { avisar.mal("No se pudo abrir el Sorting para corregirlo. Vuelve a intentarlo."); return }
    setAbierto({
      viaje: {
        viaje_id: r.viaje_id ?? "", placa: r.placa, planta: r.planta,
        fecha: r.fecha, sku: r.envase_nombre ?? r.envase,
      },
      revision: r, detalle: (data ?? []) as DetalleAi[],
    });
  }

  /* MIENTRAS SE CUENTA NO SE DIBUJA LA LISTA: la pantalla es de UN camión,
     y los otros doce que esperan son ruido cuando se está contando uno. */
  if (abierto && maestros) {
    return (
      <>
        <FormularioAi
          tipo="sorting"
          viaje={abierto.viaje}
          revision={abierto.revision}
          detalle={abierto.detalle}
          defectos={maestros.defectos}
          envases={maestros.envases}
          socios={maestros.socios}
          canales={maestros.canales}
          alGuardar={() => {
            const placa = abierto.viaje.placa;
            const corrigio = !!abierto.revision;
            setAbierto(null);
            router.refresh();
            avisar.bien(corrigio ? `Sorting de ${placa} corregido.` : `Sorting de ${placa} cerrado.`);
          }}
          alCancelar={() => setAbierto(null)}
          rotuloCancelar="Volver a la lista"
        />
        {avisos}
      </>
    );
  }

  const tarde = pendientes.filter((p) => esTarde(p.llego_en, ahora)).length;

  return (
    <>
      <section className="cabeza">
        <div>
          <h1>Sorting</h1>
          <p className="sub">
            Los camiones que ya llegaron y pidieron Sorting. Es la misma inspección de la
            revisión AI —muestra y defectos por tipo— hecha por dentro, después de
            descargar. {puedeOperar
              ? "Toca «Hacer el Sorting» en el camión que vas a clasificar."
              : "Solo puedes mirar: cerrar un Sorting requiere permiso de edición."}
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">POR HACER</div>
          <div className="num">{pendientes.length}</div>
          <div className="pie">
            <span>
              {tarde > 0
                ? `${tarde} lleva${tarde === 1 ? "" : "n"} más de un día esperando`
                : pendientes.length === 0 ? "nada pendiente" : "ninguno lleva más de un día"}
            </span>
          </div>
        </div>
      </section>

      {/* ============ LOS QUE ESPERAN ============ */}
      <h2 className="so-h">Por hacer</h2>
      {pendientes.length === 0 ? (
        <div className="so-vacio">
          <b>No hay camiones esperando Sorting.</b>
          <p>
            Un camión aparece aquí cuando el administrador le pide Sorting en{" "}
            <em>En tránsito</em> y alguien certifica su llegada.
          </p>
        </div>
      ) : (
        <div className="tr-rejilla">
          {pendientes.map((p) => {
            const v = porId.get(p.viaje_id);
            const largo = esTarde(p.llego_en, ahora);
            return (
              <article key={p.viaje_id} className={"tr-vh so" + (largo ? " so-tarde" : "")}>
                <header>
                  <b className="placa">{p.placa}</b>
                  <span className="sello sorting"><i />SORTING</span>
                  <span className={"sello " + (largo ? "falta" : "transito")}>
                    <i />Llegó {haceCuanto(p.llego_en, ahora)}
                  </span>
                </header>

                {v && (
                  <div className="tr-ruta">
                    <b>{v.cd_origen}</b>
                    <svg viewBox="0 0 24 8" aria-hidden="true">
                      <path d="M0 4h20M16 1l4 3-4 3" fill="none" stroke="currentColor"
                            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <b>{v.cd_destino}</b>
                  </div>
                )}

                {/* SIN DETALLE, EL MATERIAL NO SE DICE DOS VECES: sin la
                    descripción del viaje el texto de arriba caía en el SKU
                    y la línea de abajo lo repetía —«3500887 / 3500887»—. */}
                <p className="tr-mat">
                  {v?.descripcion ?? "Material sin descripción"}
                  <em>{p.sku}{v?.tipo_envase ? ` · ${v.tipo_envase}` : ""}</em>
                </p>

                <dl className="tr-cifras">
                  <div><dt>Estibas</dt><dd>{nf2.format(p.estibas)}</dd></div>
                  <div><dt>Sider</dt><dd>{v ? nf2.format(v.sider) : "—"}</dd></div>
                  <div><dt>Cajas</dt><dd>{v?.cajas == null ? "—" : nf.format(v.cajas)}</dd></div>
                  <div><dt>HL</dt><dd>{v?.hl == null ? "—" : nf2.format(v.hl)}</dd></div>
                </dl>

                <footer>
                  <div className="tr-salio">
                    Llegó {cuando(p.llego_en)}
                    <em>
                      Lo pidió {p.pedido_nombre ?? (p.sorting_pedido_por ? nombres[p.sorting_pedido_por] : null) ?? "—"}
                    </em>
                  </div>
                  <div className="tr-botones">
                    {puedeOperar && (
                      <button type="button" className="btn so-btn" onClick={() => hacer(p)}>
                        Hacer el Sorting
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* ============ LOS CERRADOS ============ */}
      <h2 className="so-h">Hechos <span>los últimos {hechos.length}</span></h2>
      {hechos.length === 0 ? (
        <div className="so-vacio">
          <b>Todavía no se ha cerrado ningún Sorting.</b>
        </div>
      ) : (
        <ul className="so-hechos">
          {hechos.map((r) => (
            <li key={r.id}>
              <b className="placa">{r.placa}</b>
              <span className="so-h-fecha">
                {r.fecha} · {r.turno}
                <em>{r.envase_nombre ?? r.envase}</em>
              </span>
              <span className="so-h-ind">
                {(r.indice * 100).toFixed(2)} %
                <em>{nf.format(r.defectos)} de {nf.format(r.revisadas)} revisadas</em>
              </span>
              <span className="so-h-quien">
                {r.revisado_por ? nombres[r.revisado_por] ?? "—" : "—"}
                <em>{cuando(r.revisado_en)}{r.ediciones > 0 ? ` · corregido ${r.ediciones} ${r.ediciones === 1 ? "vez" : "veces"}` : ""}</em>
              </span>
              {puedeOperar && r.viaje_id && (
                <button type="button" className="tr-so-btn"
                        disabled={cargando === r.id} onClick={() => corregir(r)}>
                  {cargando === r.id ? "…" : "Corregir"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {avisos}
    </>
  );
}
