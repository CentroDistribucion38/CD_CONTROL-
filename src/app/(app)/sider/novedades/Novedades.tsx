"use client";

/**
 * LA BANDEJA DE NOVEDADES.
 *
 * Una novedad es un señalamiento: dice que algo llegó mal. Por eso la
 * pantalla insiste en tres cosas y no en otras.
 *
 *   · EL MOTIVO SALE DE UNA LISTA. Con texto libre, a los tres meses hay
 *     doscientas novedades y ninguna forma de agruparlas: "sello roto",
 *     "SELLO ROTO" y "roto el sello" son tres cosas para una consulta.
 *     La descripción libre sigue estando, al lado, para el detalle.
 *
 *   · EL VIAJE ES OPCIONAL. Si es de un viaje de T1 que ya está en la
 *     plataforma, se escoge la placa de la lista y queda colgando de él
 *     —así se puede decir "de 40 viajes, 6 con novedad"—. T2 todavía no
 *     tiene viajes registrados, así que ahí se escribe la placa a mano.
 *
 *   · CERRAR OBLIGA A DECIR QUÉ SE HIZO. Si no, "cerrada" no significa
 *     "resuelta": significa que alguien le dio al botón.
 *
 * Las abiertas van arriba porque son las únicas que piden algo de quien
 * abre esta pantalla.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Novedad, MotivoNovedad, RespuestaNovedad } from "@/modulos/sider/datos";
import { useConfirmar } from "@/components/Confirmar";
import { Selector } from "@/components/Selector";
import { sellar, type Foto } from "@/lib/evidencia";

const HOY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/* Del TEXTO de la fecha, no con Date: "2026-08-31" en un navegador al
   oeste de Greenwich cae el 30 a las 7 de la noche. */
