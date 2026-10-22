"use client";

/* ===================================================================
   CONTAR · LA HOJA DEL INVENTARIO FISCAL

   «Debería aparecer la opción de fiscal y de una un toolbox para contar.»

   Es el mismo renglón del conteo diario —dónde, qué, vence, cuánto— y se ve
   igual a propósito: quien cuenta el fiscal ya sabe contar el FEFO. Cambia lo
   que se guarda y a dónde va:

     · Es un conteo APARTE, atado a la hoja de esta persona. No entra en La base
       ni en el Tablero.
     · A CIEGAS. Cada persona de la pareja ve solo lo suyo; el cruce entre los
       dos es un paso posterior.
     · Cada renglón se guarda al momento, con su nombre. Sin cola de señal: si no
       hay red, avisa y el renglón sigue en pantalla para volver a darle «Anotar».
     · El cero cuenta: contar que ahí no hay nada es un dato.
     · Quitar un renglón es de quien lo anotó, mientras el inventario siga abierto.
     · «TERMINÉ MI HOJA»: cuando la persona termina de contar avisa, y desde ahí no
       anota ni quita nada hasta que REABRA su hoja. Cuando las dos personas de
       la pareja terminan, quien arma el plan puede cruzar (pantalla «Inventario
       fiscal»). Aquí solo se sabe SI la pareja terminó, nunca lo que contó.
   =================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Buscador } from "@/components/Buscador";
import { usePosicion, sellar, type Foto } from "@/lib/evidencia";
import { RevisionesFiscal } from "./RevisionesFiscal";
import { useConfirmar } from "@/components/Confirmar";
import { useAvisos } from "@/components/Aviso";
import type { Material, Ubicacion } from "@/modulos/inventario/fefo";
import { MODULOS_DE_LA_HOJA, moduloConLados, modulosQueFaltan } from "@/modulos/inventario/modulos-hoja";
import { fechaConDia, type HojaParaContar } from "@/modulos/inventario/fiscal";
import {
  VACIO_FISCAL, argumentosFiscal, revisarFiscal, totalCajas, esCuenta, cantidad, pideEstadoFiscal, esCilindroFiscal, opcionesEstadoFiscal,
  type BorradorFiscal, type RenglonFiscal,
} from "@/modulos/inventario/fiscal-contar";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const claveBase = (u: { calle: string; modulo: string }) => `${u.calle}|${u.modulo}`;
const ordenCalle = (a: string, b: string) => {
  const suelta = (x: string) => (x.length === 1 ? 0 : 1);
  return suelta(a) - suelta(b) || a.localeCompare(b, "es", { numeric: true });
};
const nombreLado = (l: string) => l === "" ? "Este módulo no tiene lados" : l === "IZQ" ? "Izquierdo" : "Derecho";
const dosDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 2);
const dd = (n: number | null) => n == null ? "··" : String(n).padStart(2, "0");

/** «3 estibas + 10 cajas» / «12 cajas». */
export function textoCantidad(r: Pick<RenglonFiscal, "estibas" | "saldo" | "cajas">): string {
  if (r.cajas != null) return `${nf.format(r.cajas)} caja${r.cajas === 1 ? "" : "s"}`;
  const e = r.estibas, s = r.saldo ?? 0;
  const est = e != null ? `${nf.format(e)} estiba${e === 1 ? "" : "s"}` : "";
  const caj = s > 0 ? `${nf.format(s)} caja${s === 1 ? "" : "s"}` : "";
  return [est, caj].filter(Boolean).join(" + ") || "0 cajas";
}

