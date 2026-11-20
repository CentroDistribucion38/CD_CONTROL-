import type { Material } from "./fefo";

/* ===================================================================
   CONTAR LA HOJA DEL INVENTARIO FISCAL — lo que se teclea y cómo se revisa

   Es el mismo renglón del conteo diario (dónde, qué, estado del envase, vence, cuánto):
   deben ser gemelos (menos el vencimiento, que aquí es opcional). Por ahora no pregunta rotación, avería ni PNC. Y UN CERO CUENTA: «0 cajas» es contar que ahí no hay nada, y en un
   inventario fiscal eso es un dato, no un renglón vacío (en el diario
   no se puede anotar cero porque no se cuenta lo que no está).
   =================================================================== */
export type ModoFiscal = "estibas" | "cajas" | "unidades" | "pallets";

/* PALLETS (CARNAVAL). «Cuando cuenten Carnaval debes dar la opción de pallet, y si es pallet debe calcular de acuerdo a ese
   factor.» Un pallet de Peldar no es una estiba: trae las unidades del maestro de Carnaval (Costeñita 5.616, 330 4.347…).
   Se anota como unidades = pallets × factor (cajas completas + sueltas, igual que contar en unidades) y la nota lo dice:
   «Pallet: 166 × 5.616 = 932.256 un.» — así el renglón sigue sumando bien en todo el recorrido sin otra columna. */
export const esCarnaval = (calle: string) => /carnaval/i.test(calle);
const NOTA_PALLET = /^\s*Pallet:\s*([\d.]+)\s*[×x]\s*([\d.]+)\s*=\s*[\d.]+\s*un\.?\s*(?:·\s*)?/i;
const miles = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
/** De la nota de un renglón en pallets: cuántos pallets fueron y el resto de la nota (lo que escribió la persona). */
export function leerNotaPallet(nota: string | null | undefined): { pallets: number; resto: string } | null {
  const m = (nota ?? "").match(NOTA_PALLET);
  if (!m) return null;
  return { pallets: Number(m[1].replace(/\./g, "")), resto: (nota ?? "").replace(NOTA_PALLET, "").trim() };
}

export type BorradorFiscal = {
  calle: string;
  /** «A|01»: calle y módulo, sin el lado. */
  base: string;
  lado: string;
  codigo: string;
  dia: string; mes: string; anio: string;
  modo: ModoFiscal; estibas: string; saldo: string; cajas: string; unidades: string;
  /** Pallets de Carnaval (solo con modo «pallets»). */
  pallets: string;
  nota: string;
  /** Estado del envase (RETORNO, BAJA…) o LLENO/VACÍO del cilindro; vacío si lo contado es producto. */
  estado: string;
  /** Avería y PNC no van juntas; el PNC pide rótulo y bloqueo mecánico (null = sin contestar). */
  averia: boolean; pnc: boolean; pncRotulo: boolean | null; pncBloqueo: boolean | null;
};
export const VACIO_FISCAL: BorradorFiscal = {
  calle: "", base: "", lado: "", codigo: "", dia: "", mes: "", anio: "",
  modo: "estibas", estibas: "", saldo: "", cajas: "", unidades: "", pallets: "", nota: "", estado: "",
  averia: false, pnc: false, pncRotulo: null, pncBloqueo: null,
};

/* El mismo estado que el conteo diario pide para el envase. */
export const ESTADOS_ENVASE = ["RETORNO", "LAVADO", "NUEVO", "BAJA", "EXTRASUCIO", "OTROS", "MAL ESTADO"] as const;
export const esCilindroFiscal = (m: Material | null) => /cilindro/i.test(m?.tipo_envase ?? "");
export const pideEstadoFiscal = (m: Material | null) => !!m && (m.tipo_material === "ENVASE" || esCilindroFiscal(m));
export const opcionesEstadoFiscal = (m: Material | null): readonly string[] => (esCilindroFiscal(m) ? ["LLENO", "VACÍO"] : ESTADOS_ENVASE);

