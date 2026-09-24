/**
 * EL MENSAJE DE CUANDO FALTA CORRER EL SQL.
 *
 * DICE QUÉ ARCHIVO, no «error». Quien llega aquí puede arreglarlo en
 * dos minutos si sabe cuál es; con un «relation does not exist» se
 * queda esperando a que alguien más lo mire.
 */
export function SinAbi() {
  return (
    <section className="sin-tablas">
      <h2>Falta crear la rama de ABI en Supabase</h2>
      <p>
        Abre el editor de SQL y ejecuta{" "}
        <code>supabase/migraciones/2026-09-acciones-abi-hallazgos.sql</code>. Crea la tabla de
        hallazgos, la de sus evidencias, el maestro de temas y las funciones. Se puede correr
        varias veces sin romper nada.
      </p>
      <p>
        Después, en <b>Administración → Roles</b>, abre <code>/acciones/abi</code> para quien
        audita: la rama nace cerrada a propósito — una pantalla nueva que nace abierta es un
        permiso que nadie decidió dar.
      </p>
    </section>
  );
}
