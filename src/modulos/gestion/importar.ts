import {
  dispara, estadoDe, inicioPeriodo, textoDisparo, type Estado, type Frecuencia, type Indicador, type Op, type Turno,
} from "./semaforo";

/**
 * LA IMPORTACIÓN MASIVA DE GESTIÓN — el Excel (hojas TURNOS, PROCESOS, INDICADORES y RESULTADOS) convertido en filas
 * limpias y VALIDADAS antes de tocar la base. Es lógica pura (sin red): corre en el navegador para la vista previa
 * y sus resultados se mandan al servidor, que vuelve a revisar lo esencial.
 *
 * Las columnas se reconocen por su ENCABEZADO (sin tildes, sin mayúsculas, sin lo que va entre paréntesis), no por su
 * posición: se pueden mover o dejar columnas sin llenar. Un código de indicador manda: mismo código = se actualiza.
 */
type Celda = string | number | boolean | Date | null | undefined;
export type Hoja = Celda[][];
export type Hojas = { turnos?: Hoja; procesos?: Hoja; indicadores?: Hoja; resultados?: Hoja };

export type TurnoImp = { nombre: string; hora_ini: string; hora_fin: string; orden: number };
export type ProcesoImp = { nombre: string; orden: number };
export type IndicadorImp = {
  codigo: string; nombre: string; tipo: "kpi" | "pi"; padre: string | null; proceso: string | null;
  nivel_reunion: 1 | 2; unidad: string; decimales: number;
  meta_op: Op; meta_valor: number;
  amarillo_op: Op | null; amarillo_valor: number | null; rojo_op: Op | null; rojo_valor: number | null;
  frecuencia: Frecuencia; captura: "turnos" | "unico"; turnos: string[]; responsable: string | null;
  disparo_activo: boolean; disparo_en: "rojo" | "amarillo"; disparo_consecutivos: number; orden: number;
};
export type ResultadoImp = { codigo: string; fecha: string; turno: string | null; valor: number; comentario: string | null };

export type Aviso = { hoja: string; fila: number; texto: string };
export type Existentes = {
  turnos: Turno[]; procesos: { nombre: string }[];
  indicadores: Pick<Indicador, "codigo" | "tipo" | "frecuencia" | "captura" | "turnos" | "meta_op" | "meta_valor" | "amarillo_op" | "amarillo_valor" |
    "rojo_op" | "rojo_valor" | "disparo_activo" | "disparo_en" | "disparo_consecutivos" | "decimales" | "unidad" | "nombre">[];
};
export type Plan = {
  turnos: TurnoImp[]; procesos: ProcesoImp[]; indicadores: IndicadorImp[]; resultados: ResultadoImp[];
  errores: Aviso[]; avisos: Aviso[];
  nuevos: { turnos: number; procesos: number; indicadores: number };
  cambian: { turnos: number; procesos: number; indicadores: number };
  semaforo: Record<Estado, number>;
  /** Indicadores en los que, con lo que trae el archivo, saltaría el disparador al terminar. */
  dispararian: { codigo: string; nombre: string; regla: string }[];
  rango: { desde: string; hasta: string } | null;
  hojasLeidas: string[];
};

/* ---------------------------------------------------------------------------- lectores de celdas ---- */
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const txt = (v: Celda) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const clave = (v: Celda) => sinTilde(txt(v)).toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");
const vacio = (v: Celda) => txt(v) === "";

function numero(v: Celda): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let t = txt(v).replace(/\s/g, "").replace(/%$/, "");
  if (!t) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");   // 1.234,5
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");                    // 1,234.5
  else t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
function fechaISO(v: Celda): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    if (v < 20000 || v > 90000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000).toISOString().slice(0, 10);   // serial de Excel
  }
  const t = txt(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return ok(`${m[1]}-${pad(+m[2])}-${pad(+m[3])}`);
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(t);
  if (m) return ok(`${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(+m[2])}-${pad(+m[1])}`);
  return null;
}
const ok = (f: string) => { const d = new Date(f + "T12:00:00Z"); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f ? f : null };