/* LA CALCULADORA: las casillas de cantidad aceptan una cuenta —3×40+5, 12+8, (2+1)*40— además del número solo.
   Es la misma del conteo normal. Se evalúa a mano (suma, resta, multiplicación, división y paréntesis); no se usa eval. */
export const OPERADOR = /[+\-−*/×÷xX()]/;
export const calcular = (texto: string): number | null => {
  const t = texto.replace(/[×xX]/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/[\s,]/g, "");
  if (t === "" || !/^[0-9+\-*/().]+$/.test(t)) return null;
  let i = 0;
  const num = (): number | null => {
    if (t[i] === "(") { i++; const v = suma(); if (v == null || t[i] !== ")") return null; i++; return v }
    const ini = i;
    while (i < t.length && /[0-9.]/.test(t[i])) i++;
    if (i === ini) return null;
    const v = Number(t.slice(ini, i));
    return Number.isFinite(v) ? v : null;
  };
  const prod = (): number | null => {
    let v = num();
    while (v != null && (t[i] === "*" || t[i] === "/")) {
      const op = t[i++]; const w = num();
      if (w == null || (op === "/" && w === 0)) return null;
      v = op === "*" ? v * w : v / w;
    }
    return v;
  };
  const suma = (): number | null => {
    let v = prod();
    while (v != null && (t[i] === "+" || t[i] === "-")) {
      const op = t[i++]; const w = prod();
      if (w == null) return null;
      v = op === "+" ? v + w : v - w;
    }
    return v;
  };
  const r = suma();
  return r != null && i === t.length && Number.isFinite(r) ? r : null;
};
/** ¿Lo escrito es una cuenta (y no solo un número)? */
export const esCuenta = (s: string) => OPERADOR.test(s.trim()) && /[0-9]/.test(s);

/** Una cantidad: vacío es «no se contó»; 0 es «se contó y no hay». Una cuenta se resuelve («3×40+5» = 125). */
export const cantidad = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  if (esCuenta(t) && !/^[xX]+$/.test(t)) {
    const r = calcular(t);
    return r != null && Number.isInteger(r) && r >= 0 ? r : null;
  }
  const d = t.replace(/\D/g, "");
  return d === "" ? null : Number(d);
};

/** Lo que dice la casilla sin pasar por «cantidad»: para saber si hay fecha a medias. */
const hayFecha = (b: BorradorFiscal) => b.dia.trim() !== "" || b.mes.trim() !== "" || b.anio.trim() !== "";

/** Cajas que da el renglón, o null si no se puede saber (estibas de un material sin factor). */
export function totalCajas(b: BorradorFiscal, mat: Material | null, porPallet?: number | null): { formula: string | null; total: number | null; sueltas?: number; unidades?: number } | null {
  if (b.modo === "pallets") {
    const p = cantidad(b.pallets);
    if (p == null) return null;
    const upc = mat?.unidades_por_caja ?? null;
    if (!porPallet || !upc || upc <= 0) return { formula: null, total: null };
    const u = p * porPallet;
    return { formula: `${miles(p)} × ${miles(porPallet)} = ${miles(u)} un. ÷ ${upc}`, total: Math.floor(u / upc), sueltas: u % upc, unidades: u };
  }
  if (b.modo === "cajas") {
    const c = cantidad(b.cajas);
    return c == null ? null : { formula: String(c), total: c };
  }
  if (b.modo === "unidades") {
    const u = cantidad(b.unidades);
    if (u == null) return null;
    const upc = mat?.unidades_por_caja ?? null;
    if (!upc || upc <= 0) return { formula: null, total: null };
    /* Lo que no completa una caja NO se pierde: son unidades sueltas, y se muestran y se anotan junto a las cajas. */
    return { formula: `${u} ÷ ${upc}`, total: Math.floor(u / upc), sueltas: u % upc };
  }
  const e = cantidad(b.estibas), s = cantidad(b.saldo);
  if (e == null && s == null) return null;
  const f = mat?.cajas_por_estiba ?? null;
  if (e != null && e > 0 && f == null) return { formula: null, total: null };
  const total = (e ?? 0) * (f ?? 0) + (s ?? 0);
  const partes = [e != null ? `${e} × ${f ?? 0}` : null, s != null ? String(s) : null].filter(Boolean).join(" + ");
  return { formula: partes, total };
}

