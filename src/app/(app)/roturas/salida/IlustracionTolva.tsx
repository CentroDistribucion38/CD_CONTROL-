/**
 * LA TOLVA, DIBUJADA.
 *
 * Va en la tarjeta de "cómo se mide" y no es adorno: quien llega nuevo a
 * la báscula tiene que entender de un vistazo que los 111 kg son el
 * RECIPIENTE, no el vidrio. Una frase lo explica; el dibujo con su cota
 * al lado lo hace obvio.
 *
 * Es SVG y no una foto a propósito: pesa dos kilobytes, se ve nítida en
 * cualquier pantalla, y el oro sale del mismo token del módulo, así que
 * el día que cambie el acento la tolva cambia con él.
 *
 * VA NIVELADA. El primer intento la dibujó sobre un riel inclinado y
 * parecía rodando cuesta abajo — que es exactamente lo que uno no quiere
 * ver al lado de la palabra "báscula". Una tolva que se pesa está
 * quieta y en horizontal.
 *
 * No lleva marca ni logo de nadie. Es una tolva genérica: la forma del
 * recipiente, que es lo único que hay que reconocer.
 */
export function IlustracionTolva() {
  return (
    <svg viewBox="0 0 380 250" role="img"
         aria-label="Una tolva vacía sobre el riel, con su tara señalada al lado">
      <defs>
        {/* El rayado del riel. Sin él, el piso es una barra gris y la
            tolva parece flotando. */}
        <pattern id="rt-riel" width="11" height="11" patternUnits="userSpaceOnUse"
                 patternTransform="rotate(45)">
          <rect width="11" height="11" fill="#EAEAE6" />
          <line x1="0" y1="0" x2="0" y2="11" stroke="#C4C4BE" strokeWidth="4" />
        </pattern>
        {/* El costado: claro arriba, hondo abajo. Es lo que hace que una
            silueta plana se lea como una lámina metálica. */}
        <linearGradient id="rt-cara" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD23F" />
          <stop offset="1" stopColor="#DFA200" />
        </linearGradient>
      </defs>

      {/* El riel, horizontal */}
      <path d="M14 214 L300 214 L330 232 L44 232 Z" fill="url(#rt-riel)" />
      <path d="M14 214 L300 214" stroke="#A8A8A2" strokeWidth="1.5" fill="none" />

      {/* La sombra bajo el bastidor */}
      <ellipse cx="176" cy="212" rx="104" ry="9" fill="#000" opacity=".12" />

      {/* EL CUERPO: se abre hacia arriba. Es la forma por la que se
          reconoce una tolva y no un cajón. */}
      <path d="M60 64 L292 64 L252 176 L100 176 Z" fill="url(#rt-cara)" />
      {/* El costado que da al fondo, un punto más oscuro: da volumen sin
          inventar sombras. */}
      <path d="M292 64 L306 56 L266 168 L252 176 Z" fill="#C79400" />
      {/* La boca, abierta y oscura */}
      <path d="M60 64 L292 64 L306 56 L74 56 Z" fill="#2B2B2B" />
      <path d="M74 56 L306 56 L300 51 L80 51 Z" fill="#454545" />
      {/* El labio de arriba */}
      <path d="M60 64 L292 64 L292 69 L60 69 Z" fill="#FFDC63" opacity=".85" />
      {/* Un nervio vertical: las tolvas lo traen, y sin él la cara es un
          triángulo de color plano. */}
      <path d="M176 66 L176 175" stroke="#E8B100" strokeWidth="2.5" fill="none" />

      {/* Los remaches. Tres y no doce: sugieren la lámina sin volverse
          textura. */}
      <circle cx="116" cy="166" r="3.5" fill="#E8B100" />
      <circle cx="176" cy="166" r="3.5" fill="#E8B100" />
      <circle cx="236" cy="166" r="3.5" fill="#E8B100" />

      {/* El bastidor y las ruedas */}
      <path d="M92 176 L262 176 L262 194 L92 194 Z" fill="#2B2B2B" />
      <path d="M92 176 L262 176 L262 180 L92 180 Z" fill="#454545" />
      <rect x="112" y="192" width="16" height="10" fill="#3D3D3D" />
      <rect x="226" y="192" width="16" height="10" fill="#3D3D3D" />
      <circle cx="120" cy="206" r="10" fill="#1A1A1A" />
      <circle cx="120" cy="206" r="3.5" fill="#7A7A76" />
      <circle cx="234" cy="206" r="10" fill="#1A1A1A" />
      <circle cx="234" cy="206" r="3.5" fill="#7A7A76" />

      {/* LA COTA, de punta a punta. Es lo que convierte el dibujo en una
          explicación: la tara es de ESTO, del recipiente completo con su
          bastidor y sus ruedas, y no del vidrio que va dentro. */}
      <g stroke="#5E625E" strokeWidth="1.5" fill="none">
        <path d="M330 56 L330 216" />
        <path d="M322 56 L338 56M322 216 L338 216" />
      </g>
      <path d="M306 56 L330 56M244 216 L330 216" stroke="#C8C8C2"
            strokeWidth="1" strokeDasharray="3 3" fill="none" />
    </svg>
  );
}
