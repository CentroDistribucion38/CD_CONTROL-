import type { ZexiAlm } from "./logica";

/**
 * LEER LA ZEXI DE AG07 (y AG71) en el navegador (con `xlsx`). SAP la exporta con «Ce.» y «Alm.» escritos solo en el primer renglón de cada
 * grupo: los renglones de abajo, con el almacén vacío, son del último almacén que apareció. Columnas por su NOMBRE:
 * Material · descripcion · Alm. · Libre utiliz. · In control-cal · Bloqueado · Total General.
 */
type Celda = string | number | null | undefined;
const txt = (v: Celda) => String(v ?? "").trim();
const norm = (v: Celda) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (v: Celda) => {
  if (typeof v === "number") return v;
  let s = txt(v).replace(/\s/g, ""); if (!s) return 0;
  let neg = false; if (s.endsWith("-")) { neg = true; s = s.slice(0, -1) }
  if (/,\d{1,3}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
};
const codigo = (v: Celda) => txt(v).replace(/^0+(?=\d)/, "").replace(/\.0+$/, "");
const col = (t: string[], ...p: RegExp[]) => { for (const r of p) { const i = t.findIndex((x) => r.test(x)); if (i >= 0) return i } return -1 };

export async function leerZexiAg07(archivo: File): Promise<{ filas: ZexiAlm[]; error?: string }> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const filas = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: true, defval: null });
  const i = filas.slice(0, 15).findIndex((f) => f.some((c) => norm(c) === "material"));
  if (i < 0) return { filas: [], error: "No encontré la columna «Material» en las primeras filas de la ZEXI." };
  const t = filas[i].map(norm);
  const cMat = col(t, /^material$/), cDes = col(t, /descrip|texto/), cAlm = col(t, /^alm\.?$/, /^almacen$/);
  const cLib = col(t, /libre/), cCal = col(t, /control/), cBlo = col(t, /bloq/), cTot = col(t, /^total/);
  if (cAlm < 0) return { filas: [], error: "La ZEXI debe traer la columna «Alm.» (almacén)." };
  if (cLib < 0 || cCal < 0) return { filas: [], error: `No encontré Libre utiliz. ni In control-cal. Los títulos que veo: ${filas[i].map((x) => txt(x)).filter(Boolean).join(" · ")}.` };
  const mapa = new Map<string, ZexiAlm>();
  let alm = "";
  for (const f of filas.slice(i + 1)) {
    const a = txt(f[cAlm]).toUpperCase(); if (a) alm = a;
    const c = codigo(f[cMat]); if (!c || !/^\w+$/.test(c) || !alm) continue;
    const x = mapa.get(`${alm}|${c}`) ?? { almacen: alm, codigo: c, descripcion: cDes >= 0 ? txt(f[cDes]) : "", libre: 0, calidad: 0, bloqueado: 0, total: 0 };
    x.libre += num(f[cLib]); x.calidad += num(f[cCal]); x.bloqueado += cBlo >= 0 ? num(f[cBlo]) : 0;
    x.total = x.libre + x.calidad + x.bloqueado;
    if (cTot >= 0 && !(x.libre + x.calidad + x.bloqueado)) x.total += num(f[cTot]);
    mapa.set(`${alm}|${c}`, x);
  }
  const out = [...mapa.values()];
  if (!out.some((x) => x.almacen === "AG07")) return { filas: out, error: "La ZEXI no trae materiales del almacén AG07." };
  return { filas: out };
}