export function ContarFiscal({
  hojas, bodegaId, materiales, ubicaciones,
}: {
  hojas: HojaParaContar[];
  bodegaId: string;
  materiales: Material[];
  ubicaciones: Ubicacion[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pedir, dialogo] = useConfirmar();
  const [avisar, avisos] = useAvisos();

  /* LA HOJA QUE SE CUENTA. Casi siempre es una sola; si la persona está en
     dos inventarios, se escoge. Las que todavía no son de hoy no se pueden
     escoger para contar, pero se avisa de ellas. */
  const contables = hojas.filter((h) => h.puedeContar);
  const [hojaId, setHojaId] = useState<string>((contables[0] ?? hojas[0])?.hojaId ?? "");
  const hoja = hojas.find((h) => h.hojaId === hojaId) ?? contables[0] ?? hojas[0];

  const [b, setB] = useState<BorradorFiscal>(VACIO_FISCAL);
  const [mios, setMios] = useState<RenglonFiscal[] | null>(null);
  /* LAS DOS PESTAÑAS, IGUAL QUE EN «FEFO diario»: Anotar y El borrador (lo que llevo). */
  const [mas, setMas] = useState(false);
  const [pestania, setPestania] = useState<"anotar" | "borrador">("anotar");
  const [guardando, setGuardando] = useState(false);
  /* El renglón que se está corrigiendo (id): el formulario trae sus datos y «Anotar» lo cambia en su sitio. */
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null);
  const router = useRouter();
  /* Lo que se terminó o reabrió desde que se abrió la pantalla; sin eso valen los datos que trajo la página. */
  const [terminos, setTerminos] = useState<Record<string, { termine: boolean; parejaTermino: boolean }>>({});
  const pon = <K extends keyof BorradorFiscal>(k: K, v: BorradorFiscal[K]) => setB((x) => ({ ...x, [k]: v }));

  const campoCalle = useRef<HTMLInputElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const campoDia = useRef<HTMLInputElement>(null);
  const campoMes = useRef<HTMLInputElement>(null);
  const campoAnio = useRef<HTMLInputElement>(null);
  const campoCantidad = useRef<HTMLInputElement>(null);
  const campoSaldo = useRef<HTMLInputElement>(null);

  /* ---------- LA CALCULADORA (igual que en el conteo normal) ----------
     Al tocar una cantidad sube un panel fijo al pie con el teclado completo (el del celular se suprime con
     `inputMode="none"`). En el computador no hay panel flotante: se escribe con el teclado y la fila de signos queda a la vista. */
  const campoActivo = useRef<"estibas" | "saldo" | "cajas">("estibas");
  const [calcAbierta, setCalcAbierta] = useState(false);
  const [calcBajo, setCalcBajo] = useState(0);
  const [escritorio, setEscritorio] = useState(false);
  const [calcActiva, setCalcActiva] = useState<"estibas" | "saldo" | "cajas">("estibas");
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)");
    const act = () => setEscritorio(mq.matches);
    act(); mq.addEventListener("change", act);
    return () => mq.removeEventListener("change", act);
  }, []);
  useEffect(() => {
    if (!calcAbierta) { setCalcBajo(0); return }
    const vv = window.visualViewport;
    if (!vv) return;
    const medir = () => setCalcBajo(Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop))));
    medir();
    vv.addEventListener("resize", medir); vv.addEventListener("scroll", medir);
    return () => { vv.removeEventListener("resize", medir); vv.removeEventListener("scroll", medir) };
  }, [calcAbierta]);

  /* ---------- LO QUE YA LLEVO ANOTADO ---------- */
  const leer = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("inv_fiscal_contar_mios", { p_hoja: id });
    if (error) { avisar.mal(error.message); setMios([]); return }
    setMios((data ?? []) as RenglonFiscal[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);
  useEffect(() => { if (hoja?.hojaId) { setMios(null); void leer(hoja.hojaId) } }, [hoja?.hojaId, leer]);

  /* ---------- EL RENGLÓN A MEDIO ESCRIBIR NO SE PIERDE ----------
     Se guarda en el teléfono (no en la base) y con la llave de la hoja: si se
     cae la señal o se recarga, el renglón sigue donde estaba. */
  const llave = hoja ? `fiscal.renglon.${hoja.hojaId}` : null;
  useEffect(() => {
    if (!llave) return;
    try {
      const crudo = localStorage.getItem(llave);
      if (crudo) {
        const g = JSON.parse(crudo) as Record<string, unknown>;
        const limpio = { ...VACIO_FISCAL };
        for (const k of Object.keys(VACIO_FISCAL) as (keyof BorradorFiscal)[]) if (k in g) (limpio[k] as unknown) = g[k];
        setB(limpio);
      } else setB(VACIO_FISCAL);
    } catch { /* sin almacenamiento la pantalla funciona igual */ }
  }, [llave]);
  useEffect(() => {
    if (!llave) return;
    try {
      const hayAlgo = Object.entries(b).some(([k, v]) => v !== VACIO_FISCAL[k as keyof BorradorFiscal] && v !== "");
      /* Una corrección no se guarda como borrador: si se recarga, volvería como renglón nuevo y quedaría repetido. */
      if (corrigiendo) return;
      if (hayAlgo) localStorage.setItem(llave, JSON.stringify(b)); else localStorage.removeItem(llave);
    } catch { /* ver arriba */ }
  }, [b, llave, corrigiendo]);

  /* ---------- LAS LISTAS (igual que en el conteo diario) ---------- */
  const calles = useMemo(
    () => [...new Set([...ubicaciones.filter((u) => u.activa).map((u) => u.calle), ...Object.keys(MODULOS_DE_LA_HOJA)])].sort(ordenCalle),
    [ubicaciones]);
  const modulos = useMemo(() => {
    const m = new Map<string, { base: string; calle: string; modulo: string }>();
    for (const u of ubicaciones) {
      if (!u.activa) continue;
      if (b.calle !== "" && u.calle !== b.calle) continue;
      const k = claveBase(u);
      if (!m.has(k)) m.set(k, { base: k, calle: u.calle, modulo: u.modulo });
    }
    for (const f of modulosQueFaltan(ubicaciones.filter((u) => u.activa), b.calle)) {
      const k = claveBase(f);
      if (!m.has(k)) m.set(k, { base: k, calle: f.calle, modulo: f.modulo });
    }
    /* CADA UNO DE LA PAREJA EMPIEZA POR UN EXTREMO DE LA CALLE: el operador logístico ve los módulos del 01
       hacia arriba y Bavaria del último hacia abajo. Así los dos cuentan la misma calle sin ir uno detrás del
       otro ni copiarse, y se encuentran a mitad de camino; el cruce de los conteos se hace después. Los
       sitios que no son una posición numerada (PASILLO, TANDEM, DEPA…) quedan al final para los dos. */
    const alReves = hoja?.equipo === "Bavaria";
    const esNum = (v: string) => /^\d+$/.test(v);
    return [...m.values()].sort((x, y) => {
      const c = ordenCalle(x.calle, y.calle);
      if (c) return c;
      if (alReves && esNum(x.modulo) && esNum(y.modulo)) return Number(y.modulo) - Number(x.modulo);
      return x.modulo.localeCompare(y.modulo, "es", { numeric: true });
    });
  }, [ubicaciones, b.calle, hoja?.equipo]);
  /** «01 → 36» u «36 → 01»: por dónde empieza esta persona en la calle escogida (solo con una calle puesta). */
  const miOrden = useMemo(() => {
    if (b.calle === "") return null;
    const num = modulos.filter((m) => /^\d+$/.test(m.modulo));
    if (num.length < 2) return null;
    return `${num[0].modulo} → ${num[num.length - 1].modulo}`;
  }, [modulos, b.calle]);
  const lados = useMemo(() => {
    const delModulo = ubicaciones.filter((u) => u.activa && claveBase(u) === b.base);
    if (delModulo.length > 0 && delModulo.every((u) => (u.lado ?? "") === "")) return [""];
    if (delModulo.length === 0 && b.base && !moduloConLados(b.base.split("|")[1] ?? "")) return [""];
    return ["IZQ", "DER"];
  }, [ubicaciones, b.base]);
  const ubicacion = useMemo(() => {
    if (!b.base) return null;
    const delModulo = ubicaciones.filter((u) => u.activa && claveBase(u) === b.base);
    if (delModulo.length === 1 && (delModulo[0].lado ?? "") === "") return delModulo[0];
    return delModulo.find((u) => (u.lado ?? "") === b.lado) ?? null;
  }, [ubicaciones, b.base, b.lado]);
  const claveEscogida = useMemo(() => {
    if (!b.base) return null;
    const [calle, modulo] = b.base.split("|");
    if (lados.length === 1 && lados[0] === "") return `${calle}${modulo}`;
    if (!b.lado) return null;
    return `${calle}${modulo}_${b.lado}`;
  }, [b.base, b.lado, lados]);

  const material = useMemo(() => materiales.find((m) => m.activo && m.sku === b.codigo.trim()) ?? null, [materiales, b.codigo]);
  const esEnvase = pideEstadoFiscal(material);
  const esCilindro = esCilindroFiscal(material);
  /* Si cambia el material y el estado ya no aplica (o no está en su lista), se limpia. */
  useEffect(() => {
    if (b.estado && (!esEnvase || !opcionesEstadoFiscal(material).includes(b.estado))) setB((x) => ({ ...x, estado: "" }));
  }, [b.estado, esEnvase, material]);
  const cuenta = useMemo(() => totalCajas(b, material), [b, material]);

  /* ---------- LAS FOTOS Y EL ESTADO DEL MÓDULO (igual que en el conteo normal) ----------
     · Una foto por renglón (opcional; obligatoria si es avería). Sube al anotar.
     · «Mezclado» y «sin acceso» son del MÓDULO y piden foto de evidencia.
     Cada persona ve solo lo suyo: todo entra y sale por funciones de la base. */
  const { ubi: ubiFoto, direccion: dirFoto, pedir: pedirUbi } = usePosicion();
  const [fotoNueva, setFotoNueva] = useState<Foto | null>(null);
  const [sellando, setSellando] = useState(false);
  const [fotosDe, setFotosDe] = useState<Record<string, string>>({});
  const camaraNueva = useRef<HTMLInputElement>(null);
  const camaraFila = useRef<HTMLInputElement>(null);
  const filaDeFoto = useRef<string | null>(null);
  type MarcaModulo = { mezclado: boolean; sin_acceso: boolean; ruta: string | null };
  const [marcasMod, setMarcasMod] = useState<Record<string, MarcaModulo>>({});
  const [mod, setMod] = useState({ mezclado: false, sinAcceso: false });
  const [fotoMod, setFotoMod] = useState<Foto | null>(null);
  const camaraMod = useRef<HTMLInputElement>(null);

  const leerExtras = useCallback(async (id: string) => {
    const f = await supabase.rpc("inv_fiscal_mis_fotos", { p_hoja: id });
    if (!f.error) setFotosDe(Object.fromEntries(((f.data ?? []) as { conteo_id: string; ruta: string }[]).map((x) => [x.conteo_id, x.ruta])));
    const m = await supabase.rpc("inv_fiscal_mis_modulos", { p_hoja: id });
    if (!m.error) setMarcasMod(Object.fromEntries(((m.data ?? []) as { ubicacion_id: string; mezclado: boolean; sin_acceso: boolean; ruta: string | null }[])
      .map((x) => [x.ubicacion_id, { mezclado: x.mezclado, sin_acceso: x.sin_acceso, ruta: x.ruta }])));
  }, [supabase]);
  useEffect(() => { if (hoja?.hojaId) void leerExtras(hoja.hojaId) }, [hoja?.hojaId, leerExtras]);

  const marcaGuardada = ubicacion ? marcasMod[ubicacion.id] ?? null : null;
  /* Al cambiar de módulo, las dos preguntas arrancan con lo que ya se dijo de ESE módulo. */
  useEffect(() => {
    setMod({ mezclado: marcaGuardada?.mezclado ?? false, sinAcceso: marcaGuardada?.sin_acceso ?? false });
    setFotoMod((x) => { if (x) URL.revokeObjectURL(x.url); return null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveEscogida, ubicacion?.id]);
  useEffect(() => () => { if (fotoMod) URL.revokeObjectURL(fotoMod.url) }, [fotoMod]);
  useEffect(() => () => { if (fotoNueva) URL.revokeObjectURL(fotoNueva.url) }, [fotoNueva]);

  /** Sella la foto en el teléfono, al tomarla: la hora que queda es la de tomarla, no la de subirla. */
  async function sellarFoto(archivo: File, titulo: string): Promise<Foto | null> {
    setSellando(true);
    try {
      return await sellar(archivo, { titulo: titulo.toUpperCase(), ubi: ubiFoto, direccion: dirFoto, etiqueta: "CONTEO FISCAL" });
    } catch (e) {
      avisar.mal(e instanceof Error ? e.message : "No se pudo procesar esa foto. Vuelve a tomarla.");
      return null;
    } finally { setSellando(false) }
  }
  async function tomarNueva(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    const f = await sellarFoto(archivo, b.codigo ? `${b.codigo} · ${claveEscogida ?? ""}` : "CONTEO");
    if (f) { setFotoNueva((x) => { if (x) URL.revokeObjectURL(x.url); return f }); setMas(true) }
  }
  async function tomarMod(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    const f = await sellarFoto(archivo, `${mod.sinAcceso ? "SIN ACCESO" : "MEZCLADO"} · ${claveEscogida ?? ""}`);
    if (f) setFotoMod((x) => { if (x) URL.revokeObjectURL(x.url); return f });
  }
  /** Sube la foto de un renglón que YA está en la base. Devuelve el problema, o null si quedó. */
  async function subirFotoRenglon(conteoId: string, f: Foto): Promise<string | null> {
    if (!hoja) return "No hay hoja abierta.";
    const ruta = `fiscal/${hoja.hojaId}/${conteoId}.jpg`;
    const { error: eS } = await supabase.storage.from("inventario").upload(ruta, f.blob, { contentType: "image/jpeg", upsert: true });
    if (eS) return "La foto no subió: " + eS.message;
    const { error } = await supabase.rpc("inv_fiscal_foto_guardar", {
      p_conteo: conteoId, p_ruta: ruta, p_bytes: f.blob.size, p_ancho: f.ancho, p_alto: f.alto, p_tomada: f.tomada,
      p_lat: ubiFoto?.lat ?? null, p_lng: ubiFoto?.lng ?? null, p_precision: ubiFoto ? Math.round(ubiFoto.precision) : null,
    });
    if (error) return /does not exist|schema cache|inv_fiscal_foto_guardar/i.test(error.message)
      ? "Falta correr 2026-10-fiscal-estado.sql en Supabase." : "La foto subió pero no quedó registrada: " + error.message;
    setFotosDe((x) => ({ ...x, [conteoId]: ruta }));
    return null;
  }
  async function tomarFila(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    const id = filaDeFoto.current;
    if (!archivo || !id) return;
    const r = (mios ?? []).find((x) => x.id === id);
    const f = await sellarFoto(archivo, r ? `${r.sku} · ${r.ubicacion}` : "CONTEO");
    if (!f) return;
    setGuardando(true);
    const mal = await subirFotoRenglon(id, f);
    setGuardando(false);
    URL.revokeObjectURL(f.url);
    if (mal) avisar.mal(mal); else avisar.bien("Foto guardada.");
  }
  /** Guarda «mezclado / sin acceso» del módulo (y su foto, si hay una nueva). Devuelve el problema, o null si quedó. */
  async function guardarModulo(idU: string, flags: { mezclado: boolean; sinAcceso: boolean }, foto: Foto | null): Promise<string | null> {
    if (!hoja) return "No hay hoja abierta.";
    if (!navigator.onLine) return "Sin señal: marcar un módulo mezclado o sin acceso necesita conexión para subir la foto.";
    let ruta = marcasMod[idU]?.ruta ?? null;
    let extra = { p_bytes: null as number | null, p_ancho: null as number | null, p_alto: null as number | null, p_tomada: null as string | null,
      p_lat: null as number | null, p_lng: null as number | null, p_precision: null as number | null };
    if (foto) {
      ruta = `fiscal/${hoja.hojaId}/modulo-${idU}.jpg`;
      const { error: eS } = await supabase.storage.from("inventario").upload(ruta, foto.blob, { contentType: "image/jpeg", upsert: true });
      if (eS) return "La foto no subió: " + eS.message;
      extra = { p_bytes: foto.blob.size, p_ancho: foto.ancho, p_alto: foto.alto, p_tomada: foto.tomada,
        p_lat: ubiFoto?.lat ?? null, p_lng: ubiFoto?.lng ?? null, p_precision: ubiFoto ? Math.round(ubiFoto.precision) : null };
    }
    const { error } = await supabase.rpc("inv_fiscal_modulo_marcar", {
      p_hoja: hoja.hojaId, p_ubicacion: idU, p_mezclado: flags.mezclado, p_sin_acceso: flags.sinAcceso, p_ruta: foto ? ruta : null, ...extra,
    });
    if (error) return /does not exist|schema cache|inv_fiscal_modulo_marcar/i.test(error.message)
      ? "Falta correr 2026-10-fiscal-estado.sql en Supabase." : error.message;
    setMarcasMod((m) => {
      const n = { ...m };
      if (flags.mezclado || flags.sinAcceso) n[idU] = { mezclado: flags.mezclado, sin_acceso: flags.sinAcceso, ruta };
      else delete n[idU];
      return n;
    });
    return null;
  }
  async function idDeLaPosicion(): Promise<string | null> {
    if (ubicacion) return ubicacion.id;
    const [calle, modulo] = b.base.split("|");
    const r = await supabase.rpc("conteo_ubicacion_asegurar", { p_bodega: bodegaId, p_calle: calle, p_modulo: modulo, p_lado: b.lado || null });
    if (r.error) { avisar.mal(r.error.message); return null }
    return r.data as string;
  }

  /** Resuelve la cuenta de una casilla: «3×40+5» queda en «125». Lo que no es una cuenta válida se deja como está. */
  function resolverCuenta(k: "estibas" | "saldo" | "cajas") {
    setB((x) => {
      const t = x[k];
      if (!esCuenta(t)) return x;
      const r = cantidad(t);
      return r == null ? x : { ...x, [k]: String(r) };
    });
  }
  /** Un signo de la calculadora, donde está el cursor de la casilla activa. */
  function signo(op: string) {
    const k = campoActivo.current;
    const el = k === "saldo" ? campoSaldo.current : campoCantidad.current;
    if (op === "=") { resolverCuenta(k); el?.focus(); return }
    const ini = el?.selectionStart ?? b[k].length, fin = el?.selectionEnd ?? ini;
    pon(k, b[k].slice(0, ini) + op + b[k].slice(fin));
    setTimeout(() => { el?.focus(); el?.setSelectionRange(ini + op.length, ini + op.length) }, 0);
  }
  function borrarUno() {
    const k = campoActivo.current;
    const el = k === "saldo" ? campoSaldo.current : campoCantidad.current;
    const ini = el?.selectionStart ?? b[k].length, fin = el?.selectionEnd ?? ini;
    const desde = fin > ini ? ini : Math.max(0, ini - 1);
    pon(k, b[k].slice(0, desde) + b[k].slice(fin));
    setTimeout(() => { el?.focus(); el?.setSelectionRange(desde, desde) }, 0);
  }
  function abrirCalc(k: "estibas" | "saldo" | "cajas", el: HTMLInputElement) {
    campoActivo.current = k;
    setCalcActiva(k);
    setCalcAbierta(true);
    setTimeout(() => el.scrollIntoView({ block: "center" }), 60);
  }
  /** Al salir de una cantidad: se resuelve la cuenta y, si el cursor no pasó a otra cantidad, la calculadora baja. */
  function soltarCalc(k: "estibas" | "saldo" | "cajas") {
    resolverCuenta(k);
    setTimeout(() => {
      if (!(document.activeElement as HTMLElement | null)?.closest?.(".fe-cuanto-campo")) setCalcAbierta(false);
    }, 0);
  }
  function listoCalc() {
    resolverCuenta(campoActivo.current);
    setCalcAbierta(false);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  /* ---------- EL SALTO ENTRE CASILLAS ---------- */
  function tecleaFecha(k: "dia" | "mes" | "anio", v: string, siguiente?: RefObject<HTMLInputElement | null>) {
    const limpio = dosDigitos(v);
    pon(k, limpio);
    if (limpio.length !== 2) return;
    if (siguiente?.current) { siguiente.current.focus(); siguiente.current.select(); return }
    document.activeElement instanceof HTMLElement && document.activeElement.blur();
  }
  function saltaCon(e: KeyboardEvent<HTMLInputElement>, destino?: RefObject<HTMLInputElement | null>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (destino?.current) { destino.current.focus(); destino.current.select(); return }
    e.currentTarget.blur();
  }
  function atrasFecha(e: KeyboardEvent<HTMLInputElement>, valor: string, anterior?: RefObject<HTMLInputElement | null>) {
    if (e.key !== "Backspace" || valor !== "" || !anterior?.current) return;
    e.preventDefault(); anterior.current.focus(); anterior.current.select();
  }
  function saltarSiCompleto(v: string) {
    const c = v.trim();
    if (!c) return;
    const activos = materiales.filter((m) => m.activo);
    if (!activos.find((m) => m.sku === c) || activos.some((m) => m.sku !== c && m.sku.startsWith(c))) return;
    setTimeout(() => campoDia.current?.focus(), 0);
  }

  /* ---------- ANOTAR ---------- */
  async function anotar() {
    if (!hoja || guardando) return;
    const mal = revisarFiscal(b, material, claveEscogida);
    if (mal || !material) { avisar.mal(mal ?? "Falta el código del material."); return }
    if (b.averia && !fotoNueva && !(corrigiendo && fotosDe[corrigiendo])) { avisar.mal("Avería: falta la foto de la estiba. Sin ella no se anota."); return }
    if ((mod.mezclado || mod.sinAcceso) && !fotoMod && !marcaGuardada?.ruta) {
      avisar.mal(mod.sinAcceso ? "Módulo sin acceso: falta la foto de evidencia." : "Módulo mezclado: falta la foto de evidencia."); return;
    }
    setGuardando(true);
    const idU = await idDeLaPosicion();
    if (!idU) { setGuardando(false); return }
    /* La marca del módulo se guarda si cambió o si hay foto nueva. */
    const cambia = mod.mezclado !== (marcaGuardada?.mezclado ?? false) || mod.sinAcceso !== !!marcaGuardada?.sin_acceso;
    if (cambia || ((mod.mezclado || mod.sinAcceso) && fotoMod)) {
      const malM = await guardarModulo(idU, mod, fotoMod);
      if (malM) { setGuardando(false); avisar.mal(malM); return }
      setFotoMod((x) => { if (x) URL.revokeObjectURL(x.url); return null });
    }
    let nuevoId: string | null = null;
    if (corrigiendo) {
      /* Corregir: el renglón cambia en su sitio y conserva su foto. */
      const { p_hoja: _h, ...resto } = argumentosFiscal(hoja.hojaId, idU, material, b);
      void _h;
      const { error } = await supabase.rpc("inv_fiscal_contar_corregir", { p_id: corrigiendo, ...resto });
      if (error) {
        setGuardando(false);
        avisar.mal(/inv_fiscal_contar_corregir|schema cache|does not exist/i.test(error.message) ? "Falta correr 2026-10-fiscal-TODO.sql en Supabase." : error.message);
        return;
      }
      nuevoId = corrigiendo;
    } else {
      const { data, error } = await supabase.rpc("inv_fiscal_contar_agregar", argumentosFiscal(hoja.hojaId, idU, material, b));
      if (error) { setGuardando(false); avisar.mal(error.message); return }
      nuevoId = (data as string) ?? null;
    }
    let malFoto: string | null = null;
    if (fotoNueva && nuevoId) malFoto = await subirFotoRenglon(nuevoId, fotoNueva);
    setGuardando(false);
    avisar.bien(`${material.sku} ${corrigiendo ? "corregido" : "anotado"} en ${claveEscogida}${cuenta?.total != null ? ` · ${nf.format(cuenta.total)} cajas` : ""}.`);
    if (corrigiendo) {
      /* Al terminar de corregir, el formulario vuelve a vacío y se regresa a la lista. */
      setCorrigiendo(null);
      setFotoNueva((x) => { if (x) URL.revokeObjectURL(x.url); return null });
      setB(VACIO_FISCAL);
      await leer(hoja.hojaId);
      setPestania("borrador");
      return;
    }
    if (malFoto) avisar.mal(`${malFoto} El renglón quedó anotado: ponle la foto desde «Lo que llevas anotado».`);
    /* Igual que el conteo normal: el renglón se vacía pero el sitio (calle, módulo y lado) se queda para el siguiente. */
    setFotoNueva((x) => { if (x) URL.revokeObjectURL(x.url); return null });
    setB((x) => ({ ...VACIO_FISCAL, calle: x.calle, base: x.base, lado: x.lado }));
    await leer(hoja.hojaId);
    setTimeout(() => campoCodigo.current?.focus(), 0);
  }

  /** «Sin acceso»: el módulo se anota SIN renglones, con su foto. */
  async function anotarSinAcceso() {
    if (!hoja || guardando) return;
    if (!b.base) { avisar.mal("Escoge el módulo."); return }
    if (!claveEscogida) { avisar.mal("Falta decir de qué lado del módulo."); return }
    if (!fotoMod && !marcaGuardada?.ruta) { avisar.mal("Sin acceso: falta la foto de evidencia."); return }
    setGuardando(true);
    const idU = await idDeLaPosicion();
    if (!idU) { setGuardando(false); return }
    const malM = await guardarModulo(idU, { mezclado: mod.mezclado, sinAcceso: true }, fotoMod);
    setGuardando(false);
    if (malM) { avisar.mal(malM); return }
    setFotoMod((x) => { if (x) URL.revokeObjectURL(x.url); return null });
    avisar.bien(`${claveEscogida} anotado SIN ACCESO.`);
  }

  /** Trae un renglón al formulario para corregirlo (sitio, material, fecha, cantidad, estado…). */
  function corregir(r: RenglonFiscal) {
    const u = ubicaciones.find((x) => x.id === r.ubicacion_id);
    if (!u) { avisar.mal("No encontré el sitio de ese renglón."); return }
    const t = (n: number | null | undefined) => (n == null ? "" : String(n));
    setFotoNueva((x) => { if (x) URL.revokeObjectURL(x.url); return null });
    setB({
      calle: u.calle, base: claveBase(u), lado: u.lado ?? "", codigo: r.sku,
      dia: r.venc_dia == null ? "" : dd(r.venc_dia), mes: r.venc_mes == null ? "" : dd(r.venc_mes), anio: r.venc_anio == null ? "" : dd(r.venc_anio),
      modo: r.cajas != null ? "cajas" : "estibas", estibas: t(r.estibas), saldo: t(r.saldo), cajas: t(r.cajas),
      nota: r.nota ?? "", estado: r.estado_envase ?? "",
      averia: !!r.averia, pnc: !!r.pnc, pncRotulo: r.pnc ? r.pnc_rotulo ?? null : null, pncBloqueo: r.pnc ? r.pnc_bloqueo_mecanico ?? null : null,
    });
    setCorrigiendo(r.id);
    setPestania("anotar");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelarCorreccion() {
    setCorrigiendo(null);
    setFotoNueva((x) => { if (x) URL.revokeObjectURL(x.url); return null });
    setB(VACIO_FISCAL);
  }

  /** Abre la foto de un renglón ya guardado. */
  async function verFotoRenglon(ruta: string) {
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("inventario").createSignedUrl(ruta, 600);
    if (error || !data?.signedUrl) { w?.close(); avisar.mal("No pude abrir la foto: " + (error?.message ?? "sin enlace")); return }
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  }

  async function quitar(r: RenglonFiscal) {
    const ok = await pedir({
      titulo: "¿Quitar este renglón?",
      dice: <>{r.sku} · {r.material} en {r.ubicacion} — {textoCantidad(r)}.</>,
      confirmar: "Quitarlo", peligro: true,
    });
    if (!ok || !hoja) return;
    setGuardando(true);
    const { error } = await supabase.rpc("inv_fiscal_contar_quitar", { p_id: r.id });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    if (corrigiendo === r.id) cancelarCorreccion();
    avisar.bien("Renglón quitado.");
    await leer(hoja.hojaId);
  }

  /* ---------- REABRIR: SOLO CON EL OK DEL FISCAL ---------- */
  const [reap, setReap] = useState<{ pedido: string | null; autorizado: string | null }>({ pedido: null, autorizado: null });
  const leerReap = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("inv_fiscal_mi_reapertura", { p_hoja: id });
    if (error) return;
    const f = ((data ?? []) as { pedido_en: string | null; autorizado_en: string | null }[])[0];
    setReap({ pedido: f?.pedido_en ?? null, autorizado: f?.autorizado_en ?? null });
  }, [supabase]);
  /* Se mira cada 10 s si el fiscal ya dio el OK (solo mientras la hoja está terminada). */
  const hojaIdReap = hoja?.hojaId;
  const terminadaReap = hoja ? (terminos[hoja.hojaId] ?? { termine: hoja.termine }).termine : false;
  useEffect(() => {
    if (!hojaIdReap || !terminadaReap) return;
    void leerReap(hojaIdReap);
    const t = setInterval(() => { if (!document.hidden) void leerReap(hojaIdReap) }, 10_000);
    return () => clearInterval(t);
  }, [hojaIdReap, terminadaReap, leerReap]);
  async function pedirReabrir() {
    if (!hoja) return;
    setGuardando(true);
    const { error } = await supabase.rpc("inv_fiscal_reabrir_pedir", { p_hoja: hoja.hojaId });
    setGuardando(false);
    if (error) { avisar.mal(/inv_fiscal_reabrir_pedir|schema cache|does not exist/i.test(error.message) ? "Falta correr 2026-10-fiscal-TODO.sql en Supabase." : error.message); return }
    avisar.bien("Le avisaste al fiscal. Cuando dé el OK, aquí aparece «Reabrir mi hoja».");
    await leerReap(hoja.hojaId);
  }

  /* ---------- TERMINÉ MI HOJA / REABRIR ---------- */
  async function terminar(activo: boolean) {
    if (!hoja) return;
    if (activo) {
      if (!mios || mios.length === 0) { avisar.mal("Anota al menos un renglón antes de terminar tu hoja."); return }
      const ok = await pedir({
        titulo: "¿Terminaste tu hoja?",
        dice: <>Llevas {mios.length} {mios.length === 1 ? "renglón" : "renglones"}. Al terminar ya no podrás anotar ni quitar nada;
          si te equivocas, pídele al fiscal que te la reabra: él da el OK.</>,
        confirmar: "Sí, terminé mi hoja",
      });
      if (!ok) return;
    }
    setGuardando(true);
    const { error } = await supabase.rpc("inv_fiscal_terminar", { p_hoja: hoja.hojaId, p_terminado: activo });
    setGuardando(false);
    if (error) { avisar.mal(error.message); return }
    setTerminos((t) => ({ ...t, [hoja.hojaId]: { termine: activo, parejaTermino: (t[hoja.hojaId] ?? hoja).parejaTermino } }));
    avisar.bien(activo ? "Hoja terminada." : "Hoja reabierta: ya puedes anotar y quitar renglones.");
    setReap({ pedido: null, autorizado: null });
    router.refresh();
  }

  if (!hoja) return null;
  const estadoT = terminos[hoja.hojaId] ?? { termine: hoja.termine, parejaTermino: hoja.parejaTermino };
  /* Terminada: solo si la base ya sabe terminar hojas y la persona la terminó. */
  const cerrada = hoja.puedeContar && hoja.puedeTerminar && estadoT.termine;
  const totalMio = (mios ?? []).reduce((s, r) => s + Number(r.total_cajas || 0), 0);

  const reabrirUI = (clase: string) => reap.autorizado ? (
    <button type="button" className={clase} disabled={guardando} onClick={() => terminar(false)}>Reabrir mi hoja (el fiscal ya dio el OK)</button>
  ) : reap.pedido ? (
    <span className="fc-pidio">Ya pediste que te reabran la hoja: falta el OK del fiscal.{" "}
      <button type="button" className="fe-mini" disabled={guardando} onClick={() => hoja && leerReap(hoja.hojaId)}>Ver si ya lo dio</button></span>
  ) : (
    <button type="button" className={clase} disabled={guardando} onClick={pedirReabrir}>Pedir que me reabran la hoja</button>
  );

  return (
    <>
      {dialogo}
      {avisos}

      {hojas.length > 1 && (
        <label className="fc-hoja-sel"><span>Hoja que cuentas</span>
          <select value={hoja.hojaId} onChange={(e) => setHojaId(e.target.value)}>
            {hojas.map((h) => (
              <option key={h.hojaId} value={h.hojaId} disabled={!h.puedeContar}>
                {h.nombre} · Hoja {h.numero}{h.puedeContar ? "" : ` (se cuenta el ${fechaConDia(h.fecha)})`}
              </option>
            ))}
          </select></label>
      )}

      {hoja.puedeContar && (
        <RevisionesFiscal hojaId={hoja.hojaId} mios={mios} materiales={materiales} avisar={avisar} alCambiar={() => leer(hoja.hojaId)} />
      )}

      {hoja.puedeContar && (
        <div className="fe-pes fe-pes-conteo fc-pes" role="tablist">
          <button type="button" role="tab" aria-selected={pestania === "anotar"}
                  className={pestania === "anotar" ? "on" : ""} onClick={() => setPestania("anotar")}>
            Anotar
          </button>
          <button type="button" role="tab" aria-selected={pestania === "borrador"}
                  className={pestania === "borrador" ? "on" : ""} onClick={() => setPestania("borrador")}>
            El borrador<em>{mios?.length ?? 0}</em>
          </button>
        </div>
      )}

      {!hoja.puedeContar ? (
        <section className="fe-faltan" role="status">
          <p><b>Todavía no es el día.</b> La hoja {hoja.numero} de «{hoja.nombre}» se cuenta el{" "}
          <b>{fechaConDia(hoja.fecha)}</b>. Ese día aquí aparece el formulario para anotar.</p>
        </section>
      ) : (
        <section className="fe-anotar fc-anotar" hidden={pestania !== "anotar" || cerrada}>
          <div className="fe-anotar-cab">
            <p className="fe-paso">Hoja {hoja.numero} · anotar lo que hay</p>
          </div>
          <p className="fc-ciego">Cuentas a ciegas: solo ves lo que anotas tú. El cruce con tu pareja se hace después.</p>
          {corrigiendo && (
            <p className="fc-corrigiendo" role="status" style={{ border: "1px solid currentColor", padding: "8px 10px", margin: "8px 0" }}>
              <b>Estás corrigiendo un renglón.</b> Cambia lo que haga falta y toca «Guardar corrección»; la foto se conserva.{" "}
              <button type="button" className="fe-mini" disabled={guardando} onClick={cancelarCorreccion}>Cancelar</button>
            </p>
          )}

          {/* ===== DÓNDE ===== */}
          <div className="fe-bloque">
            <p className="fe-bloque-cab">Dónde</p>
            <div className="fe-tres dos fe-donde3">
              <label><span>Calle</span>
                <Buscador campo={campoCalle} valor={b.calle} marcador="Todas" teclado="ninguno" desdeElSiguiente
                  opciones={[{ valor: "", texto: "Todas" }, ...calles.map((c) => ({ valor: c, texto: c }))]}
                  onEscoge={(nueva) => {
                    const sigue = b.base.startsWith(nueva + "|");
                    setB((x) => ({ ...x, calle: nueva, base: nueva === "" || sigue ? x.base : "", lado: nueva === "" || sigue ? x.lado : "" }));
                  }} /></label>
              <label><span>Módulo{miOrden && <small className="fc-orden" title="Por dónde empiezas tú en esta calle; tu pareja empieza por el otro extremo"> · tu orden {miOrden}</small>}</span>
                <Buscador valor={b.base} marcador="Escribe o escoge…" sinOpciones="Esa calle no tiene módulos activos."
                  teclado="numerico" desdeElSiguiente
                  opciones={modulos.map((m) => ({ valor: m.base, texto: m.modulo, pista: b.calle === "" ? `Calle ${m.calle}` : null }))}
                  onEscoge={(base) => {
                    const posibles = ubicaciones.filter((x) => x.activa && claveBase(x) === base);
                    setB((x) => ({ ...x, base, calle: posibles[0]?.calle ?? base.split("|")[0] ?? x.calle,
                                   lado: posibles.length === 1 ? (posibles[0].lado ?? "") : "" }));
                  }} /></label>
              <div className="fe-lado-campo">
                <span className="fe-lado-rot" id="fc-rot-lado">Lado</span>
                {!b.base ? (
                  <output className="fe-lado">Escoge primero el módulo</output>
                ) : lados.length === 1 ? (
                  <output className="fe-lado">{nombreLado(lados[0])}</output>
                ) : (
                  <div className="fe-segmento" role="group" aria-labelledby="fc-rot-lado">
                    {lados.map((l) => (
                      <button key={l} type="button" className={b.lado === l ? "on" : ""} aria-pressed={b.lado === l}
                        onClick={() => { pon("lado", l); setTimeout(() => campoCodigo.current?.focus(), 0) }}>{nombreLado(l)}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== ESTADO DEL MÓDULO · MEZCLADO · ACCESO (igual que en el conteo normal) ===== */}
          {claveEscogida && (
            <div className="fe-bloque fe-estmod">
              <p className="fe-bloque-cab">Estado del módulo</p>
              <div className="fe-estmod-fila">
                <div className="fe-acceso">
                  <span id="fc-rot-acceso">¿Tienes acceso al módulo?</span>
                  <div className="fe-si-no" role="group" aria-labelledby="fc-rot-acceso">
                    <button type="button" className={!mod.sinAcceso ? "on" : ""} aria-pressed={!mod.sinAcceso}
                            onClick={() => setMod((x) => ({ ...x, sinAcceso: false }))}>Sí</button>
                    <button type="button" className={mod.sinAcceso ? "on" : ""} aria-pressed={mod.sinAcceso}
                            onClick={() => setMod((x) => ({ ...x, sinAcceso: true }))}>No</button>
                  </div>
                </div>
                <label className={"fe-mezclado" + (mod.mezclado ? " on" : "")}>
                  <input type="checkbox" checked={mod.mezclado} onChange={(e) => setMod((x) => ({ ...x, mezclado: e.target.checked }))} />
                  <span><b>Módulo mezclado</b></span>
                </label>
              </div>
              {(mod.mezclado || mod.sinAcceso) && (
                <div className="fe-foto fe-foto-mod">
                  <span id="fc-rot-fotomod">Foto de evidencia · obligatoria</span>
                  <input ref={camaraMod} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" hidden onChange={tomarMod} />
                  <div className="fe-foto-fila" role="group" aria-labelledby="fc-rot-fotomod">
                    <button type="button" className={"fe-foto-btn" + (fotoMod ? " con" : "")} disabled={sellando}
                            onClick={() => { pedirUbi(); camaraMod.current?.click() }}>
                      {fotoMod
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={fotoMod.url} alt="La foto del módulo" />
                        : <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>}
                      <b>{sellando ? "Procesando…" : fotoMod ? "Tomar otra" : "Tomar foto"}</b>
                    </button>
                    <p>{fotoMod ? "La foto sube al anotar."
                      : marcaGuardada?.ruta ? "Este módulo ya tiene foto. Tomar otra la reemplaza."
                      : mod.sinAcceso ? "Sin acceso: foto de por qué no se pudo contar." : "Mezclado: foto de cómo está el módulo."}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== QUÉ ===== */}
          <div className="fe-bloque">
            <p className="fe-bloque-cab">Qué</p>
            <div className="fe-cod-dos fe-que3">
              <label><span>Código</span>
                <input ref={campoCodigo} inputMode="numeric" value={b.codigo} placeholder="Teclea el código"
                  onChange={(e) => { pon("codigo", e.target.value); saltarSiCompleto(e.target.value) }}
                  onKeyDown={(e) => saltaCon(e, campoDia)} /></label>
              <label className="fe-que-desc"><span>Descripción</span>
                <output className={"fe-desc-campo" + (b.codigo && !material ? " mal" : material ? " leido" : "")}>
                  {!b.codigo ? <i>Teclea el código y te digo qué es.</i>
                    : material ? <span className="fe-desc-tx"><span className="fe-tic" aria-hidden>✓</span>{material.nombre}
                        {material.cajas_por_estiba != null && <em> · {material.cajas_por_estiba} cajas/estiba</em>}</span>
                    : <i>Ese código no está en el maestro.</i>}
                </output></label>
              <div className={"fe-fecha fe-que-vence" + (esEnvase ? " opcional" : "")}>
                <div className="fe-que-fecha">
                  <span className="fe-etiq-fecha">Vence</span>
                  {esEnvase && <em className="fe-opcional">sin fecha</em>}
                </div>
                <div className="fe-dma">
                  <input ref={campoDia} inputMode="numeric" maxLength={2} placeholder="DD" aria-label="Día del vencimiento" value={b.dia}
                    onChange={(e) => tecleaFecha("dia", e.target.value, campoMes)} />
                  <input ref={campoMes} inputMode="numeric" maxLength={2} placeholder="MM" aria-label="Mes del vencimiento" value={b.mes}
                    onChange={(e) => tecleaFecha("mes", e.target.value, campoAnio)} onKeyDown={(e) => atrasFecha(e, b.mes, campoDia)} />
                  <input ref={campoAnio} inputMode="numeric" maxLength={2} placeholder="AA" aria-label="Año del vencimiento" value={b.anio}
                    onChange={(e) => tecleaFecha("anio", e.target.value, campoCantidad)} onKeyDown={(e) => atrasFecha(e, b.anio, campoMes)} />
                </div>
              </div>
            </div>
            {material && material.cajas_por_estiba == null && (
              <p className="fe-eco"><b className="ojo">sin factor estibado</b> — las estibas darían cero: cuéntalo por cajas</p>
            )}
          </div>

          {/* ===== ESTADO DEL ENVASE (igual que en el conteo normal; solo si lo contado es envase) ===== */}
          {esEnvase && (
            <div className="fe-bloque fe-estenv">
              <p className="fe-bloque-cab">Estado del envase</p>
              <p className="fe-obliga">Obligatorio: {esCilindro ? "escoge lleno o vacío" : "escoge uno"}.</p>
              <div className="fe-estados" role="group" aria-label={esCilindro ? "Cilindro lleno o vacío" : "Estado del envase"}>
                {opcionesEstadoFiscal(material).map((e) => (
                  <button key={e} type="button" className={b.estado === e ? "on" : ""} aria-pressed={b.estado === e}
                          onClick={() => { pon("estado", b.estado === e ? "" : e); if (b.estado !== e) setTimeout(() => campoCantidad.current?.focus(), 60) }}>{e}</button>
                ))}
              </div>
            </div>
          )}

          {/* ===== CUÁNTO ===== */}
          <div className="fe-bloque">
            <p className="fe-bloque-cab">Cuánto</p>
            <div className={"fe-cuanto4" + (b.modo === "cajas" ? " cajas" : "")}>
              <div className="fe-cuanto-modo">
                <span className="fe-cuanto-rot" id="fc-rot-modo">Qué cuentas</span>
                <div className="fe-segmento" role="group" aria-labelledby="fc-rot-modo">
                  <button type="button" className={b.modo === "estibas" ? "on" : ""} aria-pressed={b.modo === "estibas"} onClick={() => pon("modo", "estibas")}>Estibas</button>
                  <button type="button" className={b.modo === "cajas" ? "on" : ""} aria-pressed={b.modo === "cajas"} onClick={() => pon("modo", "cajas")}>Cajas</button>
                </div>
              </div>
              {b.modo === "estibas" ? (
                <>
                  <label className="fe-cuanto-campo"><span>Estibas completas</span>
                    <input ref={campoCantidad} inputMode={escritorio ? "numeric" : "none"} value={b.estibas}
                      onFocus={(e) => abrirCalc("estibas", e.currentTarget)} onBlur={() => soltarCalc("estibas")}
                      onChange={(e) => pon("estibas", e.target.value)} onKeyDown={(e) => saltaCon(e, campoSaldo)} /></label>
                  <label className="fe-cuanto-campo"><span>Saldo · cajas</span>
                    <input ref={campoSaldo} inputMode={escritorio ? "numeric" : "none"} value={b.saldo}
                      onFocus={(e) => abrirCalc("saldo", e.currentTarget)} onBlur={() => soltarCalc("saldo")}
                      onChange={(e) => pon("saldo", e.target.value)} onKeyDown={(e) => saltaCon(e)} /></label>
                </>
              ) : (
                <label className="fe-cuanto-campo ancho"><span>Cajas</span>
                  <input ref={campoCantidad} inputMode={escritorio ? "numeric" : "none"} value={b.cajas}
                    onFocus={(e) => abrirCalc("cajas", e.currentTarget)} onBlur={() => soltarCalc("cajas")}
                    onChange={(e) => pon("cajas", e.target.value)} onKeyDown={(e) => saltaCon(e)} /></label>
              )}
              <div className="fe-cuanto-total">
                <span className="fe-cuanto-rot">Total</span>
                <output className={"fe-total-caja" + (cuenta?.total == null ? " esperando" : "")}>
                  <b>{cuenta?.total != null ? nf.format(cuenta.total) : "—"}</b><span>cajas</span>
                </output>
              </div>
            </div>
            {(calcAbierta || escritorio) && (
              <div className={"fe-calc fe-calc-fija" + (escritorio ? " en-linea" : "")} role="group" aria-label="Calculadora para las cantidades"
                   style={escritorio ? undefined : { bottom: calcBajo }}>
                <div className="fe-calc-cab">
                  <span>{calcActiva === "estibas" ? "Estibas completas" : calcActiva === "saldo" ? "Saldo · cajas" : "Cajas"}</span>
                  <p className="fe-calc-vista" aria-live="polite">
                    {b[calcActiva].trim() === "" ? <i>toca los números</i>
                      : esCuenta(b[calcActiva])
                        ? <>{b[calcActiva].trim()} = {cantidad(b[calcActiva]) != null ? <b>{nf.format(cantidad(b[calcActiva])!)}</b> : <b className="ojo">no entiendo la cuenta</b>}</>
                        : <b>{b[calcActiva].trim()}</b>}
                  </p>
                </div>
                <div className="fe-calc-teclas">
                  {["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", "+"].map((t) => (
                    <button key={t} type="button" className={/\d/.test(t) ? "num" : "op"}
                            aria-label={/\d/.test(t) ? `Número ${t}` : `Signo ${t}`}
                            onMouseDown={(e) => e.preventDefault()} onClick={() => signo(t)}>{t}</button>
                  ))}
                  <button type="button" aria-label="Borrar el último carácter" onMouseDown={(e) => e.preventDefault()} onClick={borrarUno}>⌫</button>
                  <button type="button" className="igual" aria-label="Resolver la cuenta" onMouseDown={(e) => e.preventDefault()} onClick={() => signo("=")}>=</button>
                  <button type="button" className="listo" aria-label="Cerrar la calculadora" onMouseDown={(e) => e.preventDefault()} onClick={listoCalc}>Listo</button>
                </div>
              </div>
            )}
            {cuenta && (
              <p className="fe-cuenta-linea">
                {cuenta.total == null
                  ? <><b className="ojo">Sin factor estibado</b> — cuéntalo por cajas o avísale a quien lleva el maestro.</>
                  : <>{cuenta.formula} = <b>{nf.format(cuenta.total)}</b> cajas</>}
              </p>
            )}
          </div>

          {/* ===== DATOS ADICIONALES · AVERÍA · PNC · OBSERVACIÓN (igual que en el conteo normal) ===== */}
          <details className="fe-mas" open={mas} onToggle={(e) => setMas((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>
              <span className="fe-mas-tx"><b>Datos adicionales</b><span>Avería · PNC · observación · foto</span></span>
              <span className="fe-mas-marcas">
                {([b.averia && "AVERÍA", b.pnc && "PNC", fotoNueva && "FOTO"].filter(Boolean) as string[]).map((m) => <em key={m}>{m}</em>)}
              </span>
              <span className="fe-mas-fl" aria-hidden>▾</span>
            </summary>
            <div className="fe-mas-dentro">
              <div className="fe-mas-dos">
                <div className="fe-rota">
                  <span id="fc-rot-averia">¿Está averiada?</span>
                  <div className="fe-si-no" role="group" aria-labelledby="fc-rot-averia">
                    <button type="button" className={!b.averia ? "on" : ""} aria-pressed={!b.averia}
                            onClick={() => setB((x) => ({ ...x, averia: false }))}>No</button>
                    <button type="button" className={b.averia ? "on" : ""} aria-pressed={b.averia}
                            onClick={() => setB((x) => ({ ...x, averia: true, pnc: false, pncRotulo: null, pncBloqueo: null }))}>Sí, avería</button>
                  </div>
                </div>
                <div className="fe-marca-campo">
                  <span id="fc-rot-marca">PNC <em>(opcional)</em></span>
                  <div className="fe-marcas uno" role="group" aria-labelledby="fc-rot-marca">
                    <button type="button" className={"fe-marca" + (b.pnc ? " on" : "")} aria-pressed={b.pnc}
                            onClick={() => setB((x) => ({ ...x, averia: false, pnc: !x.pnc, pncRotulo: null, pncBloqueo: null }))}>PNC</button>
                  </div>
                </div>
              </div>
              {b.pnc && (
                <div className="fe-pnc-pol" role="group" aria-label="Política de bloqueo del PNC">
                  <p className="fe-pnc-cab">Política de bloqueo <em className="fe-obliga">· obligatorio</em></p>
                  {([["rotulo", "¿Tiene rótulo?", b.pncRotulo], ["bloqueo", "¿Tiene bloqueo mecánico?", b.pncBloqueo]] as const).map(([k, txt, v]) => (
                    <div className="fe-rota" key={k}>
                      <span id={`fc-pnc-${k}`}>{txt}</span>
                      <div className="fe-si-no" role="group" aria-labelledby={`fc-pnc-${k}`}>
                        <button type="button" className={v === false ? "on" : ""} aria-pressed={v === false}
                                onClick={() => setB((x) => ({ ...x, [k === "rotulo" ? "pncRotulo" : "pncBloqueo"]: false }))}>No</button>
                        <button type="button" className={v === true ? "on" : ""} aria-pressed={v === true}
                                onClick={() => setB((x) => ({ ...x, [k === "rotulo" ? "pncRotulo" : "pncBloqueo"]: true }))}>Sí</button>
                      </div>
                    </div>
                  ))}
                  {b.pncRotulo != null && b.pncBloqueo != null && (
                    <p className={"fe-pnc-veredicto " + (b.pncRotulo && b.pncBloqueo ? "cumple" : "falta")}>
                      {b.pncRotulo && b.pncBloqueo
                        ? "Cumple la política de bloqueo."
                        : `No cumple la política de bloqueo: falta ${[!b.pncRotulo && "el rótulo", !b.pncBloqueo && "el bloqueo mecánico"].filter(Boolean).join(" y ")}.`}
                    </p>
                  )}
                </div>
              )}
              <label className="fe-nota"><span>Observación</span>
                <input value={b.nota} placeholder="Opcional — lo que haya que decir de esta estiba" onChange={(e) => pon("nota", e.target.value)} /></label>
              {/* LA CAMARITA: evidencia de un mixeo, de una avería, de lo que sea. Una por renglón; obligatoria si es avería. */}
              <div className="fe-foto">
                <span id="fc-rot-foto">Evidencia{b.averia && <em className="fe-obliga"> · obligatoria</em>}</span>
                <input ref={camaraNueva} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" hidden onChange={tomarNueva} />
                <div className="fe-foto-fila" role="group" aria-labelledby="fc-rot-foto">
                  <button type="button" className={"fe-foto-btn" + (fotoNueva ? " con" : "")} disabled={sellando}
                          aria-label={fotoNueva ? "Tomar otra foto" : "Tomar foto"}
                          onClick={() => { pedirUbi(); camaraNueva.current?.click() }}>
                    {fotoNueva
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={fotoNueva.url} alt="La foto de este renglón" />
                      : <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>}
                    <b>{sellando ? "Procesando…" : fotoNueva ? "Tomar otra" : "Tomar foto"}</b>
                  </button>
                  <p>
                    {fotoNueva
                      ? <>La foto va con este renglón. <button type="button" className="fe-foto-quitar"
                          onClick={() => setFotoNueva((x) => { if (x) URL.revokeObjectURL(x.url); return null })}>Quitarla</button></>
                      : b.averia ? "Avería: foto de la estiba rota. Sin ella no se anota."
                      : "Opcional: un mixeo, lo que haga falta para tener soporte."}
                  </p>
                </div>
              </div>
            </div>
          </details>

          <div className="fe-barra-fija">
            <p className="fe-fija-cuenta"><b>{mios?.length ?? 0}</b> anotados</p>
            {hoja.puedeTerminar && (
              <button type="button" className="btn plano fc-terminar-ir" disabled={guardando || (mios?.length ?? 0) === 0}
                      title={(mios?.length ?? 0) === 0 ? "Anota al menos un renglón" : undefined} onClick={() => terminar(true)}>
                Terminé mi hoja
              </button>
            )}
            {mod.sinAcceso && (
              <button type="button" className="btn" disabled={guardando} onClick={anotarSinAcceso}
                      title="Anota el módulo SIN ACCESO sin renglones (no se pudo contar nada)">
                Solo marcar sin acceso
              </button>
            )}
            <button type="button" className="btn grande" disabled={guardando} onClick={anotar}>
              {guardando ? "Guardando…" : corrigiendo ? "Guardar corrección" : "Anotar renglón"}
            </button>
          </div>
        </section>
      )}

      {/* ===== HOJA TERMINADA ===== */}
      {cerrada && (
        <section className="fe-anotar fc-terminada" hidden={pestania !== "anotar"} role="status" aria-label="Hoja terminada">
          <div className="fe-anotar-cab"><p className="fe-paso">Hoja {hoja.numero} · terminada</p></div>
          <p className="fc-term-dice"><b>Terminaste tu hoja.</b>{" "}
            {estadoT.parejaTermino
              ? "Tu pareja también terminó: quien arma el plan ya puede cruzar las dos hojas."
              : `Falta que ${hoja.pareja ?? "tu pareja"} termine la suya.`}</p>
          <p className="fc-term-cuenta">Llevas {mios?.length ?? 0} {(mios?.length ?? 0) === 1 ? "renglón" : "renglones"} · {nf.format(totalMio)} cajas.</p>
          <div className="cl-botones">
            {reabrirUI("btn plano fc-reabrir")}
          </div>
        </section>
      )}

      {/* ===== LO QUE LLEVO ===== */}
      <section className="fe-recorrido fc-mios" aria-label="Lo que llevas anotado" hidden={hoja.puedeContar && pestania !== "borrador"}>
        <div className="fe-rec-cab">
          <div>
            <h2>Lo que llevas anotado</h2>
            <p className="fe-rec-dice">Es solo lo tuyo. Si algo quedó mal, toca «Corregir» o quítalo.</p>
          </div>
          <span>
            {mios == null ? "Cargando…" : `${mios.length} ${mios.length === 1 ? "renglón" : "renglones"} · ${nf.format(totalMio)} cajas`}
          </span>
        </div>
        <input ref={camaraFila} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" hidden onChange={tomarFila} />
        {mios != null && mios.length === 0 && <p className="fc-vacio">Todavía no has anotado nada en esta hoja.</p>}
        {mios != null && mios.length > 0 && (
          <ul className="fc-lista">
            {mios.map((r) => (
              <li key={r.id}>
                <div className="fc-ren">
                  <b>{r.ubicacion}</b> · {r.sku} · {r.material}
                  <br />
                  <span>{[r.estado_envase, r.averia && "AVERÍA", r.pnc && "PNC"].filter(Boolean).join(" · ")}{r.estado_envase || r.averia || r.pnc ? " · " : ""}{textoCantidad(r)} = <b>{nf.format(Number(r.total_cajas))}</b> cajas
                    {r.venc_dia != null && <> · vence {dd(r.venc_dia)}/{dd(r.venc_mes)}/{dd(r.venc_anio)}</>}
                    {r.nota && <> · {r.nota}</>}</span>
                </div>
                <button type="button" className="fe-mini" disabled={guardando || sellando}
                        onClick={() => { filaDeFoto.current = r.id; pedirUbi(); camaraFila.current?.click() }}>
                  {fotosDe[r.id] ? "Cambiar foto" : r.averia ? "Poner foto (falta)" : "Foto"}
                </button>
                {fotosDe[r.id] && <button type="button" className="fe-mini" onClick={() => verFotoRenglon(fotosDe[r.id])}>Ver foto</button>}
                <button type="button" className="fe-mini" disabled={guardando || cerrada} onClick={() => corregir(r)}>{corrigiendo === r.id ? "Corrigiendo…" : "Corregir"}</button>
                <button type="button" className="fe-mini" disabled={guardando || cerrada} onClick={() => quitar(r)}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
        {cerrada && (
          <p className="fc-nota-term" role="status">Tu hoja está terminada: para cambiar algo, el fiscal tiene que darte el OK para reabrirla.{" "}
            {reabrirUI("fe-mini fc-reabrir")}</p>
        )}
        {!cerrada && hoja.puedeTerminar && hoja.puedeContar && (mios?.length ?? 0) > 0 && (
          <div className="fc-terminar">
            <p>¿Ya contaste toda tu hoja? Avísalo para que se pueda cruzar con tu pareja.</p>
            <button type="button" className="btn fc-terminar-fin" disabled={guardando} onClick={() => terminar(true)}>Terminé mi hoja</button>
          </div>
        )}
      </section>
    </>
  );
}
