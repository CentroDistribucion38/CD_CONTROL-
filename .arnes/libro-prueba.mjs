import { register } from "node:module";
import fs from "node:fs";
// Se compila el TS con esbuild y se corre: es la misma función que usa la
// ruta, con datos de prueba, para poder ABRIR el archivo y ver si quedó.
import { build } from "esbuild";
await build({
  entryPoints: ["src/modulos/acciones/libro.ts"],
  bundle: true, platform: "node", format: "esm", outfile: ".arnes/libro.mjs",
  external: ["exceljs"],
});
const { armarLibro } = await import("../.arnes/libro.mjs");

const ahora = Date.now();
const h = (n) => new Date(ahora + n * 3600e3).toISOString();
const mk = (i, o) => ({
  id: `id-${i}`, codigo: `AC-${String(i).padStart(4,"0")}`, tipo: "correctiva",
  titulo: "Estibas mal apiladas en el pasillo de picking 3", descripcion: null,
  motivo: "apilado_incorrecto", motivo_nombre: "Apilado incorrecto", motivo_critico: false,
  area: "almacenamiento", area_nombre: "Almacenamiento",
  zona: "AG01-PAS-03", zona_nombre: "Pasillo 3", zona_proceso: "Picking", ubicacion: null,
  lat: 10.9878, lng: -74.8102, precision_m: 6,
  prioridad: "alta", plazo: "48 horas", vence_en: h(-72), estado: "abierta",
  viva: true, vencida: true, horas_restantes: -72, dias: 6,
  responsable: "u1", asignada_por: "u2", asignada_en: h(-90),
  reportada_por: "u2", reportada_en: h(-120),
  que_se_hizo: null, cerrada_por: null, cerrada_en: null,
  efectiva: null, nota_verificacion: null, verificada_por: null, verificada_en: null,
  auto_verificada: false, causa_raiz: null, responsable_proceso: null,
  comentarios: 0, fotos: 2, origenes: 0, veces_aqui: 3, ...o,
});

const acciones = [
  mk(147),
  mk(145, { titulo: "Envase sin separar por clase en el muelle 2", motivo: "envase_sin_separar",
            motivo_nombre: "Envase sin separar", area: "quiebra", area_nombre: "Quiebra",
            zona: "AG01-MUE-02", zona_nombre: "Muelle 2", horas_restantes: -36, veces_aqui: 1 }),
  mk(139, { estado: "verificada", viva: false, vencida: false, efectiva: true,
            que_se_hizo: "Se reapilo y se marco el piso", cerrada_por: "u1", cerrada_en: h(-40),
            verificada_por: "u2", verificada_en: h(-20), horas_restantes: 0, veces_aqui: 2 }),
  mk(131, { estado: "cerrada", viva: false, vencida: false, prioridad: "media", plazo: "7 días",
            que_se_hizo: "Se repinto la demarcacion", cerrada_por: "u1", cerrada_en: h(-6),
            horas_restantes: 40, veces_aqui: 1, fotos: 1 }),
];
const areas = [
  { area: "recibo", area_nombre: "Recibo", orden: 1, total: 4, abiertas: 0, vencidas: 0, verificadas: 4, efectivas: 4, pct: 100 },
  { area: "almacenamiento", area_nombre: "Almacenamiento", orden: 2, total: 9, abiertas: 8, vencidas: 3, verificadas: 5, efectivas: 2, pct: 40 },
  { area: "quiebra", area_nombre: "Quiebra", orden: 3, total: 2, abiertas: 2, vencidas: 1, verificadas: 0, efectivas: 0, pct: null },
];
const buf = await armarLibro({
  acciones, areas, nombres: { u1: "M. Barrios", u2: "G. Visbal" }, meta: 90, tope: 3,
});
fs.writeFileSync(".arnes/acciones-prueba.xlsx", Buffer.from(buf));
console.log("escrito", fs.statSync(".arnes/acciones-prueba.xlsx").size, "bytes");
