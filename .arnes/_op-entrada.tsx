
import { createRoot } from "react-dom/client";
import { Operarios } from "../src/app/(app)/roturas/Operarios";

/* Doce para que salga el buscador —aparece pasando de ocho— y para que
   «cuántos no han reportado nada» mida algo. Uno apagado, y uno con
   roturas encima para el caso de «este no se puede borrar». */
const lista = [
  ["o1","4021","Genesis Visbal","Easy","B",true,null,37],
  ["o2","5510","Jose Palacio","Easy","A",true,null,12],
  ["o3","6677","Marta Ospino","Easy",null,true,null,0],
  ["o4","7781","Luis Carrillo","Easy","C",true,"Entro en septiembre",0],
  ["o5","8890","Andrea Mejia","Easy","A",true,null,4],
  ["o6","1123","Pedro Nieto","Easy","B",true,null,0],
  ["o7","2234","Sandra Gil","Easy","C",true,null,9],
  ["o8","3345","Ivan Robles","Easy","A",true,null,1],
  ["o9","4456","Carmen Daza","Easy","B",true,null,0],
  ["o10","5567","Hector Pava","Easy","C",true,null,2],
  ["o11","6678","Nubia Fontalvo","Easy","A",false,"Ya no esta",8],
  ["o12","7789","Oscar Bermudez","Easy","B",true,null,0],
].map(([id,pin,nombre,empresa,turno,activo,nota,roturas]: any) =>
  ({ id, pin, nombre, empresa, turno, activo, nota, roturas }));

createRoot(document.getElementById("r")!).render(
  <Operarios lista={lista as any} puedeEditar />);
