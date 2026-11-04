import { redirect } from "next/navigation";

/* EL MODO FISCAL YA NO ES UNA PANTALLA DEL MENÚ: se abre como cuadro con el PIN desde Administración
   (ver ModoFiscal.tsx). Esta dirección solo devuelve a Administración. */
export default function ModoFiscalPage() {
  redirect("/admin/inicio");
}
