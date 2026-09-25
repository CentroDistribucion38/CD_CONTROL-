
import { createRoot } from "react-dom/client";
import { EnSitio } from "../src/app/(app)/roturas/en-sitio/EnSitio";

const materiales = [
  { clave: "EER-AMBAR", nombre: "Envase retornable ámbar", tipo: "eer", color: "ambar", botellas_x_empaque: null, familia: "Ret", en_sitio: true, activo: true, orden: 1 },
  { clave: "EER-FLINT", nombre: "Envase retornable flint", tipo: "eer", color: "flint", botellas_x_empaque: null, familia: "Ret", en_sitio: true, activo: true, orden: 2 },
  { clave: "EER-GREEN", nombre: "Envase retornable green", tipo: "eer", color: "green", botellas_x_empaque: null, familia: "Ret", en_sitio: false, activo: true, orden: 3 },
  /* DOS ÁMBAR A PROPÓSITO. Es el caso que obliga a que EER tenga su
     desplegable: con uno solo, la base puede traducir color → material
     sin equivocarse; con dos, escoge uno EN SILENCIO y el informe del
     mes reparte el vidrio en el formato que no era. */
  { clave: "EER-AMBAR-750", nombre: "Envase retornable ámbar 750", tipo: "eer", color: "ambar", botellas_x_empaque: null, familia: "Ret", en_sitio: false, activo: true, orden: 4 },
  { clave: "PT-COST-330", nombre: "Cerveza Costeña 330 ml", tipo: "producto_terminado", color: null, botellas_x_empaque: 30, familia: "Ret", en_sitio: true, activo: true, orden: 11 },
  /* UNA LATA, UN PET Y UNO SIN FAMILIA. Sin ellos, «en producto no
     sale ni PET ni lata» pasaría sin probar nada — y el de la familia
     nula comprueba lo contrario: que un dato que falta NO esconde el
     material. */
  { clave: "PT-LATA-330", nombre: "Costeña Lta 330cc X 24", tipo: "producto_terminado", color: null, botellas_x_empaque: 24, familia: "Lata", en_sitio: false, activo: true, orden: 13 },
  { clave: "PT-PET-600", nombre: "Pony Malta Pet 600cc X 12", tipo: "producto_terminado", color: null, botellas_x_empaque: 12, familia: "Pet", en_sitio: false, activo: true, orden: 14 },
  /* CON MAYÚSCULAS Y ESPACIOS: el maestro lo escribe «Lata», pero el
     día que alguien lo cargue como « LATA » el filtro tiene que seguir
     funcionando. */
  { clave: "PT-LATA-269", nombre: "Aguila Lta 269cc X 30", tipo: "producto_terminado", color: null, botellas_x_empaque: 30, familia: " LATA ", en_sitio: false, activo: true, orden: 15 },
  { clave: "PT-SIN-FAM", nombre: "Producto sin familia puesta", tipo: "producto_terminado", color: null, botellas_x_empaque: 20, familia: null, en_sitio: false, activo: true, orden: 16 },
  /* Y DOS DE PRODUCTO TERMINADO, para que «no deja seguir sin escoger
     material» siga midiendo algo: con uno solo vendría puesto y la
     comprobación pasaría sola. */
  { clave: "PT-COST-175", nombre: "Envase Costeña 175R", tipo: "producto_terminado", color: null, botellas_x_empaque: 24, familia: "Tw", en_sitio: true, activo: true, orden: 12 },
  /* Y CIEN MÁS, porque el maestro de inventario trae 494 y un
     desplegable de siete no prueba lo que pasa con 494. */
  ...Array.from({ length: 100 }, (_, i) => ({
    clave: "PT-" + (2000 + i), nombre: "Aguila Cero Lta 355Cc X " + (i + 1),
    tipo: "producto_terminado", color: null, botellas_x_empaque: 24,
    /* LOS CIEN NO ESTÁN MARCADOS: son el «resto del maestro» que
       tiene que salir al escribir y NO de entrada. */
    familia: "Tw", en_sitio: false, activo: true, orden: 100 + i,
  })),
];
/* LOS ENVASES SIN COLOR: es como llega el maestro de inventario el
   primer día —el SQL no puede adivinar de qué color es cada vidrio— y
   es el caso que dejaba el desplegable de EER vacío y el registro
   trabado. */
