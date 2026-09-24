/* PERFIL — la otra pantalla densa que nunca se había abierto en el
   arnés. Tres secciones (cuenta, seguridad, preferencias) llenas de
   campos, interruptores y la rejilla de temas. */
import { createRoot } from "react-dom/client";
import { Perfil } from "@/app/(app)/perfil/Perfil";
import { MODULOS } from "@/modulos/registro";

createRoot(document.getElementById("r")!).render(
  <Perfil
    id="u1" usuario="cpavi" nombre="Cristian Pavi" rol="admin"
    bodega="CD38" turno="Mañana" moduloInicio="/sider"
    textoGrande={false} tema="oficial"
    ultimoIngreso="2026-09-08T13:42:00Z"
    modulos={MODULOS.filter((m) => m.activo)}
  />
);
