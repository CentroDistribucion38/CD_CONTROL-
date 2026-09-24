
import { createRoot } from "react-dom/client";
import { Maestro } from "../src/app/(app)/acciones/maestro/Maestro";
import { QuienRecibe } from "../src/app/(app)/acciones/maestro/QuienRecibe";

const areas = [
  { clave: "almacenamiento", nombre: "Almacenamiento", activo: true },
  { clave: "despacho", nombre: "Despacho", activo: true },
];
/* UNA CON HISTÓRICO Y CINCO SIN ÉL, a propósito: con todas iguales,
   «solo las que nadie ha usado ofrecen casilla» pasaría sin probar
   nada. */
const zonas = [
  { codigo: "AG01-PAS-01", nombre: "Pasillo 1", proceso: "Picking",
    area: "almacenamiento", activo: true, lat: null, lng: null, orden: 1 },
  { codigo: "AG01-PAS-02", nombre: "Pasillo 2", proceso: "Picking",
    area: "almacenamiento", activo: true, lat: null, lng: null, orden: 2 },
  { codigo: "AG01-PAS-04", nombre: "Pasillo 4", proceso: "Picking",
    area: "almacenamiento", activo: true, lat: null, lng: null, orden: 3 },
  { codigo: "AG01-CAR-01", nombre: "Pasillo de cargue", proceso: "Cargue",
    area: "despacho", activo: true, lat: null, lng: null, orden: 4 },
  { codigo: "AG01-CAR-02", nombre: "Zona de cargue", proceso: "Cargue",
    area: "despacho", activo: true, lat: null, lng: null, orden: 5 },
  { codigo: "AG01-DEV-01", nombre: "Zona de envase", proceso: "Quiebra",
    area: "despacho", activo: false, lat: null, lng: null, orden: 6 },
];
const motivos = [
  { clave: "orden", nombre: "Orden y aseo", area: "almacenamiento", critico: false, activo: true },
];

/* VEINTE PERSONAS: es lo que tiene el centro de verdad, y es el número
   con el que la lista de una columna se volvía tres pantallazos. */
const gente = Array.from({ length: 20 }, (_, i) => ({
  id: "u" + i,
  usuario: ["admin", "abi", "operador", "inventario", "t2"][i % 5] + i,
  nombre: ["Administrador", "Andrespalacio", "ARENOSA", "Cañizares", "CDARENOSA"][i % 5] + " " + i,
  rol: ["admin", "abi", "operador", "inventario", "t2"][i % 5],
  recibe: i === 3 || i === 11,
}));

createRoot(document.getElementById("r")!).render(
  <>
    <Maestro zonas={zonas as any} motivos={motivos as any} areas={areas as any}
             equipos={[]} uso={{ zonas: { "AG01-PAS-01": 1 }, motivos: {}, equipos: {} } as any}
             puedeEditar />
    <QuienRecibe gente={gente as any} todos={false} falta={false} puedeEditar />
  </>);
