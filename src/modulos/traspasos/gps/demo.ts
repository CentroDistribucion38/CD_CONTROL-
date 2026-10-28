import { distanciaM, centro, type Punto } from "./geo";
import { procesarPosiciones, type EstadoVehiculo, type Posicion, type Zona } from "./motor";
import type { Instantanea, VehiculoVivo, VisitaGps } from "./tipos";

/**
 * MODO DEMO: vehículos simulados que van de zona en zona, para ver el mapa funcionando antes de
 * conectar Traccar. Pasa por EL MISMO motor que los datos reales (entradas, salidas y tránsito),
 * solo que el reloj corre más rápido. Nada de esto se guarda en la base.
 * Las zonas de ejemplo están puestas en Barranquilla a ojo: las verdaderas se dibujan o se traen de Traccar.
 */
const C: Punto = [10.9878, -74.7869];
const rect = (dLat: number, dLng: number, h: number, w: number): Punto[] => [[C[0] + dLat, C[1] + dLng], [C[0] + dLat, C[1] + dLng + w], [C[0] + dLat - h, C[1] + dLng + w], [C[0] + dLat - h, C[1] + dLng]];

export const ZONAS_DEMO: Zona[] = [
  { id: "demo-fabrica", nombre: "Fábrica", color: "#1d9bd1", poligono: rect(0.0017, -0.0030, 0.0017, 0.0030) },
  { id: "demo-arenosa", nombre: "Arenosa", color: "#e08a1e", poligono: rect(0.0015, 0.0008, 0.0018, 0.0022) },
  { id: "demo-bodega", nombre: "Bodega 38", color: "#2fa66a", poligono: rect(-0.0014, 0.0008, 0.0022, 0.0026) },
  { id: "demo-export", nombre: "Exportación", color: "#8a5cd0", poligono: rect(-0.0012, -0.0031, 0.0005, 0.0005) },
];

type Sim = {
  id: number; placa: string; ruta: number[]; paso: number;
  fase: "dentro" | "viaje"; desde: number; hasta: number; origen: Punto; destino: Punto; punto: Punto;
};

const SIM_POR_TICK = 20_000;      // cada segundo real avanza 20 s de reloj simulado
const alea = (a: number, b: number) => a + Math.random() * (b - a);
const dentroDe = (z: Zona): Punto => {
  const c = centro(z.poligono);
  const ls = z.poligono.map((p) => p[0]), gs = z.poligono.map((p) => p[1]);
  return [c[0] + alea(-0.3, 0.3) * (Math.max(...ls) - Math.min(...ls)), c[1] + alea(-0.3, 0.3) * (Math.max(...gs) - Math.min(...gs))];
};

export class Demo {
  zonas: Zona[];
  reloj: number;
  private sims: Sim[];
  private estados = new Map<number, EstadoVehiculo & { lat: number; lng: number; velocidad: number | null; rumbo: number | null }>();
  private visitas: VisitaGps[] = [];
  private abiertas = new Map<string, VisitaGps>();
  private n = 0;

  constructor(zonas: Zona[] = ZONAS_DEMO, inicio = Date.now() - 2 * 3600_000) {
    this.zonas = zonas;
    this.reloj = inicio;
    const rutas = [[0, 2, 1, 2], [1, 2, 0, 2], [0, 1, 2], [2, 0, 2, 1], [3, 2, 3], [0, 2], [1, 0, 2, 1, 2]].map((r) => r.map((i) => i % zonas.length));
    const placas = ["GXP 418", "TJH 092", "NBR 735", "KLM 260", "WQE 861", "RTY 144", "ZAB 507"];
    this.sims = rutas.map((ruta, i) => {
      const p = dentroDe(zonas[ruta[0]]);
      return { id: i + 1, placa: placas[i], ruta, paso: 0, fase: "dentro" as const, desde: inicio + i * 4 * 60_000, hasta: inicio + i * 4 * 60_000 + alea(6, 18) * 60_000, origen: p, destino: p, punto: p };
    });
    /* Calentamiento: dos horas de historia para que el mapa y las tablas ya tengan datos. */
    while (this.reloj < Date.now()) this.avanzar();
  }

  /** Avanza un paso de reloj simulado y devuelve lo que se ve. */
  avanzar(): Instantanea {
    this.reloj += SIM_POR_TICK;
    const pos: Posicion[] = [];
    for (const s of this.sims) {
      if (s.fase === "dentro" && this.reloj >= s.hasta) {
        const sig = this.zonas[s.ruta[(s.paso + 1) % s.ruta.length]];
        s.fase = "viaje"; s.origen = s.punto; s.destino = dentroDe(sig);
        s.desde = this.reloj;
        /* Entre portería, báscula y calle un tránsito real tarda minutos aunque las zonas estén a unos cientos de metros. */
        s.hasta = this.reloj + Math.max(3 * 60_000, alea(3, 8) * 60_000 + distanciaM(s.origen, s.destino) * 20);
      } else if (s.fase === "viaje" && this.reloj >= s.hasta) {
        s.paso++; s.fase = "dentro"; s.punto = s.destino;
        s.desde = this.reloj; s.hasta = this.reloj + alea(6, 22) * 60_000;
      }
      let p = s.punto, vel = 0;
      if (s.fase === "viaje") {
        const k = Math.min(1, (this.reloj - s.desde) / Math.max(1, s.hasta - s.desde));
        p = [s.origen[0] + (s.destino[0] - s.origen[0]) * k, s.origen[1] + (s.destino[1] - s.origen[1]) * k];
        s.punto = s.fase === "viaje" ? p : s.punto;
        vel = alea(18, 32);
      } else {
        const j: Punto = [s.punto[0] + alea(-0.00003, 0.00003), s.punto[1] + alea(-0.00003, 0.00003)];
        p = j; vel = alea(0, 4);
      }
      const rumbo = (Math.atan2(s.destino[1] - s.origen[1], s.destino[0] - s.origen[0]) * 180) / Math.PI;
      pos.push({ vehiculo: s.id, lat: p[0], lng: p[1], en: new Date(this.reloj).toISOString(), velocidad: vel, rumbo: (90 - rumbo + 360) % 360 });
    }
    const { eventos, estados } = procesarPosiciones(this.zonas, [...this.estados.values()], pos);
    this.estados = estados;
    for (const e of eventos) {
      const k = e.vehiculo + "|" + e.zonaId;
      if (e.tipo === "entra") {
        const v: VisitaGps = { id: "d" + ++this.n, vehiculo: String(e.vehiculo), zona: e.zonaId, entrada: e.en, salida: null };
        this.visitas.push(v); this.abiertas.set(k, v);
      } else {
        const v = this.abiertas.get(k);
        if (v) { v.salida = e.en; this.abiertas.delete(k) }
      }
    }
    return this.foto();
  }

  foto(): Instantanea {
    const vehiculos: VehiculoVivo[] = this.sims.map((s) => {
      const e = this.estados.get(s.id);
      return { id: String(s.id), nombre: s.placa, placa: s.placa, lat: e?.lat ?? s.punto[0], lng: e?.lng ?? s.punto[1], velocidad: e?.velocidad ?? 0, rumbo: e?.rumbo ?? 0, fixEn: e?.fixEn ?? new Date(this.reloj).toISOString(), zonaId: e?.zonaId ?? null };
    });
    return { zonas: this.zonas, vehiculos, visitas: this.visitas.map((v) => ({ ...v })), ahora: new Date(this.reloj).toISOString(), demo: true };
  }
}