const dia = (f: string) =>
  `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;
const cuando = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      }) : "—";

/** «NV-0142»: el # de caso con ceros a la izquierda, para que se lea igual en el papel y en la pantalla. */
const nv = (n: number) => `NV-${String(n).padStart(4, "0")}`;

/** La hora de Colombia, «HH:MM». */
const ahoraCo = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

/** EL TURNO SE DEDUCE DE LA HORA, nadie lo escribe: A 06–14, B 14–22, C 22–06. Es el mismo cálculo que hace la base al guardar. */
const turnoDe = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return h >= 6 && h < 14 ? "A" : h >= 14 && h < 22 ? "B" : "C";
};
const HORARIO_TURNO: Record<string, string> = { A: "06:00 · 14:00", B: "14:00 · 22:00", C: "22:00 · 06:00" };
const ESTADO_NOMBRE: Record<string, string> = { abierta: "Abierto", en_proceso: "En proceso", cerrada: "Cerrado" };

type Viaje = {
  id: string; placa: string; cd_origen: string; descripcion: string;
  sku: string | null; factura: string | null; lote: string | null;
};

const VACIO = {
  tramo: "t1" as "t1" | "t2",
  motivo: "",
  viajeId: "",
  placa: "",
  responsable: "",
  fecha: "",
  hora: "",
  /* Factura, lote y SKU: se rellenan solos al escoger el viaje y se
     pueden corregir. El viaje es la propuesta —ahorra teclear tres
     campos que casi siempre son los mismos—, pero quien tiene el papel
     en la mano puede ver que la factura del sistema no es la que trae
     el camión. */
  factura: "",
  lote: "",
  sku: "",
  cdReporta: "",
  cantidad: "",
  unidad: "estibas",
  descripcion: "",
};

/** UN CD SE ESCOGE DE LA LISTA (el maestro de orígenes), no se teclea. «Otro…» queda para lo que no es un CD —una ruta, una transportadora— y entonces sí se escribe. */
function CampoCd({ valor, cambiar, cds, ejemplo }: {
  valor: string; cambiar: (v: string) => void; cds: string[]; ejemplo: string;
}) {
  const [otro, setOtro] = useState(valor !== "" && !cds.includes(valor));
  return (
    <>
      <Selector valor={otro ? "__otro" : valor}
                opciones={[
                  ...cds.map((c) => ({ valor: c, etiqueta: c })),
                  { valor: "__otro", etiqueta: "Otro (escribir)…" },
                ]}
                onCambiar={(v) => {
                  if (v === "__otro") { setOtro(true); cambiar("") }
                  else { setOtro(false); cambiar(v) }
                }} />
      {otro && (
        <input value={valor} placeholder={ejemplo} autoFocus
               onChange={(e) => cambiar(e.target.value)} />
      )}
    </>
  );
}

export function Novedades({ novedades, motivos, viajes, hilo, nombres, puedeEditar, miBodega, cds, skus }: {
  novedades: Novedad[];
  motivos: MotivoNovedad[];
  viajes: Viaje[];
  hilo: RespuestaNovedad[];
  nombres: Record<string, string>;
  puedeEditar: boolean;
  /** El maestro de SKU: se escoge de la lista. */
  skus: { sku: string; descripcion: string }[];
  /** Desde dónde contesta quien está mirando. Se propone, se corrige. */
  miBodega: string;
  /** Los CD del maestro de orígenes, para las listas desplegables. */
  cds: string[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [pedir, dialogo] = useConfirmar();

  const [f, setF] = useState({ tramo: "", estado: "pendientes", placa: "", responsable: "" });
  /* La novedad que se está respondiendo, y lo que se va a escribir. */
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [resp, setResp] = useState({ texto: "", desde: "", compromiso: "", fecha: "" });
  const [mandando, setMandando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [n, setN] = useState({ ...VACIO, fecha: HOY(), cdReporta: miBodega });
  const [enviando, setEnviando] = useState(false);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [mal, setMal] = useState<string | null>(null);
  /* Las dos fotos del reporte: selladas en el teléfono (placa, fecha y hora quemadas en la banda). */
  const [fotos, setFotos] = useState<(Foto | null)[]>([null, null]);
  const [sellando, setSellando] = useState<number | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const hueco = useRef(0);
  /* La nota de gestión que se está escribiendo, por caso. */
  const [obs, setObs] = useState<Record<string, string>>({});
  const [gestionando, setGestionando] = useState<string | null>(null);
  /* Las fotos ya subidas se ven con un enlace firmado que dura poco. */
  const [urls, setUrls] = useState<Record<string, string>>({});

  const quien = (id: string | null) => (id ? nombres[id] ?? "—" : "—");

  /* Los motivos del tramo elegido, más los que sirven para los dos. */
  const motivosDe = (tramo: string) =>
    motivos.filter((m) => m.tramo === null || m.tramo === tramo);

  const lista = useMemo(() => {
    const p = f.placa.trim().toUpperCase();
    return novedades.filter((x) => {
      if (f.tramo && x.tramo !== f.tramo) return false;
      if (f.estado === "pendientes") { if (x.estado === "cerrada") return false }
      else if (f.estado === "vencidas") { if (!x.vencida) return false }
      else if (f.estado && x.estado !== f.estado) return false;
      if (p && !x.placa.toUpperCase().includes(p)) return false;
      if (f.responsable && (x.cd_responsable ?? "") !== f.responsable) return false;
      return true;
    });
  }, [novedades, f]);

  const abiertas = novedades.filter((x) => x.estado === "abierta").length;
  const enProceso = novedades.filter((x) => x.estado === "en_proceso").length;
  const cerradas = novedades.filter((x) => x.estado === "cerrada").length;
  const vencidas = novedades.filter((x) => x.vencida).length;
  const mesActual = HOY().slice(0, 7);
  const cerradasMes = novedades.filter((x) => x.estado === "cerrada" && (x.cerrada_en ?? "").slice(0, 7) === mesActual).length;

  /* Los enlaces firmados de las fotos de lo que se está viendo. */
  const rutas = useMemo(
    () => lista.flatMap((x) => [x.foto_ruta, x.foto_ruta2]).filter((r): r is string => !!r).slice(0, 60),
    [lista]
  );
  useEffect(() => {
    const faltan = rutas.filter((r) => !urls[r]);
    if (!faltan.length) return;
    let vivo = true;
    supabase.storage.from("sider").createSignedUrls(faltan, 3000).then(({ data }) => {
      if (!vivo || !data) return;
      setUrls((u) => {
        const n = { ...u };
        for (const d of data) if (d.path && d.signedUrl) n[d.path] = d.signedUrl;
        return n;
      });
    });
    return () => { vivo = false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutas, supabase]);
  /* Los CD que de verdad tienen novedades. Ofrecer los dieciséis del
     maestro cuando cuatro tienen algo hace buscar en una lista donde la
     mayoría no devuelve nada. */
  const responsables = useMemo(
    () => [...new Set(novedades.map((x) => x.cd_responsable).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), "es")) as string[],
    [novedades]
  );
  const respuestasDe = useMemo(() => {
    const m = new Map<string, RespuestaNovedad[]>();
    for (const h of hilo) {
      const l = m.get(h.novedad_id) ?? [];
      l.push(h);
      m.set(h.novedad_id, l);
    }
    return m;
  }, [hilo]);

  async function responder(x: Novedad) {
    if (!resp.texto.trim()) { setMal("Escribe la respuesta."); return }
    setMal(null);
    setMandando(true);
    const { error } = await supabase.rpc("sider_novedad_responder", {
      p_id: x.id,
      p_texto: resp.texto.trim(),
      p_desde: (resp.desde || miBodega).trim() || null,
      p_compromiso: resp.compromiso.trim() || null,
      p_fecha_comp: resp.fecha || null,
    });
    setMandando(false);
    if (error) { setMal(error.message); return }
    setRespondiendo(null);
    setResp({ texto: "", desde: "", compromiso: "", fecha: "" });
    router.refresh();
  }

  function limpiar() {
    for (const f of fotos) if (f) URL.revokeObjectURL(f.url);
    setFotos([null, null]);
    setN({ ...VACIO, fecha: HOY(), cdReporta: miBodega });
    setMal(null);
  }

  /* Tomar o escoger la foto del hueco 1 o 2: se sella y se encoge en el teléfono. */
  async function ponerFoto(archivo: File | undefined) {
    const i = hueco.current;
    if (!archivo) return;
    setMal(null);
    setSellando(i);
    try {
      const f = await sellar(archivo, {
        titulo: n.viajeId ? (viajes.find((v) => v.id === n.viajeId)?.placa ?? "NOVEDAD") : (n.placa.trim().toUpperCase() || "NOVEDAD"),
        ubi: null, direccion: "", etiqueta: `NOVEDAD · FOTO ${i + 1}`,
      });
      setFotos((fs) => { if (fs[i]) URL.revokeObjectURL(fs[i]!.url); const c = [...fs]; c[i] = f; return c });
    } catch (e) {
      setMal(e instanceof Error ? e.message : "No se pudo procesar esa foto. Vuelve a tomarla.");
    } finally { setSellando(null) }
  }
  function quitarFoto(i: number) {
    setFotos((fs) => { if (fs[i]) URL.revokeObjectURL(fs[i]!.url); const c = [...fs]; c[i] = null; return c });
  }

  /* Pasar un caso a Abierto o En proceso, y/o guardar su observación. Cerrar es otra cosa y exige decir qué se hizo. */
  async function gestionar(x: Novedad, estado: "abierta" | "en_proceso" | null) {
    const texto = (obs[x.id] ?? x.observacion ?? "").trim();
    const cambioObs = texto !== (x.observacion ?? "").trim();
    if (!estado && !cambioObs) { setMal("No hay nada que guardar: escribe la observación o cambia el estado."); return }
    setMal(null);
    setGestionando(x.id);
    const { error } = await supabase.rpc("sider_novedad_gestionar", {
      p_id: x.id, p_estado: estado, p_observacion: cambioObs ? texto : null,
    });
    setGestionando(null);
    if (error) { setMal(error.message); return }
    setObs((o) => { const c = { ...o }; delete c[x.id]; return c });
    router.refresh();
  }

  /* EL PANEL SE PONE AMARILLO SOLO CUANDO TODO ESTÁ LLENO. Factura y lote no cuentan: no todo caso los tiene. */
  const viajeElegido = viajes.find((v) => v.id === n.viajeId);
  const faltan = [
    !n.motivo && "motivo",
    !(viajeElegido?.placa || n.placa.trim()) && "placa",
    !(viajeElegido?.cd_origen || n.responsable.trim()) && "a quién le toca",
    !n.cdReporta.trim() && "CD que reporta",
    !n.fecha && "fecha",
    !n.sku.trim() && "SKU",
    !(Number(n.cantidad) > 0) && "cantidad",
    fotos.filter(Boolean).length === 0 && "foto",
  ].filter((x): x is string => !!x);

  async function reportar() {
    setMal(null);
    const conViaje = n.viajeId !== "";
    if (!n.motivo) { setMal("Escoge el motivo."); return }
    if (!conViaje && !n.placa.trim()) { setMal("Sin viaje hay que escribir la placa."); return }
    if (!n.fecha) { setMal("Falta la fecha."); return }
    if (n.fecha > HOY()) { setMal("La fecha no puede ser futura."); return }
    if (n.cantidad.trim() && !(Number(n.cantidad) > 0)) {
      setMal("La cantidad afectada tiene que ser un número mayor que cero."); return;
    }

    const elMotivo = motivos.find((m) => m.clave === n.motivo);
    setEnviando(true);

    /* Las fotos suben PRIMERO, a una carpeta propia de esta novedad; si el reporte falla, se quitan: que no queden fotos huérfanas. */
    const carpeta = `novedades/${crypto.randomUUID()}`;
    const subidas: (string | null)[] = [null, null];
    for (let i = 0; i < 2; i++) {
      const f = fotos[i];
      if (!f) continue;
      const ruta = `${carpeta}/${i + 1}-${Date.now()}.jpg`;
      const { error: eF } = await supabase.storage.from("sider").upload(ruta, f.blob, { contentType: "image/jpeg" });
      if (eF) {
        const ya = subidas.filter((r): r is string => !!r);
        if (ya.length) void supabase.storage.from("sider").remove(ya);
        setEnviando(false);
        setMal(`La foto ${i + 1} no subió: ${/security|policy|permission/i.test(eF.message) ? "falta correr la migración de Novedades en Supabase" : eF.message}`);
        return;
      }
      subidas[i] = ruta;
    }

    const { error } = await supabase.rpc("sider_novedad_reportar", {
      p_tramo: n.tramo,
      p_tipo: elMotivo?.tipo ?? "viaje",
      p_motivo: n.motivo,
      p_placa: n.placa.trim().toUpperCase(),
      p_fecha: n.fecha,
      p_hora: ahoraCo(),
      p_factura: n.factura.trim().toUpperCase() || null,
      p_lote: n.lote.trim().toUpperCase() || null,
      p_sku: n.sku.trim() || null,
      p_cantidad: n.cantidad.trim() ? Number(n.cantidad) : null,
      p_unidad: n.cantidad.trim() ? n.unidad : null,
      p_descripcion: n.descripcion.trim() || null,
      p_viaje_id: conViaje ? n.viajeId : null,
      p_foto_ruta: subidas[0],
      p_foto_ruta2: subidas[1],
      p_cd_reporta: n.cdReporta.trim() || miBodega || null,
      /* Con viaje, el responsable lo pone la base a partir del CD de
         origen: dejar que lo mande el navegador permite echarle la culpa
         al CD equivocado. */
      p_responsable: conViaje ? null : n.responsable.trim() || null,
    });
    setEnviando(false);

    if (error) {
      const ya = subidas.filter((r): r is string => !!r);
      if (ya.length) void supabase.storage.from("sider").remove(ya);
      setMal(/does not exist|schema cache/i.test(error.message)
        ? "Falta correr la migración en Supabase: supabase/migraciones/2026-11-novedades-casos.sql."
        : error.message);
      return;
    }
    limpiar();
    setAbierto(false);
    router.refresh();
  }

  async function cerrar(x: Novedad) {
    /* Lo que se hizo se escribe EN LA TARJETA, no en un window.prompt:
       ese cuadro sale con el dominio encima, en el idioma del sistema y
       sin los colores de la plataforma — en una pantalla que alguien
       enseña en una reunión se ve como si la app se hubiera roto. */
    const que = resp.texto.trim();
    if (!que) { setMal("Para cerrar hay que decir qué se hizo."); return }
    if (que.length < 10) { setMal("Cuenta qué se hizo con un poco más de detalle (mínimo 10 letras)."); return }

    const ok = await pedir({
      titulo: `¿Cerrar la novedad de ${x.placa}?`,
      dice: (
        <>
          <p><b>{x.motivo_nombre}</b> · {dia(x.fecha)} · lleva {x.dias} días</p>
          <p>Va a quedar cerrada con: «{que}»</p>
          <p>El hilo queda como está; cerrada no se puede volver a responder.</p>
        </>
      ),
      confirmar: "Cerrarla",
      cancelar: "Todavía no",
    });
    if (!ok) return;

    setMal(null);
    setCerrando(x.id);
    const { error } = await supabase.rpc("sider_novedad_cerrar", {
      p_id: x.id, p_que_se_hizo: que,
    });
    setCerrando(null);
    if (error) { setMal(error.message); return }
    setRespondiendo(null);
    setResp({ texto: "", desde: "", compromiso: "", fecha: "" });
    router.refresh();
  }

  return (
    <>
      {dialogo}

      {/* Cuatro cifras que son filtros: tocar una muestra solo esos casos, y tocarla otra vez vuelve a los pendientes. */}
      <section className="nv-tiles" aria-label="Estado de las novedades">
        {([
          ["abierta", "Abiertas", abiertas, ""],
          ["en_proceso", "En proceso", enProceso, ""],
          ["vencidas", "Pasadas de fecha", vencidas, vencidas > 0 ? "al" : ""],
          ["cerrada", "Cerradas", cerradas, ""],
        ] as [string, string, number, string][]).map(([k, nombre, cuantas, tono]) => (
          <button key={k} type="button" aria-pressed={f.estado === k}
                  className={`nv-tile ${tono} ${f.estado === k ? "on" : ""}`}
                  title={k === "cerrada" ? `${cerradasMes} cerradas este mes` : undefined}
                  onClick={() => setF({ ...f, estado: f.estado === k ? "pendientes" : k })}>
            <b>{cuantas}</b>
            <span>{nombre}</span>
          </button>
        ))}
      </section>

      <section className="nv-barra">
        <div className="nv-filtros">
          <label className="nv-filtro">
            <span>Tramo</span>
            <Selector valor={f.tramo} onCambiar={(v) => setF({ ...f, tramo: v })}
                      opciones={[
                        { valor: "", etiqueta: "T1 y T2" },
                        { valor: "t1", etiqueta: "Solo T1" },
                        { valor: "t2", etiqueta: "Solo T2" },
                      ]} />
          </label>

          {responsables.length > 1 && (
            <label className="nv-filtro">
              <span>Le toca a</span>
              <Selector valor={f.responsable} onCambiar={(v) => setF({ ...f, responsable: v })}
                        opciones={[{ valor: "", etiqueta: "Cualquiera" },
                                   ...responsables.map((r) => ({ valor: String(r), etiqueta: String(r) }))]} />
            </label>
          )}

          <label className="nv-filtro">
            <span>Placa</span>
            <input value={f.placa} placeholder="Buscar placa"
                   onChange={(e) => setF({ ...f, placa: e.target.value })} />
          </label>

          {f.estado !== "" && (
            <button type="button" className="nv-todas" onClick={() => setF({ ...f, estado: "" })}>
              Ver todo el historial
            </button>
          )}

          {puedeEditar && (
            <button type="button" className="btn nv-nueva"
                    onClick={() => { setAbierto((v) => !v); setMal(null) }}>
              {abierto ? "Cancelar" : "+ Reportar novedad"}
            </button>
          )}
        </div>
      </section>

      {/* ---------------- Reportar ---------------- */}
      {abierto && puedeEditar && (
        <section className="tarjeta nv-forma">
          <div className="cab"><div><h2>Reportar una novedad</h2></div></div>

          <div className="nv-cols">
          <div className="nv-campos">
            <h4 className="nv-sub">1 · Qué pasó</h4>
            <label>
              <span>Tramo</span>
              <Selector valor={n.tramo}
                        onCambiar={(v) => setN({ ...n, tramo: v as "t1" | "t2", motivo: "", viajeId: "" })}
                        opciones={[
                          { valor: "t1", etiqueta: "T1 · lo que llega de otro CD" },
                          { valor: "t2", etiqueta: "T2 · el reparto al cliente" },
                        ]} />
            </label>

            <label>
              <span>Motivo</span>
              <Selector valor={n.motivo} onCambiar={(v) => setN({ ...n, motivo: v })}
                        opciones={motivosDe(n.tramo).map((m) => ({ valor: m.clave, etiqueta: m.nombre }))} />
            </label>

            <label>
              <span>¿Cuándo pasó?</span>
              <input type="date" value={n.fecha} max={HOY()}
                     onChange={(e) => setN({ ...n, fecha: e.target.value })} />
            </label>

            <h4 className="nv-sub">2 · De dónde viene</h4>
            {/* En T1 se puede colgar de un viaje que ya existe; en T2
                todavía no hay viajes, así que solo queda la placa. */}
            {n.tramo === "t1" && viajes.length > 0 && (
              <label className="ancho">
                <span>¿De cuál viaje?</span>
                <Selector valor={n.viajeId}
                          opciones={[
                            { valor: "", etiqueta: "Ninguno — escribo la placa" },
                            ...viajes.map((v) => ({ valor: v.id, codigo: v.placa, etiqueta: `${v.cd_origen} · ${v.descripcion}` })),
                          ]}
                          onCambiar={(id) => {
                            /* Se copian AL ESCOGER, no al enviar: así se ven antes de mandar y se pueden corregir. */
                            const v = viajes.find((x) => x.id === id);
                            setN({
                              ...n, viajeId: id, placa: "",
                              factura: v?.factura ?? "", lote: v?.lote ?? "", sku: v?.sku ?? "",
                            });
                          }} />
                <em>Si está en la lista, mejor: la novedad queda pegada a ese viaje.</em>
              </label>
            )}

            {n.viajeId === "" && (
              <label>
                <span>Placa</span>
                <input value={n.placa} placeholder="JYN245"
                       onChange={(e) => setN({ ...n, placa: e.target.value.toUpperCase() })} />
              </label>
            )}

            {n.viajeId === "" && (
              <label>
                <span>¿A quién le toca?</span>
                <CampoCd key={n.tramo} valor={n.responsable} cds={cds}
                         ejemplo={n.tramo === "t1" ? "CD Galapa" : "Ruta 12 · transportadora"}
                         cambiar={(v) => setN({ ...n, responsable: v })} />
                <em>Quien tiene que responder. Sin esto la novedad no tiene dueño.</em>
              </label>
            )}

            <label>
              <span>CD que reporta</span>
              <CampoCd valor={n.cdReporta} cds={cds} ejemplo="CD Barranquilla"
                       cambiar={(v) => setN({ ...n, cdReporta: v })} />
            </label>

            {/* LO QUE HACE FALTA PARA RECLAMAR. Si para armar el reclamo
                hay que ir a buscar la factura a un lado y el lote a otro,
                el reclamo se deja para después y después se olvida. */}
            <label>
              <span>Factura</span>
              <input value={n.factura} placeholder="FE-4471"
                     onChange={(e) => setN({ ...n, factura: e.target.value.toUpperCase() })} />
              {n.viajeId !== "" && <em>Viene del viaje. Si el papel dice otra, corrígela.</em>}
            </label>

            <label>
              <span>Lote</span>
              <input value={n.lote} placeholder="L2609A"
                     onChange={(e) => setN({ ...n, lote: e.target.value.toUpperCase() })} />
            </label>

            <h4 className="nv-sub">3 · Qué se afectó</h4>
            <label>
              <span>SKU afectado</span>
              <Selector valor={n.sku} onCambiar={(v) => setN({ ...n, sku: v })}
                        opciones={[
                          ...(n.sku && !skus.some((k) => k.sku === n.sku) ? [{ valor: n.sku, etiqueta: n.sku }] : []),
                          ...skus.map((k) => ({ valor: k.sku, codigo: k.sku, etiqueta: k.descripcion })),
                        ]} />
              {n.viajeId !== "" && n.sku && <em>Viene del viaje. Si el papel dice otro, corrígelo.</em>}
            </label>

            <label>
              <span>¿Cuánto vino mal?</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" inputMode="decimal" step="0.01" min="0"
                       style={{ flex: "1 1 90px", minWidth: 0 }}
                       value={n.cantidad} placeholder="3"
                       onChange={(e) => setN({ ...n, cantidad: e.target.value })} />
                <Selector valor={n.unidad} style={{ flex: "0 1 130px" }}
                          onCambiar={(v) => setN({ ...n, unidad: v })}
                          opciones={[
                            { valor: "estibas", etiqueta: "estibas" },
                            { valor: "cajas", etiqueta: "cajas" },
                            { valor: "unidades", etiqueta: "unidades" },
                          ]} />
              </div>
              <em>Sin esta cifra la novedad dice qué pasó, pero no cuánto hay que cobrar.</em>
            </label>

            <h4 className="nv-sub">4 · Evidencia</h4>
            <div className="ancho nv-fotos">
              <span>Fotos (hasta 2)</span>
              <div className="nv-fotos-fila">
                {[0, 1].map((i) => (
                  <div key={i} className="nv-foto-hueco">
                    {fotos[i] ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotos[i]!.url} alt={`Foto ${i + 1} de la novedad`} />
                        <button type="button" className="us-mini" onClick={() => quitarFoto(i)}>Quitar</button>
                      </>
                    ) : (
                      <button type="button" className="nv-foto-tomar" disabled={sellando !== null}
                              onClick={() => { hueco.current = i; entrada.current?.click() }}>
                        <b>{sellando === i ? "Preparando…" : `Foto ${i + 1}`}</b>
                        <em>{i === 0 ? "Tomar o escoger" : "Opcional"}</em>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <input ref={entrada} type="file" accept="image/*" capture="environment" hidden
                     onChange={(e) => { void ponerFoto(e.target.files?.[0]); e.target.value = "" }} />
            </div>

            <label className="ancho">
              <span>Qué pasó</span>
              <textarea rows={3} value={n.descripcion} maxLength={600}
                        placeholder="El detalle: cuántas estibas, qué cliente, a qué hora…"
                        onChange={(e) => setN({ ...n, descripcion: e.target.value })} />
            </label>
          </div>

          {/* EL RESUMEN DEL CASO, al lado: lo que se va a mandar, tal como va, y los botones. La hora y el turno salen del reloj de Colombia. */}
          <aside className={`nv-resumen${faltan.length === 0 ? " listo" : ""}`} aria-label="Resumen del caso">
            {(() => {
              const h = ahoraCo();
              const t = turnoDe(h);
              const viajeSel = viajes.find((v) => v.id === n.viajeId);
              const origen = viajeSel?.cd_origen || n.responsable || "—";
              const placa = viajeSel?.placa || n.placa.trim().toUpperCase() || "—";
              const motivo = motivos.find((m) => m.clave === n.motivo)?.nombre;
              return (
                <>
                  <small>RESUMEN DEL CASO</small>
                  <p className="nv-estado-res">{faltan.length === 0 ? "Listo para reportar" : `Falta: ${faltan.join(", ")}`}</p>
                  <div className="nv-res-motivo">{motivo ?? "Escoge el motivo"}</div>
                  <span className="nv-res-ruta">{n.tramo.toUpperCase()} · {origen} → {n.cdReporta || "—"}</span>
                  <dl>
                    <dt>Caso</dt><dd>se asigna al guardar</dd>
                    <dt>Fecha</dt><dd>{n.fecha ? dia(n.fecha) : "—"}</dd>
                    <dt>Hora</dt><dd>{h} (auto)</dd>
                    <dt>Turno</dt><dd>{t} · {HORARIO_TURNO[t]} (auto)</dd>
                    <dt>Placa</dt><dd>{placa}</dd>
                    <dt>Cantidad</dt><dd>{n.cantidad.trim() ? `${n.cantidad} ${n.unidad}` : "—"}</dd>
                    <dt>Fotos</dt><dd>{fotos.filter(Boolean).length} de 2</dd>
                  </dl>
                </>
              );
            })()}

            {mal && <div className="aviso mal">{mal}</div>}

            <div className="nv-res-acciones">
              <button type="button" className="btn" onClick={reportar} disabled={enviando}>
                {enviando ? "Reportando…" : "Reportar novedad"}
              </button>
              <button type="button" className="btn plano" onClick={() => { setAbierto(false); limpiar() }}>
                Cancelar
              </button>
            </div>
          </aside>
          </div>
        </section>
      )}

      {mal && !abierto && <div className="aviso mal">{mal}</div>}

      {/* ---------------- La bandeja ---------------- */}
      <section className="nv-lista">
        {lista.length === 0 ? (
          <div className="nv-vacia">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
            </svg>
            <h3>{novedades.length === 0 ? "Sin novedades reportadas" : "Nada con ese filtro"}</h3>
            <p>
              {novedades.length === 0
                ? "Cuando algo salga mal en un viaje, se reporta aquí y queda como un caso con su número."
                : "Cambia la pestaña o quita el filtro de tramo o placa para ver más."}
            </p>
            {novedades.length === 0 && puedeEditar && !abierto && (
              <button type="button" className="btn" onClick={() => { setAbierto(true); setMal(null) }}>
                + Reportar novedad
              </button>
            )}
          </div>
        ) : lista.map((x) => {
          const respuestas = respuestasDe.get(x.id) ?? [];
          const contestando = respondiendo === x.id;
          return (
          <article key={x.id}
                   className={"nv" + (x.estado === "cerrada" ? " cerrada" : "")
                                   + (x.vencida ? " vencida" : "")}>
            <div className="nv-cab">
              <span className="nv-caso" title="Número de caso">{nv(x.caso)}</span>
              <span className={"nv-tramo " + x.tramo}>{x.tramo.toUpperCase()}</span>
              <h3>{x.motivo_nombre}</h3>
              <span className="nv-placa">{x.placa}</span>
              <span className="nv-fecha">
                {dia(x.fecha)}{x.hora ? ` · ${x.hora.slice(0, 5)}` : ""}{x.turno ? ` · turno ${x.turno}` : ""}
              </span>
              {/* Los días son lo que convierte un renglón en un problema:
                  "lleva 12 días" se entiende sin leer nada más. */}
              <span className={"nv-dias" + (x.estado !== "cerrada" && x.dias >= 7 ? " largo" : "")}>
                {x.dias === 0 ? "hoy" : x.dias === 1 ? "1 día" : `${x.dias} días`}
              </span>
              <span className={"nv-estado " + x.estado}>{ESTADO_NOMBRE[x.estado] ?? x.estado}</span>
            </div>

            <div className="nv-quien">
              {x.cd_responsable ? (
                <span className="nv-resp">Le toca a <b>{x.cd_responsable}</b></span>
              ) : (
                <span className="nv-resp sin">Sin responsable</span>
              )}
              {(x.cd_origen || x.cd_reporta) && (
                <span className="nv-ruta">
                  {x.cd_origen ?? "—"} → <b>{x.cd_reporta ?? "—"}</b>
                </span>
              )}
              {x.pegada_a_viaje && (
                <span className="nv-viaje">
                  Del viaje{x.material ? <> · {x.material}</> : null}
                </span>
              )}
            </div>

            {/* EL PAPEL DEL RECLAMO, en la misma fila. Una novedad es lo
                que se le manda al CD de origen: si para armarla hay que
                buscar la factura a un lado, el lote a otro y la cantidad
                en la cabeza de alguien, el reclamo se deja para después
                y después se olvida. Lo que no se sepa no se pinta: un
                "Factura: —" en cada renglón es ruido. */}
            {(x.factura || x.lote || x.sku || x.cantidad != null) && (
              <div className="nv-papel">
                {x.cantidad != null && (
                  <span className="nv-cant"><b>{x.cantidad}</b> {x.unidad}</span>
                )}
                {x.factura && <span>Factura <b>{x.factura}</b></span>}
                {x.lote && <span>Lote <b>{x.lote}</b></span>}
                {x.sku && <span>SKU <b>{x.sku}</b></span>}
              </div>
            )}

            {x.descripcion && <p className="nv-dice">{x.descripcion}</p>}

            {(x.foto_ruta || x.foto_ruta2) && (
              <div className="nv-fotos-ver">
                {[x.foto_ruta, x.foto_ruta2].map((r, i) => r && (
                  urls[r] ? (
                    <a key={r} href={urls[r]} target="_blank" rel="noreferrer" title={`Abrir la foto ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urls[r]} alt={`Foto ${i + 1} de ${nv(x.caso)}`} />
                    </a>
                  ) : <span key={r} className="nv-foto-carga">Foto {i + 1}…</span>
                ))}
              </div>
            )}

            {/* LA GESTIÓN DEL CASO: el estado y la nota de quien lo atiende. */}
            {x.observacion && x.estado === "cerrada" && (
              <p className="nv-obs"><b>Observación:</b> {x.observacion}
                <em>{quien(x.observacion_por)} · {cuando(x.observacion_en)}</em></p>
            )}
            {x.estado !== "cerrada" && puedeEditar && (
              <div className="nv-gestion">
                <div className="nv-g-cab">
                  <b>Gestión</b>
                  <div className="nv-seg" role="group" aria-label="Estado del caso">
                    <button type="button" className={x.estado === "abierta" ? "on" : ""}
                            disabled={gestionando === x.id || x.estado === "abierta"}
                            onClick={() => gestionar(x, "abierta")}>Abierto</button>
                    <button type="button" className={x.estado === "en_proceso" ? "on proceso" : ""}
                            disabled={gestionando === x.id || x.estado === "en_proceso"}
                            onClick={() => gestionar(x, "en_proceso")}>En proceso</button>
                  </div>
                  {x.tomada_por && (
                    <span className="nv-tomada">Lo tomó {quien(x.tomada_por)} · {cuando(x.tomada_en)}</span>
                  )}
                </div>
                <label>
                  <span>Observación{x.observacion_por ? ` · ${quien(x.observacion_por)} · ${cuando(x.observacion_en)}` : ""}</span>
                  <textarea rows={2} maxLength={600} value={obs[x.id] ?? x.observacion ?? ""}
                            placeholder="Qué se está haciendo con este caso…"
                            onChange={(e) => setObs((o) => ({ ...o, [x.id]: e.target.value }))} />
                </label>
                <div className="nv-acciones">
                  <button type="button" className="us-mini"
                          disabled={gestionando === x.id || (obs[x.id] ?? x.observacion ?? "").trim() === (x.observacion ?? "").trim()}
                          onClick={() => gestionar(x, null)}>
                    {gestionando === x.id ? "Guardando…" : "Guardar observación"}
                  </button>
                  {x.estado === "abierta" && (
                    <button type="button" className="us-mini" disabled={gestionando === x.id}
                            onClick={() => gestionar(x, "en_proceso")}>Tomar el caso</button>
                  )}
                </div>
              </div>
            )}

            {/* Lo que prometieron. Sin compromiso, la novedad está abierta
                y nadie ha dicho nada — que es peor que ir tarde. */}
            {x.estado !== "cerrada" && (
              x.compromiso ? (
                <p className={"nv-compromiso" + (x.vencida ? " vencido" : "")}>
                  <b>Se comprometieron a:</b> {x.compromiso}
                  {x.fecha_compromiso && (
                    <em>{x.vencida ? "era para el " : "para el "}{dia(x.fecha_compromiso)}</em>
                  )}
                </p>
              ) : (
                <p className="nv-compromiso sin">Todavía nadie ha respondido.</p>
              )
            )}

            {/* EL HILO. Es lo que hoy pasa por teléfono y no queda en
                ninguna parte; a la semana nadie recuerda quién dijo qué. */}
            {respuestas.length > 0 && (
              <ol className="nv-hilo">
                {respuestas.map((r) => (
                  <li key={r.id}>
                    <div className="nv-h-cab">
                      <b>{r.desde ?? quien(r.escrita_por)}</b>
                      <span>{quien(r.escrita_por)} · {cuando(r.escrita_en)}</span>
                    </div>
                    <p>{r.texto}</p>
                  </li>
                ))}
              </ol>
            )}

            {x.que_se_hizo && (
              <p className="nv-hecho"><b>Qué se hizo:</b> {x.que_se_hizo}</p>
            )}

            <div className="nv-pie">
              <span>
                Reportó {quien(x.creada_por)} · {cuando(x.creada_en)}
                {x.estado === "cerrada" && (
                  <> · cerró {quien(x.cerrada_por)} {cuando(x.cerrada_en)}</>
                )}
              </span>
              {x.estado !== "cerrada" && puedeEditar && !contestando && (
                <button type="button" className="us-mini"
                        onClick={() => {
                          setRespondiendo(x.id);
                          setResp({ texto: "", desde: miBodega,
                                    compromiso: x.compromiso ?? "",
                                    fecha: x.fecha_compromiso ?? "" });
                          setMal(null);
                        }}>
                  Responder o cerrar
                </button>
              )}
            </div>

            {contestando && (
              <div className="nv-responder">
                <label className="ancho">
                  <span>Qué respondes</span>
                  <textarea rows={2} value={resp.texto} maxLength={600} autoFocus
                            placeholder="Revisamos el despacho: salieron 400. Reponemos el jueves."
                            onChange={(e) => setResp({ ...resp, texto: e.target.value })} />
                </label>
                <label>
                  <span>Desde dónde</span>
                  <input value={resp.desde} placeholder="CD Galapa"
                         onChange={(e) => setResp({ ...resp, desde: e.target.value })} />
                </label>
                <label>
                  <span>Te comprometes a</span>
                  <input value={resp.compromiso} placeholder="Reponer 40 estibas"
                         onChange={(e) => setResp({ ...resp, compromiso: e.target.value })} />
                </label>
                <label>
                  <span>Para cuándo</span>
                  <input type="date" value={resp.fecha}
                         onChange={(e) => setResp({ ...resp, fecha: e.target.value })} />
                </label>

                <div className="nv-acciones">
                  <button type="button" className="btn" disabled={mandando}
                          onClick={() => responder(x)}>
                    {mandando ? "Enviando…" : "Responder"}
                  </button>
                  <button type="button" className="us-mini" disabled={cerrando === x.id}
                          onClick={() => cerrar(x)}>
                    {cerrando === x.id ? "Cerrando…" : "Cerrar con esto"}
                  </button>
                  <button type="button" className="btn plano"
                          onClick={() => { setRespondiendo(null); setMal(null) }}>
                    Cancelar
                  </button>
                </div>
                <p className="nv-ojo">
                  <b>Responder</b> la deja abierta y guarda lo que dijiste.{" "}
                  <b>Cerrar</b> la da por resuelta con ese mismo texto.
                </p>
              </div>
            )}
          </article>
          );
        })}
      </section>
    </>
  );
}
