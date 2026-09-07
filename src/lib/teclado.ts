/**
 * Navegación de formularios con el teclado, sin mouse.
 *
 *   Enter  → pasa al campo siguiente (en el último, envía el formulario)
 *   ↓      → campo siguiente
 *   ↑      → campo anterior
 *
 * Pensado también para lectores de código de barras: casi todos mandan un
 * Enter al terminar el escaneo, así que el cursor salta solo al siguiente campo.
 *
 * Uso:  <form onKeyDown={avanzarConTeclado} ...>
 */
export function avanzarConTeclado(e: React.KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

  const objetivo = e.target as HTMLElement;
  const esCampo =
    objetivo instanceof HTMLInputElement ||
    objetivo instanceof HTMLSelectElement ||
    objetivo instanceof HTMLTextAreaElement;
  if (!esCampo) return;

  // En un textarea, Enter y las flechas son para escribir y moverse dentro.
  if (objetivo instanceof HTMLTextAreaElement) return;

  // En un select, las flechas cambian la opción: no las robamos.
  if (objetivo instanceof HTMLSelectElement && e.key !== "Enter") return;

  const campos = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      "input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])"
    )
  );

  const actual = campos.indexOf(objetivo);
  if (actual === -1) return;

  const destino =
    e.key === "ArrowUp" ? campos[actual - 1] : campos[actual + 1];

  // Enter en el último campo: no hacemos nada y el formulario se envía.
  if (!destino) return;

  e.preventDefault();
  destino.focus();
  if (destino instanceof HTMLInputElement && destino.type !== "checkbox") {
    destino.select();
  }
}
