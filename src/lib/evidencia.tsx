"use client";

/**
 * EVIDENCIA — dónde estabas y qué foto tomaste.
 *
 * Esto NO es de un módulo. Certificar un viaje de T1 / T2 y reportar una
 * acción correctiva piden lo mismo: el punto donde estaba el teléfono con
 * su precisión, y una foto sellada con hora y coordenadas al momento de
 * tomarla. Vivía dentro de sider/evidencia.tsx porque era el único que lo
 * usaba; ahora son dos, y dos copias del sellado es que el día que haya
 * que arreglar la banda de la foto se arregle en una sola y nadie se dé
 * cuenta hasta que alguien compare dos fotos.
 *
 * sider/evidencia.tsx sigue exportando todo esto tal cual, así que las
 * pantallas de T1 / T2 no cambiaron una línea.
 */

import { useCallback, useState } from "react";

/* Más de esto y la ubicación no sirve como evidencia: son cuadras de
   error. No bloquea —a veces no hay señal— pero lo dice y queda guardado. */
export const PRECISION_BUENA = 50;
export const PRECISION_MALA = 200;

/** Lado mayor de la foto ya procesada. HD sin que pese 8 MB. */
export const LADO_MAX = 1600;

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
    const r = await fetch(u, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    return (j?.display_name as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Pedir la ubicación del teléfono. Devuelve el punto, el estado de la
 * búsqueda y el mensaje de error EN PALABRAS, porque "PERMISSION_DENIED"
 * no le dice nada a quien está parado en un pasillo.
 */
export function usePosicion() {
  const [ubi, setUbi] = useState<Ubicacion | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errUbi, setErrUbi] = useState<string | null>(null);
  const [direccion, setDireccion] = useState("");
  const [buscandoDir, setBuscandoDir] = useState(false);

  const pedir = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setErrUbi("Este equipo no tiene ubicación. Hay que hacerlo desde el celular.");
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
        // responde, lo hecho sigue valiendo con las coordenadas.
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
            ? "Diste que no a la ubicación. Hay que permitirla: sin saber dónde se hizo, esto no prueba nada. Actívala en los permisos del navegador y vuelve a tocar."
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

/**
 * SELLAR LA FOTO.
 *
 * Le quema abajo una banda con la etiqueta, la hora y las coordenadas. El
 * sello se pone AQUÍ, en el teléfono, en el momento de tomarla —no en el
 * servidor al subirla— porque entre tomar y subir puede pasar media hora
 * sin señal, y entonces la hora que quedaría escrita sería la de la
 * subida. La foto tiene que decir cuándo se tomó, no cuándo llegó.
 *
 * También la encoge a 1600 px de lado mayor: una foto de celular moderna
 * pesa 6 u 8 MB y sube en un minuto largo con la señal de una bodega. A
 * 1600 se sigue leyendo una placa y pesa medio mega.
 */
export async function sellar(
  archivo: File,
  d: { titulo: string; ubi: Ubicacion | null; direccion: string; etiqueta: string }
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
  c.fillText(`${d.titulo} · ${d.etiqueta}`, p, al - alto + p * 0.6);

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
