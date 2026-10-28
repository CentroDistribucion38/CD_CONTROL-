import type { Zona } from "./motor";

/** Un vehículo tal como se ve ahora en el mapa. */
export type VehiculoVivo = {
  id: string; nombre: string; placa: string | null;
  lat: number; lng: number; velocidad: number | null; rumbo: number | null;
  fixEn: string; zonaId: string | null;
};
/** Una entrada a una zona (salida vacía = sigue adentro). `zona` es el id de la zona. */
export type VisitaGps = { id: string; vehiculo: string; zona: string; entrada: string; salida: string | null };
/** Todo lo que pinta la pantalla en un momento, venga de Traccar o del modo demo. */
export type Instantanea = { zonas: Zona[]; vehiculos: VehiculoVivo[]; visitas: VisitaGps[]; ahora: string; demo: boolean };

export const COLORES_ZONA = ["#1d9bd1", "#2fa66a", "#e08a1e", "#8a5cd0", "#d64550", "#14a3a3", "#c2a100", "#5a6b7b"];
