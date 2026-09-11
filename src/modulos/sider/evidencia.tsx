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

import { useRef, useState } from "react";
/* Lo genérico se mudó a src/lib/evidencia: la ubicación y el sellado de
   la foto también los usa Acciones, y dos copias del sellado es que el
   día que haya que arreglar la banda se arregle en una sola. Se vuelve a
   exportar desde aquí para que las pantallas de T1 / T2 sigan importando
   del mismo sitio de siempre. */
import {
  PRECISION_BUENA, PRECISION_MALA, buscarDireccion, usePosicion, sellar,
  type Ubicacion, type Foto,
} from "@/lib/evidencia";

export {
  PRECISION_BUENA, PRECISION_MALA, buscarDireccion, usePosicion, sellar,
};
export type { Ubicacion, Foto };

export const RANURAS = [
  { id: "costado_izq", t: "Costado izquierdo", d: "El lado completo del vehículo" },
  { id: "costado_der", t: "Costado derecho", d: "El otro lado, completo" },
  { id: "placa", t: "Placa", d: "Que se lea el número sin dudar" },
] as const;

export type Ranura = (typeof RANURAS)[number]["id"];

/* La cuarta ranura, y la única opcional. No está dentro de RANURAS a
   propósito: RANURAS es "lo que hay que tener para que el viaje esté
   probado" y se usa para contar lo que falta, bloquear el botón y decir
   "3 de 3". Meter aquí la observación haría que un viaje CON problema se
   viera menos completo que uno sin él, que es al revés de la verdad. */
export const RANURA_OBS = {
  id: "observacion",
  t: "Foto de la observación",
  d: "Lo que hay que dejar probado",
} as const;
export type RanuraObs = typeof RANURA_OBS.id;
export type RanuraCualquiera = Ranura | RanuraObs;

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

/* ==================== COMPLETAR UNA FOTO QUE FALTA ====================
   Vive aquí, y no en la pantalla que la usa, porque la usan DOS: el
   ojito de la Fuente principal y el aviso de la pantalla de llegada. Dos
   copias de esto serían dos sitios donde arreglar el sellado el día que
   haga falta, y uno de los dos se quedaría sin arreglar.

   LA REGLA QUE NO SE NEGOCIA: la foto NO se sella con la hora ni con las
   coordenadas de la certificación original. Eso sería fabricar una
   prueba —diría que la tomaron el martes en Galapa cuando la tomaron hoy
   aquí—. Se sella con la hora y el sitio de AHORA y con la palabra
   AÑADIDA DESPUÉS quemada en la banda. Vale menos como prueba, y así
   debe ser: se tomó después.
   ==================================================================== */
export async function completarFoto(
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  cli: any,
  d: {
    viajeId: string; certId: string; placa: string;
    punta: "salida" | "llegada"; ranura: Ranura;
    ubi: Ubicacion | null; direccion: string;
    archivo: File;
  }
): Promise<string | null> {
  const nombre = RANURAS.find((r) => r.id === d.ranura)!.t;
  let foto: Foto;
  try {
    foto = await sellar(d.archivo, {
      titulo: d.placa,
      ubi: d.ubi,
      direccion: d.direccion.trim(),
      etiqueta: `${d.punta.toUpperCase()} · ${nombre} · AÑADIDA DESPUÉS`,
    });
  } catch {
    return `No se pudo procesar esa foto. Vuelve a tomarla.`;
  }

  const ruta = `${d.viajeId}/${d.punta}/${d.ranura}.jpg`;
  const { error: eSubir } = await cli.storage
    .from("sider")
    .upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
  if (eSubir) {
    URL.revokeObjectURL(foto.url);
    return `No se pudo subir ${nombre.toLowerCase()}: ${eSubir.message}`;
  }

  const { error: eFila } = await cli.from("sider_fotos").insert({
    certificacion_id: d.certId, ranura: d.ranura, ruta,
    ancho: foto.ancho, alto: foto.alto, bytes: foto.blob.size,
  });
  URL.revokeObjectURL(foto.url);
  /* El archivo YA está arriba. Si la fila no entra, la foto existe y
     nadie la ve: se dice con esas palabras y no con un "error" pelado,
     porque la salida es distinta —volver a intentar, no volver a
     tomarla—. */
  if (eFila) {
    return `${nombre} subió como imagen pero no quedó registrada ` +
           `(${eFila.message}). Vuelve a intentarlo.`;
  }
  return null;
}

/** Un hueco de foto que se puede llenar. El gemelo de Ranurita para lo
 *  que faltó: se ve distinto porque no es lo mismo tomar la evidencia en
 *  su momento que completarla después. */
