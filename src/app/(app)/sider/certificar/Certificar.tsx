"use client";

/**
 * CERTIFICAR — un paso por pantalla, no un formulario con 16 campos.
 *
 * Quien llena esto está parado al lado de un vehículo, con el teléfono en
 * una mano. Un formulario largo obliga a buscar dónde quedó uno; una
 * secuencia de pasos con un botón grande, no.
 *
 * De las 16 columnas de la hoja solo se piden CINCO. Las once restantes
 * se van calculando y se ven abajo en el tiquete mientras se avanza: al
 * llegar al último paso ya se sabe cuántas cajas, unidades y HL se están
 * certificando, en vez de enterarse después en un Excel.
 *
 * LA UBICACIÓN VA PRIMERO, no al final. Si se pidiera al final, alguien
 * podría llenar todo y certificar desde su casa. Y se guarda la PRECISIÓN
 * en metros: una ubicación con dos kilómetros de error no es evidencia de
 * nada, y sin el número nadie puede saber que no lo era.
 *
 * LAS FOTOS SE SELLAN en el navegador antes de subirlas: placa, fecha,
 * hora y coordenadas quemadas en la esquina. Así la foto sigue probando
 * algo aunque salga del sistema por WhatsApp.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Origen, Sku } from "@/modulos/sider/datos";

/* Más de esto y la ubicación no sirve como evidencia: son cuadras de
   error. No bloquea —a veces no hay señal— pero lo dice y queda guardado. */
const PRECISION_BUENA = 50;
const PRECISION_MALA = 200;

/** Lado mayor de la foto ya procesada. HD sin que pese 8 MB. */
const LADO_MAX = 1600;

const RANURAS = [
  { id: "costado_izq", t: "Costado izquierdo", d: "El lado completo del vehículo" },
  { id: "costado_der", t: "Costado derecho", d: "El otro lado, completo" },
  { id: "placa", t: "Placa", d: "Que se lea el número sin dudar" },
] as const;

type Ranura = (typeof RANURAS)[number]["id"];

type Ubicacion = { lat: number; lng: number; precision: number; en: string };

/**
 * Traduce el punto a una dirección. Se usa Nominatim de OpenStreetMap
 * porque no pide llave ni cuenta; si no responde, no pasa nada grave: la
 * evidencia son las coordenadas y la precisión, y esas ya están. La
 * dirección es para que un humano sepa de qué sitio se está hablando sin
 * abrir un mapa.
 */