function hora(v: Celda): string | null {
  if (typeof v === "number") {
    if (v >= 0 && v < 1) { const min = Math.round(v * 1440); return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`; }
    if (Number.isInteger(v) && v >= 0 && v <= 24) return `${pad(v % 24)}:00`;
    return null;
  }
  const m = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/.exec(txt(v));
  if (!m) return null;
  const h = +m[1], mi = +(m[2] ?? 0);
  return h <= 24 && mi < 60 ? `${pad(h % 24)}:${pad(mi)}` : null;
}

function operador(v: Celda): Op | null {
  const t = txt(v).replace(/\s/g, "").toLowerCase();
  const m: Record<string, Op> = { ">=": ">=", "≥": ">=", "=>": ">=", ">": ">", "<=": "<=", "≤": "<=", "=<": "<=", "<": "<", "=": "=", "==": "=",
    "mayoroigual": ">=", "mayorque": ">", "menoroigual": "<=", "menorque": "<", "igual": "=", "igualque": "=" };
  return m[t] ?? null;
}
const sino = (v: Celda, defecto: boolean): boolean | null => {
  const t = sinTilde(txt(v)).toLowerCase();
  if (!t) return defecto;
  if (["si", "s", "true", "1", "x", "yes", "y"].includes(t)) return true;
  if (["no", "n", "false", "0", "-"].includes(t)) return false;
  return null;
};

/** Primera fila con algún encabezado conocido → { campo: índice de columna } y desde qué fila vienen los datos. */
function columnas(hoja: Hoja, alias: Record<string, string[]>): { col: Record<string, number>; desde: number } | null {
  for (let r = 0; r < Math.min(hoja.length, 12); r++) {
    const col: Record<string, number> = {};
    (hoja[r] ?? []).forEach((c, i) => {
      const k = clave(c);
      if (!k) return;
      for (const [campo, nombres] of Object.entries(alias)) if (!(campo in col) && nombres.includes(k)) col[campo] = i;
    });
    if (Object.keys(col).length >= 2) return { col, desde: r + 1 };
  }
  return null;
}

const A_TURNOS = { nombre: ["turno", "nombre", "nombredelturno"], ini: ["horainicio", "inicio", "desde", "horaini"], fin: ["horafin", "fin", "hasta"], orden: ["orden"] };
const A_PROC = { nombre: ["proceso", "nombre", "nombredelproceso"], orden: ["orden"] };
const A_IND = {
  codigo: ["codigo", "cod", "id"], nombre: ["nombre", "indicador", "nombredelindicador"], tipo: ["tipo"], padre: ["kpipadre", "padre", "kpi", "codigokpipadre"],
  proceso: ["proceso"], nivel: ["niveldereunion", "nivel", "reunion"], unidad: ["unidad"], decimales: ["decimales"],
  metaOp: ["metaoperador", "metaop", "operadormeta"], metaVal: ["metavalor", "meta", "valormeta"],
  frecuencia: ["frecuencia"], captura: ["captura"], turnos: ["turnos", "turnosquecapturan"], responsable: ["responsable"],
  dispActivo: ["disparadoractivo", "disparador", "disparoactivo"],   dispN: ["resultadosseguidos", "seguidos", "consecutivos", "nderesultadosseguidos"], orden: ["orden"],
};
const A_RES = { codigo: ["codigoindicador", "codigo", "indicador", "cod"], fecha: ["fecha", "dia"], turno: ["turno"], valor: ["valor", "resultado"], comentario: ["comentario", "observacion", "nota", "comentarios"] };

const FREC: Record<string, Frecuencia> = { dia: "dia", diario: "dia", diaria: "dia", semana: "semana", semanal: "semana", mes: "mes", mensual: "mes" };

/* ---------------------------------------------------------------------------- el armado ---- */
export function armarImportacion(hojas: Hojas, ex: Existentes, hoy: string): Plan {
  const errores: Aviso[] = [], avisos: Aviso[] = [];
  const err = (hoja: string, fila: number, texto: string) => errores.push({ hoja, fila, texto });
  const avi = (hoja: string, fila: number, texto: string) => avisos.push({ hoja, fila, texto });
  const leidas: string[] = [];

  /* ---- TURNOS ---- */
  const turnos = new Map<string, TurnoImp>();
  if (hojas.turnos) {
    const c = columnas(hojas.turnos, A_TURNOS);
    if (!c || c.col.nombre == null) err("TURNOS", 1, "No encuentro el encabezado «Turno». Usa la plantilla.");
    else {
      leidas.push("TURNOS");
      hojas.turnos.slice(c.desde).forEach((f, i) => {
        const fila = c.desde + i + 1;
        if (f.every(vacio)) return;
        const nombre = txt(f[c.col.nombre]);
        if (!nombre) { err("TURNOS", fila, "Falta el nombre del turno."); return; }
        const ini = hora(f[c.col.ini]), fin = hora(f[c.col.fin]);
        if (!ini || !fin) { err("TURNOS", fila, `«${nombre}»: las horas deben ser HH:MM (por ejemplo 06:00).`); return; }
        if (turnos.has(nombre.toLowerCase())) avi("TURNOS", fila, `«${nombre}» está repetido: vale la última fila.`);
        turnos.set(nombre.toLowerCase(), { nombre, hora_ini: ini, hora_fin: fin, orden: numero(f[c.col.orden]) ?? turnos.size + 1 });
      });
    }
  }
  const nombresTurno = new Map<string, string>();   // minúscula → nombre real (archivo o base)
  ex.turnos.forEach((t) => nombresTurno.set(t.nombre.toLowerCase(), t.nombre));
  turnos.forEach((t, k) => nombresTurno.set(k, t.nombre));

  /* ---- PROCESOS ---- */
  const procesos = new Map<string, ProcesoImp>();
  if (hojas.procesos) {
    const c = columnas(hojas.procesos, A_PROC);
    if (!c || c.col.nombre == null) err("PROCESOS", 1, "No encuentro el encabezado «Proceso». Usa la plantilla.");
    else {
      leidas.push("PROCESOS");
      hojas.procesos.slice(c.desde).forEach((f, i) => {
        const fila = c.desde + i + 1;
        if (f.every(vacio)) return;
        const nombre = txt(f[c.col.nombre]);
        if (!nombre) { err("PROCESOS", fila, "Falta el nombre del proceso."); return; }
        if (procesos.has(nombre.toLowerCase())) avi("PROCESOS", fila, `«${nombre}» está repetido: vale la última fila.`);
        procesos.set(nombre.toLowerCase(), { nombre, orden: numero(f[c.col.orden]) ?? procesos.size + 1 });
      });
    }
  }
  const nombresProceso = new Map<string, string>();
  ex.procesos.forEach((p) => nombresProceso.set(p.nombre.toLowerCase(), p.nombre));
  procesos.forEach((p, k) => nombresProceso.set(k, p.nombre));

  /* ---- INDICADORES ---- */
  const indicadores = new Map<string, IndicadorImp>();
  const filaDe = new Map<string, number>();
  if (hojas.indicadores) {
    const c = columnas(hojas.indicadores, A_IND);
    if (!c || c.col.codigo == null) err("INDICADORES", 1, "No encuentro el encabezado «Código». Usa la plantilla.");
    else {
      leidas.push("INDICADORES");
      const g = (f: Celda[], campo: string) => (campo in c.col ? f[c.col[campo]] : undefined);
      hojas.indicadores.slice(c.desde).forEach((f, i) => {
        const fila = c.desde + i + 1;
        if (f.every(vacio)) return;
        const codigo = txt(g(f, "codigo")).toUpperCase().replace(/\s+/g, "");
        if (!codigo) { err("INDICADORES", fila, "Falta el código del indicador."); return; }
        const nombre = txt(g(f, "nombre"));
        if (!nombre) { err("INDICADORES", fila, `${codigo}: falta el nombre.`); return; }
        const tipoT = sinTilde(txt(g(f, "tipo"))).toLowerCase();
        const tipo = tipoT === "kpi" ? "kpi" : tipoT === "pi" ? "pi" : null;
        if (!tipo) { err("INDICADORES", fila, `${codigo}: el tipo debe ser KPI o PI.`); return; }
        const metaOp = operador(g(f, "metaOp")), metaVal = numero(g(f, "metaVal"));
        if (!metaOp || metaVal == null) { err("INDICADORES", fila, `${codigo}: la meta necesita operador (≥ > ≤ < =) y número.`); return; }
        const frecT = sinTilde(txt(g(f, "frecuencia"))).toLowerCase();
        const frecuencia = frecT ? FREC[frecT] : "dia";
        if (!frecuencia) { err("INDICADORES", fila, `${codigo}: la frecuencia debe ser Día, Semana o Mes.`); return; }
        const capT = sinTilde(txt(g(f, "captura"))).toLowerCase();
        let captura: "turnos" | "unico" = frecuencia === "dia" ? "turnos" : "unico";
        if (capT) {
          if (/turno/.test(capT)) captura = "turnos"; else if (/unic|valor|total|dia/.test(capT)) captura = "unico";
          else { err("INDICADORES", fila, `${codigo}: la captura debe ser «Por turno» o «Valor único».`); return; }
        }
        if (frecuencia !== "dia" && captura === "turnos") { avi("INDICADORES", fila, `${codigo}: lo que no es diario se captura como valor único.`); captura = "unico"; }
        const tn: string[] = [];
        const tT = txt(g(f, "turnos"));
        if (captura === "turnos" && tT && sinTilde(tT).toLowerCase() !== "todos") {
          for (const p of tT.split(/[,;/|]/).map((x) => x.trim()).filter(Boolean)) {
            const real = nombresTurno.get(p.toLowerCase());
            if (!real) { err("INDICADORES", fila, `${codigo}: el turno «${p}» no existe (ponlo en la hoja TURNOS).`); return; }
            tn.push(real);
          }
        }
        const nivel = numero(g(f, "nivel")) ?? 1;
        if (nivel !== 1 && nivel !== 2) { err("INDICADORES", fila, `${codigo}: el nivel de reunión es 1 o 2.`); return; }
        const dec = numero(g(f, "decimales")) ?? 0;
        if (!Number.isInteger(dec) || dec < 0 || dec > 4) { err("INDICADORES", fila, `${codigo}: los decimales van de 0 a 4.`); return; }
        const da = sino(g(f, "dispActivo"), true);
        if (da == null) { err("INDICADORES", fila, `${codigo}: «Disparador activo» es Sí o No.`); return; }
        const seg = numero(g(f, "dispN")) ?? 1;
        if (!Number.isInteger(seg) || seg < 1 || seg > 30) { err("INDICADORES", fila, `${codigo}: «Resultados seguidos» va de 1 a 30.`); return; }

        let proceso: string | null = null;
        const pT = txt(g(f, "proceso"));
        if (pT) {
          const real = nombresProceso.get(pT.toLowerCase());
          if (real) proceso = real;
          else { proceso = pT; procesos.set(pT.toLowerCase(), { nombre: pT, orden: procesos.size + 1 }); nombresProceso.set(pT.toLowerCase(), pT); avi("INDICADORES", fila, `${codigo}: el proceso «${pT}» no existía; se creará.`); }
        }
        if (indicadores.has(codigo)) avi("INDICADORES", fila, `${codigo} está repetido: vale la última fila.`);
        filaDe.set(codigo, fila);
        indicadores.set(codigo, {
          codigo, nombre, tipo, padre: tipo === "pi" ? txt(g(f, "padre")).toUpperCase().replace(/\s+/g, "") || null : null,
          proceso, nivel_reunion: nivel as 1 | 2, unidad: txt(g(f, "unidad")), decimales: dec,
          meta_op: metaOp, meta_valor: metaVal, amarillo_op: null, amarillo_valor: null, rojo_op: null, rojo_valor: null,
          frecuencia, captura, turnos: tn, responsable: txt(g(f, "responsable")) || null,
          disparo_activo: da, disparo_en: "rojo", disparo_consecutivos: seg, orden: numero(g(f, "orden")) ?? indicadores.size + 1,
        });
      });
    }
    /* Los PI cuelgan de un KPI que exista (en el archivo o ya en la base). */
    const tipoDe = new Map<string, string>(ex.indicadores.map((x) => [x.codigo, x.tipo]));
    indicadores.forEach((x, k) => tipoDe.set(k, x.tipo));
    indicadores.forEach((x) => {
      if (x.tipo !== "pi") return;
      const fila = filaDe.get(x.codigo) ?? 0;
      if (!x.padre) err("INDICADORES", fila, `${x.codigo}: un PI cuelga de un KPI; escribe el código del KPI padre.`);
      else if (!tipoDe.has(x.padre)) err("INDICADORES", fila, `${x.codigo}: el KPI padre «${x.padre}» no existe (ni en el archivo ni en la base).`);
      else if (tipoDe.get(x.padre) !== "kpi") err("INDICADORES", fila, `${x.codigo}: el padre «${x.padre}» es un PI; el padre tiene que ser un KPI.`);
    });
  }

  /* ---- RESULTADOS ---- */
  type Def = Pick<Indicador, "frecuencia" | "captura" | "meta_op" | "meta_valor" | "amarillo_op" | "amarillo_valor" | "rojo_op" | "rojo_valor" | "disparo_activo" | "disparo_en" | "disparo_consecutivos" | "decimales" | "unidad"> & { nombre: string };
  const defs = new Map<string, Def>();
  ex.indicadores.forEach((x) => defs.set(x.codigo, x));
  indicadores.forEach((x, k) => defs.set(k, x));
  const resultados = new Map<string, ResultadoImp>();
  const semaforo: Record<Estado, number> = { verde: 0, amarillo: 0, rojo: 0 };
  if (hojas.resultados) {
    const c = columnas(hojas.resultados, A_RES);
    if (!c || c.col.codigo == null || c.col.fecha == null || c.col.valor == null) err("RESULTADOS", 1, "No encuentro los encabezados «Código indicador», «Fecha» y «Valor». Usa la plantilla.");
    else {
      leidas.push("RESULTADOS");
      const g = (f: Celda[], campo: string) => (campo in c.col ? f[c.col[campo]] : undefined);
      const turnosDe = (cod: string): string[] => {
        const nuevo = indicadores.get(cod);
        if (nuevo) return nuevo.turnos;
        const e = ex.indicadores.find((x) => x.codigo === cod);
        return (e?.turnos ?? []).map((id) => ex.turnos.find((t) => t.id === id)?.nombre ?? id);
      };
      let n = 0;
      for (let i = c.desde; i < hojas.resultados.length; i++) {
        const f = hojas.resultados[i] ?? [];
        const fila = i + 1;
        if (f.every(vacio)) continue;
        n++;
        if (errores.filter((x) => x.hoja === "RESULTADOS").length >= 400) { avi("RESULTADOS", fila, "Demasiados errores: dejé de revisar más filas de RESULTADOS."); break; }
        const cod = txt(g(f, "codigo")).toUpperCase().replace(/\s+/g, "");
        const def = defs.get(cod);
        if (!cod) { err("RESULTADOS", fila, "Falta el código del indicador."); continue; }
        if (!def) { err("RESULTADOS", fila, `El indicador «${cod}» no existe (ni en el archivo ni en la base).`); continue; }
        const fecha = fechaISO(g(f, "fecha"));
        if (!fecha) { err("RESULTADOS", fila, `${cod}: la fecha no es válida (usa dd/mm/aaaa).`); continue; }
        if (fecha > hoy) { err("RESULTADOS", fila, `${cod}: la fecha ${fecha} todavía no ha llegado.`); continue; }
        const valor = numero(g(f, "valor"));
        if (valor == null) { err("RESULTADOS", fila, `${cod}: el valor no es un número.`); continue; }
        let turno: string | null = null;
        const tT = txt(g(f, "turno"));
        if (def.captura === "turnos" && def.frecuencia === "dia") {
          if (!tT) { err("RESULTADOS", fila, `${cod} se captura por turno: falta el turno.`); continue; }
          const real = nombresTurno.get(tT.toLowerCase());
          if (!real) { err("RESULTADOS", fila, `${cod}: el turno «${tT}» no existe.`); continue; }
          const permitidos = turnosDe(cod);
          if (permitidos.length && !permitidos.some((p) => p.toLowerCase() === real.toLowerCase())) avi("RESULTADOS", fila, `${cod}: el turno «${real}» no está entre los que capturan ese indicador; se carga igual.`);
          turno = real;
        } else if (tT) avi("RESULTADOS", fila, `${cod} se captura como valor único: se ignora el turno «${tT}».`);
        const dia = inicioPeriodo(fecha, def.frecuencia);
        const k = `${cod}|${dia}|${turno ?? ""}`;
        if (resultados.has(k)) avi("RESULTADOS", fila, `${cod} · ${dia}${turno ? " · " + turno : ""} está repetido: vale la última fila.`);
        resultados.set(k, { codigo: cod, fecha, turno, valor, comentario: txt(g(f, "comentario")) || null });
      }
      if (!n) avi("RESULTADOS", 1, "La hoja RESULTADOS no trae filas.");
    }
  }

  /* ---- vista previa: semáforo, rango y disparadores que saltarían ---- */
  const lista = [...resultados.values()];
  const porInd = new Map<string, { dia: string; orden: number; estado: Estado }[]>();
  const ordenTurno = new Map([...ex.turnos.map((t) => [t.nombre.toLowerCase(), t.orden] as const), ...[...turnos.values()].map((t) => [t.nombre.toLowerCase(), t.orden] as const)]);
  for (const r of lista) {
    const d = defs.get(r.codigo)!;
    const estado = estadoDe(d, r.valor);
    semaforo[estado]++;
    const arr = porInd.get(r.codigo) ?? [];
    arr.push({ dia: inicioPeriodo(r.fecha, d.frecuencia), orden: r.turno ? ordenTurno.get(r.turno.toLowerCase()) ?? 0 : 0, estado });
    porInd.set(r.codigo, arr);
  }
  const dispararian: Plan["dispararian"] = [];
  porInd.forEach((arr, cod) => {
    const d = defs.get(cod)!;
    arr.sort((a, b) => (a.dia === b.dia ? b.orden - a.orden : a.dia < b.dia ? 1 : -1));
    if (dispara(d, arr.map((x) => x.estado))) dispararian.push({ codigo: cod, nombre: d.nombre, regla: textoDisparo(d) });
  });
  const fechas = lista.map((r) => r.fecha).sort();

  const existeTurno = new Set(ex.turnos.map((t) => t.nombre.toLowerCase()));
  const existeProc = new Set(ex.procesos.map((p) => p.nombre.toLowerCase()));
  const existeInd = new Set(ex.indicadores.map((x) => x.codigo));
  const cuenta = (claves: string[], existe: Set<string>) => ({ nuevos: claves.filter((k) => !existe.has(k)).length, cambian: claves.filter((k) => existe.has(k)).length });
  const ct = cuenta([...turnos.keys()], existeTurno), cp = cuenta([...procesos.keys()], existeProc), ci = cuenta([...indicadores.keys()], existeInd);

  if (!leidas.length && !errores.length) err("ARCHIVO", 1, "No encontré ninguna hoja de la plantilla (TURNOS, PROCESOS, INDICADORES o RESULTADOS).");
  return {
    turnos: [...turnos.values()], procesos: [...procesos.values()], indicadores: [...indicadores.values()], resultados: lista,
    errores, avisos,
    nuevos: { turnos: ct.nuevos, procesos: cp.nuevos, indicadores: ci.nuevos },
    cambian: { turnos: ct.cambian, procesos: cp.cambian, indicadores: ci.cambian },
    semaforo, dispararian, rango: fechas.length ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : null, hojasLeidas: leidas,
  };
}