export function HuecoFaltante({ r, ocupado, puede, tomar }: {
  r: (typeof RANURAS)[number];
  ocupado: boolean;
  /** Sin ubicación no se puede: es lo que prueba dónde se tomó. */
  puede: boolean;
  tomar: (archivo: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="ct-foto ct-hueco">
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden
             onChange={(e) => {
               const f = e.target.files?.[0];
               if (f) tomar(f);
               e.target.value = "";
             }} />
      <button type="button" disabled={ocupado || !puede}
              title={puede ? `Tomar ${r.t.toLowerCase()} ahora` : "Primero activa tu ubicación"}
              onClick={() => ref.current?.click()}>
        <span className="ct-mas" aria-hidden="true">+</span>
        <b>{r.t}</b>
        <span className="ct-ayuda">{ocupado ? "Subiendo…" : "Falta · tomarla"}</span>
      </button>
    </div>
  );
}

/* ==================== La observación y su foto ====================
   Van juntas y no en pasos distintos porque son una sola cosa: "llegó
   con el sello roto" + la foto del sello. La nota estaba antes al lado
   de la dirección, dos pantallas atrás de su propia prueba, y así nadie
   relacionaba la una con la otra.

   La foto es OPCIONAL aunque haya texto escrito. A veces no hay nada
   que fotografiar —llegó tarde, el conductor no era el mismo— y trancar
   el botón de certificar por eso deja a alguien de pie al lado del
   vehículo peleando con el teléfono por una nota sin imagen.
   ================================================================ */
export function CajaObservacion({ nota, setNota, foto, tomar, quitar, punta }: {
  nota: string;
  setNota: (s: string) => void;
  foto: Foto | undefined;
  tomar: (archivo: File) => void;
  quitar: () => void;
  punta: "salida" | "llegada";
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="ct-obs">
      <label>
        <span>
          Observación <em>· opcional</em>
        </span>
        <textarea
          value={nota}
          rows={3}
          maxLength={400}
          placeholder={
            punta === "llegada"
              ? "Algo que haya que dejar dicho de esta llegada: un sello roto, estibas golpeadas, faltantes…"
              : "Algo que haya que dejar dicho de esta salida"
          }
          onChange={(e) => setNota(e.target.value)}
        />
      </label>

      <div className={"ct-foto ct-obs-foto" + (foto ? " lista" : "")}>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) tomar(f);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => ref.current?.click()}>
          {foto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={foto.url} alt={RANURA_OBS.t} />
          ) : (
            <span className="ct-mas" aria-hidden="true">+</span>
          )}
          <b>{foto ? RANURA_OBS.t : "Añadir foto"}</b>
          <span className="ct-ayuda">
            {foto ? "Tocar para repetir" : "Si se puede fotografiar"}
          </span>
        </button>
        {foto && (
          <button type="button" className="ct-quitar" onClick={quitar}>
            Quitar la foto
          </button>
        )}
      </div>
    </div>
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
    fotos: Partial<Record<RanuraCualquiera, Foto>>;
    avance?: (t: string) => void;
  }
): Promise<string | null> {
  /* La de la observación va DE ÚLTIMA, y no es cosmético: si se corta el
     dato a mitad de la subida, lo que alcanzó a subir son las
     obligatorias. Al revés, un viaje podría quedar con la foto del sello
     roto y sin la placa. */
  const cola = [...RANURAS, RANURA_OBS];
  const cuantas = cola.filter((r) => d.fotos[r.id]).length;
  let n = 0;
  for (const r of cola) {
    const f = d.fotos[r.id];
    if (!f) continue;
    d.avance?.(`Subiendo ${r.t.toLowerCase()}… (${n + 1} de ${cuantas})`);
    const ruta = `${d.viajeId}/${d.punta}/${r.id}.jpg`;
    const { error } = await cli.storage
      .from("sider")
      .upload(ruta, f.blob, { contentType: "image/jpeg", upsert: true });
    if (error) return `la foto "${r.t}" no subió: ${error.message}`;
    /* EL ERROR DE ESTE INSERT SE ESTABA IGNORANDO, y era grave: la
       imagen quedaba en el bucket y la FILA nunca entraba, así que la
       foto existía y no la veía nadie —ni el ojito, ni el contador, ni
       el Excel— y la pantalla decía "Listo". Evidencia que se pierde en
       silencio es peor que evidencia que falta, porque nadie la busca.
       Lo destapó la foto de la observación: sin correr la migración, la
       base rechaza esa ranura con "invalid input value for enum
       ranura_foto" y aquí no pasaba nada. */
    const { error: eFila } = await cli.from("sider_fotos").insert({
      certificacion_id: d.certId,
      ranura: r.id,
      ruta,
      ancho: f.ancho,
      alto: f.alto,
      bytes: f.blob.size,
    });
    if (eFila) {
      const enum_ = /invalid input value for enum/i.test(eFila.message);
      return enum_
        ? `la foto "${r.t}" subió pero la base no conoce esa ranura todavía: ` +
          `falta correr supabase/migraciones/2026-09-foto-observacion.sql en Supabase`
        : `la foto "${r.t}" subió pero no quedó registrada: ${eFila.message}`;
    }
    n++;
  }
  return null;
}
