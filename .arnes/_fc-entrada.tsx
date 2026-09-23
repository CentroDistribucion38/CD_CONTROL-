import { createRoot } from "react-dom/client";
import { Bandeja } from "../src/app/(app)/traspasos/facturacion/Bandeja";

/* UN VIAJE POR FACTURAR. Los tres de abajo se diferencian en una sola
   cosa —cuánto vidrio tiene su placa esperando— porque eso es lo único
   que esta prueba mide. */
const viaje = (id: string, placa: string) => ({
  id, codigo: "TP-" + id, fecha: "2026-09-21", turno: "B", turno_orden: 2,
  tipo: "casco_vidrio", tipo_nombre: "Casco vidrio",
  placa, documento: null, sin_documento: true,
  origen: "cd38", origen_nombre: "CD38", destino: "peldar", destino_nombre: "Peldar",
  origen_suelto: false, destino_suelto: false, viajes: 1, vacio: false, carga: 36, unidad: "estibas",
  nota: null, hora: "2026-09-21T15:20:00Z", registrado_por: "u1", registrado_en: "2026-09-21T15:20:00Z",
  dias_atras: 0, atrasado: false, ediciones: 0, editado_en: null, editado_por: null,
  estado: "registrado", vale: true, motivo_anulacion: null, anulado_en: null, anulado_por: null,
  factura_documento: null, salida_en: null, salida_por: null, salida_nombre: null,
  salida_historica: false, por_facturar: true,
}) as any;

const ced = (id: string, cedula: string, placa: string, tolvas: number, dias = 0) =>
  ({ id, cedula, placa, tolvas, neto_kg: tolvas * 789.5, observacion: null, dias_esperando: dias });

/* TRES CASOS EN LA MISMA PANTALLA, que es como se ve de verdad:
     SIN01  la placa no tiene vidrio  → no se pinta nada del vidrio
     UNA11  tiene UNA cédula          → viene escogida, sin desplegable
     DOS22  tiene DOS                 → desplegable, y ninguna escogida

   Y LA PLACA DE «UNA11» VIENE ESCRITA DISTINTO EN LOS DOS LADOS —«UNA
   11» en la cédula, «UNA-11» en el viaje— a propósito: si el agrupado
   no normaliza, ese Vh sale sin su vidrio y nadie se entera. */
/* Y UNA CUARTA PLACA: la que tiene el vidrio TODAVÍA EN LA BÁSCULA.
   «Creé un pesaje en salida y no lo veo en traspasos.» Es el caso en
   que la pantalla se quedaba muda: no hay cédula porque el pesaje no se
   ha cerrado, y sin aviso parece que la función no sirve. */
const bascula = (id: string, cedula: string, placa: string, tolvas: number, horas = 0) =>
  ({ id, cedula, placa, tolvas, neto_kg: tolvas * 812.3, observacion: null, horas_abierta: horas });

createRoot(document.getElementById("r")!).render(
  <Bandeja
    pendientes={[viaje("1", "SIN01"), viaje("2", "UNA-11"), viaje("3", "DOS22"),
                 viaje("4", "BAS44"), viaje("5", "YA-55")]}
    salieron={[]}
    nombres={{ u1: "Santiago Leal" }}
    cedulas={{
      UNA11: [ced("c1", "SR-0041", "UNA 11", 4, 3)],
      DOS22: [ced("c2", "SR-0042", "DOS22", 2), ced("c3", "SR-0043", "DOS22", 5, 9)],
    }}
    bascula={{ BAS44: [bascula("b1", "SR-0044", "BAS44", 2, 5)] }}
    /* Y EL QUINTO: el que YA trae su cédula del registro. Facturación no
       escoge ni cuenta; solo pone el documento. */
    reservadas={{ "5": ced("r1", "SR-0046", "YA-55", 3) } as any}
    puedeConfirmar puedeReabrir={false} />);
