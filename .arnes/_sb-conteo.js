const consulta = (tabla) => { const p = new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (ok) => ok({ data: (window.__DATOS ?? {})[tabla] ?? [], error: null })
    : k === "maybeSingle" ? () => Promise.resolve({ data: null, error: null }) : () => p,
  apply: () => p }); return p };
/* SE GUARDA TAMBIÉN LO QUE SE MANDA, no solo a quién. `__rpc` son los
   nombres —quién guardó y cuántas veces— y con eso basta para contar
   renglones; pero lo que decide si el renglón queda bien es el PAQUETE:
   qué día de vencimiento viaja, si viaja además una fecha de
   fabricación, en qué columna cae la cifra. Eso solo se ve mirando los
   argumentos, y leerlos del código fuente es leer lo que uno escribió,
   no lo que la pantalla manda. `__rpc` se deja igual para no tocar lo
   que ya lo usa. */
export const createClient = () => ({ from: (t) => consulta(t), rpc: async (fn, args) => { (window.__rpc ??= []).push(fn); (window.__llamadas ??= []).push({ fn, args }); return { data: "id-" + fn, error: null } } });
