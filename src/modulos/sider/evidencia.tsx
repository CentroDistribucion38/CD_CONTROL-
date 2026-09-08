"use client";

/**
 * LA EVIDENCIA — lo que comparten las dos puntas del viaje.
 *
 * Salida y llegada piden exactamente lo mismo: dónde se hizo, con qué
 * precisión, y tres fotos selladas. Si cada pantalla tuviera su propia
 * copia de esto, el día que haya que arreglar el sellado o el mensaje de
 * "diste que no a la ubicación" habría dos sitios donde hacerlo, y uno
 * de los dos se quedaría sin arreglar. Vive aquí una sola vez.
 */

import { useCallback, useRef, useState } from "react";

/* Más de esto y la ubicación no sirve como evidencia: son cuadras de
   error. No bloquea —a veces no hay señal— pero lo dice y queda guardado. */
export const PRECISION_BUENA = 50;
export const PRECISION_MALA = 200;

/** Lado mayor de la foto ya procesada. HD sin que pese 8 MB. */
const LADO_MAX = 1600;

export const RANURAS = [
  { id: "costado_izq", t: "Costado izquierdo", d: "El lado completo del vehículo" },
  { id: "costado_der", t: "Costado derecho", d: "El otro lado, completo" },
  { id: "placa", t: "Placa", d: "Que se lea el número sin dudar" },
] as const;

export type Ranura = (typeof RANURAS)[number]["id"];
export type Ubicacion = { lat: number; lng: number; precision: number; en: string };
export type Foto = { blob: Blob; url: string; ancho: number; alto: number };

/**
 * Traduce el punto a una dirección. Se usa Nominatim de OpenStreetMap
 * porque no pide llave ni cuenta; si no responde, no pasa nada grave: la
 * evidencia son las coordenadas y la precisión, y esas ya están. La
 * dirección es para que un humano sepa de qué sitio se está hablando sin
 * abrir un mapa.
 */
export async function buscarDireccion(lat: number, lng: number): Promise<string | null> {
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

/* ==================== El GPS ====================
   Un hook y no un componente porque las dos pantallas lo colocan en
   sitios distintos: en la salida es el paso 1 de seis, en la llegada es
   lo primero que aparece cuando se abre un vehículo.
   ================================================ */
export function usePosicion() {
  const [ubi, setUbi] = useState<Ubicacion | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errUbi, setErrUbi] = useState<string | null>(null);
  const [direccion, setDireccion] = useState("");
  const [buscandoDir, setBuscandoDir] = useState(false);

  const pedir = useCallback(() => {
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

  const limpiar = useCallback(() => {
    setUbi(null);
    setErrUbi(null);
    setDireccion("");
  }, []);

  return { ubi, buscando, errUbi, direccion, setDireccion, buscandoDir, pedir, limpiar };
}

/** La tarjeta de "ubicación tomada", con su semáforo de precisión. */
export function TarjetaUbicacion({ ubi }: { ubi: Ubicacion }) {
  return (
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
  );
}

/** El campo de dirección: sale del punto, se puede corregir. */
export function CampoDireccion({ direccion, setDireccion, buscandoDir }: {
  direccion: string;
  setDireccion: (s: string) => void;
  buscandoDir: boolean;
}) {
  return (
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
  );
}

/* ==================== Una ranura de foto ==================== */
export function Ranurita({ r, foto, tomar }: {
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
export async function sellar(
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

/** Los errores de Postgres no le explican nada a quien está en el patio. */
export function traducir(m: string): string {
  const t = m.toLowerCase();
  if (t.includes("does not exist") || t.includes("schema cache") || t.includes("function")) {
    return "Falta crear el módulo en Supabase: ejecuta supabase/modulos/sider.sql en el SQL Editor.";
  }
  if (t.includes("supervisor") || t.includes("row-level security") || t.includes("permission")) {
    return "Tu usuario no tiene permiso para certificar. Se necesita rol de supervisor o administrador.";
  }
  return m;
}

/**
 * Sube las tres fotos de una punta y las registra. Devuelve el mensaje de
 * error de la primera que falle, o null si todas subieron.
 *
 * Las fotos van DESPUÉS de la certificación porque su ruta lleva el id de
 * la certificación. Si una falla, la punta queda con menos de tres y la
 * Fuente principal lo muestra como "1/3 fotos": se ve el hueco en vez de
 * perderse.
 */
export async function subirFotos(
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  cli: any,
  d: {
    viajeId: string;
    certId: string;
    punta: "salida" | "llegada";
    fotos: Partial<Record<Ranura, Foto>>;
    avance?: (t: string) => void;
  }
): Promise<string | null> {
  let n = 0;
  for (const r of RANURAS) {
    const f = d.fotos[r.id];
    if (!f) continue;
    d.avance?.(`Subiendo ${r.t.toLowerCase()}… (${n + 1} de ${RANURAS.length})`);
    const ruta = `${d.viajeId}/${d.punta}/${r.id}.jpg`;
    const { error } = await cli.storage
      .from("sider")
      .upload(ruta, f.blob, { contentType: "image/jpeg", upsert: true });
    if (error) return `la foto "${r.t}" no subió: ${error.message}`;
    await cli.from("sider_fotos").insert({
      certificacion_id: d.certId,
      ranura: r.id,
      ruta,
      ancho: f.ancho,
      alto: f.alto,
      bytes: f.blob.size,
    });
    n++;
  }
  return null;
}