/** Contar en unidades: se pasan a cajas con las «unidades por caja» del maestro; lo que no completa una caja queda como
 *  unidades sueltas (van aparte, en `unidades`, y cuentan en todo). Solo impide contar así un material sin ese dato. */
export function avisoUnidades(b: BorradorFiscal, mat: Material | null): string | null {
  if (b.modo !== "unidades" || !mat || cantidad(b.unidades) == null) return null;
  const upc = mat.unidades_por_caja ?? null;
  return !upc || upc <= 0 ? "Este material no tiene «unidades por caja» en el maestro: cuéntalo por cajas." : null;
}
/** Lo que falta o está mal en el renglón, dicho como lo diría una persona; null si se puede anotar. */
export function revisarFiscal(b: BorradorFiscal, mat: Material | null, claveEscogida: string | null, porPallet?: number | null): string | null {
  const env = pideEstadoFiscal(mat);
  if (!b.base) return "Escoge el módulo.";
  if (!claveEscogida) return "Falta decir de qué lado del módulo.";
  if (!mat) return b.codigo.trim() === "" ? "Falta el código del material." : `El código «${b.codigo.trim()}» no está en el maestro.`;
  for (const [campo, v] of [["estibas", b.estibas], ["saldo", b.saldo], ["cajas", b.cajas], ["unidades", b.unidades], ["pallets", b.pallets]] as const) {
    if (esCuenta(v) && cantidad(v) == null) return `No entiendo la cuenta de ${campo}: revisa los números y los signos (+ − × ÷), y que el resultado sea un entero.`;
  }
  if (b.modo === "cajas") {
    if (cantidad(b.cajas) == null) return "¿Cuántas cajas? Si no hay nada, anota 0.";
  } else if (b.modo === "unidades") {
    if (cantidad(b.unidades) == null) return "¿Cuántas unidades? Si no hay nada, anota 0.";
    const av = avisoUnidades(b, mat);
    if (av) return av;
  } else if (b.modo === "pallets") {
    if (esCuenta(b.pallets) && cantidad(b.pallets) == null) return "No entiendo la cuenta de pallets: revisa los números y los signos.";
    if (cantidad(b.pallets) == null) return "¿Cuántos pallets? Si no hay nada, anota 0.";
    if (!porPallet) return "Este material no tiene «unidades por pallet» en el maestro de Carnaval: cuéntalo por estibas o cajas.";
    if (!mat.unidades_por_caja || mat.unidades_por_caja <= 0) return "Este material no tiene «unidades por caja» en el maestro: cuéntalo por cajas.";
  } else {
    const e = cantidad(b.estibas), s = cantidad(b.saldo);
    if (e == null && s == null) return "¿Cuántas estibas? Si solo hay sueltas, anótalas en el saldo; si no hay nada, anota 0.";
    if (e != null && e > 0 && mat.cajas_por_estiba == null) return "Este material no dice cuántas cajas lleva una estiba: cuéntalo por cajas.";
  }
  if (b.pnc && (b.pncRotulo == null || b.pncBloqueo == null)) return "El PNC pide dos respuestas: ¿tiene rótulo? y ¿tiene bloqueo mecánico?";
  if (pideEstadoFiscal(mat) && b.estado.trim() === "") return esCilindroFiscal(mat) ? "Escoge si el cilindro está lleno o vacío." : "Escoge el estado del envase.";
  /* El inventario fiscal compara SKU y cantidades: la fecha de vencimiento NO es obligatoria (si se pone, va completa y válida). */
  if (hayFecha(b)) {
    const d = cantidad(b.dia), m = cantidad(b.mes), a = cantidad(b.anio);
    if (d == null || m == null || a == null) return "La fecha de vencimiento va completa: día, mes y año.";
    if (d < 1 || d > 31) return `El día del vencimiento dice ${d}. Va de 1 a 31.`;
    if (m < 1 || m > 12) return `El mes del vencimiento dice ${m}. Va de 1 a 12.`;
    const f = new Date(2000 + a, m - 1, d);
    if (f.getMonth() !== m - 1 || f.getDate() !== d) return `El ${d}/${m}/${a} no existe. Revisa el día.`;
  }
  return null;
}

