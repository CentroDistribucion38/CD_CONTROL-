/**
 * EL TABLERO DE ROTURAS EN SITIO, EN EXCEL —
 *   POST /api/roturas/exportar   { ids: string[], periodo: string, filtros: string }
 *
 * Recibe los id de LO QUE ESTÁ EN PANTALLA (estado, búsqueda, fecha y turno ya
 * aplicados) y arma el libro con src/modulos/roturas/libro-roturas.ts.
 * Con la sesión del usuario (RLS): nadie exporta lo que no podría ver.
 *
 * LAS FOTOS SE ACHICAN antes de entrar (≈ 900 px, JPEG): una foto del teléfono
 * pesa 2-4 MB y Vercel no deja que la respuesta pase de 4,5 MB. Achicadas
 * pesan ~100 KB y entran decenas. Si aun así no caben, las que sobran se
 * quedan en la app y el libro lo dice.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { misPermisos } from "@/lib/permisos";
import type { Rotura } from "@/modulos/roturas/datos";
import { nombresTodos } from "@/modulos/sider/datos";
import { armarLibroRoturas, type FotoLibro } from "@/modulos/roturas/libro-roturas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IDS = 3000;
const FOTOS_POR_ROTURA = 3;
const FOTOS_A_LA_VEZ = 8;
const TOPE_FOTOS_MS = 25_000;
const TOPE_BYTES_FOTOS = 3_400_000;   // el resto del libro cabe holgado en lo que queda hasta 4,5 MB
const LADO_FOTO = 900;

const sello = () => new Date().toLocaleString("sv", { timeZone: "America/Bogota" }).replace(/[-:]/g, "").replace(" ", "-").slice(0, 13);
const uuid = /^[0-9a-f-]{36}$/i;

type Achicador = (b: Buffer) => Promise<{ buf: Buffer; ancho: number | null; alto: number | null; ext: "jpeg" | "png" } | null>;

/** sharp viene con Next. Si por lo que sea no está, la foto entra como llegó (si es JPEG o PNG). */
async function achicador(): Promise<Achicador> {
  try {
    const sharp = (await import("sharp")).default;
    return async (b) => {
      const { data, info } = await sharp(b).rotate().resize({ width: LADO_FOTO, height: LADO_FOTO, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 62, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      return { buf: data, ancho: info.width ?? null, alto: info.height ?? null, ext: "jpeg" };
    };
  } catch {
    return async (b) => {
      if (b[0] === 0xff && b[1] === 0xd8) return { buf: b, ancho: null, alto: null, ext: "jpeg" };
      if (b[0] === 0x89 && b[1] === 0x50) return { buf: b, ancho: null, alto: null, ext: "png" };
      return null;   // HEIC u otro: Excel no lo pinta
    };
  }
}

export async function POST(req: Request) {
  const inicio = Date.now();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const permisos = await misPermisos();
  if (!permisos.puedeVer("/roturas/en-sitio/tablero")) return NextResponse.json({ error: "Tu rol no ve el tablero de roturas." }, { status: 403 });

  const cuerpo = (await req.json().catch(() => null)) as { ids?: unknown; periodo?: unknown; filtros?: unknown } | null;
  const ids = Array.isArray(cuerpo?.ids) ? (cuerpo!.ids as unknown[]).map(String).filter((x) => uuid.test(x)) : [];
  if (!ids.length) return NextResponse.json({ error: "No hay roturas en lo filtrado." }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `Son ${ids.length} roturas: filtra por fecha (máximo ${MAX_IDS}).` }, { status: 400 });
  const periodo = typeof cuerpo?.periodo === "string" && cuerpo.periodo ? cuerpo.periodo.slice(0, 80) : "Todas las fechas";
  const filtros = typeof cuerpo?.filtros === "string" ? cuerpo.filtros.slice(0, 200) : "";

  /* LAS ROTURAS, de a 200 id por consulta (la URL tiene tope). */
  const roturas: Rotura[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("v_roturas").select("*").in("id", ids.slice(i, i + 200));
    if (error) return NextResponse.json({ error: `No pude leer las roturas: ${error.message}` }, { status: 500 });
    roturas.push(...((data ?? []) as Rotura[]));
  }

  /* LAS FOTOS: hasta tres por rotura, primero las de la rotura y luego el descargo del OL. */
  type FilaFoto = { rotura_id: string; ruta: string; papel?: "rotura" | "descargo"; subida_en: string };
  const filasFoto: FilaFoto[] = [];
  const conFotos = roturas.filter((r) => Number(r.fotos) > 0 || Number(r.fotos_descargo) > 0).map((r) => r.id);
  for (let i = 0; i < conFotos.length; i += 200) {
    const tanda = conFotos.slice(i, i + 200);
    const con = await supabase.from("roturas_fotos").select("rotura_id, ruta, papel, subida_en").in("rotura_id", tanda).order("subida_en");
    /* Sin la columna `papel` (falta el SQL del descargo): todas son de la rotura. */
    const filas = con.error
      ? (await supabase.from("roturas_fotos").select("rotura_id, ruta, subida_en").in("rotura_id", tanda).order("subida_en")).data
      : con.data;
    filasFoto.push(...((filas ?? []) as FilaFoto[]));
  }
  const elegidas: FilaFoto[] = [];
  const porRotura = new Map<string, FilaFoto[]>();
  for (const f of filasFoto) { const l = porRotura.get(f.rotura_id) ?? []; l.push(f); porRotura.set(f.rotura_id, l) }
  for (const l of porRotura.values()) {
    l.sort((a, b) => ((a.papel ?? "rotura") === (b.papel ?? "rotura") ? a.subida_en.localeCompare(b.subida_en) : (a.papel ?? "rotura") === "rotura" ? -1 : 1));
    elegidas.push(...l.slice(0, FOTOS_POR_ROTURA));
  }
  /* Lo más reciente primero, como la tabla: si el peso corta, se quedan fuera las viejas. */
  const fecha = new Map(roturas.map((r) => [r.id, r.reportada_en]));
  elegidas.sort((a, b) => (fecha.get(b.rotura_id) ?? "").localeCompare(fecha.get(a.rotura_id) ?? ""));

  const achica = await achicador();
  const fotos: FotoLibro[] = [];
  let peso = 0, fuera = 0;
  for (let i = 0; i < elegidas.length; i += FOTOS_A_LA_VEZ) {
    if (Date.now() - inicio > TOPE_FOTOS_MS || peso >= TOPE_BYTES_FOTOS) { fuera += elegidas.length - i; break }
    const tanda = await Promise.all(elegidas.slice(i, i + FOTOS_A_LA_VEZ).map(async (f) => {
      try {
        const { data: blob, error } = await supabase.storage.from("roturas").download(f.ruta);
        if (error || !blob) return null;
        const a = await achica(Buffer.from(await blob.arrayBuffer()));
        return a ? { f, a } : null;
      } catch { return null }
    }));
    for (const x of tanda) {
      if (!x) { fuera++; continue }
      if (peso + x.a.buf.byteLength > TOPE_BYTES_FOTOS) { fuera++; continue }
      peso += x.a.buf.byteLength;
      fotos.push({ rotura_id: x.f.rotura_id, papel: x.f.papel ?? "rotura", foto: x.a.buf, ancho: x.a.ancho, alto: x.a.alto, extension: x.a.ext });
    }
  }

  const [nombres, yoR, logo] = await Promise.all([
    nombresTodos(),
    supabase.from("perfiles").select("usuario, nombre").eq("id", user.id).maybeSingle(),
    readFile(path.join(process.cwd(), "public", "marca", "logo-b.png")).catch(() => null),
  ]);
  const yo = yoR.data as { usuario: string | null; nombre: string | null } | null;

  const archivo = await armarLibroRoturas({
    roturas, nombres, fotos, fotosFuera: fuera, periodo, filtros,
    quien: yo?.nombre || yo?.usuario || "—", logo,
  });
  const nombre = `roturas-en-sitio-${sello()}.xlsx`;
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Content-Length": String(archivo.byteLength),
      "Cache-Control": "no-store",
      ...(fuera > 0 ? { "X-Fotos-Fuera": String(fuera) } : {}),
    },
  });
}