async function buscarDireccion(lat: number, lng: number): Promise<string | null> {
  try {
    const u = new URL("https://nominatim.openstreetmap.org/reverse");
    u.searchParams.set("format", "jsonv2");
    u.searchParams.set("lat", String(lat));
    u.searchParams.set("lon", String(lng));
    // 18 = nivel de calle. Más detalle devuelve el número de una casa que
    // muchas veces no existe en el mapa; menos, devuelve el barrio entero.
    u.searchParams.set("zoom", "18");
    u.searchParams.set("addressdetails", "1");
    u.searchParams.set("accept-language", "es");
    const r = await fetch(u, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const a = j?.address ?? {};
    /* Se arma corto y útil: vía, barrio, ciudad. El display_name de
       Nominatim trae hasta el país y el código postal y no cabe en la
       banda de la foto. */
    const partes = [
      [a.road, a.house_number].filter(Boolean).join(" "),
      a.neighbourhood || a.suburb || a.quarter,
      a.city || a.town || a.village || a.municipality,
    ].filter(Boolean);
    return partes.length ? partes.join(", ") : (j?.display_name ?? null);
  } catch {
    return null;
  }
}
type Foto = { blob: Blob; url: string; ancho: number; alto: number };

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const num = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function Certificar({ origenes, skus, estibasPorSider, esEditor }: {
  origenes: Origen[];
  skus: Sku[];
  estibasPorSider: number;
  esEditor: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [paso, setPaso] = useState(0);
  const [ubi, setUbi] = useState<Ubicacion | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errUbi, setErrUbi] = useState<string | null>(null);
  const [direccion, setDireccion] = useState("");
  const [buscandoDir, setBuscandoDir] = useState(false);

  const [planta, setPlanta] = useState("");
  const [sku, setSku] = useState("");
  const [estibas, setEstibas] = useState("");
  const [placa, setPlaca] = useState("");
  const [nota, setNota] = useState("");
  const [fotos, setFotos] = useState<Partial<Record<Ranura, Foto>>>({});

  const [enviando, setEnviando] = useState(false);
  const [avance, setAvance] = useState("");
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);

  const mat = skus.find((s) => s.sku === sku);
  const nEst = num(estibas);

  /* Las once derivadas, calculadas mientras se avanza. Son las mismas
     fórmulas de la hoja; la vista de la base las vuelve a calcular al
     leer, así que esto es solo para poder verlas antes de guardar. */
  const der = useMemo(() => {
    if (!mat || !nEst || nEst <= 0) return null;
    const cajas = mat.cajas_x_estiba == null ? null : Number(mat.cajas_x_estiba) * nEst;
    const unidades = cajas == null || mat.unidades_x_caja == null
      ? null : Number(mat.unidades_x_caja) * cajas;
    const hl = unidades == null || mat.hl_x_unidad == null
      ? null : Number(mat.hl_x_unidad) * unidades;
    return { sider: nEst / estibasPorSider, cajas, unidades, hl };
  }, [mat, nEst, estibasPorSider]);

  /* ---------------- Ubicación ---------------- */
  const pedirUbicacion = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setErrUbi("Este equipo no tiene ubicación. Hay que certificar desde el celular.");
      return;
    }
    setBuscando(true);
    setErrUbi(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const u = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy,
          en: new Date(pos.timestamp).toISOString(),
        };
        setUbi(u);
        setBuscando(false);
        // La dirección se busca aparte y no bloquea: si el servicio no
        // responde, la certificación sigue valiendo con las coordenadas.
        setBuscandoDir(true);
        setDireccion("");
        buscarDireccion(u.lat, u.lng).then((d) => {
          if (d) setDireccion(d);
          setBuscandoDir(false);
        });
      },
      (e) => {
        setBuscando(false);
        setErrUbi(
          e.code === e.PERMISSION_DENIED
            ? "Diste que no a la ubicación. Hay que permitirla: sin saber dónde se hizo, la certificación no prueba nada. Actívala en los permisos del navegador y vuelve a tocar."
            : e.code === e.POSITION_UNAVAILABLE
              ? "No se pudo ubicar. Sal a cielo abierto y vuelve a intentar."
              : "La ubicación tardó demasiado. Vuelve a intentar."
        );
      },
      // enableHighAccuracy prende el GPS de verdad en vez de estimar por
      // antenas: tarda más y gasta más batería, y es la diferencia entre
      // 8 metros y 2 kilómetros.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  /* ---------------- Fotos ---------------- */
  async function tomar(ranura: Ranura, archivo: File) {
    try {
      const foto = await sellar(archivo, {
        placa: placa.trim().toUpperCase() || "SIN PLACA",
        ubi,
        direccion: direccion.trim(),
        etiqueta: RANURAS.find((r) => r.id === ranura)!.t,
      });
      setFotos((f) => {
        if (f[ranura]) URL.revokeObjectURL(f[ranura]!.url);
        return { ...f, [ranura]: foto };
      });
    } catch {
      setAviso({ mal: true, texto: "No se pudo procesar esa foto. Vuelve a tomarla." });
    }
  }

  const faltanFotos = RANURAS.filter((r) => !fotos[r.id]);

  /* ---------------- Guardar ---------------- */
  async function certificar() {
    if (!ubi || !planta || !sku || !nEst || !placa.trim() || faltanFotos.length) return;
    setEnviando(true);
    setAviso(null);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cli = supabase as any;

    setAvance("Registrando el viaje…");
    const { data, error } = await cli.rpc("sider_certificar_salida", {
      p_placa: placa.trim().toUpperCase(),
      p_planta: planta,
      p_sku: sku,
      p_estibas: nEst,
      p_lat: ubi.lat,
      p_lng: ubi.lng,
      p_precision_m: Math.round(ubi.precision),
      p_ubicado_en: ubi.en,
      p_nota: nota.trim() || null,
      p_direccion: direccion.trim() || null,
    });

    if (error) {
      setAviso({ mal: true, texto: traducir(error.message) });
      setEnviando(false);
      setAvance("");
      return;
    }

    const fila = Array.isArray(data) ? data[0] : data;
    const viajeId: string = fila?.viaje_id;
    const certId: string = fila?.certificacion_id;

    /* Las fotos van después del viaje porque su ruta lleva el id de la
       certificación. Si una falla, el viaje queda con menos de tres y la
       Fuente principal lo muestra como "1/3 fotos": se ve el hueco en vez
       de perderse. */
    let subidas = 0;
    for (const r of RANURAS) {
      const f = fotos[r.id]!;
      setAvance(`Subiendo ${r.t.toLowerCase()}… (${subidas + 1} de 3)`);
      const ruta = `${viajeId}/salida/${r.id}.jpg`;
      const { error: eSub } = await cli.storage
        .from("sider")
        .upload(ruta, f.blob, { contentType: "image/jpeg", upsert: true });
      if (eSub) {
        setAviso({
          mal: true,
          texto:
            `El viaje quedó registrado, pero la foto "${r.t}" no subió: ${eSub.message}. ` +
            `Búscalo en la Fuente principal por la placa ${placa.toUpperCase()} y vuelve a intentar.`,
        });
        setEnviando(false);
        setAvance("");
        router.refresh();
        return;
      }
      await cli.from("sider_fotos").insert({
        certificacion_id: certId,
        ranura: r.id,
        ruta,
        ancho: f.ancho,
        alto: f.alto,
        bytes: f.blob.size,
      });
      subidas++;
    }

    setAvance("");
    setEnviando(false);
    setAviso({
      mal: false,
      texto: `Listo. ${placa.toUpperCase()} quedó certificado y va en tránsito hacia Barranquilla.`,
    });
    setPaso(RANURAS.length + 4);
    router.refresh();
  }

  function otro() {
    for (const f of Object.values(fotos)) if (f) URL.revokeObjectURL(f.url);
    setFotos({});
    setEstibas("");
    setPlaca("");
    setNota("");
    setAviso(null);
    setPaso(1);
  }

  if (!esEditor) {
    return (
      <section className="tarjeta">
        <div className="cab">
          <div>
            <h2>Solo lectura</h2>
            <p>Certificar requiere rol de supervisor o administrador. Pídeselo a un administrador.</p>
          </div>
        </div>
      </section>
    );
  }

  /* ---------------- Los pasos ---------------- */
  const pasos = [
    { t: "Ubicación", ok: !!ubi },
    { t: "Origen", ok: !!planta },
    { t: "Material", ok: !!sku },
    { t: "Carga", ok: !!nEst && !!placa.trim() },
    { t: "Fotos", ok: faltanFotos.length === 0 },
    { t: "Confirmar", ok: false },
  ];
  const listo = pasos.slice(0, 5).every((p) => p.ok);

  return (
    <>
      {/* ---------- El camino ---------- */}
      <ol className="ct-pasos">
        {pasos.map((p, i) => (
          <li key={p.t} className={(i === paso ? "aqui " : "") + (p.ok ? "listo" : "")}>
            <button type="button" onClick={() => setPaso(i)} disabled={enviando}>
              <i>{p.ok ? "✓" : i + 1}</i>
              <span>{p.t}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="tarjeta ct">
        {/* ================= 0 · Ubicación ================= */}
        {paso === 0 && (
          <div className="ct-paso">
            <h2>¿Dónde estás?</h2>
            <p className="ct-dice">
              Va primero a propósito. Si se pidiera al final, se podría llenar todo y
              certificar desde cualquier parte. Un toque y sigue.
            </p>

            {!ubi && (
              <button type="button" className="ct-grande" onClick={pedirUbicacion} disabled={buscando}>
                {buscando ? "Buscando el GPS…" : "Activar mi ubicación"}
              </button>
            )}

            {errUbi && <div className="aviso mal ct-suelto">{errUbi}</div>}

            {ubi && (
              <>
                <div className={"ct-ubi" + (ubi.precision > PRECISION_MALA ? " mala"
                                          : ubi.precision > PRECISION_BUENA ? " regular" : "")}>
                  <div className="rot">UBICACIÓN TOMADA</div>
                  <div className="coord">{ubi.lat.toFixed(6)}, {ubi.lng.toFixed(6)}</div>
                  <div className="pre">
                    Precisión <b>±{Math.round(ubi.precision)} m</b> ·{" "}
                    {new Date(ubi.en).toLocaleString("es-CO", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </div>
                  {ubi.precision > PRECISION_MALA && (
                    <p className="ojo">
                      Con ±{Math.round(ubi.precision)} m esto no ubica ni la manzana. Sal a cielo
                      abierto y vuelve a tomarla — igual queda guardada la precisión, así que
                      después se sabe qué tan buena era.
                    </p>
                  )}
                  {ubi.precision > PRECISION_BUENA && ubi.precision <= PRECISION_MALA && (
                    <p className="ojo">Aceptable, pero si puedes salir a cielo abierto mejora.</p>
                  )}
                </div>

                <label className="ct-dir">
                  <span>
                    Dirección
                    {buscandoDir && <em> · buscándola…</em>}
                    {!buscandoDir && !direccion && <em> · no se pudo resolver, escríbela</em>}
                  </span>
                  <input
                    value={direccion}
                    placeholder={buscandoDir ? "Buscando la dirección…" : "Cra 38 #45-12, El Bosque, Barranquilla"}
                    onChange={(e) => setDireccion(e.target.value)}
                  />
                  <em className="pie">
                    Sale del punto y se puede corregir. Lo que prueba dónde se hizo son las
                    coordenadas y la precisión, no este texto: por eso se guardan las dos cosas.
                  </em>
                </label>
                <div className="ct-botones">
                  <button type="button" className="btn" onClick={() => setPaso(1)}>Seguir</button>
                  <button type="button" className="btn plano" onClick={pedirUbicacion} disabled={buscando}>
                    Volver a tomarla
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= 1 · Origen ================= */}
        {paso === 1 && (
          <div className="ct-paso">
            <h2>¿De qué CD viene?</h2>
            <p className="ct-dice">
              Esta lista sale del maestro, no del código: lo que se agregue o corrija allá
              aparece aquí.
            </p>
            <div className="ct-opciones">
              {origenes.filter((o) => o.activo).map((o) => (
                <button key={o.planta} type="button"
                        className={"ct-op" + (planta === o.planta ? " on" : "")}
                        onClick={() => { setPlanta(o.planta); setPaso(2); }}>
                  <b>{o.cd_origen}</b>
                  <span>{o.planta}</span>
                </button>
              ))}
            </div>
            {!origenes.some((o) => o.activo) && (
              <div className="aviso mal ct-suelto">
                No hay orígenes activos en el maestro. Agrégalos en Maestro.
              </div>
            )}
          </div>
        )}

        {/* ================= 2 · Material ================= */}
        {paso === 2 && (
          <div className="ct-paso">
            <h2>¿Qué trae?</h2>
            <p className="ct-dice">
              Los que tienen el aviso naranja no tienen factores cargados: de ellos no se
              pueden calcular cajas, unidades ni HL.
            </p>
            <div className="ct-opciones">
              {skus.filter((s) => s.activo).map((s) => {
                const falta = s.cajas_x_estiba == null || s.unidades_x_caja == null || s.hl_x_unidad == null;
                return (
                  <button key={s.sku} type="button"
                          className={"ct-op" + (sku === s.sku ? " on" : "") + (falta ? " falta" : "")}
                          onClick={() => { setSku(s.sku); setPaso(3); }}>
                    <b>{s.descripcion}</b>
                    <span>
                      {s.sku}
                      {falta ? " · sin factores" : ` · ${nf2.format(Number(s.cajas_x_estiba))} cajas/estiba`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= 3 · Carga ================= */}
        {paso === 3 && (
          <div className="ct-paso">
            <h2>Estibas y placa</h2>
            <p className="ct-dice">Lo único que hay que teclear. Todo lo demás ya se calculó.</p>
            <div className="ct-campos">
              <label>
                <span>No. de estibas</span>
                <input inputMode="decimal" value={estibas} placeholder="40" autoFocus
                       onChange={(e) => setEstibas(e.target.value)} />
              </label>
              <label>
                <span>Placa</span>
                <input value={placa} placeholder="JYN141" autoCapitalize="characters"
                       onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
              </label>
              <label className="ancho">
                <span>Observación (opcional)</span>
                <input value={nota} placeholder="Algo que haya que dejar dicho de este viaje"
                       onChange={(e) => setNota(e.target.value)} />
              </label>
            </div>
            <div className="ct-botones">
              <button type="button" className="btn" disabled={!nEst || !placa.trim()}
                      onClick={() => setPaso(4)}>Seguir a las fotos</button>
            </div>
          </div>
        )}

        {/* ================= 4 · Fotos ================= */}
        {paso === 4 && (
          <div className="ct-paso">
            <h2>Tres fotos</h2>
            <p className="ct-dice">
              Cada una queda sellada con la placa, la fecha, la hora y las coordenadas
              quemadas en la esquina — así sigue probando algo aunque salga del sistema.
            </p>
            <div className="ct-fotos">
              {RANURAS.map((r) => (
                <Ranurita key={r.id} r={r} foto={fotos[r.id]} tomar={tomar} />
              ))}
            </div>
            <div className="ct-botones">
              <button type="button" className="btn" disabled={faltanFotos.length > 0}
                      onClick={() => setPaso(5)}>
                {faltanFotos.length
                  ? `Faltan ${faltanFotos.length} foto${faltanFotos.length > 1 ? "s" : ""}`
                  : "Seguir a confirmar"}
              </button>
            </div>
          </div>
        )}

        {/* ================= 5 · Confirmar ================= */}
        {paso === 5 && (
          <div className="ct-paso">
            <h2>Revisa y certifica</h2>
            <p className="ct-dice">
              Esto es exactamente la fila que va a quedar. Después de certificar, el
              vehículo sale en tránsito hacia Barranquilla.
            </p>
            <dl className="ct-revision">
              <div><dt>Placa</dt><dd className="fuerte">{placa.toUpperCase()}</dd></div>
              <div><dt>CD origen</dt><dd>{origenes.find((o) => o.planta === planta)?.cd_origen ?? "—"}</dd></div>
              <div><dt>Material</dt><dd>{mat?.descripcion ?? "—"}<em>{sku}</em></dd></div>
              <div><dt>Estibas</dt><dd>{nEst ? nf2.format(nEst) : "—"}</dd></div>
              <div className="ancho"><dt>Dónde</dt><dd>
                {direccion || (ubi ? `${ubi.lat.toFixed(5)}, ${ubi.lng.toFixed(5)}` : "—")}
                <em>
                  {ubi ? `${ubi.lat.toFixed(5)}, ${ubi.lng.toFixed(5)} · ±${Math.round(ubi.precision)} m` : "—"}
                </em>
              </dd></div>
              <div className="ancho"><dt>Fotos</dt><dd>
                {RANURAS.length - faltanFotos.length} de {RANURAS.length}
                {!!faltanFotos.length && <em>Faltan: {faltanFotos.map((r) => r.t.toLowerCase()).join(", ")}</em>}
              </dd></div>
            </dl>
            <div className="ct-botones">
              <button type="button" className="btn" onClick={certificar} disabled={!listo || enviando}>
                {enviando ? avance || "Certificando…" : "Certificar la salida"}
              </button>
              <button type="button" className="btn plano" onClick={() => setPaso(4)} disabled={enviando}>
                Volver
              </button>
            </div>
          </div>
        )}

        {/* ================= Listo ================= */}
        {paso === 6 && (
          <div className="ct-paso">
            <h2>Certificado</h2>
            <p className="ct-dice">
              {placa.toUpperCase()} va en tránsito. Cuando llegue a Barranquilla se
              certifica la otra punta desde <b>En tránsito</b>.
            </p>
            <div className="ct-botones">
              <button type="button" className="btn" onClick={otro}>Certificar otro vehículo</button>
            </div>
          </div>
        )}

        {aviso && <div className={"aviso" + (aviso.mal ? " mal" : " bien")}>{aviso.texto}</div>}
      </section>

      {/* ---------- El tiquete que se va armando ---------- */}
      {paso > 0 && paso < 6 && (
        <section className="ct-tiquete">
          <div className="rot">LO QUE VA A QUEDAR</div>
          <div className="cifras-t">
            <div><b>{nEst ? nf2.format(nEst) : "—"}</b><span>estibas</span></div>
            <div><b>{der ? nf2.format(der.sider) : "—"}</b><span>sider</span></div>
            <div><b>{der?.cajas != null ? nf.format(der.cajas) : "—"}</b><span>cajas</span></div>
            <div><b>{der?.unidades != null ? nf.format(der.unidades) : "—"}</b><span>unidades</span></div>
            <div><b>{der?.hl != null ? nf2.format(der.hl) : "—"}</b><span>HL</span></div>
          </div>
          {mat && der && der.cajas == null && (
            <p className="ojo">
              A <b>{mat.descripcion}</b> le faltan factores en el maestro, así que de este
              viaje no se pueden calcular cajas, unidades ni HL. Se puede certificar igual
              — la evidencia es lo importante — y las cifras salen cuando se completen.
            </p>
          )}
        </section>
      )}
    </>
  );
}

/* ==================== Una ranura de foto ==================== */
function Ranurita({ r, foto, tomar }: {
  r: (typeof RANURAS)[number];
  foto: Foto | undefined;
  tomar: (ranura: Ranura, archivo: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={"ct-foto" + (foto ? " lista" : "")}>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        // capture abre la cámara directamente en el celular en vez de la
        // galería: la evidencia se toma, no se busca.
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) tomar(r.id, f);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => ref.current?.click()}>
        {foto ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={foto.url} alt={r.t} />
        ) : (
          <span className="ct-camara">
            <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.2-2h7.2l1.2 2h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
              <circle cx="12" cy="13" r="3.6" />
            </svg>
          </span>
        )}
        <b>{r.t}</b>
        <span className="ct-ayuda">{foto ? "Tocar para repetir" : r.d}</span>
      </button>
    </div>
  );
}

/* ==================== Sellar la foto ====================
   Se reduce al lado mayor de 1600 y se le quema una banda con placa,
   fecha, hora y coordenadas. Se hace en el navegador y no en el
   servidor porque la evidencia debe salir sellada desde el aparato que
   la tomó: sellarla después dejaría un hueco entre la foto y su sello.
   ==================================================== */
async function sellar(
  archivo: File,
  d: { placa: string; ubi: Ubicacion | null; direccion: string; etiqueta: string }
): Promise<Foto> {
  const img = await new Promise<HTMLImageElement>((ok, mal) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = mal;
    i.src = URL.createObjectURL(archivo);
  });

  const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  const an = Math.round(img.width * escala);
  const al = Math.round(img.height * escala);

  const lienzo = document.createElement("canvas");
  lienzo.width = an;
  lienzo.height = al;
  const c = lienzo.getContext("2d")!;
  c.drawImage(img, 0, 0, an, al);
  URL.revokeObjectURL(img.src);

  /* La banda va abajo, con fondo sólido: un texto suelto sobre la foto se
     vuelve ilegible en cuanto el fondo es claro. */
  const alto = Math.max(46, Math.round(al * 0.075));
  const p = Math.round(alto * 0.28);
  c.fillStyle = "rgba(4,32,63,.86)";
  c.fillRect(0, al - alto, an, alto);

  const g1 = Math.round(alto * 0.42);
  const g2 = Math.round(alto * 0.3);
  const ahora = new Date();

  c.fillStyle = "#fff";
  c.font = `700 ${g1}px system-ui, sans-serif`;
  c.textBaseline = "top";
  c.fillText(`${d.placa} · ${d.etiqueta}`, p, al - alto + p * 0.6);

  c.fillStyle = "rgba(255,255,255,.82)";
  c.font = `500 ${g2}px system-ui, sans-serif`;
  const abajo =
    `${ahora.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` +
    (d.ubi ? `  ·  ${d.ubi.lat.toFixed(5)}, ${d.ubi.lng.toFixed(5)}  ±${Math.round(d.ubi.precision)} m` : "  ·  sin ubicación");
  c.fillText(abajo, p, al - alto + p * 0.6 + g1 * 1.25);

  /* La dirección va a la derecha del mismo renglón si cabe; si no, se
     recorta. Un texto que se sale del lienzo no se ve, y peor: parece
     que la foto quedó cortada. */
  if (d.direccion) {
    const libre = an - p * 2 - c.measureText(abajo).width - p;
    if (libre > g2 * 6) {
      let t = d.direccion;
      while (c.measureText(t).width > libre && t.length > 4) t = t.slice(0, -2);
      if (t !== d.direccion) t = t.slice(0, -1) + "…";
      c.textAlign = "right";
      c.fillText(t, an - p, al - alto + p * 0.6 + g1 * 1.25);
      c.textAlign = "left";
    }
  }

  const blob = await new Promise<Blob>((ok) =>
    lienzo.toBlob((b) => ok(b!), "image/jpeg", 0.86)
  );
  return { blob, url: URL.createObjectURL(blob), ancho: an, alto: al };
}

function traducir(m: string): string {
  const t = m.toLowerCase();
  if (t.includes("does not exist") || t.includes("schema cache") || t.includes("function")) {
    return "Falta crear el módulo en Supabase: ejecuta supabase/modulos/sider.sql en el SQL Editor.";
  }
  if (t.includes("supervisor") || t.includes("row-level security") || t.includes("permission")) {
    return "Tu usuario no tiene permiso para certificar. Se necesita rol de supervisor o administrador.";
  }
  if (t.includes("ubicación")) return m;
  return m;
}
