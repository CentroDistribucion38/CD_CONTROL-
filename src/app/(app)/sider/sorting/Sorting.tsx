"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/components/Aviso";
import type { Viaje } from "@/modulos/sider/comun";
import { NOMBRE_TIPO, NOMBRE_TIPO_LARGO, type TipoRevision } from "@/modulos/sider/comun";
import type {
  MaestrosAi, PendienteRevision, Revision, DetalleAi,
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

/** Más de un día esperando: el camión ya llegó y sigue sin revisar. */
const HORAS_TARDE = 24;
export const esTarde = (desde: string | null, ahora: string) =>
  !!desde && (Date.parse(ahora) - Date.parse(desde)) / 3600000 > HORAS_TARDE;

type Abierto = { tipo: TipoRevision; viaje: ViajeAi; revision: Revision | null; detalle: DetalleAi[] };

/* LA CLASE DE UNA REVISIÓN YA HECHA. Mientras no se corra la migración la
   vista no trae `tipo` y todo lo que hay es certificada. */
const tipoDe = (r: Revision): TipoRevision => r.tipo ?? "ai";

/**
 * EL SELLO DE LA CLASE: LA PALABRA VA ESCRITA, el color solo acompaña.
 * Certificada lleva el morado de la AI de siempre; normal, el magenta que
 * ya tenía el Sorting. Se midieron a 87 de distancia, que NO alcanza a
 * separarlos a simple vista bajo el sol del muelle: por eso cada sello
 * dice su palabra, y por eso el filtro de arriba también.
 */
function SelloTipo({ tipo }: { tipo: TipoRevision }) {
  return (
    <span className={"sello " + (tipo === "ai" ? "ai" : "sorting")}
          title={NOMBRE_TIPO_LARGO[tipo]}>
      <i />{NOMBRE_TIPO[tipo].toUpperCase()}
    </span>
  );
}

export function Sorting({
  ahora, pendientes, detalle, hechos, nombres, maestros, puedeEditar,
}: {
  ahora: string;
  pendientes: PendienteRevision[];
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
  /* EL FILTRO DE CLASE mira las dos listas a la vez: quien está en el
     muelle con la certificada no quiere ver el historial de la normal. */
  const [ver, setVer] = useState<"todas" | TipoRevision>("todas");

  const porId = new Map(detalle.map((v) => [v.id, v]));
  const puedeOperar = puedeEditar && !!maestros;

  const nCert = pendientes.filter((p) => p.tipo === "ai").length;
  const nNorm = pendientes.filter((p) => p.tipo === "sorting").length;
  const pendVisibles = pendientes.filter((p) => ver === "todas" || p.tipo === ver);
  const hechVisibles = hechos.filter((r) => ver === "todas" || tipoDe(r) === ver);

  /* ---------- HACER UNA REVISIÓN ---------- */
  function hacer(p: PendienteRevision) {
    setAbierto({
      tipo: p.tipo,
      viaje: {
        viaje_id: p.viaje_id, placa: p.placa, planta: p.planta,
        fecha: p.fecha, sku: p.sku, llego_en: p.llego_en,
        ai_motivo: p.motivo, pedido_nombre: p.pedido_nombre,
      },
      revision: null, detalle: [],
    });
  }

  /* ---------- CORREGIR UNA CERRADA ----------
     Los conteos no vienen en la lista —son hasta catorce por revisión y
     casi nunca se abre una—, así que se piden aquí, al tocar. */
  async function corregir(r: Revision) {
    setCargando(r.id);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("v_sider_ai_detalle").select("*")
      .eq("revision_id", r.id).order("orden");
    setCargando(null);
    if (error) { avisar.mal("No se pudo abrir la revisión para corregirla. Vuelve a intentarlo."); return }
    setAbierto({
      tipo: tipoDe(r),
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
          tipo={abierto.tipo}
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
            const clase = NOMBRE_TIPO_LARGO[abierto.tipo];
            setAbierto(null);
            router.refresh();
            avisar.bien(corrigio ? `${clase} de ${placa} corregida.` : `${clase} de ${placa} cerrada.`);
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
          <h1>Revisión AI</h1>
          <p className="sub">
            Los camiones que ya llegaron y esperan su revisión: la <b>certificada</b> —viene de
            Sider y el administrador pidió la muestra— y la <b>normal</b> —la creó control con
            el «+» de Tránsito—. Se hacen igual, con la misma muestra y los mismos defectos, y
            las dos entran al Informe AI. {puedeOperar
              ? "Toca «Hacer la revisión» en el camión que vas a contar."
              : "Solo puedes mirar: cerrar una revisión requiere permiso de edición."}
          </p>
        </div>
        <div className="kpi">
          <div className="corte" />
          <div className="rot">POR HACER</div>
          <div className="num">{pendientes.length}</div>
          <div className="pie">
            <span>
              {pendientes.length === 0 ? "nada pendiente"
                : `${nCert} certificada${nCert === 1 ? "" : "s"} · ${nNorm} normal${nNorm === 1 ? "" : "es"}`}
              {tarde > 0 && ` · ${tarde} con más de un día`}
            </span>
          </div>
        </div>
      </section>

      {/* ============ LA CLASE ============ */}
      <div className="so-clase" role="group" aria-label="Clase de revisión">
        {([
          ["todas", `Todas · ${pendientes.length}`],
          ["ai", `Certificada · ${nCert}`],
          ["sorting", `Normal · ${nNorm}`],
        ] as const).map(([k, t]) => (
          <button key={k} type="button" aria-pressed={ver === k}
                  className={ver === k ? "on" : ""} onClick={() => setVer(k)}>{t}</button>
        ))}
      </div>

      {/* ============ LOS QUE ESPERAN ============ */}
      <h2 className="so-h">Por hacer</h2>
      {pendVisibles.length === 0 ? (
        <div className="so-vacio">
          <b>{pendientes.length === 0
            ? "No hay camiones esperando revisión."
            : `No hay revisiones ${ver === "ai" ? "certificadas" : "normales"} por hacer.`}</b>
          <p>
            Un camión aparece aquí cuando se certifica su llegada en <em>En tránsito</em> y
            tiene revisión pedida: la <b>certificada</b>, si el administrador la pidió para un
            camión de Sider; la <b>normal</b>, si lo creó control con el «+».
          </p>
        </div>
      ) : (
        <div className="tr-rejilla">
          {pendVisibles.map((p) => {
            const v = porId.get(p.viaje_id);
            const largo = esTarde(p.llego_en, ahora);
            return (
              <article key={p.viaje_id + p.tipo}
                       className={"tr-vh " + (p.tipo === "ai" ? "ai" : "so") + (largo ? " so-tarde" : "")}>
                <header>
                  <b className="placa">{p.placa}</b>
                  <SelloTipo tipo={p.tipo} />
                  {p.interno && (
                    <span className="sello interno" title="Lo creó control con el «+»: no lo certificó Sider">
                      <i />INTERNO
                    </span>
                  )}
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
                      {p.interno ? "Lo creó " : "Lo pidió "}
                      {p.pedido_nombre ?? (p.pedido_por ? nombres[p.pedido_por] : null) ?? "—"}
                    </em>
                  </div>
                  <div className="tr-botones">
                    {puedeOperar && (
                      <button type="button"
                              className={"btn " + (p.tipo === "ai" ? "ai" : "so-btn")}
                              onClick={() => hacer(p)}>
                        Hacer la revisión
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* ============ LAS CERRADAS ============ */}
      <h2 className="so-h">Hechas <span>las últimas {hechVisibles.length}</span></h2>
      {hechVisibles.length === 0 ? (
        <div className="so-vacio">
          <b>{ver === "todas"
            ? "Todavía no se ha cerrado ninguna revisión."
            : `Todavía no hay revisiones ${ver === "ai" ? "certificadas" : "normales"} cerradas.`}</b>
        </div>
      ) : (
        <ul className="so-hechos">
          {hechVisibles.map((r) => (
            <li key={r.id} className={tipoDe(r) === "ai" ? "ai" : "so"}>
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
                <em>{cuando(r.revisado_en)}{r.ediciones > 0 ? ` · corregida ${r.ediciones} ${r.ediciones === 1 ? "vez" : "veces"}` : ""}</em>
              </span>
              <span className="so-h-tipo"><SelloTipo tipo={tipoDe(r)} /></span>
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
