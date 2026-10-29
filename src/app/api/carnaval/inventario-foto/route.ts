/**
 * AG07 CARNAVAL · LEER LA FOTO DEL INVENTARIO DIARIO.
 *
 * Recibe la foto de la hoja «EXISTENCIAS DIARIAS» y devuelve la tabla (secciones → renglones → dos columnas).
 * NO guarda nada: la pantalla enseña lo leído para que una persona lo revise y lo corrija antes de guardar.
 *
 * Usa la misma llave que la redacción de hallazgos (ANTHROPIC_API_KEY, en Vercel). Sin llave contesta 503 con
 * lo que falta. La llave nunca va al navegador.
 */
import { NextResponse } from "next/server";
import { misPermisos } from "@/lib/permisos";
import { RUTA_CUADRE } from "@/modulos/carnaval/datos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELO = process.env.MODELO_VISION ?? process.env.MODELO_REDACCION ?? "claude-sonnet-4-5";

const INSTRUCCION = `Lees la foto de una hoja de Excel llamada «EXISTENCIAS DIARIAS» de un almacén de envase vacío de una cervecería.

La hoja tiene una fecha arriba (celda FECHA, formato dd/mm/aaaa) y varias SECCIONES. Cada sección empieza con una fila de título de color azul
(por ejemplo ENVASE, CAJA PLASTICA, PALLET, ESTIBAS DE MADERA CERV, CASCO DE VIDRIO B38, PENDIENTE DE BAJA, ENVASE LAVADO PARA REVIISON,
CAJA MALA, CASCO VIDRIO CERVECERIA ATLANTICO) y, en esa misma fila, los títulos de sus dos columnas (por ejemplo ESTIBA y CAJA, o CANTIDAD y Columna1, o CANT).
Debajo van los renglones: el nombre a la izquierda y uno o dos números a la derecha.

REGLAS:
1. Copia TAL CUAL: los nombres de los títulos y de los renglones (con su ortografía, aunque tenga errores) y los números.
2. NO inventes renglones ni números. Si una celda está vacía, déjala en null. Si no se lee con seguridad, null.
3. Mantén el ORDEN de arriba hacia abajo. Si un mismo título de sección aparece dos veces, son dos secciones distintas: devuélvelas las dos, en su orden.
4. Los números son enteros. Una coma suelta o un símbolo que no es número se ignora (null).
5. Una fila de título solo marca el inicio de una sección: no es un renglón.
Responde SOLO llamando a la herramienta.`;

const ESQUEMA = {
  type: "object",
  properties: {
    fecha: { type: ["string", "null"], description: "Fecha de la hoja como AAAA-MM-DD, o null si no se ve" },
    secciones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          colA: { type: "string", description: "Título de la primera columna numérica" },
          colB: { type: "string", description: "Título de la segunda columna numérica ('' si no tiene)" },
          filas: {
            type: "array",
            items: {
              type: "object",
              properties: { concepto: { type: "string" }, a: { type: ["number", "null"] }, b: { type: ["number", "null"] } },
              required: ["concepto", "a", "b"],
            },
          },
        },
        required: ["titulo", "colA", "colB", "filas"],
      },
    },
  },
  required: ["fecha", "secciones"],
};

export async function POST(req: Request) {
  const perm = await misPermisos();
  if (!perm.puedeEditar(RUTA_CUADRE)) return NextResponse.json({ error: "No tienes permiso para cargar el inventario (Admin → Roles → Cuadre SAP)." }, { status: 403 });
  const llave = process.env.ANTHROPIC_API_KEY;
  if (!llave) {
    return NextResponse.json({ error: "Falta la llave del modelo para leer la foto. Se pone en Vercel → Settings → Environment Variables como ANTHROPIC_API_KEY y después se vuelve a desplegar." }, { status: 503 });
  }
  let c: { imagen?: string; tipo?: string };
  try { c = await req.json() } catch { c = {} }
  const tipo = c.tipo === "image/png" || c.tipo === "image/webp" ? c.tipo : "image/jpeg";
  if (!c.imagen || c.imagen.length < 1000) return NextResponse.json({ error: "No llegó la foto." }, { status: 400 });
  if (c.imagen.length > 7_000_000) return NextResponse.json({ error: "La foto es muy pesada. Intenta con una captura más pequeña." }, { status: 413 });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": llave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 8000,
        system: INSTRUCCION,
        tools: [{ name: "registrar_hoja", description: "Registra la tabla leída de la foto", input_schema: ESQUEMA }],
        tool_choice: { type: "tool", name: "registrar_hoja" },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: tipo, data: c.imagen } },
          { type: "text", text: "Lee la hoja y regístrala." },
        ] }],
      }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!r.ok) {
      const msg = r.status === 401 ? "La llave del modelo no sirve o está vencida." : r.status === 429 ? "El modelo está ocupado. Intenta en un momento." : `El modelo contestó ${r.status}.`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    const j = await r.json();
    const uso = (j?.content ?? []).find((x: { type?: string }) => x?.type === "tool_use") as { input?: { fecha?: string | null; secciones?: unknown } } | undefined;
    const sec = uso?.input?.secciones;
    if (!Array.isArray(sec) || !sec.length) return NextResponse.json({ error: "No pude leer la tabla de la foto. Prueba con una captura más nítida." }, { status: 502 });
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const secciones = sec.map((s: { titulo?: string; colA?: string; colB?: string; filas?: { concepto?: string; a?: unknown; b?: unknown }[] }) => ({
      titulo: String(s.titulo ?? "").trim(), colA: String(s.colA ?? "").trim(), colB: String(s.colB ?? "").trim(),
      filas: (s.filas ?? []).map((f) => ({ concepto: String(f.concepto ?? "").trim(), a: num(f.a), b: num(f.b) })).filter((f) => f.concepto),
    })).filter((s) => s.titulo);
    const fecha = typeof uso?.input?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(uso.input.fecha) ? uso.input.fecha : null;
    return NextResponse.json({ fecha, secciones });
  } catch (e) {
    const tarde = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return NextResponse.json({ error: tarde ? "El modelo se demoró más de la cuenta. Vuelve a intentar." : "No se pudo hablar con el modelo." }, { status: 502 });
  }
}