/** Los argumentos de `inv_fiscal_contar_agregar`. Solo se llama con un renglón que pasó `revisarFiscal`. */
export function argumentosFiscal(hojaId: string, ubicacionId: string, mat: Material, b: BorradorFiscal, porPallet?: number | null) {
  const fecha = hayFecha(b);
  /* Unidades (y pallets, que son unidades): las cajas completas van en `cajas` y lo que no completa una caja va en `unidades`
     (sueltas): las dos cuentan. */
  const porUnidades = b.modo === "unidades" || b.modo === "pallets";
  const cuenta = porUnidades ? totalCajas(b, mat, porPallet) : null;
  const escrita = b.nota.trim();
  const nota = b.modo === "pallets" && cuenta?.unidades != null
    ? `Pallet: ${miles(cantidad(b.pallets) ?? 0)} × ${miles(porPallet ?? 0)} = ${miles(cuenta.unidades)} un.${escrita ? ` · ${escrita}` : ""}`
    : escrita;
  return {
    p_hoja: hojaId,
    p_ubicacion: ubicacionId,
    p_producto: mat.id,
    p_estibas: b.modo === "estibas" ? cantidad(b.estibas) : null,
    p_saldo: b.modo === "estibas" ? cantidad(b.saldo) : null,
    p_cajas: b.modo === "cajas" ? cantidad(b.cajas) : porUnidades ? cuenta?.total ?? null : null,
    p_dia: fecha ? cantidad(b.dia) : null,
    p_mes: fecha ? cantidad(b.mes) : null,
    p_anio: fecha ? cantidad(b.anio) : null,
    p_nota: nota === "" ? null : nota,
    ...(porUnidades && (cuenta?.sueltas ?? 0) > 0 ? { p_unidades: cuenta?.sueltas } : {}),
    /* Estado, avería y PNC solo viajan cuando el renglón los trae: así un renglón común sigue funcionando
       aunque a la base aún le falte 2026-10-fiscal-estado.sql. */
    ...(pideEstadoFiscal(mat) && b.estado.trim() !== "" ? { p_estado: b.estado.trim() } : {}),
    ...(b.averia ? { p_averia: true } : {}),
    ...(b.pnc ? { p_pnc: true, p_pnc_rotulo: b.pncRotulo, p_pnc_bloqueo: b.pncBloqueo } : {}),
  };
}

/** Lo que devuelve `inv_fiscal_contar_mios`. */
export type RenglonFiscal = {
  id: string; ubicacion_id: string; ubicacion: string; producto_id: string; sku: string; material: string;
  estibas: number | null; saldo: number | null; cajas: number | null; total_cajas: number | string;
  venc_dia: number | null; venc_mes: number | null; venc_anio: number | null; nota: string | null; contado_en: string; estado_envase?: string | null;
  averia?: boolean; pnc?: boolean; pnc_rotulo?: boolean | null; pnc_bloqueo_mecanico?: boolean | null;
  /** Unidades sueltas (menos de una caja) y las unidades por caja del material. */
  unidades?: number | null; unidades_por_caja?: number | null;
  /** Ya aprobado por el fiscal y pasado a La base. */
  en_base?: boolean;
};
