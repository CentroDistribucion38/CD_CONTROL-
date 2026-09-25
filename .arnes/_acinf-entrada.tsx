
import { jsPDF } from "jspdf";
import { medir } from "../src/modulos/acciones/medir";
import { informePdf } from "../src/app/(app)/acciones/analisis/informe";

/* SE LE QUITA EL «GUARDAR» A jsPDF Y SE QUEDA CON LOS BYTES.
   `pdf.save()` dispara una descarga del navegador, y lo que hace
   falta aquí es el archivo. Interceptar `createObjectURL` no sirvió:
   jsPDF no pasa por ahí. El parche va al prototipo, que es el mismo
   objeto que usa el `await import("jspdf")` de dentro del informe. */
(jsPDF as any).API.save = function (this: any) {
  (window as any).__PDF__ = this.output("datauristring");
  return this;
};
(jsPDF as any).prototype.save = (jsPDF as any).API.save;
(window as any).__PARCHE__ = typeof (jsPDF as any).prototype.save;

const HOY = new Date("2026-09-24T12:00:00Z");
const DIA = 86400000;

/* EL AZAR VA CON SEMILLA FIJA, y no es un detalle.
   Con `Math.random()` cada corrida medía datos distintos: probando
   que el eje usa pasos legibles, una corrida daba 10 —que está en la
   lista— y pasaba aunque el código estuviera roto. Un arnés que
   contesta distinto en cada corrida no caza nada; lo que hace es dar
   confianza falsa. */
let semilla = 20260924;
const azar = () => {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
};

/* NOMBRES LARGOS Y CORTOS A PROPÓSITO: lo que revienta una tabla es el
   motivo de nueve palabras, no el de dos. */
const MOTIVOS = [
  ["orden", "Orden y aseo en pasillos de picking y zona de cargue"],
  ["estibas", "Estibas en mal estado"],
  ["senal", "Señalización borrada o ausente"],
  ["derrame", "Derrame de producto"],
  ["monta", "Falla mecánica del montacargas"],
];
const ZONAS = [["p1","Pasillo 1 · Picking"],["p2","Pasillo 2"],["car","Zona de cargue"]];
const GENTE = ["Genesis Visbal", "Andrés Palacio", "Cañizares", "CDARENOSA", "Administrador"];

/* 140 acciones repartidas en 90 días: es el orden de magnitud real, y
   con cuatro no se ve si las etiquetas del eje se pisan. */
const acciones = Array.from({ length: 140 }, (_, i) => {
  const reportada = HOY.getTime() - Math.floor(azar() * 90) * DIA;
  const cerrada = i % 4 === 0 ? null : reportada + (6 + azar() * 200) * 3600000;
  const verificada = cerrada && i % 3 === 0 ? cerrada + 48 * 3600000 : null;
  const [mc, mn] = MOTIVOS[i % MOTIVOS.length];
  const [zc, zn] = ZONAS[i % ZONAS.length];
  return {
    id: "a" + i, codigo: "AC-" + String(1000 + i), tipo: "correctiva",
    titulo: mn, descripcion: null,
    motivo: mc, motivo_nombre: mn, motivo_critico: false,
    area: "almacenamiento", area_nombre: "Almacenamiento",
    zona: zc, zona_nombre: zn, zona_proceso: null, ubicacion: null,
    lat: null, lng: null, precision_m: null,
    prioridad: (["alta","media","baja"] as const)[i % 3],
    plazo: null,
    vence_en: new Date(reportada + 72 * 3600000).toISOString(),
    estado: cerrada ? "cerrada" : "abierta",
    viva: !cerrada, vencida: !cerrada && i % 5 === 0,
    horas_restantes: 10, dias: 2,
    equipo: null, equipo_nombre: null,
    responsable: "u" + (i % GENTE.length), sin_dueno: false,
    reportada_por: "u1", reportada_en: new Date(reportada).toISOString(),
    asignada_en: new Date(reportada + 4 * 3600000).toISOString(),
    cerrada_en: cerrada ? new Date(cerrada).toISOString() : null,
    verificada_en: verificada ? new Date(verificada).toISOString() : null,
    efectiva: verificada ? i % 7 !== 0 : null,
    fotos: 0, que_se_hizo: null, cerrada_por: null, anulada_en: null,
  };
});

const nombres = Object.fromEntries(GENTE.map((n, i) => ["u" + i, n]));
const m = medir(acciones as any, HOY, 90, { aTiempo: 85, efectividad: 90 } as any, nombres);

(window as any).__MEDIDA__ = {
  semanas: m.semanas.length, pareto: m.pareto.length,
  responsables: m.responsables.length, repiten: m.reincidencia.repiten.length,
};
(window as any).__LISTO__ = informePdf(m as any, HOY).then(() => true);
