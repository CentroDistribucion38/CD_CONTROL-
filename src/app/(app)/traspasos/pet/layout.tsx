import { misPermisos } from "@/lib/permisos";
import "../traspasos.css";

/**
 * PET, POR AHORA, ES SOLO DEL SUPER ADMINISTRADOR. «Por ahora que ese módulo solo lo vean los super admin.»
 * El menú no se lo muestra a nadie más (registro: soloManda en la sección); esto cierra además la entrada por
 * dirección (un enlace guardado, «Programar PET» viejo).
 */
export default async function LayoutPet({ children }: { children: React.ReactNode }) {
  const permisos = await misPermisos();
  if (!permisos.manda) {
    return (
      <div className="tp">
        <section className="cabeza"><div><p className="ojo">TRASPASOS · PET</p><h1>Sin acceso</h1>
          <p className="sub">PET por ahora es solo para el <b>super administrador</b>.</p></div></section>
      </div>
    );
  }
  return children;
}
