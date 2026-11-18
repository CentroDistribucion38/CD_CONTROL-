import { misPermisos } from "@/lib/permisos";
import "./cinco-s.css";

/**
 * 5S ES SOLO DEL SUPER ADMINISTRADOR. «Que nadie que no sea super admin pueda ver lo de 5S.»
 * El menú ya no lo muestra a nadie más (registro: soloManda) y la base tampoco le entrega nada (RLS con manda());
 * esto cierra además la entrada por dirección (un enlace guardado, el informe de una inspección).
 */
export default async function Layout5S({ children }: { children: React.ReactNode }) {
  const permisos = await misPermisos();
  if (!permisos.manda) {
    return (
      <div className="s5">
        <header className="s5-cab"><div><p className="s5-ojo">5S · ORDEN Y ASEO</p><h1>Sin acceso</h1></div></header>
        <p className="s5-vacio">El módulo 5S es solo para el <b>super administrador</b>.</p>
      </div>
    );
  }
  return children;
}