const sinColor = materiales.map((m: any) =>
  m.tipo === "eer" ? { ...m, color: null } : m);
const procesos = [
  { clave: "lineas", nombre: "Líneas", activo: true, orden: 1 },
  { clave: "t1", nombre: "T1", activo: true, orden: 2 },
  { clave: "traspaso", nombre: "Traspaso", activo: true, orden: 3 },
  { clave: "maquila", nombre: "Maquila", activo: true, orden: 4 },
  { clave: "sorting", nombre: "Sorting", activo: true, orden: 5 },
  { clave: "sin_identificar", nombre: "Sin identificar", activo: true, orden: 6 },
  { clave: "otro", nombre: "Otro", activo: true, orden: 9 },
];
/* Las trece del maestro, en el orden del maestro. */
const areas = [
  ["bahias_t1","Bahías T1",1],["tandem_lineas","Tándem Líneas",2],["traspasos","Traspasos",3],
  ["maquila","Maquila",4],["antiguo_patio_t2","Antiguo Patio T2",5],["sorting","Sorting",6],
  ["plazoleta","Plazoleta",7],["calle_a","Calle A",10],["calle_b","Calle B",11],
  ["calle_c","Calle C",12],["calle_d","Calle D",13],["calle_e","Calle E",14],
  ["estanteria","Estantería",20],
].map(([clave, nombre, orden]: any) => ({ clave, nombre, activo: true, orden }));
/* Las siete que se pidieron: cinco asumidas y dos no. */
const causas = [
  ["estibas_malas","Estibas en mal estado","asumida",false,1],
  ["mal_arrumado","Módulo mal arrumado","asumida",false,2],
  ["condiciones","Condiciones del sitio","asumida",false,3],
  ["comportamiento","Comportamiento del personal","asumida",false,4],
  ["falla_montacarga","Falla mecánica del montacargas","asumida",false,5],
  ["falla_maquinas","Falla de las máquinas","no_asumida",true,10],
  ["falla_depa","Falla del pallet DEPA","no_asumida",true,11],
].map(([clave, nombre, grupo, exige_foto, orden]: any) =>
  ({ clave, nombre, grupo, exige_foto, activo: true, orden }));

const roturas = [1, 2, 3].map((i) => ({
  id: "r" + i, codigo: "RB-000" + i, material: "EER-AMBAR",
  material_nombre: "Envase retornable ámbar", tipo: "eer", color: "ambar",
  unidades: i * 4, contaminadas: null, botellas: null,
  unidades_liquido: 0, unidades_vidrio: i * 4,
  proceso: "lineas", proceso_nombre: "Líneas",
  area: "plazoleta", area_nombre: "Plazoleta",
  causa: "estibas_malas", causa_nombre: "Estibas en mal estado",
  grupo: "asumida", exige_foto: false, descripcion: null,
  lat: null, lng: null, precision_m: null,
  estado: "esperando", esperando: true, cuenta: false,
  reportada_por: "u1", reportada_en: "2026-09-23T12:00:00Z",
  decidida_por: null, decidida_en: null, nota_decision: null,
  fotos: 0, le_falta_foto: false, minutos: 30,
}));

createRoot(document.getElementById("r")!).render(
  <EnSitio esperando={3} roturas={roturas as any} nombres={{ u1: "Genesis Visbal" }}
           materiales={((window as any).SINCOLOR ? sinColor : materiales) as any}
           materialesDe={(window as any).DE ?? "inventario"}
           procesos={procesos as any}
           areas={areas as any} causas={causas as any} puedeEditar />);
