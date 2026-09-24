import { createRoot } from "react-dom/client";
import { Usuarios } from "@/app/(app)/admin/usuarios/Usuarios";
import { MODULOS } from "@/modulos/registro";

const gente = [
  { id:"1", usuario:"cpavi", nombre:"Cristian Pavi", rol:"admin", activo:true, clave_provisional:false, permisos_extra:null },
  { id:"2", usuario:"gvisbal", nombre:"Génesis Visbal", rol:"supervisor", activo:true, clave_provisional:true, permisos_extra:{"/sider/maestro":"editar"} },
  { id:"3", usuario:"jmoreno", nombre:"Jorge Moreno Barraza", rol:"operador", activo:true, clave_provisional:false, permisos_extra:{"/quiebra/diario":"ver","/sider/seguimiento":"ver"} },
  { id:"4", usuario:"lrodriguez", nombre:"Luisa Rodríguez", rol:"operador", activo:false, clave_provisional:false, permisos_extra:null },
];
const roles = [
  { clave:"admin", nombre:"Administrador", manda:true },
  { clave:"supervisor", nombre:"Supervisor de patio", manda:false },
  { clave:"operador", nombre:"Operador", manda:false },
];
const catalogo = MODULOS.filter(m=>m.activo).map(m=>({
  id:m.id, nombre:m.nombre, acento:m.acento,
  secciones:m.secciones.map(s=>({nombre:s.nombre, ruta:s.ruta})),
}));

createRoot(document.getElementById("r")!).render(
  <div className="rl us">
    <div className="cabeza">
      <div>
        <p className="ojo">PLATAFORMA · ADMINISTRACIÓN</p>
        <h1>Usuarios</h1>
        <p className="sub">Crear la cuenta, ponerle el rol y, si hace falta, darle una pantalla que su rol no incluye.</p>
      </div>
    </div>
    <Usuarios gente={gente as never[]} roles={roles} catalogo={catalogo} hayLlave={true} yo="1" />
  </div>
);
