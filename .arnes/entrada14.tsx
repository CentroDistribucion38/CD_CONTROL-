/* LA BANDEJA DE NOVEDADES, con lo que la hace útil entre plantas:
   a quién le toca, cuántos días lleva, qué prometieron y el hilo. */
import { createRoot } from "react-dom/client";
import { Novedades } from "@/app/(app)/sider/novedades/Novedades";

const hoy = new Date();
const menos = (d: number) => {
  const x = new Date(hoy); x.setDate(x.getDate() - d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
};
const motivos = [
  { clave:"faltante", nombre:"Faltante de envase", tramo:"t1", tipo:"entrega", orden:20 },
  { clave:"sello_roto", nombre:"Sello roto", tramo:"t1", tipo:"viaje", orden:10 },
  { clave:"cliente_cerrado", nombre:"Cliente cerrado", tramo:"t2", tipo:"entrega", orden:10 },
  { clave:"varado", nombre:"Vehículo varado", tramo:null, tipo:"viaje", orden:80 },
];
const novedades = [
  { id:"n1", tramo:"t1", tipo:"entrega", motivo:"faltante", motivo_nombre:"Faltante de envase",
    viaje_id:"v1", placa:"JYN245", fecha:menos(9),
    descripcion:"Venían 400 estibas en la remisión y bajamos 360. Faltaron 40 de AGUILA 330.",
    foto_ruta:null, cd_responsable:"CD Galapa",
    compromiso:"Reponer 40 estibas", fecha_compromiso:menos(2),
    estado:"abierta", que_se_hizo:null, cerrada_por:null, cerrada_en:null,
    creada_por:"u1", creada_en:new Date().toISOString(),
    cd_origen:"CD Galapa", material:"AGUILA 330 RET", estado_viaje:"recibido",
    pegada_a_viaje:true, dias:9, vencida:true, respuestas:2 },
  { id:"n2", tramo:"t2", tipo:"entrega", motivo:"cliente_cerrado", motivo_nombre:"Cliente cerrado",
    viaje_id:null, placa:"SXT998", fecha:menos(1),
    descripcion:"Llegamos 6:10 pm a la tienda de la 45 y ya estaba cerrado.",
    foto_ruta:null, cd_responsable:"Ruta 12", compromiso:null, fecha_compromiso:null,
    estado:"abierta", que_se_hizo:null, cerrada_por:null, cerrada_en:null,
    creada_por:"u2", creada_en:new Date().toISOString(),
    cd_origen:null, material:null, estado_viaje:null,
    pegada_a_viaje:false, dias:1, vencida:false, respuestas:0 },
  { id:"n3", tramo:"t1", tipo:"viaje", motivo:"sello_roto", motivo_nombre:"Sello roto",
    viaje_id:"v3", placa:"KLM110", fecha:menos(20),
    descripcion:"El sello de la puerta izquierda venía roto.", foto_ruta:null,
    cd_responsable:"CD Santa Marta", compromiso:null, fecha_compromiso:null,
    estado:"cerrada", que_se_hizo:"Se revisó con el conductor: el sello se rompió al abrir en báscula. Sin faltante.",
    cerrada_por:"u1", cerrada_en:new Date().toISOString(),
    creada_por:"u2", creada_en:new Date().toISOString(),
    cd_origen:"CD Santa Marta", material:"PONY MALTA 330", estado_viaje:"recibido",
    pegada_a_viaje:true, dias:3, vencida:false, respuestas:1 },
];
const hilo = [
  { id:"h1", novedad_id:"n1", texto:"Revisamos el despacho: de aquí salieron 400 completas, con foto de la báscula.", desde:"CD Galapa", escrita_por:"u3", escrita_en:new Date().toISOString() },
  { id:"h2", novedad_id:"n1", texto:"No alcanzamos el jueves. Va el lunes con el viaje de la mañana.", desde:"CD Galapa", escrita_por:"u3", escrita_en:new Date().toISOString() },
  { id:"h3", novedad_id:"n3", texto:"Confirmado con báscula, sin faltante.", desde:"CD Santa Marta", escrita_por:"u3", escrita_en:new Date().toISOString() },
];
createRoot(document.getElementById("r")!).render(
  <div className="sd">
    <Novedades novedades={novedades as never[]} motivos={motivos as never[]}
      viajes={[{id:"v9",placa:"TRQ551",cd_origen:"CD Turbaco",descripcion:"AGUILA 330 RET"}]}
      hilo={hilo as never[]}
      nombres={{u1:"Cristian Pavi", u2:"Génesis Visbal", u3:"Jorge Moreno"}}
      puedeEditar miBodega="CD38 — Barranquilla" />
  </div>
);
